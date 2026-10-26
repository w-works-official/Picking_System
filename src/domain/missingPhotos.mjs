// Which Sellpia SKUs have no product photo in Storage. Mirrors the lookup order
// used by productImageFallbackUrls in pickingApp.mjs: for "1000-1" a photo exists
// if any of 1000-1 / 1000-1.__group / 1000-1.__range / 1000 (common prefix) is
// stored, each with or without the .__priority suffix.
export const PHOTO_GROUP_SUFFIX = ".__group";
export const PHOTO_RANGE_SUFFIX = ".__range";
export const PHOTO_PRIORITY_SUFFIX = ".__priority";

export function photoStemsFromFileNames(fileNames = []) {
  const stems = new Set();
  for (const name of fileNames) {
    const value = String(name || "").trim();
    if (/\.jpg$/i.test(value)) stems.add(value.replace(/\.jpg$/i, ""));
  }
  return stems;
}

export function skuHasProductPhoto(skuCode, stems) {
  const code = String(skuCode || "").trim();
  if (!code) return false;
  const has = (stem) => stems.has(stem) || stems.has(`${stem}${PHOTO_PRIORITY_SUFFIX}`);
  const match = code.match(/^(.+)-(\d+)$/);
  if (!match) return has(code);
  return has(code) || has(`${code}${PHOTO_GROUP_SUFFIX}`) || has(`${code}${PHOTO_RANGE_SUFFIX}`) || has(match[1]);
}

function compareCodes(a, b) {
  return String(a).localeCompare(String(b), "en", { numeric: true, sensitivity: "base" });
}

// skuRows: rows from sellpia_stock_latest. Returns SKU-level and product-level lists.
export function buildMissingPhotoReport(skuRows = [], stems = new Set()) {
  const seen = new Set();
  const skus = [];
  for (const row of skuRows) {
    const skuCode = String(row?.sellpia_sku_code || "").trim();
    if (!skuCode || seen.has(skuCode)) continue;
    seen.add(skuCode);
    if (skuHasProductPhoto(skuCode, stems)) continue;
    skus.push({
      skuCode,
      productCode: String(row.sellpia_product_code || "").trim(),
      productName: String(row.sellpia_product_name || "").trim(),
      optionName: String(row.sellpia_option_name || "").trim(),
      ownSku: String(row.own_sku || "").trim(),
    });
  }
  skus.sort((a, b) => compareCodes(a.skuCode, b.skuCode));

  const byProduct = new Map();
  for (const sku of skus) {
    const key = sku.productCode || sku.skuCode;
    const entry = byProduct.get(key) || { productCode: key, productName: sku.productName, missingCount: 0 };
    entry.missingCount += 1;
    byProduct.set(key, entry);
  }
  const products = [...byProduct.values()].sort((a, b) => compareCodes(a.productCode, b.productCode));
  return { totalSkus: seen.size, skus, products };
}
