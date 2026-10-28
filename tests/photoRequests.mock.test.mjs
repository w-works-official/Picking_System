import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import {
  PHOTO_REQUEST_ENDPOINT,
  buildPhotoRequestRecord,
  normalizePhotoRequestCode,
  parsePhotoRequestResponse,
  photoRequestAddPayload,
  photoRequestClosePayload,
  productCodeFromPhotoUrl,
  sortPhotoRequests,
} from "../src/domain/photoRequests.mjs";

// Endpoint is either empty (feature off) or an Apps Script web app URL.
assert.ok(PHOTO_REQUEST_ENDPOINT === "" || /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(PHOTO_REQUEST_ENDPOINT));

const base = "https://x.supabase.co/storage/v1/object/public/product-images/sellpia/";
assert.equal(productCodeFromPhotoUrl(`${base}1000-1.__priority.jpg`), "1000-1");
assert.equal(productCodeFromPhotoUrl(`${base}1000-1.__priority.jpg?v=123`), "1000-1");
assert.equal(productCodeFromPhotoUrl(`${base}1000-1.__group.__priority.jpg`), "1000-1");
assert.equal(productCodeFromPhotoUrl(`${base}1000.jpg`), "1000");
assert.equal(productCodeFromPhotoUrl(`${base}SKU%20A.__priority.jpg`), "SKU A");
assert.equal(productCodeFromPhotoUrl("https://example.com/a.png"), "");

const record = buildPhotoRequestRecord({ code: " 1000-1 ", title: "[P] A-01-09 ] · 실버", requestedAt: "2026-10-28T09:00:00.000Z", source: "picking" });
assert.deepEqual(record, { code: "1000-1", title: "[P] A-01-09 ] · 실버", requestedAt: "2026-10-28T09:00:00.000Z", source: "picking" });
assert.throws(() => buildPhotoRequestRecord({ code: "" }));
assert.equal(normalizePhotoRequestCode(" a\nb "), "a b");
assert.deepEqual(photoRequestAddPayload(record), { action: "add", ...record });
assert.deepEqual(photoRequestClosePayload(["1", " 1 ", "", "2"], "완료"), { action: "close", codes: ["1", "2"], reason: "완료" });
assert.equal(photoRequestClosePayload(["1"], "아무거나").reason, "취소");

assert.deepEqual(parsePhotoRequestResponse({ ok: true, requests: [{ code: "1", title: "t", requestedAt: "x", source: "s" }, { code: "1" }, { code: "" }] }).records,
  [{ code: "1", title: "t", requestedAt: "x", source: "s" }], "duplicates and empty codes dropped");
assert.throws(() => parsePhotoRequestResponse({ ok: false, error: "거절" }), /거절/);
assert.throws(() => parsePhotoRequestResponse(null));

const sorted = sortPhotoRequests([
  { code: "2", requestedAt: "2026-10-27T01:00:00Z" },
  { code: "1", requestedAt: "2026-10-27T03:00:00Z" },
  { code: "3", requestedAt: "2026-10-27T03:00:00Z" },
]);
assert.deepEqual(sorted.map((r) => r.code), ["1", "3", "2"], "newest first, then code");

// App: no Supabase storage for requests any more; sheet calls only.
const app = await readFile(new URL("../src/app/pickingApp.mjs", import.meta.url), "utf8");
const block = app.slice(app.indexOf("// ---- 사진 요청"), app.indexOf("function productNameForPhotoCode("));
assert.doesNotMatch(block, /db\.storage|imageDb|\.upload\(/);
assert.match(block, /"Content-Type": "text\/plain;charset=utf-8"/, "simple request, no preflight");
assert.match(block, /closePhotoRequests\(fulfilled, "완료"\)/);
assert.match(block, /closePhotoRequests\(\[code\], "취소"\)/);
assert.match(app, /data-photo-request-cancel="\$\{escapeHtml\(record\.code\)\}"/);
assert.match(app, /if \(image\.closest\("\.custom-order-slip-card, \.custom-order-row-primary"\)\) return;/, "no request button inside the 주문제작 capture area");

// Apps Script (docs/photo-request-sheet.gs) against a fake spreadsheet.
const gs = await readFile(new URL("../docs/photo-request-sheet.gs", import.meta.url), "utf8");
function fakeSheet() {
  const data = [];
  let name = "시트1";
  return {
    data,
    setName(next) { name = next; }, getName: () => name,
    getLastRow: () => data.length,
    appendRow(row) { data.push(row.map((v) => (typeof v === "string" && v.startsWith("'") ? v.slice(1) : v))); },
    setFrozenRows() {},
    getRange(row, col, rows, cols) {
      return {
        getValues: () => data.slice(row - 1, row - 1 + rows).map((r) => Array.from({ length: cols }, (_, i) => r[col - 1 + i] ?? "")),
        setValues: (values) => values.forEach((vals, r) => vals.forEach((v, c) => { data[row - 1 + r][col - 1 + c] = v; })),
      };
    },
  };
}
const sheet = fakeSheet();
const ctx = {
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: (n) => (sheet.getName() === n ? sheet : null), getSheets: () => [sheet] }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: { MimeType: { JSON: "json" }, createTextOutput: (text) => ({ text, setMimeType() { return this; } }) },
};
vm.createContext(ctx);
vm.runInContext(gs, ctx);
const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).text);
const get = () => JSON.parse(ctx.doGet({}).text);
assert.deepEqual(get(), { ok: true, requests: [] });
assert.equal(sheet.getName(), "사진요청");
assert.deepEqual(Array.from(sheet.data[0]), ["셀피아코드", "상품", "요청 화면", "요청 시각", "상태", "처리 시각"]);
let res = post({ action: "add", code: "1000-1", title: "실버 피어싱", source: "picking" });
assert.equal(res.ok, true);
assert.deepEqual(Array.from(res.requests.map((r) => r.code)), ["1000-1"]);
res = post({ action: "add", code: "1000-1", title: "실버 피어싱 2", source: "inspection" });
assert.equal(sheet.data.length, 2, "same open code updates the row instead of adding");
assert.equal(res.requests[0].title, "실버 피어싱 2");
post({ action: "add", code: "=HYPERLINK(1)", title: "+evil" });
assert.equal(sheet.data[2][0], "=HYPERLINK(1)".replace(/^/, ""), "stored as text (apostrophe consumed by the sheet)");
post({ action: "add", code: "2000-2", title: "" });
res = post({ action: "close", codes: ["1000-1", "없는코드"], reason: "취소" });
assert.equal(res.changed, 1);
assert.deepEqual(Array.from(res.requests.map((r) => r.code)).sort(), ["2000-2", "=HYPERLINK(1)"].sort());
assert.equal(sheet.data[1][4], "취소");
assert.equal(sheet.data.length, 4, "closing never deletes rows");
res = post({ action: "close", codes: ["2000-2"], reason: "완료" });
assert.equal(sheet.data[3][4], "완료");
res = post({ action: "add", code: "1000-1", title: "다시" });
assert.equal(sheet.data.length, 5, "a cancelled code can be requested again as a new row");
assert.equal(post({ action: "delete" }).ok, false);
assert.equal(post({ action: "add", code: "" }).ok, false);
assert.equal(JSON.parse(ctx.doPost({ postData: { contents: "not json" } }).text).ok, false);
assert.doesNotMatch(gs, /deleteRow|deleteRows|clear\(|DriveApp|UrlFetchApp|MailApp|GmailApp/, "the script only reads/writes this sheet");

console.log("photoRequests.mock.test: OK");
