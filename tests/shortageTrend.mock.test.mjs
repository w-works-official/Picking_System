import assert from "node:assert/strict";
import { shortageRate, normalizeTrendRows, weekStart, weeklyTrend, dayLabel, addDays, kstToday } from "../src/domain/shortageTrend.mjs";

assert.equal(shortageRate(199, 848), 23.5);
assert.equal(shortageRate(5, 0), null);
assert.equal(weekStart("2026-11-23"), "2026-11-23", "월요일은 그대로");
assert.equal(weekStart("2026-11-29"), "2026-11-23", "일요일 → 그 주 월요일");
assert.equal(weekStart("2026-11-20"), "2026-11-16");
const rows = normalizeTrendRows([
  { day: "2026-11-20", shortage_created: 26, shortage_qty: 26, picked: 214 },
  { day: "2026-11-16", shortage_created: "170", shortage_qty: 175, picked: 815 },
  { day: "2026-11-23", shortage_created: 199, shortage_qty: 203, picked: 848 },
  { day: "bad" },
]);
assert.deepEqual(rows.map((r) => r.day), ["2026-11-16", "2026-11-20", "2026-11-23"]);
const w = weeklyTrend(rows);
assert.deepEqual(w.map((x) => [x.week, x.created, x.picked, x.days]), [["2026-11-16", 196, 1029, 2], ["2026-11-23", 199, 848, 1]]);
assert.equal(w[1].rate, 23.5);
assert.equal(dayLabel("2026-11-23"), "11/23(월)");
assert.equal(addDays("2026-11-24", -44), "2026-10-11");
assert.equal(kstToday(Date.parse("2026-11-23T16:00:00Z")), "2026-11-24");
console.log("shortageTrend: OK");
