import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CS_BOARD_ENDPOINT,
  collectorStatus,
  csRegisterPayload,
  csRequestPayload,
  isCsRowLocked,
  normalizeCsJob,
  registerCandidates,
  usageForMonth,
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
import { cardHtml, escapeHtml, jobsHtml, slotHtml } from "../src/app/csBoardApp.mjs";
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

// ---------- v2: 수집기 PC 연결 (요청·등록·리뷰·사용량) ----------
const reviewRow = normalizeCsRow({ key: "지그재그_리뷰_1", vendor: "지그재그", board: "리뷰", id: "1", inquiry: { kind: "리뷰", question: "좋아요" }, drafts: ["감사합니다"] });
assert.equal(reviewRow.kind, "리뷰");
assert.equal(row.kind, "문의");
assert.equal(filterCsRows([row, reviewRow], { kind: "리뷰" }).length, 1);
assert.equal(filterCsRows([row, reviewRow], {}).length, 1, "board tab shows inquiries only");
const ssPicked = normalizeCsRow({ key: "스마트스토어_상품문의_9", vendor: "스마트스토어", board: "상품문의", id: "9", drafts: ["안"], choice: { pick: 0 } });
const zzPicked = normalizeCsRow({ key: "지그재그_상품문의_8", vendor: "지그재그", board: "상품문의", id: "8", drafts: ["안"], choice: { pick: 0 } });
const requested = normalizeCsRow({ key: "스마트스토어_고객문의_7", vendor: "스마트스토어", board: "고객문의", id: "7", drafts: ["안"], choice: { pick: 0 }, reg: { state: "요청" } });
assert.equal(requested.status, "등록요청");
assert.equal(isCsRowLocked(requested), true);
assert.equal(normalizeCsRow({ key: "x", closed: true, reg: { state: "완료" } }).status, "등록완료");
assert.equal(normalizeCsRow({ key: "x", reg: { state: "이상한값" } }).reg, null);
const cand = registerCandidates([ssPicked, zzPicked, requested, row, { ...ssPicked, key: "h", choice: { ...ssPicked.choice, hold: true } }]);
assert.deepEqual(cand.auto.map((r) => r.key), ["스마트스토어_상품문의_9"], "only picked, unlocked smartstore rows");
assert.deepEqual(cand.manual.map((r) => r.key), ["지그재그_상품문의_8"]);
assert.deepEqual(csRegisterPayload(cand.auto, "희진"), { action: "request", kind: "register", keys: ["스마트스토어_상품문의_9"], editor: "희진" });
assert.deepEqual(csRequestPayload("reviews", { vendors: ["지그재그", "지그재그", ""], reviewDays: 14 }), { action: "request", kind: "reviews", options: { vendors: ["지그재그"], reviewDays: 14 }, editor: "" });
assert.deepEqual(csRequestPayload("collect", { vendors: ["에이블리"], reviewDays: 14 }).options, { vendors: ["에이블리"] }, "days only for reviews");
assert.throws(() => csRequestPayload("register"));
assert.throws(() => csRequestPayload("rm -rf"));
const t0 = Date.parse("2026-10-29T05:00:00Z");
assert.equal(collectorStatus({ seenAt: "2026-10-29T04:59:30Z" }, t0).state, "on");
assert.equal(collectorStatus({ seenAt: "2026-10-29T04:57:00Z" }, t0).state, "late");
assert.equal(collectorStatus({ seenAt: "2026-10-29T04:00:00Z" }, t0).state, "off");
assert.equal(collectorStatus({}, t0).state, "off");
assert.deepEqual(collectorStatus({ last: { at: "2026-10-29 13:00", count: 3, vendors: { 에이블리: { state: "로그인 필요", count: 0, note: "n" } } } }, t0).last.vendors, [{ vendor: "에이블리", state: "로그인 필요", count: 0, note: "n" }]);
const job = normalizeCsJob({ id: "J1", kind: "register", status: "대기", body: { count: 2 }, result: { message: "m" } });
assert.equal(job.label, "등록");
assert.equal(job.count, 2);
assert.match(jobsHtml([job], collectorStatus({ seenAt: "2026-10-29T04:00:00Z", pc: "OFFICE" }, t0)), /○ 꺼짐[\s\S]*자동으로 같이 켜짐[\s\S]*data-job-cancel="J1"/);
assert.deepEqual(usageForMonth({ "2026-10-01": { n: 2, won: 1.5 }, "2026-10-29": { n: 1, won: 0.7 }, "2026-11-01": { n: 9, won: 9 } }, 2026, 10), { days: [{ day: "2026-10-01", n: 2, won: 1.5 }, { day: "2026-10-29", n: 1, won: 0.7 }], n: 3, won: 2.2 });
const lockedCard = cardHtml(requested, 1, initialView(requested), { aiReady: true });
assert.match(lockedCard, /📤 등록 요청됨/);
assert.doesNotMatch(lockedCard, /is-pending/, "locked (registering) cards are disabled, not red");
assert.match(lockedCard, /data-act="pick"[^>]*disabled/);

// ---------- Apps Script (가짜 시트) ----------
const TOKEN = "board-token-123";
const COLLECTOR = "collector-token-456";
let claudeText = JSON.stringify(["AI 답 1", "AI 답 2", "AI 답 3"]);
const gas = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN, COLLECTOR_TOKEN: COLLECTOR, CLAUDE_KEY: "test-key", AI_DAILY_LIMIT: "4" }, claude: () => ({ status: 200, text: claudeText }) });
assert.deepEqual(gas.get(), { ok: true, service: "system-v3-cs-board", version: 5 }, "GET returns no data");
assert.equal(gas.post({ action: "list" }).denied, true, "token required");
assert.equal(gas.post({ action: "list", token: COLLECTOR }).denied, true, "collector token cannot read");
assert.equal(gas.post({ action: "ingest", token: TOKEN, rows: [] }).denied, true, "board token cannot ingest");
assert.equal(gas.post({ action: "poll", token: TOKEN }).denied, true, "board token cannot take jobs");
assert.equal(gas.post({ action: "request", token: COLLECTOR, kind: "collect" }).denied, true, "collector token cannot request");
assert.equal(gas.post({ action: "delete", token: TOKEN }).ok, false);
let res = gas.post({ action: "list", token: TOKEN });
assert.deepEqual(Array.from(res.rows), []);
assert.equal(res.aiEnabled, true);
assert.equal(res.collector.seenAt, "");
assert.equal(gas.timeZone(), "Asia/Seoul");
const sheet = gas.sheet();
assert.equal(sheet.data[0][0], "키");
assert.equal(sheet.data[0][15], "등록");

// 처음설정: 비밀번호가 없을 때만 만들고 로그에 보여줌 (이미 있으면 그대로)
gas.ctx["처음설정"]();
assert.equal(gas.properties.BOARD_TOKEN, TOKEN, "existing tokens kept");
assert.match(gas.logs.join("\n"), /BOARD_TOKEN = board-token-123/);
const fresh = await loadCsBoardScript({ props: {} });
fresh.ctx["처음설정"]();
assert.match(fresh.properties.BOARD_TOKEN, /^[0-9a-f]{24}$/);
assert.match(fresh.properties.COLLECTOR_TOKEN, /^[0-9a-f]{24}$/);
assert.notEqual(fresh.properties.BOARD_TOKEN, fresh.properties.COLLECTOR_TOKEN);
assert.ok(fresh.jobs(), "요청 tab created");

const collected = [
  { 업체: "지그재그", 게시판: "주문문의", id: "z1", 날짜: "2026-10-29 10:00", 상품명: "=SUM(1)", 문의: "바 변경 되나요?", 유형: "주문문의", 옵션: "6mm", 상품링크: "https://shop/p/1", 상품이미지: "javascript:x", 사진URL: ["https://img/1.jpg", "ftp://no"], 맥락: [{ 구분: "이전", 날짜: "10-27", 내용: "q", 답변: "a" }], 답변안: ["안 1", "안 2"] },
  { 업체: "스마트스토어", 게시판: "상품문의", id: "s1", 날짜: "2026-10-29 09:00", 상품명: "별 피어싱", 문의: "언제 와요?" },
  { 업체: "", id: "bad" },
  { 업체: "에이블리", 게시판: "문의", id: "t1", 날짜: "2026-10-29 09:00", 문의: "테스트", 가상: true },
];
const snap = { kind: "문의", vendors: { 지그재그: { 상태: "ok", 건수: 1 }, 스마트스토어: { 상태: "ok", 건수: 1 }, 에이블리: { 상태: "로그인 필요", 건수: 0, 메모: "다시 로그인" } }, days: 7, collectedAt: "2026-10-29 11:00", file: "수집_261029_1100.json" };
res = gas.post({ action: "ingest", token: COLLECTOR, rows: collected, snapshot: snap, autoSuggest: false });
assert.deepEqual([res.added, res.updated, res.closed], [2, 0, 0], "test (가상) rows skipped");
res = gas.post({ action: "list", token: TOKEN });
assert.equal(res.rows.length, 2);
assert.equal(res.collector.last.vendors["에이블리"].state, "로그인 필요", "last collection status remembered");
assert.equal(res.collector.last.at, "2026-10-29 11:00");
const z = res.rows.find((r) => r.key === "지그재그_주문문의_z1");
assert.equal(z.product, "=SUM(1)", "formula text stays text");
assert.equal(z.inquiry.productImage, "", "non-https dropped");
assert.deepEqual(Array.from(z.inquiry.photos), ["https://img/1.jpg"]);
assert.equal(z.inquiry.context[0].answer, "a");
assert.equal(z.inquiry.kind, "문의");
assert.deepEqual(Array.from(z.drafts.map((d) => d.text)), ["안 1", "안 2"]);
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

// 다시 수집: 선택·답변안 그대로, 사라진 문의(=답변됨)는 종료, 다시 나타나면 다시 열림
res = gas.post({ action: "ingest", token: COLLECTOR, rows: [{ ...collected[0], 문의: "바 변경 되나요? (수정)", 답변안: ["다른 안"] }], snapshot: { ...snap, collectedAt: "2026-10-29 12:00" }, autoSuggest: false });
assert.deepEqual([res.added, res.updated, res.closed], [0, 1, 1], "s1 missing from a successful smartstore run → closed");
res = gas.post({ action: "list", token: TOKEN });
assert.deepEqual(Array.from(res.rows.map((r) => r.key)), [z.key]);
assert.equal(res.rows[0].inquiry.question, "바 변경 되나요? (수정)");
assert.deepEqual(Array.from(res.rows[0].drafts.map((d) => d.text)), ["안 1", "안 2"], "existing drafts kept");
assert.equal(res.rows[0].choice.hold, true, "choice kept");
res = gas.post({ action: "ingest", token: COLLECTOR, rows: [collected[1]], snapshot: { kind: "문의", vendors: { 스마트스토어: { 상태: "ok" } }, days: 7, collectedAt: "2026-10-29 13:00" }, autoSuggest: false });
assert.equal(res.reopened, 1, "reappearing inquiry is reopened");
assert.equal(res.closed, 0, "zigzag not in this snapshot → untouched");
// 수집 실패한 업체·기간 밖 문의는 닫지 않음
gas.post({ action: "ingest", token: COLLECTOR, rows: [{ 업체: "메이크샵", 게시판: "Q&A", id: "old", 날짜: "2026-09-01 10:00", 문의: "오래된 문의" }], autoSuggest: false });
res = gas.post({ action: "ingest", token: COLLECTOR, rows: [], snapshot: { kind: "문의", vendors: { 메이크샵: { 상태: "ok" }, 지그재그: { 상태: "오류" } }, days: 7, collectedAt: "2026-10-29 14:00" }, autoSuggest: false });
assert.equal(res.closed, 0, "outside the collection window or failed vendor → kept open");
assert.equal(sheet.data.length, 4, "header + 3 rows: no duplicates, rows never deleted");

// 리뷰: 같은 시트, 게시판 '리뷰'. 에이블리처럼 답글 불가는 표시만
res = gas.post({ action: "ingest", token: COLLECTOR, rows: [
  { 업체: "지그재그", 게시판: "리뷰", id: "r1", 날짜: "2026-10-29 08:00", 상품명: "별", 별점: 5, 내용: "예뻐요", 사진URL: ["https://img/r.jpg"] },
  { 업체: "에이블리", 게시판: "리뷰", id: "r2", 날짜: "2026-10-29 08:00", 내용: "그냥", 답글불가: true },
], snapshot: { kind: "리뷰", vendors: { 지그재그: { 상태: "ok" }, 에이블리: { 상태: "ok" } }, days: 30, collectedAt: "2026-10-29 14:00" } });
assert.equal(res.added, 2);
assert.equal(res.suggested, 1, "AI drafts made in one batch for new rows, not for no-reply reviews");
assert.deepEqual(gas.fetchAllCalls, [1]);
assert.match(gas.calls.at(-1).payload.system[0].text, /리뷰 답글일 때/);
assert.match(gas.calls.at(-1).payload.messages[0].content, /이번 리뷰 \(별점 5\):\n고객: 예뻐요/);
res = gas.post({ action: "list", token: TOKEN });
const r1 = res.rows.find((r) => r.key === "지그재그_리뷰_r1");
assert.equal(r1.inquiry.kind, "리뷰");
assert.equal(r1.inquiry.type, "별점 5");
assert.equal(r1.drafts.length, 3);
assert.equal(res.rows.find((r) => r.key === "에이블리_리뷰_r2").inquiry.noReply, true);
assert.equal(res.collector.reviewLast.at, "2026-10-29 14:00");

// AI 추천: 답변안 뒤에 붙음, 선택·버전은 그대로, 하루 한도(4회: 자동 1 + 수동 3)
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
assert.doesNotMatch(call.payload.system[0].text, /리뷰 답글일 때/);
assert.equal(call.payload.system[0].cache_control.type, "ephemeral");
assert.match(call.payload.messages[0].content, /고객: 언제 와요\?/);
claudeText = "설명 없이\n- 첫째 답변 문장입니다\n- 둘째 답변 문장입니다";
res = gas.post({ action: "suggest", token: TOKEN, key: z.key });
assert.deepEqual(Array.from(res.row.drafts.slice(2).map((d) => d.text)), ["첫째 답변 문장입니다", "둘째 답변 문장입니다"], "line fallback like the collector");
assert.match(gas.calls.at(-1).payload.messages[0].content, /이전 대화[\s\S]*고객: q[\s\S]*우리: a/);
gas.post({ action: "suggest", token: TOKEN, key: z.key });
res = gas.post({ action: "suggest", token: TOKEN, key: z.key });
assert.equal(res.ok, false);
assert.match(res.error, /한도\(4회\)/);
assert.equal(gas.calls.length, 4, "limit stops before calling the API");
const usage = gas.post({ action: "usage", token: TOKEN }).usage;
const today = Object.keys(usage)[0];
assert.equal(usage[today].n, 4);
assert.equal(usage[today].kinds["게시판"], 3);
assert.equal(usage[today].kinds["리뷰"], 1);
assert.ok(usage[today].won > 0);

// 수집기 PC에 요청: 같은 종류가 대기 중이면 새로 안 만듦 → poll 이 가져가고 finish 로 끝
res = gas.post({ action: "request", token: TOKEN, kind: "collect", options: { vendors: ["지그재그", "=x"] }, editor: "희진" });
assert.equal(res.ok, true);
assert.equal(res.job.status, "대기");
const jobId = res.job.id;
assert.equal(gas.post({ action: "request", token: TOKEN, kind: "collect" }).duplicate, true);
assert.equal(gas.post({ action: "request", token: TOKEN, kind: "nope" }).ok, false);
res = gas.post({ action: "poll", token: COLLECTOR, pc: "OFFICE-PC", version: "9.1", busy: true });
assert.equal(res.job, null, "busy collector gets no job");
res = gas.post({ action: "poll", token: COLLECTOR, pc: "OFFICE-PC", version: "9.1" });
assert.equal(res.job.id, jobId);
assert.equal(res.job.kind, "collect");
assert.deepEqual(JSON.parse(JSON.stringify(res.job.body)), { vendors: ["지그재그", "=x"] });
assert.equal(gas.post({ action: "poll", token: COLLECTOR, pc: "OTHER" }).job, null, "a running job is taken by one PC only");
assert.equal(gas.post({ action: "cancel", token: TOKEN, id: jobId }).ok, false, "running jobs cannot be cancelled");
res = gas.post({ action: "list", token: TOKEN });
assert.equal(res.collector.pc, "OTHER");
assert.equal(res.jobs[0].status, "실행중");
assert.equal(res.jobs[0].pc, "OFFICE-PC");
assert.equal(gas.post({ action: "finish", token: COLLECTOR, id: jobId, ok: true, message: "수집_x.json · 3건", count: 3 }).ok, true);
assert.equal(gas.post({ action: "finish", token: COLLECTOR, id: jobId, ok: true }).ok, false, "finish only once");
res = gas.post({ action: "list", token: TOKEN });
assert.equal(res.jobs[0].status, "완료");
assert.equal(res.jobs[0].result.message, "수집_x.json · 3건");
// 대기 중 취소
res = gas.post({ action: "request", token: TOKEN, kind: "reviews", options: { vendors: ["에이블리"], reviewDays: 14 } });
assert.equal(gas.post({ action: "cancel", token: TOKEN, id: res.job.id }).ok, true);
assert.equal(gas.post({ action: "poll", token: COLLECTOR, pc: "OFFICE-PC" }).job, null, "cancelled jobs are not taken");

// 📤 등록: 채택된 스마트스토어 문의만, 문안을 찍어 두고 잠금 → 결과로 등록완료(종료)·확인 필요
gas.post({ action: "save", token: TOKEN, key: s1.key, baseVersion: 0, choice: { pick: 2, edits: { 2: "최종 답변" } } });
assert.equal(gas.post({ action: "request", token: TOKEN, kind: "register", keys: [z.key] }).ok, false, "zigzag is not auto-registered");
res = gas.post({ action: "request", token: TOKEN, kind: "register", keys: [s1.key, z.key, "없는키"], editor: "희진" });
assert.equal(res.ok, true);
assert.ok(res.rows.find((r) => r.key === s1.key).reg.state === "요청");
assert.equal(gas.post({ action: "save", token: TOKEN, key: s1.key, baseVersion: 1, choice: { pick: 0 } }).ok, false, "locked while registering");
assert.equal(gas.post({ action: "request", token: TOKEN, kind: "register", keys: [s1.key] }).ok, false, "no double request");
const reg = gas.post({ action: "poll", token: COLLECTOR, pc: "OFFICE-PC" }).job;
assert.equal(reg.kind, "register");
assert.deepEqual(JSON.parse(JSON.stringify(reg.body.items)), [{ key: s1.key, vendor: "스마트스토어", board: "상품문의", id: "s1", date: "2026-10-29 09:00", text: "최종 답변" }]);
gas.post({ action: "finish", token: COLLECTOR, id: reg.id, ok: true, message: "등록 1건", results: [{ key: s1.key, state: "등록완료", note: "2026-10-29 14:10" }] });
res = gas.post({ action: "list", token: TOKEN });
const done = res.rows.find((r) => r.key === s1.key);
assert.equal(done.closed, true, "registered rows close");
assert.equal(done.reg.state, "완료");
assert.equal(sheet.data.find((r) => r[0] === s1.key)[6], "등록완료");
assert.equal(res.jobs[0].body.count, 1, "list hides register texts, shows count");
// 등록 확인 필요 → 다시 고칠 수 있게 풀림
gas.post({ action: "ingest", token: COLLECTOR, rows: [{ 업체: "스마트스토어", 게시판: "고객문의", id: "s2", 날짜: "2026-10-29 10:00", 문의: "환불?" , 답변안: ["안"] }], autoSuggest: false });
const s2 = "스마트스토어_고객문의_s2";
gas.post({ action: "save", token: TOKEN, key: s2, baseVersion: 0, choice: { pick: 0 } });
gas.post({ action: "request", token: TOKEN, kind: "register", keys: [s2] });
const reg2 = gas.post({ action: "poll", token: COLLECTOR, pc: "OFFICE-PC" }).job;
gas.post({ action: "finish", token: COLLECTOR, id: reg2.id, ok: true, results: [{ key: s2, state: "확인 필요", note: "HTTP 500" }] });
const s2row = gas.post({ action: "list", token: TOKEN }).rows.find((r) => r.key === s2);
assert.equal(s2row.reg.state, "확인 필요");
assert.equal(s2row.closed, false);
assert.equal(gas.post({ action: "save", token: TOKEN, key: s2, baseVersion: 1, choice: { pick: 0 } }).ok, true, "unlocked after a failed registration");

// 종료: 목록에서 빠지고 줄은 남음
res = gas.post({ action: "close", token: COLLECTOR, keys: [z.key, "없는키"] });
assert.equal(res.changed, 1);
assert.equal(gas.post({ action: "save", token: TOKEN, key: z.key, baseVersion: 9, choice: {} }).ok, false, "closed rows are read-only");

// 키 없으면 AI 요청 거절(외부 호출 없음), 자동 추천도 안 함
const noKey = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN, COLLECTOR_TOKEN: COLLECTOR } });
assert.equal(noKey.post({ action: "ingest", token: COLLECTOR, rows: [collected[1]] }).suggested, 0);
assert.equal(noKey.post({ action: "list", token: TOKEN }).aiEnabled, false);
assert.match(noKey.post({ action: "suggest", token: TOKEN, key: s1.key }).error, /CLAUDE_KEY/);
assert.equal(noKey.calls.length, 0);
// 토큰이 설정되지 않은 시트는 아무도 못 씀
const unset = await loadCsBoardScript({ props: {} });
assert.equal(unset.post({ action: "list", token: "" }).denied, true);
// v1 시트(15칸)에는 '등록' 머리글만 추가
const v1 = (await import("./helpers/csBoardFakeSheet.mjs")).fakeSheet("CS문의");
v1.data.push(["키", "업체", "게시판", "문의ID", "문의시각", "상품명", "상태", "문의", "답변안", "선택", "버전", "수정자", "수정시각", "수집시각", "종료"]);
const old = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN }, sheets: [v1] });
old.post({ action: "list", token: TOKEN });
assert.equal(v1.data[0][15], "등록");

// 수집기 PC 처음 설정 상태 (연결 1.2): poll 로 받아 정해진 칸만 저장 → 화면 안내창 ✅/⬜
res = gas.post({ action: "poll", token: COLLECTOR, pc: "OFFICE-PC", version: "9.4 (2026-10-29) / 연결 1.2 (2026-10-29) · 창 없이", setup: {
  dir: "C:\\x\\G1_CS수집기", out_dir: "C:\\x\\수집", days: 7, zz_slug: "pink-rocket", show_browser: false, vendors: ["지그재그"], review_vendors: [],
  login_ok: true, api: "own", claude: false, parts: true, icon: true, autostart: true, bg: true, link: "1.2 (2026-10-29)", ss_secret: "SHOULD-NOT-STAY",
} });
res = gas.post({ action: "list", token: TOKEN });
assert.equal(res.collector.version, "9.4 (2026-10-29) / 연결 1.2 (2026-10-29) · 창 없이", "longer version kept");
assert.equal(res.collector.setup.outDir, "C:\\x\\수집");
assert.equal(res.collector.setup.bg, true);
assert.equal(JSON.stringify(res.collector).includes("SHOULD-NOT-STAY"), false, "unknown fields are dropped");
const live = collectorStatus({ ...res.collector, seenAt: new Date().toISOString() });
assert.equal(live.setup.api, "own");
assert.deepEqual(live.setup.vendors, ["지그재그"]);
assert.equal(collectorStatus({}).setup, null);

const { setupSteps, setupProgress, guideStepsHtml, collectorSettingsView } = await import("../src/app/csSetupGuide.mjs");
let steps = setupSteps({});
assert.equal(steps.length, 9);
assert.equal(steps[0].done, false, "web not connected");
assert.equal(steps[1].done, null, "unknown before the collector reports");
assert.equal(setupProgress(steps).next.key, "web");
steps = setupSteps({ connected: true, aiEnabled: true, collector: live });
assert.deepEqual(steps.map((x) => x.done), [true, true, false, true, true, true, true, true, true], "auto collection is off in this fake");
assert.equal(setupProgress(steps).next.key, "auto");
assert.match(steps[6].copy[0].text, /^"C:\\x\\G1_CS수집기\\▶G1수집기_5_웹연결\.bat"$/, "Win+R path uses the collector folder it reported");
const guideHtml = guideStepsHtml(steps, { live: false, focus: "first" });
assert.match(guideHtml, /data-guide-step="first"[^>]*>/);
assert.match(guideHtml, /is-focus/);
assert.match(guideHtml, /data-guide-act="job:collect" disabled/, "job buttons wait for a live connection");
assert.match(guideHtml, /커머스API센터 ↗/);
assert.equal(collectorSettingsView(live).zzSlug, "pink-rocket");
assert.equal(collectorSettingsView(null), null);
const offline = setupSteps({ connected: true, collector: collectorStatus({ ...res.collector, seenAt: "2026-01-01T00:00:00Z", last: { at: "x", vendors: { 에이블리: { state: "로그인 필요" } } } }) });
assert.equal(offline.find((x) => x.key === "link").done, false, "collector off");
assert.equal(offline.find((x) => x.key === "login").done, false, "login needed from the last collection");

// ---------- v4: 수집기 PC 일 (로그인·설정·API·IP·파일·자동 수집) ----------
{
  const { csPcPayload, latestJob, autoSettings, normalizeCsJob: nj } = await import("../src/domain/csBoard.mjs");
  const { lockForPc } = await import("../src/app/csPcLock.mjs");
  const pair = await crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
  const pubN = (await crypto.subtle.exportKey("jwk", pair.publicKey)).n;
  const sealed = await lockForPc(pubN, "비밀번호!123");
  assert.match(sealed, /^[A-Za-z0-9_-]{340,350}$/);
  const opened = new TextDecoder().decode(await crypto.subtle.decrypt({ name: "RSA-OAEP" }, pair.privateKey, Buffer.from(sealed, "base64url")));
  assert.equal(opened, "비밀번호!123", "only the private key holder can open it");
  await assert.rejects(() => lockForPc("", "x"), /잠금 키가 아직 없습니다/);
  await assert.rejects(() => lockForPc(pubN, "x".repeat(191)), /너무 깁니다/);

  // 화면 → 요청 모양
  assert.throws(() => csPcPayload("collect"), /알 수 없는 요청/);
  assert.throws(() => csPcPayload("login", { vendors: [] }), /업체를 고르세요/);
  const loginBody = csPcPayload("login", { vendors: ["지그재그", "없는곳"], creds: { 지그재그: { id: sealed, pw: sealed }, 에이블리: { id: sealed, pw: sealed } }, collectAfter: true }, "시험");
  assert.deepEqual(loginBody.options.vendors, ["지그재그"]);
  assert.deepEqual(Object.keys(loginBody.options.creds), ["지그재그"], "creds only for chosen vendors");
  assert.deepEqual(autoSettings({ on: true, hour: "9", minute: "5", interval: "5" }), { auto_on: true, auto_start: "09:05", interval: 10 });

  // 시트: 잠긴 값만 받고, 수집기 PC가 가져가면 지움
  const g4 = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN, COLLECTOR_TOKEN: COLLECTOR } });
  assert.equal(g4.post({ action: "request", token: TOKEN, kind: "auto" }).ok, false, "staff cannot fake an auto job");
  assert.equal(g4.post({ action: "request", token: TOKEN, kind: "testReviews", options: { vendors: ["지그재그"], reviewDays: 7 } }).ok, true, "test review collection is accepted");
  assert.equal(g4.post({ action: "request", token: TOKEN, kind: "login", options: { vendors: ["지그재그"], creds: { 지그재그: { id: "plain-password", pw: "plain" } } } }).job.body.creds["지그재그"], undefined, "plain text is not accepted as a locked value");
  const lr = g4.post({ ...loginBody, token: TOKEN });
  assert.equal(lr.ok, true);
  assert.equal(lr.job.body.creds["지그재그"], "(전달됨)", "screen never gets the locked value back");
  const sheetCell = () => JSON.stringify(g4.jobs().data);
  assert.equal(sheetCell().includes(sealed), true, "locked value waits in the sheet only until taken");
  assert.equal(g4.post({ action: "request", token: TOKEN, kind: "login", options: { vendors: ["에이블리"] } }).ok, true, "a new login replaces the waiting one");
  assert.equal(sheetCell().includes(sealed), false, "replaced request is wiped");
  assert.match(sheetCell(), /새 요청으로 바꿈/);
  g4.post({ ...loginBody, token: TOKEN });
  let taken = g4.post({ action: "poll", token: COLLECTOR, pc: "OFFICE-PC" }).job;
  assert.equal(taken.kind, "testReviews");
  g4.post({ action: "finish", token: COLLECTOR, id: taken.id, ok: true, message: "리뷰 0건" });
  taken = g4.post({ action: "poll", token: COLLECTOR, pc: "OFFICE-PC" }).job;
  assert.equal(taken.kind, "login");
  assert.equal(taken.body.creds["지그재그"].pw, sealed, "the collector PC gets the locked value");
  assert.equal(sheetCell().includes(sealed), false, "wiped from the sheet as soon as the PC takes it");
  // 진행 안내 → 화면 요청 현황
  assert.equal(g4.post({ action: "progress", token: COLLECTOR, id: taken.id, message: "지그재그: 휴대폰에서 [확인]을 눌러 주세요" }).ok, true);
  let job = nj(g4.post({ action: "list", token: TOKEN }).jobs.find((j) => j.id === taken.id));
  assert.equal(job.status, "실행중");
  assert.equal(job.progress, true);
  assert.match(job.message, /휴대폰에서/);
  assert.equal(g4.post({ action: "progress", token: TOKEN, id: taken.id, message: "x" }).denied, true, "only the collector reports progress");
  g4.post({ action: "finish", token: COLLECTOR, id: taken.id, ok: true, message: "지그재그 ✓", data: { login: { 지그재그: { state: "ok" } } } });
  job = nj(g4.post({ action: "list", token: TOKEN }).jobs.find((j) => j.id === taken.id));
  assert.equal(job.data.login["지그재그"].state, "ok");

  // 설정: 아는 칸·범위만
  const sr = g4.post({ action: "request", token: TOKEN, kind: "settings", options: { settings: { days: 500, review_days: 14, zz_slug: "Pink Rocket", auto_on: true, auto_start: "25:00", interval: 30, vendors: { 메이크샵: false, 없는곳: true }, ss_secret_enc: "x" } } });
  assert.deepEqual(JSON.parse(JSON.stringify(sr.job.body.settings)), { review_days: 14, auto_on: true, interval: 30, vendors: { 메이크샵: false } });
  assert.equal(g4.post({ action: "request", token: TOKEN, kind: "settings", options: { settings: { days: 0 } } }).ok, false, "nothing valid to change");
  // API 키: 잠긴 값만
  assert.equal(g4.post({ action: "request", token: TOKEN, kind: "apiKey", options: { clientId: "plain", secret: "plain" } }).ok, false);
  const ak = g4.post({ action: "request", token: TOKEN, kind: "apiKey", options: { clientId: sealed, secret: sealed } });
  assert.equal(ak.job.body.secret, "(전달됨)");
  // 자동 수집: 수집기 PC가 스스로 기록. 다른 요청이 실행 중이면 안 함
  g4.post({ action: "cancel", token: TOKEN, id: ak.job.id });
  assert.equal(sheetCell().includes(sealed), false, "cancelled secret request is wiped");
  const busyJob = g4.post({ action: "poll", token: COLLECTOR, pc: "OFFICE-PC" }).job;
  assert.equal(g4.post({ action: "selfJob", token: COLLECTOR, kind: "auto", vendors: ["지그재그"], pc: "OFFICE-PC" }).busy, true);
  g4.post({ action: "finish", token: COLLECTOR, id: busyJob.id, ok: true, message: "저장" });
  const auto = g4.post({ action: "selfJob", token: COLLECTOR, kind: "auto", vendors: ["지그재그"], pc: "OFFICE-PC" });
  assert.equal(auto.ok, true);
  assert.equal(g4.post({ action: "selfJob", token: TOKEN, kind: "auto" }).denied, true);
  g4.post({ action: "finish", token: COLLECTOR, id: auto.job.id, ok: true, message: "수집_1.json · 3건", count: 3 });
  const jobs4 = g4.post({ action: "list", token: TOKEN }).jobs.map(nj);
  const autoJob = jobs4.find((j) => j.kind === "auto");
  assert.equal(autoJob.label, "⏰ 자동 수집");
  assert.equal(autoJob.by, "자동");
  assert.equal(autoJob.status, "완료");
  // 파일 목록 결과
  const fj = g4.post({ action: "request", token: TOKEN, kind: "files" }).job;
  g4.post({ action: "poll", token: COLLECTOR, pc: "OFFICE-PC" });
  g4.post({ action: "finish", token: COLLECTOR, id: fj.id, ok: true, message: "수집 · 최근 1개", data: { files: [{ name: "수집_1.json", size: 2048, at: "2026-10-29 15:00" }] } });
  const latest = latestJob(g4.post({ action: "list", token: TOKEN }).jobs.map(nj), "files");
  assert.equal(latest.data.files[0].name, "수집_1.json");
  // 공개키·저장된 로그인·자동 수집 상태
  g4.post({ action: "poll", token: COLLECTOR, pc: "OFFICE-PC", setup: { pub_key: pubN, auto_on: true, next_auto: "10-29 16:00", saved_logins: ["지그재그"], rsa_enc: "NO" } });
  const cs4 = collectorStatus({ ...g4.post({ action: "list", token: TOKEN }).collector, seenAt: new Date().toISOString() });
  assert.equal(cs4.setup.pubKey, pubN);
  assert.equal(cs4.setup.autoOn, true);
  assert.deepEqual(cs4.setup.savedLogins, ["지그재그"]);
  assert.equal(JSON.stringify(cs4).includes("NO"), false);
}

// ---------- v5: 웹연결 업데이트 요청 · 상품명 요청 ----------
{
  const { csPcPayload, linkRawUrl, linkVersionOf, linkVersionNewer } = await import("../src/domain/csBoard.mjs");
  const commit = "b".repeat(40);
  const url = linkRawUrl(commit);
  assert.equal(url, `https://raw.githubusercontent.com/w-works-official/Picking_System/${commit}/docs/g1_v3_link.py`);
  assert.throws(() => linkRawUrl("main"), /커밋/);
  assert.equal(linkVersionOf('LINK_VER = "1.4 (2026-10-29)"'), "1.4 (2026-10-29)");
  assert.equal(linkVersionNewer("1.4 (x)", "1.3.1 (y)"), true);
  assert.equal(linkVersionNewer("1.3.1", "1.3.1 (y)"), false);
  assert.throws(() => csPcPayload("update", { url, sha256: "x" }), /확인값/);
  const g5 = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN, COLLECTOR_TOKEN: COLLECTOR, CLAUDE_KEY: "k" }, claude: () => ({ status: 200, text: JSON.stringify(["써지컬 미니 볼 피어싱 얇은 0.8mm 20종", "데일리 미니 볼 피어싱 써지컬 0.8mm"]) }) });
  assert.equal(g5.get().version, 5);
  const sha = "c".repeat(64);
  assert.equal(g5.post({ action: "request", token: TOKEN, kind: "update", options: { url: url.replace("w-works-official", "someone"), sha256: sha } }).ok, false, "only this repository");
  assert.equal(g5.post({ action: "request", token: TOKEN, kind: "update", options: { url: url.replace(commit, "main"), sha256: sha } }).ok, false, "pinned commit only");
  const ur = g5.post({ ...csPcPayload("update", { url, sha256: sha, ver: "1.4 (2026-10-29)" }, "시험"), token: TOKEN });
  assert.equal(ur.ok, true);
  const uj = g5.post({ action: "poll", token: COLLECTOR, pc: "OFFICE-PC" }).job;
  assert.deepEqual(JSON.parse(JSON.stringify(uj.body)), { url, sha256: sha, ver: "1.4 (2026-10-29)" });
  // 상품명 요청: 규칙 탭(A1)을 만들고, 고치면 그 규칙으로
  assert.equal(g5.post({ action: "name", token: COLLECTOR, keywords: "x" }).denied, true, "screen token only");
  assert.equal(g5.post({ action: "name", token: TOKEN, keywords: " " }).ok, false);
  const nr = g5.post({ action: "name", token: TOKEN, keywords: "써지컬 볼 피어싱 0.8mm 20종", count: 2, editor: "시험" });
  assert.equal(nr.ok, true);
  assert.deepEqual(Array.from(nr.names), ["써지컬 미니 볼 피어싱 얇은 0.8mm 20종", "데일리 미니 볼 피어싱 써지컬 0.8mm"]);
  const rulesSheet = g5.sheets.find((x) => x.getName() === "상품명 규칙");
  assert.match(String(rulesSheet.data[0][0]), /임시/);
  rulesSheet.data[0][0] = "새 규칙: 반드시 '핑크로켓' 으로 시작";
  g5.post({ action: "name", token: TOKEN, keywords: "하트 귀걸이" });
  assert.match(g5.calls.at(-1).payload.system[0].text, /^새 규칙: 반드시/, "edited rules are used right away");
  assert.match(g5.calls.at(-1).payload.messages[0].content, /하트 귀걸이[\s\S]*5개/, "default 5 names");
  const logSheet = g5.sheets.find((x) => x.getName() === "상품명 요청");
  assert.equal(logSheet.data.length, 3, "header + 2 requests kept");
  assert.equal(g5.post({ action: "usage", token: TOKEN }).usage[Object.keys(g5.post({ action: "usage", token: TOKEN }).usage)[0]].kinds["상품명"], 2);
}

// ---------- 엑셀 내려받기 / 적용 ----------
{
  const { csExcelSheet, csExcelChanges, CS_EXCEL_KEY } = await import("../src/domain/csExcel.mjs");
  const rowsX = [
    normalizeCsRow({ key: "스마트스토어_상품문의_1", vendor: "스마트스토어", board: "상품문의", id: "1", kind: "문의", inquiry: { question: "언제?" }, drafts: ["안 A", "안 B"] }),
    normalizeCsRow({ key: "지그재그_주문문의_2", vendor: "지그재그", board: "주문문의", id: "2", kind: "문의", inquiry: { question: "바 변경?" }, drafts: ["가능", "불가"], choice: { pick: 0 } }),
    normalizeCsRow({ key: "지그재그_리뷰_3", vendor: "지그재그", board: "리뷰", id: "3", kind: "리뷰", inquiry: { question: "좋아요" }, drafts: ["감사"] }),
    normalizeCsRow({ key: "스마트스토어_상품문의_4", vendor: "스마트스토어", board: "상품문의", id: "4", kind: "문의", drafts: ["x"], choice: { pick: 0 }, reg: { state: "요청" } }),
  ];
  const sheetX = csExcelSheet(rowsX, "문의");
  assert.equal(sheetX.count, 3);
  assert.deepEqual(sheetX.header.slice(-3), ["답변안 A", "답변안 B", CS_EXCEL_KEY]);
  assert.equal(sheetX.body[1][6], "A", "current pick shown");
  const rec = (row, patch) => Object.fromEntries(sheetX.header.map((h, i) => [h, patch[h] ?? row[i]]));
  const { changes, locked } = csExcelChanges(rowsX, [
    rec(sheetX.body[0], { 채택: "b", "최종 문안": "안 B (고침)" }),
    rec(sheetX.body[1], { 보류: "O" }),
    rec(sheetX.body[2], { 채택: "" }),
    { [CS_EXCEL_KEY]: "없는키", 채택: "A" },
  ]);
  assert.equal(locked, 1, "registering rows are not touched");
  assert.equal(changes.length, 2);
  assert.equal(changes[0].choice.pick, 1);
  assert.equal(changes[0].choice.edits[1], "안 B (고침)");
  assert.equal(changes[1].choice.hold, true);
  assert.equal(changes[1].choice.pick, -1);
}

console.log("csBoard.mock.test: OK");
