import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = await readFile(path.join(root, "tests/fixtures/customOrderPreviewSupabase.js"), "utf8");
const authSource = await readFile(path.join(root, "src/auth/pickingAuth.js"), "utf8");

function previewContext(search = "?write=1") {
  const values = new Map();
  const forwarded = [];
  const browser = {
    location: { origin: "http://127.0.0.1:4192", href: `http://127.0.0.1:4192/${search}`, search },
    sessionStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
    fetch: async (input) => { forwarded.push(input); return new Response("local file"); },
  };
  const context = vm.createContext({ window: browser, URL, URLSearchParams, Response, Headers, AbortController, Date, structuredClone });
  vm.runInContext(fixture, context);
  vm.runInContext(authSource, context);
  const client = context.SystemV3PickingAuth.createSessionClient({
    url: "https://fixture-only.supabase.co", key: "fixture-only", fetch: browser.fetch,
    storage: browser.sessionStorage,
  });
  return { browser, client, forwarded, context };
}

test("preview restores a dummy session through real auth code and revokes it locally", async () => {
  const { browser, client, forwarded } = previewContext();
  assert.equal((await client.restore()).token, "0".repeat(64));
  assert.equal(await client.check(), true);
  await client.logout();
  assert.throws(() => client.requireSession(), { code: "PICKING_AUTH_REQUIRED" });
  const result = await browser.fetch("https://fixture-only.supabase.co/rest/v1/rpc/picking_check_session_v1", {
    method: "POST", body: JSON.stringify({ p_session_token: "0".repeat(64) }),
  });
  assert.deepEqual(await result.json(), { authenticated: false, expires_at: null });
  assert.equal(browser.sessionStorage.getItem("system-v3-local-preview-logged-out"), "1");
  assert.equal(forwarded.length, 0, "auth RPCs must never reach the native fetch");
});

test("preview login accepts only the explicit dummy credentials", async () => {
  const { browser, client, forwarded } = previewContext("?previewLogin=1");
  assert.equal(await client.restore(), null);
  await assert.rejects(client.login("local-preview", "wrong-fixture-password"), /아이디 또는 비밀번호/);
  assert.equal((await client.login("local-preview", "fixture-only")).token, "0".repeat(64));
  assert.equal(await client.check(), true);
  assert.equal(forwarded.length, 0);
  assert.equal(browser.__previewNetwork.authCalls.includes("picking_login_v1"), true);
});

test("preview blocks external data, storage and arbitrary requests before native fetch", async () => {
  const { browser, forwarded } = previewContext();
  for (const url of [
    "https://fixture-only.supabase.co/rest/v1/orders",
    "https://images-fixture.supabase.co/storage/v1/object/public/product-images/sellpia/fixture.jpg",
    "https://external-fixture.invalid/anything",
  ]) {
    await assert.rejects(browser.fetch(url), { code: "LOCAL_PREVIEW_EXTERNAL_BLOCKED" });
  }
  assert.equal(forwarded.length, 0);
  assert.equal(browser.__previewNetwork.blocked.length, 3);
  assert.equal(await (await browser.fetch("/src/styles/picking.css")).text(), "local file");
  assert.equal(forwarded.length, 1, "only local-origin files may use native fetch");
});

test("preview retains operation identities and realistic quantity and sibling fixtures", async () => {
  const { browser } = previewContext();
  const db = browser.supabase.createClient("https://unused-fixture.supabase.co", "fixture-only");
  const { data: orders } = await db.from("orders").select("*").eq("receipt_date", browser.__previewReceiptDate);
  assert.equal(orders.length, 2);
  const { data: siblings } = await db.from("order_items").select("*").eq("ord_no", "LOCAL-PICK-2");
  assert.deepEqual(siblings.map((row) => row.qty), [5, 1]);
  assert.equal(siblings[0].p_code, siblings[1].p_code);
  const { data: operations } = await db.from("order_item_operations").select("*");
  assert.equal(operations.length, 6);
  assert.equal(operations.some((row) => row.operation_id === "preview-missing"), true);
  const { data: item } = await db.from("order_items").select("*").eq("ord_no", "LOCAL-O1");
  assert.equal(item[0].qty, 2);
  assert.equal(item[0].p_option, "골드/6mm바[GPA-3-191],바길이 변경(주문제작/취소불가):4mm바");
});

test("preview server serves isolated HTML, the local image origin, and generated SVG only", async () => {
  const child = spawn(process.execPath, ["tests/helpers/customOrderPreviewServer.mjs"], {
    cwd: root, env: { ...process.env, CUSTOM_ORDER_PREVIEW_PORT: "0" }, stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const origin = await new Promise((resolve, reject) => {
      let output = "";
      const timeout = setTimeout(() => reject(new Error("preview server did not start")), 5000);
      child.once("error", (error) => { clearTimeout(timeout); reject(error); });
      child.once("exit", (code) => { clearTimeout(timeout); reject(new Error(`preview exited ${code}`)); });
      child.stdout.on("data", (chunk) => {
        output += chunk;
        const ready = /CUSTOM_ORDER_PREVIEW_READY (http:\/\/127\.0\.0\.1:\d+)\//.exec(output);
        if (ready) { clearTimeout(timeout); resolve(ready[1]); }
      });
    });
    const index = await fetch(`${origin}/?write=1`);
    assert.match(index.headers.get("content-security-policy"), /connect-src 'self'/);
    assert.match(index.headers.get("content-security-policy"), /img-src 'self' data: blob:/);
    assert.match(index.headers.get("content-security-policy"), /worker-src 'none'/);
    const html = await index.text();
    assert.ok(html.indexOf("tests/fixtures/customOrderPreviewSupabase.js") < html.indexOf("src/auth/pickingAuth.js"));
    assert.doesNotMatch(html, /<(?:script|link)\b[^>]*(?:src|href)="https?:\/\//);
    assert.match(html, /if \(false \/\* disabled in local preview \*\/\)/);
    const app = await (await fetch(`${origin}/src/app/pickingApp.mjs`)).text();
    assert.match(app, /const IMAGE_SUPABASE_URL = location.origin;/);
    const image = await fetch(`${origin}/storage/v1/object/public/product-images/sellpia/SKU-CURRENT.__priority.jpg`);
    assert.equal(image.headers.get("content-type"), "image/svg+xml; charset=utf-8");
    assert.match(await image.text(), /LOCAL SAMPLE/);
    assert.equal((await fetch(`${origin}/tools/sellpia_scraper.js`)).status, 404);
    assert.equal((await fetch(`${origin}/rest/v1/orders`, { method: "POST", body: "{}" })).status, 405);
  } finally {
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill();
    if (child.exitCode === null) await exited;
  }
});
