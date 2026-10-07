import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

// Opt-in, isolated localhost database only. Never connect this harness to production.
const psql = process.env.PICKING_QA_PSQL;
const port = process.env.PICKING_QA_PORT || '55487';
function run(sql) {
  return spawnSync(psql, ['-X', '-h', '127.0.0.1', '-p', port, '-U', 'postgres',
    '-d', 'picking_auth_fixture', '-v', 'ON_ERROR_STOP=1', '-q'], {
    input: sql, encoding: 'utf8', timeout: 60000,
  });
}
test('isolated real PostgreSQL pgcrypto / RLS / session lifecycle', { skip: !psql }, async () => {
  const first = await readFile(new URL('../supabase/migrations/20261007123229_picking_shared_login_foundation.sql', import.meta.url), 'utf8');
  const activation = await readFile(new URL('../supabase/migrations/20261007123232_activate_picking_shared_login_boundary.sql', import.meta.url), 'utf8');
  let result = run(`
    do $$begin
      if current_database() <> 'picking_auth_fixture' or inet_server_addr() <> '127.0.0.1'::inet then
        raise exception 'Isolated localhost fixture required';
      end if;
    end$$;
    create role anon; create role authenticated; create role service_role bypassrls; create role authenticator;
    create schema extensions; create schema storage;
    create table public.orders(id integer primary key, name text);
    create table public.order_items(id integer primary key);
    create table public.cs_cases(id integer primary key, status text);
    create table storage.objects(id integer primary key, bucket_id text);
    grant usage on schema public, storage to anon,authenticated;
    grant select,insert,update,delete on public.orders,public.order_items to anon,authenticated;
    grant select,insert on public.cs_cases to anon,authenticated;
    grant update(status) on public.cs_cases to anon,authenticated;
    alter table public.cs_cases enable row level security;
    create policy old_access on public.cs_cases for all to anon,authenticated using(true) with check(true);
    alter table storage.objects enable row level security;
    grant select,insert,update on storage.objects to anon,authenticated;
    create policy old_storage on storage.objects for all to anon,authenticated using(true) with check(true);
    insert into public.orders values(1,'fixture');
    insert into storage.objects values(1,'system-v3-shared'),(2,'other-bucket');
    ${first}
  `);
  assert.equal(result.status, 0, result.stderr);
  result = run(activation);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Provision/);
  result = run(`
    insert into picking_private.operator_credentials(username,password_hash)
      values('demo',extensions.crypt('fixture-only-password',extensions.gen_salt('bf',12)));
    ${activation}
    create function pg_temp.expect(ok boolean, label text) returns void language plpgsql as $$
    begin if ok is distinct from true then raise exception 'QA failed: %',label; end if; end$$;
    set role service_role;
    set request.method='GET'; set request.path='/orders';
    select picking_private.check_api_request();
    set role anon;
    set request.headers='{}'; set request.method='GET'; set request.path='/orders';
    select pg_temp.expect((select count(*)=0 from public.orders),'anonymous read blocked');
    select pg_temp.expect((select count(*)=0 from storage.objects where bucket_id='system-v3-shared'),'anonymous shared storage blocked');
    select pg_temp.expect((select count(*)=1 from storage.objects where bucket_id='other-bucket'),'unrelated storage unchanged');
    do $$begin
      begin insert into public.orders values(2,'denied'); raise exception 'write unexpectedly allowed';
      exception when insufficient_privilege then null; end;
      begin perform picking_private.check_api_request(); raise exception 'hook unexpectedly allowed';
      exception when insufficient_privilege then null; end;
      begin perform * from picking_private.operator_credentials; raise exception 'private read unexpectedly allowed';
      exception when insufficient_privilege then null; end;
    end$$;
    select pg_temp.expect((public.picking_login_v1('demo','wrong')->>'authenticated')::boolean=false,'wrong bcrypt rejected');
    select pg_temp.expect((public.picking_login_v1(null,null)->>'authenticated')::boolean=false,'null input rejected');
    do $$declare session jsonb; token text; begin
      session := public.picking_login_v1(' DEMO ','fixture-only-password');
      perform pg_temp.expect((session->>'authenticated')::boolean,'real bcrypt login');
      token := session->>'session_token';
      perform pg_temp.expect(token ~ '^[a-f0-9]{64}$','random token shape');
      perform set_config('request.headers',jsonb_build_object('x-picking-session',token)::text,false);
      perform set_config('qa.token',token,false);
    end$$;
    select pg_temp.expect((select count(*)=1 from public.orders),'session read');
    select picking_private.check_api_request();
    insert into public.orders values(2,'allowed');
    update public.orders set name='updated' where id=2;
    delete from public.orders where id=2;
    select pg_temp.expect((select count(*)=1 from storage.objects where bucket_id='system-v3-shared'),'session storage read');
    reset role;
    select pg_temp.expect(not exists(select 1 from picking_private.operator_sessions where token_hash=current_setting('qa.token')),'token not stored plaintext');
    select pg_temp.expect(exists(select 1 from picking_private.operator_sessions where token_hash=encode(extensions.digest(current_setting('qa.token'),'sha256'),'hex')),'real sha256 token stored');
    set role anon;
    select public.picking_logout_v1(current_setting('qa.token'));
    select pg_temp.expect((select count(*)=0 from public.orders),'logout blocks existing header');
    select set_config('qa.token',public.picking_login_v1('demo','fixture-only-password')->>'session_token',false);
    reset role;
    update picking_private.operator_sessions set expires_at=now()-interval '1 second';
    select pg_temp.expect((public.picking_check_session_v1(current_setting('qa.token'))->>'authenticated')::boolean=false,'expiry invalidates');
    select set_config('qa.token',public.picking_login_v1('demo','fixture-only-password')->>'session_token',false);
    update picking_private.operator_credentials set password_changed_at=clock_timestamp()+interval '1 second';
    select pg_temp.expect((public.picking_check_session_v1(current_setting('qa.token'))->>'authenticated')::boolean=false,'password change invalidates');
    do $$begin
      for i in 1..5 loop perform public.picking_login_v1('demo','wrong'); end loop;
      perform pg_temp.expect(public.picking_login_v1('demo','fixture-only-password')->>'error_code'='rate_limited','failure throttling');
    end$$;
    select pg_temp.expect(not has_table_privilege('anon','public.cs_cases','UPDATE'),'column-only grant preserved');
    select pg_temp.expect(not exists(select 1 from pg_proc where proname like 'picking_%' and not ('search_path=""'=any(proconfig))),'fixed function search paths');
    select pg_temp.expect(exists(select 1 from pg_db_role_setting where 'pgrst.db_pre_request=picking_private.check_api_request'=any(setconfig)),'hook configured');
  `);
  assert.equal(result.status, 0, result.stderr);
});
