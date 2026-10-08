import assert from "node:assert/strict";
import {
  CUSTOM_ORDER_STATUS,
  addCalendarDays,
  buildCustomOrderRows,
  buildInboundExpectedRows,
  canClearCustomRequired,
  customOrderDate,
  customOrderSlipDetails,
  customOrderStatus,
  customOrderSuppliers,
  filterCustomOrderRows,
  filterInboundExpectedRows,
  sortInboundExpectedRows,
  sortCustomOrderRows,
} from "../src/domain/customOrder.mjs";

const base = {
  custom_required_at: "2026-09-28T03:00:00Z",
  custom_ordered_on: null,
  custom_received_on: null,
  custom_cancelled_at: null,
  inbound_expected_date: null,
  inbound_expected_source: null,
  internal_memo: null,
};

assert.equal(customOrderStatus(base), CUSTOM_ORDER_STATUS.BEFORE_ORDER);
assert.equal(customOrderStatus({ ...base, custom_ordered_on: "2026-09-29" }), CUSTOM_ORDER_STATUS.ORDERED);
assert.equal(customOrderStatus({ ...base, custom_ordered_on: "2026-09-29", inbound_expected_date: "2026-10-03" }), CUSTOM_ORDER_STATUS.WAITING);
assert.equal(customOrderStatus({ ...base, custom_received_on: "2026-10-03" }), CUSTOM_ORDER_STATUS.RECEIVED);
assert.equal(customOrderStatus({ ...base, custom_received_on: "2026-10-03", custom_cancelled_at: "2026-10-01T01:00:00Z" }), CUSTOM_ORDER_STATUS.CANCELLED);
assert.equal(canClearCustomRequired(base), true);
assert.equal(addCalendarDays("2026-10-01", 14), "2026-10-15");
assert.equal(addCalendarDays("2026-12-25", 14), "2027-01-08");
for (const patch of [
  { custom_ordered_on: "2026-09-29" },
  { custom_received_on: "2026-10-03" },
  { custom_cancelled_at: "2026-10-01T01:00:00Z" },
  { internal_memo: "진행 메모" },
  { inbound_expected_source: "manual" },
]) assert.equal(canClearCustomRequired({ ...base, ...patch }), false);

const currentItems = [
  {
    ord_no: "O-1", sellpia_order_item_no: "R-1", item_no: "1_R-1",
    p_code: "SAME-SKU", p_dpcode: "OWN-1", p_name: "현재 상품 1", p_option: "실버", qty: 2,
    sellpia_supplier_cell_raw: "0-베니스톤 [ 28 ]", sellpia_outbound_confirmed_date: "2026-10-04",
  },
  {
    ord_no: "O-1", sellpia_order_item_no: "R-2", item_no: "2_R-2",
    p_code: "SAME-SKU", p_dpcode: "OWN-2", p_name: "현재 상품 2", p_option: "골드", o_amount: "3",
    sellpia_supplier_cell_raw: "0-세븐피어싱 [ 1 ]",
  },
];

const operations = [
  {
    ...base, operation_id: "before", ord_no: "O-1", sellpia_order_item_no: "R-1", item_no: "9_R-1",
    sellpia_product_code_snapshot: "OLD-1", product_name_snapshot: "예전 이름", supplier_cell_raw_snapshot: "예전 매입처",
    internal_memo: "급한 제작",
  },
  {
    ...base, operation_id: "sibling", ord_no: "O-1", sellpia_order_item_no: "R-2", item_no: "2_R-2",
    custom_ordered_on: "2026-09-29",
  },
  {
    ...base, operation_id: "missing", ord_no: "O-MISSING", sellpia_order_item_no: "R-M", item_no: "1_R-M",
    sellpia_product_code_snapshot: "SNAP-SKU", own_code_snapshot: "SNAP-OWN", product_name_snapshot: "스냅 상품",
    product_option_snapshot: "스냅 옵션", supplier_cell_raw_snapshot: "0-스냅매입처 [ 9 ]",
    custom_ordered_on: "2026-09-30", inbound_expected_date: "2026-10-05", inbound_expected_source: "sku_schedule",
  },
  {
    ...base, operation_id: "manual-clear", ord_no: "O-1", sellpia_order_item_no: "R-1", item_no: "1_R-1",
    custom_required_at: "2026-09-30T03:00:00Z", inbound_expected_source: "manual", inbound_expected_date: null,
  },
];

const rows = buildCustomOrderRows({ operations, currentItems });
assert.equal(rows.length, 4);
const first = rows.find((row) => row.operation.operation_id === "before");
assert.equal(first.display.productName, "현재 상품 1", "current source must beat snapshots");
assert.equal(first.display.supplierCellRaw, "0-베니스톤 [ 28 ]");
assert.equal(first.match.matchMethod, "regular", "item_no prefix changes must not break the primary key");
const sibling = rows.find((row) => row.operation.operation_id === "sibling");
assert.equal(sibling.display.ownCode, "OWN-2", "same-SKU sibling rows must remain independent");
const missing = rows.find((row) => row.operation.operation_id === "missing");
assert.equal(missing.sourceMissing, true);
assert.equal(missing.display.productName, "스냅 상품");
assert.equal(missing.display.supplierCellRaw, "0-스냅매입처 [ 9 ]");
const manualClear = rows.find((row) => row.operation.operation_id === "manual-clear");
assert.equal(manualClear.inbound.date, "", "manual + NULL must suppress the current Sellpia legacy date");
assert.equal(manualClear.inbound.explicitlyCleared, true);

const legacyRows = buildCustomOrderRows({ operations: [{ ...base, operation_id: "legacy", ord_no: "O-1", sellpia_order_item_no: "R-1", item_no: "1_R-1" }], currentItems });
assert.equal(legacyRows[0].inbound.date, "2026-10-04");
assert.equal(legacyRows[0].inbound.source, "legacy_sellpia");

const scheduledRows = buildCustomOrderRows({
  operations: [
    { ...base, operation_id: "scheduled", ord_no: "O-1", sellpia_order_item_no: "R-1", item_no: "1_R-1", custom_ordered_on: "2026-09-29" },
    { ...base, operation_id: "scheduled-clear", ord_no: "O-1", sellpia_order_item_no: "R-2", item_no: "2_R-2", custom_ordered_on: "2026-09-29", inbound_expected_source: "manual", inbound_expected_date: null },
  ],
  currentItems,
  skuSchedules: [{ sellpia_sku: "SAME-SKU", inbound_expected_date: "2026-10-07", own_code: "OWN-SCHEDULE" }],
});
assert.equal(scheduledRows[0].inbound.source, "sku_schedule");
assert.equal(scheduledRows[0].inbound.date, "2026-10-07");
assert.equal(scheduledRows[0].status, CUSTOM_ORDER_STATUS.WAITING, "SKU date must move an ordered row into the waiting detail status");
assert.equal(scheduledRows[1].inbound.date, "", "manual clear must suppress the shared SKU schedule");
assert.equal(scheduledRows[1].status, CUSTOM_ORDER_STATUS.ORDERED);

assert.deepEqual(filterCustomOrderRows(rows, { status: "active" }).map((row) => row.operation.operation_id).sort(), ["before", "manual-clear", "missing", "sibling"]);
assert.deepEqual(filterCustomOrderRows(rows, { status: "waiting" }).map((row) => row.operation.operation_id), ["missing"]);
assert.deepEqual(filterCustomOrderRows(rows, { supplier: "0-스냅매입처 [ 9 ]" }).map((row) => row.operation.operation_id), ["missing"]);
assert.deepEqual(filterCustomOrderRows(rows, { search: "SNAP-OWN" }).map((row) => row.operation.operation_id), ["missing"]);
assert.deepEqual(filterCustomOrderRows(rows, { search: "R-2" }).map((row) => row.operation.operation_id), ["sibling"]);
assert.deepEqual(filterCustomOrderRows(rows, { search: "급한 제작" }).map((row) => row.operation.operation_id), ["before"]);
assert.deepEqual(filterCustomOrderRows(rows, { dateCriterion: "ordered", dateFrom: "2026-09-30", dateTo: "2026-09-30" }).map((row) => row.operation.operation_id), ["missing"]);
assert.equal(customOrderDate(missing, "inbound"), "2026-10-05");
assert.equal(customOrderDate({ operation: { custom_required_at: "2026-10-01T16:00:00Z" } }, "required"), "2026-10-02", "registration filters must use the local business date");
assert.deepEqual(customOrderSuppliers(rows), ["0-베니스톤 [ 28 ]", "0-세븐피어싱 [ 1 ]", "0-스냅매입처 [ 9 ]"]);

const sortRows = Object.freeze([
  ["bar2-0", "나2 매입처", "2026-10-04T03:00:00Z"],
  ["blank-new", "  ", "2026-10-08T03:00:00Z"],
  ["bar10", "나10 매입처", "2026-10-07T03:00:00Z"],
  ["bar2-b", "나2 매입처", "2026-10-04T04:00:00Z"],
  ["blank-old", undefined, "2026-09-29T03:00:00Z"],
  ["first", "가 매입처", "2026-10-06T03:00:00Z"],
  ["bar2-undated", "나2 매입처", "invalid"],
  ["bar2-a", "나2 매입처", "2026-10-04T04:00:00Z"],
].map(([operationId, supplier, requiredAt]) => Object.freeze({
  operation: Object.freeze({ operation_id: operationId, custom_required_at: requiredAt }),
  display: Object.freeze({ supplierCellRaw: supplier, sellpiaProductCode: "SAME-SKU" }),
})));
const originalSortIds = sortRows.map((row) => row.operation.operation_id);
const supplierAscIds = ["first", "bar2-a", "bar2-b", "bar2-0", "bar2-undated", "bar10", "blank-new", "blank-old"];
assert.deepEqual(sortCustomOrderRows(sortRows).map((row) => row.operation.operation_id), supplierAscIds);
assert.deepEqual(sortCustomOrderRows(sortRows, "supplier_asc").map((row) => row.operation.operation_id), supplierAscIds);
assert.deepEqual(sortCustomOrderRows(sortRows, "supplier_desc").map((row) => row.operation.operation_id), ["bar10", "bar2-a", "bar2-b", "bar2-0", "bar2-undated", "first", "blank-new", "blank-old"], "supplier descending must retain missing suppliers last and registration ties descending");
assert.deepEqual(sortCustomOrderRows(sortRows, "required_desc").map((row) => row.operation.operation_id), ["blank-new", "bar10", "first", "bar2-a", "bar2-b", "bar2-0", "blank-old", "bar2-undated"], "registration order must compare the full timestamp and use operation ID for ties");
assert.deepEqual(sortRows.map((row) => row.operation.operation_id), originalSortIds, "sorting must not mutate the input order");
assert.notEqual(sortCustomOrderRows(sortRows), sortRows);
assert.equal(sortCustomOrderRows(sortRows).length, sortRows.length, "same-SKU items must not be grouped");
assert.ok(sortCustomOrderRows(sortRows).every((row) => sortRows.includes(row)), "sorting must preserve the original row objects");
assert.deepEqual(sortCustomOrderRows([]), []);

assert.equal(customOrderSlipDetails(first).quantity, 2);
assert.equal(customOrderSlipDetails(sibling).quantity, 3, "same-SKU siblings must keep independent current quantities");
assert.equal(customOrderSlipDetails(missing).quantity, null, "a source-missing row has no invented quantity");
for (const [currentItem, expected] of [
  [{ qty: 0, o_amount: 99, quantity: 88 }, 0],
  [{ qty: "0" }, 0],
  [{ qty: "2", o_amount: 3, quantity: 4 }, 2],
  [{ qty: null, o_amount: "3", quantity: 4 }, 3],
  [{ qty: "", o_amount: null, quantity: " 4 " }, 4],
  [{ quantity: 0 }, 0],
  [{}, null],
  [null, null],
  [{ qty: "invalid", o_amount: 3 }, null],
  [{ o_amount: "invalid", quantity: 3 }, null],
  [{ qty: -1 }, null],
  [{ qty: 1.5 }, null],
  [{ qty: Infinity }, null],
  [{ qty: NaN }, null],
  [{ qty: true }, null],
  [{ qty: [] }, null],
]) assert.equal(customOrderSlipDetails({ currentItem }).quantity, expected);
assert.equal(customOrderSlipDetails({ operation: { quantity_snapshot: 10, qty: 10 } }).quantity, null, "quantities must come from the matched current item only");

const barChangeLabel = "바길이 변경(주문제작/취소불가):";
for (const [option, optionName, barLength] of [
  [`로즈골드/S[GPA-1-093],${barChangeLabel}4mm바`, "로즈골드/S[GPA-1-093]", "4mm"],
  [`골드[GPA-1-141],${barChangeLabel}8mm바`, "골드[GPA-1-141]", "8mm"],
  [`골드/6mm바[GPA-3-191],${barChangeLabel}4mm바`, "골드[GPA-3-191]", "4mm"],
  [`크리스탈/3mm[GPA-1-101],${barChangeLabel}4mm바`, "크리스탈/3mm[GPA-1-101]", "4mm"],
  [`골드/6mm바[GPA-3-191],${barChangeLabel}4mm바,크리스탈/3mm`, "골드[GPA-3-191],크리스탈/3mm", "4mm"],
  ["골드/6mm바[GPA-3-191]", "골드[GPA-3-191]", "6mm"],
  ["6.5mm바", "", "6.5mm"],
  ["실버 / 8mm바", "실버", "8mm"],
  ["크리스탈/3mm[GPA-1-101]", "크리스탈/3mm[GPA-1-101]", ""],
  ["골드 / 6mm 큐빅", "골드 / 6mm 큐빅", ""],
  ["실버 / 바 길이 8mm", "실버 / 바 길이 8mm", ""],
  ["골드,바길이 변경:4mm바", "골드", "4mm"],
  ["골드/6mm바[GPA-3-191],바 길이 변경 : 4 mm 바", "골드[GPA-3-191]", "4mm"],
  ["골드,바길이 변경(임의 안내):4mm바", "골드,바길이 변경(임의 안내):4mm바", ""],
  [`골드,${barChangeLabel}4mm`, `골드,${barChangeLabel}4mm`, ""],
  ["미니6mm바[3mm]", "미니6mm바[3mm]", ""],
  ["6mm바 포함", "6mm바 포함", ""],
  ["골드/6mm바/8mm바", "골드/6mm바/8mm바", ""],
  [`골드,${barChangeLabel}4mm바,${barChangeLabel}8mm바`, `골드,${barChangeLabel}4mm바,${barChangeLabel}8mm바`, ""],
]) {
  const slipRow = Object.freeze({
    display: Object.freeze({ productOption: option }),
    currentItem: Object.freeze({ qty: 2 }),
    operation: Object.freeze({ internal_memo: "8바로 제작" }),
  });
  assert.deepEqual(customOrderSlipDetails(slipRow), { optionName, barLength, quantity: 2 }, option);
  assert.equal(slipRow.display.productOption, option, "slip preparation must not mutate the original option");
}
assert.deepEqual(customOrderSlipDetails({
  display: { productOption: "14K 옵션 기본 no ball 설명 참고: 크리스탈/M" },
  operation: { internal_memo: "8바" },
}), { optionName: "14K 옵션 기본 no ball 설명 참고: 크리스탈/M", barLength: "", quantity: null }, "memo text must not invent a bar length");
assert.deepEqual(customOrderSlipDetails(), { optionName: "", barLength: "", quantity: null });

const restored = buildCustomOrderRows({
  operations: [operations.find((row) => row.operation_id === "missing")],
  currentItems: [{
    ord_no: "O-MISSING", sellpia_order_item_no: "R-M", item_no: "1_R-M",
    p_code: "RETURNED", p_name: "돌아온 원천 상품", sellpia_supplier_cell_raw: "현재 매입처",
  }],
})[0];
assert.equal(restored.sourceMissing, false);
assert.equal(restored.display.productName, "돌아온 원천 상품");
assert.equal(restored.display.supplierCellRaw, "현재 매입처");

const inboundOperations = [
  {
    ...base, operation_id: "inbound-auto", ord_no: "O-MISSING", sellpia_order_item_no: "R-M", item_no: "1_R-M",
    inbound_expected_date: "2026-10-05", inbound_expected_source: "sku_schedule", internal_memo: "자동 일정 메모",
    product_name_snapshot: "스냅 상품", supplier_cell_raw_snapshot: "0-스냅매입처 [ 9 ]",
  },
  {
    ...base, operation_id: "inbound-clear", ord_no: "O-1", sellpia_order_item_no: "R-2", item_no: "2_R-2",
    inbound_expected_date: null, inbound_expected_source: "manual",
  },
];
const inboundRows = buildInboundExpectedRows({ operations: inboundOperations, currentItems });
assert.equal(inboundRows.length, 3, "legacy, automatic, and explicit-clear rows must share the inbound workspace");
assert.equal(inboundRows.find((row) => row.key === "O-1::R-1").inbound.source, "legacy_sellpia");
assert.equal(inboundRows.find((row) => row.operation?.operation_id === "inbound-auto").sourceMissing, true);
assert.equal(inboundRows.find((row) => row.operation?.operation_id === "inbound-clear").inbound.explicitlyCleared, true);
assert.deepEqual(filterInboundExpectedRows(inboundRows, { source: "legacy_sellpia" }).map((row) => row.key), ["O-1::R-1"]);
assert.deepEqual(filterInboundExpectedRows(inboundRows, { source: "cleared" }).map((row) => row.operation?.operation_id), ["inbound-clear"]);
assert.deepEqual(filterInboundExpectedRows(inboundRows, { search: "O-1" }).map((row) => row.key).sort(), ["O-1::R-1", "O-1::R-2"]);
assert.deepEqual(filterInboundExpectedRows(inboundRows, { dateFrom: "2026-10-05", dateTo: "2026-10-05" }).map((row) => row.operation?.operation_id), ["inbound-auto"]);
assert.deepEqual(sortInboundExpectedRows(inboundRows, "asc").map((row) => row.inbound.date), ["2026-10-04", "2026-10-05", ""]);
assert.deepEqual(sortInboundExpectedRows(inboundRows, "desc").map((row) => row.inbound.date), ["2026-10-05", "2026-10-04", ""]);

console.log("customOrderDomain.mock.test: OK");
