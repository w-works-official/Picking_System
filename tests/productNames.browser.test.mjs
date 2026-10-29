// 상품 관리 · 상품명 요청 브라우저 시험 (게이트 밖) — 가짜 시트로: 비밀번호 칸 → 요청 → 후보·복사 → 비밀번호 저장
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "outputs/ui-qa/product-names");
const TYPES = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json" };
const ENDPOINT = "https://script.google.com/macros/s/TEST_CS_BOARD/exec";
const TOKEN = "board-token-123";
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) throw new Error("outside");
    if (url.pathname.endsWith("/")) file = path.join(file, "index.html");
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end("not found"); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const errors = [];
const calls = [];
let browser;
try {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
  const context = await browser.newContext({ viewport: { width: 1300, height: 900 }, serviceWorkers: "block" });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  const domain = await readFile(path.join(root, "src/domain/csBoard.mjs"), "utf8");
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.href.startsWith(ENDPOINT)) {
      const body = JSON.parse(route.request().postData() || "{}");
      calls.push(body);
      const json = body.token !== TOKEN ? { ok: false, denied: true, error: "비밀번호가 맞지 않습니다." }
        : { ok: true, names: Array.from({ length: body.count }, (_, i) => `써지컬 스틸 링 피어싱 ${i + 1}`) };
      return route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(json) });
    }
    if (url.origin !== origin) return route.abort("blockedbyclient");
    if (url.pathname.endsWith("/src/domain/csBoard.mjs")) return route.fulfill({ status: 200, contentType: "text/javascript", body: domain.replace(/export const CS_BOARD_ENDPOINT = "[^"]*";/, `export const CS_BOARD_ENDPOINT = "${ENDPOINT}";`) });
    return route.continue();
  });
  // 원격 보드 패널은 이 시험과 무관 — 바깥 요청은 막힘(그대로 둠)
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${origin}/purchase/#naming`);
  await page.waitForSelector("#pn-submit");
  assert.equal(await page.locator('[data-purchase-panel="naming"]').isVisible(), true, "hash opens 상품명 요청");
  assert.equal(await page.locator('[data-purchase-tab="naming"]').getAttribute("aria-current"), "page");
  assert.equal(await page.locator(".pn-token-wrap").isVisible(), true, "no saved password → field shown");

  await page.click("#pn-submit");
  assert.match(await page.locator(".pn-state").innerText(), /키워드·메모를 넣어/);
  assert.equal(calls.length, 0);

  await page.fill("#pn-keywords", "써지컬 링, 볼, 16G 8mm");
  await page.fill("#pn-token", "wrong-token-1");
  await page.click("#pn-submit");
  await page.waitForFunction(() => /비밀번호가 맞지 않습니다/.test(document.querySelector(".pn-state").textContent));
  assert.equal(await page.evaluate(() => localStorage.getItem("system_v3_cs_board")), null, "wrong password is not saved");

  await page.fill("#pn-token", TOKEN);
  await page.selectOption("#pn-count", "3");
  await page.click("#pn-submit");
  await page.waitForSelector(".pn-item");
  assert.equal(await page.locator(".pn-item").count(), 3);
  assert.deepEqual({ ...calls.at(-1), token: "-" }, { action: "name", keywords: "써지컬 링, 볼, 16G 8mm", count: 3, editor: "", token: "-" });
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem("system_v3_cs_board"))).token, TOKEN, "right password saved (same key as CS 관리)");
  assert.equal(await page.locator(".pn-token-wrap").isVisible(), false);
  await page.locator(".pn-copy").nth(1).click();
  await page.waitForFunction(() => document.querySelectorAll(".pn-copy")[1].textContent === "복사됨");
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "써지컬 스틸 링 피어싱 2");
  await page.screenshot({ path: path.join(output, "naming-desktop.png"), fullPage: true });

  // 다시 열면 비밀번호 칸 없이 바로 요청
  await page.reload();
  await page.waitForSelector("#pn-submit");
  assert.equal(await page.locator(".pn-token-wrap").isVisible(), false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, "naming-phone.png"), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, `no horizontal scroll on phone (${overflow})`);
  // 발주 탭으로 돌아가도 그대로
  await page.click('[data-purchase-tab="order"]');
  assert.equal(await page.locator('[data-purchase-panel="naming"]').isVisible(), false);
  assert.deepEqual(errors, []);
  console.log("productNames.browser.test: OK");
} finally {
  await browser?.close();
  server.close();
}
