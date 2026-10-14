-- Draft for an isolated test database only. Do not apply to the production database.
-- The API authenticates the judge/admin and validates the private backup envelope;
-- this RPC independently constrains the row, owner, hash, atomicity, and caller role.
begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $preflight$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notes'
      and column_name = 'note_id' and udt_name = 'uuid'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notes'
      and column_name = 'owner_id' and udt_name = 'uuid'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notes'
      and column_name = 'title' and data_type = 'text'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notes'
      and column_name = 'content' and data_type = 'text'
  ) then
    raise exception 'restore_notes_schema_mismatch';
  end if;
end
$preflight$;

create table if not exists public.note_restore_receipts (
  backup_version text primary key
    check (backup_version ~ '^[A-Za-z0-9._-]{1,64}$'),
  note_id uuid not null,
  owner_id uuid not null,
  content_sha256 text not null
    check (content_sha256 ~ '^[0-9a-f]{64}$'),
  restored_at timestamptz not null default clock_timestamp()
);

alter table public.note_restore_receipts enable row level security;
revoke all on table public.note_restore_receipts from public, anon, authenticated;
grant select, insert on table public.note_restore_receipts to service_role;

create or replace function public.restore_single_verified_note(
  p_note_id uuid,
  p_owner_id uuid,
  p_title text,
  p_content text,
  p_content_sha256 text,
  p_backup_version text
)
returns table (
  restored boolean,
  duplicate boolean,
  note_id uuid,
  owner_id uuid,
  content_sha256 text,
  changed_rows integer,
  preserved_other_notes boolean
)
language plpgsql
security invoker
set search_path = pg_catalog, extensions, public
as $function$
declare
  v_existing_count integer;
  v_existing_owner uuid;
  v_changed_rows integer;
  v_after_owner uuid;
  v_after_hash text;
  v_other_before bytea;
  v_other_after bytea;
begin
  if p_note_id is null or p_owner_id is null
      or p_title is null or char_length(p_title) < 1 or char_length(p_title) > 200
      or p_content is null or octet_length(p_content) < 1 or octet_length(p_content) > 102400
      or p_content_sha256 is null or p_content_sha256 !~ '^[0-9a-f]{64}$'
      or p_backup_version is null or p_backup_version !~ '^[A-Za-z0-9._-]{1,64}$' then
    raise exception 'invalid_restore_input';
  end if;

  if encode(digest(convert_to(p_content, 'UTF8'), 'sha256'), 'hex') <> p_content_sha256 then
    raise exception 'restore_content_hash_mismatch';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_backup_version, 0));
  if exists (
    select 1 from public.note_restore_receipts r
    where r.backup_version = p_backup_version
  ) then
    return query select false, true, p_note_id, p_owner_id, p_content_sha256, 0, true;
    return;
  end if;

  -- The isolated restore serializes note writes so the before/after proof is stable.
  lock table public.notes in share row exclusive mode;

  select digest(convert_to(coalesce(jsonb_agg(jsonb_build_array(
      n.note_id, n.owner_id, n.title, n.content
    ) order by n.note_id, n.owner_id, n.title, n.content)::text, '[]'), 'UTF8'), 'sha256')
  into v_other_before
  from public.notes n
  where n.note_id <> p_note_id;

  select count(*)::integer
  into v_existing_count
  from public.notes n
  where n.note_id = p_note_id;

  if v_existing_count > 1 then
    raise exception 'restore_target_not_unique';
  elsif v_existing_count = 1 then
    select n.owner_id into v_existing_owner
    from public.notes n
    where n.note_id = p_note_id
    for update;

    if v_existing_owner <> p_owner_id then
      raise exception 'restore_owner_change_forbidden';
    end if;

    update public.notes n
    set title = p_title, content = p_content
    where n.note_id = p_note_id and n.owner_id = p_owner_id;
  else
    insert into public.notes (note_id, owner_id, title, content)
    values (p_note_id, p_owner_id, p_title, p_content);
  end if;

  get diagnostics v_changed_rows = row_count;
  if v_changed_rows <> 1 then
    raise exception 'restore_changed_row_count_mismatch';
  end if;

  select n.owner_id,
    encode(digest(convert_to(n.content, 'UTF8'), 'sha256'), 'hex')
  into v_after_owner, v_after_hash
  from public.notes n
  where n.note_id = p_note_id;

  if v_after_owner is distinct from p_owner_id or v_after_hash is distinct from p_content_sha256 then
    raise exception 'restore_post_verification_failed';
  end if;

  select digest(convert_to(coalesce(jsonb_agg(jsonb_build_array(
      n.note_id, n.owner_id, n.title, n.content
    ) order by n.note_id, n.owner_id, n.title, n.content)::text, '[]'), 'UTF8'), 'sha256')
  into v_other_after
  from public.notes n
  where n.note_id <> p_note_id;

  if v_other_after is distinct from v_other_before then
    raise exception 'restore_changed_other_notes';
  end if;

  insert into public.note_restore_receipts (
    backup_version, note_id, owner_id, content_sha256
  ) values (
    p_backup_version, p_note_id, p_owner_id, p_content_sha256
  );

  return query select true, false, p_note_id, p_owner_id,
    p_content_sha256, v_changed_rows, true;
end
$function$;

revoke all on function public.restore_single_verified_note(
  uuid, uuid, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.restore_single_verified_note(
  uuid, uuid, text, text, text, text
) to service_role;

commit;
