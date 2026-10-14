-- Make note_id a durable database-wide identity before enabling atomic creation.
begin;

do $preflight$
begin
  if to_regclass('public.notes') is null
      or not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'notes'
          and column_name = 'note_id'
          and udt_name = 'uuid'
          and is_nullable = 'NO'
      )
      or exists (
        select 1 from public.notes where note_id is null
      )
      or exists (
        select 1
        from public.notes
        group by note_id
        having count(*) > 1
      )
      or to_regclass('public.notes_note_id_unique') is not null then
    raise exception 'notes_note_id_unique_preflight_failed';
  end if;
end
$preflight$;

create unique index notes_note_id_unique
  on public.notes (note_id);

do $verify$
begin
  if not exists (
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
  ) then
    raise exception 'notes_note_id_unique_verification_failed';
  end if;
end
$verify$;

commit;
