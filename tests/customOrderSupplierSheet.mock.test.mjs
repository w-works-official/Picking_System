import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  SUPPLIER_SHEET_ITEMS_PER_IMAGE,
  chunkSupplierSheetItems,
  supplierSheetBaseName,
  supplierSheetFileNames,
  supplierSheetItem,
  supplierSheetSummary,
  wrapSheetText,
} from "../src/domain/customOrderSupplierSheet.mjs";

// File name = supplier name as written; only characters Windows refuses are replaced.
assert.equal(supplierSheetBaseName("0-베니스톤 [ 28 ]"), "0-베니스톤 [ 28 ]");
assert.equal(supplierSheetBaseName("3-오르 [40]"), "3-오르 [40]");
assert.equal(supplierSheetBaseName('A/B:C*D?"E"<F>|G\\H'), "A_B_C_D__E__F__G_H");
assert.equal(supplierSheetBaseName("  아트피어스.  "), "아트피어스");
assert.equal(supplierSheetBaseName(""), "매입처 미확인");
assert.deepEqual(supplierSheetFileNames("아트피어스"), ["아트피어스.png"]);
assert.deepEqual(supplierSheetFileNames("아트피어스", 3), ["아트피어스_1.png", "아트피어스_2.png", "아트피어스_3.png"]);

const many = Array.from({ length: 65 }, (_, index) => index);
const pages = chunkSupplierSheetItems(many);
assert.equal(SUPPLIER_SHEET_ITEMS_PER_IMAGE, 30);
assert.deepEqual(pages.map((page) => page.length), [30, 30, 5]);
assert.deepEqual(pages.flat(), many, "no item lost or reordered when split");
assert.deepEqual(chunkSupplierSheetItems([]), [[]]);

const item = supplierSheetItem({ optionName: " 골드 ", barLength: "4바", supplierCode: "001-VENDOR", quantity: 2, productName: "14K 골드 볼 피어싱" }, { photoCode: "1000-1" });
assert.deepEqual(item.fields.map((field) => [field.label, field.value]), [
  ["옵션", "골드"], ["바길이", "4바"], ["업체상품코드", "001-VENDOR"], ["수량", "2개"], ["상품명", "14K 골드 볼 피어싱"],
]);
assert.equal(item.photoCode, "1000-1");
const unknown = supplierSheetItem({ quantity: null });
assert.deepEqual(unknown.fields.map((field) => field.value), ["-", "-", "-", "확인 필요", "-"]);
assert.equal(supplierSheetItem({ quantity: 0 }).fields[3].value, "0개");
assert.equal(supplierSheetSummary([item, item], "2026-10-28"), "발주일 2026-10-28 · 2건 · 총 4개");
assert.equal(supplierSheetSummary([item, unknown], ""), "2건 · 총 2개 · 수량 확인 필요 1건");
assert.equal(supplierSheetSummary([unknown], "d"), "발주일 d · 1건 · 수량 확인 필요 1건");

// Wrapping keeps every character (1 unit per char, width 5).
const measure = (text) => [...text].length;
assert.deepEqual(wrapSheetText("크리스탈 골드 볼", 5, measure), ["크리스탈", "골드 볼"]);
assert.deepEqual(wrapSheetText("ABCDEFGHIJKL", 5, measure), ["ABCDE", "FGHIJ", "KL"]);
assert.deepEqual(wrapSheetText("ab ABCDEFGHIJ c", 5, measure), ["ab", "ABCDE", "FGHIJ", "c"]);
assert.deepEqual(wrapSheetText("", 5, measure), [""]);
const long = "아주 긴 상품명 Long-Product-Name_123 테스트 문구";
assert.equal(wrapSheetText(long, 7, measure).join("").replace(/\s/g, ""), long.replace(/\s/g, ""));
assert.ok(wrapSheetText(long, 7, measure).every((line) => measure(line) <= 7));

// The button sits right next to the supplier name; downloads are read-only and skip cancelled rows.
const app = await readFile(new URL("../src/app/pickingApp.mjs", import.meta.url), "utf8");
assert.match(app, /<strong>\$\{escapeHtml\(group\.supplierCellRaw \|\| "매입처 미확인"\)\}<\/strong>\s*<button class="btn mini custom-order-sheet-btn" type="button" data-supplier-sheet-download[^>]*>사진 다운로드<\/button>\s*<span>\$\{escapeHtml\(summary\)\}<\/span>/);
assert.match(app, /row\.status !== "cancelled"/);
const sheet = app.slice(app.indexOf("// ---- 업체별 발주 사진 다운로드"), app.indexOf("function renderCustomOrderSupplierGroups("));
assert.doesNotMatch(sheet, /\bdb\.|imageDb\.|\.upload\(|\.rpc\(|saveSlipEditBatch|saveInlineSlip/, "image export never writes");

console.log("customOrderSupplierSheet.mock.test: OK");
