import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app/pickingApp.mjs", import.meta.url), "utf8");
const index = await readFile(new URL("../index.html", import.meta.url), "utf8");

assert.match(app, /from "\.\.\/domain\/barcodeScan\.mjs\?v=20261006-scan-buffer1"/);
assert.match(app, /scheduleInvoiceScan\(els\.searchInput,[\s\S]*?\{ dedupe: true \}\)/);
assert.match(app, /scheduleInvoiceScan\(els\.inspectionSearchInput,[\s\S]*?\{ dedupe: true, extraInvoiceNumbers: inspectionInvoiceNumbers \}\)/);
// 2026-10-28: after a barcode settles in 검품, the whole input is selected so the next scan replaces it.
assert.match(app, /\{ dedupe: true, extraInvoiceNumbers: inspectionInvoiceNumbers \}\);\s*selectInspectionScanAfterSettle\(\);/);
const selectFn = app.slice(app.indexOf("function selectInspectionScanAfterSettle("), app.indexOf("function scheduleInvoiceScan("));
assert.match(selectFn, /document\.activeElement !== input\) return;/, "never steals focus");
assert.match(selectFn, /\^\\d\{13,\}\$/, "only barcode-like input (13+ digits), not name searches");
assert.match(selectFn, /input\.select\(\);/);
assert.match(app, /scheduleInvoiceScan\(els\.shortageSearchInput/);
assert.match(app, /scheduleInvoiceScan\(els\.csSearchInput/);
assert.match(app, /scheduleInvoiceScan\(els\.jumpInvoiceInput/);
assert.match(app, /commitInvoiceScan\(els\.jumpInvoiceInput/);
assert.match(app, /scheduleInvoiceScan\(event\.target,[\s\S]*?state\.orderListModal\.search = code/);
assert.match(app, /commitInvoiceScan\(input,[\s\S]*?state\.csWorkLogModal\.search = code/);
assert.doesNotMatch(app, /digits\.length >= 13 && findInvoiceByInvoiceNo/);
const bootstrap = await readFile(new URL("../src/app/pickingBootstrap.mjs", import.meta.url), "utf8");
assert.match(index, /src\/app\/pickingBootstrap\.mjs/);
assert.match(bootstrap, /pickingApp\.mjs\?v=20261028-photo-request-drive2/);

console.log("barcode scan UI contract tests passed");
