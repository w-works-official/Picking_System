import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

// 이 기기 6자리 (20261104100000_picking_device_pin.sql) — 따로 띄운 localhost DB 에서만. 운영 DB 에 연결하지 말 것.
const psql = process.env.PICKING_QA_PSQL;
const port = process.env.PICKING_QA_PORT || '55487';
const DB = 'picking_pin_fixture';
function run(sql, db = DB) {
  return spawnSync(psql, ['-X', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-q'], { input: sql, encoding: 'utf8', timeout: 60000 });
}
test('device PIN enroll / login / lockout / forget / password change', { skip: !psql }, async () => {
  const read = (f) => readFile(new URL('../supabase/migrations/' + f, import.meta.url), 'utf8');
  const first = await read('20261007123229_picking_shared_login_foundation.sql');
  const activation = await read('20261007123232_activate_picking_shared_login_boundary.sql');
  const pin = await read('20261104100000_picking_device_pin.sql');
  let result = run(`drop database if exists ${DB}; create database ${DB};`, 'postgres');
  assert.equal(result.status, 0, result.stderr);
  result = run(`
    do $$begin if inet_server_addr() <> '127.0.0.1'::inet then raise exception 'localhost only'; end if; end$$;
    do $$begin create role anon; exception when duplicate_object then null; end$$;
    do $$begin create role authenticated; exception when duplicate_object then null; end$$;
    do $$begin create role service_role bypassrls; exception when duplicate_object then null; end$$;
    do $$begin create role authenticator; exception when duplicate_object then null; end$$;
    create schema extensions; create schema storage;
    create table public.orders(id integer primary key);
    create table storage.objects(id integer primary key, bucket_id text);
    grant usage on schema public, storage to anon,authenticated;
    grant select on public.orders to anon,authenticated;
    alter table storage.objects enable row level security;
    insert into public.orders values(1);
    ${first}
    insert into picking_private.operator_credentials(username,password_hash) values('demo',extensions.crypt('fixture-only-password',extensions.gen_salt('bf',12)));
    ${activation}
    ${pin}
    ${pin}
  `);
  assert.equal(result.status, 0, result.stderr);
  result = run(`
    create function pg_temp.expect(ok boolean, label text) returns void language plpgsql as $$
    begin if ok is distinct from true then raise exception 'QA failed: %',label; end if; end$$;
    set role anon; set request.headers='{}'; set request.method='POST';
    -- 로그인 전에도 6자리 RPC 3개는 부를 수 있고, 다른 건 막힘
    set request.path='/rpc/picking_pin_login_v1'; select picking_private.check_api_request();
    set request.path='/rpc/picking_pin_enroll_v1'; select picking_private.check_api_request();
    set request.path='/rpc/picking_pin_forget_v1'; select picking_private.check_api_request();
    set request.path='/rpc/picking_login_v1'; select picking_private.check_api_request();
    set request.method='GET'; set request.path='/orders';
    do $$begin begin perform picking_private.check_api_request(); raise exception 'hook open';
      exception when insufficient_privilege then null; end; end$$;
    do $$begin begin perform * from picking_private.device_pins; raise exception 'private read';
      exception when insufficient_privilege then null; end; end$$;
    -- 세션 없이 설정 불가 · 6자리 모양 확인
    select pg_temp.expect(public.picking_pin_enroll_v1(repeat('a',64),'123456')->>'error_code'='session_required','enroll needs session');
    select set_config('qa.s', public.picking_login_v1('demo','fixture-only-password')->>'session_token', false);
    select pg_temp.expect(public.picking_pin_enroll_v1(current_setting('qa.s'),'12345')->>'error_code'='invalid_pin_format','6 digits');
    select pg_temp.expect(public.picking_pin_enroll_v1(current_setting('qa.s'),'12345a')->>'error_code'='invalid_pin_format','digits only');
    do $$declare r jsonb; begin
      r := public.picking_pin_enroll_v1(current_setting('qa.s'),'482913');
      perform pg_temp.expect((r->>'enrolled')::boolean,'enrolled');
      perform pg_temp.expect(r->>'device_secret' ~ '^[0-9a-f]{64}$','secret shape');
      perform set_config('qa.d', r->>'device_id', false); perform set_config('qa.k', r->>'device_secret', false);
    end$$;
    -- 6자리 로그인 = 진짜 세션
    do $$declare r jsonb; begin
      r := public.picking_pin_login_v1(current_setting('qa.d'), current_setting('qa.k'), '482913');
      perform pg_temp.expect((r->>'authenticated')::boolean,'pin login');
      perform pg_temp.expect((public.picking_check_session_v1(r->>'session_token')->>'authenticated')::boolean,'pin session valid');
      perform set_config('request.headers', jsonb_build_object('x-picking-session', r->>'session_token')::text, false);
    end$$;
    select pg_temp.expect((select count(*)=1 from public.orders),'pin session reads data');
    set request.headers='{}';
    -- 기기 키가 틀리면 6자리가 맞아도 안 됨 (다른 기기에서 6자리만으로 못 염)
    select pg_temp.expect(public.picking_pin_login_v1(current_setting('qa.d'), repeat('b',64), '482913')->>'error_code'='device_unknown','other device');
    select pg_temp.expect(public.picking_pin_login_v1('nope', current_setting('qa.k'), '482913')->>'error_code'='device_unknown','bad id');
    -- 틀리면 남은 횟수 · 맞으면 다시 0 · 5번 연속 틀리면 그 기기 등록 삭제
    select pg_temp.expect((public.picking_pin_login_v1(current_setting('qa.d'), current_setting('qa.k'), '000000')->>'remaining')::int=4,'remaining 4');
    select pg_temp.expect((public.picking_pin_login_v1(current_setting('qa.d'), current_setting('qa.k'), '482913')->>'authenticated')::boolean,'reset by success');
    do $$declare r jsonb; begin
      for i in 1..4 loop r := public.picking_pin_login_v1(current_setting('qa.d'), current_setting('qa.k'), '111111'); end loop;
      perform pg_temp.expect((r->>'remaining')::int=1,'remaining 1');
      r := public.picking_pin_login_v1(current_setting('qa.d'), current_setting('qa.k'), '111111');
      perform pg_temp.expect(r->>'error_code'='device_locked','locked at 5');
      r := public.picking_pin_login_v1(current_setting('qa.d'), current_setting('qa.k'), '482913');
      perform pg_temp.expect(r->>'error_code'='device_unknown','revoked after lock');
    end$$;
    -- 지우기
    do $$declare r jsonb; begin
      r := public.picking_pin_enroll_v1(current_setting('qa.s'),'135790');
      perform public.picking_pin_forget_v1(r->>'device_id', r->>'device_secret');
      perform pg_temp.expect(public.picking_pin_login_v1(r->>'device_id', r->>'device_secret','135790')->>'error_code'='device_unknown','forget');
      r := public.picking_pin_enroll_v1(current_setting('qa.s'),'246802');
      perform set_config('qa.d', r->>'device_id', false); perform set_config('qa.k', r->>'device_secret', false);
    end$$;
    -- 셀피아 비밀번호(공유 계정)를 바꾸면 그 전 기기 등록은 무효
    reset role;
    select pg_temp.expect(not exists(select 1 from picking_private.device_pins where pin_hash like '%246802%' or secret_hash=current_setting('qa.k')),'no plaintext stored');
    update picking_private.operator_credentials set password_changed_at=clock_timestamp()+interval '1 second';
    set role anon;
    select pg_temp.expect(public.picking_pin_login_v1(current_setting('qa.d'), current_setting('qa.k'),'246802')->>'error_code'='device_unknown','password change invalidates devices');
    reset role;
    select pg_temp.expect(not exists(select 1 from pg_proc where proname like 'picking_%' and not ('search_path=""'=any(proconfig))),'fixed function search paths');
  `);
  assert.equal(result.status, 0, result.stderr);
  run(`drop database if exists ${DB};`, 'postgres');
});
