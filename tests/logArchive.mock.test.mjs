// v39 🗂 기록 보관함 (2026-11-25): 게시판 · 상담톡 · 메신저 · 거래처 회신 기록을 평일 5일치만 남기고 검색
import assert from "node:assert/strict";
import { loadCsBoardScript } from "./helpers/csBoardFakeSheet.mjs";
import { normalizeLogResult, searchWords, highlightParts, snippet, kstStamp, LOG_KINDS } from "../src/domain/logArchive.mjs";

const TOKEN = "board-token-123", COLLECTOR = "collector-token-1";
const g = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN, COLLECTOR_TOKEN: COLLECTOR, CLAUDE_KEY: "k" }, claude: () => ({ status: 200, text: '["확인해 드리겠습니다", "내일 출고됩니다", "감사합니다"]' }) });
const kst = (s) => new Date(s + "+09:00");
const day = (d) => g.ctx.Utilities.formatDate(d, "Asia/Seoul", "yyyy-MM-dd");

// 평일 5일 기준 (오늘 포함)
assert.equal(day(g.ctx.logCutoff_(kst("2026-11-25T10:00:00"))), "2026-11-19", "수 → 지난주 목요일 0시부터 (수·화·월·금·목)");
assert.equal(day(g.ctx.logCutoff_(kst("2026-11-28T10:00:00"))), "2026-11-23", "토 → 월요일부터 (금·목·수·화·월)");
assert.equal(day(g.ctx.logCutoff_(kst("2026-11-23T08:00:00"))), "2026-11-17", "월 → 지난주 화요일부터");
assert.equal(g.ctx.logCutoff_(kst("2026-11-25T10:00:00")).toISOString(), "2026-11-18T15:00:00.000Z", "한국 시간 0시");

// 게시판 수집 → 기록
let res = g.post({ action: "ingest", token: COLLECTOR, rows: [
  { 업체: "스마트스토어", 게시판: "상품문의", id: "s1", 날짜: "2026-11-25 09:00", 상품명: "별 피어싱", 문의: "언제 와요?", 옵션: "골드 6mm" },
  { 업체: "에이블리", 게시판: "리뷰", id: "r1", 날짜: "2026-11-25 09:10", 상품명: "하트 링", 내용: "예뻐요 =최고", 별점: 5 },
], autoSuggest: false });
assert.equal(res.added, 2);
const logTab = () => g.sheets.find((s) => s.getName() === "기록보관");
assert.ok(logTab(), "기록보관 탭 생김");
assert.equal(logTab().data.length, 3, "머리줄 + 2");
// 같은 글 다시 수집(내용 그대로) → 기록 안 늘어남 · 내용 바뀌면 같은 줄 갱신
g.post({ action: "ingest", token: COLLECTOR, rows: [{ 업체: "스마트스토어", 게시판: "상품문의", id: "s1", 날짜: "2026-11-25 09:00", 상품명: "별 피어싱", 문의: "언제 와요?", 옵션: "골드 6mm" }], autoSuggest: false });
assert.equal(logTab().data.length, 3);
g.post({ action: "ingest", token: COLLECTOR, rows: [{ 업체: "스마트스토어", 게시판: "상품문의", id: "s1", 날짜: "2026-11-25 09:00", 상품명: "별 피어싱", 문의: "언제 와요? 급해요", 옵션: "골드 6mm" }], autoSuggest: false });
assert.equal(logTab().data.length, 3, "같은 기록ID 는 한 줄");
assert.match(String(logTab().data.find((r) => String(r[0]).includes("s1"))[5]), /급해요/);

// 상담톡
g.post({ action: "chatIngest", token: COLLECTOR, platform: "smart", convs: [{ id: "c1", name: "김고객", unread: 1, messages: [{ who: "c", text: "볼사이즈 2mm 있나요?", time: "오후 3:26" }, { who: "s", text: "네 있습니다", time: "오후 3:30" }] }] });
assert.equal(logTab().data.length, 4);

// 메신저 답장 후보 · 거래처 회신은 화면 요청에서 기록
res = g.post({ action: "msnSuggest", token: TOKEN, app: "카톡", name: "0-세븐피어싱", image: "x".repeat(300), mime: "image/png" });
assert.equal(res.ok, true);
assert.equal(logTab().data.length, 5);
assert.match(String(logTab().data[4][5]), /AI 답장 후보:\n1\. 확인해 드리겠습니다/);

// 검색
assert.equal(g.post({ action: "logSearch", token: "bad", q: "" }).denied, true, "비밀번호 필요");
res = g.post({ action: "logSearch", token: TOKEN, q: "" });
assert.equal(res.ok, true);
assert.equal(res.matched, 4);
assert.deepEqual(res.counts, { 문의: 1, 리뷰: 1, 상담톡: 1, 메신저: 1 });
assert.equal(res.items[0].kind, "메신저", "최근 것부터");
res = g.post({ action: "logSearch", token: TOKEN, q: "2MM 볼사이즈" });
assert.deepEqual(res.items.map((x) => x.kind), ["상담톡"], "여러 낱말 모두 · 대소문자 무시");
assert.match(res.items[0].text, /\[고객 오후 3:26\] 볼사이즈 2mm/);
res = g.post({ action: "logSearch", token: TOKEN, q: "피어싱", kind: "메신저" });
assert.deepEqual(res.items.map((x) => x.kind), ["메신저"], "종류 거르기 (대화방 이름도 검색)");
assert.equal(res.counts["문의"], 1, "종류별 건수는 거르기 전");
res = g.post({ action: "logSearch", token: TOKEN, q: "=최고" });
assert.equal(res.items[0].kind, "리뷰", "= 로 시작하는 글도 그대로 검색");

// 오래된 줄은 다음 기록 때 지움 (CS문의 원본은 그대로)
logTab().data.push(["board|old", new Date("2020-01-01T00:00:00Z"), "문의", "x", "옛 글", "옛날 문의", ""]);
assert.equal(g.post({ action: "logSearch", token: TOKEN, q: "옛날" }).matched, 0, "검색에서도 빠짐");
g.post({ action: "chatIngest", token: COLLECTOR, platform: "kakao", convs: [{ id: "k1", name: "이고객", unread: 0, messages: [{ who: "c", text: "안녕하세요" }] }] });
assert.equal(logTab().data.filter((r) => r[0]).length, 6, "옛 줄 지우고 새 줄 추가 (머리줄 + 5)");
assert.ok(!logTab().data.some((r) => r[0] === "board|old"));
assert.equal(g.sheet().data.length, 3, "CS문의 원본은 그대로 (머리줄 + 2)");

// 화면 계산
assert.deepEqual(LOG_KINDS, ["문의", "리뷰", "상담톡", "메신저", "거래처 회신"]);
assert.deepEqual(searchWords("  볼사이즈   2MM "), ["볼사이즈", "2mm"]);
assert.deepEqual(highlightParts("볼사이즈 2mm 있나요 2MM", ["2mm"]).filter((p) => p.hit).map((p) => p.text), ["2mm", "2MM"]);
assert.deepEqual(highlightParts("abc", []), [{ text: "abc", hit: false }]);
assert.equal(highlightParts("abcabc", ["ab", "abc"]).map((p) => p.text).join("|"), "abc|abc", "긴 낱말 먼저");
const long = "가".repeat(300) + "찾는말" + "나".repeat(300);
const sn = snippet(long, ["찾는말"], 100);
assert.ok(sn.includes("찾는말") && sn.startsWith("…") && sn.endsWith("…"));
assert.equal(snippet("짧은 글", ["x"]), "짧은 글");
assert.equal(kstStamp("2026-11-25T05:03:00.000Z"), "11/25(수) 14:03");
assert.equal(kstStamp("x"), "");
const n = normalizeLogResult({ items: [{ id: "a", kind: "문의" }, { kind: "x" }], counts: { 문의: 1, 리뷰: 0 }, matched: 1, total: 9, keepWeekdays: 5, cutoff: "2026-11-18T15:00:00.000Z" });
assert.equal(n.items.length, 1);
assert.deepEqual(n.counts, { 문의: 1 });
assert.equal(n.total, 9);
console.log("logArchive ok");

// v40 AI 답변안: 우리가 실제로 보낸 비슷한 답변(CS문의 등록 완료 · 상담톡 [고객]→[우리])을 예시로
{
  let sent = null;
  const g2 = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN, COLLECTOR_TOKEN: COLLECTOR, CLAUDE_KEY: "k" }, claude: (payload) => { sent = payload; return { status: 200, text: '["안녕하세요 고객님 :) 바변경 가능합니다"]' }; } });
  g2.post({ action: "ingest", token: COLLECTOR, autoSuggest: false, rows: [
    { 업체: "스마트스토어", 게시판: "상품문의", id: "old1", 날짜: "2026-11-20 10:00", 상품명: "14K 링 피어싱", 문의: "바 두께 변경 가능한가요? 16G 로 해주세요" },
    { 업체: "스마트스토어", 게시판: "상품문의", id: "old2", 날짜: "2026-11-20 11:00", 상품명: "하트 귀걸이", 문의: "세트 구성이 어떻게 되나요" },
    { 업체: "스마트스토어", 게시판: "상품문의", id: "new1", 날짜: "2026-11-25 10:00", 상품명: "14K 별 피어싱", 문의: "바 두께 16G 로 변경 되나요?" },
  ] });
  const rows = g2.sheet().data;
  const at = (id) => rows.findIndex((r) => String(r[3]) === id);
  rows[at("old1")][15] = JSON.stringify({ state: "완료", text: "안녕하세요 고객님 :) 바변경 옵션에서 16G 선택해 주시면 1~2일 더 걸려 출고됩니다." });
  rows[at("old2")][15] = JSON.stringify({ state: "완료", text: "세트는 3종 구성입니다." });
  g2.post({ action: "chatIngest", token: COLLECTOR, platform: "smart", convs: [{ id: "t1", name: "고객", unread: 0, messages: [{ who: "c", text: "바 두께 변경 16G 되나요" }, { who: "s", text: "네 고객님 바변경 옵션으로 16G 가능합니다" }] }] });
  const res = g2.post({ action: "suggest", token: TOKEN, key: rows[at("new1")][0] });
  assert.equal(res.ok, true);
  const prompt = sent.messages[0].content;
  assert.match(prompt, /우리가 실제로 보낸 비슷한 답변/);
  assert.match(prompt, /\[예시 1\] 고객: .*바 두께/);
  assert.match(prompt, /바변경 옵션에서 16G 선택해 주시면/, "게시판에서 등록 완료된 답");
  assert.match(prompt, /바변경 옵션으로 16G 가능합니다/, "상담톡에서 우리가 보낸 답");
  assert.doesNotMatch(prompt, /세트는 3종/, "안 비슷한 건 빼기");
  assert.match(prompt, /후보 10개 중 2개 이하로/);
  // 예시가 없으면 예전 그대로
  const g3 = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN, COLLECTOR_TOKEN: COLLECTOR, CLAUDE_KEY: "k" }, claude: (payload) => { sent = payload; return { status: 200, text: '["네"]' }; } });
  g3.post({ action: "ingest", token: COLLECTOR, autoSuggest: false, rows: [{ 업체: "스마트스토어", 게시판: "상품문의", id: "x", 날짜: "2026-11-25 10:00", 상품명: "링", 문의: "언제 와요" }] });
  g3.post({ action: "suggest", token: TOKEN, key: g3.sheet().data[1][0] });
  assert.doesNotMatch(sent.messages[0].content, /예시/);
}
console.log("logArchive examples ok");
