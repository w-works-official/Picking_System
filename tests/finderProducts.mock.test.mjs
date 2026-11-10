// 🔍 상품찾기 11-10 — 마스터 + 보조 사진을 상품으로 묶어 닮은 순 3/5/10
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DIM, FINDER_TOPS, bytesToB64, decodeIndex, encodeIndex, productOf, quantize, searchProducts } from "../src/domain/photoSearch.mjs";

const unit = (seed) => { let x = seed; const r = () => ((x = (x * 16807) % 2147483647) / 2147483647) - 0.5; const v = Float32Array.from({ length: DIM }, r); const n = Math.hypot(...v); return v.map((a) => a / n); };
const mix = (a, b, t) => { const v = a.map((x, i) => x * (1 - t) + b[i] * t); const n = Math.hypot(...v); return v.map((x) => x / n); };
const Q = unit(1), O = unit(2), O2 = unit(3), O3 = unit(4);
const row = (name, v) => ({ name, stamp: "", b64: bytesToB64(quantize(v)) });
// A: 마스터 + 보조 둘 다 꽤 닮음 · B: 한 장만 아주 닮음 · C: 옵션 2개 사진 · D: 안 닮음
const idx = decodeIndex(encodeIndex([
  row("100-1.jpg", mix(Q, O, 0.45)), row("100-1.__sub1.jpg", mix(Q, O2, 0.45)),
  row("200-1.jpg", mix(Q, O, 0.38)), row("200-2.jpg", O3),
  row("300-1.jpg", mix(Q, O2, 0.6)), row("300-2.__sub2.jpg", mix(Q, O3, 0.6)),
  row("400.jpg", O2),
]));
assert.equal(productOf("8601-12"), "8601");
assert.equal(productOf("8601"), "8601");
assert.deepEqual(FINDER_TOPS, [3, 5, 10]);
const r = searchProducts(idx, [Q], { limit: 10, center: false });
assert.deepEqual(r.map((p) => p.product), ["100", "200", "300", "400"], "상품 단위 · 닮은 순");
assert.equal(r[0].count, 2);
assert.deepEqual(r[0].codes, ["100-1"]);
assert.ok(r[0].best.name.startsWith("100-1"));
assert.ok(Math.abs(r[1].score - (0.8 * r[1].best.score + 0.2 * r[1].photos[1].score)) < 1e-9, "가장 닮은 80% + 두 번째 20%");
assert.deepEqual(r[2].codes.sort(), ["300-1", "300-2"], "옵션이 달라도 한 상품");
assert.equal(searchProducts(idx, [Q], { limit: 3, center: false }).length, 3, "개수 설정");
assert.equal(r[3].photos.length, 1);
// 한 장만 우연히 아주 닮은 상품 vs 여러 장이 고루 닮은 상품
const idx2 = decodeIndex(encodeIndex([
  row("10-1.jpg", mix(Q, O, 0.2)), row("10-1.__sub1.jpg", O2), row("10-1.__sub2.jpg", O3),
  row("20-1.jpg", mix(Q, O, 0.25)), row("20-1.__sub1.jpg", mix(Q, O2, 0.3)),
]));
const r2 = searchProducts(idx2, [Q], { center: false });
assert.ok(r2[0].best.score < r2[1].best.score, "20 의 최고 점수는 10 보다 낮지만");
assert.equal(r2[0].product, "20", "보조 사진까지 닮은 20 이 위로");

const panel = readFileSync(new URL("../src/app/productFinderPanel.mjs", import.meta.url), "utf8");
assert.match(panel, /searchProducts\(idx, qs, \{ limit: st\.topN \}\)/);
assert.match(panel, /data-pf-top=/);
assert.match(panel, /system_v3_finder_top/);
assert.match(readFileSync(new URL("../purchase/index.html", import.meta.url), "utf8"), /productFinderPanel\.mjs\?v=20261110-finder3/);
console.log("finderProducts.mock.test: OK");
