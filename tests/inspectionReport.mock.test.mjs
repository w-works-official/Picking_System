import assert from "node:assert/strict";
import { invoiceDigits, pcLabel, summarizeInspection, hhmm } from "../src/domain/inspectionReport.mjs";

assert.equal(invoiceDigits("1234-5678-9012"), "123456789012");
assert.equal(invoiceDigits("1234"), "", "짧은 번호는 기록 안 함");
assert.equal(pcLabel(2, ""), "컴퓨터2");
assert.equal(pcLabel(2, " 검품대 왼쪽 "), "검품대 왼쪽 (컴퓨터2)");
const s = summarizeInspection({ day: "2026-11-18", pcs: [{ pc: 2, name: "B", count: 3 }, { pc: 1, name: "", count: 5 }], looked: 7, shipped: 10, missing: 3, missingList: [{ invoice: "1", order: "O", at: "x" }] });
assert.deepEqual(s.pcs.map((p) => p.pc), [1, 2], "번호 순");
assert.equal(s.sum, 8);
assert.equal(s.looked, 7);
assert.equal(s.missingRate, 30);
assert.equal(summarizeInspection({}).missingRate, 0);
assert.equal(hhmm("2026-11-18T06:08:27Z"), "15:08");
console.log("inspectionReport: OK");
