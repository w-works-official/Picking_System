import assert from "node:assert/strict";
import {
  PHOTO_REQUEST_CLOSED_TEXT,
  PHOTO_REQUEST_CONTENT_TYPE,
  buildPhotoRequestRecord,
  isOpenPhotoRequestEntry,
  parsePhotoRequestRecord,
  photoRequestFileName,
  photoRequestPath,
  productCodeFromPhotoUrl,
  serializePhotoRequestRecord,
  sortPhotoRequests,
} from "../src/domain/photoRequests.mjs";

assert.equal(photoRequestFileName("1000-1"), "1000-1.csv");
assert.equal(photoRequestFileName(" 10591-18 "), "10591-18.csv");
assert.equal(photoRequestFileName("A B/C"), "A_B_C.csv", "unsafe characters never reach the storage key");
assert.equal(photoRequestFileName(""), "");
assert.equal(photoRequestPath("1000-1"), "photo-requests/1000-1.csv");

const base = "https://x.supabase.co/storage/v1/object/public/product-images/sellpia/";
assert.equal(productCodeFromPhotoUrl(`${base}1000-1.__priority.jpg`), "1000-1");
assert.equal(productCodeFromPhotoUrl(`${base}1000-1.__priority.jpg?v=123`), "1000-1");
assert.equal(productCodeFromPhotoUrl(`${base}1000-1.__group.__priority.jpg`), "1000-1");
assert.equal(productCodeFromPhotoUrl(`${base}1000.jpg`), "1000");
assert.equal(productCodeFromPhotoUrl(`${base}SKU%20A.__priority.jpg`), "SKU A");
assert.equal(productCodeFromPhotoUrl("https://example.com/a.png"), "");
assert.equal(productCodeFromPhotoUrl(""), "");

const record = buildPhotoRequestRecord({ code: " 1000-1 ", title: "[P] A-01-09 ] · 실버", requestedAt: "2026-10-27T09:00:00.000Z", source: "picking" });
assert.deepEqual(record, { code: "1000-1", title: "[P] A-01-09 ] · 실버", requestedAt: "2026-10-27T09:00:00.000Z", source: "picking" });
assert.throws(() => buildPhotoRequestRecord({ code: "" }));
// The shared bucket only accepts text/csv (production error: mime type not supported).
assert.equal(PHOTO_REQUEST_CONTENT_TYPE, "text/csv");
const csv = serializePhotoRequestRecord(record);
assert.equal(csv, 'code,title,requestedAt,source\n1000-1,[P] A-01-09 ] · 실버,2026-10-27T09:00:00.000Z,picking\n');
assert.deepEqual(parsePhotoRequestRecord(csv, "1000-1.csv"), { ...record, fileName: "1000-1.csv" });
const tricky = buildPhotoRequestRecord({ code: "9-1", title: 'a,b "c"\nd', requestedAt: "t", source: "inspection" });
assert.deepEqual(parsePhotoRequestRecord(serializePhotoRequestRecord(tricky), "9-1.csv"), { ...tricky, fileName: "9-1.csv" }, "commas, quotes and newlines survive");
assert.equal(parsePhotoRequestRecord(PHOTO_REQUEST_CLOSED_TEXT), null);
assert.equal(parsePhotoRequestRecord(""), null);
assert.equal(parsePhotoRequestRecord("code,title\n,no code\n"), null);
// Listing: closed marker files and non-CSV names are not open requests.
const closedSize = new TextEncoder().encode(PHOTO_REQUEST_CLOSED_TEXT).length;
const openSize = new TextEncoder().encode(serializePhotoRequestRecord(buildPhotoRequestRecord({ code: "1", requestedAt: "" }))).length;
assert.ok(closedSize < 16 && openSize >= 16);
assert.equal(isOpenPhotoRequestEntry({ name: "1000-1.csv", metadata: { size: openSize } }), true);
assert.equal(isOpenPhotoRequestEntry({ name: "1000-1.csv", metadata: { size: closedSize } }), false);
assert.equal(isOpenPhotoRequestEntry({ name: "1000-1.csv", metadata: null }), true, "unknown size stays visible");
assert.equal(isOpenPhotoRequestEntry({ name: "1000-1.json", metadata: { size: 99 } }), false);
assert.equal(isOpenPhotoRequestEntry({ name: ".emptyFolderPlaceholder" }), false);

const sorted = sortPhotoRequests([
  { code: "2", requestedAt: "2026-10-27T01:00:00Z" },
  { code: "1", requestedAt: "2026-10-27T03:00:00Z" },
  { code: "3", requestedAt: "2026-10-27T03:00:00Z" },
]);
assert.deepEqual(sorted.map((r) => r.code), ["1", "3", "2"], "newest first, then code");

import { readFile } from "node:fs/promises";
const app = await readFile(new URL("../src/app/pickingApp.mjs", import.meta.url), "utf8");
assert.doesNotMatch(app.slice(app.indexOf("// ---- 사진 요청"), app.indexOf("function renderPhotoRequestPanel")), /application\/json/, "never upload JSON to the CSV-only bucket");
assert.match(app, /photoRequestUpload\(path, PHOTO_REQUEST_CLOSED_TEXT\)/, "refused deletes fall back to the closed marker");
const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
assert.match(index, /type="button">사진요청보기 <span id="dashboard-photo-request-count"/);
assert.match(app, /if \(image\.closest\("\.custom-order-slip-card, \.custom-order-row-primary"\)\) return;/, "no request button inside the 주문제작 capture area");

console.log("photoRequests.mock.test: OK");
