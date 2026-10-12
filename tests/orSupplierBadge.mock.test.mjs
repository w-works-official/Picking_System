import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeCurrentDbItem } from "../src/adapters/currentDbPickingAdapter.mjs";
import { isOrGoldItem } from "../src/domain/gold.mjs";

for (const [item, expected, description] of [
  [{ ownCode: "GPA-3-191", raw: { sellpia_supplier_cell_raw: "3-오르 [ 14 ]" } }, true, "normal GPA with supplier Or"],
  [{ ownCode: "[GPA]", raw: { sellpia_supplier_cell_raw: "오르" } }, true, "bare GPA remains a gold item for the badge"],
  [{ ownCode: " gpb-1-019 ", raw: { sellpia_supplier_cell_raw: "0-오르" } }, true, "GPB classification is case insensitive"],
  [{ ownCode: "", raw: { prod_code: "GPA-3-191", sellpia_supplier_cell_raw: "오르" } }, true, "existing prod_code fallback"],
  [{ raw: { own_code: "GPB-1-019", sellpia_supplier_cell_raw: "오르" } }, true, "existing own_code fallback"],
  [{ ownCode: "BP-1-019", raw: { sellpia_supplier_cell_raw: "오르" } }, false, "non-gold Or item"],
  [{ ownCode: "BP-1-019", raw: { prod_code: "GPA-3-191", sellpia_supplier_cell_raw: "오르" } }, false, "normalized own code keeps existing priority"],
  [{ ownCode: " ", raw: { prod_code: "GPA-3-191", sellpia_supplier_cell_raw: "오르" } }, false, "truthy whitespace keeps existing fallback semantics"],
  [{ ownCode: "GPA-3-191", raw: {} }, false, "uncollected supplier"],
  [{ ownCode: "GPA-3-191", raw: { sellpia_supplier_cell_raw: null } }, false, "null supplier"],
  [{ ownCode: "GPA-3-191" }, false, "missing raw item"],
  [null, false, "null item"],
  [undefined, false, "undefined item"],
  [{ ownCode: "GPA-3-191", seller: "오르", raw: { seller: "오르", sellpia_supplier_cell_raw: "베니스톤" } }, false, "seller is not supplier"],
  [{ ownCode: "GPA-3-191", sellpiaMemo1: "오르", raw: { o_shop_memo: "오르", internal_memo: "오르", sellpia_supplier_cell_raw: "베니스톤" } }, false, "memo is not supplier"],
  [{ ownCode: "GPA-3-191", productName: "오르 상품", sellpiaLocation: "오르 위치", raw: { p_name: "오르 상품", p_location: "오르 위치", sellpia_supplier_cell_raw: "베니스톤" } }, false, "product and location are not supplier"],
  [{ ownCode: "GPA-3-191", sellpia_supplier_cell_raw: "오르", raw: { sellpia_supplier_cell_raw: "베니스톤" } }, false, "only the dedicated raw supplier field is authoritative"],
  [{ ownCode: "GPA-3-191", raw: { sellpia_supplier_cell_raw: "OR" } }, false, "supplier must contain the literal Korean name"],
]) {
  const before = structuredClone(item);
  assert.equal(isOrGoldItem(item), expected, description);
  assert.deepEqual(item, before, "badge classification must not mutate item or raw data");
}

const siblings = ["3-오르 [ 14 ]", "0-베니스톤 [ 28 ]"].map((supplier, index) => normalizeCurrentDbItem(Object.freeze({
  ord_no: "O-OR", item_no: `${index + 1}_R-OR`, p_code: "SAME-OR-SKU", p_dpcode: "GPA-3-191",
  p_option: "실버/S", sellpia_supplier_cell_raw: supplier,
})));
assert.equal(siblings[0].sellpiaProductCode, siblings[1].sellpiaProductCode);
assert.deepEqual(siblings.map(isOrGoldItem), [true, false], "same-SKU rows must classify their own raw supplier independently");
assert.deepEqual(siblings.map((item) => item.raw.sellpia_supplier_cell_raw), ["3-오르 [ 14 ]", "0-베니스톤 [ 28 ]"]);

const app = await readFile(new URL("../src/app/pickingApp.mjs", import.meta.url), "utf8");
function sourceBetween(startMarker, endMarker) {
  const start = app.indexOf(startMarker);
  const end = app.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `source block must exist: ${startMarker}`);
  return app.slice(start, end);
}
const sharedHeading = sourceBetween("function renderPickingOptionHeading", "function orderedInvoicesForSystemSequence");
assert.match(sharedHeading, /if \(!isOrGoldItem\(item\)\) return heading;/, "nonmatching rows must keep the existing option markup");
assert.match(sharedHeading, /class="picking-option-heading"/);
assert.match(sharedHeading, /class="or-supplier-badge"/);
assert.match(sharedHeading, />오르<\/span>/);
assert.match(sourceBetween("function renderGoldInvoiceItem", "function renderWorkflowEmpty"), /renderPickingOptionHeading\(item, option, \{ gold: true \}\)/, "gold grouped rows must use the shared badge heading");
assert.match(sourceBetween("function renderPickingRow", "function renderShell"), /renderPickingOptionHeading\(item, option\)/, "normal picking rows must use the same badge heading");

console.log("orSupplierBadge.mock.test: OK");
