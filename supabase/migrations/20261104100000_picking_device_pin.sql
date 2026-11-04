-- 피킹시스템 "이 기기 6자리 비밀번호" (2026-11-04 대표님 요청)
-- 셀피아 아이디·비밀번호로 한 번 로그인한 기기에서만 6자리를 설정 → 다음부터 그 기기에서는 6자리로 로그인.
--  · 6자리만으로는 열 수 없음: 기기마다 받은 긴 기기 키(256비트, 브라우저에 저장) + 6자리가 둘 다 맞아야 함
--  · 서버에는 기기 키의 해시(sha256)와 6자리의 bcrypt 해시만 저장
--  · 6자리를 5번 틀리면 그 기기 등록을 지움 → 다시 아이디·비밀번호로 로그인해서 새로 설정
--  · 셀피아(공유 계정) 비밀번호를 바꾸면 그 전에 만든 기기 등록은 모두 무효 (password_changed_at)
--  · 만든 세션은 아이디·비밀번호 로그인과 똑같음 (operator_sessions, 같은 유효시간)
-- 운영 DB 에는 대표님(또는 담당자)이 Supabase SQL Editor 에서 이 파일을 한 번 실행. 되돌리기는 파일 끝 주석 참고.
begin;
set local lock_timeout = '3s';

create table if not exists picking_private.device_pins (
  device_id uuid primary key default gen_random_uuid(),
  credential_id uuid not null references picking_private.operator_credentials(credential_id),
  secret_hash text not null unique check (secret_hash ~ '^[0-9a-f]{64}$'),
  pin_hash text not null check (pin_hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'),
  failed_count integer not null default 0,
  created_at timestamptz not null default clock_timestamp(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists device_pins_credential on picking_private.device_pins(credential_id, created_at);
alter table picking_private.device_pins enable row level security;
revoke all on picking_private.device_pins from public, anon, authenticated, service_role;

-- 6자리 설정: 지금 로그인된 세션이 있어야 함 → 새 기기 키를 돌려줌 (한 번만 보여 줌)
create or replace function public.picking_pin_enroll_v1(p_session_token text, p_pin text)
returns jsonb language plpgsql security definer set search_path = '' set statement_timeout = '5s'
as $$
declare cred uuid; secret text; dev uuid;
begin
  if p_session_token is null or p_session_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('enrolled', false, 'error_code', 'session_required');
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    return jsonb_build_object('enrolled', false, 'error_code', 'invalid_pin_format');
  end if;
  select s.credential_id into cred from picking_private.operator_sessions s
  join picking_private.operator_credentials c on c.credential_id = s.credential_id
  where s.token_hash = encode(extensions.digest(p_session_token, 'sha256'), 'hex')
    and s.revoked_at is null and s.expires_at > statement_timestamp()
    and c.is_active and s.created_at >= c.password_changed_at;
  if cred is null then
    return jsonb_build_object('enrolled', false, 'error_code', 'session_required');
  end if;
  secret := encode(extensions.gen_random_bytes(32), 'hex');
  insert into picking_private.device_pins(credential_id, secret_hash, pin_hash)
  values (cred, encode(extensions.digest(secret, 'sha256'), 'hex'), extensions.crypt(p_pin, extensions.gen_salt('bf', 10)))
  returning device_id into dev;
  -- 한 계정에 살아 있는 기기 등록은 최근 30개까지만
  update picking_private.device_pins set revoked_at = clock_timestamp()
  where credential_id = cred and revoked_at is null and device_id not in (
    select device_id from picking_private.device_pins where credential_id = cred and revoked_at is null
    order by created_at desc limit 30);
  return jsonb_build_object('enrolled', true, 'device_id', dev, 'device_secret', secret);
end;
$$;

-- 6자리로 로그인: 기기 키 + 6자리 → 세션 (아이디·비밀번호 로그인과 같은 세션)
create or replace function public.picking_pin_login_v1(p_device_id text, p_device_secret text, p_pin text)
returns jsonb language plpgsql security definer set search_path = '' set statement_timeout = '5s'
as $$
declare d picking_private.device_pins%rowtype; c picking_private.operator_credentials%rowtype;
  stamp timestamptz; fails integer; token text; expiry timestamptz;
begin
  if p_device_id is null or p_device_id !~ '^[0-9a-f-]{36}$' or p_device_secret is null or p_device_secret !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('authenticated', false, 'error_code', 'device_unknown');
  end if;
  select * into d from picking_private.device_pins
  where device_id = p_device_id::uuid and secret_hash = encode(extensions.digest(p_device_secret, 'sha256'), 'hex')
  for update;
  if d.device_id is null or d.revoked_at is not null then
    return jsonb_build_object('authenticated', false, 'error_code', 'device_unknown');
  end if;
  select * into c from picking_private.operator_credentials where credential_id = d.credential_id;
  if c.credential_id is null or not c.is_active or d.created_at < c.password_changed_at then
    update picking_private.device_pins set revoked_at = clock_timestamp() where device_id = d.device_id;
    return jsonb_build_object('authenticated', false, 'error_code', 'device_unknown');
  end if;
  stamp := clock_timestamp();
  if p_pin is null or p_pin !~ '^[0-9]{6}$' or extensions.crypt(p_pin, d.pin_hash) <> d.pin_hash then
    fails := d.failed_count + 1;
    update picking_private.device_pins set failed_count = fails,
      revoked_at = case when fails >= 5 then stamp else null end
    where device_id = d.device_id;
    if fails >= 5 then
      return jsonb_build_object('authenticated', false, 'error_code', 'device_locked');
    end if;
    return jsonb_build_object('authenticated', false, 'error_code', 'invalid_pin', 'remaining', 5 - fails);
  end if;
  update picking_private.device_pins set failed_count = 0, last_used_at = stamp where device_id = d.device_id;
  token := encode(extensions.gen_random_bytes(32), 'hex');
  expiry := stamp + c.session_ttl;
  insert into picking_private.operator_sessions(credential_id, token_hash, created_at, expires_at)
  values (c.credential_id, encode(extensions.digest(token, 'sha256'), 'hex'), stamp, expiry);
  return jsonb_build_object('authenticated', true, 'session_token', token, 'expires_at', expiry);
end;
$$;

-- 이 기기 6자리 지우기
create or replace function public.picking_pin_forget_v1(p_device_id text, p_device_secret text)
returns jsonb language plpgsql security definer set search_path = '' set statement_timeout = '5s'
as $$
begin
  if p_device_id ~ '^[0-9a-f-]{36}$' and p_device_secret ~ '^[0-9a-f]{64}$' then
    update picking_private.device_pins set revoked_at = coalesce(revoked_at, clock_timestamp())
    where device_id = p_device_id::uuid and secret_hash = encode(extensions.digest(p_device_secret, 'sha256'), 'hex');
  end if;
  return jsonb_build_object('forgotten', true);
end;
$$;

revoke all on function public.picking_pin_enroll_v1(text,text), public.picking_pin_login_v1(text,text,text), public.picking_pin_forget_v1(text,text) from public;
grant execute on function public.picking_pin_enroll_v1(text,text), public.picking_pin_login_v1(text,text,text), public.picking_pin_forget_v1(text,text) to anon, authenticated;

-- 로그인 전에도 부를 수 있는 RPC 목록에 6자리 3개 추가 (나머지는 그대로)
create or replace function picking_private.check_api_request()
returns void language plpgsql security invoker set search_path = ''
as $$
begin
  if current_setting('role', true) = 'service_role' then return; end if;
  if current_setting('request.method', true) = 'POST' and
    current_setting('request.path', true) in ('/rpc/picking_login_v1','/rpc/picking_check_session_v1','/rpc/picking_logout_v1',
      '/rpc/picking_pin_enroll_v1','/rpc/picking_pin_login_v1','/rpc/picking_pin_forget_v1') then return; end if;
  if not picking_private.has_valid_session() then
    raise exception using errcode = '42501', message = '유효한 피킹 로그인 세션이 필요합니다.';
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;

-- 되돌리기 (필요할 때만, SQL Editor 에서):
--   begin;
--   create or replace function picking_private.check_api_request() ... (20261007123229 의 원래 목록 3개로)
--   drop function public.picking_pin_enroll_v1(text,text), public.picking_pin_login_v1(text,text,text), public.picking_pin_forget_v1(text,text);
--   drop table picking_private.device_pins;
--   notify pgrst, 'reload schema'; commit;
