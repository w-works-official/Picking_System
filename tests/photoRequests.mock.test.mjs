import assert from "node:assert/strict";
import {
  buildPhotoRequestRecord,
  parsePhotoRequestRecord,
  photoRequestFileName,
  photoRequestPath,
  productCodeFromPhotoUrl,
  sortPhotoRequests,
} from "../src/domain/photoRequests.mjs";

assert.equal(photoRequestFileName("1000-1"), "1000-1.json");
assert.equal(photoRequestFileName(" 10591-18 "), "10591-18.json");
assert.equal(photoRequestFileName("A B/C"), "A_B_C.json", "unsafe characters never reach the storage key");
assert.equal(photoRequestFileName(""), "");
assert.equal(photoRequestPath("1000-1"), "photo-requests/1000-1.json");

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
assert.deepEqual(parsePhotoRequestRecord(JSON.stringify(record), "1000-1.json"), { ...record, fileName: "1000-1.json" });
assert.equal(parsePhotoRequestRecord("not json"), null);
assert.equal(parsePhotoRequestRecord(JSON.stringify({ title: "no code" })), null);

const sorted = sortPhotoRequests([
  { code: "2", requestedAt: "2026-10-27T01:00:00Z" },
  { code: "1", requestedAt: "2026-10-27T03:00:00Z" },
  { code: "3", requestedAt: "2026-10-27T03:00:00Z" },
]);
assert.deepEqual(sorted.map((r) => r.code), ["1", "3", "2"], "newest first, then code");

import { readFile } from "node:fs/promises";
const app = await readFile(new URL("../src/app/pickingApp.mjs", import.meta.url), "utf8");
assert.match(app, /if \(image\.closest\("\.custom-order-slip-card, \.custom-order-row-primary"\)\) return;/, "no request button inside the 주문제작 capture area");

console.log("photoRequests.mock.test: OK");
