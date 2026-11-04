// 피킹시스템 로그인 화면: 이 기기 6자리 (2026-11-04) — node tests/pickingPinGate.browser.test.mjs
import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const types = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const server = http.createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = path.resolve(root, "." + (p === "/" ? "/index.html" : p));
    if (!file.startsWith(root)) throw new Error("outside");
    res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
try {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const rpc = [];
  await context.exposeBinding("__rpcLog", (_, name, body) => { rpc.push({ name, body }); });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1") {
      if (url.pathname.endsWith("/src/app/pickingApp.mjs")) return route.fulfill({ contentType: "text/javascript", body: "window.__appLoaded = true; export {};" });
      return route.continue();
    }
    if (url.href.startsWith("https://cdn.jsdelivr.net/npm/@supabase/supabase-js")) return route.fulfill({ contentType: "text/javascript", body: "window.supabase = { createClient() { return {}; } };" });
    return route.fulfill({ status: 200, contentType: "text/plain", body: "" });   // 다른 외부 요청은 빈 응답
  });
  await context.addInitScript(() => {
    const real = window.fetch.bind(window);
    window.fetch = async (input, options = {}) => {
      const url = String(typeof input === "string" ? input : input.url);
      const m = url.match(/\/rpc\/(picking_[a-z0-9_]+)$/);
      if (!m) return real(input, options);
      const body = JSON.parse(options.body || "{}");
      await window.__rpcLog(m[1], body);
      const ok = { authenticated: true, session_token: "a".repeat(64), expires_at: "2030-01-01T00:00:00Z" };
      let out = { authenticated: false, error_code: "invalid_credentials" };
      if (m[1] === "picking_login_v1" && body.p_password === "fixture-only") out = ok;
      if (m[1] === "picking_check_session_v1") out = { authenticated: false };
      if (m[1] === "picking_pin_enroll_v1") out = { enrolled: true, device_id: "11111111-2222-3333-4444-555555555555", device_secret: "c".repeat(64) };
      if (m[1] === "picking_pin_login_v1") out = body.p_pin === "482913" ? ok : body.p_pin === "999999" ? { authenticated: false, error_code: "device_locked" } : { authenticated: false, error_code: "invalid_pin", remaining: 4 };
      if (m[1] === "picking_pin_forget_v1") out = { forgotten: true };
      return new Response(JSON.stringify(out), { status: 200 });
    };
  });

  // 1) 처음: 아이디·비밀번호 화면 + "6자리로 열기" 선택
  let page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForFunction(() => document.getElementById("picking-login-status").textContent.includes("로그인"));
  assert.equal(await page.locator("#picking-pin-form").isVisible(), false);
  assert.equal(await page.locator("[data-pin-new]").isVisible(), false);
  await page.locator('[name="setpin"]').check();
  assert.equal(await page.locator("[data-pin-new]").isVisible(), true);
  await page.locator('[name="username"]').fill("demo");
  await page.locator('[name="password"]').fill("fixture-only");
  await page.locator('[name="newpin"]').fill("482913");
  await page.locator('[name="newpin2"]').fill("482910");
  await page.locator('#picking-login-form [type="submit"]').click();
  assert.match(await page.locator("#picking-login-status").textContent(), /서로 다릅니다/);
  assert.equal(rpc.length, 0, "6자리가 틀리면 로그인 요청도 안 보냄");
  await page.locator('[name="newpin2"]').fill("482913");
  await page.locator('#picking-login-form [type="submit"]').click();
  await page.waitForFunction(() => window.__appLoaded === true && !document.getElementById("app").hidden);
  assert.deepEqual(rpc.map((r) => r.name).slice(-2), ["picking_login_v1", "picking_pin_enroll_v1"]);
  assert.equal(rpc.at(-1).body.p_pin, "482913");
  const stored = await page.evaluate(() => localStorage.getItem("system-v3-picking-device-v1"));
  assert.ok(stored.includes("c".repeat(64)) && !stored.includes("482913"), "기기 키만 저장, 6자리는 저장 안 함");
  await page.close();

  // 2) 새 탭: 6자리 화면 → 틀림 → 맞음
  page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForSelector("#picking-pin-form:not([hidden])");
  assert.equal(await page.locator("#picking-login-form").isVisible(), false);
  await page.locator('[name="pin"]').fill("000000");
  await page.locator('#picking-pin-form [type="submit"]').click();
  await page.waitForFunction(() => /4번 더/.test(document.getElementById("picking-pin-status").textContent));
  await page.locator('[name="pin"]').fill("482913");
  await page.locator('#picking-pin-form [type="submit"]').click();
  await page.waitForFunction(() => window.__appLoaded === true && !document.getElementById("app").hidden);
  assert.deepEqual(rpc.at(-1).body, { p_device_id: "11111111-2222-3333-4444-555555555555", p_device_secret: "c".repeat(64), p_pin: "482913" });
  await page.close();

  // 3) 아이디·비밀번호로 바꾸기 링크 · 5번 틀려 잠기면 기기 키 지우고 로그인 화면
  page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForSelector("#picking-pin-form:not([hidden])");
  await page.locator("[data-pin-switch]").click();
  assert.equal(await page.locator("#picking-login-form").isVisible(), true);
  await page.reload();
  await page.waitForSelector("#picking-pin-form:not([hidden])");
  await page.locator('[name="pin"]').fill("999999");
  await page.locator('#picking-pin-form [type="submit"]').click();
  await page.waitForFunction(() => /5번 틀려/.test(document.getElementById("picking-login-status").textContent));
  assert.equal(await page.locator("#picking-login-form").isVisible(), true);
  assert.equal(await page.evaluate(() => localStorage.getItem("system-v3-picking-device-v1")), null);
  await page.close();
  console.log("pickingPinGate.browser.test: OK");
} finally {
  await browser.close();
  server.close();
}
