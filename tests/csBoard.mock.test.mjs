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
  csLoginBoth,
  csLoginStatus,
} from "../src/domain/csBoard.mjs";
import { CS_SAMPLE_BOARD_ROWS, CS_SAMPLE_REVIEW_ROWS } from "../src/domain/csBoardSamples.mjs";
import { cardHtml, escapeHtml, jobsHtml, slotHtml } from "../src/app/csBoardApp.mjs";
import { fakeSheet, loadCsBoardScript } from "./helpers/csBoardFakeSheet.mjs";

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
assert.match(page, /📥 엑셀 등록/, "matches collector v9.1 buttons");
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
{
  // 11-11 메이크샵 게시판(Q&A) = 수집기 1.26 부터 자동
  const msQna = { ...ssPicked, key: "ms-qna", vendor: "메이크샵", board: "Q&A" };
  assert.equal(registerCandidates([msQna], "문의", "1.25 (2026-11-09)").auto.length, 0, "1.25 면 직접 등록");
  assert.equal(registerCandidates([msQna], "문의", "1.26 (2026-11-11)").auto.length, 1, "1.26 부터 자동");
  assert.equal(registerCandidates([{ ...msQna, vendor: "지그재그" }], "문의", "1.26").auto.length, 0, "지그재그는 아직 직접");
}
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
assert.deepEqual(gas.get(), { ok: true, service: "system-v3-cs-board", version: 25 }, "GET returns no data");
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
  g4.post({ action: "poll", token: COLLECTOR, pc: "OFFICE-PC", setup: { pub_key: pubN, auto_on: true, next_auto: "10-29 16:00", saved_logins: ["지그재그"], rsa_enc: "RSA_ENC_SECRET_MUST_NOT_LEAK" } });
  const cs4 = collectorStatus({ ...g4.post({ action: "list", token: TOKEN }).collector, seenAt: new Date().toISOString() });
  assert.equal(cs4.setup.pubKey, pubN);
  assert.equal(cs4.setup.autoOn, true);
  assert.deepEqual(cs4.setup.savedLogins, ["지그재그"]);
  assert.equal(JSON.stringify(cs4).includes("RSA_ENC_SECRET_MUST_NOT_LEAK"), false); // 무작위 공개키와 겹치지 않는 표시 (예전 "NO" 는 우연히 겹쳐 가끔 실패)
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
  assert.equal(g5.get().version, 25);
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


// 새 PC 설치 파일 (2026-10-31): 드라이브 설치 시작 bat · 파이썬 공식 설치 파일 · 수집기 폴더 — 링크만(비밀값 없음)
{
  const { readFile: rf } = await import("node:fs/promises");
  const html = await rf(new URL("../cs/index.html", import.meta.url), "utf8");
  const box = html.slice(html.indexOf('id="cs-install"'), html.indexOf("</fieldset>", html.indexOf('id="cs-install"')));
  assert.match(box, /id="cs-dl-start" href="https:\/\/drive\.google\.com\/uc\?export=download&amp;id=1qL1zAMl8DidneikJ8fPUA2dAb5MYszlL" target="_blank" rel="noopener"/);
  assert.match(box, /id="cs-dl-python" href="https:\/\/www\.python\.org\/ftp\/python\/3\.14\.10\/python-3\.14\.10-amd64\.exe"/);
  assert.match(box, /id="cs-dl-folder" href="https:\/\/drive\.google\.com\/drive\/folders\/1lKrSiKHNWqvGwt7mWtwWHIw-tTjy0zXc"/);
  assert.doesNotMatch(box, /data-live|disabled/, "설치 파일은 시트 연결 없이도 받을 수 있어야 함");
  assert.ok(html.indexOf('id="cs-install"') < html.indexOf("수집기 설정 (수집기 PC 전용)"), "웹 연결 바로 아래");
}

// ---------- v6: 간단 비밀번호로 열기 (UNLOCK_PASSWORD → BOARD_TOKEN) ----------
{
  const noPw = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN, COLLECTOR_TOKEN: COLLECTOR } });
  assert.match(noPw.post({ action: "unlock", password: "abc123" }).error, /UNLOCK_PASSWORD/, "설정 전에는 안 열림");
  const shortPw = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN, UNLOCK_PASSWORD: "12345" } });
  assert.equal(shortPw.post({ action: "unlock", password: "12345" }).ok, false, "6자 미만 비밀번호는 쓰지 않음");
  const g6 = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN, COLLECTOR_TOKEN: COLLECTOR, UNLOCK_PASSWORD: "pk2611" } });
  const good = g6.post({ action: "unlock", password: "pk2611" });
  assert.deepEqual(good, { ok: true, token: TOKEN }, "맞으면 긴 키를 돌려줌");
  assert.equal(g6.post({ action: "list", token: good.token }).ok, true, "받은 키로 바로 연결");
  assert.equal(g6.post({ action: "unlock", password: COLLECTOR }).ok, false, "수집기 키로는 안 열림");
  for (let i = 1; i <= 3; i += 1) assert.match(g6.post({ action: "unlock", password: `wrong${i}` }).error, /번 더 틀리면 잠깁니다/);
  assert.equal(g6.post({ action: "unlock", password: "pk2611" }).ok, true, "맞으면 틀린 횟수 초기화");
  assert.equal(g6.properties.UNLOCK_FAILS, "0");
  for (let i = 1; i <= 4; i += 1) g6.post({ action: "unlock", password: `wrong${i}` });
  const fifth = g6.post({ action: "unlock", password: "nope!!" });
  assert.equal(fifth.locked, true);
  assert.match(fifth.error, /5번 틀려 15분 동안 잠급니다/);
  const lockedTry = g6.post({ action: "unlock", password: "pk2611" });
  assert.equal(lockedTry.ok, false, "잠긴 동안은 맞는 비밀번호도 안 됨");
  assert.match(lockedTry.error, /분 뒤에 다시/);
  assert.equal(JSON.stringify(lockedTry).includes(TOKEN), false);
  g6.properties.UNLOCK_LOCK_UNTIL = String(Date.now() - 1000);   // 잠금 시간 지남
  for (let i = 1; i <= 4; i += 1) g6.post({ action: "unlock", password: `again${i}` });
  assert.match(g6.post({ action: "unlock", password: "again5" }).error, /30분 동안 잠급니다/, "두 번째 잠금은 2배");
  g6.properties.UNLOCK_LOCK_UNTIL = "0";
  assert.equal(g6.post({ action: "unlock", password: "pk2611" }).token, TOKEN);
  assert.equal(g6.properties.UNLOCK_FAILS, "0");
  assert.equal(g6.post({ action: "unlock" }).ok, false, "빈 값");
}


// 2026-11-04 v8: CS 화면이 열려 있으면(최근 3분 list·request) poll 이 hot → 수집기 PC가 3초마다 요청 확인
{
  const gh = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN, COLLECTOR_TOKEN: COLLECTOR } });
  assert.equal(gh.post({ action: "poll", token: COLLECTOR, pc: "PC" }).hot, false, "아무도 안 보면 평소 간격");
  gh.post({ action: "list", token: TOKEN });
  assert.equal(gh.post({ action: "poll", token: COLLECTOR, pc: "PC" }).hot, true, "화면을 보면 빠르게");
  const seen = gh.properties.WEB_SEEN;
  gh.post({ action: "list", token: TOKEN });
  assert.equal(gh.properties.WEB_SEEN, seen, "20초 안에 다시 와도 속성은 다시 안 씀");
  gh.properties.WEB_SEEN = String(Date.now() - 4 * 60 * 1000);
  assert.equal(gh.post({ action: "poll", token: COLLECTOR, pc: "PC" }).hot, false, "3분 지나면 평소대로");
  gh.post({ action: "request", token: TOKEN, kind: "collect", options: { vendors: ["지그재그"] } });
  assert.equal(gh.post({ action: "poll", token: COLLECTOR, pc: "PC" }).hot, true, "요청을 보내면 바로 빠르게");
}

// 2026-11-03 v7: 수집 결과 넣기(ingest)는 줄마다 따로 쓰지 않고 몰아서 씀 — 300건이 몇 분 걸려 다른 요청이 잠금에 막히던 문제
{
  const big = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN, COLLECTOR_TOKEN: COLLECTOR } });
  big.post({ action: "list", token: TOKEN }); // 시트 만들기
  const rows300 = Array.from({ length: 300 }, (_, i) => ({ 업체: "지그재그", 게시판: "리뷰", id: `r${i}`, 날짜: "2026-11-03 10:00", 상품명: `상품 ${i}`, 별점: 5, 내용: `리뷰 ${i}` }));
  const sh = big.sheet();
  let w0 = sh.writes;
  let r1 = big.post({ action: "ingest", token: COLLECTOR, rows: rows300, autoSuggest: false });
  assert.equal(r1.added, 300);
  assert.ok(sh.writes - w0 <= 2, `새 300건은 한 번에 씀 (쓰기 ${sh.writes - w0}번)`);
  assert.equal(sh.data.length, 301);
  assert.equal(sh.data[300][0], "지그재그_리뷰_r299");
  // 같은 300건을 다시 수집 → 갱신만, 쓰기 횟수는 몇 번 안 됨
  w0 = sh.writes;
  r1 = big.post({ action: "ingest", token: COLLECTOR, rows: rows300.map((r) => ({ ...r, 내용: r.내용 + " (수정)" })), autoSuggest: false });
  assert.deepEqual([r1.added, r1.updated], [0, 300]);
  assert.ok(sh.writes - w0 <= 2, `갱신 300건도 몰아서 씀 (쓰기 ${sh.writes - w0}번)`);
  assert.match(String(sh.data[150][7]), /리뷰 149 \(수정\)/, "문의 내용 갱신됨");
  assert.equal(sh.data.length, 301, "줄이 늘지 않음");
  // 사이사이 떨어진 줄만 갱신 → 떨어진 구간마다 한 번
  w0 = sh.writes;
  big.post({ action: "ingest", token: COLLECTOR, rows: [rows300[0], rows300[150], rows300[299]], autoSuggest: false });
  assert.equal(sh.writes - w0, 3, "멀리 떨어진 3줄 = 3번");
  // 수집 결과에서 빠진 리뷰는 자동 종료 — 몰아서 씀
  w0 = sh.writes;
  r1 = big.post({ action: "ingest", token: COLLECTOR, rows: rows300.slice(0, 10), snapshot: { kind: "리뷰", vendors: { 지그재그: { 상태: "ok" } }, days: 30, collectedAt: "2026-11-03 12:00" }, autoSuggest: false });
  assert.equal(r1.closed, 290);
  assert.ok(sh.writes - w0 <= 3, `자동 종료 290건도 몰아서 씀 (쓰기 ${sh.writes - w0}번)`);
  assert.equal(sh.data[300][6], "종료");
  assert.equal(sh.data[5][6] === "종료", false, "이번에 다시 보인 줄은 열린 채");
}


// 2026-11-03: 로그인 상태 — 지난 수집이 "로그인 필요"여도 그 뒤 로그인 성공이면 해결 메모 (바뀌었을 때만)
{
  const last = { at: "2026-11-02 18:14", vendors: [{ vendor: "메이크샵", state: "로그인 필요" }, { vendor: "에이블리", state: "ok" }, { vendor: "스마트스토어", state: "로그인 필요" }, { vendor: "지그재그", state: "ok" }] };
  const jobs = [
    { kind: "update", ended: "2026-11-03T05:03:00.000Z", data: { update: {} } },
    { kind: "login", ended: "2026-11-03T05:02:32.000Z", data: { login: { 메이크샵: { state: "ok", note: "로그인됨" } } } },
    { kind: "login", ended: "2026-11-02T09:05:00.000Z", data: { login: { 스마트스토어: { state: "fail", note: "3분" }, 에이블리: { state: "ok" } } } },
  ];
  const ms = csLoginStatus("메이크샵", { jobs, last });
  assert.equal(ms.ok, true);
  assert.equal(ms.changed, true);
  assert.match(ms.note, /지난 수집: 로그인 필요 → 11\/3 14:02 로그인 ✓ \(해결/);
  const ab = csLoginStatus("에이블리", { jobs, last });
  assert.deepEqual([ab.ok, ab.resolved, ab.changed], [true, true, false], "안 바뀌었으면 메모 없음");
  const ss = csLoginStatus("스마트스토어", { jobs, last });
  assert.deepEqual([ss.ok, ss.resolved, ss.changed], [false, false, false], "로그인 시도가 수집보다 먼저면 수집 결과 그대로");
  const ss2 = csLoginStatus("스마트스토어", { jobs: [{ kind: "login", ended: "2026-11-03T05:20:00.000Z", data: { login: { 스마트스토어: { state: "ok" } } } }, ...jobs], last });
  assert.deepEqual([ss2.ok, ss2.changed], [true, true], "스마트스토어도 해결되면 메모");
  const zz = csLoginStatus("지그재그", { jobs: [{ kind: "login", ended: "2026-11-03T05:30:00.000Z", data: { login: { 지그재그: { state: "fail", note: "만료" } } } }], last });
  assert.equal(zz.ok, false);
  assert.match(zz.note, /지난 수집: ✓ → .* 로그인 실패 \(만료\)/, "반대로 나빠져도 메모");
  assert.equal(csLoginStatus("지그재그", { jobs: [], last: null, saved: true }).resolved, true, "기록 없어도 저장된 비밀번호면 바뀌었을 때만");
}

console.log("csBoard.mock.test: OK");

// 2026-11-04: 메인보드 로그인 현황 = 게시판·리뷰 로그인 함께 (하나라도 풀리면 false, 로그인과 상관없는 오류는 모름)
{
  const last = { at: "2026-11-04 10:00", vendors: [{ vendor: "스마트스토어", state: "ok" }, { vendor: "메이크샵", state: "ok" }] };
  const reviewLast = { at: "2026-11-04 10:05", vendors: [{ vendor: "스마트스토어", state: "로그인 필요" }, { vendor: "메이크샵", state: "오류" }] };
  const ss = csLoginBoth("스마트스토어", { last, reviewLast });
  assert.deepEqual([ss.ok, ss.board, ss.review, ss.text], [false, true, false, "게시판 ✓ · 리뷰 ✕"], "리뷰 로그인이 풀리면 로그인 안 됨");
  const ms = csLoginBoth("메이크샵", { last, reviewLast });
  assert.deepEqual([ms.ok, ms.review], [true, null], "로그인과 상관없는 리뷰 오류는 로그인 풀림으로 보지 않음");
  const after = csLoginBoth("스마트스토어", { last, reviewLast, jobs: [{ kind: "login", ended: "2026-11-04T02:00:00Z", data: { login: { 스마트스토어: { state: "ok" } } } }] });
  assert.deepEqual([after.ok, after.board, after.review], [true, true, true], "그 뒤 로그인 성공 → 둘 다 ✓");
  assert.equal(csLoginBoth("지그재그", {}).ok, null);
}
console.log("csBoard.mock.test (login both): OK");

// 11-04 밤: 스마트스토어 판매자센터 로그인 실패는 리뷰에만 (게시판은 커머스 API)
{
  const last = { at: "2026-11-04 22:27", vendors: [{ vendor: "스마트스토어", state: "ok" }] };
  const reviewLast = { at: "2026-11-04 22:27", vendors: [{ vendor: "스마트스토어", state: "로그인 필요" }] };
  const jobs = [{ kind: "login", ended: "2026-11-04T13:46:00Z", data: { login: { 스마트스토어: { state: "fail" } } } }];
  const ss = csLoginBoth("스마트스토어", { jobs, last, reviewLast });
  assert.deepEqual([ss.board, ss.review, ss.ok], [true, false, false]);
  const zz = csLoginBoth("지그재그", { jobs: [{ kind: "login", ended: "2026-11-04T13:46:00Z", data: { login: { 지그재그: { state: "fail" } } } }], last: { at: "2026-11-04 22:27", vendors: [{ vendor: "지그재그", state: "ok" }] } });
  assert.equal(zz.board, false, "다른 업체는 로그인 실패가 게시판에도");
}
console.log("csBoard.mock.test (ss board api): OK");

// 2026-11-05 시트 v9: 메신저 대화창 그림 → AI 답장 후보 (그림은 시트에 남기지 않음, 사용량만 '메신저')
{
  let seen = null;
  const g9 = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN, COLLECTOR_TOKEN: COLLECTOR, CLAUDE_KEY: "k" }, claude: (payload) => { seen = payload; return { status: 200, text: JSON.stringify(["네 고객님 확인해 보겠습니다 :)", "재고 확인 후 바로 안내드릴게요"]) }; } });
  const img = "iVBORw0KGgo" + "A".repeat(400);
  assert.equal(g9.post({ action: "msnSuggest", token: COLLECTOR, image: img }).denied, true, "직원 비밀번호만");
  assert.equal(g9.post({ action: "msnSuggest", token: TOKEN, image: "x" }).ok, false, "그림 없으면 거절");
  const r9 = g9.post({ action: "msnSuggest", token: TOKEN, image: `data:image/png;base64,${img}`, mime: "image/png", name: "고객 A", app: "카톡", draft: "네" });
  assert.equal(r9.ok, true);
  assert.deepEqual(Array.from(r9.answers), ["네 고객님 확인해 보겠습니다 :)", "재고 확인 후 바로 안내드릴게요"]);
  const content = seen.messages[0].content;
  assert.equal(content[0].type, "image");
  assert.equal(content[0].source.data, img, "data: 머리는 떼고 보냄");
  assert.match(content[1].text, /대화방: 고객 A[\s\S]*답장 후보 5개/);
  assert.match(seen.system[0].text, /메신저\(카톡·네이트온\) 대화창 그림일 때/);
  const used = JSON.parse(g9.properties.AI_USAGE);
  assert.equal(Object.values(used)[0].kinds["메신저"], 1, "사용량은 '메신저'로");
  assert.equal(JSON.stringify(g9.sheets.map((sh) => sh.data)).includes(img.slice(0, 40)), false, "그림은 시트에 저장 안 함");
  console.log("csBoard.mock.test (msnSuggest v9): OK");
}

// 2026-11-05 시트 v10: 메이크샵 리뷰 답글 자동 등록 + 적립금 설정 (실구매금액 × %)
{
  const g = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN, COLLECTOR_TOKEN: COLLECTOR } });
  let r = g.post({ action: "point", token: TOKEN });
  assert.deepEqual([r.ok, r.point.pct, r.point.unit, r.point.msg], [true, 0, 10, "[PRODUCT_NAME] 리뷰 적립금"], "처음엔 0% = 답글만");
  assert.equal(g.post({ action: "point", token: COLLECTOR }).denied, true, "직원 비밀번호만");
  assert.equal(g.post({ action: "point", token: TOKEN, set: { pct: 31 } }).ok, false, "최대 30%");
  assert.equal(g.post({ action: "point", token: TOKEN, set: { pct: -1 } }).ok, false);
  assert.equal(g.post({ action: "point", token: TOKEN, set: { pct: 2, msg: "가".repeat(51) } }).ok, false, "사유 한글 50자까지");
  r = g.post({ action: "point", token: TOKEN, set: { pct: 2.55, msg: "리뷰 감사 [PRODUCT_NAME]" }, editor: "희진" });
  assert.deepEqual([r.ok, r.point.pct, r.point.msg, r.point.by], [true, 2.6, "리뷰 감사 [PRODUCT_NAME]", "희진"]);
  assert.equal(g.post({ action: "list", token: TOKEN }).point.pct, 2.6, "목록에도 설정");
  g.post({ action: "ingest", token: COLLECTOR, autoSuggest: false, rows: [
    { 업체: "메이크샵", 게시판: "리뷰", id: "817322", 날짜: "2026-11-04 21:10", 상품명: "리본 피어싱", 별점: 5, 내용: "예뻐요", 답변안: ["감사합니다"] },
  ], snapshot: { kind: "리뷰", vendors: { 메이크샵: { 상태: "ok" } }, days: 30, collectedAt: "2026-11-05 12:00" } });
  const key = "메이크샵_리뷰_817322";
  g.post({ action: "save", token: TOKEN, key, baseVersion: 0, choice: { pick: 0 } });
  r = g.post({ action: "request", token: TOKEN, kind: "register", keys: [key], editor: "희진" });
  assert.equal(r.ok, true, "메이크샵 리뷰는 자동 등록 대상");
  const job = g.post({ action: "poll", token: COLLECTOR, pc: "OFFICE-PC" }).job;
  const item = JSON.parse(JSON.stringify(job.body.items[0]));
  assert.deepEqual([item.vendor, item.board, item.id, item.text], ["메이크샵", "리뷰", "817322", "감사합니다"]);
  assert.deepEqual([item.point.pct, item.point.unit, item.point.msg], [2.6, 10, "리뷰 감사 [PRODUCT_NAME]"], "등록하는 순간의 적립금 설정을 같이 보냄");
  g.post({ action: "finish", token: COLLECTOR, id: job.id, ok: true, message: "등록 1건", results: [{ key, state: "등록완료", note: "답글 ✓ · 적립금 110원 ✓" }] });
  const row = g.post({ action: "list", token: TOKEN }).rows.find((x) => x.key === key);
  assert.deepEqual([row.closed, row.reg.state, row.reg.note], [true, "완료", "답글 ✓ · 적립금 110원 ✓"], "등록완료 → 종료 + 적립금 결과 메모");
  // v11 원격 로그인: 수집기 화면 그림(나눠 보관) → 화면이 보고 정답 → 수집기가 한 번 가져감
  const rid = "J261106-abc12345";
  const big = "data:image/jpeg;base64," + "A".repeat(200000);
  assert.equal(g.post({ action: "loginShot", token: TOKEN, id: rid, image: big }).denied, true, "화면 비밀번호로는 그림 못 올림");
  assert.equal(g.post({ action: "loginShotGet", token: COLLECTOR, id: rid }).denied, true, "수집기 비밀번호로는 못 봄");
  assert.equal(g.post({ action: "loginShotGet", token: TOKEN, id: rid }).shot, null, "아직 그림 없음");
  let ls = g.post({ action: "loginShot", token: COLLECTOR, id: rid, vendor: "스마트스토어", note: "퀴즈", image: big, w: 1000, h: 900 });
  assert.deepEqual([ls.ok, ls.answer], [true, null]);
  const shot = g.post({ action: "loginShotGet", token: TOKEN, id: rid }).shot;
  assert.deepEqual([shot.vendor, shot.note, shot.image.length, shot.w], ["스마트스토어", "퀴즈", big.length, 1000], "100KB 넘는 그림도 나눠 보관 후 그대로");
  assert.equal(g.post({ action: "loginShot", token: COLLECTOR, id: rid, image: "data:text/html;base64,AAAA" }).ok, false, "그림만");
  assert.equal(g.post({ action: "loginShot", token: COLLECTOR, id: "../x", image: big }).ok, false, "요청 번호 모양 확인");
  assert.equal(g.post({ action: "loginAnswer", token: TOKEN, id: rid, answer: "  " }).ok, false);
  assert.equal(g.post({ action: "loginAnswer", token: TOKEN, id: rid, answer: "1234\n", editor: "희진" }).ok, true);
  assert.equal(g.post({ action: "loginShotGet", token: TOKEN, id: rid }).pending, true, "수집기가 아직 안 가져감");
  ls = g.post({ action: "loginShot", token: COLLECTOR, id: rid, image: "" });
  assert.deepEqual([ls.answer.answer, ls.answer.submit, ls.answer.editor], ["1234", true, "희진"], "정답 + [로그인] 누르기");
  assert.equal(g.post({ action: "loginShot", token: COLLECTOR, id: rid }).answer, null, "한 번 주면 지움");
  assert.equal(g.post({ action: "loginAnswer", token: TOKEN, id: rid, click: [120, 340] }).ok, true);
  assert.deepEqual(g.post({ action: "loginShot", token: COLLECTOR, id: rid }).answer.click, [120, 340], "화면 클릭 자리");
  assert.equal(g.post({ action: "loginAnswer", token: TOKEN, id: rid, click: [-1, 5] }).ok, false);
  g.post({ action: "loginShot", token: COLLECTOR, id: rid, done: true });
  assert.equal(g.post({ action: "loginShotGet", token: TOKEN, id: rid }).shot, null, "끝나면 그림 지움");
  assert.ok(!JSON.stringify(g.sheets.map((sh) => sh.getName())).includes("로그인"), "시트 탭에 안 남김");
  // v12 상품 현황 단종: '단종' 탭에 셀피아 코드 · 추가/해제 · 목록
  assert.equal(g.post({ action: "discList", token: COLLECTOR }).denied, true, "수집기 비밀번호로는 못 봄");
  assert.deepEqual(g.post({ action: "discList", token: TOKEN }).skus, [], "처음엔 없음 (탭 자동 생성)");
  let ds = g.post({ action: "discSet", token: TOKEN, skus: ["1000-1", "1000-2", "1000-1", "../x", ""], on: true, editor: "희진" });
  assert.deepEqual([ds.ok, ds.changed, ds.total], [true, 2, 2], "중복·이상한 값 빼고 추가");
  ds = g.post({ action: "discSet", token: TOKEN, skus: ["1000-2", "2000-1"], on: true, editor: "희진" });
  assert.deepEqual([ds.changed, ds.total], [1, 3], "이미 있는 것은 그대로");
  const dl = g.post({ action: "discList", token: TOKEN }).skus;
  assert.deepEqual(dl.map((x) => x.sku), ["1000-1", "1000-2", "2000-1"]);
  assert.equal(dl[0].editor, "희진");
  ds = g.post({ action: "discSet", token: TOKEN, skus: ["1000-2"], on: false });
  assert.deepEqual([ds.changed, ds.total], [1, 2], "단종 해제");
  assert.deepEqual(g.post({ action: "discList", token: TOKEN }).skus.map((x) => x.sku), ["1000-1", "2000-1"]);
  assert.equal(g.post({ action: "discSet", token: TOKEN, skus: [], on: true }).ok, false);
  assert.ok(g.sheets.some((sh) => sh.getName() === "단종"), "'단종' 탭");
  // v13 상품찾기 사진 색인: 시작 → 조각 올리기 → 마치기 → 토큰 없이 GET 으로 읽기
  assert.equal(g.get({ action: "photoIndexMeta" }).meta, null, "처음엔 색인 없음");
  assert.equal(g.post({ action: "photoIndexBegin", token: COLLECTOR, chunks: 2 }).denied, true, "수집기 비밀번호로는 못 씀");
  let pb = g.post({ action: "photoIndexBegin", token: TOKEN, chunks: 3 });
  assert.ok(pb.ok && pb.stage);
  assert.equal(g.post({ action: "photoIndexPut", token: TOKEN, stage: "wrong", from: 0, chunks: ["a"] }).ok, false, "다른 올리기 조각은 버림");
  assert.equal(g.post({ action: "photoIndexPut", token: TOKEN, stage: pb.stage, from: 0, chunks: ["=a\tb", "+c"] }).saved, 2);
  assert.match(g.post({ action: "photoIndexCommit", token: TOKEN, stage: pb.stage, count: 9, dim: 256 }).error, /3번째 조각이 빠졌습니다/);
  assert.equal(g.post({ action: "photoIndexPut", token: TOKEN, stage: pb.stage, from: 2, chunks: ["-d"] }).ok, true);
  assert.equal(g.post({ action: "photoIndexPut", token: TOKEN, stage: pb.stage, from: 3, chunks: ["x"] }).ok, false, "범위 밖");
  const pc = g.post({ action: "photoIndexCommit", token: TOKEN, stage: pb.stage, count: 9, dim: 256, model: "mnv2", editor: "희진" });
  assert.deepEqual([pc.ok, pc.meta.chunks, pc.meta.count, pc.meta.dim], [true, 3, 9, 256]);
  assert.ok(g.sheets.some((sh) => sh.getName() === "사진색인") && !g.sheets.some((sh) => sh.getName() === "사진색인_새로"));
  assert.equal(g.get({ action: "photoIndexMeta" }).meta.version, pb.stage);
  assert.deepEqual(g.get({ action: "photoIndexGet", from: "0", to: "3" }).chunks, ["=a\tb", "+c", "-d"], "~ 붙여 저장 · 읽을 때 뗌 (수식 안 됨)");
  assert.deepEqual(g.get({ action: "photoIndexGet", from: "1", to: "2" }).chunks, ["+c"]);
  const pb2 = g.post({ action: "photoIndexBegin", token: TOKEN, chunks: 1 });
  g.post({ action: "photoIndexPut", token: TOKEN, stage: pb2.stage, from: 0, chunks: ["new"] });
  g.post({ action: "photoIndexCommit", token: TOKEN, stage: pb2.stage, count: 1 });
  assert.deepEqual(g.get({ action: "photoIndexGet", from: "0", to: "5" }).chunks, ["new"], "새 색인으로 통째로 바뀜");
  assert.equal(g.sheets.filter((sh) => sh.getName() === "사진색인").length, 1);
  console.log("csBoard.mock.test (ms review point v10 · remote login v11 · disc v12 · photo index v13): OK");
}

// v13 상품찾기 🤖 AI 추천: 찾는 사진 + 허브 사진 후보 → 후보 번호 → 코드로 돌려줌
{
  const IMG = "A".repeat(400);
  const HUB = "https://bpgvqmtsjgegnrdzmpep.supabase.co/storage/v1/object/public/product-images/sellpia/";
  const none = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN } });
  assert.match(none.post({ action: "photoAi", token: TOKEN, image: IMG }).error, /AI 키가 없습니다/);
  let seen = null;
  const g = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN, CLAUDE_KEY: "k" }, claude: (payload) => { seen = payload; return { status: 200, text: '결과: {"picks":[{"n":2,"score":91,"why":"같은 큐빅 배열"},{"n":9,"score":80}],"keywords":"써지컬 링 피어싱 큐빅"}' }; } });
  assert.equal(g.post({ action: "photoAi", token: "wrong", image: IMG }).denied, true);
  assert.match(g.post({ action: "photoAi", token: TOKEN, image: "abc" }).error, /찾는 사진이 올바르지 않습니다/);
  const r = g.post({ action: "photoAi", token: TOKEN, image: IMG, candidates: [
    { code: "8601-1", url: `${HUB}8601-1.jpg`, label: "링 골드" },
    { code: "EVIL", url: "https://evil.example/x.jpg" },           // 허브 주소 아님 → 뺌
    { code: "8601-2", url: `${HUB}missing-8601-2.jpg` },           // 사진 못 받음 → 뺌
    { code: "8602-1", url: `${HUB}8602-1.jpg` },
  ] });
  assert.equal(r.ok, true);
  assert.equal(r.compared, 2, "받은 후보 사진만 비교");
  assert.deepEqual(r.picks, [{ code: "8602-1", score: 91, why: "같은 큐빅 배열" }], "후보 번호 → 코드 · 없는 번호 무시");
  assert.equal(r.keywords, "써지컬 링 피어싱 큐빅");
  const imgs = seen.messages[0].content.filter((c) => c.type === "image");
  assert.equal(imgs.length, 3, "찾는 사진 1 + 후보 2");
  assert.ok(!JSON.stringify(seen).includes("evil.example"));
  assert.ok(JSON.parse(g.properties.AI_USAGE)[Object.keys(JSON.parse(g.properties.AI_USAGE))[0]].kinds["사진찾기"] === 1, "사용량 기록");
  console.log("csBoard.mock.test (photoAi v13): OK");
}

// v15 옵션 사진 짝짓기: 자사몰 사진만 받아 AI 에 옵션 목록과 함께 → 옵션마다 사진 · 자리(box)
{
  const MALL = "https://pink-rocket.com/shopimages/curiouswiz/";
  const CJ = "https://pink_rocket.cooljem.com/pinkrocket/item/";
  const none = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN } });
  assert.match(none.post({ action: "optionPhotoAi", token: TOKEN, options: [{ sku: "1-1" }], images: [`${MALL}a.jpg`] }).error, /AI 키가 없습니다/);
  let seen = null;
  const g = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN, CLAUDE_KEY: "k" }, claude: (payload) => { seen = payload; return { status: 200, text: '{"options":[{"n":1,"photo":2,"box":[100,200,400,600],"score":92,"why":"골드 링"},{"n":2,"photo":1,"box":null,"score":55},{"n":3,"photo":9,"score":90},{"n":7,"photo":1}]}' }; } });
  assert.equal(g.post({ action: "optionPhotoAi", token: "wrong", options: [{ sku: "1-1" }], images: [`${MALL}a.jpg`] }).denied, true);
  assert.match(g.post({ action: "optionPhotoAi", token: TOKEN, options: [], images: [`${MALL}a.jpg`] }).error, /옵션이 없습니다/);
  assert.match(g.post({ action: "optionPhotoAi", token: TOKEN, options: [{ sku: "1-1" }], images: ["https://evil.example/a.jpg"] }).error, /자사몰 사진 주소가 없습니다/);
  const r = g.post({ action: "optionPhotoAi", token: TOKEN, product: "링 피어싱", model: "claude-sonnet-5-5",
    options: [{ sku: "8601-1", label: "골드[PB-1-01]" }, { sku: "8601-2", label: "실버" }, { sku: "8601-3", label: "블랙" }],
    images: [`${MALL}0310.jpg`, "https://evil.example/x.jpg", `${CJ}missing.jpg`, `${CJ}a_01.jpg`] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.images, [`${MALL}0310.jpg`, `${CJ}a_01.jpg`], "자사몰 · 상세 서버 사진만, 받은 것만");
  assert.deepEqual(r.results, [
    { sku: "8601-1", url: `${CJ}a_01.jpg`, box: [100, 200, 400, 600], score: 92, why: "골드 링" },
    { sku: "8601-2", url: `${MALL}0310.jpg`, box: null, score: 55, why: "" },
    { sku: "8601-3", url: "", box: null, score: 90, why: "" },
  ], "옵션 번호 → 셀피아코드 · 없는 사진 번호는 빈칸 · 없는 옵션 번호 무시");
  assert.equal(seen.model, "claude-sonnet-5-5", "허용된 모델만 바꿀 수 있음");
  assert.equal(seen.messages[0].content.filter((c) => c.type === "image").length, 2);
  assert.match(seen.messages[0].content[0].text, /1\. 8601-1 · 골드\[PB-1-01\]/);
  assert.ok(!JSON.stringify(seen).includes("evil.example"));
  assert.equal(g.post({ action: "optionPhotoAi", token: TOKEN, model: "gpt", options: [{ sku: "1-1" }], images: [`${MALL}a.jpg`] }).ok, true);
  assert.equal(seen.model, "claude-haiku-5-5", "모르는 모델 → 기본");
  const pilot = "https://bpgvqmtsjgegnrdzmpep.supabase.co/storage/v1/object/public/product-images/sellpia/__pilot_src_1_0-0.jpg";
  assert.deepEqual(g.post({ action: "optionPhotoAi", token: TOKEN, options: [{ sku: "1-1" }], images: [pilot, "https://bpgvqmtsjgegnrdzmpep.supabase.co/storage/v1/object/public/product-images/sellpia/1-1.jpg"] }).images, [pilot], "허브는 검토 사진(__pilot_) 조각만");
  assert.equal(JSON.parse(g.properties.AI_USAGE)[Object.keys(JSON.parse(g.properties.AI_USAGE))[0]].kinds["옵션사진"], 3, "사용량 기록");
  console.log("csBoard.mock.test (optionPhotoAi v15): OK");
}

// v16 배송사진: 폴더 파일을 시간 순서로 · 송장 사진은 AI 가 읽은 수신자 이름을 파일명에 · 결과는 '배송사진' 탭
{
  const FOLDER = "1BYw0-dWxwq5zTwPot_dVS0EuDG52-_ie";
  const drive = { folderId: FOLDER, files: [
    { id: "v2", name: "20261110_101500.mp4", mime: "video/mp4" },
    { id: "p1", name: "20261110_101000.jpg", mime: "image/jpeg" },
    { id: "v1", name: "20261110_101200.mp4", mime: "video/mp4" },
    { id: "p2", name: "20261110_102000.jpg", mime: "image/jpeg" },
    { id: "p3", name: "IMG_20261110_103000.jpg", mime: "image/jpeg", folder: "11-10 오후" },
    { id: "x1", name: "메모.txt", mime: "text/plain" },
    { id: "p4", name: "photo.jpg", mime: "image/jpeg", created: new Date("2026-11-10T01:40:00Z") },   // 한국 10:40
  ] };
  let seen = null;
  const g = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN, CLAUDE_KEY: "k" }, drive, claude: (payload) => { seen = payload; return { status: 200, text: '{"photos":[{"n":1,"invoice":true,"name":"홍*동","score":95},{"n":2,"invoice":false,"name":"","score":90},{"n":3,"invoice":true,"name":"김 철수","score":80}]}' }; } });
  assert.equal(g.post({ action: "shipList", token: "wrong" }).denied, true);
  const l1 = g.post({ action: "shipList", token: TOKEN });
  assert.equal(l1.ok, true);
  assert.deepEqual(l1.files.map((f) => f.id), ["p1", "v1", "v2", "p2", "p3", "p4"], "사진·동영상만 · 이름 속 시각 → 없으면 만든 시각 · 하위 폴더도");
  assert.equal(l1.unchecked, 4);
  const s1 = g.post({ action: "shipScan", token: TOKEN, limit: 3 });
  assert.equal(s1.ok, true);
  assert.deepEqual([s1.done, s1.remaining], [3, 1]);
  assert.equal(seen.messages[0].content.filter((c) => c.type === "image").length, 3, "사진 3장을 한 번에");
  assert.deepEqual(s1.results.map((r) => [r.id, r.invoice, r.recipient, r.name]), [
    ["p1", true, "홍*동", "20261110_101000_홍○동.jpg"],
    ["p2", false, "", "20261110_102000.jpg"],
    ["p3", true, "김철수", "IMG_20261110_103000_김철수.jpg"],
  ], "송장 + 이름 → 파일명 끝에 · 띄어쓰기 뺌");
  assert.equal(drive.files.find((f) => f.id === "p1").name, "20261110_101000_홍○동.jpg", "드라이브 파일 이름 바뀜 (가려진 글자 * → ○)");
  const tab = g.sheets.find((sh) => sh.getName() === "배송사진");
  assert.deepEqual(tab.data.slice(1).map((r) => [r[0], r[1], r[3], r[4]]), [["p1", "20261110_101000.jpg", "예", "홍*동"], ["p2", "20261110_102000.jpg", "", ""], ["p3", "IMG_20261110_103000.jpg", "예", "김철수"]]);
  const l2 = g.post({ action: "shipList", token: TOKEN });
  assert.deepEqual(l2.files.filter((f) => f.invoice).map((f) => [f.id, f.recipient]), [["p1", "홍*동"], ["p3", "김철수"]]);
  assert.equal(l2.unchecked, 1);
  assert.equal(l2.files[0].t, "20261110101000", "이름 바뀌어도 시각 그대로");
  // 다시 돌려도 같은 사진을 또 보지 않음 · 남은 1장
  const s2 = g.post({ action: "shipScan", token: TOKEN });
  assert.deepEqual([s2.done, s2.remaining, s2.results[0].id], [1, 0, "p4"]);
  assert.deepEqual(g.post({ action: "shipScan", token: TOKEN }), { ok: true, done: 0, remaining: 0, results: [] });
  assert.equal(JSON.parse(g.properties.AI_USAGE)[Object.keys(JSON.parse(g.properties.AI_USAGE))[0]].kinds["배송사진"], 2);
  const none = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN }, drive });
  assert.match(none.post({ action: "shipScan", token: TOKEN }).error, /AI 키가 없습니다/);
  console.log("csBoard.mock.test (ship photos v16): OK");
}

// v16 배송사진: 반디캠 이름(2026-11-06 17-04-45-823) · 같은 초는 사진(송장) 먼저 · 이름 바뀐 뒤에도 순서 그대로 (11-10 실제 폴더 형식)
{
  const up = new Date("2026-11-10T05:35:00Z");   // 올린 시각은 뒤죽박죽 → 이름 속 시각으로
  const b = (n, ext) => ({ id: n + ext, name: `bandicam 2026-11-06 ${n}.${ext}`, mime: ext === "jpg" ? "image/jpeg" : "video/mp4", created: up });
  const drive = { folderId: "1BYw0-dWxwq5zTwPot_dVS0EuDG52-_ie", files: [b("17-06-41-310", "mp4"), b("17-06-41-357", "jpg"), b("16-58-42-882", "mp4"), b("16-59-59-029", "mp4"), b("16-59-58-746", "jpg"), b("17-08-03-141", "mp4"), b("17-08-02-984", "jpg")] };
  const g = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN, CLAUDE_KEY: "k" }, drive, claude: () => ({ status: 200, text: '{"photos":[{"n":1,"invoice":true,"name":"가나다","score":90},{"n":2,"invoice":true,"name":"라마","score":90},{"n":3,"invoice":false,"name":"","score":90}]}' }) });
  const order = ["16-58-42-882mp4", "16-59-58-746jpg", "16-59-59-029mp4", "17-06-41-357jpg", "17-06-41-310mp4", "17-08-02-984jpg", "17-08-03-141mp4"];
  assert.deepEqual(g.post({ action: "shipList", token: TOKEN }).files.map((f) => f.id), order, "이름 속 시각 · 같은 초는 사진 먼저");
  assert.equal(g.post({ action: "shipList", token: TOKEN }).files[1].t, "20261106165958");
  const s = g.post({ action: "shipScan", token: TOKEN });
  assert.deepEqual(s.results.map((r) => r.name), ["bandicam 2026-11-06 16-59-58-746_가나다.jpg", "bandicam 2026-11-06 17-06-41-357_라마.jpg", "bandicam 2026-11-06 17-08-02-984.jpg"]);
  assert.deepEqual(g.post({ action: "shipList", token: TOKEN }).files.map((f) => f.id), order, "이름 바뀐 뒤에도 순서 그대로");
  // 이름 바꾸기가 막혔던 송장 사진 → 다음 실행 때 AI 없이 이름만 다시 · 실패 이유는 돌려줌
  const d2 = { folderId: drive.folderId, files: [b("17-20-00-000", "jpg")] };
  let calls = 0;
  d2.lockRename = "권한 없음";
  const g2 = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN, CLAUDE_KEY: "k" }, drive: d2, claude: () => { calls += 1; return { status: 200, text: '{"photos":[{"n":1,"invoice":true,"name":"홍길동","score":90}]}' }; } });
  const f1 = g2.post({ action: "shipScan", token: TOKEN });
  assert.deepEqual(f1.renameErrors, [{ name: "bandicam 2026-11-06 17-20-00-000.jpg", error: "권한 없음" }]);
  assert.equal(g2.post({ action: "shipList", token: TOKEN }).renamePending, 1);
  d2.lockRename = "";
  const f2 = g2.post({ action: "shipScan", token: TOKEN });
  assert.deepEqual([f2.renamed, f2.renameErrors, calls], [1, [], 1], "AI 는 다시 안 부름");
  assert.equal(d2.files[0].name, "bandicam 2026-11-06 17-20-00-000_홍길동.jpg");
  assert.equal(g2.post({ action: "shipList", token: TOKEN }).renamePending, 0);
  assert.equal(g2.sheets.find((sh) => sh.getName() === "배송사진").data[1][2], "bandicam 2026-11-06 17-20-00-000_홍길동.jpg", "탭의 바뀐이름도");
  // v18 업로드: 이어 올리기 주소만 · 같은 파일(이름 앞부분 + 크기)은 건너뜀 · 사진·동영상 · V3 주소에서만
  const ORIGIN = "https://w-works-official.github.io";
  const upl = g.post({ action: "shipUpload", token: TOKEN, name: "bandicam 2026-11-06 17-30-00-000.mp4", mime: "video/mp4", size: 123456789, origin: ORIGIN });
  assert.deepEqual([upl.ok, upl.url], [true, "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=TEST"]);
  const call = g.calls.find((c) => /upload\/drive/.test(c.url));
  assert.equal(call.headers.Origin, ORIGIN);
  assert.equal(call.headers["X-Upload-Content-Length"], "123456789");
  assert.deepEqual(call.payload, { name: "bandicam 2026-11-06 17-30-00-000.mp4", parents: ["folder:_NAS로"] }, "_NAS로 폴더로 (없으면 만듦)");
  drive.files.push({ id: "wait1", name: "bandicam 2026-11-06 17-40-00-000.mp4", mime: "video/mp4", size: 777, folder: "_NAS로" });
  assert.equal(g.post({ action: "shipList", token: TOKEN }).files.some((f) => f.id === "wait1"), false, "_NAS로 는 목록에 안 나옴 (NAS 거쳐 다시 들어옴)");
  assert.equal(g.post({ action: "shipUpload", token: TOKEN, name: "bandicam 2026-11-06 17-40-00-000.mp4", mime: "video/mp4", size: 777, origin: ORIGIN }).skip, true, "_NAS로 에서 기다리는 같은 파일 → 건너뜀");
  drive.files.find((f) => f.id === "16-59-58-746jpg").size = 5000;
  const skip = g.post({ action: "shipUpload", token: TOKEN, name: "bandicam 2026-11-06 16-59-58-746.jpg", mime: "image/jpeg", size: 5000, origin: ORIGIN });
  assert.deepEqual([skip.ok, skip.skip], [true, true], "수신자 이름이 붙은 같은 파일 → 건너뜀");
  assert.match(g.post({ action: "shipUpload", token: TOKEN, name: "메모.txt", mime: "text/plain", size: 10, origin: ORIGIN }).error, /사진·동영상만/);
  assert.match(g.post({ action: "shipUpload", token: TOKEN, name: "a.mp4", mime: "video/mp4", size: 10, origin: "https://evil.example" }).error, /V3 화면에서만/);
  assert.match(g.post({ action: "shipUpload", token: TOKEN, name: "a.mp4", mime: "video/mp4", size: 3 * 1024 ** 3, origin: ORIGIN }).error, /2GB/);
  assert.equal(g.post({ action: "shipUpload", token: "wrong", name: "a.mp4", mime: "video/mp4", size: 10, origin: ORIGIN }).denied, true);
  console.log("csBoard.mock.test (ship photos bandicam v16): OK");
}

// v17 신상품 등록: '업데이트 list' › '업데이트 순서' (머리글 3줄 · 4줄부터 상품 · A~AD) — 읽기 · 칸 하나 고치기(먼저 바뀐 칸 보호) · 새 줄
{
  const UPD = "1-o0XpuHE_A8ZrGpbnRyOqpKP715bHd21pTlLBwjOj4o";
  const other = fakeSheet("다른 탭", { id: 1 });
  const tab = fakeSheet("업데이트 순서", { id: 813202838, formulas: { "5,15": "=M5/N5" } });
  const row = (vals) => { const r = Array(30).fill(""); for (const [c, v] of Object.entries(vals)) r[c] = v; return r; };
  tab.data.push(row({ 1: "브랜드", 3: "제품폴더", 8: "제품명", 9: "매입옵션명" }), row({ 3: "피어싱의 경우", 4: "전체 써지컬 :" }), row({ 3: "두줄로 구분" }));
  tab.data.push(row({ 2: { getContentUrl: () => "https://lh3.googleusercontent.com/pic4" }, 3: "GP00540 14K 링", 5: "골드\n로즈", 8: "14K 스컬프 링", 23: "11606" }), row({ 3: "GP00541 아코디언", 8: "14K 아코디언", 14: "2.20" }), row({}), row({ 25: "메모만" }));
  const g = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN }, others: { [UPD]: [other, tab] }, drive: { folderId: "none", files: [] } });
  assert.equal(g.post({ action: "newList", token: "wrong" }).denied, true);
  const l = g.post({ action: "newList", token: TOKEN });
  assert.equal(l.ok, true);
  assert.equal(l.labels[3], "제품폴더 피어싱의 경우 두줄로 구분", "머리글 1~3줄을 이어 붙임");
  assert.equal(l.labels.length, 30);
  assert.deepEqual(l.rows.map((r) => r.r), [4, 5], "빈 줄 · 핵심 칸 없는 아래쪽 줄은 뺌 (D·E·F·I·J 중 하나라도 있는 마지막 줄까지)");
  assert.equal(l.rows[0].cells[5], "골드\n로즈", "줄바꿈 그대로");
  assert.deepEqual(l.rows[1].formulas, [14], "수식 칸 표시");
  assert.equal(l.rows[0].img, undefined, "사진은 목록과 따로 (느려서)");
  let reads = 0;
  tab.data[3][2] = { getContentUrl: () => { reads += 1; return "https://docs.google.com/sheets-images-rt/pic4"; } };
  const p1 = g.post({ action: "newPics", token: TOKEN, rows: [4, 5, 2] });
  assert.deepEqual(p1.pics, { 4: "https://lh3.googleusercontent.com/d/pic1=w400", 5: "" }, "셀 사진 → 드라이브 사본 주소 (머리글 줄은 무시)");
  assert.equal(p1.made, 1);
  assert.equal(g.properties.NEW_PIC_FOLDER, "pics:V3_신상품 사진", "폴더 ID 기억");
  assert.equal(g.post({ action: "newPics", token: TOKEN, rows: [4] }).pics[4], "https://lh3.googleusercontent.com/d/pic1=w400");
  assert.equal(reads, 1, "두 번째는 기억한 것 (셀 다시 안 읽음)");
  const map = g.sheets.find((sh) => sh.getName() === "신상품 사진");
  assert.equal(map.data.length, 2, "사본 기록 1줄");
  assert.equal(map.data[1][1], "pic1");
  // 칸 고치기
  const ok = g.post({ action: "newSave", token: TOKEN, r: 4, c: 8, expect: "14K 스컬프 링", value: "14K 스컬프 원터치 링", editor: "시험" });
  assert.deepEqual([ok.ok, ok.value], [true, "14K 스컬프 원터치 링"]);
  assert.equal(tab.data[3][8], "14K 스컬프 원터치 링");
  const stale = g.post({ action: "newSave", token: TOKEN, r: 4, c: 8, expect: "14K 스컬프 링", value: "덮어쓰기" });
  assert.deepEqual([stale.ok, stale.conflict, stale.current], [false, true, "14K 스컬프 원터치 링"], "시트에서 먼저 바뀐 칸은 안 씀");
  assert.equal(tab.data[3][8], "14K 스컬프 원터치 링");
  assert.match(g.post({ action: "newSave", token: TOKEN, r: 5, c: 14, expect: "2.20", value: "3" }).error, /수식/, "수식 칸은 안 씀");
  assert.equal(g.post({ action: "newSave", token: TOKEN, r: 2, c: 8, expect: "", value: "x" }).ok, false, "머리글 줄은 안 씀");
  assert.equal(g.post({ action: "newSave", token: TOKEN, r: 4, c: 30, expect: "", value: "x" }).ok, false, "AD 넘는 칸은 안 씀");
  g.post({ action: "newSave", token: TOKEN, r: 5, c: 25, expect: "", value: "=IMPORTXML(1)" });
  assert.equal(tab.data[4][25], "=IMPORTXML(1)", "글자로 저장 (앞에 ' — 가짜 시트는 ' 를 뗌)");
  // 새 줄: 마지막 상품 줄(5) 다음 빈 줄 → 6 (7줄의 메모만 있는 줄은 핵심 칸이 비어 있어 마지막으로 안 봄 · 6줄은 비어 있음)
  const add = g.post({ action: "newAdd", token: TOKEN, cells: { 3: "GP00999 새 상품", 8: "새 상품명", 40: "무시" }, editor: "시험" });
  assert.deepEqual([add.ok, add.r], [true, 6]);
  assert.deepEqual([tab.data[5][3], tab.data[5][8]], ["GP00999 새 상품", "새 상품명"]);
  const add2 = g.post({ action: "newAdd", token: TOKEN, cells: { 3: "또 새 상품", 25: "메모" } });
  assert.equal(add2.r, 8, "7줄은 메모 칸(Z)이 차 있어 건너뜀");
  assert.equal(g.post({ action: "newAdd", token: TOKEN, cells: {} }).ok, false);
  const log = g.sheets.find((sh) => sh.getName() === "신상품 기록");
  assert.deepEqual(log.data[1].slice(1, 6), ["시험", 4, "I", "14K 스컬프 링", "14K 스컬프 원터치 링"], "고친 기록 (전 값 · 새 값)");
  assert.equal(log.data.length, 1 + 2 + 2 + 2, "머리글 + 고친 칸 2 + 새 줄 칸 2 + 2");
  console.log("csBoard.mock.test (new products v17): OK");
}

// v22 배송기록 주문별 메모
{
  const g = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN } });
  const KEY = "1AbCdEfGhIjKlMnOp_q";
  assert.match(g.post({ action: "shipMemoSave", token: TOKEN, key: "../x" }).error, /묶음 키/);
  const a = g.post({ action: "shipMemoSave", token: TOKEN, key: KEY, recipient: "홍○동", t: "20261110143012", name: "홍길동", lines: [{ code: "=HYPER", qty: "2" }, { code: "B-01", qty: "x" }, { code: "", qty: "" }], etc: "영상상 2개 포장 확인", editor: "김성수" });
  assert.equal(a.ok, true);
  assert.equal(JSON.stringify(a.memo.lines), JSON.stringify([{ code: "=HYPER", qty: "2", etc: "영상상 2개 포장 확인", pname: "", option: "", own: "" }, { code: "B-01", qty: "", etc: "", pname: "", option: "", own: "" }]), "숫자만 · 빈 줄 버림");
  assert.deepEqual([a.memo.version, a.memo.name, a.memo.lines[0].etc, a.memo.t], [1, "홍길동", "영상상 2개 포장 확인", "'2026-11-10 14:30:12"]);
  assert.equal(a.memo.lines[0].etc, "영상상 2개 포장 확인", "v22 화면의 하나짜리 기타 → 첫 줄");
  const b = g.post({ action: "shipMemoSave", token: TOKEN, key: KEY, base: 1, name: "홍길동", lines: [{ code: "A-9", qty: 3, etc: "불량 반품" }, { code: "", qty: "", etc: "포장 영상 확인함" }], editor: "유지영" });
  assert.deepEqual([b.memo.version, b.memo.recipient, b.memo.lines[0].qty], [2, "홍○동", "3"], "수신자·시각은 그대로 둠");
  assert.equal(JSON.stringify(b.memo.lines.map((l) => l.etc)), JSON.stringify(["불량 반품", "포장 영상 확인함"]), "v23 기타는 줄마다 (기타만 있는 줄도)");
  const c = g.post({ action: "shipMemoSave", token: TOKEN, key: KEY, base: 1, name: "덮어쓰기" });
  assert.equal(c.conflict, true, "먼저 고친 것은 덮어쓰지 않음");
  const l = g.post({ action: "shipMemoList", token: TOKEN });
  assert.deepEqual([Object.keys(l.memos).length, l.memos[KEY].name, l.memos[KEY].editor], [1, "홍길동", "유지영"]);
  console.log("csBoard.mock.test (shipMemo v22): OK");
}

// v25 메이크샵 Q&A 등 게시판 답변도 자동 등록 요청
{
  const g = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN, COLLECTOR_TOKEN: "collector-token-1" } });
  g.post({ action: "ingest", token: "collector-token-1", rows: [{ 업체: "메이크샵", 게시판: "Q&A", id: "913777", 날짜: "2026-11-11 10:00", 상품명: "미니볼", 문의: "바 변경 되나요?", 답변안: ["네 됩니다"] }, { 업체: "지그재그", 게시판: "주문문의", id: "z9", 날짜: "2026-11-11 10:00", 문의: "?", 답변안: ["네"] }], snapshot: { kind: "문의", vendors: {}, days: 7, collectedAt: "2026-11-11 11:00" }, autoSuggest: false });
  g.post({ action: "save", token: TOKEN, key: "메이크샵_Q&A_913777", baseVersion: 0, choice: { pick: 0 } });
  g.post({ action: "save", token: TOKEN, key: "지그재그_주문문의_z9", baseVersion: 0, choice: { pick: 0 } });
  const r = g.post({ action: "request", token: TOKEN, kind: "register", keys: ["메이크샵_Q&A_913777", "지그재그_주문문의_z9"], editor: "김성수" });
  assert.equal(r.ok, true);
  const job = g.post({ action: "poll", token: "collector-token-1", pc: "OFFICE-PC" }).job;
  assert.deepEqual(JSON.parse(JSON.stringify(job.body.items)).map((x) => [x.vendor, x.board, x.id, x.text]), [["메이크샵", "Q&A", "913777", "네 됩니다"]], "메이크샵 Q&A 는 받고 지그재그는 아직 안 받음");
  console.log("csBoard.mock.test (ms board register v25): OK");
}

// v24 배송기록 메모 칸 늘림 · 빈 메모 슬롯 · 주문서 찾기 힌트
{
  const old = fakeSheet("배송기록 메모");
  old.data.push(["묶음 키", "수신자", "송장 시각", "이름", "상품코드", "수량", "기타", "작성자", "수정 시각", "버전"]);
  old.data.push(["1AbCdEfGhIjKlMnOp_q", "홍○동", "2026-11-10 14:30:12", "홍길동", "A-1", "2", "예전 메모", "김성수", "2026-11-11T03:00:00Z", 1]);
  let seen = null;
  const drive = { folderId: "1BYw0-dWxwq5zTwPot_dVS0EuDG52-_ie", files: [{ id: "INVphoto0001", name: "20261110_143012_홍○동.jpg", mime: "image/jpeg" }, { id: "VIDvideo0001", name: "20261110_143030.mp4", mime: "video/mp4" }] };
  const g = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN, CLAUDE_KEY: "k" }, sheets: [fakeSheet(), old], drive, claude: (payload) => { seen = payload; return { status: 200, text: '{"name":"홍?동","phone":"010-????-5678","invoice":"6891????4321","address":"서울 강남구 테헤란로","zip":""}' }; } });
  const l0 = g.post({ action: "shipMemoList", token: TOKEN });
  assert.equal(JSON.stringify(l0.memos["1AbCdEfGhIjKlMnOp_q"].lines), JSON.stringify([{ code: "A-1", qty: "2", etc: "예전 메모", pname: "", option: "", own: "" }]), "예전 줄 그대로 읽힘");
  assert.equal(old.data[0].length, 16, "칸 이름 덧붙임");
  assert.deepEqual(old.data[0].slice(10), ["전화번호", "매입처", "상품명", "옵션명", "자사코드", "주문번호"]);
  const r = g.post({ action: "shipMemoSave", token: TOKEN, key: "1AbCdEfGhIjKlMnOp_q", base: 1, name: "홍길동", phone: "010-1234-5678", vendor: "세븐피어싱", ordNo: "202611100001",
    lines: [{ pname: "14K 미니볼", option: "3mm/골드", qty: 2, own: "WW-1", code: "A-1", etc: "불량" }, { pname: "링", option: "", qty: "", own: "", code: "", etc: "" }], editor: "김성수" });
  assert.equal(r.ok, true);
  assert.deepEqual([r.memo.phone, r.memo.vendor, r.memo.ordNo, r.memo.version], ["010-1234-5678", "세븐피어싱", "202611100001", 2]);
  assert.equal(JSON.stringify(r.memo.lines), JSON.stringify([{ code: "A-1", qty: "2", etc: "불량", pname: "14K 미니볼", option: "3mm/골드", own: "WW-1" }, { code: "", qty: "", etc: "", pname: "링", option: "", own: "" }]), "상품명만 있는 줄도 남김");
  // 빈 메모 슬롯 (사진 없이)
  const blank = g.post({ action: "shipMemoSave", token: TOKEN, key: "memo-lx2k9a1b2c", t: "20261111140500", name: "", lines: [], editor: "김성수" });
  assert.deepEqual([blank.ok, blank.memo.key], [true, "memo-lx2k9a1b2c"]);
  assert.ok(g.post({ action: "shipMemoList", token: TOKEN }).memos["memo-lx2k9a1b2c"], "빈 메모 슬롯도 목록에");
  // 주문서 찾기 힌트
  assert.match(g.post({ action: "shipHints", token: TOKEN, id: "VIDvideo0001" }).error, /송장 사진이 아닙니다/, "동영상은 안 됨");
  assert.match(g.post({ action: "shipHints", token: TOKEN, id: "다른파일" }).error, /송장 사진이 아닙니다/, "배송기록 폴더 밖은 안 됨");
  const h = g.post({ action: "shipHints", token: TOKEN, id: "INVphoto0001" });
  assert.equal(h.ok, true);
  assert.deepEqual([h.hints.name, h.hints.phone, h.hints.invoice, h.hints.t], ["홍?동", "010-????-5678", "6891????4321", "20261110143012"]);
  assert.match(seen.system, /또렷이 보이는 글자만/);
  assert.equal(seen.messages[0].content[0].type, "image");
  seen = null;
  const h2 = g.post({ action: "shipHints", token: TOKEN, id: "INVphoto0001" });
  assert.deepEqual([h2.cached, seen], [true, null], "같은 사진은 AI 다시 안 씀");
  console.log("csBoard.mock.test (shipMemo v24): OK");
}

// v20 상담톡: 수집기가 넣고(chatIngest) · 화면이 읽고(chatList) · 답변 후보(chatSuggest)
{
  let sent = null;
  const g = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN, COLLECTOR_TOKEN: "collector-token-1", CLAUDE_KEY: "k" }, claude: (payload) => { sent = payload; return { status: 200, text: '["네 확인해 드리겠습니다", "로즈골드 2mm 로 출고 전달드렸습니다", "추가 옵션에서 선택 부탁드립니다", "감사합니다", "확인 후 안내드리겠습니다"]' }; } });
  const conv = (id, extra = {}) => ({ id, name: "고객" + id, tag: "사이즈 문의", time: "오후 3:25", preview: "볼사이즈 2mm 있었는데", unread: 1, messages: [{ who: "c", text: "볼사이즈2mm 없어졌나요?", time: "오후 3:26" }, { who: "s", text: "고객님 안녕하세요", time: "오후 3:49" }], aux: { title: "구매이력", lines: ["2026-11-02 14K 미니 골드볼 16,500원"] }, ...extra });
  assert.equal(g.post({ action: "chatIngest", token: TOKEN, platform: "smart", convs: [conv("a")] }).denied, true, "수집기 비밀번호만");
  assert.match(g.post({ action: "chatIngest", token: "collector-token-1", platform: "line", convs: [] }).error, /smart · kakao/);
  const r1 = g.post({ action: "chatIngest", token: "collector-token-1", platform: "smart", convs: [conv("a"), conv("b")] });
  assert.deepEqual([r1.added, r1.changed], [2, 0]);
  g.post({ action: "chatIngest", token: "collector-token-1", platform: "kakao", convs: [conv("k1", { name: "카카오 고객" })] });
  const r2 = g.post({ action: "chatIngest", token: "collector-token-1", platform: "smart", convs: [conv("a", { unread: 0 })] });
  assert.deepEqual([r2.added, r2.changed], [0, 1], "같은 대화는 바뀐 것만");
  const l = g.post({ action: "chatList", token: TOKEN });
  assert.deepEqual([l.smart.length, l.kakao.length, l.kakao[0].name], [2, 1, "카카오 고객"]);
  const a = l.smart.find((x) => x.id === "a");
  assert.equal(a.messages[0].text, "볼사이즈2mm 없어졌나요?");
  assert.equal(a.aux.lines[0], "2026-11-02 14K 미니 골드볼 16,500원");
  assert.equal(g.post({ action: "chatList", token: "collector-token-1" }).denied, true, "화면 비밀번호만");
  const s = g.post({ action: "chatSuggest", token: TOKEN, platform: "smart", name: "고객a", messages: a.messages, aux: a.aux, avoid: ["감사합니다 고객님"] });
  assert.deepEqual([s.ok, s.answers.length], [true, 5]);
  assert.match(sent.messages[0].content, /\[고객\] 볼사이즈2mm 없어졌나요\?\n\[우리\] 고객님 안녕하세요/);
  assert.match(sent.messages[0].content, /이것과 다르게/);
  assert.match(sent.system[0].text, /상담톡/);
  assert.match(g.post({ action: "chatSuggest", token: TOKEN, messages: [] }).error, /대화 내용/);
  // v21 상담 상품 카드: https 사진 주소만 · 10개까지 · AI 에 상품명 전달
  g.post({ action: "chatIngest", token: "collector-token-1", platform: "smart", convs: [conv("p", { aux: { title: "구매이력", lines: [], items: [
    { img: "https://shop-phinf.pstatic.net/x/a.jpg", name: "14K 미니 골드볼", option: "3mm", price: "16,500원", status: "배송완료", order: "2026111100001" },
    { img: "javascript:alert(1)", name: "나쁜 주소" }, { img: "http://plain/x.jpg", name: "http 주소" }, {} ] } })] });
  const p = g.post({ action: "chatList", token: TOKEN }).smart.find((x) => x.id === "p");
  assert.equal(JSON.stringify(p.aux.items.map((x) => [x.img, x.name])), JSON.stringify([["https://shop-phinf.pstatic.net/x/a.jpg", "14K 미니 골드볼"], ["", "나쁜 주소"], ["", "http 주소"]]), "https 만 · 빈 카드 버림");
  g.post({ action: "chatSuggest", token: TOKEN, platform: "smart", messages: p.messages, aux: p.aux });
  assert.match(sent.messages[0].content, /상담 상품: 14K 미니 골드볼 \/ 3mm \/ 배송완료/);
  console.log("csBoard.mock.test (chat v20·v21): OK");
}

// v19 반품기록 메모: 카드 추가 · 고치기(먼저 고친 것 보호) · 삭제 표시
{
  const g = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN } });
  assert.equal(g.post({ action: "retList", token: "wrong" }).denied, true);
  assert.deepEqual(g.post({ action: "retList", token: TOKEN }).items, []);
  const a = g.post({ action: "retSave", token: TOKEN, who: "홍길동 / 20261110-1", item: "14K 링", reason: "사이즈\n안 맞음", status: "접수", memo: "=1+1", editor: "시험" });
  assert.equal(a.ok, true);
  assert.match(a.item.id, /^R\d{12}\d{3}$/);
  assert.deepEqual([a.item.who, a.item.reason, a.item.memo, a.item.status, a.item.by], ["홍길동 / 20261110-1", "사이즈\n안 맞음", "=1+1", "접수", "시험"], "줄바꿈 · 수식 글자 그대로 (글자로 저장)");
  const tab = g.sheets.find((sh) => sh.getName() === "반품기록");
  assert.equal(JSON.stringify(tab.data[0].slice(0, 3)), JSON.stringify(["ID", "작성 시각", "수정 시각"]));
  const b = g.post({ action: "retSave", token: TOKEN, id: a.item.id, base: a.item.version, status: "회수 중", memo: "택배 접수함", editor: "다른 사람" });
  assert.deepEqual([b.ok, b.item.status, b.item.memo, b.item.editor, b.item.who], [true, "회수 중", "택배 접수함", "다른 사람", "홍길동 / 20261110-1"], "보낸 칸만 바뀜");
  const stale = g.post({ action: "retSave", token: TOKEN, id: a.item.id, base: a.item.version, memo: "덮어쓰기" });
  assert.deepEqual([stale.ok, stale.conflict, stale.item.memo], [false, true, "택배 접수함"], "먼저 고친 것 보호");
  assert.equal(g.post({ action: "retSave", token: TOKEN, id: a.item.id, base: b.item.version, status: "없는 단계" }).item.status, "회수 중", "정해진 단계만");
  g.post({ action: "retSave", token: TOKEN, who: "두 번째" });
  const l = g.post({ action: "retList", token: TOKEN });
  assert.equal(l.items.length, 2);
  assert.equal(JSON.stringify(l.statuses), JSON.stringify(["접수", "회수 중", "도착·검수", "환불 완료", "교환 발송", "끝"]));
  const cur = l.items.find((x) => x.id === a.item.id);
  assert.equal(g.post({ action: "retSave", token: TOKEN, id: a.item.id, base: cur.version, remove: true }).removed, true);
  assert.deepEqual(g.post({ action: "retList", token: TOKEN }).items.map((x) => x.who), ["두 번째"], "삭제 표시는 목록에서 빠짐");
  assert.equal(tab.data.length, 3, "줄은 남김");
  console.log("csBoard.mock.test (returns v19): OK");
}

// v14 XX 표시: 통째로 바꿔 저장 · 대문자 · 같은 코드 한 번
{
  const g = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN } });
  assert.deepEqual(g.post({ action: "xxList", token: TOKEN }).items, []);
  assert.equal(g.post({ action: "xxSet", token: "wrong", items: [] }).denied, true);
  const r = g.post({ action: "xxSet", token: TOKEN, items: [
    { sku: "1355-2", mark: "xx", field: "전달사항", text: "[xx]미송 표기시 구매" },
    { sku: "1355-2", mark: "XXX", field: "임의필드", text: "중복" },
    { sku: "4578-1", mark: "XXX", field: "전달사항", text: "=XXX" },
    { sku: "bad code!", mark: "XX" }, { sku: "1-1", mark: "XXXX" },
  ] });
  assert.equal(r.total, 2);
  const l = g.post({ action: "xxList", token: TOKEN }).items;
  assert.deepEqual(l.map((x) => [x.sku, x.mark, x.field]), [["1355-2", "XX", "전달사항"], ["4578-1", "XXX", "전달사항"]]);
  assert.equal(g.post({ action: "xxSet", token: TOKEN, items: [{ sku: "9-1", mark: "XX", field: "임의필드", text: "x" }] }).total, 1);
  assert.deepEqual(g.post({ action: "xxList", token: TOKEN }).items.map((x) => x.sku), ["9-1"], "통째로 바뀜");
  console.log("csBoard.mock.test (xx v14): OK");
}
