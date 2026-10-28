import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app/pickingApp.mjs", import.meta.url), "utf8");
// 2026-10-28: after 검품 배송보류 ON/해제 succeeds, jump to the invoice input with everything selected.
const toggle = app.slice(app.indexOf("async function toggleSelectedInspectionHold("), app.indexOf("function focusInspectionInvoiceInputForNextScan("));
assert.match(toggle, /toast\(holdOn \? "보류 해제되었습니다\." : "배송보류 ON 처리되었습니다\."\);\s*focusInspectionInvoiceInputForNextScan\(\);\s*\}/, "only after a successful toggle");
assert.match(toggle, /if \(!ok\) return;/, "a failed save does not move focus");
const focus = app.slice(app.indexOf("function focusInspectionInvoiceInputForNextScan("), app.indexOf("async function toggleCsShippingHold("));
assert.match(focus, /state\.activeTab !== "inspection"/);
assert.match(focus, /input\.focus\(\{ preventScroll: true \}\);\s*input\.select\(\);/);
console.log("inspectionHoldFocus.contract.test: OK");
