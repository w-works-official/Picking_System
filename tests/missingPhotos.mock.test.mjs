import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  PHOTO_GROUP_SUFFIX,
  PHOTO_PRIORITY_SUFFIX,
  PHOTO_RANGE_SUFFIX,
  buildMissingPhotoReport,
  photoStemsFromFileNames,
  skuHasProductPhoto,
} from "../src/domain/missingPhotos.mjs";

const stems = photoStemsFromFileNames([
  "1000-1.jpg",
  "2000.jpg",
  "3000-2.__group.jpg",
  "4000-1.__range.__priority.jpg",
  "5000-1.__priority.jpg",
  "readme.txt",
]);

assert.equal(skuHasProductPhoto("1000-1", stems), true, "direct file");
assert.equal(skuHasProductPhoto("1000-2", stems), false, "sibling without its own file");
assert.equal(skuHasProductPhoto("2000-7", stems), true, "common prefix file");
assert.equal(skuHasProductPhoto("3000-2", stems), true, "group file");
assert.equal(skuHasProductPhoto("3000-3", stems), false);
assert.equal(skuHasProductPhoto("4000-1", stems), true, "priority range file");
assert.equal(skuHasProductPhoto("5000-1", stems), true, "priority direct file");
assert.equal(skuHasProductPhoto("", stems), false);
assert.equal(stems.has("readme"), false, "non-jpg ignored");

const report = buildMissingPhotoReport(
  [
    { sellpia_sku_code: "1000-10", sellpia_product_code: "1000", sellpia_product_name: "A", sellpia_option_name: "o10", own_sku: "[P] A-01-10 ]" },
    { sellpia_sku_code: "1000-1", sellpia_product_code: "1000", sellpia_product_name: "A", sellpia_option_name: "o1" },
    { sellpia_sku_code: "1000-2", sellpia_product_code: "1000", sellpia_product_name: "A", sellpia_option_name: "o2" },
    { sellpia_sku_code: "1000-2", sellpia_product_code: "1000", sellpia_product_name: "A dup", sellpia_option_name: "o2" },
    { sellpia_sku_code: "3000-3", sellpia_product_code: "3000", sellpia_product_name: "C", sellpia_option_name: "" },
    { sellpia_sku_code: "2000-7", sellpia_product_code: "2000", sellpia_product_name: "B" },
  ],
  stems,
);
assert.equal(report.totalSkus, 5);
assert.deepEqual(report.skus.map((row) => row.skuCode), ["1000-2", "1000-10", "3000-3"], "missing only, natural order, deduped");
assert.deepEqual(report.products, [
  { productCode: "1000", productName: "A", missingCount: 2 },
  { productCode: "3000", productName: "C", missingCount: 1 },
]);

// The domain suffixes must stay identical to the app's photo naming rules.
const app = await readFile(new URL("../src/app/pickingApp.mjs", import.meta.url), "utf8");
assert.match(app, new RegExp(`PRODUCT_PHOTO_GROUP_SUFFIX = "${PHOTO_GROUP_SUFFIX.replace(".", "\\.")}"`));
assert.match(app, new RegExp(`PRODUCT_PHOTO_RANGE_SUFFIX = "${PHOTO_RANGE_SUFFIX.replace(".", "\\.")}"`));
assert.match(app, new RegExp(`PRODUCT_PHOTO_PRIORITY_SUFFIX = "${PHOTO_PRIORITY_SUFFIX.replace(".", "\\.")}"`));
assert.match(app, /data-dashboard-action === "missing-photo-export"|dashboardAction === "missing-photo-export"/);
assert.doesNotMatch(app.slice(app.indexOf("async function exportMissingPhotoList"), app.indexOf("async function exportMissingPhotoList") + 4000), /\.(insert|update|upsert|delete|remove|upload|move)\(/, "export must stay read-only");

console.log("missingPhotos.mock.test: OK");
