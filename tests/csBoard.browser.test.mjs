// CS 자동화 화면 브라우저 시험 (게이트 밖 — CS 화면을 건드리면 따로 실행)
// 1) 시트 연결 전: 가상셋팅·빨간 미작동 버튼·상단 버튼 위치  2) 가짜 시트 연결: 고르기·자동 저장·AI 추천·충돌
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { loadCsBoardScript } from "./helpers/csBoardFakeSheet.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "outputs/ui-qa/cs-board");
const TYPES = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json" };
const ENDPOINT = "https://script.google.com/macros/s/TEST_CS_BOARD/exec";
const TOKEN = "board-token-123";
const COLLECTOR = "collector-token-456";
// 시험에서는 실제 시트 대신 가짜 주소(또는 빈 주소 = 시트 연결 전)로 바꿔서 띄움
const withEndpoint = (source, url) => source.replace(/export const CS_BOARD_ENDPOINT = "[^"]*";/, `export const CS_BOARD_ENDPOINT = "${url}";`);

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
    const domainSource = await readFile(path.join(root, "src/domain/csBoard.mjs"), "utf8");
    await context.route("**/src/domain/csBoard.mjs*", (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: withEndpoint(domainSource, "") }));
    const page = await context.newPage();
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.goto(`${origin}/cs/`);
    await page.locator("#cs-board-list [data-card]").first().waitFor();
    assert.equal(await page.locator("#cs-connection").textContent(), "🧪 가상셋팅");
    assert.equal(await page.locator("#cs-board-list [data-card]").count(), 4);
    assert.equal(await page.locator("#cs-sample-banner").isVisible(), true);

    // 상단 버튼: 다른 화면과 같은 자리·같은 크기, CS 관리가 현재 메뉴
    const boxes = await page.locator(".workspace-navigation .workspace-link").evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; }));
    assert.deepEqual(boxes.map((b) => [b[2], b[3]]), [[80, 32], [80, 32], [80, 32]]);
    assert.ok(Math.abs(boxes[0][0] - 288) <= 1 && Math.abs(boxes[0][1] - 19) <= 1, `nav spot ${boxes[0]}`);
    assert.equal(await page.locator("#workspace-cs-link").evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(190, 24, 93)");
    assert.equal(await page.locator("#workspace-picking-link").getAttribute("href"), "../");
    assert.equal(await page.locator("#workspace-purchase-link").getAttribute("href"), "../purchase/");
    assert.equal(await page.locator(".cs-legacy-link").getAttribute("href"), "./legacy.html");

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

  // ---------- 1-2) 실제 시트 주소 + 비밀번호 없음 → 비밀번호 안내, 시트에 요청 안 보냄 ----------
  {
    const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, serviceWorkers: "block" });
    const outside = [];
    await context.route("**/*", (route) => { const u = new URL(route.request().url()); if (u.origin === origin) return route.continue(); outside.push(u.href); return route.abort("blockedbyclient"); });
    const page = await context.newPage();
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.goto(`${origin}/cs/`);
    await page.locator("#cs-board-list .cs-empty").waitFor();
    assert.match(await page.locator("#cs-board-list").textContent(), /\[설정\] 탭에서 비밀번호/);
    assert.equal(await page.locator("#cs-connection").textContent(), "비밀번호 필요");
    await page.locator('[data-left-tab="settings"]').click();
    assert.equal(await page.locator("#cs-token-input").isDisabled(), false, "password box usable");
    assert.match(await page.locator("#cs-endpoint-note").textContent(), /등록됨/);
    assert.deepEqual(outside.filter((u) => u.includes("script.google.com")), [], "no sheet call without a password");
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
      autoSuggest: false,
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
    await context.route("**/src/domain/csBoard.mjs*", (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: withEndpoint(domain, ENDPOINT) }));
    await context.route(`${ENDPOINT}*`, async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      requests.push(body);
      assert.equal(route.request().headers()["content-type"], "text/plain;charset=utf-8", "no preflight");
      const result = gas.post(body);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(result), headers: { "Access-Control-Allow-Origin": "*" } });
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.goto(`${origin}/cs/`);
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

    // ---------- 수집기 PC 연결 ----------
    const reload = async () => { await page.locator("#cs-reload").click(); await page.waitForFunction(() => !/불러오는 중/.test(document.body.textContent)); };
    assert.match(await page.locator("#cs-collector").textContent(), /수집기 PC ○/, "no signal yet");
    assert.match(await page.locator("#cs-jobs").textContent(), /○ 꺼짐[\s\S]*자동으로 같이 켜짐/);
    gas.post({ action: "poll", token: COLLECTOR, pc: "OFFICE-PC", version: "9.1 / 연결 1.0", busy: true }); // 연결 프로그램 신호
    await reload();
    await page.waitForFunction(() => /수집기 PC ●/.test(document.querySelector("#cs-collector").textContent));
    const collectButton = page.locator('[data-left-panel="main"] [data-job="collect"]');
    assert.equal(await collectButton.isDisabled(), false, "unlocked once connected");
    assert.notEqual(await collectButton.evaluate((el) => getComputedStyle(el).color), "rgb(220, 38, 38)");
    assert.equal(await page.locator('[data-left-panel="main"] button', { hasText: "🔑 로그인" }).isDisabled(), false, "login works from V3 now");
    // 업체 끄기 → 요청에 반영
    await page.locator('#cs-vendor-grid [data-vendor="메이크샵"] strong').click();
    assert.equal(await page.locator('#cs-vendor-grid [data-vendor="메이크샵"]').evaluate((el) => el.classList.contains("is-off")), true);
    await collectButton.click();
    await page.locator("#cs-toast", { hasText: "게시판 수집 요청을 보냈습니다" }).waitFor();
    const sentRequest = requests.filter((r) => r.action === "request").at(-1);
    assert.deepEqual(sentRequest.options.vendors, ["스마트스토어", "지그재그", "에이블리"]);
    assert.match(await page.locator("#cs-jobs").textContent(), /대기[\s\S]*게시판 수집/);
    // 수집기 PC가 가져가 실행 → 결과 올림 → 끝
    const collectJob = gas.post({ action: "poll", token: COLLECTOR, pc: "OFFICE-PC" }).job;
    assert.equal(collectJob.kind, "collect");
    gas.post({ action: "ingest", token: COLLECTOR, autoSuggest: false, rows: [
      { 업체: "지그재그", 게시판: "주문문의", id: "z1", 날짜: "2026-10-29 10:00", 상품명: "가상 상품 A", 문의: "바 변경 되나요?" },
      { 업체: "메이크샵", 게시판: "Q&A", id: "m1", 날짜: "2026-10-29 09:00", 상품명: "가상 상품 B", 문의: "불량인가요?" },
      { 업체: "스마트스토어", 게시판: "상품문의", id: "s1", 날짜: "2026-10-29 11:00", 상품명: "가상 상품 C", 문의: "언제 와요?", 답변안: ["내일 출고됩니다", "확인 후 안내드릴게요"] },
    ], snapshot: { kind: "문의", vendors: { 스마트스토어: { 상태: "ok", 건수: 1 }, 지그재그: { 상태: "ok", 건수: 1 }, 에이블리: { 상태: "로그인 필요", 건수: 0, 메모: "다시 로그인" } }, days: 7, collectedAt: "2026-10-29 12:00" } });
    gas.post({ action: "finish", token: COLLECTOR, id: collectJob.id, ok: true, message: "수집_261029_1200.json · 3건", count: 3 });
    await reload();
    await page.locator('[data-card="스마트스토어_상품문의_s1"]').waitFor();
    assert.match(await page.locator("#cs-jobs").textContent(), /완료[\s\S]*수집_261029_1200\.json/);
    assert.match(await page.locator('[data-vendor-status="에이블리"]').textContent(), /로그인 필요/);
    assert.match(await page.locator('[data-left-panel="main"] [data-log="warn"]').textContent(), /에이블리: 로그인 필요[\s\S]*\[🔑 로그인\]/);
    await page.screenshot({ path: path.join(output, "cs-board-collector.png") });

    // 📤 등록: 채택한 스마트스토어 문의만 자동, 나머지는 직접 등록 안내
    const ss = page.locator('[data-card="스마트스토어_상품문의_s1"]');
    await ss.locator('[data-act="pick"][data-box="0"]').click();
    await page.waitForFunction(() => /자동 저장됨/.test(document.querySelector("#cs-summary").textContent) && !/저장 중|저장 대기/.test(document.body.textContent));
    await page.locator("#cs-register-open").click();
    await page.locator("#cs-modal:not([hidden])").waitFor();
    assert.match(await page.locator("#cs-modal-body").textContent(), /자동 등록 1건[\s\S]*직접 등록 2건/);
    assert.equal(await page.locator("#cs-modal-ok").textContent(), "1건 등록 요청");
    await page.screenshot({ path: path.join(output, "cs-board-register.png") });
    await page.locator("#cs-modal-ok").click();
    await page.locator("#cs-toast", { hasText: "등록 요청 1건" }).waitFor();
    await page.locator('[data-card="스마트스토어_상품문의_s1"] .cs-reg-badge', { hasText: "등록 요청됨" }).waitFor();
    assert.equal(await page.locator('[data-card="스마트스토어_상품문의_s1"] [data-act="pick"]').first().isDisabled(), true, "locked while registering");
    const regJob = gas.post({ action: "poll", token: COLLECTOR, pc: "OFFICE-PC" }).job;
    assert.deepEqual(regJob.body.items.map((i) => [i.key, i.text]), [["스마트스토어_상품문의_s1", "내일 출고됩니다"]]);
    gas.post({ action: "finish", token: COLLECTOR, id: regJob.id, ok: true, message: "등록 1건", results: [{ key: "스마트스토어_상품문의_s1", state: "등록완료" }] });
    await reload();
    await page.locator('[data-card="스마트스토어_상품문의_s1"] .cs-reg-badge', { hasText: "등록완료" }).waitFor();

    // ⭐ 리뷰: 시트의 실제 리뷰 (새 리뷰는 AI 답변안이 미리 달림)
    gas.post({ action: "ingest", token: COLLECTOR, rows: [{ 업체: "지그재그", 게시판: "리뷰", id: "r1", 날짜: "2026-10-29 08:00", 상품명: "가상 상품 A", 별점: 5, 내용: "예뻐요" }], snapshot: { kind: "리뷰", vendors: { 지그재그: { 상태: "ok" } }, days: 30, collectedAt: "2026-10-29 12:30" } });
    await reload();
    await page.locator('[data-right-tab="review"]').click();
    assert.equal(await page.locator("#cs-review-banner").isVisible(), false);
    const rv = page.locator('#cs-review-list [data-card="지그재그_리뷰_r1"]');
    await rv.waitFor();
    assert.equal(await rv.locator("textarea").first().inputValue(), "AI가 만든 답 1");
    await rv.locator('[data-act="pick"][data-box="1"]').click();
    await page.waitForFunction(() => /채택 1/.test(document.querySelector("#cs-review-summary").textContent) && /자동 저장됨/.test(document.querySelector("#cs-review-summary").textContent));
    assert.equal(gas.post({ action: "list", token: TOKEN }).rows.find((r) => r.key === "지그재그_리뷰_r1").choice.pick, 1);
    assert.equal(await page.locator('[data-right-panel="review"] [data-job="reviews"]').isDisabled(), false);
    assert.equal(await page.locator('[data-right-panel="review"] button', { hasText: "업로드" }).isDisabled(), true, "review posting stays red");
    await page.screenshot({ path: path.join(output, "cs-board-review-live.png") });
    await page.locator('[data-right-tab="board"]').click();

    // AI 사용량
    await page.locator('[data-left-tab="settings"]').click();
    await page.waitForFunction(() => /AI 추천 \d+회/.test(document.querySelector("#cs-usage-sum").textContent));
    assert.match(await page.locator("#cs-usage-sum").textContent(), /AI 추천 2회/);

    // 🚀 처음 설정 안내: 수집기 PC(연결 1.2)가 알려 준 상태로 ✅/⬜, 수집기 설정 칸에 현재 값
    assert.match(await page.locator("#cs-guide-progress").textContent(), /\d\/9 완료/);
    gas.post({ action: "poll", token: COLLECTOR, pc: "OFFICE-PC", version: "9.4 / 연결 1.2 · 창 없이", setup: {
      dir: "C:\\Users\\M\\내 드라이브\\V_회계\\2_CS_게시판_정리\\G1_CS수집기", out_dir: "C:\\Users\\M\\수집", days: 7, zz_slug: "pink-rocket", show_browser: true,
      vendors: ["스마트스토어", "지그재그"], login_ok: true, api: "own", claude: false, parts: true, icon: false, autostart: false, bg: false, link: "1.2 (2026-10-29)",
    } });
    await reload();
    await page.waitForFunction(() => document.querySelector("#cs-set-slug").value === "pink-rocket", null, { timeout: 5000 }).catch(async () => {
      throw new Error("settings not filled: " + (await page.locator("#cs-set-note").textContent()) + " / " + JSON.stringify(gas.post({ action: "list", token: TOKEN }).collector).slice(0, 300));
    });
    assert.equal(await page.locator("#cs-set-browser").isChecked(), true);
    assert.match(await page.locator("#cs-set-note").textContent(), /OFFICE-PC[\s\S]*스마트스토어·지그재그/);
    await page.locator("#cs-onetouch").click();
    await page.locator("#cs-guide:not([hidden])").waitFor();
    assert.equal(await page.locator(".cs-guide-step.is-focus").getAttribute("data-guide-step"), "auto", "one-touch jumps to the first unfinished step");
    assert.equal(await page.locator('[data-guide-step="parts"] .cs-guide-mark').textContent(), "✅");
    assert.equal(await page.locator('[data-guide-step="login"] .cs-guide-mark').textContent(), "⬜", "에이블리 needed a login in the last collection");
    assert.match(await page.locator('[data-guide-step="startup"]').textContent(), /검은 창으로 도는 중 · 자동시작 없음/);
    await page.locator('[data-guide-step="startup"] [data-guide-copy]').click();
    await page.locator("#cs-toast", { hasText: "Win+R" }).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '"C:\\Users\\M\\내 드라이브\\V_회계\\2_CS_게시판_정리\\G1_CS수집기\\G1웹연결_백그라운드_등록.bat"');
    await page.screenshot({ path: path.join(output, "cs-board-setup-guide.png") });
    await page.locator('.cs-guide-foot [data-guide-act="close"]').click();
    assert.equal(await page.locator("#cs-guide").isHidden(), true);

    // ---------- 빨간 메뉴 → V3 에서 (수집기 창 없이) ----------
    const pair = await crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
    const pubN = (await crypto.subtle.exportKey("jwk", pair.publicKey)).n;
    const unlock = async (v) => new TextDecoder().decode(await crypto.subtle.decrypt({ name: "RSA-OAEP" }, pair.privateKey, Buffer.from(v, "base64url")));
    const pollSetup = (extra = {}) => gas.post({ action: "poll", token: COLLECTOR, pc: "OFFICE-PC", version: "9.4 / 연결 1.3 · 창 없이", busy: true, setup: {
      dir: "C:\\x\\G1_CS수집기", out_dir: "C:\\x\\수집", days: 7, review_days: 30, zz_slug: "pink-rocket", show_browser: false, vendors: ["스마트스토어", "지그재그", "에이블리", "메이크샵"],
      login_ok: false, api: "e1", parts: true, icon: true, autostart: true, bg: true, link: "1.3", pub_key: pubN, saved_logins: ["지그재그"], auto_on: false, auto_start: "09:30", interval: 60, ...extra,
    } });
    const waitText = (selector, re) => page.waitForFunction(([sel, src]) => new RegExp(src).test(document.querySelector(sel)?.textContent || ""), [selector, re.source], { timeout: 8000 });
    const lastRequest = (kind) => requests.filter((r) => r.action === "request" && r.kind === kind).at(-1);
    pollSetup();
    await reload();
    await page.locator('[data-left-tab="main"]').click();
    // 🔑 로그인: 지난 수집에서 로그인 필요였던 에이블리가 미리 골라짐 → 새 비밀번호는 잠가서
    const loginBtn = page.locator('[data-left-panel="main"] [data-pc="login"]').first();
    assert.equal(await loginBtn.isDisabled(), false, "login is no longer red");
    await loginBtn.click();
    await page.locator("#cs-login:not([hidden])").waitFor();
    assert.equal(await page.locator('[data-login-pick][value="에이블리"]').isChecked(), true);
    assert.equal(await page.locator('[data-login-pick][value="지그재그"]').isChecked(), false);
    assert.match(await page.locator('[data-login-row="지그재그"]').textContent(), /PC에 저장된 비밀번호 ✓/);
    const ablyRow = page.locator('[data-login-row="에이블리"]');
    await ablyRow.locator("[data-login-id]").fill("pink_ably");
    await ablyRow.locator("[data-login-pw]").fill("Secret!234");
    await page.locator('[data-login-pick][value="지그재그"]').check();
    await page.locator("#cs-login-collect").check();
    await page.screenshot({ path: path.join(output, "cs-board-login.png") });
    await page.locator("#cs-login-ok").click();
    await page.locator("#cs-toast", { hasText: "로그인 요청을 보냈습니다" }).waitFor();
    assert.equal(await page.locator("#cs-login").isHidden(), true);
    const loginReq = lastRequest("login");
    assert.deepEqual(loginReq.options.vendors, ["지그재그", "에이블리"]);
    assert.equal(loginReq.options.collectAfter, true);
    assert.deepEqual(Object.keys(loginReq.options.creds), ["에이블리"], "only the vendor with a new password");
    assert.equal(JSON.stringify(requests).includes("Secret!234"), false, "the password never leaves the browser in plain text");
    assert.equal(await unlock(loginReq.options.creds["에이블리"].pw), "Secret!234", "only the collector PC key opens it");
    assert.equal(await unlock(loginReq.options.creds["에이블리"].id), "pink_ably");
    await loginBtn.click();
    assert.equal(await page.locator('[data-login-row="에이블리"] [data-login-pw]').inputValue(), "", "typed password is not kept on screen");
    await page.locator("#cs-login-cancel").click();
    const lj = gas.post({ action: "poll", token: COLLECTOR, pc: "OFFICE-PC" }).job;
    assert.equal(lj.kind, "login");
    gas.post({ action: "progress", token: COLLECTOR, id: lj.id, message: "에이블리: 휴대폰 2단계 인증이면 휴대폰에서 [확인]을 눌러 주세요" });
    await reload();
    await waitText("#cs-jobs", /실행중[\s\S]*🔑 로그인[\s\S]*휴대폰에서 \[확인\]/);
    gas.post({ action: "finish", token: COLLECTOR, id: lj.id, ok: true, message: "지그재그 ✓ · 에이블리 ✓", data: { login: { 지그재그: { state: "ok" }, 에이블리: { state: "ok" } } } });

    // 자동 수집 켜기 (수집기 PC 웹연결이 실행)
    await page.locator("#cs-auto-hour").selectOption("10");
    await page.locator("#cs-auto-minute").selectOption("00");
    await page.locator("#cs-auto-interval").selectOption("30");
    await page.locator("#cs-auto-toggle").click();
    await page.locator("#cs-toast", { hasText: "자동 수집 켜기 요청" }).waitFor();
    assert.deepEqual(lastRequest("settings").options.settings, { auto_on: true, auto_start: "10:00", interval: 30 });
    const sj = gas.post({ action: "poll", token: COLLECTOR, pc: "OFFICE-PC" }).job;
    gas.post({ action: "finish", token: COLLECTOR, id: sj.id, ok: true, message: "저장: 자동 수집, 자동 시작 시각, 간격" });
    pollSetup({ auto_on: true, auto_start: "10:00", interval: 30, next_auto: "10-30 10:00" });
    await reload();
    await waitText("#cs-auto-note", /켜짐 · 다음 수집 10-30 10:00/);
    assert.equal(await page.locator("#cs-auto-toggle").textContent(), "자동 수집 끄기");

    // 📂 수집 파일 목록
    await page.locator('[data-pc="files"]').click();
    await page.locator("#cs-toast", { hasText: "수집 파일 목록 요청" }).waitFor();
    const fj = gas.post({ action: "poll", token: COLLECTOR, pc: "OFFICE-PC" }).job;
    gas.post({ action: "finish", token: COLLECTOR, id: fj.id, ok: true, message: "C:\\x\\수집 · 최근 1개", data: { files: [{ name: "수집_261029_1200.json", size: 4096, at: "2026-10-29 12:00" }] } });
    await reload();
    await waitText("#cs-files", /수집_261029_1200\.json[\s\S]*4KB/);

    // 스마트스토어 API: 카드 [API 설정] → API 탭, 키는 잠가서
    await page.locator('#cs-vendor-grid [data-pc="api-tab"]').click();
    assert.equal(await page.locator('[data-left-panel="api"]').isVisible(), true);
    assert.match(await page.locator("#cs-api-state").textContent(), /E_1/);
    await page.locator("#cs-api-id").fill("my-client-id");
    await page.locator("#cs-api-secret").fill("$2a$04$my-secret");
    await page.locator('[data-left-panel="api"] [data-pc="apiKey"]').click();
    await page.locator("#cs-toast", { hasText: "API 키를 잠가서 보냈습니다" }).waitFor();
    const ak = lastRequest("apiKey");
    assert.equal(await unlock(ak.options.secret), "$2a$04$my-secret");
    assert.equal(JSON.stringify(requests).includes("my-secret"), false);
    assert.equal(await page.locator("#cs-api-secret").inputValue(), "");
    const akJob = gas.post({ action: "poll", token: COLLECTOR, pc: "OFFICE-PC" }).job;
    assert.equal(akJob.body.secret, ak.options.secret);
    gas.post({ action: "finish", token: COLLECTOR, id: akJob.id, ok: true, message: "API 키 저장 · ✅ 연결 성공 (수집기 API 키)" });
    await page.locator('[data-left-panel="api"] [data-pc="ip"]').click();
    const ipJob = gas.post({ action: "poll", token: COLLECTOR, pc: "OFFICE-PC" }).job;
    gas.post({ action: "finish", token: COLLECTOR, id: ipJob.id, ok: true, message: "이 PC 공인 IP: 1.2.3.4", data: { ip: "1.2.3.4" } });
    await reload();
    await waitText("#cs-api-result", /1\.2\.3\.4/);
    await page.screenshot({ path: path.join(output, "cs-board-api.png") });

    // 설정 저장
    await page.locator('[data-left-tab="settings"]').click();
    await page.locator("#cs-set-days").fill("14");
    await page.locator("#cs-set-save").click();
    await page.locator("#cs-toast", { hasText: "설정 저장 요청" }).waitFor();
    assert.equal(lastRequest("settings").options.settings.days, 14);
    assert.equal(lastRequest("settings").options.settings.zz_slug, "pink-rocket");
    const setJob = gas.post({ action: "poll", token: COLLECTOR, pc: "OFFICE-PC" }).job;
    gas.post({ action: "finish", token: COLLECTOR, id: setJob.id, ok: true, message: "저장: 수집 기간" });

    // 엑셀 내려받기 → 고쳐서 📥 엑셀 적용
    let xlsxPath = "";
    try { xlsxPath = createRequire("/tmp/claude-0/scan/").resolve("xlsx/dist/xlsx.full.min.js"); } catch { xlsxPath = ""; }
    if (xlsxPath) {
      await context.route("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js", async (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: await readFile(xlsxPath, "utf8") }));
      await page.locator('[data-right-tab="board"]').click();
      const [download] = await Promise.all([page.waitForEvent("download"), page.locator('[data-right-panel="board"] [data-excel="export"]').click()]);
      // 시험용 헤드리스 크롬은 한글 파일 이름을 "download" 로 보고함 (실제 크롬은 그대로)
      assert.match(download.suggestedFilename(), /^(CS_게시판_답변안_\d{6}_\d{4}\.xlsx|download)$/);
      const XLSX = createRequire("/tmp/claude-0/scan/")("xlsx");
      const wb = XLSX.read(await readFile(await download.path()));
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
      const head = aoa[0];
      const zigLine = aoa.find((r) => r[head.indexOf("키 (고치지 마세요)")] === "지그재그_주문문의_z1");
      zigLine[head.indexOf("채택")] = "B";
      zigLine[head.indexOf("최종 문안")] = "엑셀에서 고친 답변";
      const edited = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(edited, XLSX.utils.aoa_to_sheet(aoa), "게시판");
      const editedFile = path.join(output, "cs-excel-edited.xlsx");
      XLSX.writeFile(edited, editedFile);
      page.once("dialog", (d) => d.accept());
      const chooser = page.waitForEvent("filechooser");
      await page.locator('[data-right-panel="board"] [data-excel="import"]').click();
      await (await chooser).setFiles(editedFile);
      await page.locator("#cs-toast", { hasText: "엑셀 1건을 적용" }).waitFor();
      await page.waitForFunction(() => /자동 저장됨/.test(document.querySelector("#cs-summary").textContent) && !/저장 중|저장 대기/.test(document.body.textContent));
      const zigSaved = gas.post({ action: "list", token: TOKEN }).rows.find((r) => r.key === "지그재그_주문문의_z1");
      assert.equal(zigSaved.choice.pick, 1);
      assert.equal(zigSaved.choice.edits[1], "엑셀에서 고친 답변");
    } else {
      console.log("  (엑셀 시험 건너뜀 — 이 PC에 xlsx 부품 없음)");
    }
    const stillRed = await page.locator("button.is-pending").evaluateAll((els) => els.map((el) => el.textContent.trim()));
    assert.deepEqual(stillRed.filter((t) => !t.startsWith("⬆ 업데이트")).sort(), ["감시 시작", "업로드"].sort(), "only messenger watch and review upload stay red (update waits for a newer version)");

    // ⬆ 웹연결 업데이트: 저장소 main 최신 커밋 파일 → 확인값 → 수집기 PC에 요청
    const fakeCommit = "d".repeat(40);
    const fakeLink = 'LINK_VER = "9.9 (2099-01-01)"\nprint("hi")\n';
    await context.route("https://api.github.com/repos/w-works-official/Picking_System/commits/main", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sha: fakeCommit }), headers: { "Access-Control-Allow-Origin": "*" } }));
    await context.route(`https://raw.githubusercontent.com/w-works-official/Picking_System/${fakeCommit}/docs/g1_v3_link.py`, (route) => route.fulfill({ status: 200, contentType: "text/plain", body: fakeLink, headers: { "Access-Control-Allow-Origin": "*" } }));
    await page.locator('[data-left-tab="settings"]').click();
    await page.locator("#cs-update-check").click();
    await waitText("#cs-update-state", /수집기 PC 버전: 1\.3 · 최신: 9\.9 \(ddddddd[\s\S]*새 버전 있음/);
    assert.equal(await page.locator("#cs-update-run").isDisabled(), false);
    assert.match(await page.locator("#cs-update-run").textContent(), /1\.3 → 9\.9/);
    await page.locator("#cs-update-run").click();
    await page.locator("#cs-toast", { hasText: "업데이트 요청을 보냈습니다" }).waitFor();
    const upReq = lastRequest("update");
    const { createHash } = await import("node:crypto");
    assert.equal(upReq.options.sha256, createHash("sha256").update(fakeLink).digest("hex"));
    assert.equal(upReq.options.url, `https://raw.githubusercontent.com/w-works-official/Picking_System/${fakeCommit}/docs/g1_v3_link.py`);
    const upJob = gas.post({ action: "poll", token: COLLECTOR, pc: "OFFICE-PC" }).job;
    assert.equal(upJob.kind, "update");
    gas.post({ action: "finish", token: COLLECTOR, id: upJob.id, ok: true, message: "1.3 → 9.9 바꿈 · 30초 안에 새 버전으로 다시 켜짐" });
    pollSetup({ link: "9.9 (2099-01-01)" });
    await reload();
    await waitText("#cs-update-state", /수집기 PC 버전: 9\.9[\s\S]*최신입니다/);
    assert.equal(await page.locator("#cs-update-run").isDisabled(), true);
    await page.screenshot({ path: path.join(output, "cs-board-update.png") });

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
