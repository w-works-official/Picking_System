// 🚚 배송기록 › 주문서 찾기 (11-11) — 보이는 글자만으로 일치도
import assert from "node:assert/strict";
import { maskedRatio, invoiceRatio, addressRatio, scoreOrder, rankOrders, mergeHints, receiptWindow, itemsToLines, phoneTail } from "../src/domain/shipOrderMatch.mjs";

assert.equal(maskedRatio("홍?동", "홍길동"), 1, "가려진 글자는 빼고 비교");
assert.equal(maskedRatio("홍*동", "홍길순"), 0.5);
assert.equal(maskedRatio("길동", "홍길동"), 0.85, "일부만 보여도 · 길이 다르면 조금 깎음");
assert.equal(maskedRatio("???", "홍길동"), null, "보이는 글자 없으면 비교 안 함");
assert.equal(maskedRatio("010????5678", "01012345678", { fromEnd: true }), 1);
assert.equal(maskedRatio("????5678", "01099995678", { fromEnd: true }), 0.85, "전화는 끝을 맞춰서");
assert.equal(invoiceRatio("6891????4321", "689112344321"), 1);
assert.equal(invoiceRatio("6891????4321", "689199990000"), 0.5);
assert.equal(invoiceRatio("??", "1234"), null);
assert.equal(addressRatio("서울 강남구 테헤란로", "서울특별시 강남구 테헤란로 123"), 1);
assert.equal(addressRatio("서울 강남구 테헤란로", "서울 서초구 강남대로"), 1 / 3);

const orders = [
  { ord_no: "A", receiver: "홍길동", receiver_mobile: "010-1234-5678", receiver_address: "서울 강남구 테헤란로 1", inv_no: "689112344321", receipt_date: "2026-11-10" },
  { ord_no: "B", receiver: "홍길순", receiver_mobile: "010-1111-2222", receiver_address: "부산 해운대구", inv_no: "111122223333", receipt_date: "2026-11-10" },
  { ord_no: "C", receiver: "김철수", receiver_mobile: "010-9999-5678", receiver_address: "서울 강남구", inv_no: "", receipt_date: "2026-11-09" },
];
const hints = { name: "홍?동", phone: "010-????-5678", invoice: "6891????4321", address: "서울 강남구 테헤란로" };
assert.equal(scoreOrder(hints, orders[0]).score, 100);
const ranked = rankOrders(hints, orders, 5);
assert.deepEqual(ranked.map((r) => r.order.ord_no), ["A", "C", "B"], "일치도 순");
assert.ok(ranked[0].score > ranked[1].score + 30);
assert.deepEqual(rankOrders({ name: "박" }, orders), [], "맞는 것 없으면 빈 목록");
assert.equal(scoreOrder({ name: "홍?동" }, orders[0]).score, 100, "힌트가 이름뿐이면 이름만으로");
assert.deepEqual(mergeHints({ name: "홍?동", phone: "010" }, { name: "홍길동", phone: "" }), { name: "홍길동", phone: "010", invoice: "", address: "" }, "적은 글자가 먼저");
assert.deepEqual(receiptWindow("20261110143012"), { from: "2026-10-27", to: "2026-11-10" }, "배송일 앞 14일");
assert.equal(JSON.stringify(itemsToLines([{ p_name: "미니볼", p_option: "3mm", o_amount: 2, p_dpcode: "WW-1", p_code: "A-1" }])), JSON.stringify([{ pname: "미니볼", option: "3mm", qty: "2", own: "WW-1", code: "A-1", etc: "" }]));
assert.equal(phoneTail(orders[0]), "…5678");
console.log("shipOrderMatch.mock.test: OK");
