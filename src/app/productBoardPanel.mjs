// 📦 상품 현황 (2026-11-06) — 상품 관리 사이드 메뉴. 셀피아 코드(옵션) 단위로 사진 · 옵션명 · 최근 재고 · 기간별 출고 수량
//  · 재고·사진 = 운영 허브 DB(sellpia_stock_latest · Storage product-images/sellpia) — 로그인 없이 읽기만
//  · 출고 수량 = 피킹 주문 데이터(orders.receipt_date × order_items.qty) — 이 탭에 피킹 로그인이 있을 때만
//  · 읽기 전용: 어디에도 쓰지 않음
import { PB_CATEGORIES, buildProducts, buildSales, categoryCounts, matchProduct, photoIndex, salesSum } from "../domain/productBoard.mjs?v=20261106-board1";

const HUB_URL = "https://bpgvqmtsjgegnrdzmpep.supabase.co";
const HUB_KEY = "sb_publishable__NVp6Ra227_e1TQqQE40oA_O2PVwv5C";
const PICK_URL = "https://vgxocngpykhlkosiaeew.supabase.co";
const PICK_KEY = "sb_publishable_XVnKGJo66GZiYTq5Ivu8dA_SjBVvX0g";
const PICK_SESSION_KEY = "system-v3-picking-session-v1";
const BUCKET = "product-images";
const FOLDER = "sellpia";
const PAGE = 1000;
const SHOW_STEP = 40;          // 한 번에 보여 줄 상품 수 (더 보기)
const PERIODS = [{ days: 7, label: "7일" }, { days: 30, label: "30일" }, { days: 90, label: "90일" }, { days: 0, label: "전체" }];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => Number(n || 0).toLocaleString("ko-KR");
export const photoUrl = (file) => `${HUB_URL}/storage/v1/object/public/${BUCKET}/${FOLDER}/${encodeURIComponent(file)}`;

async function pagedRest(fetchImpl, base, path, headers, onPage) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetchImpl(`${base}/rest/v1/${path}`, { headers: { ...headers, "Range-Unit": "items", Range: `${from}-${from + PAGE - 1}` }, cache: "no-store" });
    if (res.status === 401 || res.status === 403) { const e = new Error("로그인 필요"); e.auth = true; throw e; }
    if (!res.ok && res.status !== 206) throw new Error(`읽기 실패 (${res.status})`);
    const page = await res.json();
    rows.push(...page);
    onPage?.(rows.length);
    if (page.length < PAGE) break;
  }
  return rows;
}

async function listPhotos(fetchImpl, onPage) {
  const names = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await fetchImpl(`${HUB_URL}/storage/v1/object/list/${BUCKET}`, {
      method: "POST",
      headers: { apikey: HUB_KEY, Authorization: `Bearer ${HUB_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: FOLDER, limit: PAGE, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!res.ok) throw new Error(`사진 목록 읽기 실패 (${res.status})`);
    const page = await res.json();
    names.push(...page.map((f) => f?.name).filter(Boolean));
    onPage?.(names.length);
    if (page.length < PAGE) break;
  }
  return names;
}

export function mountProductBoard({ document, window, storages = [], fetchImpl = (...a) => window.fetch(...a), today = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10) } = {}) {
  const root = document.querySelector("[data-product-board]");
  if (!root) return null;
  const st = { products: [], sales: null, salesNote: "", snapshotAt: "", photos: 0, cat: "all", q: "", days: 30, sort: "code", inStock: false, show: SHOW_STEP, loading: false, loaded: false };
  root.innerHTML = `
    <div class="pb-bar">
      <div class="pb-cats" data-pb-cats></div>
      <div class="pb-tools">
        <input type="search" class="pb-search" data-pb-search placeholder="검색 — 셀피아 코드 · 상품명 · 옵션명 · 자사코드 (띄어쓰기로 여러 낱말)" aria-label="상품 검색">
        <label>출고 <select data-pb-days>${PERIODS.map((p) => `<option value="${p.days}"${p.days === 30 ? " selected" : ""}>${p.label}</option>`).join("")}</select></label>
        <label>정렬 <select data-pb-sort><option value="code">코드 순</option><option value="sales">출고 많은 순</option><option value="stockLow">재고 적은 순</option><option value="stockHigh">재고 많은 순</option></select></label>
        <label class="pb-check"><input type="checkbox" data-pb-instock> 재고 있는 옵션만</label>
        <button type="button" class="pb-btn" data-pb-reload>⟳ 새로고침</button>
      </div>
      <p class="pb-status" data-pb-status>불러오는 중…</p>
    </div>
    <div class="pb-list" data-pb-list></div>
    <div class="pb-more-wrap"><button type="button" class="pb-btn pb-more" data-pb-more hidden>더 보기</button></div>`;
  const $ = (s) => root.querySelector(s);

  function filtered() {
    let list = st.products.filter((p) => (st.cat === "all" || p.category === st.cat) && matchProduct(p, st.q));
    const t = today();
    const sale = (o) => (st.sales ? salesSum(st.sales, o.sku, st.days, t) : 0);
    list = list.map((p) => {
      const options = st.inStock ? p.options.filter((o) => o.stock > 0) : p.options;
      return { ...p, options, sales: options.reduce((s, o) => s + sale(o), 0), shownStock: options.reduce((s, o) => s + o.stock, 0) };
    }).filter((p) => p.options.length);
    if (st.sort === "sales") list.sort((a, b) => b.sales - a.sales);
    else if (st.sort === "stockLow") list.sort((a, b) => a.shownStock - b.shownStock);
    else if (st.sort === "stockHigh") list.sort((a, b) => b.shownStock - a.shownStock);
    return { list, sale };
  }

  function photoCell(o) {
    const k = o.photo.kind;
    if (k === "option" || k === "product") {
      const url = photoUrl(o.photo.file);
      return `<a class="pb-photo${k === "product" ? " is-rep" : ""}" href="${esc(url)}" target="_blank" rel="noopener" title="${k === "product" ? "대표코드 사진" : "옵션 사진"} — 눌러서 크게"><img src="${esc(url)}" alt="${esc(o.sku)}" loading="lazy">${k === "product" ? "<span>대표</span>" : ""}</a>`;
    }
    return k === "missing" ? `<span class="pb-photo is-missing" title="이 상품은 옵션 사진이 있는데 이 옵션만 사진이 없습니다">옵션 사진<br>없음</span>` : `<span class="pb-photo is-none">사진 없음</span>`;
  }

  function render() {
    const counts = categoryCounts(st.products);
    $("[data-pb-cats]").innerHTML = [{ key: "all", label: "전체" }, ...PB_CATEGORIES].map((c) => `<button type="button" class="pb-cat${st.cat === c.key ? " is-on" : ""}" data-pb-cat="${c.key}">${c.label} <small>${fmt(c.key === "all" ? st.products.length : counts[c.key])}</small></button>`).join("");
    if (!st.loaded) return;
    const { list, sale } = filtered();
    const periodLabel = PERIODS.find((p) => p.days === st.days)?.label || "";
    $("[data-pb-list]").innerHTML = list.length ? list.slice(0, st.show).map((p) => `
      <article class="pb-product" data-pb-product="${esc(p.code)}">
        <header><b class="pb-code">${esc(p.code)}</b><span class="pb-name">${esc(p.name)}</span><span class="pb-tag pb-tag-${p.category}">${esc(PB_CATEGORIES.find((c) => c.key === p.category)?.label || "")}</span><span class="pb-sum">재고 <b>${fmt(p.shownStock)}</b>${st.sales ? ` · 출고(${periodLabel}) <b>${fmt(p.sales)}</b>` : ""}</span></header>
        <div class="pb-options">${p.options.map((o) => `
          <div class="pb-opt${o.stock <= 0 ? " is-zero" : ""}" data-pb-sku="${esc(o.sku)}">
            ${photoCell(o)}
            <div class="pb-opt-text"><b>${esc(o.option || "(옵션 없음)")}</b><small>${esc(o.sku)}${o.ownSku ? ` · ${esc(o.ownSku)}` : ""}</small></div>
            <div class="pb-num"><small>재고</small><b>${fmt(o.stock)}</b>${o.available !== o.stock ? `<small>가용 ${fmt(o.available)}</small>` : ""}</div>
            <div class="pb-num pb-sales"><small>출고 ${esc(periodLabel)}</small><b>${st.sales ? fmt(sale(o)) : "—"}</b></div>
          </div>`).join("")}
        </div>
      </article>`).join("") : `<p class="pb-empty">맞는 상품이 없습니다.</p>`;
    const more = $("[data-pb-more]");
    more.hidden = list.length <= st.show;
    more.textContent = `더 보기 (${fmt(Math.min(st.show, list.length))} / ${fmt(list.length)}개 상품)`;
    status(`${st.snapshotAt ? `셀피아 재고 ${st.snapshotAt} 기준` : "셀피아 재고"} · 상품 ${fmt(list.length)}개 / 전체 ${fmt(st.products.length)} · 사진 ${fmt(st.photos)}장 · 출고: ${st.salesNote}`);
  }

  const status = (t, tone = "") => { const el = $("[data-pb-status]"); el.textContent = t; el.className = `pb-status ${tone}`; };

  async function loadSales() {
    // 피킹 로그인은 탭마다(sessionStorage) — 피킹시스템에서 로그인한 그 탭에서 [상품 관리]로 넘어오면 출고가 보임
    let session = null;
    for (const s of storages) {
      try { const v = JSON.parse(s?.getItem(PICK_SESSION_KEY) || "null"); if (v?.token && !(Date.parse(v.expiresAt) <= Date.now())) { session = v; break; } } catch { /* 다음 */ }
    }
    if (!session?.token) { st.sales = null; st.salesNote = "피킹 로그인 필요 — 피킹시스템에서 로그인한 탭에서 [상품 관리]로 오면 보입니다"; return; }
    const headers = { apikey: PICK_KEY, Authorization: `Bearer ${PICK_KEY}`, "x-picking-session": session.token };
    try {
      const orders = await pagedRest(fetchImpl, PICK_URL, "orders?select=ord_no,receipt_date&order=ord_no.asc", headers);
      const items = await pagedRest(fetchImpl, PICK_URL, "order_items?select=ord_no,p_code,qty&order=ord_no.asc", headers, (n) => status(`출고 수량 계산 중… 주문 상품 ${fmt(n)}줄`));
      st.sales = buildSales(orders, items);
      st.salesNote = st.sales.first ? `피킹 주문 ${st.sales.first} ~ ${st.sales.last} (접수일 기준)` : "피킹 주문 데이터 없음";
    } catch (error) {
      st.sales = null;
      st.salesNote = error.auth ? "피킹 로그인이 만료됐습니다 — 피킹시스템에서 다시 로그인" : `출고 수량을 못 읽음 (${error.message})`;
    }
  }

  async function load() {
    if (st.loading) return;
    st.loading = true;
    $("[data-pb-reload]").disabled = true;
    try {
      const hub = { apikey: HUB_KEY, Authorization: `Bearer ${HUB_KEY}` };
      status("셀피아 재고 불러오는 중…");
      const [rows, names] = await Promise.all([
        pagedRest(fetchImpl, HUB_URL, "sellpia_stock_latest?select=sellpia_sku_code,sellpia_product_code,sellpia_product_name,sellpia_option_name,own_sku,stock,available_stock,snapshot_created_at&order=sellpia_sku_code.asc", hub, (n) => status(`셀피아 재고 불러오는 중… ${fmt(n)}줄`)),
        listPhotos(fetchImpl),
      ]);
      const at = rows.find((r) => r.snapshot_created_at)?.snapshot_created_at;
      st.snapshotAt = at ? new Date(new Date(at).getTime() + 9 * 3600000).toISOString().slice(0, 16).replace("T", " ") : "";
      st.photos = names.length;
      st.products = buildProducts(rows, photoIndex(names));
      st.loaded = true;
      render();
      await loadSales();
      render();
    } catch (error) {
      status(`불러오지 못했습니다: ${error.message} — [⟳ 새로고침]`, "is-bad");
    } finally {
      st.loading = false;
      $("[data-pb-reload]").disabled = false;
    }
  }

  let timer = 0;
  root.addEventListener("input", (e) => {
    if (e.target.matches("[data-pb-search]")) { window.clearTimeout(timer); timer = window.setTimeout(() => { st.q = e.target.value; st.show = SHOW_STEP; render(); }, 250); }
  });
  root.addEventListener("change", (e) => {
    if (e.target.matches("[data-pb-days]")) { st.days = Number(e.target.value) || 0; render(); }
    else if (e.target.matches("[data-pb-sort]")) { st.sort = e.target.value; st.show = SHOW_STEP; render(); }
    else if (e.target.matches("[data-pb-instock]")) { st.inStock = e.target.checked; st.show = SHOW_STEP; render(); }
  });
  root.addEventListener("click", (e) => {
    const c = e.target.closest("[data-pb-cat]");
    if (c) { st.cat = c.dataset.pbCat; st.show = SHOW_STEP; render(); return; }
    if (e.target.closest("[data-pb-more]")) { st.show += SHOW_STEP; render(); return; }
    if (e.target.closest("[data-pb-reload]")) load();
  });
  render();
  // 상품 현황 탭을 처음 열 때 불러옴 (다른 탭만 쓰면 안 읽음)
  const panel = root.closest("[data-purchase-panel]");
  const maybeLoad = () => { if (!st.loaded && !st.loading && panel && !panel.hidden) load(); };
  maybeLoad();
  if (panel && window.MutationObserver) new window.MutationObserver(maybeLoad).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  return { state: st, load, render };
}

if (typeof document !== "undefined" && document.querySelector("[data-product-board]")) {
  const safe = (k) => { try { return window[k]; } catch { return null; } };
  mountProductBoard({ document, window, storages: [safe("sessionStorage"), safe("localStorage")] });
}
