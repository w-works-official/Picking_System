import assert from "node:assert/strict";
import {
  createOrderItemOperationsAdapter,
  findCurrentSourceForOperation,
  findOperationForCurrentItem,
  missingSnapshotBackfill,
  resolveEffectiveInboundExpectedDate,
  resolveOperationDisplayFields,
  snapshotFromCurrentOrderItem,
} from "../src/adapters/orderItemOperationsAdapter.mjs";

const current = {
  ord_no: "O-1",
  sellpia_order_item_no: "R-1",
  item_no: "9_R-1",
  p_code: "SKU-1",
  p_dpcode: "OWN-1",
  p_name: "상품 1",
  p_option: "옵션 A",
  sellpia_supplier_cell_raw: "0-세븐피어싱 [ 1 ]",
  sellpia_arbitrary_field_raw: "  VENDOR\t001 /  A  \n",
  sellpia_outbound_confirmed_date: "2026-10-09",
};

const operation = {
  operation_id: "op-1",
  ord_no: "O-1",
  sellpia_order_item_no: "R-1",
  item_no: "1_R-1",
  sellpia_product_code_snapshot: "OLD-SKU",
  own_code_snapshot: "OLD-OWN",
  product_name_snapshot: "예전 상품",
  product_option_snapshot: "예전 옵션",
  supplier_cell_raw_snapshot: "예전 매입처",
  arbitrary_field_raw_snapshot: "  OLD-VENDOR  ",
  inbound_expected_date: "2026-10-12",
  inbound_expected_source: "manual",
};

assert.deepEqual(snapshotFromCurrentOrderItem(current), {
  sellpia_product_code_snapshot: "SKU-1",
  own_code_snapshot: "OWN-1",
  product_name_snapshot: "상품 1",
  product_option_snapshot: "옵션 A",
  supplier_cell_raw_snapshot: "0-세븐피어싱 [ 1 ]",
  arbitrary_field_raw_snapshot: "  VENDOR\t001 /  A  \n",
});

assert.equal(snapshotFromCurrentOrderItem({ ...current, sellpia_arbitrary_field_raw: " \t\n" }).arbitrary_field_raw_snapshot, null);
assert.equal(snapshotFromCurrentOrderItem({ ...current, sellpia_arbitrary_field_raw: null }).arbitrary_field_raw_snapshot, null);
assert.equal(
  snapshotFromCurrentOrderItem({ item: { raw: { sellpia_arbitrary_field_raw: "  nested raw  " } } }).arbitrary_field_raw_snapshot,
  "  nested raw  ",
  "nested raw source must preserve whitespace",
);

const regularMatch = findOperationForCurrentItem(current, [operation]);
assert.equal(regularMatch.status, "matched");
assert.equal(regularMatch.matchMethod, "regular", "changed item_no prefix must not break the canonical regular match");

const legacyOperation = { ...operation, operation_id: "op-legacy", sellpia_order_item_no: null, item_no: current.item_no };
const fallbackMatch = findOperationForCurrentItem(current, [legacyOperation]);
assert.equal(fallbackMatch.status, "matched");
assert.equal(fallbackMatch.matchMethod, "item_no");

const sameSkuSibling = { ...current, sellpia_order_item_no: "R-2", item_no: "9_R-2" };
assert.equal(findOperationForCurrentItem(sameSkuSibling, [operation]).status, "missing", "SKU must never be an identity fallback");

assert.equal(findOperationForCurrentItem(current, [operation, { ...operation, operation_id: "op-2" }]).status, "ambiguous");
assert.equal(findOperationForCurrentItem(current, [
  operation,
  { ...operation, operation_id: "op-3", sellpia_order_item_no: "R-3", item_no: current.item_no },
]).status, "conflict", "regular and fallback keys resolving to different rows must be refused");

assert.equal(findCurrentSourceForOperation(operation, [current]).matchMethod, "regular");
const displayCurrent = resolveOperationDisplayFields({ operation, currentItem: current });
assert.equal(displayCurrent.sellpiaProductCode, "SKU-1");
assert.equal(displayCurrent.supplierCellRaw, "0-세븐피어싱 [ 1 ]");
assert.equal(displayCurrent.arbitraryFieldRaw, "  VENDOR\t001 /  A  \n", "current arbitrary field must win without parsing or trimming");
assert.equal(displayCurrent.sourceMissing, false);
const displayFallback = resolveOperationDisplayFields({ operation, currentItem: null });
assert.equal(displayFallback.sellpiaProductCode, "OLD-SKU");
assert.equal(displayFallback.supplierCellRaw, "예전 매입처");
assert.equal(displayFallback.arbitraryFieldRaw, "  OLD-VENDOR  ", "source cleanup must retain the original snapshot value");
assert.equal(displayFallback.sourceMissing, true);
for (const missingRaw of [undefined, null, "", " \t\n"]) {
  assert.equal(
    resolveOperationDisplayFields({ operation, currentItem: { ...current, sellpia_arbitrary_field_raw: missingRaw } }).arbitraryFieldRaw,
    "  OLD-VENDOR  ",
    "missing current raw field must use the preserved snapshot",
  );
}
assert.equal(resolveOperationDisplayFields().arbitraryFieldRaw, "");
assert.equal(
  resolveOperationDisplayFields({ currentItem: { arbitraryFieldRaw: "  effective alias  " } }).arbitraryFieldRaw,
  "  effective alias  ",
);
assert.deepEqual(missingSnapshotBackfill(operation, current), {}, "existing arbitrary snapshot must never be replaced by backfill");
assert.deepEqual(missingSnapshotBackfill({ ...operation, arbitrary_field_raw_snapshot: " \t" }, current), {},
  "explicit backfill must exclude the insert-only arbitrary snapshot field");
assert.deepEqual(missingSnapshotBackfill({ ...operation, product_name_snapshot: null, arbitrary_field_raw_snapshot: null }, current), {
  product_name_snapshot: "상품 1",
}, "existing snapshot fields must remain backfillable without including an unsupported column");

assert.deepEqual(resolveEffectiveInboundExpectedDate({ operation, currentItem: current }), {
  date: "2026-10-12",
  source: "manual",
  authoritative: true,
  explicitlyCleared: false,
});
assert.deepEqual(resolveEffectiveInboundExpectedDate({
  operation: { ...operation, inbound_expected_date: null },
  currentItem: current,
}), {
  date: "",
  source: "manual",
  authoritative: true,
  explicitlyCleared: true,
}, "manual NULL must suppress the legacy Sellpia date");
assert.deepEqual(resolveEffectiveInboundExpectedDate({ operation: null, currentItem: current }), {
  date: "2026-10-09",
  source: "legacy_sellpia",
  authoritative: false,
  explicitlyCleared: false,
});
assert.deepEqual(resolveEffectiveInboundExpectedDate({
  operation: null,
  currentItem: current,
  skuSchedule: { sellpia_sku: "SKU-1", inbound_expected_date: "2026-10-07" },
}), {
  date: "2026-10-07",
  source: "sku_schedule",
  authoritative: true,
  explicitlyCleared: false,
}, "SKU schedule must override the legacy Sellpia date when no operation override exists");
assert.deepEqual(resolveEffectiveInboundExpectedDate({
  operation: { ...operation, inbound_expected_date: null },
  currentItem: current,
  skuSchedule: { sellpia_sku: "SKU-1", inbound_expected_date: "2026-10-07" },
}), {
  date: "",
  source: "manual",
  authoritative: true,
  explicitlyCleared: true,
}, "manual NULL must also suppress the SKU schedule");
assert.deepEqual(resolveEffectiveInboundExpectedDate({
  operation: { ...operation, inbound_expected_source: "sku_schedule" },
  currentItem: current,
}), {
  date: "2026-10-12",
  source: "sku_schedule",
  authoritative: true,
  explicitlyCleared: false,
});

function createMemoryDb(seed = []) {
  const rows = structuredClone(seed);
  let nextId = rows.length + 1;
  const db = {
    rows,
    updatePayloads: [],
    from(table) {
      assert.equal(table, "order_item_operations");
      const state = { filter: null, mode: "select", payload: null };
      const query = {
        select() { return query; },
        order() { return query; },
        range() { return query; },
        eq(name, value) { state.filter = [name, value]; return query; },
        insert(payload) { state.mode = "insert"; state.payload = structuredClone(payload); return query; },
        update(payload) { state.mode = "update"; state.payload = structuredClone(payload); db.updatePayloads.push(state.payload); return query; },
        then(resolve) {
          let result;
          if (state.mode === "insert") {
            const row = { operation_id: `generated-${nextId++}`, created_at: "now", updated_at: "now", ...state.payload };
            rows.push(row);
            result = [structuredClone(row)];
          } else if (state.mode === "update") {
            const matches = rows.filter((row) => !state.filter || row[state.filter[0]] === state.filter[1]);
            matches.forEach((row) => Object.assign(row, state.payload));
            result = structuredClone(matches);
          } else {
            result = structuredClone(rows.filter((row) => !state.filter || row[state.filter[0]] === state.filter[1]));
          }
          resolve({ data: result, error: null });
        },
      };
      return query;
    },
  };
  return db;
}

const memoryDb = createMemoryDb();
const adapter = createOrderItemOperationsAdapter(memoryDb);
const created = await adapter.upsertOperationForCurrentOrderItem(current, {
  inbound_expected_date: "2026-10-20",
  inbound_expected_source: "manual",
  arbitrary_field_raw_snapshot: "injected snapshot",
});
assert.equal(created.sellpia_product_code_snapshot, "SKU-1");
assert.equal(created.supplier_cell_raw_snapshot, "0-세븐피어싱 [ 1 ]");
assert.equal(created.arbitrary_field_raw_snapshot, "  VENDOR\t001 /  A  \n", "creation must snapshot the source and reject caller snapshot fields");

const changedSource = { ...current, p_name: "최신 상품명", sellpia_supplier_cell_raw: "새 매입처", sellpia_arbitrary_field_raw: "  NEW-VENDOR  " };
const updated = await adapter.upsertOperationForCurrentOrderItem(changedSource, {
  inbound_expected_date: null,
  inbound_expected_source: "manual",
  arbitrary_field_raw_snapshot: "injected update",
});
assert.equal(updated.operation_id, created.operation_id);
assert.equal(updated.product_name_snapshot, "상품 1", "ordinary updates must not overwrite creation snapshots");
assert.equal(updated.supplier_cell_raw_snapshot, "0-세븐피어싱 [ 1 ]");
assert.equal(updated.arbitrary_field_raw_snapshot, created.arbitrary_field_raw_snapshot, "ordinary updates must preserve the creation arbitrary snapshot");
assert.equal(resolveOperationDisplayFields({ operation: updated, currentItem: changedSource }).arbitraryFieldRaw, "  NEW-VENDOR  ");
assert.equal(updated.inbound_expected_date, null);
assert.equal(updated.inbound_expected_source, "manual");
assert.equal(memoryDb.rows.length, 1);
const workflowUpdated = await adapter.updateOperation(updated.operation_id, {
  custom_ordered_on: "2026-10-01",
  internal_memo: "업체 주문 완료",
  arbitrary_field_raw_snapshot: "injected workflow snapshot",
});
assert.equal(workflowUpdated.custom_ordered_on, "2026-10-01");
assert.equal(workflowUpdated.internal_memo, "업체 주문 완료");
assert.equal(workflowUpdated.product_name_snapshot, "상품 1", "workflow updates must preserve creation snapshots");
assert.equal(workflowUpdated.arbitrary_field_raw_snapshot, created.arbitrary_field_raw_snapshot);
const reloadedOperations = await adapter.loadAllOperations();
const reloadedMatch = findOperationForCurrentItem(current, reloadedOperations);
assert.equal(reloadedMatch.status, "matched");
assert.equal(resolveEffectiveInboundExpectedDate({ operation: reloadedMatch.row, currentItem: current }).date, "");
assert.equal(
  resolveEffectiveInboundExpectedDate({ operation: reloadedMatch.row, currentItem: current }).explicitlyCleared,
  true,
  "manual clear must survive a repository reload and continue suppressing the legacy date",
);

const missingSnapshotDb = createMemoryDb([{ ...operation, product_name_snapshot: null, arbitrary_field_raw_snapshot: null }]);
const missingSnapshotAdapter = createOrderItemOperationsAdapter(missingSnapshotDb);
const ordinaryMissingUpdate = await missingSnapshotAdapter.upsertOperationForCurrentOrderItem(current, { internal_memo: "ordinary edit" });
assert.equal(ordinaryMissingUpdate.arbitrary_field_raw_snapshot, null, "ordinary updates must not silently backfill missing snapshots");
assert.equal(ordinaryMissingUpdate.product_name_snapshot, null);
const explicitBackfill = await missingSnapshotAdapter.backfillMissingSnapshots(ordinaryMissingUpdate, [current]);
assert.equal(explicitBackfill.updated, true);
assert.equal(explicitBackfill.operation.product_name_snapshot, "상품 1", "explicit backfill must continue to fill permitted existing snapshot columns");
assert.equal(explicitBackfill.operation.arbitrary_field_raw_snapshot, null);
assert.equal(missingSnapshotDb.updatePayloads.some((payload) => Object.hasOwn(payload, "arbitrary_field_raw_snapshot")), false,
  "ordinary updates and explicit backfill must not send the new insert-only column in an UPDATE patch");
const preservedBackfill = await missingSnapshotAdapter.backfillMissingSnapshots(explicitBackfill.operation, [changedSource]);
assert.equal(preservedBackfill.updated, false);
assert.equal(preservedBackfill.operation.product_name_snapshot, "상품 1");
assert.equal(preservedBackfill.operation.arbitrary_field_raw_snapshot, null);

const operationWithoutSnapshotField = { ...operation };
delete operationWithoutSnapshotField.arbitrary_field_raw_snapshot;
const legacySnapshotAdapter = createOrderItemOperationsAdapter(createMemoryDb([operationWithoutSnapshotField]));
const legacySnapshotUpdate = await legacySnapshotAdapter.upsertOperationForCurrentOrderItem(current, { internal_memo: "legacy ordinary edit" });
assert.equal(Object.hasOwn(legacySnapshotUpdate, "arbitrary_field_raw_snapshot"), false, "ordinary updates must not require or implicitly backfill an absent raw snapshot field");

console.log("orderItemOperationsAdapter.mock.test: OK");
