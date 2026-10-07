import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import "../src/auth/pickingAuth.js";
import "../tools/picking-tool-auth.js";
const { createSessionClient, STORAGE_KEY } = globalThis.SystemV3PickingAuth;
const URL = "https://example.supabase.co";
const token = "a".repeat(64), expires_at = "2030-01-01T00:00:00Z";
function fixture() {
  const values = new Map(), calls = [];
  let result = { authenticated: true, session_token: token, expires_at };
  const client = createSessionClient({
    url: URL, key: "test-publishable", now: () => Date.parse("2026-10-07"),
    storage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key,value), removeItem: key => values.delete(key) },
    fetch: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify(result), { status: 200 });
    },
  });
  return { client, calls, values, setResult(value) { result = value; } };
}
test("before login no data fetch; login header is scoped to this backend only", async () => {
  const f = fixture();
  await assert.rejects(f.client.fetch(URL + "/rest/v1/orders"), /로그인/);
  assert.equal(f.calls.length, 0);
  await f.client.login("demo", "fixture-only");
  await f.client.fetch(URL + "/rest/v1/orders", { headers: { Range: "0-50" } });
  assert.equal(f.calls[1].options.headers.get("x-picking-session"), token);
  assert.equal(f.calls[1].options.headers.get("range"), "0-50");
  await assert.rejects(f.client.fetch("https://other.example/orders"), /다른 서버/);
  assert.equal(f.calls.length, 2);
  assert.equal(f.values.get(STORAGE_KEY).includes("fixture-only"), false);
});
test("reload checks server, invalid/expired records fail closed", async () => {
  const f = fixture();
  f.values.set(STORAGE_KEY,JSON.stringify({token,expiresAt:expires_at}));
  assert.ok(await f.client.restore());
  assert.match(f.calls[0].url,/picking_check_session_v1$/);
  f.setResult({ authenticated:false });
  assert.equal(await f.client.restore(), null);
  assert.equal(f.values.has(STORAGE_KEY), false);
  f.values.set(STORAGE_KEY,JSON.stringify({token,expiresAt:"2000-01-01"}));
  const count=f.calls.length;
  assert.equal(await f.client.restore(), null);
  assert.equal(f.calls.length,count);
});
test("logout clears local state and revokes server token; subsequent work blocked", async () => {
  const f = fixture();
  await f.client.login("demo","fixture-only");
  await f.client.logout();
  assert.match(f.calls.at(-1).url,/picking_logout_v1$/);
  assert.equal(f.values.has(STORAGE_KEY),false);
  await assert.rejects(f.client.fetch(URL+"/rest/v1/orders"),/로그인/);
});
test("no stale response can unlock or deliver data after logout", async () => {
  let finish;
  const client=createSessionClient({url:URL,key:"test",fetch:()=>new Promise(r=>{finish=r;})});
  const pending=client.login("demo","fixture-only");
  client.clear();
  finish(new Response(JSON.stringify({authenticated:true,session_token:token,expires_at})));
  await assert.rejects(pending,/로그인/);
});
test("a restore response arriving after logout cannot restore the session", async () => {
  let finish;
  const values=new Map([[STORAGE_KEY,JSON.stringify({token,expiresAt:expires_at})]]);
  const client=createSessionClient({url:URL,key:"test",storage:{
    getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),
  },fetch:()=>new Promise(resolve=>{finish=resolve;})});
  const pending=client.restore();
  await client.logout();
  finish(new Response(JSON.stringify({authenticated:true,expires_at})));
  await assert.rejects(pending,/로그인/);
  assert.equal(values.has(STORAGE_KEY),false);
});
test("401/403 locks subsequent requests; server check never silently continues", async () => {
  let denied=false,required=0;
  const client=createSessionClient({url:URL,key:"test",onRequired:()=>required++,fetch:async()=>{
    return denied? new Response("denied",{status:403}):new Response(JSON.stringify({authenticated:true,session_token:token,expires_at}));
  }});
  await client.login("demo","fixture-only"); denied=true;
  await assert.rejects(client.fetch(URL+"/rest/v1/orders"),/로그인/);
  await assert.rejects(client.fetch(URL+"/rest/v1/orders"),/로그인/);
  assert.ok(required>=1);
});
test("bookmarklet wraps lexical fetch, not global fetch; no business execution before auth", () => {
  const wrapped=globalThis.securePickingBookmarklet("(function(){(async function SCRAPER(){var work=1;})();})();");
  new Function(wrapped);
  assert.ok(wrapped.indexOf("await (") < wrapped.indexOf("var work=1"));
  assert.match(wrapped,/var fetch = function/);
  assert.doesNotMatch(wrapped,/window\.fetch\s*=/);
});
test("gate and tool authentication are wired in actual runtime entry points", async () => {
  const read=path=>readFile(new globalThis.URL("../"+path,import.meta.url),"utf8");
  const html=await read("index.html"), app=await read("src/app/pickingApp.mjs"), boot=await read("src/app/pickingBootstrap.mjs");
  assert.match(html, /id="app"[^>]*hidden inert/);
  assert.doesNotMatch(html,/<script[^>]+src="src\/app\/pickingApp/);
  assert.match(app,/const db = window\.PickingAuth\?\.client/);
  assert.ok(boot.indexOf('auth.restore()')>0);
  const scraper=await read("tools/sellpia_scraper.html"), updater=await read("tools/sellpia_memo_updater_0707_stockmatch.html");
  assert.match(scraper,/securePickingBookmarklet\(patched\)/);
  assert.match(updater,/securePickingBookmarklet\(document/);
  assert.match(updater,/async function setPopupValues[^]*?if \(!testMode\) await toolAuth\.check\(\)/);
});

test("replacement tool pages, bookmark names and execution popups show 1007DB인증교체", async () => {
  for (const file of ["sellpia_scraper.html", "sellpia_memo_updater_0707_stockmatch.html"]) {
    const html = await readFile(new globalThis.URL("../tools/" + file, import.meta.url), "utf8");
    assert.match(html, /<title>1007DB인증교체<\/title>/);
    assert.match(html, /<h1>1007DB인증교체<\/h1>/);
    assert.match(html, /id="bookmarklet-link"[^>]*>1007DB인증교체<\/a>/);
    if (file === "sellpia_scraper.html") {
      assert.match(html, /\['🔄 0716_주문메모 오후 수정본', '1007DB인증교체'\]/);
    } else {
      assert.match(html, /font-weight:900;margin-bottom:4px">1007DB인증교체<\/div>/);
      assert.doesNotMatch(html, /0812-합배송오류수정|0827-합배송주문메모오류수정/);
    }
  }
});
