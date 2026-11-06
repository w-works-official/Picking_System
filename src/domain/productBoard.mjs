// 📦 상품 현황 (2026-11-06) — 셀피아 코드(옵션) 단위로 사진 · 옵션명 · 최근 재고 · 기간별 출고 수량
//  · 상품 = 셀피아 상품코드(대표코드, 예: 1000) · 옵션 = 셀피아 코드(예: 1000-1)
//  · 사진 규칙 (대표님 11-06)
//    1) 옵션 사진(1000-1.jpg · .__group · .__range · .__priority)이 있으면 1순위
//    2) 그 상품에 옵션 사진이 하나도 없으면 대표코드 사진(1000.jpg)으로 (옵션 하나짜리 상품 등)
//    3) 옵션 사진이 있는 상품인데 이 옵션만 사진이 없으면 → 빈칸(노랑)
//  · 대분류: 14K 피어싱 / 써지컬 피어싱 / 실버 피어싱 / 귀걸이 / 나머지 (상품명 글자로 — 앞에서부터 먼저 맞는 것)
export const PB_CATEGORIES = [
  { key: "surgical", label: "써지컬 피어싱" },
  { key: "k14", label: "14K 피어싱" },
  { key: "silver", label: "실버 피어싱" },
  { key: "earring", label: "귀걸이" },
  { key: "etc", label: "나머지" },
];

const PHOTO_SUFFIXES = [".__priority", ".__group", ".__range"];

export function categoryOf(productName = "") {
  const n = String(productName || "").replace(/\s+/g, "").toLowerCase();
  if (/14k|14케이|14金|585/.test(n)) return "k14";
  if (/써지컬|서지컬|surgical/.test(n)) return "surgical";
  if (/(실버|silver|925)/.test(n) && !/귀걸이|이어링/.test(n)) return "silver";
  if (/귀걸이|이어링|earring/.test(n)) return "earring";
  return "etc";
}

// 사진 파일 이름들 → 찾기 표 (확장자 .jpg 만)
export function photoIndex(fileNames = []) {
  const byStem = new Map();          // 코드(접미사 뺀 것) → 실제 파일 이름 (우선 표시 .__priority 먼저)
  const optionProducts = new Set();  // 옵션 사진이 하나라도 있는 상품코드
  for (const raw of fileNames) {
    const name = String(raw || "").trim();
    if (!/\.jpg$/i.test(name)) continue;
    let stem = name.replace(/\.jpg$/i, "");
    let rank = 2;
    for (const suf of PHOTO_SUFFIXES) {
      if (stem.endsWith(suf)) { stem = stem.slice(0, -suf.length); rank = suf === ".__priority" ? 0 : 1; break; }
    }
    const prev = byStem.get(stem);
    if (!prev || rank < prev.rank) byStem.set(stem, { file: name, rank });
    const m = /^(.+)-\d+$/.exec(stem);
    if (m) optionProducts.add(m[1]);
  }
  return { byStem, optionProducts };
}

// 옵션 하나의 사진: { file, kind } — kind = "option" | "product" | "missing"(노랑 빈칸) | "none"(사진 없음)
export function photoFor(skuCode, productCode, index) {
  const sku = String(skuCode || "").trim();
  const prod = String(productCode || "").trim() || (/^(.+)-\d+$/.exec(sku)?.[1] ?? sku);
  const own = index.byStem.get(sku);
  if (own) return { file: own.file, kind: sku === prod ? "product" : "option" };
  if (index.optionProducts.has(prod)) return { file: "", kind: "missing" };
  const rep = index.byStem.get(prod);
  if (rep) return { file: rep.file, kind: "product" };
  return { file: "", kind: "none" };
}

const num = (v) => { const n = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) ? n : 0; };

// 피킹 주문 데이터 → 셀피아 코드별 날짜별 수량 { code: { "2026-11-05": 3, ... } } · 날짜 범위
export function buildSales(orders = [], items = []) {
  const dateOf = new Map();
  for (const o of orders) {
    const d = String(o.receipt_date || "").slice(0, 10);
    if (o.ord_no && /^\d{4}-\d{2}-\d{2}$/.test(d)) dateOf.set(String(o.ord_no), d);
  }
  const byCode = new Map();
  let first = "", last = "";
  for (const it of items) {
    const d = dateOf.get(String(it.ord_no || ""));
    const code = String(it.p_code || "").trim();
    if (!d || !code) continue;
    if (!byCode.has(code)) byCode.set(code, new Map());
    const m = byCode.get(code);
    m.set(d, (m.get(d) || 0) + (num(it.qty) || 1));
    if (!first || d < first) first = d;
    if (!last || d > last) last = d;
  }
  return { byCode, first, last };
}

// 기간 합계: days = 7 · 30 · 90 · 0(전체) — today 기준 (오늘 포함 days 일)
export function salesSum(sales, code, days, today) {
  const m = sales?.byCode?.get(String(code));
  if (!m) return 0;
  if (!days) { let s = 0; for (const v of m.values()) s += v; return s; }
  const end = new Date(`${today}T00:00:00Z`);
  const from = new Date(end.getTime() - (days - 1) * 86400000).toISOString().slice(0, 10);
  let s = 0;
  for (const [d, v] of m) if (d >= from && d <= today) s += v;
  return s;
}

// 셀피아 재고 줄들 → 상품 목록 (상품코드 순, 옵션은 옵션 번호 순)
export function buildProducts(skuRows = [], index = photoIndex([])) {
  const products = new Map();
  for (const r of skuRows) {
    const sku = String(r.sellpia_sku_code || "").trim();
    if (!sku) continue;
    const code = String(r.sellpia_product_code || "").trim() || (/^(.+)-\d+$/.exec(sku)?.[1] ?? sku);
    if (!products.has(code)) {
      const name = String(r.sellpia_product_name || "").trim();
      products.set(code, { code, name, category: categoryOf(name), options: [] });
    }
    products.get(code).options.push({
      sku, option: String(r.sellpia_option_name || "").trim(), ownSku: String(r.own_sku || "").trim(),
      stock: num(r.stock), available: num(r.available_stock), photo: photoFor(sku, code, index),
    });
  }
  const cmp = (a, b) => String(a).localeCompare(String(b), "en", { numeric: true });
  const list = [...products.values()].sort((a, b) => cmp(a.code, b.code));
  for (const p of list) {
    p.options.sort((a, b) => cmp(a.sku, b.sku));
    p.stock = p.options.reduce((s, o) => s + o.stock, 0);
  }
  return list;
}

// 검색: 띄어쓰기로 나눈 낱말이 모두 (코드 · 상품명 · 옵션명 · 자사코드) 어딘가에 들어 있으면
export function matchProduct(p, query = "") {
  const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [p.code, p.name, ...p.options.flatMap((o) => [o.sku, o.option, o.ownSku])].join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function categoryCounts(products = []) {
  const out = Object.fromEntries(PB_CATEGORIES.map((c) => [c.key, 0]));
  for (const p of products) out[p.category] = (out[p.category] || 0) + 1;
  return out;
}
