// 📦 거래처 주문서 표 그림 — 엑셀 A~G열 그대로 (11-10: A열 순번 꼭 포함)
import assert from "node:assert/strict";
import { COLS } from "../src/app/vendorOrder.mjs";
assert.deepEqual(COLS.map((c) => c.title), ["순번", "사진", "옵션명", "발주량", "임의필드", "매입가", "상품코드"], "A열(순번) ~ G열(상품코드)");
assert.deepEqual(COLS.map((c) => c.key), ["no", "photo", "option", "qty", "extra", "price", "code"]);
console.log("vendorOrderCols.contract.test: OK");
