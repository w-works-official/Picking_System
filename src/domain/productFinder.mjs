// 🔎 상품찾기 (2026-11-07) — 셀피아 코드 · 자사코드 · 상품명 · 옵션명 검색 (순수 함수)
const clean = (v) => String(v ?? "").trim();
const low = (v) => clean(v).toLowerCase();

// rows = sellpia_stock_latest → [{ sku, product, name, option, own, stock }]
export function buildCatalog(rows = []) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const sku = clean(r?.sellpia_sku_code);
    if (!sku || seen.has(sku)) continue;
    seen.add(sku);
    const item = {
      sku,
      product: clean(r.sellpia_product_code) || (/^(.+)-\d+$/.exec(sku)?.[1] ?? sku),
      name: clean(r.sellpia_product_name),
      option: clean(r.sellpia_option_name),
      own: clean(r.own_sku),
      stock: Number(r.available_stock ?? r.stock ?? 0) || 0,
    };
    item.hay = low(`${item.sku} ${item.own} ${item.name} ${item.option}`);
    out.push(item);
  }
  return out;
}

// 띄어쓰기로 여러 낱말 — 모두 들어간 것만. 코드·자사코드가 딱 맞으면 맨 위
export function searchCatalog(catalog = [], query = "", limit = 30) {
  const q = low(query);
  if (!q) return [];
  const words = q.split(/\s+/).filter(Boolean);
  const hits = [];
  for (const it of catalog) {
    if (!words.every((w) => it.hay.includes(w))) continue;
    const sku = it.sku.toLowerCase(), own = it.own.toLowerCase();
    const rank = sku === q || own === q ? 0 : sku.startsWith(q) || own.startsWith(q) ? 1 : 2;
    hits.push({ it, rank });
  }
  hits.sort((a, b) => a.rank - b.rank || a.it.sku.localeCompare(b.it.sku, "en", { numeric: true }));
  return hits.slice(0, limit).map((h) => h.it);
}

// 칸 3개 상태: 저장된 보조사진 → saved, 나머지 empty
export function initialSlots(saved = [], count = 3) {
  return Array.from({ length: count }, (_, i) => {
    const s = saved.find((x) => x.slot === i + 1);
    return s ? { slot: i + 1, kind: "saved", url: s.url } : { slot: i + 1, kind: "empty" };
  });
}
