// 📊 오늘 CS 리포트 (2026-11-17): 리뷰 별5·별1 N개 · 상담톡/게시판 N줄 · 카톡 3건 · 설정은 ⚙ 설정 한 곳
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeReportSettings, markResultLine, RESULT_MARK, sendRooms, reportDue, autoLabel, kstClock, kstDay, dayOf, reviewStars, pickReviews, chatItems, boardItems, fallbackLines,
  reviewMessage, summaryMessage, reportHead, reportPeriod, inPeriod, timeOf,
} from "../src/domain/csDailyReport.mjs";
import { normalizeCsRow } from "../src/domain/csBoard.mjs";
import { helperTooOld } from "../src/app/csDailyReportPanel.mjs";

const T = "2026-11-17";
assert.deepEqual(normalizeReportSettings({}), { reviewN: 3, chatLines: 5, boardLines: 5, rooms: ["", "", ""], auto: false, time: "18:00", weekend: false });
assert.deepEqual(normalizeReportSettings({ reviewN: "99", chatLines: 0, boardLines: "7", room: "  CS  리포트 " }), { reviewN: 10, chatLines: 5, boardLines: 7, rooms: ["CS 리포트", "", ""], auto: false, time: "18:00", weekend: false }, "예전 설정(방 1개)은 1번 칸으로");
assert.deepEqual(normalizeReportSettings({ rooms: ["", " 김실장 ", "박대리", "넷째"] }).rooms, ["", "김실장", "박대리"], "3곳까지 · 빈칸 자리 유지");
assert.deepEqual(sendRooms(["가", "김실장", "김 실장", "", "박대리"]), ["김실장", "박대리"], "2글자 이상 · 같은 이름 한 번만");
assert.equal(kstDay(new Date("2026-11-16T16:30:00Z")), T, "UTC 16:30 = 한국 다음날 01:30");
assert.equal(dayOf("2026-11-16T15:10:00.000Z", T), T);
assert.equal(dayOf("2026.11.17 10:22", T), T);
assert.equal(dayOf("11-17", T), T);
assert.equal(dayOf("3시간 전", T), T);
assert.equal(dayOf("2026-11-16", T), "2026-11-16");
assert.equal(reviewStars({ type: "별점 5" }), 5);
assert.equal(reviewStars({ type: "★☆☆☆☆".replace(/☆/g, "") }), 1);
assert.equal(reviewStars({ type: "10" }), 5, "10점 만점");
assert.equal(reviewStars({ type: "4.5점" }), 4.5);
assert.equal(reviewStars({ type: "사이즈" }), 0);

const raw = (o) => normalizeCsRow({ key: o.id, vendor: o.vendor || "지그재그", board: o.board || "리뷰", id: o.id, date: o.date || "2026-11-17T01:00:00.000Z",
  product: o.product || "14K 볼 피어싱", collectedAt: "2026-11-17T02:00:00.000Z", closed: o.closed,
  reg: o.reg, inquiry: { kind: o.kind || "리뷰", type: o.type || "", title: o.title || "", question: o.q || "" } });
const rows = [
  raw({ id: "r1", type: "별점 5", q: "너무 예뻐요" }),
  raw({ id: "r2", type: "별점 5", q: "매일 하고 다녀요 너무 예쁘고 가벼워서 좋아요 재구매 의사 있어요" }),
  raw({ id: "r3", type: "별점 3", q: "보통이에요 그냥 그래요 길게 써도 보통" }),
  raw({ id: "r4", type: "별점 1", q: "침이 휘어서 왔어요", closed: true }),
  raw({ id: "r5", type: "별점 5", q: "어제 리뷰", date: "2026-11-15T01:00:00.000Z" }),
  raw({ id: "q1", kind: "문의", board: "Q&A", vendor: "메이크샵", title: "재입고", q: "로즈골드 재입고 언제?", reg: { state: "완료", text: "다음 주 입고 예정입니다" } }),
  raw({ id: "q2", kind: "문의", board: "상품문의", vendor: "스마트스토어", q: "주문 취소 가능한가요" }),
  raw({ id: "q3", kind: "문의", board: "문의방", vendor: "에이블리", q: "상담톡에 있는 것" }),
];
const pr = pickReviews(rows, T, 1);
assert.equal(pr.total, 4, "어제 리뷰는 빠짐");
assert.deepEqual([pr.goodCount, pr.badCount], [2, 1]);
assert.deepEqual(pr.good.map((r) => r.id), ["r2"], "별5 중 내용이 긴 것부터 N개");
assert.deepEqual(pr.bad.map((r) => r.id), ["r4"], "답변 끝난(닫힌) 리뷰도 포함");
const rm = reviewMessage(T, pr);
assert.match(rm, /^📊 11\/17\(화\) CS 리포트 1\/3 · ⭐ 리뷰/);
assert.match(rm, /오늘 리뷰 4건 \(별5 2 · 별1 1 · 보통 평가는 뺌\)/);
assert.match(rm, /👍 아주 좋은 리뷰 \(별5\) 1개\n1\. \[지그재그 · 14K 볼 피어싱\]\n   "매일 하고/);
assert.doesNotMatch(rm, /보통이에요/, "보통 평가는 안 나감");
assert.match(reviewMessage(T, pickReviews([], T, 3)), /오늘 들어온 리뷰가 없습니다/);

const bi = boardItems(rows, T, () => "");
assert.equal(bi.length, 2, "리뷰 · 에이블리 문의방 제외");
assert.deepEqual(bi.map((b) => [b.src, b.done]), [["메이크샵", true], ["스마트스토어", false]]);
assert.equal(bi[0].a, "다음 주 입고 예정입니다");

const chats = {
  smart: [{ id: "a", tag: "사이즈", at: "2026-11-17T03:00:00.000Z", messages: [{ who: "c", text: "2mm 있나요" }, { who: "s", text: "품절입니다" }] },
          { id: "b", at: "2026-11-16T03:00:00.000Z", messages: [{ who: "c", text: "어제 것" }] }],
  kakao: [{ id: "c", at: "2026-11-17T05:00:00.000Z", messages: [{ who: "c", text: "언제 와요?" }] }],
  ably: [],
};
const ci = chatItems(chats, T);
assert.deepEqual(ci.map((c) => [c.src, c.done, c.a]), [["톡톡", true, "품절입니다"], ["해피톡", false, ""]]);
const fl = fallbackLines(ci, 1);
assert.equal(fl.length, 1);
assert.match(fl[0], /^\[해피톡\] 언제 와요\? → 답변 X \(외 1건\)$/, "답변 X 부터 · 남은 건수");
const cm = summaryMessage(T, 2, "💬 상담톡", "상담", ci, ["사이즈 문의 → 답변함", "배송 문의 → 미답"]);
assert.equal(cm, "📊 11/17(화) CS 리포트 2/3 · 💬 상담톡\n오늘 상담 2건 (톡톡 1 · 해피톡 1) · 답변 O 1 · 답변 X 1\n\n▪ 사이즈 문의 → 답변 O\n▪ 배송 문의 → 답변 X");
// 11-17 답변 O · X · △(보류)
assert.equal(markResultLine("바두께 변경 문의 → 답변 보류"), "바두께 변경 문의 → 답변 △");
assert.equal(markResultLine("재입고 문의 (3건) → 미답변"), "재입고 문의 (3건) → 답변 X");
assert.equal(markResultLine("교환 문의 → 답변 O"), "교환 문의 → 답변 O");
const held = boardItems([raw({ id: "h1", kind: "문의", board: "Q&A", vendor: "메이크샵", q: "보류 문의" })].map((r) => ({ ...r, choice: { ...r.choice, hold: true } })), T, () => "");
assert.equal(held[0].hold, true);
const hm = summaryMessage(T, 3, "📋 게시판", "문의", [...bi, ...held], ["x → 보류"]);
assert.match(hm, /답변 O 1 · 답변 X 1 · 답변 △ 1/);
assert.match(hm, /▪ x → 답변 △$/);
assert.match(fallbackLines([...held, ...bi], 3).join("|"), /^\[스마트스토어\][^|]*→ 답변 X\|\[메이크샵\] 보류 문의 → 답변 △\|\[메이크샵\][^|]*→ 답변 O$/);
assert.equal(RESULT_MARK.hold, "답변 △");
assert.match(summaryMessage(T, 3, "📋 게시판", "문의", [], []), /3\/3 · 📋 게시판\n오늘 들어온 문의가 없습니다\.$/);
assert.match(summaryMessage(T, 2, "💬 상담톡", "상담", [], []), /오늘 들어온 상담이 없습니다\.$/);
assert.equal(reportHead("2026-11-16", 1, "x"), "📊 11/16(월) CS 리포트 1/3 · x");

assert.equal(helperTooOld("1.29 (2026-11-13)"), true);
assert.equal(helperTooOld("1.30 (2026-11-17)"), false);
assert.equal(helperTooOld(""), true);

// 화면 연결: ⚙ 설정 맨 위 한 곳 · 시트 v30 · 웹연결 1.30
const html = readFileSync(new URL("../cs/index.html", import.meta.url), "utf8");
assert.match(html, /data-left-panel="settings" hidden>\s*<!-- 📊 오늘 CS 리포트[^>]*-->\s*<div data-report-box><\/div>/);
assert.match(html, /csBoardApp\.mjs\?v=20261118-rp24/);
const app = readFileSync(new URL("../src/app/csBoardApp.mjs", import.meta.url), "utf8");
assert.match(app, /if \(tab === "settings"\) openReport\(\);/);
assert.match(app, /import\("\.\/csDailyReportPanel\.mjs\?v=20261118-rp24"\)/);
const panel = readFileSync(new URL("../src/app/csDailyReportPanel.mjs", import.meta.url), "utf8");
assert.match(panel, /data-rp-room="\$\{i\}"/);
assert.match(panel, /for \(const \[i, room\] of rooms\.entries\(\)\)/);
const gs = readFileSync(new URL("../docs/cs-board-sheet.gs", import.meta.url), "utf8");
assert.match(gs, /if \(action === 'reportData'\) return reportData_\(body\);/);
assert.match(gs, /if \(action === 'reportSummary'\) return reportSummary_\(body\);/);
const staff = gs.match(/var staff = \[([^\]]+)\]/)[1];
assert.match(staff, /'reportData'/, "직원 요청 목록에 없으면 '알 수 없는 요청'으로 막힘");
assert.match(staff, /'reportSummary'/);
assert.match(gs, /it\.hold \? '답변 △\(보류\)' : it\.done \? '답변 O' : '답변 X'/);
const py = readFileSync(new URL("../docs/g1_v3_link.py", import.meta.url), "utf8");
assert.match(py, /LINK_VER = "1\.3\d /);
assert.match(py, /if p == "\/msn\/text":/);
const slots = readFileSync(new URL("../src/app/msnSlots.mjs", import.meta.url), "utf8");
assert.match(slots, /MSN_HELPER_MIN = "1\.3[0-9]"/);   // 1.30 이상 (11-18 1.36)
// ⏰ 자동 보내기: 평일만(기본) · 주말 포함 · 예약 시각~3시간 · 하루 한 번
const at = (iso) => new Date(iso);   // 한국 시각 = UTC + 9
const A = normalizeReportSettings({ auto: true, time: "18:00", rooms: ["나와의 채팅"] });
assert.equal(A.weekend, false);
assert.equal(normalizeReportSettings({ time: "25:00" }).time, "18:00");
assert.equal(reportDue(A, at("2026-11-17T09:00:00Z")), true, "화 18:00");
assert.equal(reportDue(A, at("2026-11-17T08:59:00Z")), false, "17:59 는 아직");
assert.equal(reportDue(A, at("2026-11-17T11:59:00Z")), true, "20:59 — 3시간 안이면 늦게 켜도 보냄");
assert.equal(reportDue(A, at("2026-11-17T12:00:00Z")), false, "21:00 넘으면 안 보냄");
assert.equal(reportDue(A, at("2026-11-17T09:30:00Z"), "2026-11-17"), false, "오늘 이미 보냄");
assert.equal(reportDue(A, at("2026-11-21T09:00:00Z")), false, "토요일은 기본으로 안 보냄");
assert.equal(reportDue({ ...A, weekend: true }, at("2026-11-21T09:00:00Z")), true, "주말 포함이면 토요일도");
assert.equal(reportDue({ ...A, auto: false }, at("2026-11-17T09:00:00Z")), false);
assert.equal(reportDue({ ...A, rooms: ["", "", ""] }, at("2026-11-17T09:00:00Z")), false, "받는 사람 없으면 안 보냄");
assert.deepEqual(kstClock(at("2026-11-16T15:30:00Z")), { day: "2026-11-17", min: 30, wd: 2 });
assert.equal(autoLabel(A), "⏰ 평일(월~금) 18:00 에 자동으로 보냅니다");
assert.equal(autoLabel({ ...A, weekend: true, time: "09:30" }), "⏰ 매일 09:30 에 자동으로 보냅니다");
assert.match(autoLabel({ auto: false }), /꺼짐/);
assert.match(panel, /data-rp-chk="weekend"/);
assert.match(panel, /type="time" data-rp="time"/);
assert.match(app, /\.auto === true\) openReport\(\)/, "자동 켠 PC 는 화면을 열 때부터 시간 확인");
assert.match(panel, /_lock`, me\)/, "탭이 여러 개여도 한 탭만 보냄");
// 11-17 요청: 11-18 리포트부터 '당일 19:00 기준 지난 24시간' (그 전날은 오늘 날짜 그대로)
assert.equal(reportPeriod(new Date("2026-11-17T10:00:00Z"), "19:00"), "2026-11-17", "11-17 은 그대로 오늘");
const P = reportPeriod(new Date("2026-11-18T10:00:30Z"), "19:00");   // 11-18 19:00:30 KST
assert.equal(P.day, "2026-11-18");
assert.equal(P.to, Date.parse("2026-11-18T10:00:00Z"));
assert.equal(P.from, Date.parse("2026-11-17T10:00:00Z"));
assert.equal(P.label, "11/17 19:00 ~ 11/18 19:00");
const early = reportPeriod(new Date("2026-11-18T06:00:00Z"), "19:00");   // 15:00 KST 에 손으로 = 지금까지 24시간
assert.equal(early.to, Date.parse("2026-11-18T06:00:00Z"));
assert.equal(timeOf("2026-11-17 20:35"), Date.parse("2026-11-17T11:35:00Z"));
assert.equal(timeOf("2026-11-17"), null);
assert.ok(inPeriod({ date: "2026-11-17 20:35" }, P), "어제 19시 뒤");
assert.ok(!inPeriod({ date: "2026-11-17 18:59" }, P), "어제 19시 전은 뺌");
assert.ok(!inPeriod({ date: "2026-11-18 19:10" }, P), "기준 시각 뒤는 다음 리포트");
assert.ok(inPeriod({ date: "2026-11-17", collectedAt: "2026-11-17T12:00:00Z" }, P), "날짜만 → 수집 시각 (11-17 21:00 KST)");
assert.ok(!inPeriod({ date: "2026-11-17", collectedAt: "2026-11-17T05:00:00Z" }, P), "11-17 14:00 수집은 어제 리포트");
assert.ok(inPeriod({ date: "2026-11-18" }, P) && !inPeriod({ date: "2026-11-17" }, P), "시각을 모르면 날짜로");
const prP = pickReviews([raw({ id: "p1", kind: "리뷰", type: "별점 5", q: "", date: "2026-11-18 09:00" })].map((r) => ({ ...r, date: "2026-11-18 09:00" })), P, 3);
const rmP = reviewMessage(P, prP);
assert.match(rmP, /\(11\/17 19:00 ~ 11\/18 19:00\)/);
assert.match(rmP, /지난 24시간 리뷰 1건/);
assert.match(rmP, /\(글 없이 별점만\)/);
assert.doesNotMatch(rmP, /""/);
assert.match(summaryMessage(P, 2, "💬 상담톡", "상담", [], []), /지난 24시간 들어온 상담이 없습니다\.$/);
assert.equal(chatItems({ smart: [{ at: "2026-11-17T09:00:00Z", messages: [{ who: "c", text: "a" }] }, { at: "2026-11-17T11:00:00Z", messages: [{ who: "c", text: "b" }] }] }, P).length, 1);
console.log("csDailyReport: OK");
