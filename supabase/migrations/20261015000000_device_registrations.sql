-- Apply manually only after review. Existing notes, RLS, backups and audit rows are untouched.
begin;

do $preflight$
begin
  if to_regclass('public.device_registrations') is not null then
    raise exception 'device_registrations_conflict_review_required';
  end if;
end
$preflight$;

create table public.device_registrations (
  registration_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'revoked')),
  requested_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '180 days'),
  decided_at timestamptz,
  revoked_at timestamptz,
  decision_actor uuid,
  check (expires_at > requested_at),
  check (
    (status = 'pending' and decided_at is null and revoked_at is null and decision_actor is null)
    or (status in ('approved', 'rejected') and decided_at is not null
      and revoked_at is null and decision_actor is not null)
    or (status = 'revoked' and revoked_at is not null and decision_actor is not null)
  )
);

create index device_registrations_user_status
  on public.device_registrations (user_id, status);

alter table public.device_registrations enable row level security;
revoke all on table public.device_registrations from public, anon, authenticated;
grant select, insert, update on table public.device_registrations to service_role;

commit;
