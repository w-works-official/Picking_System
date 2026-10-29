import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CS_BOARD_ENDPOINT,
  CS_STATUS,
  canCycleBox,
  csAdminLink,
  csBoardSummary,
  csSavePayload,
  draftPool,
  draftText,
  filterCsRows,
  initialView,
  isCsBoardTokenValid,
  nextDraftInView,
  normalizeChoice,
  normalizeCsRow,
  parseCsBoardResponse,
  pickedText,
  sortCsRows,
  withEdit,
  withHold,
  withPick,
} from "../src/domain/csBoard.mjs";
import { CS_SAMPLE_BOARD_ROWS, CS_SAMPLE_REVIEW_ROWS } from "../src/domain/csBoardSamples.mjs";
import { cardHtml, escapeHtml, slotHtml } from "../src/app/csBoardApp.mjs";
import { loadCsBoardScript } from "./helpers/csBoardFakeSheet.mjs";

// 공개 저장소: 주소는 비어 있거나 Apps Script 웹앱 주소만, 토큰·키는 코드에 없음
assert.ok(CS_BOARD_ENDPOINT === "" || /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(CS_BOARD_ENDPOINT));
for (const file of ["../src/domain/csBoard.mjs", "../src/app/csBoardApp.mjs", "../docs/cs-board-sheet.gs", "../cs/index.html", "../src/domain/csBoardSamples.mjs"]) {
  const text = await readFile(new URL(file, import.meta.url), "utf8");
  assert.doesNotMatch(text, /sk-ant-[A-Za-z0-9]/, `${file}: no API key`);
}

assert.equal(isCsBoardTokenValid("abcd1234"), true);
assert.equal(isCsBoardTokenValid("short"), false);
assert.equal(isCsBoardTokenValid("has space 123"), false);

// ---------- 화면 계산 ----------
const row = normalizeCsRow({
  key: "지그재그_주문문의_1",
  vendor: "지그재그",
  board: "주문문의",
  id: "1",
  date: "2026-10-29 10:00",
  product: "상품",
  inquiry: { question: "질문", productLink: "javascript:alert(1)", productImage: "https://img.example/a.jpg", photos: ["https://x/1.jpg", "http://insecure/2.jpg"], context: [{ kind: "이전", question: "q", answer: "a" }] },
  drafts: ["A안", { text: "B안", from: "AI" }, "  ", "D안"],
  choice: { pick: 9, view: [1, 1, 7], edits: { 0: "고친 A", 8: "x" }, hold: false },
  version: 3,
});
assert.equal(row.productLink, "", "only https links");
assert.equal(row.productImage, "https://img.example/a.jpg");
assert.deepEqual(row.photos, ["https://x/1.jpg"]);
assert.equal(row.drafts.length, 3, "empty drafts dropped");
assert.equal(row.drafts[1].from, "AI");
assert.deepEqual(row.choice, { pick: -1, view: [1], edits: { 0: "고친 A" }, hold: false }, "out-of-range values dropped");
assert.equal(row.status, CS_STATUS.drafted);
assert.equal(draftText(row, 0), "고친 A");
assert.deepEqual(draftPool(row), [0, 1, 2]);
assert.deepEqual(initialView(row), [1, 0], "saved view first, then filled");

const picked = { ...row, choice: withPick(row, 2) };
assert.deepEqual(initialView(picked), [2, 1], "picked draft always visible");
assert.equal(pickedText(picked), "D안");
assert.deepEqual(nextDraftInView(row, [0, 1], 0), [2, 1], "cycle skips the other box");
assert.deepEqual(nextDraftInView(row, [2, 1], 0), [0, 1], "wraps around");
assert.equal(canCycleBox(row, [0, 1]), true);
assert.equal(canCycleBox({ ...row, drafts: row.drafts.slice(0, 2), choice: normalizeChoice({}) }, [0, 1]), false);

const edited = withEdit(row, 1, "B안");
assert.equal(Object.hasOwn(edited.edits, 1), false, "same as original → no edit kept");
assert.equal(withEdit(row, 1, "새 B").edits[1], "새 B");
assert.deepEqual(withHold(picked, true), { ...picked.choice, hold: true, pick: -1 }, "hold clears the pick");
assert.equal(withPick({ ...row, choice: withHold(row, true) }, 1).hold, false, "picking clears hold");

const payload = csSavePayload(row, { ...row.choice, pick: 1, view: [1, 0] }, "희진");
assert.deepEqual(payload, { action: "save", key: row.key, baseVersion: 3, choice: { pick: 1, view: [1, 0], edits: { 0: "고친 A" }, hold: false }, editor: "희진" });

assert.equal(csAdminLink({ ...row, link: "" }), "https://partners.kakaostyle.com/");
assert.equal(csAdminLink({ ...row, vendor: "스마트스토어", board: "상품문의", link: "" }), "https://sell.smartstore.naver.com/#/comment/");
assert.equal(csAdminLink({ ...row, vendor: "에이블리", id: "abc", link: "" }), "https://seller-admin.a-bly.com/inquiry/abc?iframe=true");
assert.equal(csAdminLink({ ...row, vendor: "메이크샵", link: "" }), "");

const rows = CS_SAMPLE_BOARD_ROWS.map((r) => normalizeCsRow(r));
assert.equal(rows.length, 4);
assert.ok(rows.every((r) => r.key.startsWith("가상_")), "samples are clearly synthetic");
assert.deepEqual(csBoardSummary(rows), { total: 4, picked: 0, held: 0, waiting: 4 });
assert.equal(filterCsRows(rows, { vendor: "에이블리" }).length, 1);
assert.equal(filterCsRows(rows, { search: "바 길이" }).length, 1);
assert.equal(filterCsRows(rows, { status: "채택" }).length, 0);
assert.deepEqual(sortCsRows(rows).map((r) => r.id), ["S-1001", "Z-2002", "A-3003", "M-4004"]);
assert.equal(CS_SAMPLE_REVIEW_ROWS.length, 2);

assert.throws(() => parseCsBoardResponse({ ok: false, error: "거절", denied: true }), (e) => e.denied === true);
assert.throws(() => parseCsBoardResponse({ ok: false, conflict: true, error: "먼저", row: { key: "k" } }), (e) => e.conflict === true && e.row.key === "k");
assert.equal(parseCsBoardResponse({ ok: true, rows: [{ key: "a" }, { key: "a" }, { key: "" }] }).rows.length, 1);

// 카드: 글자는 모두 이스케이프, 읽기 전용(리뷰)은 빨간 미작동 표시
const evil = normalizeCsRow({ key: "k<1>", vendor: "<b>v</b>", inquiry: { question: "<script>alert(1)</script>" }, drafts: ["<img src=x onerror=1>"] });
const html = cardHtml(evil, 1, initialView(evil), {});
assert.doesNotMatch(html, /<script>|<img src=x/);
assert.match(html, /&lt;script&gt;/);
const review = cardHtml(rows[0], 1, initialView(rows[0]), { readonly: true });
assert.match(review, /class="cs-pick is-pending"[^>]*disabled/);
assert.match(review, /readonly/);
const sampleCard = cardHtml(rows[0], 1, initialView(rows[0]), { sample: true });
assert.match(sampleCard, /class="cs-btn is-pending" disabled[^>]*>🤖 AI 추천/, "AI is red/disabled in sample mode");
assert.match(cardHtml(rows[0], 1, initialView(rows[0]), { aiReady: true }), /data-act="ai"/);
assert.equal(escapeHtml(`"'&`), "&quot;&#39;&amp;");
assert.match(slotHtml({ messenger: "톡톡", vendor: "스마트스토어", customer: "김**", at: "10:00", history: [{ who: "them", text: "<b>" }], picks: ["a", "b"], used: { A: 0, B: 1, next: 2 }, answer: "" }, 0), /is-pending" disabled title="개발 예정 — 실제 메신저 전송">↵ 보내기/);

// 화면: 작동 안 하는 버튼은 모두 disabled + is-pending (빨간 글씨)
const page = await readFile(new URL("../cs/index.html", import.meta.url), "utf8");
const pendingButtons = page.match(/<button[^>]*is-pending[^>]*>/g) || [];
assert.ok(pendingButtons.length >= 20, "mockup buttons present");
for (const tag of pendingButtons) assert.match(tag, /\sdisabled(\s|>)/, `pending button must be disabled: ${tag}`);
assert.match(page, /data-workspace-base="\.\.\/"/);
assert.match(page, /href="\.\/legacy\.html"/, "old CS screen kept and linked");
assert.doesNotMatch(page, /\.\.\/\.\.\//, "cs/index.html is one level down");
assert.match(page, /📥 엑셀 적용/, "matches collector v9.1 buttons");
assert.doesNotMatch(page, /<button[^>]*>📄 답변안 엑셀 열기/, "v9.1 removed the left excel/approve buttons");

// ---------- Apps Script (가짜 시트) ----------
const TOKEN = "board-token-123";
const COLLECTOR = "collector-token-456";
let claudeText = JSON.stringify(["AI 답 1", "AI 답 2", "AI 답 3"]);
const gas = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN, COLLECTOR_TOKEN: COLLECTOR, CLAUDE_KEY: "test-key", AI_DAILY_LIMIT: "2" }, claude: () => ({ status: 200, text: claudeText }) });
assert.deepEqual(gas.get(), { ok: true, service: "system-v3-cs-board", version: 1 }, "GET returns no data");
assert.equal(gas.post({ action: "list" }).denied, true, "token required");
assert.equal(gas.post({ action: "list", token: COLLECTOR }).denied, true, "collector token cannot read");
assert.equal(gas.post({ action: "ingest", token: TOKEN, rows: [] }).denied, true, "board token cannot ingest");
assert.equal(gas.post({ action: "delete", token: TOKEN }).ok, false);
let res = gas.post({ action: "list", token: TOKEN });
assert.deepEqual(Array.from(res.rows), []);
assert.equal(res.aiEnabled, true);
assert.equal(gas.timeZone(), "Asia/Seoul");
const sheet = gas.sheet();
assert.equal(sheet.data[0][0], "키");

const collected = [
  { 업체: "지그재그", 게시판: "주문문의", id: "z1", 날짜: "2026-10-29 10:00", 상품명: "=SUM(1)", 문의: "바 변경 되나요?", 유형: "주문문의", 옵션: "6mm", 상품링크: "https://shop/p/1", 상품이미지: "javascript:x", 사진URL: ["https://img/1.jpg", "ftp://no"], 맥락: [{ 구분: "이전", 날짜: "10-27", 내용: "q", 답변: "a" }], 답변안: ["안 1", "안 2"] },
  { 업체: "스마트스토어", 게시판: "상품문의", id: "s1", 날짜: "2026-10-29 09:00", 상품명: "별 피어싱", 문의: "언제 와요?" },
  { 업체: "", id: "bad" },
];
res = gas.post({ action: "ingest", token: COLLECTOR, rows: collected });
assert.deepEqual([res.added, res.updated], [2, 0]);
res = gas.post({ action: "list", token: TOKEN });
assert.equal(res.rows.length, 2);
const z = res.rows.find((r) => r.key === "지그재그_주문문의_z1");
assert.equal(z.product, "=SUM(1)", "formula text stays text");
assert.equal(z.inquiry.productImage, "", "non-https dropped");
assert.deepEqual(Array.from(z.inquiry.photos), ["https://img/1.jpg"]);
assert.equal(z.inquiry.context[0].answer, "a");
assert.deepEqual(Array.from(z.drafts.map((d) => d.text)), ["안 1", "안 2"]);
assert.equal(z.version, 0);
assert.equal(sheet.data.find((r) => r[0] === z.key)[6], "답변안");

// 선택 저장 · 버전 충돌
res = gas.post({ action: "save", token: TOKEN, key: z.key, baseVersion: 0, choice: { pick: 1, view: [1, 0], edits: { 1: "고친 안 2", 5: "범위 밖" } }, editor: "희진" });
assert.equal(res.ok, true);
assert.equal(res.row.version, 1);
assert.deepEqual(JSON.parse(JSON.stringify(res.row.choice)), { pick: 1, view: [1, 0], edits: { 1: "고친 안 2" }, hold: false });
assert.equal(sheet.data.find((r) => r[0] === z.key)[6], "채택");
res = gas.post({ action: "save", token: TOKEN, key: z.key, baseVersion: 0, choice: { pick: 0 } });
assert.equal(res.conflict, true, "stale version is not overwritten");
assert.equal(res.row.choice.pick, 1);
res = gas.post({ action: "save", token: TOKEN, key: z.key, baseVersion: 1, choice: { pick: 0, hold: true } });
assert.equal(res.row.choice.pick, -1, "hold wins over pick");
assert.equal(sheet.data.find((r) => r[0] === z.key)[6], "보류");
assert.equal(gas.post({ action: "save", token: TOKEN, key: "없음", baseVersion: 0, choice: {} }).ok, false);

// 다시 수집: 선택·답변안은 그대로
res = gas.post({ action: "ingest", token: COLLECTOR, rows: [{ ...collected[0], 문의: "바 변경 되나요? (수정)", 답변안: ["다른 안"] }] });
assert.deepEqual([res.added, res.updated], [0, 1]);
res = gas.post({ action: "list", token: TOKEN });
const z2 = res.rows.find((r) => r.key === z.key);
assert.equal(z2.inquiry.question, "바 변경 되나요? (수정)");
assert.deepEqual(Array.from(z2.drafts.map((d) => d.text)), ["안 1", "안 2"], "existing drafts kept");
assert.equal(z2.choice.hold, true, "choice kept");
assert.equal(sheet.data.length, 3, "no duplicate rows");

// AI 추천: 답변안 뒤에 붙음, 선택·버전은 그대로, 하루 한도
const s1 = res.rows.find((r) => r.key === "스마트스토어_상품문의_s1");
res = gas.post({ action: "suggest", token: TOKEN, key: s1.key });
assert.equal(res.ok, true);
assert.equal(res.added, 3);
assert.deepEqual(Array.from(res.row.drafts.map((d) => d.from)), ["AI", "AI", "AI"]);
assert.equal(res.row.version, 0, "suggest does not bump the choice version");
const call = gas.calls.at(-1);
assert.equal(call.url, "https://api.anthropic.com/v1/messages");
assert.equal(call.headers["x-api-key"], "test-key");
assert.equal(call.payload.model, "claude-haiku-5-5");
assert.match(call.payload.system[0].text, /핑크로켓/, "same shop rules as the collector");
assert.equal(call.payload.system[0].cache_control.type, "ephemeral");
assert.match(call.payload.messages[0].content, /고객: 언제 와요\?/);
claudeText = "설명 없이\n- 첫째 답변 문장입니다\n- 둘째 답변 문장입니다";
res = gas.post({ action: "suggest", token: TOKEN, key: z.key });
assert.deepEqual(Array.from(res.row.drafts.slice(2).map((d) => d.text)), ["첫째 답변 문장입니다", "둘째 답변 문장입니다"], "line fallback like the collector");
assert.match(gas.calls.at(-1).payload.messages[0].content, /이전 대화[\s\S]*고객: q[\s\S]*우리: a/);
res = gas.post({ action: "suggest", token: TOKEN, key: z.key });
assert.equal(res.ok, false);
assert.match(res.error, /한도/);
assert.equal(gas.calls.length, 2, "limit stops before calling the API");

// 종료: 목록에서 빠지고 줄은 남음
res = gas.post({ action: "close", token: COLLECTOR, keys: [s1.key, "없는키"] });
assert.equal(res.changed, 1);
res = gas.post({ action: "list", token: TOKEN });
assert.deepEqual(Array.from(res.rows.map((r) => r.key)), [z.key]);
assert.equal(sheet.data.length, 3, "rows never deleted");
assert.equal(gas.post({ action: "save", token: TOKEN, key: s1.key, baseVersion: 0, choice: {} }).ok, false, "closed rows are read-only");

// 키 없으면 AI 요청 거절(외부 호출 없음)
const noKey = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN, COLLECTOR_TOKEN: COLLECTOR } });
noKey.post({ action: "ingest", token: COLLECTOR, rows: [collected[1]] });
assert.equal(noKey.post({ action: "list", token: TOKEN }).aiEnabled, false);
assert.match(noKey.post({ action: "suggest", token: TOKEN, key: s1.key }).error, /CLAUDE_KEY/);
assert.equal(noKey.calls.length, 0);
// 토큰이 설정되지 않은 시트는 아무도 못 씀
const unset = await loadCsBoardScript({ props: {} });
assert.equal(unset.post({ action: "list", token: "" }).denied, true);

console.log("csBoard.mock.test: OK");
