// 📦 거래처 주문서 표 그림 — 엑셀 A~G열 그대로 (11-10: A열 순번 꼭 포함)
import assert from "node:assert/strict";
import { COLS, isDark, isZeroPrice, softColor } from "../src/app/vendorOrder.mjs";
assert.deepEqual(COLS.map((c) => c.title), ["순번", "사진", "옵션명", "발주량", "임의필드", "매입가", "상품코드"], "A열(순번) ~ G열(상품코드)");
assert.deepEqual(COLS.map((c) => c.key), ["no", "photo", "option", "qty", "extra", "price", "code"]);
// 11-12: 밝은 색은 원본 그대로, 어두운 색은 흰 글씨가 필요 없을 만큼만 밝게
assert.equal(softColor("#FFC7CE"), "#FFC7CE");
assert.equal(softColor("#FFFF00"), "#FFFF00");
for (const c of ["#FF0000", "#000000", "#4472C4", "#C00000"]) assert.ok(!isDark(softColor(c)), c);
assert.equal(softColor(""), "");
// 11-12: 매입가 0 → 가격 확인
for (const v of ["0", " 0 ", "0.00", "₩0", "0원"]) assert.ok(isZeroPrice(v), v);
for (const v of ["", "10", "1,000", "0.5", "없음"]) assert.ok(!isZeroPrice(v), v);
console.log("vendorOrderCols.contract.test: OK");
