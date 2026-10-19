import assert from "node:assert/strict";
import { applySlipOverrides, buildSlipEditChanges, mergeVisibleSlipOrder, moveSlipId, saveSlipEditBatch, validateSlipFields } from "../src/domain/customOrderSlipEditor.mjs";
import { buildCustomOrderRows, canClearCustomRequired, customOrderEditableSlip, filterCustomOrderRows, groupCustomOrderRows, sortCustomOrderRows } from "../src/domain/customOrder.mjs";

const raw = Object.freeze({ ord_no: "O-1", sellpia_order_item_no: "R-1", p_code: "1000-1", p_option: "골드/6mm바", qty: 1, sellpia_supplier_cell_raw: "원본 매입처", sellpia_arbitrary_field_raw: "RAW//ㅁmemo", p_name: "원본 상품" });
const operation = Object.freeze({ operation_id: "op-1", ord_no: "O-1", sellpia_order_item_no: "R-1", custom_required_at: "2026-10-01", updated_at: "2026-10-01T00:00:00Z", slip_overrides: { supplierCellRaw: "수정 업체", productName: "수정 상품", optionName: "조합 옵션", barLength: "8바", supplierCode: "NEW-CODE", quantity: 2 }, internal_memo: "4바" });
const [row] = buildCustomOrderRows({ operations: [operation], currentItems: [raw] });
assert.equal(customOrderEditableSlip(row).quantity, 2);
assert.equal(customOrderEditableSlip(row).barLength, "8바", "explicit bar override must beat memo parsing");
assert.equal(row.currentItem.qty, 1);
assert.equal(row.display.productName, "원본 상품");
assert.equal(filterCustomOrderRows([row], { supplier: "수정 업체", search: "NEW-CODE" }).length, 1);
assert.equal(groupCustomOrderRows([row])[0].quantity, 2);
const [rescraped] = buildCustomOrderRows({ operations: [operation], currentItems: [{ ...raw, qty: 5, p_name: "재수집 상품" }] });
assert.equal(customOrderEditableSlip(rescraped).quantity, 2, "raw re-collection must not erase slip overrides");
assert.equal(customOrderEditableSlip(rescraped).productName, "수정 상품");
assert.equal(raw.qty, 1);
assert.equal(canClearCustomRequired({ custom_required_at: "2026-10-01", slip_overrides: { quantity: 2 } }), false, "picking must not silently hide an edited slip by unchecking it");
assert.equal(applySlipOverrides({ quantity: 2, optionName: "auto" }, { quantity: 0, optionName: "" }).quantity, 0);
for (const value of [-1, 1.5, "NaN", Infinity, 1000001, true, {}]) assert.throws(() => validateSlipFields({ quantity: value }));
assert.throws(() => validateSlipFields({ ord_no: "other" }));
assert.throws(() => validateSlipFields({ productName: "x".repeat(501) }));
assert.deepEqual(moveSlipId(["a", "b", "c"], "c", "a"), ["c", "a", "b"]);
assert.deepEqual(moveSlipId(["a", "b", "c"], "a", "c", true), ["b", "c", "a"]);
assert.deepEqual(mergeVisibleSlipOrder(["a", "hidden", "b"], ["a", "b"], ["b", "a"]), ["b", "hidden", "a"]);
assert.throws(() => mergeVisibleSlipOrder(["a", "b"], ["a", "b"], ["a", "a"]));
const defaults = { supplierCellRaw: "업체", productName: "상품", optionName: "골드", barLength: "4바", supplierCode: "A", quantity: 1 };
const draft = {
  ids: ["b", "a"], originalIds: ["a", "b"], fullIds: ["a", "hidden", "b"],
  originals: new Map(["a", "hidden", "b"].map((id) => [id, { operation_id: id, updated_at: "version1", internal_memo: "", slip_sort_order: null }])),
  entries: new Map(["a", "b"].map((id) => [id, { fields: { ...defaults }, defaults, initialOverrides: {}, memo: "" }])),
};
draft.entries.get("b").fields.quantity = "2";
draft.entries.get("b").memo = "구성품 추가";
const result = buildSlipEditChanges(draft);
assert.equal(result.reordered, true);
assert.deepEqual(result.changes.map((entry) => entry.operation_id), ["b", "hidden", "a"]);
assert.deepEqual(result.changes[0].patch, { slip_overrides: { quantity: 2 }, internal_memo: "구성품 추가", slip_sort_order: 0 });
assert.deepEqual(result.changes[1].patch, { slip_sort_order: 1 }, "filtered-out rows keep their slot and content");
let calls = 0;
const db = { rpc: async (name, body) => {
  calls++;
  assert.equal(name, "picking_save_custom_order_slips_v1");
  assert.deepEqual(body.p_changes, result.changes);
  return { data: result.changes.map((entry) => ({ ...entry.patch, operation_id: entry.operation_id })) };
} };
assert.equal((await saveSlipEditBatch(db, result.changes)).length, 3);
assert.equal(calls, 1, "batch save must use a single atomic RPC");
await assert.rejects(saveSlipEditBatch({ rpc: async () => ({ error: new Error("version conflict") }) }, result.changes), /version conflict/);
await assert.rejects(saveSlipEditBatch(db, [{ operation_id: "a", expected_updated_at: "v1", patch: { qty: 99 } }]), /버전 정보/);
assert.equal(calls, 1, "invalid source writes must not reach the RPC");
assert.deepEqual(sortCustomOrderRows([
  { ...row, operation: { ...operation, operation_id: "late", slip_sort_order: 2 } },
  { ...row, operation: { ...operation, operation_id: "first", slip_sort_order: 0 } },
  { ...row, operation: { ...operation, operation_id: "new", slip_sort_order: null } },
], "manual").map((entry) => entry.operation.operation_id), ["first", "late", "new"]);
const otherSupplier = { ...row, operation: { ...operation, operation_id: "other", slip_sort_order: 1, slip_overrides: { ...operation.slip_overrides, supplierCellRaw: "다른 업체" } } };
const sameSupplier = { ...row, operation: { ...operation, operation_id: "same", slip_sort_order: 2 } };
const ranked = { ...row, operation: { ...operation, slip_sort_order: 0 } };
for (const order of ["manual", "supplier_asc", "supplier_desc"]) {
  const sorted = sortCustomOrderRows([sameSupplier, otherSupplier, ranked], order);
  assert.equal(Math.abs(sorted.indexOf(sameSupplier) - sorted.indexOf(ranked)), 1, "manual ranks must not split a supplier group");
  assert.ok(sorted.indexOf(ranked) < sorted.indexOf(sameSupplier), "rank applies within the same supplier");
  assert.equal(groupCustomOrderRows(sorted).length, 2);
}
const transferDraft = {
  ...draft, ids: ["a", "b"], originalIds: ["a", "b"], fullIds: ["a", "b"], forceSort: true,
  entries: new Map([["a", { fields: { ...defaults, supplierCellRaw: "대상 업체", quantity: 2 }, defaults, initialOverrides: { quantity: 2 }, memo: "" }]]),
};
const transfer = buildSlipEditChanges(transferDraft);
assert.equal(transfer.reordered, false, "adjacent cross-supplier transfer may keep the same global index");
assert.deepEqual(transfer.changes[0].patch, { slip_overrides: { supplierCellRaw: "대상 업체", quantity: 2 }, slip_sort_order: 0 }, "supplier and rank must save together even when the global index stays the same");
assert.deepEqual(transfer.changes[1].patch, { slip_sort_order: 1 });
assert.equal(raw.sellpia_supplier_cell_raw, "원본 매입처", "supplier reassignment must not change raw source or snapshots");
console.log("customOrderSlipEditor.mock.test: OK");
