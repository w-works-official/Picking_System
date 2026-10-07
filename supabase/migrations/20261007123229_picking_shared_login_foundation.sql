-- LOCAL PREPARATION ONLY. No production credential is seeded by this migration.
-- The shared account must be provisioned separately via a private admin channel.
create schema if not exists picking_private;
revoke all on schema picking_private from public, anon, authenticated;
create extension if not exists pgcrypto with schema extensions;

create table picking_private.operator_credentials (
  credential_id uuid primary key default gen_random_uuid(),
  username text not null unique check (username = lower(btrim(username)) and length(username) between 1 and 128),
  password_hash text not null check (password_hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'),
  is_active boolean not null default true,
  password_changed_at timestamptz not null default clock_timestamp(),
  session_ttl interval not null default interval '12 hours' check (session_ttl between interval '15 minutes' and interval '24 hours')
);
create table picking_private.operator_sessions (
  session_id uuid primary key default gen_random_uuid(),
  credential_id uuid not null references picking_private.operator_credentials(credential_id),
  token_hash text not null unique,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index on picking_private.operator_sessions(credential_id, expires_at);
create table picking_private.login_guard (
  singleton boolean primary key default true check (singleton),
  failed_count integer not null default 0,
  window_started_at timestamptz not null default clock_timestamp(),
  locked_until timestamptz,
  dummy_hash text not null
);
insert into picking_private.login_guard(singleton, dummy_hash)
values (true, extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf', 12)));
alter table picking_private.operator_credentials enable row level security;
alter table picking_private.operator_sessions enable row level security;
alter table picking_private.login_guard enable row level security;
revoke all on all tables in schema picking_private from public, anon, authenticated, service_role;
alter default privileges in schema picking_private revoke all on tables from public, anon, authenticated;
alter default privileges in schema picking_private revoke execute on functions from public, anon, authenticated;

-- Deliberate, narrow definer boundary: only credential/hash/session tables.
-- No business tables are accessed by any authentication definer function.
create function public.picking_login_v1(p_username text, p_password text)
returns jsonb language plpgsql security definer set search_path = '' set statement_timeout = '5s'
as $$
declare
  guard picking_private.login_guard%rowtype;
  credential picking_private.operator_credentials%rowtype;
  stamp timestamptz;
  failures integer;
  token text;
  expiry timestamptz;
begin
  select * into guard from picking_private.login_guard where singleton for update;
  stamp := clock_timestamp();
  if guard.locked_until > stamp then
    return jsonb_build_object('authenticated', false, 'error_code', 'rate_limited');
  end if;
  if length(btrim(p_username)) between 1 and 128 and octet_length(p_password) between 1 and 72 then
    select * into credential from picking_private.operator_credentials
    where username = lower(btrim(p_username)) and is_active;
  end if;
  if credential.credential_id is null or
     extensions.crypt(case when octet_length(p_password) between 1 and 72 then p_password else '' end,
                      coalesce(credential.password_hash, guard.dummy_hash)) <> credential.password_hash then
    -- Unknown username and malformed input also incur one bcrypt operation.
    if credential.credential_id is null then
      perform extensions.crypt(case when octet_length(p_password) between 1 and 72 then p_password else '' end, guard.dummy_hash);
    end if;
    failures := case when guard.window_started_at < stamp - interval '15 minutes' then 1 else guard.failed_count + 1 end;
    update picking_private.login_guard set failed_count = failures,
      window_started_at = case when failures = 1 then stamp else guard.window_started_at end,
      locked_until = case when failures >= 5 then stamp + interval '15 minutes' else null end
    where singleton;
    return jsonb_build_object('authenticated', false, 'error_code', case when failures >= 5 then 'rate_limited' else 'invalid_credentials' end);
  end if;
  update picking_private.login_guard set failed_count = 0, window_started_at = stamp, locked_until = null where singleton;
  token := encode(extensions.gen_random_bytes(32), 'hex');
  expiry := stamp + credential.session_ttl;
  insert into picking_private.operator_sessions(credential_id, token_hash, created_at, expires_at)
  values (credential.credential_id, encode(extensions.digest(token, 'sha256'), 'hex'), stamp, expiry);
  return jsonb_build_object('authenticated', true, 'session_token', token, 'expires_at', expiry);
end;
$$;

create function public.picking_check_session_v1(p_session_token text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare expiry timestamptz;
begin
  if p_session_token is null or p_session_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('authenticated', false);
  end if;
  select s.expires_at into expiry from picking_private.operator_sessions s
  join picking_private.operator_credentials c on c.credential_id = s.credential_id
  where s.token_hash = encode(extensions.digest(p_session_token, 'sha256'), 'hex')
    and s.revoked_at is null and s.expires_at > statement_timestamp()
    and c.is_active and s.created_at >= c.password_changed_at;
  return jsonb_build_object('authenticated', expiry is not null, 'expires_at', expiry);
end;
$$;
create function public.picking_logout_v1(p_session_token text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  if p_session_token ~ '^[0-9a-f]{64}$' then
    update picking_private.operator_sessions set revoked_at = coalesce(revoked_at, clock_timestamp())
    where token_hash = encode(extensions.digest(p_session_token, 'sha256'), 'hex');
  end if;
  return jsonb_build_object('logged_out', true);
end;
$$;
revoke all on function public.picking_login_v1(text,text), public.picking_check_session_v1(text), public.picking_logout_v1(text) from public;
grant execute on function public.picking_login_v1(text,text), public.picking_check_session_v1(text), public.picking_logout_v1(text) to anon, authenticated;

create function picking_private.has_valid_session()
returns boolean language plpgsql stable security invoker set search_path = ''
as $$
declare headers jsonb;
begin
  headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  return coalesce((public.picking_check_session_v1(headers->>'x-picking-session')->>'authenticated')::boolean, false);
exception when invalid_text_representation then return false;
end;
$$;
create function picking_private.check_api_request()
returns void language plpgsql security invoker set search_path = ''
as $$
begin
  if current_setting('role', true) = 'service_role' then return; end if;
  if current_setting('request.method', true) = 'POST' and
    current_setting('request.path', true) in ('/rpc/picking_login_v1','/rpc/picking_check_session_v1','/rpc/picking_logout_v1') then return; end if;
  if not picking_private.has_valid_session() then
    raise exception using errcode = '42501', message = '유효한 피킹 로그인 세션이 필요합니다.';
  end if;
end;
$$;
revoke all on function picking_private.has_valid_session(), picking_private.check_api_request() from public;
grant usage on schema picking_private to anon, authenticated;
grant execute on function picking_private.has_valid_session(), picking_private.check_api_request() to anon, authenticated;
-- PostgREST invokes the hook as its request role, including privileged automation.
-- Only the hook is callable by service_role; credential table grants stay revoked.
grant usage on schema picking_private to service_role;
grant execute on function picking_private.check_api_request() to service_role;
-- Not activated here: existing operational access remains unchanged.
