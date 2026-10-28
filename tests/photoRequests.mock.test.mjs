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
  photoRequestFillNamesPayload,
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
assert.deepEqual(record, { code: "1000-1", title: "[P] A-01-09 ] · 실버", productName: "", requestedAt: "2026-10-28T09:00:00.000Z", source: "picking" });
assert.equal(buildPhotoRequestRecord({ code: "1", productName: " 뽀띠 블룸\n피어싱 " }).productName, "뽀띠 블룸 피어싱");
assert.deepEqual(photoRequestFillNamesPayload([{ code: "1", productName: "a" }, { code: "1", productName: "b" }, { code: "2", productName: "" }, { code: "", productName: "x" }]), { action: "fill", items: [{ code: "1", productName: "a" }] });
assert.equal(photoRequestFillNamesPayload(Array.from({ length: 80 }, (_, i) => ({ code: String(i), productName: "n" }))).items.length, 50);
assert.throws(() => buildPhotoRequestRecord({ code: "" }));
assert.equal(normalizePhotoRequestCode(" a\nb "), "a b");
assert.deepEqual(photoRequestAddPayload(record), { action: "add", ...record });
assert.deepEqual(photoRequestClosePayload(["1", " 1 ", "", "2"], "완료"), { action: "close", codes: ["1", "2"], reason: "완료" });
assert.equal(photoRequestClosePayload(["1"], "아무거나").reason, "취소");

assert.deepEqual(parsePhotoRequestResponse({ ok: true, requests: [{ code: "1", title: "t", requestedAt: "x", source: "s" }, { code: "1" }, { code: "" }] }).records,
  [{ code: "1", title: "t", productName: "", requestedAt: "x", source: "s" }], "duplicates and empty codes dropped");
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
assert.match(block, /productName: productNameForPhotoCode\(normalizePhotoRequestCode\(code\)\)/, "product name sent with each request");
assert.match(app, /await loadPhotoRequests\(\);\s*await fillMissingPhotoRequestNames\(\);/, "missing names are filled when the list is opened");
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
        getValue: () => data[row - 1]?.[col - 1] ?? "",
        setValue: (v) => { data[row - 1][col - 1] = v; },
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
assert.deepEqual(Array.from(sheet.data[0]), ["셀피아코드", "상품", "요청 화면", "요청 시각", "상태", "처리 시각", "상품명"]);
let res = post({ action: "add", code: "1000-1", title: "실버 피어싱", source: "picking", productName: "뽀띠 블룸 피어싱" });
assert.equal(sheet.data[1][6], "뽀띠 블룸 피어싱");
assert.equal(res.requests[0].productName, "뽀띠 블룸 피어싱");
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
// fill: only empty names on open rows; existing names and closed rows untouched.
post({ action: "add", code: "3000-3", title: "x" });
post({ action: "add", code: "4000-4", title: "y", productName: "원래 이름" });
res = post({ action: "fill", items: [{ code: "3000-3", productName: "새 이름" }, { code: "4000-4", productName: "덮어쓰기 안 됨" }, { code: "2000-2", productName: "닫힌 줄" }] });
assert.equal(res.changed, 1);
assert.equal(sheet.data.find((r) => r[0] === "4000-4")[6], "원래 이름", "existing name kept");
assert.equal(sheet.data[1][6], "뽀띠 블룸 피어싱", "closed row keeps its name");
assert.equal(sheet.data.find((r) => r[0] === "3000-3")[6], "새 이름");
assert.equal(sheet.data[3][6] ?? "", "", "closed row untouched");
assert.equal(post({ action: "delete" }).ok, false);

// A first-version sheet (6 header cells, existing rows) gets only the new header cell.
const old = fakeSheet();
old.setName("사진요청");
old.data.push(["셀피아코드", "상품", "요청 화면", "요청 시각", "상태", "처리 시각"], ["11546-1", "[SA-03-04_4] · 원타입", "inspection", "t", "요청", ""]);
const ctx2 = { ...ctx, SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => old, getSheets: () => [old] }) } };
vm.createContext(ctx2);
vm.runInContext(gs, ctx2);
const got = JSON.parse(ctx2.doGet({}).text);
assert.equal(old.data[0][6], "상품명");
assert.deepEqual(Array.from(old.data[1]).slice(0, 6), ["11546-1", "[SA-03-04_4] · 원타입", "inspection", "t", "요청", ""], "existing row unchanged");
assert.equal(got.requests[0].productName, "");
JSON.parse(ctx2.doPost({ postData: { contents: JSON.stringify({ action: "fill", items: [{ code: "11546-1", productName: "원터치 링" }] }) } }).text);
assert.equal(old.data[1][6], "원터치 링");
assert.equal(post({ action: "add", code: "" }).ok, false);
assert.equal(JSON.parse(ctx.doPost({ postData: { contents: "not json" } }).text).ok, false);
// Korean time zone is set once on the spreadsheet.
let tz = "America/Los_Angeles";
const ctx3 = { ...ctx, SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSpreadsheetTimeZone: () => tz, setSpreadsheetTimeZone: (z) => { tz = z; }, getSheetByName: () => sheet, getSheets: () => [sheet] }) } };
vm.createContext(ctx3);
vm.runInContext(gs, ctx3);
JSON.parse(ctx3.doGet({}).text);
assert.equal(tz, "Asia/Seoul");
assert.doesNotMatch(gs, /deleteRow|deleteRows|clear\(|DriveApp|UrlFetchApp|MailApp|GmailApp/, "the script only reads/writes this sheet");

console.log("photoRequests.mock.test: OK");
