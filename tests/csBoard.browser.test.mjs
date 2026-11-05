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
    // 2026-11-05: 수집기 PC 웹연결 1.10 메신저 창 도우미 (127.0.0.1:47811) 흉내
    const helperCalls = [];
    await context.route("http://127.0.0.1:47811/**", (route) => {
      const req = route.request();
      const p = new URL(req.url()).pathname;
      helperCalls.push({ path: p, method: req.method(), body: req.postData() ? JSON.parse(req.postData()) : null });
      const body = p === "/msn/ping" ? { ok: true, ver: "1.10 (2026-11-05)", slots: 3, windows: 2, managed: 0 } : p === "/msn/arrange" ? { ok: true, placed: 2, windows: 2, slots: 3 } : p === "/msn/release" ? { ok: true, released: 2 } : p === "/msn/send" ? { ok: true, slot: 0 } : p === "/msn/windows" ? { ok: true, windows: [{ exe: "nateonmain.exe", title: "김대리", w: 420, h: 600, tool: true, min: false, ok: true }] } : { ok: true, slots: 3, managed: 0 };
      return route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": origin }, body: JSON.stringify(body) });
    });
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

    // 미작동 버튼: 모두 disabled, 흐린 회색(2026-11-03 빨간 점선 뺌), 이유 표시
    const pending = await page.locator("button.is-pending").evaluateAll((els) => els.map((el) => ({ disabled: el.disabled, color: getComputedStyle(el).color, title: el.title, text: el.textContent.trim() })));
    assert.ok(pending.length >= 20);
    for (const b of pending) {
      assert.equal(b.disabled, true, `${b.text} disabled`);
      assert.equal(b.color, "rgb(156, 163, 175)", `${b.text} grey`);
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
    // 2026-11-04: 오른쪽은 탭이 아니라 제목 — 왼쪽 탭이 메뉴 이동
    assert.equal(await page.locator("[data-right-tab]").count(), 0, "오른쪽 탭 없음");
    assert.equal(await page.locator('[data-left-tab="api"]').count(), 0, "API 는 설정 안으로");
    assert.equal(await page.locator('[data-left-panel="settings"] #cs-api-box').count(), 1);
    await page.locator('[data-left-tab="review"]').click();
    assert.equal(await page.locator("[data-right-title]").textContent(), "⭐ 리뷰 답글");
    assert.equal(await page.locator('[data-right-panel="review"]').isVisible(), true);
    assert.equal(await page.locator("#cs-review-list [data-card]").count(), 2);
    assert.equal(await page.locator('#cs-review-list [data-act="pick"]').first().isDisabled(), true);
    await page.screenshot({ path: path.join(output, "cs-board-review.png") });
    await page.locator('[data-left-tab="msn"]').click();
    assert.equal(await page.locator("[data-right-title]").textContent(), "💬 메신저 답변");
    // 🪄 창 도우미: 메신저 탭을 열면 연결 확인 → 슬롯 화면 위치를 보냄 → [📐 일괄 붙이기]
    await page.locator("[data-msn-helper].is-on").waitFor({ timeout: 8000 });
    assert.equal(await page.locator("[data-msn-cta]").isHidden(), true, "연결되면 연결 안내 숨김");
    for (let i = 0; i < 40 && !helperCalls.some((c) => c.path === "/msn/slots"); i += 1) await page.waitForTimeout(200);
    const slotPost = helperCalls.find((c) => c.path === "/msn/slots");
    assert.ok(slotPost, "슬롯 위치를 도우미에 보냄");
    assert.equal(slotPost.body.slots.length, 3, "슬롯 3칸");
    assert.ok(slotPost.body.slots.every((r) => r.w >= 120 && r.h >= 120 && Number.isFinite(r.x)), JSON.stringify(slotPost.body.slots));
    assert.ok(slotPost.body.slots[1].x > slotPost.body.slots[0].x, "슬롯은 왼쪽부터");
    await page.locator('[data-msn-act="arrange"]').click();
    await page.locator("[data-msn-msg]", { hasText: "대화창 2개를 슬롯에 같은 크기로" }).waitFor();
    assert.ok(helperCalls.some((c) => c.path === "/msn/arrange" && c.method === "POST"));
    // 11-05 오후: 놓아주기 없음 · 순서 = 화면 연결 / 영역 맞춤 / 일괄 붙이기 → 크기 고르기 → 오른쪽 끝에 연결 상태
    assert.equal(await page.locator('[data-msn-act="release"]').count(), 0, "놓아주기 버튼 없음");
    assert.deepEqual((await page.locator('[data-msn-panel] .cs-answer-top > button, [data-msn-panel] .cs-answer-top > span').evaluateAll((els) => els.map((e) => e.dataset.msnAct || e.className.trim()))), ["connect", "fit", "arrange", "msn-size", "cs-flex", "msn-conn", "helper"]);
    assert.equal((await page.locator("[data-msn-helper]").textContent()).trim(), "🪄 창 도우미 ● 연결됨", "붙은 창 수 표시 없음");
    assert.equal(await page.locator("[data-msn-count]").evaluate((el) => getComputedStyle(el).fontSize), "16px", "크기 고르기 30% 크게");
    // 11-05: Enter = 붙은 대화창에 붙여넣기 + Enter (커서는 그 칸에) · Shift+Enter 줄바꿈 · Tab / Tab+숫자 = 다른 슬롯
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
    const ta0 = page.locator('[data-msn-text="0"]');
    await ta0.click();
    await page.keyboard.type("안녕하세요");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("확인했습니다");
    assert.equal(await ta0.inputValue(), "안녕하세요\n확인했습니다", "Shift+Enter 는 줄바꿈");
    await page.keyboard.press("Enter");
    await page.locator("[data-msn-msg]", { hasText: "슬롯 1: 보냈습니다" }).waitFor();
    const sendCall = helperCalls.filter((c) => c.path === "/msn/send").at(-1);
    assert.deepEqual(sendCall.body, { slot: 0, enter: true });
    assert.equal(await ta0.inputValue(), "", "보낸 뒤 칸 비움");
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.msnText), "0", "커서는 그 칸에 그대로");
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "안녕하세요\n확인했습니다", "클립보드에 넣고 도우미가 붙여넣기");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.msnText), "1", "Tab = 다음 슬롯");
    await page.keyboard.down("Tab"); await page.keyboard.press("3"); await page.keyboard.up("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.msnText), "2", "Tab+3 = 슬롯 3");
    await page.keyboard.down("Tab"); await page.keyboard.press("ArrowLeft"); await page.keyboard.up("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.msnText), "1", "Tab+← = 이전 슬롯");
    assert.equal(await page.locator('[data-msn-slot="1"]').evaluate((el) => el.classList.contains("is-typing")), true);
    assert.deepEqual(await page.locator('[data-msn-slot="1"]').evaluate((el) => { const c = getComputedStyle(el); return [c.outlineStyle, c.borderTopColor, c.boxShadow]; }), ["none", "rgb(22, 163, 74)", "rgb(22, 163, 74) 0px 0px 0px 4px"], "11-05: 입력 중 = 초록 굵은 선 하나");
    assert.equal(await page.locator('[data-msn-act="star"][data-i="1"]').evaluate((el) => getComputedStyle(el).fontSize), "17px", "★ 30% 크게 (13 → 17px)");
    // 연결된 상태에서 🪄 표시 = 진단 (찾은 대화창 목록)
    await page.locator("[data-msn-helper]").click();
    await page.locator("[data-msn-msg]", { hasText: "nateonmain.exe" }).waitFor();
    // 💬 메신저 슬롯 (2026-11-03): 기본 3칸 · 틀(분홍 모서리) + 아래 대답 영역 · 칸 수 바꾸기
    assert.equal(await page.locator("[data-msn-slot]").count(), 3, "기본 슬롯 3칸");
    assert.equal(await page.locator('[data-msn-slot="0"] .msn-mark').count(), 4);
    assert.equal(await page.locator('[data-msn-slot="0"] .msn-mark').first().isVisible(), false, "11-05: 분홍 점은 화면 연결 중에만");
    assert.equal(await page.locator('[data-msn-slot="0"] .msn-frame-guide').textContent().then((t) => t.trim()), "여기에 메신저 창을 끌어다 놓으세요", "안내는 한 줄만");
    assert.equal(await page.locator("[data-msn-last], [data-msn-act=peek]").count(), 0, "마지막 변화·보기 없음");
    assert.equal((await page.locator('[data-msn-act="suggest"][data-i="0"]').textContent()).trim(), "💻 AI추천");
    assert.equal(await page.locator("[data-msn-name='0']").getAttribute("placeholder"), "메모 (예: 카톡 · 고객)");
    const frameBox = await page.locator('[data-msn-frame="0"]').boundingBox();
    const answerBox = await page.locator('[data-msn-slot="0"] [data-msn-text]').boundingBox();
    assert.ok(answerBox.y > frameBox.y + frameBox.height - 1, "대답 영역은 슬롯 틀 아래");
    // 11-05: 슬롯 최대 10칸 — 위 5 · 아래 5 / 높이 4단계 / 폭 2가지 / ★ 주목 (화면 연결 전엔 '창 없음' 자리에 ★)
    assert.deepEqual(await page.locator("[data-msn-height] option").evaluateAll((o) => o.map((x) => x.value)), ["550", "730", "910", "1090"]);
    assert.equal(await page.locator("[data-msn-count] option").count(), 10);
    await page.locator("[data-msn-count]").selectOption("10");
    const tops = await page.locator("[data-msn-slot]").evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    assert.equal(tops.length, 10);
    assert.equal(new Set(tops.slice(0, 5)).size, 1, "위 5칸 한 줄");
    assert.equal(new Set(tops.slice(5)).size, 1, "아래 5칸 한 줄");
    assert.ok(tops[5] > tops[0], "아래 줄");
    const w0 = await page.locator('[data-msn-slot="0"]').evaluate((el) => el.getBoundingClientRect().width);
    await page.locator("[data-msn-width]").selectOption("520");
    const w1 = await page.locator('[data-msn-slot="0"]').evaluate((el) => el.getBoundingClientRect().width);
    assert.ok(Math.round(w0) === 410 && Math.round(w1) === 520, `폭 ${w0} → ${w1}`);
    await page.locator("[data-msn-width]").selectOption("410");
    await page.locator("[data-msn-height]").selectOption("1090");
    const h4 = Math.round(await page.locator('[data-msn-frame="0"]').evaluate((el) => el.getBoundingClientRect().height));
    assert.ok(h4 >= 1090 && h4 <= 1096, `4단계 = 1090px (+테두리) ${h4}`);
    await page.locator("[data-msn-height]").selectOption("730");
    assert.equal(await page.locator('[data-msn-state="0"]').isVisible(), false, "화면 연결 전에는 상태 대신 ★");
    await page.locator('[data-msn-act="star"][data-i="1"]').click();
    assert.equal(await page.locator('[data-msn-slot="1"]').evaluate((el) => el.classList.contains("is-star")), true);
    assert.equal(await page.locator('[data-msn-act="star"][data-i="1"]').textContent(), "★");
    assert.equal(await page.locator('[data-msn-act="star"][data-i="1"]').evaluate((el) => getComputedStyle(el).color), "rgb(220, 38, 38)", "빨강 별");
    assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem("system_v3_cs_msn_slots"))).stars.slice(0, 2), [false, true], "별은 이 기기에 기억");
    await page.locator('[data-msn-act="star"][data-i="1"]').click();
    assert.equal(await page.locator('[data-msn-slot="1"]').evaluate((el) => el.classList.contains("is-star")), false, "다시 누르면 끔");
    await page.locator('[data-msn-act="suggest"][data-i="0"]').click();
    await page.locator("[data-msn-msg]", { hasText: "CS 시트에 연결된 뒤" }).waitFor();
    await page.locator("[data-msn-count]").selectOption("2");
    assert.equal(await page.locator("[data-msn-slot]").count(), 2);
    await page.locator("[data-msn-name='0']").fill("카톡 · 시험");
    // 가짜 '전체 화면 공유': 캔버스 = 화면. 처음엔 이 페이지 그대로(분홍 점 보임) → 슬롯 1 을 회색 창이 덮음 → 글자가 바뀜
    await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = screen.width; c.height = screen.height;
      const g = c.getContext("2d");
      const css = (el) => { const r = el.getBoundingClientRect(); const b = Math.max(0, (outerWidth - innerWidth) / 2); return { x: screenX + b + r.left, y: screenY + Math.max(0, outerHeight - innerHeight - b) + r.top, w: r.width, h: r.height }; };
      window.__screen = { mode: "page", text: "" };
      const draw = () => {
        g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height);
        document.querySelectorAll(".msn-mark").forEach((m) => {
          if (getComputedStyle(m).visibility === "hidden") return;
          const r = css(m); g.fillStyle = "#ff00ff"; g.fillRect(r.x, r.y, r.w, r.h);
        });
        if (window.__screen.mode === "kakao") {
          const r = css(document.querySelector('[data-msn-frame="0"]'));
          g.fillStyle = "#b2c7da"; g.fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
          g.fillStyle = "#fef01b"; g.fillRect(r.x + 20, r.y + 40, r.w - 40, 60 + window.__screen.text.length * 30);
          g.fillStyle = "#000000"; g.font = "28px sans-serif"; g.fillText(window.__screen.text, r.x + 30, r.y + 80);
        }
        requestAnimationFrame(draw);
      };
      draw();
      navigator.mediaDevices.getDisplayMedia = async () => {
        const stream = c.captureStream(10);
        const t = stream.getVideoTracks()[0];
        t.getSettings = () => ({ displaySurface: "monitor" });
        return stream;
      };
    });
    await page.locator('[data-msn-act="connect"]').click();
    await page.waitForFunction(() => document.querySelector("[data-msn-conn]").textContent.includes("연결됨"));
    await page.locator('[data-msn-act="fit"]').click();
    await page.waitForFunction(() => document.querySelector("[data-msn-msg]").textContent.includes("영역 맞춤 완료"));
    await page.waitForTimeout(1300);
    assert.equal(await page.locator('[data-msn-state="0"]').textContent(), "창 없음", "분홍 점이 보이면 창 없음");
    await page.evaluate(() => { window.__screen.mode = "kakao"; window.__screen.text = "안녕하세요"; });
    await page.waitForFunction(() => document.querySelector('[data-msn-state="0"]').textContent === "감시 중", null, { timeout: 5000 });
    assert.equal(await page.locator('[data-msn-badge="0"]').isVisible(), false, "창이 막 들어온 화면은 알리지 않음");
    assert.equal(await page.locator('[data-msn-state="1"]').textContent(), "창 없음", "다른 슬롯은 그대로");
    await page.evaluate(() => { window.__screen.text = "안녕하세요 바 길이 변경 되나요?"; });
    await page.waitForFunction(() => !document.querySelector('[data-msn-badge="0"]').hidden, null, { timeout: 8000 });
    assert.match(await page.locator('[data-msn-badge="0"]').textContent(), /🔔 1/);
    assert.match(await page.locator('[data-msn-badge="0"]').getAttribute("title"), /마지막 새 메시지 \d/);
    assert.equal(await page.locator('[data-msn-slot="0"] .msn-mark').first().isVisible(), true, "화면 연결 중엔 분홍 점");
    await page.locator('[data-msn-text="0"]').click();
    await page.locator('[data-msn-text="0"]').fill("네 고객님, 바 길이 변경 가능합니다 :)");
    assert.equal(await page.locator('[data-msn-badge="0"]').isVisible(), false, "슬롯을 누르면 새 변화 표시 지움");
    await page.screenshot({ path: path.join(output, "cs-board-messenger.png") });
    await page.locator('[data-msn-act="connect"]').click();
    assert.match(await page.locator("[data-msn-conn]").textContent(), /연결 안 됨/);
    assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem("system_v3_cs_msn_slots"))).names[0], "카톡 · 시험");


    // 좁은 화면(휴대폰)에서도 가로로 넘치지 않음
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-left-tab="board"]').click();
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
    const slowRequest = { on: false };
    await context.route(`${ENDPOINT}*`, async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      requests.push(body);
      assert.equal(route.request().headers()["content-type"], "text/plain;charset=utf-8", "no preflight");
      const result = gas.post(body);
      if (body.action === "request" && slowRequest.on) await new Promise((r) => setTimeout(r, 900)); // 요청 보내는 동안 화면 확인용
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
    assert.equal(await page.locator("#cs-login-ok").isDisabled(), false, "login works from V3 now");
    assert.match(await page.locator("#cs-login").textContent(), /전체 선택 \+ 게시판 \+ 리뷰 수집/);
    // 업체 끄기 → 요청에 반영 (게시판 탭)
    await page.locator('[data-left-tab="board"]').click();
    await page.locator('#cs-vendor-grid [data-vendor="메이크샵"] strong').click();
    assert.equal(await page.locator('#cs-vendor-grid [data-vendor="메이크샵"]').evaluate((el) => el.classList.contains("is-off")), true);
    await page.locator('[data-left-tab="main"]').click();
    slowRequest.on = true;
    await collectButton.click();
    // 2026-11-03: 요청 보내는 동안 버튼이 빨간 "아직 작동 안 함"으로 번쩍이지 않음 (흐리게만)
    await page.waitForFunction(() => document.querySelector('[data-left-panel="main"] [data-job="collect"]')?.classList.contains("is-busy"));
    assert.equal(await page.locator("[data-job].is-pending, [data-live].is-pending").count(), 0, "no red flash while sending");
    assert.equal(await collectButton.isDisabled(), true, "잠깐 못 누름");
    await page.locator("#cs-toast", { hasText: "게시판 수집 요청을 보냈습니다" }).waitFor();
    slowRequest.on = false;
    assert.equal(await collectButton.evaluate((el) => el.classList.contains("is-busy")), false);
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
    assert.match(await page.locator('[data-left-panel="main"] [data-vendor-status="에이블리"]').textContent(), /로그인 필요/);
    assert.match(await page.locator('#cs-vendor-grid [data-vendor-status="에이블리"]').textContent(), /로그인 필요/, "게시판 탭 업체 칸에도");
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
    await page.locator('[data-left-tab="review"]').click();
    assert.equal(await page.locator("#cs-review-banner").isVisible(), false);
    const rv = page.locator('#cs-review-list [data-card="지그재그_리뷰_r1"]');
    await rv.waitFor();
    assert.equal(await rv.locator("textarea").first().inputValue(), "AI가 만든 답 1");
    await rv.locator('[data-act="pick"][data-box="1"]').click();
    await page.waitForFunction(() => /채택 1/.test(document.querySelector("#cs-review-summary").textContent) && /자동 저장됨/.test(document.querySelector("#cs-review-summary").textContent));
    assert.equal(gas.post({ action: "list", token: TOKEN }).rows.find((r) => r.key === "지그재그_리뷰_r1").choice.pick, 1);
    assert.equal(await page.locator('[data-right-panel="review"] [data-job="reviews"]').isDisabled(), false);
    assert.equal(await page.locator('[data-right-panel="review"] button', { hasText: "📤 등록" }).isDisabled(), true, "review posting stays red");
    assert.match(await page.locator('[data-review-status="지그재그"]').textContent(), /✓/, "리뷰 탭 업체 칸 = 리뷰 수집 결과");
    await page.screenshot({ path: path.join(output, "cs-board-review-live.png") });
    await page.locator('[data-left-tab="board"]').click();

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
    // 🔑 로그인 (2026-11-04: 메인보드 안에 늘 펼쳐짐): 지난 수집에서 로그인 필요였던 에이블리가 미리 골라짐 → 새 비밀번호는 잠가서
    await page.locator('[data-login-row="에이블리"]').waitFor();
    assert.equal(await page.locator("#cs-login-ok").isDisabled(), false, "login is no longer red");
    const box26 = await page.locator('[data-login-pick][value="에이블리"]').boundingBox();
    assert.ok(box26.width >= 17 && box26.width <= 20 && box26.height >= 17, `체크박스 18px (${box26.width})`);
    assert.ok((await page.locator("#cs-login-ok").boundingBox()).height >= 52, "로그인 요청 버튼 두 배");
    assert.equal(await page.locator('[data-login-pick][value="에이블리"]').isChecked(), true);
    assert.equal(await page.locator('[data-login-pick][value="지그재그"]').isChecked(), false);
    assert.match(await page.locator('[data-login-row="지그재그"]').textContent(), /PC에 저장된 비밀번호 ✓/);
    const ablyRow = page.locator('[data-login-row="에이블리"]');
    await ablyRow.locator("[data-login-id]").fill("pink_ably");
    await ablyRow.locator("[data-login-pw]").fill("Secret!234");
    await page.locator('[data-login-pick][value="지그재그"]').check();
    await page.locator("#cs-login-collect").check();
    // 11-04: [전체 선택 + 게시판 + 리뷰 수집] → 업체 4곳 모두 골라짐 → 여기서는 스마트스토어·메이크샵은 다시 빼고 보냄
    assert.equal(await page.locator("[data-login-pick]:checked").count(), 4, "전체 선택");
    await page.locator('[data-login-pick][value="스마트스토어"]').uncheck();
    await page.locator('[data-login-pick][value="메이크샵"]').uncheck();
    await page.screenshot({ path: path.join(output, "cs-board-login.png") });
    await page.locator("#cs-login-ok").click();
    await page.locator("#cs-toast", { hasText: "로그인 요청을 보냈습니다" }).waitFor();
    assert.match(await page.locator("#cs-toast").textContent(), /게시판 \+ 리뷰 수집/);
    // 진행 작은 창: 로그인 대기
    await page.locator("#cs-progress:not([hidden])").waitFor();
    assert.match(await page.locator("#cs-progress").textContent(), /로그인 대기[\s\S]*기다리는 중/);
    // 11-04: 로그인 현황 카드 버튼 — 요청한 업체는 연결중(회색), 아닌 업체는 연결요청(빨강)
    const connBtn = (v, part = "all") => page.locator(`[data-login-grid] [data-conn="${part}"][data-conn-vendor="${v}"]`);
    assert.equal(await connBtn("에이블리", "review").textContent(), "⭐연결중");
    assert.match(await connBtn("에이블리", "board").getAttribute("class"), /cs-conn-ing/);
    assert.equal(await connBtn("메이크샵", "board").textContent(), "📋연결요청", "부분 버튼에 게시판·리뷰 표시");
    assert.equal(await connBtn("메이크샵", "board").locator(".cs-conn-state").evaluate((el) => getComputedStyle(el).color), "rgb(220, 38, 38)", "연결 전 = 빨강");
    assert.equal(await connBtn("메이크샵").evaluate((el) => el.tagName), "DIV", "전체연결 = 카드 자체 (버튼 디자인 없음)");
    const loginReq = lastRequest("login");
    assert.deepEqual(loginReq.options.vendors, ["지그재그", "에이블리"]);
    assert.equal(loginReq.options.collectAfter, true);
    assert.deepEqual(Object.keys(loginReq.options.creds), ["에이블리"], "only the vendor with a new password");
    assert.equal(JSON.stringify(requests).includes("Secret!234"), false, "the password never leaves the browser in plain text");
    assert.equal(await unlock(loginReq.options.creds["에이블리"].pw), "Secret!234", "only the collector PC key opens it");
    assert.equal(await unlock(loginReq.options.creds["에이블리"].id), "pink_ably");
    assert.equal(await page.locator('[data-login-row="에이블리"] [data-login-pw]').inputValue(), "", "typed password is not kept on screen");
    // 2026-11-04: 요청 뒤에도 체크 유지 (비밀번호 칸만 비움) — 다시 그려도·새로 열어도
    assert.equal(await page.locator("#cs-login-collect").isChecked(), true, "게시판 + 리뷰 수집 체크 유지");
    assert.equal(await page.locator('[data-login-pick][value="에이블리"]').isChecked(), true, "업체 체크 유지");
    assert.equal(await page.locator('[data-login-pick][value="지그재그"]').isChecked(), true);
    assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem("system_v3_cs_login_pick"))), { vendors: ["지그재그", "에이블리"], collect: true });
    const lj = gas.post({ action: "poll", token: COLLECTOR, pc: "OFFICE-PC" }).job;
    assert.equal(lj.kind, "login");
    gas.post({ action: "progress", token: COLLECTOR, id: lj.id, message: "에이블리: 휴대폰 2단계 인증이면 휴대폰에서 [확인]을 눌러 주세요" });
    await reload();
    await waitText("#cs-jobs", /실행중[\s\S]*🔑 로그인[\s\S]*휴대폰에서 \[확인\]/);
    await waitText("#cs-progress", /로그인 중[\s\S]*휴대폰에서 \[확인\]/);
    assert.match(await page.locator("#cs-progress").getAttribute("class"), /is-run/);
    await page.waitForTimeout(400);
    await page.locator("#cs-progress").screenshot({ path: path.join(output, "cs-board-progress.png") });
    gas.post({ action: "finish", token: COLLECTOR, id: lj.id, ok: true, message: "지그재그 ✓ · 에이블리 ✓", data: { login: { 지그재그: { state: "ok" }, 에이블리: { state: "ok" }, 스마트스토어: { state: "ok", note: "로그인됨 (자동)" } } } });

    // 메이크샵 부운영자 (웹연결 1.5): [부운영자로 로그인] → 상점 URL 칸 → 아이디가 "부운영자|상점URL|아이디" 로 잠겨 감
    await reload();
    // 2026-11-04: 로그인 상태는 메인보드 로그인 현황에서 (리뷰 탭 업체 칸은 게시판과 같은 모양)
    assert.equal(await page.locator('[data-vendor-group="review"] [data-pc="login"]').count(), 0, "리뷰 탭에는 로그인 버튼 없음");
    assert.equal(await connBtn("스마트스토어", "review").textContent(), "⭐연결완료");
    await waitText("#cs-progress", /로그인 완료/);
    assert.equal(await connBtn("에이블리", "board").textContent(), "📋연결완료", "로그인 성공 → 연결완료");
    assert.equal(await connBtn("에이블리", "board").locator(".cs-conn-state").evaluate((el) => getComputedStyle(el).color), "rgb(17, 17, 17)", "연결완료 = 검정");
    assert.equal(await connBtn("지그재그", "review").textContent(), "⭐연결완료", "리뷰 연결 줄");
    assert.equal(await page.locator('[data-conn-vendor="스마트스토어"]').count(), 3, "스마트스토어: 전체·게시판·리뷰 연결");
    assert.equal(await page.locator('[data-login-grid] [data-vendor="스마트스토어"] [data-pc="api-tab"]').count(), 1, "API 설정은 작은 보조 버튼");
    // 2026-11-03: 지난 수집은 "로그인 필요"였지만 방금 로그인 성공 → 해결 메모 + "(바뀌었을 때만)", 미리 골라지지 않음
    const ablyFixed = page.locator('[data-login-row="에이블리"]');
    assert.match(await ablyFixed.locator("[data-login-state]").textContent(), /지난 수집: 로그인 필요 → .*로그인 ✓ \(해결/);
    assert.match(await ablyFixed.locator("summary").textContent(), /\(바뀌었을 때만\)/);
    assert.equal(await page.locator('[data-login-pick][value="에이블리"]').isChecked(), true, "지난번 체크 유지 (해결돼도 대표님이 고른 대로)");
    await page.locator('[data-login-pick][value="에이블리"]').uncheck();
    await page.locator('[data-login-pick][value="지그재그"]').uncheck();
    await page.locator("#cs-login-collect").uncheck();
    assert.equal(await page.locator("[data-login-pick]:checked").count(), 0, "끄면 업체 체크도 모두 풀림");
    assert.doesNotMatch(await page.locator('[data-login-row="지그재그"] [data-login-state]').textContent(), /해결/, "안 바뀐 업체는 메모 없음");
    assert.match(await page.locator('[data-login-row="스마트스토어"] [data-login-state]').textContent(), /문의는 커머스 API 사용 중 \(로그인 필요 없음\) · 리뷰 수집만 판매자센터 로그인 필요/, "API 가 있으면 문의는 로그인 불필요");
    assert.match(await page.locator('[data-login-row="스마트스토어"] [data-login-manual]').textContent(), /자동 한 번.*직접 로그인.*퀴즈.*최대 5분.*자동으로 닫힙니다/, "스마트스토어: 자동 한 번 → 막히면 직접 → 되면 창 자동 닫힘 안내");
    assert.equal(await page.locator('[data-login-row="스마트스토어"] [data-login-id]').count(), 1, "자동 시도용 아이디·비밀번호 칸 (처음 한 번)");
    assert.match(await page.locator('[data-login-row="스마트스토어"] summary').textContent(), /자동 시도용/);
    assert.equal(await page.locator('[data-login-pick][value="스마트스토어"]').isChecked(), false);
    await page.locator("#cs-login .cs-login-box, #cs-login").first().screenshot({ path: path.join(output, "cs-board-login-memo.png") });
    const msRow = page.locator('[data-login-row="메이크샵"]');
    await page.locator('[data-login-pick][value="메이크샵"]').check();
    await msRow.locator("summary").click();
    assert.equal(await msRow.locator("[data-login-shop-wrap]").isVisible(), false, "운영자 로그인이 기본");
    await msRow.locator("[data-login-sub]").check();
    assert.equal(await msRow.locator("[data-login-shop-wrap]").isVisible(), true);
    await msRow.locator("[data-login-id]").fill("cs_auto");
    await msRow.locator("[data-login-pw]").fill("Sub!pw77");
    await page.locator("#cs-login-ok").click();
    await page.locator("#cs-toast", { hasText: "상점 URL" }).waitFor();
    await msRow.locator("[data-login-shop]").fill("https://pinkrocket.co.kr/");
    await page.locator("#cs-login-ok").click();
    await page.locator("#cs-toast", { hasText: "로그인 요청을 보냈습니다" }).waitFor();
    const subReq = lastRequest("login");
    assert.equal(await unlock(subReq.options.creds["메이크샵"].id), "부운영자|pinkrocket.co.kr|cs_auto");
    assert.equal(await unlock(subReq.options.creds["메이크샵"].pw), "Sub!pw77");
    assert.equal(JSON.stringify(requests).includes("Sub!pw77"), false);
    assert.equal(await page.evaluate(() => localStorage.getItem("system_v3_cs_makeshop_shop")), "pinkrocket.co.kr", "상점 URL 은 다음에 다시 안 쓰게 기억(비밀값 아님)");
    assert.equal(await page.locator('[data-login-row="메이크샵"] [data-login-sub]').isChecked(), true, "다음에도 부운영자로");
    // 11-04 밤: 카드 [리뷰 연결] = 그 업체만 바로 로그인 요청 (수집은 안 함) — 대기 중인 로그인 요청은 새 요청으로 바뀜
    await connBtn("메이크샵", "review").click();
    await page.locator("#cs-toast", { hasText: "메이크샵 리뷰 연결(로그인) 요청" }).waitFor();
    assert.deepEqual([lastRequest("login").options.vendors, lastRequest("login").options.collectAfter], [["메이크샵"], false]);
    await connBtn("메이크샵").locator("strong").click();   // 카드(부분 버튼 밖) = 전체연결
    await page.locator("#cs-toast", { hasText: "메이크샵 전체연결(로그인 → 게시판 → 리뷰 수집)" }).waitFor();
    assert.deepEqual([lastRequest("login").options.vendors, lastRequest("login").options.collectAfter], [["메이크샵"], true], "전체연결 = 로그인 뒤 게시판·리뷰 수집까지");
    const msJob = gas.post({ action: "poll", token: COLLECTOR, pc: "OFFICE-PC" }).job;
    gas.post({ action: "finish", token: COLLECTOR, id: msJob.id, ok: true, message: "메이크샵 ✓", data: { login: { 메이크샵: { state: "ok" } } } });

    // 11-05: 💬 메신저 [💻 AI추천] — 창 도우미가 붙은 대화창 그림을 주고 → 시트 v9 msnSuggest → 답장 후보를 눌러 입력칸에
    await context.route("http://127.0.0.1:47811/**", (route) => {
      const p = new URL(route.request().url()).pathname;
      const body = p === "/msn/capture" ? { ok: true, mime: "image/png", data: "iVBORw0KGgo" + "A".repeat(300), w: 400, h: 600 } : { ok: true, ver: "1.12 (2026-11-05)", slots: 3, windows: 1, managed: 1 };
      return route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": origin }, body: JSON.stringify(body) });
    });
    await page.locator('[data-left-tab="msn"]').click();
    await page.locator("[data-msn-helper].is-on").waitFor({ timeout: 8000 });
    await page.locator('[data-msn-name="0"]').fill("고객 A");
    await page.locator('[data-msn-act="suggest"][data-i="0"]').click();
    await page.locator('[data-msn-sugg="0"] .msn-sugg-item').first().waitFor();
    const ms = requests.filter((r) => r.action === "msnSuggest").at(-1);
    assert.ok(ms && ms.token === TOKEN && ms.image.startsWith("iVBORw0KGgo") && ms.mime === "image/png" && ms.name === "고객 A", "그림·대화방 이름을 시트로");
    assert.deepEqual(await page.locator('[data-msn-sugg="0"] .msn-sugg-item').allTextContents(), ["AI가 만든 답 1", "AI가 만든 답 2"]);
    await page.locator('[data-msn-sugg="0"] .msn-sugg-item').nth(1).click();
    assert.equal(await page.locator('[data-msn-text="0"]').inputValue(), "AI가 만든 답 2", "후보를 누르면 입력칸에");
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.msnText), "0", "커서는 입력칸에");
    await page.locator('[data-left-tab="board"]').click();
    await page.locator('[data-left-tab="main"]').click();

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
    await page.locator('[data-left-tab="main"]').click();
    await page.locator('[data-left-panel="main"] [data-pc="api-tab"]').click();
    assert.equal(await page.locator("#cs-api-box").isVisible(), true, "API 설정 → 설정 탭의 API 칸");
    assert.match(await page.locator("#cs-api-state").textContent(), /E_1/);
    await page.locator("#cs-api-id").fill("my-client-id");
    await page.locator("#cs-api-secret").fill("$2a$04$my-secret");
    await page.locator('#cs-api-box [data-pc="apiKey"]').click();
    await page.locator("#cs-toast", { hasText: "API 키를 잠가서 보냈습니다" }).waitFor();
    const ak = lastRequest("apiKey");
    assert.equal(await unlock(ak.options.secret), "$2a$04$my-secret");
    assert.equal(JSON.stringify(requests).includes("my-secret"), false);
    assert.equal(await page.locator("#cs-api-secret").inputValue(), "");
    const akJob = gas.post({ action: "poll", token: COLLECTOR, pc: "OFFICE-PC" }).job;
    assert.equal(akJob.body.secret, ak.options.secret);
    gas.post({ action: "finish", token: COLLECTOR, id: akJob.id, ok: true, message: "API 키 저장 · ✅ 연결 성공 (수집기 API 키)" });
    await page.locator('#cs-api-box [data-pc="ip"]').click();
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

    // 엑셀 내려받기 → 고쳐서 📥 엑셀 등록
    let xlsxPath = "";
    try { xlsxPath = createRequire("/tmp/claude-0/scan/").resolve("xlsx/dist/xlsx.full.min.js"); } catch { xlsxPath = ""; }
    if (xlsxPath) {
      await context.route("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js", async (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: await readFile(xlsxPath, "utf8") }));
      await page.locator('[data-left-tab="board"]').click();
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
    assert.deepEqual(stillRed.filter((t) => !t.startsWith("⬆ 업데이트")).sort(), ["📤 등록"], "11-05: 메신저 💻 AI추천도 작동 — 리뷰 답글 등록만 아직 회색 (업데이트는 새 버전을 기다림)");

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
    await page.locator("#cs-token-input").fill("wrong-token-1-long-key-xx");   // 20자 이상 = 긴 키로 취급
    await page.locator("#cs-token-save").click();
    await page.locator("#cs-toast", { hasText: "비밀번호가 맞지 않습니다" }).waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("system_v3_cs_board") || "{}").token || ""), "");
    assert.equal(await page.locator("#cs-connection").textContent(), "비밀번호 필요");

    // 간단 비밀번호(시트 v6 unlock): 설정 전 → 안내, 틀림 → 남은 횟수, 맞음 → 긴 키를 받아 연결·저장
    await page.locator("#cs-token-input").fill("pk2611");
    await page.locator("#cs-token-save").click();
    await page.locator("#cs-toast", { hasText: "UNLOCK_PASSWORD" }).waitFor();
    gas.properties.UNLOCK_PASSWORD = "pk2611";
    await page.locator("#cs-token-input").fill("pk2699");
    await page.locator("#cs-token-save").click();
    await page.locator("#cs-toast", { hasText: "번 더 틀리면 잠깁니다" }).waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("system_v3_cs_board") || "{}").token || ""), "");
    await page.locator("#cs-token-input").fill("12345");
    await page.locator("#cs-token-save").click();
    await page.locator("#cs-toast", { hasText: "6자 이상" }).waitFor();
    await page.locator("#cs-token-input").fill("pk2611");
    await page.locator("#cs-token-save").click();
    await page.locator("#cs-toast", { hasText: "CS 시트에 연결했습니다" }).waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("system_v3_cs_board") || "{}").token), TOKEN, "긴 키가 이 기기에 저장됨");
    assert.match(await page.locator("#cs-connection").textContent(), /^연결됨/);
    assert.equal(await page.locator("#cs-token-input").inputValue(), "", "입력칸 비움");
    await context.close();
  }

  assert.deepEqual(pageErrors, []);
  console.log("csBoard.browser.test: OK");
} finally {
  await browser?.close();
  server.close();
}
