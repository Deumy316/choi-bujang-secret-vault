-- Limit restore storage to the privileges used by the server-side RPC.
begin;

do $preflight$
begin
  if to_regclass('public.vault_note_backups') is null
      or to_regclass('public.vault_audit_log') is null
      or to_regprocedure(
        'public.restore_single_verified_note(uuid,uuid,uuid,uuid)'
      ) is null
      or not exists (
        select 1 from pg_roles where rolname = 'service_role'
      )
      or not exists (
        select 1 from pg_roles where rolname = 'anon'
      )
      or not exists (
        select 1 from pg_roles where rolname = 'authenticated'
      ) then
    raise exception 'restore_privilege_preflight_failed';
  end if;
end
$preflight$;

revoke all privileges
  on table public.vault_note_backups, public.vault_audit_log
  from service_role, anon, authenticated, public;

grant select, insert
  on table public.vault_note_backups, public.vault_audit_log
  to service_role;

revoke all privileges
  on function public.restore_single_verified_note(uuid, uuid, uuid, uuid)
  from anon, authenticated, public;

grant execute
  on function public.restore_single_verified_note(uuid, uuid, uuid, uuid)
  to service_role;

do $verify$
declare
  v_table regclass;
  v_role text;
begin
  foreach v_table in array array[
    'public.vault_note_backups'::regclass,
    'public.vault_audit_log'::regclass
  ]
  loop
    if not has_table_privilege('service_role', v_table, 'SELECT')
        or not has_table_privilege('service_role', v_table, 'INSERT')
        or exists (
          select 1
          from pg_class c
          cross join lateral aclexplode(
            coalesce(c.relacl, acldefault('r', c.relowner))
          ) acl
          where c.oid = v_table
            and (
              acl.grantee = 0
              or exists (
                select 1
                from pg_roles granted_role
                where granted_role.oid = acl.grantee
                  and pg_has_role(
                    'service_role', granted_role.rolname, 'USAGE'
                  )
              )
            )
            and (
              acl.privilege_type not in ('SELECT', 'INSERT')
              or acl.is_grantable
            )
        ) then
      raise exception 'restore_service_role_least_privilege_check_failed';
    end if;

    foreach v_role in array array['anon', 'authenticated']
    loop
      if exists (
        select 1
        from pg_class c
        cross join lateral aclexplode(
          coalesce(c.relacl, acldefault('r', c.relowner))
        ) acl
        where c.oid = v_table
          and (
            acl.grantee = 0
            or exists (
              select 1
              from pg_roles granted_role
              where granted_role.oid = acl.grantee
                and pg_has_role(v_role, granted_role.rolname, 'USAGE')
            )
          )
      ) then
        raise exception 'restore_public_table_privilege_check_failed';
      end if;
    end loop;
  end loop;

  if not has_function_privilege(
      'service_role',
      'public.restore_single_verified_note(uuid,uuid,uuid,uuid)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.restore_single_verified_note(uuid,uuid,uuid,uuid)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.restore_single_verified_note(uuid,uuid,uuid,uuid)',
      'EXECUTE'
    )
    or exists (
      select 1
      from pg_proc p
      cross join lateral aclexplode(
        coalesce(p.proacl, acldefault('f', p.proowner))
      ) acl
      where p.oid = to_regprocedure(
        'public.restore_single_verified_note(uuid,uuid,uuid,uuid)'
      )
        and acl.grantee = 0
    ) then
    raise exception 'restore_function_privilege_check_failed';
  end if;
end
$verify$;

commit;
