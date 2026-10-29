// CS 자동화 화면 브라우저 시험 (게이트 밖 — CS 화면을 건드리면 따로 실행)
// 1) 시트 연결 전: 가상셋팅·빨간 미작동 버튼·상단 버튼 위치  2) 가짜 시트 연결: 고르기·자동 저장·AI 추천·충돌
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { loadCsBoardScript } from "./helpers/csBoardFakeSheet.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "outputs/ui-qa/cs-board");
const TYPES = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json" };
const ENDPOINT = "https://script.google.com/macros/s/TEST_CS_BOARD/exec";
const TOKEN = "board-token-123";
const COLLECTOR = "collector-token-456";

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) throw new Error("outside");
    if (url.pathname.endsWith("/")) file = path.join(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const pageErrors = [];
let browser;

try {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });

  // ---------- 1) 시트 연결 전 ----------
  {
    const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, serviceWorkers: "block" });
    await context.route("**/*", (route) => (new URL(route.request().url()).origin === origin ? route.continue() : route.abort("blockedbyclient")));
    const page = await context.newPage();
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.goto(`${origin}/cs/board/`);
    await page.locator("#cs-board-list [data-card]").first().waitFor();
    assert.equal(await page.locator("#cs-connection").textContent(), "🧪 가상셋팅");
    assert.equal(await page.locator("#cs-board-list [data-card]").count(), 4);
    assert.equal(await page.locator("#cs-sample-banner").isVisible(), true);

    // 상단 버튼: 다른 화면과 같은 자리·같은 크기, CS 관리가 현재 메뉴
    const boxes = await page.locator(".workspace-navigation .workspace-link").evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; }));
    assert.deepEqual(boxes.map((b) => [b[2], b[3]]), [[80, 32], [80, 32], [80, 32]]);
    assert.ok(Math.abs(boxes[0][0] - 288) <= 1 && Math.abs(boxes[0][1] - 19) <= 1, `nav spot ${boxes[0]}`);
    assert.equal(await page.locator("#workspace-cs-link").evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(190, 24, 93)");
    assert.equal(await page.locator("#workspace-picking-link").getAttribute("href"), "../../");
    assert.equal(await page.locator("#workspace-purchase-link").getAttribute("href"), "../../purchase/");

    // 빨간 미작동 버튼: 모두 disabled, 빨간 글씨, 이유 표시
    const pending = await page.locator("button.is-pending").evaluateAll((els) => els.map((el) => ({ disabled: el.disabled, color: getComputedStyle(el).color, title: el.title, text: el.textContent.trim() })));
    assert.ok(pending.length >= 20);
    for (const b of pending) {
      assert.equal(b.disabled, true, `${b.text} disabled`);
      assert.equal(b.color, "rgb(220, 38, 38)", `${b.text} red`);
    }
    assert.ok(pending.filter((b) => b.title).length >= 20, "reasons shown on hover");

    // 가상 카드: 고르기·⟳·보류·선택 해제 (저장 안 함)
    const first = page.locator("#cs-board-list [data-card]").first();
    await first.locator('[data-act="pick"][data-box="1"]').click();
    assert.equal(await page.locator("#cs-board-list [data-card]").first().locator(".cs-card-result").textContent(), "채택 B");
    assert.match(await page.locator("#cs-summary").textContent(), /채택 1 .*가상\(저장 안 함\)/);
    const before = await page.locator("#cs-board-list [data-card]").first().locator("textarea").nth(1).inputValue();
    await page.locator("#cs-board-list [data-card]").first().locator('[data-act="cycle"][data-box="1"]').click();
    const after = await page.locator("#cs-board-list [data-card]").first().locator("textarea").nth(1).inputValue();
    assert.notEqual(before, after, "⟳ shows another draft");
    assert.equal(await page.locator("#cs-board-list [data-card]").first().locator(".cs-card-result").textContent(), "채택 B", "picked box follows the cycle");
    await page.locator("#cs-board-list [data-card]").first().locator('[data-act="hold"]').check();
    assert.equal(await page.locator("#cs-board-list [data-card]").first().locator(".cs-card-result").textContent(), "보류");
    const aiButton = page.locator("#cs-board-list [data-card]").first().locator("button", { hasText: "AI 추천" });
    assert.equal(await aiButton.isDisabled(), true, "AI red in sample mode");
    await page.screenshot({ path: path.join(output, "cs-board-sample.png"), fullPage: false });

    // 왼쪽 탭·접기, 리뷰·메신저 미리보기
    await page.locator('[data-left-tab="settings"]').click();
    assert.equal(await page.locator("#cs-token-input").isDisabled(), true, "no endpoint → token form red");
    await page.locator("#cs-fold").click();
    assert.equal(await page.locator("#cs-left").isVisible(), false);
    await page.locator("#cs-fold").click();
    await page.locator('[data-right-tab="review"]').click();
    assert.equal(await page.locator("#cs-review-list [data-card]").count(), 2);
    assert.equal(await page.locator('#cs-review-list [data-act="pick"]').first().isDisabled(), true);
    await page.screenshot({ path: path.join(output, "cs-board-review.png") });
    await page.locator('[data-right-tab="msn"]').click();
    await page.locator("#cs-msn-demo").click();
    await page.locator("#cs-msn-demo").click();
    assert.equal(await page.locator(".cs-slot").count(), 2);
    await page.locator('.cs-slot [data-msn="paste"][data-box="A"]').first().click();
    assert.match(await page.locator("[data-msn-answer]").first().inputValue(), /고객님/);
    await page.locator('.cs-slot [data-msn="close"]').first().click();
    assert.equal(await page.locator(".cs-slot").count(), 1);
    assert.equal(await page.locator(".cs-slot button", { hasText: "↵ 보내기" }).isDisabled(), true);
    await page.screenshot({ path: path.join(output, "cs-board-messenger.png") });

    // 좁은 화면(휴대폰)에서도 가로로 넘치지 않음
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-right-tab="board"]').click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `no horizontal overflow on phone (${overflow})`);
    await page.screenshot({ path: path.join(output, "cs-board-phone.png") });
    await context.close();
  }

  // ---------- 2) 가짜 시트 연결 ----------
  {
    const gas = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN, COLLECTOR_TOKEN: COLLECTOR, CLAUDE_KEY: "test-key" }, claude: () => ({ status: 200, text: JSON.stringify(["AI가 만든 답 1", "AI가 만든 답 2"]) }) });
    gas.post({
      action: "ingest", token: COLLECTOR, rows: [
        { 업체: "지그재그", 게시판: "주문문의", id: "z1", 날짜: "2026-10-29 10:00", 상품명: "가상 상품 A", 문의: "바 변경 되나요?", 답변안: ["안 1", "안 2", "안 3"] },
        { 업체: "메이크샵", 게시판: "Q&A", id: "m1", 날짜: "2026-10-29 09:00", 상품명: "가상 상품 B", 문의: "불량인가요?" },
      ],
    });
    const requests = [];
    const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, serviceWorkers: "block", permissions: ["clipboard-read", "clipboard-write"] });
    await context.addInitScript(([key, token]) => localStorage.setItem(key, JSON.stringify({ token, editor: "시험" })), ["system_v3_cs_board", TOKEN]);
    // 나중에 등록한 route 가 먼저 처리됨 → 막는 규칙을 먼저 등록
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      return url.origin === origin ? route.continue() : route.abort("blockedbyclient");
    });
    const domain = await readFile(path.join(root, "src/domain/csBoard.mjs"), "utf8");
    await context.route("**/src/domain/csBoard.mjs*", (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: domain.replace('export const CS_BOARD_ENDPOINT = "";', `export const CS_BOARD_ENDPOINT = "${ENDPOINT}";`) }));
    await context.route(`${ENDPOINT}*`, async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      requests.push(body);
      assert.equal(route.request().headers()["content-type"], "text/plain;charset=utf-8", "no preflight");
      const result = gas.post(body);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(result), headers: { "Access-Control-Allow-Origin": "*" } });
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.goto(`${origin}/cs/board/`);
    await page.locator("#cs-board-list [data-card]").first().waitFor();
    assert.equal(await page.locator("#cs-connection").textContent(), "연결됨 · 2건");
    assert.equal(requests[0].action, "list");
    assert.equal(requests[0].token, TOKEN);
    assert.equal(await page.locator("#cs-sample-banner").isVisible(), false);

    const zig = page.locator('[data-card="지그재그_주문문의_z1"]');
    await zig.locator('[data-act="pick"][data-box="0"]').click();
    await zig.locator("textarea").first().fill("안 1 (고침)");
    await page.waitForFunction(() => /자동 저장됨/.test(document.querySelector("#cs-summary").textContent));
    const saved = gas.post({ action: "list", token: TOKEN }).rows.find((r) => r.key === "지그재그_주문문의_z1");
    assert.equal(saved.choice.pick, 0);
    assert.equal(saved.choice.edits[0], "안 1 (고침)");
    assert.equal(saved.editor, "시험");
    assert.ok(requests.filter((r) => r.action === "save").length <= 2, "typing is batched (0.8s)");

    // 다른 사람이 먼저 바꾼 경우 → 덮어쓰지 않고 새 내용으로
    gas.post({ action: "save", token: TOKEN, key: "지그재그_주문문의_z1", baseVersion: saved.version, choice: { pick: 2 }, editor: "다른 사람" });
    await zig.locator('[data-act="hold"]').check();
    await page.locator("#cs-toast", { hasText: "다른 사람이 먼저" }).waitFor();
    assert.equal(await page.locator('[data-card="지그재그_주문문의_z1"] .cs-card-result').textContent(), "채택 A", "shows the other person's pick (안 3 in box A)");
    assert.equal(gas.post({ action: "list", token: TOKEN }).rows.find((r) => r.key === "지그재그_주문문의_z1").choice.pick, 2, "sheet keeps the other person's choice");

    // AI 추천: 답변안 없는 문의
    const make = page.locator('[data-card="메이크샵_Q&A_m1"]');
    assert.match(await make.locator(".cs-answer-empty").textContent(), /추천 문안이 없습니다/);
    await make.locator('[data-act="ai"]').click();
    await page.locator('[data-card="메이크샵_Q&A_m1"] textarea').first().waitFor();
    assert.equal(await page.locator('[data-card="메이크샵_Q&A_m1"] textarea').first().inputValue(), "AI가 만든 답 1");
    assert.equal(await page.locator('[data-card="메이크샵_Q&A_m1"] .cs-draft-from').first().textContent(), "AI");
    assert.equal(gas.calls.length, 1);

    // 복사
    await page.locator('[data-card="메이크샵_Q&A_m1"] [data-act="pick"][data-box="1"]').click();
    await page.locator('[data-card="메이크샵_Q&A_m1"] [data-act="copy"]').click();
    await page.locator("#cs-toast", { hasText: "복사" }).waitFor();
    await page.waitForFunction(() => /자동 저장됨/.test(document.querySelector("#cs-summary").textContent));
    await page.screenshot({ path: path.join(output, "cs-board-connected.png") });

    // 틀린 비밀번호 → 저장된 비밀번호 지움
    await page.locator('[data-left-tab="settings"]').click();
    await page.locator("#cs-token-input").fill("wrong-token-1");
    await page.locator("#cs-token-save").click();
    await page.locator("#cs-toast", { hasText: "비밀번호가 맞지 않습니다" }).waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("system_v3_cs_board") || "{}").token || ""), "");
    assert.equal(await page.locator("#cs-connection").textContent(), "비밀번호 필요");
    await context.close();
  }

  assert.deepEqual(pageErrors, []);
  console.log("csBoard.browser.test: OK");
} finally {
  await browser?.close();
  server.close();
}
