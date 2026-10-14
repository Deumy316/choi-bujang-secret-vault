-- Design draft for an isolated test database only. Do not apply to production yet.
-- This migration creates no backup rows and does not change the existing notes RLS policies.
begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $preflight$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notes'
      and column_name = 'id' and udt_name = 'int8'
      and (column_default is not null or is_identity = 'YES')
  ) or not exists (
    select 1
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_catalog = tc.constraint_catalog
      and kcu.constraint_schema = tc.constraint_schema
      and kcu.constraint_name = tc.constraint_name
    where tc.table_schema = 'public' and tc.table_name = 'notes'
      and tc.constraint_type = 'PRIMARY KEY' and kcu.column_name = 'id'
  ) or not exists (
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
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notes'
      and column_name = 'created_at' and udt_name = 'timestamptz'
  ) or not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'notes'
      and c.relkind = 'r' and c.relrowsecurity
  ) then
    raise exception 'restore_notes_schema_or_rls_mismatch';
  end if;

  if to_regclass('public.vault_note_backups') is not null
      or to_regclass('public.vault_audit_log') is not null
      or exists (
        select 1 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'restore_single_verified_note'
      ) then
    raise exception 'restore_schema_conflict_review_required';
  end if;
end
$preflight$;

create table public.vault_note_backups (
  backup_id uuid primary key default gen_random_uuid(),
  backup_version text not null
    check (backup_version ~ '^[A-Za-z0-9._-]{1,64}$'),
  note_id uuid not null,
  owner_id uuid not null,
  title text not null
    check (char_length(title) between 1 and 200),
  content text not null
    check (octet_length(content) between 1 and 102400),
  note_created_at timestamptz not null,
  title_sha256 text not null
    check (title_sha256 ~ '^[0-9a-f]{64}$'),
  content_sha256 text not null
    check (content_sha256 ~ '^[0-9a-f]{64}$'),
  record_sha256 text not null
    check (record_sha256 ~ '^[0-9a-f]{64}$'),
  source_ref text not null
    check (char_length(source_ref) between 1 and 200),
  captured_at timestamptz not null,
  verified_at timestamptz not null
    check (verified_at >= captured_at),
  verification_status text not null
    check (verification_status = 'passed'),
  approved_for_restore boolean not null default false,
  approved_at timestamptz,
  check (
    (approved_for_restore and approved_at is not null and approved_at >= verified_at)
    or (not approved_for_restore and approved_at is null)
  ),
  unique (note_id, owner_id, backup_version)
);

create unique index vault_note_backups_one_approved
  on public.vault_note_backups (note_id, owner_id)
  where approved_for_restore;

create table public.vault_audit_log (
  audit_id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  judge_run_id uuid not null,
  actor_id uuid not null,
  note_id uuid not null,
  owner_id uuid not null,
  backup_id uuid not null
    references public.vault_note_backups (backup_id) on delete restrict,
  backup_version text not null,
  title_sha256 text not null
    check (title_sha256 ~ '^[0-9a-f]{64}$'),
  content_sha256 text not null
    check (content_sha256 ~ '^[0-9a-f]{64}$'),
  action text not null check (action = 'restore_note'),
  outcome text not null check (outcome = 'restored'),
  change_kind text not null check (change_kind in ('updated', 'recreated')),
  restored_at timestamptz not null default clock_timestamp()
);

alter table public.vault_note_backups enable row level security;
alter table public.vault_audit_log enable row level security;

revoke all on table public.vault_note_backups from public, anon, authenticated;
revoke all on table public.vault_audit_log from public, anon, authenticated;
grant select, insert on table public.vault_note_backups to service_role;
grant select, insert on table public.vault_audit_log to service_role;
grant usage on schema extensions to service_role;

-- JavaScript must use:
-- titleSha256 = sha256(title UTF-8 bytes)
-- contentSha256 = sha256(content UTF-8 bytes)
-- recordSha256 = sha256(lower(noteId) + "\n" + lower(ownerId) + "\n"
--   + titleSha256 + "\n" + contentSha256), all encoded as UTF-8.
create function public.restore_single_verified_note(
  p_note_id uuid,
  p_caller_id uuid,
  p_request_id uuid,
  p_judge_run_id uuid
)
returns table (
  restored boolean,
  duplicate boolean,
  note_id uuid,
  owner_id uuid,
  title_sha256 text,
  content_sha256 text,
  backup_version text,
  changed_rows integer,
  preserved_other_notes boolean,
  audit_id uuid
)
language plpgsql
security invoker
set search_path = pg_catalog, extensions, public
as $function$
declare
  v_backup public.vault_note_backups%rowtype;
  v_prior_audit public.vault_audit_log%rowtype;
  v_existing_count integer;
  v_existing_id bigint;
  v_existing_owner uuid;
  v_changed_rows integer;
  v_target_count integer;
  v_after_owner uuid;
  v_after_title_hash text;
  v_after_content_hash text;
  v_title_hash text;
  v_content_hash text;
  v_record_hash text;
  v_change_kind text;
  v_other_before bytea;
  v_other_after bytea;
  v_audit_rows integer;
  v_audit_id uuid;
begin
  if p_note_id is null or p_caller_id is null
      or p_request_id is null or p_judge_run_id is null then
    raise exception 'invalid_restore_input';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  select a.* into v_prior_audit
  from public.vault_audit_log a
  where a.request_id = p_request_id;

  if found then
    if v_prior_audit.actor_id <> p_caller_id
        or v_prior_audit.note_id <> p_note_id
        or v_prior_audit.judge_run_id <> p_judge_run_id then
      raise exception 'restore_request_reuse_mismatch';
    end if;
    return query select false, true, v_prior_audit.note_id, v_prior_audit.owner_id,
      v_prior_audit.title_sha256, v_prior_audit.content_sha256,
      v_prior_audit.backup_version, 0, true, v_prior_audit.audit_id;
    return;
  end if;

  select b.* into v_backup
  from public.vault_note_backups b
  where b.note_id = p_note_id
    and b.owner_id = p_caller_id
    and b.verification_status = 'passed'
    and b.approved_for_restore;

  if not found then
    raise exception 'restore_backup_not_found';
  end if;

  v_title_hash := encode(extensions.digest(convert_to(v_backup.title, 'UTF8'), 'sha256'), 'hex');
  v_content_hash := encode(extensions.digest(convert_to(v_backup.content, 'UTF8'), 'sha256'), 'hex');
  v_record_hash := encode(extensions.digest(convert_to(
    lower(v_backup.note_id::text) || E'\n'
    || lower(v_backup.owner_id::text) || E'\n'
    || v_title_hash || E'\n' || v_content_hash,
    'UTF8'
  ), 'sha256'), 'hex');

  if v_title_hash <> v_backup.title_sha256
      or v_content_hash <> v_backup.content_sha256
      or v_record_hash <> v_backup.record_sha256 then
    raise exception 'restore_backup_integrity_mismatch';
  end if;

  -- No UNIQUE constraint on notes.note_id is assumed. Serialize restore writes
  -- and refuse every ambiguous or cross-owner collision.
  lock table public.notes in share row exclusive mode;

  select extensions.digest(convert_to(coalesce(jsonb_agg(jsonb_build_array(
      n.id, n.note_id, n.owner_id, n.title, n.content, n.created_at
    ) order by n.id)::text, '[]'), 'UTF8'), 'sha256')
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
    select n.id, n.owner_id
    into v_existing_id, v_existing_owner
    from public.notes n
    where n.note_id = p_note_id
    for update;

    if v_existing_owner <> p_caller_id then
      raise exception 'restore_owner_change_forbidden';
    end if;

    update public.notes n
    set title = v_backup.title,
        content = v_backup.content
    where n.id = v_existing_id
      and n.note_id = p_note_id
      and n.owner_id = p_caller_id;
    v_change_kind := 'updated';
  else
    -- notes.id is deliberately omitted. Its identity/default must create it.
    insert into public.notes (note_id, owner_id, title, content, created_at)
    values (
      v_backup.note_id, v_backup.owner_id, v_backup.title,
      v_backup.content, v_backup.note_created_at
    );
    v_change_kind := 'recreated';
  end if;

  get diagnostics v_changed_rows = row_count;
  if v_changed_rows <> 1 then
    raise exception 'restore_changed_row_count_mismatch';
  end if;

  select count(*)::integer into v_target_count
  from public.notes n
  where n.note_id = p_note_id;

  if v_target_count <> 1 then
    raise exception 'restore_post_verification_failed';
  end if;

  select n.owner_id,
    encode(extensions.digest(convert_to(n.title, 'UTF8'), 'sha256'), 'hex'),
    encode(extensions.digest(convert_to(n.content, 'UTF8'), 'sha256'), 'hex')
  into v_after_owner, v_after_title_hash, v_after_content_hash
  from public.notes n
  where n.note_id = p_note_id;

  if v_after_owner is distinct from p_caller_id
      or v_after_title_hash is distinct from v_backup.title_sha256
      or v_after_content_hash is distinct from v_backup.content_sha256 then
    raise exception 'restore_post_verification_failed';
  end if;

  select extensions.digest(convert_to(coalesce(jsonb_agg(jsonb_build_array(
      n.id, n.note_id, n.owner_id, n.title, n.content, n.created_at
    ) order by n.id)::text, '[]'), 'UTF8'), 'sha256')
  into v_other_after
  from public.notes n
  where n.note_id <> p_note_id;

  if v_other_after is distinct from v_other_before then
    raise exception 'restore_changed_other_notes';
  end if;

  insert into public.vault_audit_log (
    request_id, judge_run_id, actor_id, note_id, owner_id,
    backup_id, backup_version, title_sha256, content_sha256,
    action, outcome, change_kind
  ) values (
    p_request_id, p_judge_run_id, p_caller_id, v_backup.note_id, v_backup.owner_id,
    v_backup.backup_id, v_backup.backup_version,
    v_backup.title_sha256, v_backup.content_sha256,
    'restore_note', 'restored', v_change_kind
  )
  returning public.vault_audit_log.audit_id into v_audit_id;

  get diagnostics v_audit_rows = row_count;
  if v_audit_rows <> 1 then
    raise exception 'restore_audit_append_failed';
  end if;

  return query select true, false, v_backup.note_id, v_backup.owner_id,
    v_backup.title_sha256, v_backup.content_sha256, v_backup.backup_version,
    v_changed_rows, true, v_audit_id;
end
$function$;

revoke all on function public.restore_single_verified_note(
  uuid, uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.restore_single_verified_note(
  uuid, uuid, uuid, uuid
) to service_role;

commit;
