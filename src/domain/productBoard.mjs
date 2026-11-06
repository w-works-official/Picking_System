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
  { key: "disc", label: "단종" },       // 11-06: 옵션이 모두 단종된 상품 (일반 검색에서 빠짐)
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
      buy: num(r.buy ?? r.raw_payload?.purchase_price), sell: num(r.sell ?? r.raw_payload?.sell_price),   // 11-06: 매입가 · 출고가(판매가)
      s7: 0, s30: 0, s90: 0, sAll: 0,
    });
  }
  const cmp = (a, b) => String(a).localeCompare(String(b), "en", { numeric: true });
  const list = [...products.values()].sort((a, b) => cmp(a.code, b.code));
  for (const p of list) {
    p.options.sort((a, b) => cmp(a.sku, b.sku));
    p.stock = p.options.reduce((s, o) => s + o.stock, 0);
    // 대표 사진 (상품 단위로 볼 때 한 장): 대표코드 사진 → 없으면 첫 옵션 사진
    p.rep = index.byStem.get(code_(p.code))?.file || p.options.find((o) => o.photo.file)?.photo.file || "";
  }
  return list;
}
const code_ = (c) => String(c || "");

// ---------- 11-06 상품 현황 2: 기간별 출고 · 검색 기준 · 상품/옵션 단위 · 선택 ----------
export const SALES_PERIODS = [7, 30, 90];
export const salesKey = (days) => (days === 7 ? "s7" : days === 30 ? "s30" : days === 90 ? "s90" : "sAll");

// 출고 수량을 옵션마다 미리 계산 (7 · 30 · 90 · 전체)
export function attachSales(products = [], sales = null, today = "") {
  for (const p of products) for (const o of p.options) {
    o.s7 = sales ? salesSum(sales, o.sku, 7, today) : 0;
    o.s30 = sales ? salesSum(sales, o.sku, 30, today) : 0;
    o.s90 = sales ? salesSum(sales, o.sku, 90, today) : 0;
    o.sAll = sales ? salesSum(sales, o.sku, 0, today) : 0;
  }
  return products;
}

const hasPhoto = (o) => o.photo.kind === "option" || o.photo.kind === "product";
const inRange = (v, min, max) => (min === "" || min == null || v >= Number(min)) && (max === "" || max == null || v <= Number(max));

// 옵션들 합계·범위
export function optionStats(options = []) {
  const st = { stock: 0, available: 0, s7: 0, s30: 0, s90: 0, sAll: 0, buyMin: 0, buyMax: 0, sellMin: 0, sellMax: 0 };
  let first = true;
  for (const o of options) {
    st.stock += o.stock; st.available += o.available;
    st.s7 += o.s7; st.s30 += o.s30; st.s90 += o.s90; st.sAll += o.sAll;
    if (first) { st.buyMin = st.buyMax = o.buy; st.sellMin = st.sellMax = o.sell; first = false; }
    else { st.buyMin = Math.min(st.buyMin, o.buy); st.buyMax = Math.max(st.buyMax, o.buy); st.sellMin = Math.min(st.sellMin, o.sell); st.sellMax = Math.max(st.sellMax, o.sell); }
  }
  return st;
}

// 검색: f = { cat, q, stockMin, stockMax, photo: all|none|has, days, salesMin, salesMax, unit: option|product, only: Set(sku)|null, disc: exclude|include }
//  · 재고·사진·출고(옵션 단위) = 옵션마다 거름 / 출고(상품 단위) = 남은 옵션 합계로 거름
//  · only(선택 모아보기) = 선택한 옵션만 (다른 조건은 무시)
export function boardView(products = [], f = {}) {
  const key = salesKey(Number(f.days) || 0);
  const out = [];
  for (const p of products) {
    let options;
    if (f.only) {
      options = p.options.filter((o) => f.only.has(o.sku));
    } else {
      // 단종 상품: [단종] 카테고리에서만, 또는 '단종 포함'일 때 (기본 = 미포함)
      if (f.cat === "disc") { if (!p.disc) continue; }
      else if (p.disc && f.disc !== "include") continue;
      if (f.cat && f.cat !== "all" && f.cat !== "disc" && p.category !== f.cat) continue;
      if (!matchProduct(p, f.q)) continue;
      options = p.options.filter((o) => inRange(o.stock, f.stockMin, f.stockMax)
        && (f.photo === "none" ? !hasPhoto(o) : f.photo === "has" ? hasPhoto(o) : true)
        && (f.unit === "product" || inRange(o[key], f.salesMin, f.salesMax)));
    }
    if (!options.length) continue;
    const stats = optionStats(options);
    if (!f.only && f.unit === "product" && !inRange(stats[key], f.salesMin, f.salesMax)) continue;
    out.push({ p, options, stats });
  }
  return out;
}

export function sortView(view = [], sort = "code", days = 30) {
  const key = salesKey(Number(days) || 0);
  const by = {
    sales: (a, b) => b.stats[key] - a.stats[key],
    salesLow: (a, b) => a.stats[key] - b.stats[key],
    stockLow: (a, b) => a.stats.stock - b.stats.stock,
    stockHigh: (a, b) => b.stats.stock - a.stats.stock,
  }[sort];
  return by ? [...view].sort(by) : view;
}

// 한 쪽(페이지) — 상품 단위로 size 개씩
export function pageOf(view = [], page = 1, size = 100) {
  const pages = Math.max(1, Math.ceil(view.length / size));
  const at = Math.min(Math.max(1, page), pages);
  return { items: view.slice((at - 1) * size, at * size), page: at, pages, total: view.length };
}

// 선택 상태: 상품(보이는 옵션) 전체 · 일부 · 없음
export function pickState(options = [], picked = new Set()) {
  const n = options.filter((o) => picked.has(o.sku)).length;
  return n === 0 ? "none" : n === options.length ? "all" : "some";
}

// 선택한 옵션 → 엑셀 줄 (상품코드 순)
export const PB_EXCEL_COLUMNS = [
  { title: "사진", width: 12 }, { title: "셀피아코드", width: 12 }, { title: "상품명", width: 40 }, { title: "옵션명", width: 24 },
  { title: "자사코드", width: 16 }, { title: "대분류", width: 12 }, { title: "재고", width: 8 }, { title: "가용재고", width: 9 },
  { title: "매입가", width: 9 }, { title: "출고가", width: 9 }, { title: "출고 7일", width: 9 }, { title: "출고 30일", width: 9 }, { title: "출고 90일", width: 9 },
];
export function excelRows(products = [], picked = new Set()) {
  const label = Object.fromEntries(PB_CATEGORIES.map((c) => [c.key, c.label]));
  const rows = [];
  for (const p of products) for (const o of p.options) {
    if (!picked.has(o.sku)) continue;
    rows.push({ photo: o.photo.file || p.rep || "", cells: ["", o.sku, p.name, o.option + (o.disc ? " (단종)" : ""), o.ownSku, label[p.category] || "", o.stock, o.available, o.buy, o.sell, o.s7, o.s30, o.s90] });
  }
  return rows;
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
  for (const p of products) { const k = p.disc ? "disc" : p.category; out[k] = (out[k] || 0) + 1; }
  return out;
}

// 11-06 단종: 옵션 단종 = 단종 목록에 있는 셀피아 코드 · 상품 단종 = 옵션이 모두 단종 → 단종 카테고리로
export function applyDisc(products = [], disc = new Set()) {
  for (const p of products) {
    for (const o of p.options) o.disc = disc.has(o.sku);
    p.disc = p.options.length > 0 && p.options.every((o) => o.disc);
  }
  return products;
}
