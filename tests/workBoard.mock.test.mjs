// 📋 업무 관리 › 업무 내역 (2026-11-25): 계산 + 시트 workLoad · workSave · workTemplate · workHistory
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadCsBoardScript } from "./helpers/csBoardFakeSheet.mjs";
import { kstDay, addDays, dayLabel, sumMin, fmtMin, copyChecked, moveLine, historyStats, monthGrid, monthShift, readSlots, writeSlots, WORK_SLOT_MAX, cleanMin } from "../src/domain/workBoard.mjs";

assert.equal(kstDay(new Date("2026-11-25T15:30:00Z")), "2026-11-26", "한국 시간 날짜");
assert.equal(addDays("2026-11-30", 1), "2026-12-01");
assert.equal(dayLabel("2026-11-25"), "11/25(수)");
assert.equal(fmtMin(0), "0분"); assert.equal(fmtMin(45), "45분"); assert.equal(fmtMin(130), "2시간 10분"); assert.equal(fmtMin(120), "2시간");
assert.equal(cleanMin("-3"), 0); assert.equal(cleanMin("99999"), 1440);
assert.equal(sumMin([{ min: 30 }, { min: "15" }, {}]), 45);

const tpl = [{ id: "a", text: "검품", min: 60 }, { id: "b", text: "포장", min: 30 }, { id: "c", text: "CS 답변", min: 20 }];
const copied = copyChecked(tpl, ["c", "a"]);
assert.deepEqual(copied.map((x) => [x.text, x.min, x.from]), [["검품", 60, "a"], ["CS 답변", 20, "c"]], "고른 것만 · 예상 시간 그대로");
assert.ok(copied.every((x) => x.id && x.id !== x.from), "복사한 줄은 새 아이디 (같은 업무를 두 번 복사해도 따로)");

let day = { am: [{ id: "1", text: "검품", min: 60 }, { id: "2", text: "포장", min: 30 }], pm: [{ id: "3", text: "CS", min: 20 }] };
day = moveLine(day, "2", "pm");
assert.deepEqual([day.am.map((x) => x.id), day.pm.map((x) => x.id)], [["1"], ["3", "2"]], "오후 끝으로");
day = moveLine(day, "2", "pm", "3");
assert.deepEqual(day.pm.map((x) => x.id), ["2", "3"], "앞에 놓기");
day = moveLine(day, "3", "am", "1");
assert.deepEqual([day.am.map((x) => x.id), day.pm.map((x) => x.id)], [["3", "1"], ["2"]]);
assert.equal(moveLine(day, "zz", "am"), day, "없는 줄은 그대로");

const st = historyStats([
  { day: "2026-11-25", am: [{ text: "검품", min: 60 }], pm: [{ text: "포장", min: 30 }], memo: "택배 늦게 옴" },
  { day: "2026-11-24", am: [{ text: "검품", min: 40 }], pm: [{ text: "CS 답변", min: 0 }], memo: "" },
]);
assert.equal(st.days, 2); assert.equal(st.avgTotal, 65);
assert.deepEqual(st.tasks[0], { text: "검품", count: 2, avgMin: 50 });
assert.deepEqual(st.tasks.find((t) => t.text === "CS 답변"), { text: "CS 답변", count: 1, avgMin: 0 }, "시간 안 적은 업무는 평균 0(-)");
assert.deepEqual(st.memos, [{ day: "2026-11-25", memo: "택배 늦게 옴" }]);
assert.deepEqual(st.perDay[0], { day: "2026-11-25", total: 90, count: 2 });

const w = monthGrid("2026-11-25");
assert.equal(w[0][0], "2026-11-01", "11/1 은 일요일"); assert.equal(w.flat().filter(Boolean).length, 30); assert.ok(w.every((r) => r.length === 7));
assert.equal(monthShift("2026-12-15", 1), "2027-01-01"); assert.equal(monthShift("2026-01-15", -1), "2025-12-01");

const mem = new Map(); const st2 = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
assert.deepEqual(readSlots(st2), [""], "처음엔 빈 슬롯 1개");
writeSlots(st2, ["가", "나", "다", "라", "마", "바"]);
assert.equal(readSlots(st2).length, WORK_SLOT_MAX, "최대 5개");

// 시트
const TOKEN = "board-token-123";
const g = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN } });
assert.equal(g.post({ action: "workLoad", token: "bad" }).denied, true);
let r = g.post({ action: "workTemplate", token: TOKEN, staff: "지영", items: [{ id: "t1", text: "검품", min: 60 }, { text: "  " }, { id: "t2", text: "=포장", min: "30" }], editor: "지영" });
assert.equal(r.ok, true); assert.deepEqual(r.items.map((x) => x.text), ["검품", "=포장"]);
r = g.post({ action: "workSave", token: TOKEN, staff: "지영", day: "2026-11-25", am: [{ id: "x1", text: "검품", min: 50 }], pm: [{ id: "x2", text: "포장", min: 30 }], memo: "오늘 메모" });
assert.equal(r.ok, true); assert.equal(r.day, "2026-11-25");
g.post({ action: "workSave", token: TOKEN, staff: "지영", day: "2026-11-25", am: [{ id: "x1", text: "검품", min: 55 }], pm: [], memo: "고침" });
g.post({ action: "workSave", token: TOKEN, staff: "민수", day: "2026-11-24", am: [{ text: "CS", min: 20 }] });
assert.equal(g.post({ action: "workSave", token: TOKEN, staff: "", day: "2026-11-25" }).ok, false);
assert.equal(g.post({ action: "workSave", token: TOKEN, staff: "지영", day: "11/25" }).ok, false);
const tab = g.sheets.find((s) => s.getName() === "업무내역");
assert.equal(tab.data.length, 1 + 3, "머리줄 + 자주 하는 업무 1 + 날짜 2 (같은 날 다시 저장은 같은 줄)");
r = g.post({ action: "workLoad", token: TOKEN, day: "2026-11-25" });
assert.deepEqual(r.staff, ["민수", "지영"]);
assert.deepEqual(r.templates["지영"].map((x) => x.text), ["검품", "=포장"]);
assert.equal(r.days["지영"].am[0].min, 55); assert.equal(r.days["지영"].memo, "고침");
assert.equal(r.days["민수"], undefined, "다른 날 업무는 안 섞임");
assert.deepEqual(r.calendar, { "2026-11-25": ["지영"], "2026-11-24": ["민수"] });
r = g.post({ action: "workLoad", token: TOKEN, day: "2026-11-26" });
assert.deepEqual(r.days, {}, "다음 날은 빈 업무");
assert.equal(r.templates["지영"].length, 2, "자주 하는 업무는 그대로");
r = g.post({ action: "workHistory", token: TOKEN, staff: "지영" });
assert.deepEqual(r.items.map((x) => x.day), ["2026-11-25"]);
r = g.post({ action: "workHistory", token: TOKEN });
assert.deepEqual(r.items.map((x) => [x.staff, x.day]), [["지영", "2026-11-25"], ["민수", "2026-11-24"]]);

// 화면 연결
const html = readFileSync("task/index.html", "utf8");
assert.match(html, /data-work-tab="log"[^>]*>업무 내역<\/button>/);
assert.match(html, /data-work-tab="ship"[^>]*>배송 내역<\/button>/);
assert.match(html, /workBoot\.mjs\?v=20261125-work1/);
console.log("workBoard ok");
