-- Create a new note and its immutable creation-time restore point atomically.
begin;

do $preflight$
begin
  if to_regclass('public.notes') is null
      or not exists (
        select 1
        from pg_index i
        join pg_class idx on idx.oid = i.indexrelid
        join pg_class tbl on tbl.oid = i.indrelid
        join pg_namespace n on n.oid = tbl.relnamespace
        where n.nspname = 'public'
          and tbl.relname = 'notes'
          and idx.relname = 'notes_note_id_unique'
          and i.indisunique
          and i.indisvalid
          and i.indisready
          and i.indnatts = 1
          and i.indkey[0] = (
            select a.attnum
            from pg_attribute a
            where a.attrelid = tbl.oid
              and a.attname = 'note_id'
              and not a.attisdropped
          )
      )
      or to_regclass('public.vault_note_backups') is null
      or to_regprocedure(
        'public.restore_single_verified_note(uuid,uuid,uuid,uuid)'
      ) is null
      or exists (
        select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'create_note_with_initial_backup'
      ) then
    raise exception 'note_create_backup_preflight_failed';
  end if;
end
$preflight$;

create function public.create_note_with_initial_backup(
  p_note_id uuid,
  p_owner_id uuid,
  p_title text,
  p_content text
)
returns table (
  created boolean,
  backup_created boolean,
  note_id uuid,
  owner_id uuid,
  title_sha256 text,
  content_sha256 text,
  record_sha256 text,
  backup_version text
)
language plpgsql
security invoker
set search_path = pg_catalog, extensions, public
as $function$
declare
  v_created_at timestamptz := clock_timestamp();
  v_title text;
  v_content text;
  v_title_hash text;
  v_content_hash text;
  v_record_hash text;
  v_backup_id uuid;
  v_backup_version constant text := 'initial-create-v1';
begin
  if p_note_id is null or p_owner_id is null
      or p_title is null or char_length(p_title) not between 1 and 200
      or p_content is null or octet_length(p_content) not between 1 and 102400 then
    raise exception 'invalid_note_create_input';
  end if;

  if exists (select 1 from public.notes n where n.note_id = p_note_id) then
    raise exception 'note_create_target_conflict';
  end if;
  if exists (
    select 1 from public.vault_note_backups b where b.note_id = p_note_id
  ) then
    raise exception 'note_create_backup_conflict';
  end if;

  insert into public.notes (note_id, owner_id, title, content, created_at)
  values (p_note_id, p_owner_id, p_title, p_content, v_created_at)
  returning title, content into v_title, v_content;

  if v_title is distinct from p_title or v_content is distinct from p_content then
    raise exception 'note_create_storage_mismatch';
  end if;

  v_title_hash := encode(
    extensions.digest(convert_to(v_title, 'UTF8'), 'sha256'), 'hex'
  );
  v_content_hash := encode(
    extensions.digest(convert_to(v_content, 'UTF8'), 'sha256'), 'hex'
  );
  v_record_hash := encode(extensions.digest(convert_to(
    lower(p_note_id::text) || E'\n'
    || lower(p_owner_id::text) || E'\n'
    || v_title_hash || E'\n' || v_content_hash,
    'UTF8'
  ), 'sha256'), 'hex');

  insert into public.vault_note_backups (
    backup_version, note_id, owner_id, title, content, note_created_at,
    title_sha256, content_sha256, record_sha256, source_ref, captured_at,
    verified_at, verification_status, approved_for_restore, approved_at
  ) values (
    v_backup_version, p_note_id, p_owner_id, v_title, v_content, v_created_at,
    v_title_hash, v_content_hash, v_record_hash,
    'atomic-note-create:v1', v_created_at, v_created_at,
    'passed', true, v_created_at
  )
  returning backup_id into v_backup_id;

  if v_backup_id is null or not exists (
    select 1
    from public.vault_note_backups b
    where b.backup_id = v_backup_id
      and b.note_id = p_note_id
      and b.owner_id = p_owner_id
      and b.title_sha256 = v_title_hash
      and b.content_sha256 = v_content_hash
      and b.record_sha256 = v_record_hash
      and b.source_ref = 'atomic-note-create:v1'
      and b.verification_status = 'passed'
      and b.approved_for_restore
  ) then
    raise exception 'note_create_backup_verification_failed';
  end if;

  return query select true, true, p_note_id, p_owner_id,
    v_title_hash, v_content_hash, v_record_hash, v_backup_version;
end
$function$;

revoke all privileges
  on function public.create_note_with_initial_backup(uuid, uuid, text, text)
  from anon, authenticated, public;

grant execute
  on function public.create_note_with_initial_backup(uuid, uuid, text, text)
  to service_role;

commit;
