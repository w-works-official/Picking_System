import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
let PGlite;
try {
  const module = process.env.CODEX_NODE_MODULES
    ? pathToFileURL(join(process.env.CODEX_NODE_MODULES,"@electric-sql/pglite/dist/index.js")).href
    : "@electric-sql/pglite";
  ({PGlite}=await import(module));
} catch {}
test("local SQL boundary / RLS / lifecycle (crypto test doubles, NOT bcrypt verification)", {skip:!PGlite}, async()=>{
  const db=new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls; create role authenticator;
      create schema extensions; create schema storage;
      create table public.orders(id integer primary key, name text);
      create table public.order_items(id integer primary key);
      create table public.cs_cases(id integer primary key, status text);
      create table storage.objects(id integer primary key, bucket_id text);
      grant usage on schema public, storage to anon,authenticated;
      grant select,insert,update,delete on public.orders, public.order_items to anon,authenticated;
      grant select,insert on public.cs_cases to anon,authenticated;
      grant update(status) on public.cs_cases to anon,authenticated;
      alter table public.cs_cases enable row level security;
      create policy old_access on public.cs_cases for all to anon,authenticated using(true) with check(true);
      alter table storage.objects enable row level security;
      grant select,insert,update on storage.objects to anon,authenticated;
      create policy existing_storage on storage.objects for all to anon,authenticated using(true) with check(true);
      insert into public.orders values(1,'fixture');
      insert into storage.objects values(1,'system-v3-shared');
      -- PGlite has no pgcrypto. These deterministic test functions exercise
      -- SQL control flow only. Production crypt/digest must be QAed in Postgres.
      create function extensions.gen_salt(text,integer) returns text language sql as $$select 'test-salt'::text$$;
      create function extensions.crypt(text,text) returns text language sql as $$
        select '$2b$12$' || left(md5($1) || md5($1),53)
      $$;
      create function extensions.gen_random_bytes(integer) returns bytea language sql as $$
        select decode(md5(random()::text)||md5(random()::text),'hex')
      $$;
      create function extensions.digest(text,text) returns bytea language sql as $$
        select decode(md5($1)||md5(reverse($1)),'hex')
      $$;
    `);
    const first=await readFile(new URL("../supabase/migrations/20261007123229_picking_shared_login_foundation.sql",import.meta.url),"utf8");
    const activation=await readFile(new URL("../supabase/migrations/20261007123232_activate_picking_shared_login_boundary.sql",import.meta.url),"utf8");
    await db.exec(first.replace("create extension if not exists pgcrypto with schema extensions;","-- crypto fixtures above"));
    await assert.rejects(db.exec(activation),/Provision/);
    await db.exec("rollback");
    await db.query("insert into picking_private.operator_credentials(username,password_hash) values($1,extensions.crypt($2,'test'))",["demo","fixture-only"]);
    await db.exec(activation);
    await db.exec("set role service_role; set request.method='GET'; set request.path='/orders';");
    await db.query("select picking_private.check_api_request()");
    await db.exec("set role anon; set request.headers='{}';");
    assert.deepEqual((await db.query("select * from public.orders")).rows,[]);
    assert.deepEqual((await db.query("select * from storage.objects where bucket_id='system-v3-shared'")).rows,[]);
    await assert.rejects(db.exec("insert into public.orders values(2,'denied')"),/row-level security/);
    await assert.rejects(db.exec("select picking_private.operator_credentials.* from picking_private.operator_credentials"),/permission denied/);
    await db.exec("set request.method='GET'; set request.path='/orders';");
    await assert.rejects(db.query("select picking_private.check_api_request()"),/로그인 세션/);
    const login=async(pw)=>(await db.query("select public.picking_login_v1($1,$2) as result",["demo",pw])).rows[0].result;
    assert.equal((await login("wrong")).authenticated,false);
    const session=await login("fixture-only");
    assert.equal(session.authenticated,true);
    assert.match(session.session_token,/^[a-f0-9]{64}$/);
    await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({"x-picking-session":session.session_token})]);
    assert.equal((await db.query("select * from public.orders")).rows.length,1);
    await db.exec("insert into public.orders values(2,'allowed'); update public.orders set name='updated' where id=2; delete from public.orders where id=2");
    assert.equal((await db.query("select * from storage.objects")).rows.length,1);
    await db.query("select picking_private.check_api_request()");
    // A permissive old policy must not bypass the restrictive token check.
    await db.query("select public.picking_logout_v1($1)",[session.session_token]);
    assert.deepEqual((await db.query("select * from public.orders")).rows,[]);
    assert.equal((await db.query("select public.picking_check_session_v1($1) as result",[session.session_token])).rows[0].result.authenticated,false);
    const second=await login("fixture-only");
    await db.exec("reset role");
    assert.equal((await db.query("select token_hash from picking_private.operator_sessions")).rows.some(row=>row.token_hash===second.session_token),false);
    await db.exec("update picking_private.operator_sessions set expires_at=now()-interval '1 second'");
    assert.equal((await db.query("select public.picking_check_session_v1($1) as result",[second.session_token])).rows[0].result.authenticated,false);
    const third=await login("fixture-only");
    await db.exec("update picking_private.operator_credentials set password_changed_at=clock_timestamp()+interval '1 second'");
    assert.equal((await db.query("select public.picking_check_session_v1($1) as result",[third.session_token])).rows[0].result.authenticated,false);
    for(let i=0;i<5;i++) await login("wrong");
    assert.equal((await login("fixture-only")).error_code,"rate_limited");
    const functions=(await db.query("select proconfig from pg_proc where proname like 'picking_%'")).rows;
    assert.ok(functions.every(row=>row.proconfig.includes('search_path=""')));
    const hooks=(await db.query("select setconfig from pg_db_role_setting where setrole=(select oid from pg_roles where rolname='authenticator')")).rows;
    assert.ok(hooks[0].setconfig.includes("pgrst.db_pre_request=picking_private.check_api_request"));
    // Column-specific UPDATE grant is preserved; no broad new grant introduced.
    assert.equal((await db.query("select has_table_privilege('anon','public.cs_cases','UPDATE') as allowed")).rows[0].allowed,false);
  } finally { await db.close(); }
});
