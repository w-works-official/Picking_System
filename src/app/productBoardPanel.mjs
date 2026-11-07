// 📦 상품 현황 (2026-11-06 · 2차) — 상품 관리 사이드 메뉴. 셀피아 코드(옵션) 단위로 사진 · 옵션명 · 최근 재고 · 매입가 · 출고가 · 7/30/90일 출고
//  · 재고·사진·가격 = 운영 허브 DB(sellpia_stock_latest · Storage product-images/sellpia) — 로그인 없이 읽기만
//  · 출고 수량 = 피킹 주문 데이터(orders.receipt_date × order_items.qty) — 이 탭에 피킹 로그인이 있을 때만
//  · 1열 · 한 쪽에 상품 100개 · 검색 기준(재고 · 사진 · 출고 기간 × 수량) · 옵션 단위 / 상품 단위 · 선택 · 선택 모아보기 · 사진 포함 엑셀
//  · 읽기 전용: 어디에도 쓰지 않음
import { CS_BOARD_ENDPOINT, CS_BOARD_STORAGE_KEY, isCsBoardTokenValid } from "../domain/csBoard.mjs?v=20261106-remote1";
import { PB_CATEGORIES, PB_EXCEL_COLUMNS, applyDisc, attachSales, boardView, buildProducts, buildSales, categoryCounts, excelRows, pageOf, photoIndex, pickState, salesKey, sortView } from "../domain/productBoard.mjs?v=20261107-finder1";
import { buildXlsx } from "../domain/xlsxWriter.mjs?v=20261106-board2";

const HUB_URL = "https://bpgvqmtsjgegnrdzmpep.supabase.co";
const HUB_KEY = "sb_publishable__NVp6Ra227_e1TQqQE40oA_O2PVwv5C";
const PICK_URL = "https://vgxocngpykhlkosiaeew.supabase.co";
const PICK_KEY = "sb_publishable_XVnKGJo66GZiYTq5Ivu8dA_SjBVvX0g";
const PICK_SESSION_KEY = "system-v3-picking-session-v1";
const BUCKET = "product-images";
const FOLDER = "sellpia";
const PAGE = 1000;
const PAGE_SIZE = 100;          // 한 쪽에 상품 100개 (옵션 수 아님)
const PERIODS = [{ days: 7, label: "7일" }, { days: 30, label: "30일" }, { days: 90, label: "90일" }, { days: 0, label: "전체" }];
const THUMB = 80;               // 엑셀 사진 크기(px)

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => Number(n || 0).toLocaleString("ko-KR");
const range = (a, b) => (a === b ? fmt(a) : `${fmt(a)}~${fmt(b)}`);
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
  const st = {
    products: [], sales: null, salesNote: "", snapshotAt: "", photos: 0, loading: false, loaded: false,
    cat: "all", q: "", days: 30, sort: "code", unit: "option", stockMin: "", stockMax: "", photo: "all", salesMin: "", salesMax: "",
    page: 1, picked: new Set(), collect: false, open: new Set(), allOpen: false, busy: false,
    discMode: "exclude", disc: new Set(), discNote: "",   // 11-06 단종 (CS 시트 '단종' 탭)
  };
  root.innerHTML = `
    <div class="pb-bar">
      <div class="pb-cats" data-pb-cats></div>
      <div class="pb-tools">
        <input type="search" class="pb-search" data-pb-search placeholder="검색 — 셀피아 코드 · 상품명 · 옵션명 · 자사코드 (띄어쓰기로 여러 낱말)" aria-label="상품 검색">
        <span class="pb-seg" role="group" aria-label="표시 방법"><button type="button" data-pb-unit="option" class="is-on">옵션 단위</button><button type="button" data-pb-unit="product">상품 단위</button></span>
        <label>정렬 <select data-pb-sort><option value="code">코드 순</option><option value="sales">출고 많은 순</option><option value="salesLow">출고 적은 순</option><option value="stockLow">재고 적은 순</option><option value="stockHigh">재고 많은 순</option></select></label>
        <button type="button" class="pb-btn" data-pb-reload>⟳ 새로고침</button>
      </div>
      <div class="pb-filters">
        <label>재고 <input type="number" inputmode="numeric" data-pb-f="stockMin" placeholder="최소"> ~ <input type="number" inputmode="numeric" data-pb-f="stockMax" placeholder="최대"></label>
        <label>사진 <select data-pb-f="photo"><option value="all">전체</option><option value="none">사진 없는 것</option><option value="has">사진 있는 것</option></select></label>
        <label>출고 기간 <select data-pb-days>${PERIODS.map((p) => `<option value="${p.days}"${p.days === 30 ? " selected" : ""}>${p.label}</option>`).join("")}</select></label>
        <label>출고 수량 <input type="number" inputmode="numeric" data-pb-f="salesMin" placeholder="최소"> ~ <input type="number" inputmode="numeric" data-pb-f="salesMax" placeholder="최대"></label>
        <label>단종 <select data-pb-disc><option value="exclude">미포함</option><option value="include">포함</option><option value="only">단종만</option></select></label>
        <button type="button" class="pb-btn pb-btn-mini" data-pb-clear>조건 지우기</button>
      </div>
      <div class="pb-pickbar">
        <label class="pb-check"><input type="checkbox" data-pb-pick-all> <span data-pb-all-label>검색 결과 전체 선택</span></label>
        <span class="pb-picked" data-pb-picked>선택 0</span>
        <button type="button" class="pb-btn" data-pb-collect>👁 선택 모아보기</button>
        <button type="button" class="pb-btn pb-btn-green" data-pb-excel>⬇ 선택 엑셀 (사진 포함)</button>
        <button type="button" class="pb-btn pb-btn-mini" data-pb-unpick>선택 비우기</button>
        <button type="button" class="pb-btn pb-btn-disc" data-pb-disc-act="on" title="고른 옵션을 단종 처리 — 상품의 옵션이 모두 단종이면 상품이 [단종] 카테고리로">⛔ 단종 처리</button>
        <button type="button" class="pb-btn pb-btn-mini" data-pb-disc-act="off" title="고른 옵션의 단종 표시를 풂">↩ 단종 해제</button>
        <span class="cs-flex"></span>
        <button type="button" class="pb-btn pb-btn-mini" data-pb-openall hidden>옵션 모두 펼치기</button>
      </div>
      <p class="pb-status" data-pb-status>불러오는 중…</p>
    </div>
    <div class="pb-pager" data-pb-pager="top"></div>
    <div class="pb-head" data-pb-head></div>
    <div class="pb-list" data-pb-list></div>
    <div class="pb-pager" data-pb-pager="bottom"></div>`;
  const $ = (s) => root.querySelector(s);
  const status = (t, tone = "") => { const el = $("[data-pb-status]"); el.textContent = t; el.className = `pb-status ${tone}`; };
  const filter = () => ({ cat: st.cat, q: st.q, stockMin: st.stockMin, stockMax: st.stockMax, photo: st.photo, days: st.days, salesMin: st.salesMin, salesMax: st.salesMax, unit: st.unit, only: st.collect ? st.picked : null, disc: st.discMode });
  const view = () => sortView(boardView(st.products, filter()), st.sort, st.days);
  const key = () => salesKey(st.days);
  const sales = (n) => (st.sales ? fmt(n) : "—");
  const periodCls = (d) => (st.days === d ? " is-period" : "");

  function photoCell(file, kind = "option") {
    if (file) {
      const url = photoUrl(file);
      return `<a class="pb-photo${kind === "product" ? " is-rep" : ""}" href="${esc(url)}" target="_blank" rel="noopener" title="눌러서 크게"><img src="${esc(url)}" alt="" loading="lazy">${kind === "product" ? "<span>대표</span>" : ""}</a>`;
    }
    return kind === "missing" ? `<span class="pb-photo is-missing" title="이 상품은 옵션 사진이 있는데 이 옵션만 사진이 없습니다">옵션 사진<br>없음</span>` : `<span class="pb-photo is-none">사진 없음</span>`;
  }
  const nums = (x) => `
    <span class="pb-n">${fmt(x.stock)}${x.available !== x.stock ? `<small>가용 ${fmt(x.available)}</small>` : ""}</span>
    <span class="pb-n pb-price">${x.buyMin === undefined ? fmt(x.buy) : range(x.buyMin, x.buyMax)}</span>
    <span class="pb-n pb-price">${x.sellMin === undefined ? fmt(x.sell) : range(x.sellMin, x.sellMax)}</span>
    <span class="pb-n pb-s${periodCls(7)}">${sales(x.s7)}</span>
    <span class="pb-n pb-s${periodCls(30)}">${sales(x.s30)}</span>
    <span class="pb-n pb-s${periodCls(90)}">${sales(x.s90)}</span>`;
  const optRow = (p, o, withPhoto) => `
    <div class="pb-row pb-opt${o.stock <= 0 ? " is-zero" : ""}${o.disc ? " is-disc" : ""}${st.picked.has(o.sku) ? " is-picked" : ""}${withPhoto ? "" : " no-photo"}" data-pb-sku="${esc(o.sku)}">
      <input type="checkbox" data-pb-pick-sku="${esc(o.sku)}"${st.picked.has(o.sku) ? " checked" : ""} aria-label="${esc(o.sku)} 선택">
      ${withPhoto ? photoCell(o.photo.file, o.photo.kind) : "<span></span>"}
      <span class="pb-txt"><b>${o.disc ? '<em class="pb-disc-tag">단종</em> ' : ""}${esc(o.option || "(옵션 없음)")}</b><small>${esc(o.sku)}${o.ownSku ? ` · ${esc(o.ownSku)}` : ""}</small></span>
      ${nums(o)}
    </div>`;

  function renderHead() {
    $("[data-pb-head]").innerHTML = `<div class="pb-row pb-headrow"><span></span><span>사진</span><span>${st.unit === "product" ? "상품" : "옵션"}</span><span class="pb-n">재고</span><span class="pb-n">매입가</span><span class="pb-n">출고가</span><span class="pb-n${periodCls(7)}">7일</span><span class="pb-n${periodCls(30)}">30일</span><span class="pb-n${periodCls(90)}">90일</span></div>`;
  }

  function renderPager(pg) {
    const btn = (n, label = n, on = false) => `<button type="button" data-pb-page="${n}"${on ? ' class="is-on" aria-current="page"' : ""}>${label}</button>`;
    let html = "";
    if (pg.pages > 1) {
      const from = Math.max(1, pg.page - 4), to = Math.min(pg.pages, from + 8);
      html = `${pg.page > 1 ? btn(pg.page - 1, "◀") : ""}${from > 1 ? `${btn(1)}<span>…</span>` : ""}${Array.from({ length: to - from + 1 }, (_, i) => btn(from + i, from + i, from + i === pg.page)).join("")}${to < pg.pages ? `<span>…</span>${btn(pg.pages)}` : ""}${pg.page < pg.pages ? btn(pg.page + 1, "▶") : ""}`;
    }
    root.querySelectorAll("[data-pb-pager]").forEach((el) => { el.innerHTML = html; });
  }

  function render() {
    const counts = categoryCounts(st.products);
    $("[data-pb-cats]").innerHTML = [{ key: "all", label: "전체" }, ...PB_CATEGORIES].map((c) => `<button type="button" class="pb-cat${st.cat === c.key && !st.collect ? " is-on" : ""}" data-pb-cat="${c.key}">${c.label} <small>${fmt(c.key === "all" ? st.products.length - (st.discMode === "include" ? 0 : counts.disc || 0) : counts[c.key])}</small></button>`).join("");
    root.querySelectorAll("[data-pb-unit]").forEach((b) => b.classList.toggle("is-on", b.dataset.pbUnit === st.unit));
    $("[data-pb-openall]").hidden = st.unit !== "product";
    $("[data-pb-openall]").textContent = st.allOpen ? "옵션 모두 접기" : "옵션 모두 펼치기";
    $("[data-pb-collect]").classList.toggle("is-on", st.collect);
    $("[data-pb-collect]").textContent = st.collect ? "← 검색 결과로" : "👁 선택 모아보기";
    renderHead();
    if (!st.loaded) return;
    const v = view();
    const pg = pageOf(v, st.page, PAGE_SIZE);
    st.page = pg.page;
    const tagOf = (p) => (p.disc ? "단종 · " : "") + (PB_CATEGORIES.find((c) => c.key === p.category)?.label || "");
    const html = pg.items.map(({ p, options, stats }) => {
      const ps = pickState(options, st.picked);
      const head = `<input type="checkbox" data-pb-pick-product="${esc(p.code)}"${ps === "all" ? " checked" : ""} data-some="${ps === "some" ? 1 : 0}" aria-label="${esc(p.code)} 상품 선택">`;
      if (st.unit === "product") {
        const open = st.allOpen || st.open.has(p.code);
        return `<article class="pb-product pb-unit-product${ps !== "none" ? " is-picked" : ""}${p.disc ? " is-disc" : ""}" data-pb-product="${esc(p.code)}">
          <div class="pb-row pb-prow">
            ${head}
            ${photoCell(p.rep, p.rep ? "option" : "none")}
            <span class="pb-txt"><b><span class="pb-code">${esc(p.code)}</span> ${esc(p.name)}</b><small><span class="pb-tag pb-tag-${p.category}">${esc(tagOf(p))}</span> 옵션 ${fmt(options.length)}${options.length !== p.options.length ? ` / ${fmt(p.options.length)}` : ""} <button type="button" class="pb-toggle" data-pb-toggle="${esc(p.code)}" aria-expanded="${open}">${open ? "접기 ▲" : "펼치기 ▼"}</button></small></span>
            ${nums(stats)}
          </div>
          ${open ? `<div class="pb-options">${options.map((o) => optRow(p, o, false)).join("")}</div>` : ""}
        </article>`;
      }
      return `<article class="pb-product${ps !== "none" ? " is-picked" : ""}${p.disc ? " is-disc" : ""}" data-pb-product="${esc(p.code)}">
        <header class="pb-phead">${head}<b class="pb-code">${esc(p.code)}</b><span class="pb-name">${esc(p.name)}</span><span class="pb-tag pb-tag-${p.category}">${esc(tagOf(p))}</span><span class="pb-sum">재고 <b>${fmt(stats.stock)}</b> · 7일 <b>${sales(stats.s7)}</b> · 30일 <b>${sales(stats.s30)}</b> · 90일 <b>${sales(stats.s90)}</b></span></header>
        <div class="pb-options">${options.map((o) => optRow(p, o, true)).join("")}</div>
      </article>`;
    }).join("");
    $("[data-pb-list]").innerHTML = html || `<p class="pb-empty">${st.collect ? "선택한 상품이 없습니다 — 체크박스로 고른 뒤 [👁 선택 모아보기]" : "맞는 상품이 없습니다."}</p>`;
    root.querySelectorAll('[data-some="1"]').forEach((el) => { el.indeterminate = true; });
    renderPager(pg);
    // 선택 표시
    const optCount = v.reduce((s, x) => s + x.options.length, 0);
    const pickedIn = v.reduce((s, x) => s + x.options.filter((o) => st.picked.has(o.sku)).length, 0);
    const all = $("[data-pb-pick-all]");
    all.checked = optCount > 0 && pickedIn === optCount;
    all.indeterminate = pickedIn > 0 && pickedIn < optCount;
    $("[data-pb-all-label]").textContent = `${st.collect ? "모아보기" : "검색 결과"} 전체 선택 (${fmt(v.length)}상품 · ${fmt(optCount)}옵션)`;
    const pickedProducts = new Set();
    for (const p of st.products) if (p.options.some((o) => st.picked.has(o.sku))) pickedProducts.add(p.code);
    $("[data-pb-picked]").textContent = `선택 ${fmt(st.picked.size)}옵션 · ${fmt(pickedProducts.size)}상품`;
    $("[data-pb-excel]").disabled = !st.picked.size || st.busy;
    $("[data-pb-unpick]").disabled = !st.picked.size;
    const canDisc = !!csToken() && !st.busy;
    root.querySelectorAll("[data-pb-disc-act]").forEach((b) => { b.disabled = !st.picked.size || !canDisc; b.title = canDisc ? b.title.replace(/ — CS 관리.*$/, "") : `${b.title.replace(/ — CS 관리.*$/, "")} — CS 관리에서 시트에 연결한 브라우저에서 됩니다`; });
    $("[data-pb-collect]").disabled = !st.picked.size && !st.collect;
    if (!st.busy) status(`${st.collect ? "👁 선택 모아보기 · " : ""}${st.snapshotAt ? `셀피아 재고 ${st.snapshotAt} 기준` : "셀피아 재고"} · 상품 ${fmt(v.length)}개 (${fmt(pg.page)}/${fmt(pg.pages)}쪽, 한 쪽 ${PAGE_SIZE}개) / 전체 ${fmt(st.products.length)} · 사진 ${fmt(st.photos)}장 · 출고: ${st.salesNote}${st.discNote ? ` · 단종: ${st.discNote}` : ""}`);
  }

  // ---------- 11-06 단종 (CS 시트 '단종' 탭 · CS 관리 비밀번호 = 이 브라우저에 저장된 것) ----------
  function csToken() {
    for (const s of storages) {
      try { const raw = JSON.parse(s?.getItem(CS_BOARD_STORAGE_KEY) || "null"); if (raw && isCsBoardTokenValid(raw.token)) return { token: String(raw.token).trim(), editor: String(raw.editor || "").slice(0, 20) }; } catch { /* 다음 */ }
    }
    return null;
  }
  async function csPost(body) {
    const t = csToken();
    if (!t) throw new Error("CS 관리 연결 필요");
    const res = await fetchImpl(CS_BOARD_ENDPOINT, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ ...body, token: t.token, editor: t.editor }) });
    if (!res.ok) throw new Error(`시트 응답 오류 (${res.status})`);
    const js = await res.json();
    if (!js.ok) throw new Error(js.error || "시트 오류");
    return js;
  }
  async function loadDisc() {
    if (!csToken()) { st.discNote = "CS 관리에서 시트에 연결한 브라우저에서 보입니다"; return; }
    try {
      const js = await csPost({ action: "discList" });
      st.disc = new Set((js.skus || []).map((x) => String(x.sku)));
      st.discNote = `${fmt(st.disc.size)}옵션`;
    } catch (error) { st.discNote = `못 읽음 (${error.message})`; }
    applyDisc(st.products, st.disc);
  }
  async function setDisc(on) {
    const skus = [...st.picked];
    if (!skus.length || st.busy) return;
    const products = new Set();
    for (const p of st.products) if (p.options.some((o) => st.picked.has(o.sku))) products.add(p.code);
    const msg = on
      ? `고른 ${fmt(skus.length)}옵션(${fmt(products.size)}상품)을 단종 처리합니다.\n· 옵션이 모두 단종된 상품은 [단종] 카테고리로 옮겨지고 일반 검색에서 빠집니다.\n계속할까요?`
      : `고른 ${fmt(skus.length)}옵션의 단종 표시를 풉니다. 계속할까요?`;
    if (!window.confirm(msg)) return;
    st.busy = true; render(); status(on ? "단종 처리 중…" : "단종 해제 중…");
    try {
      const js = await csPost({ action: "discSet", skus, on });
      for (const k of skus) { if (on) st.disc.add(k); else st.disc.delete(k); }
      applyDisc(st.products, st.disc);
      st.discNote = `${fmt(st.disc.size)}옵션`;
      st.picked.clear(); st.collect = false;
      st.busy = false; render();
      status(`${on ? "⛔ 단종 처리" : "↩ 단종 해제"} ${fmt(js.changed || 0)}옵션 · 전체 단종 ${fmt(js.total ?? st.disc.size)}옵션 — 상품의 옵션이 모두 단종이면 [단종] 카테고리`, "is-ok");
    } catch (error) {
      st.busy = false; render();
      status(`단종 ${on ? "처리" : "해제"} 실패: ${error.message}`, "is-bad");
    }
  }

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
    attachSales(st.products, st.sales, today());
  }

  async function load() {
    if (st.loading) return;
    st.loading = true;
    $("[data-pb-reload]").disabled = true;
    try {
      const hub = { apikey: HUB_KEY, Authorization: `Bearer ${HUB_KEY}` };
      status("셀피아 재고 불러오는 중…");
      const [rows, names] = await Promise.all([
        pagedRest(fetchImpl, HUB_URL, "sellpia_stock_latest?select=sellpia_sku_code,sellpia_product_code,sellpia_product_name,sellpia_option_name,own_sku,stock,available_stock,snapshot_created_at,buy:raw_payload->>purchase_price,sell:raw_payload->>sell_price&order=sellpia_sku_code.asc", hub, (n) => status(`셀피아 재고 불러오는 중… ${fmt(n)}줄`)),
        listPhotos(fetchImpl),
      ]);
      const at = rows.find((r) => r.snapshot_created_at)?.snapshot_created_at;
      st.snapshotAt = at ? new Date(new Date(at).getTime() + 9 * 3600000).toISOString().slice(0, 16).replace("T", " ") : "";
      st.photos = names.filter((n) => !/\.__sub\d\.jpg$/i.test(n)).length;
      st.products = buildProducts(rows, photoIndex(names));
      st.loaded = true;
      await loadDisc();
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

  // ---------- 선택 → 엑셀 (사진 포함) ----------
  async function thumb(file) {
    try {
      const res = await fetchImpl(photoUrl(file));
      if (!res.ok) return null;
      const bmp = await window.createImageBitmap(await res.blob());
      const k = Math.min(THUMB / bmp.width, THUMB / bmp.height, 1);
      const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const g = c.getContext("2d");
      g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h);
      g.drawImage(bmp, 0, 0, w, h);
      const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
      return blob ? { data: new Uint8Array(await blob.arrayBuffer()), w, h } : null;
    } catch { return null; }
  }
  async function exportExcel() {
    const rows = excelRows(st.products, st.picked);
    if (!rows.length || st.busy) return;
    if (rows.length > 3000 && !window.confirm(`${fmt(rows.length)}줄 — 사진까지 넣으면 몇 분 걸릴 수 있습니다. 계속할까요?`)) return;
    st.busy = true; render();
    try {
      const images = [];
      const cache = new Map();
      let done = 0;
      const jobs = rows.map((r, i) => async () => {
        if (r.photo) {
          if (!cache.has(r.photo)) cache.set(r.photo, thumb(r.photo));
          const t = await cache.get(r.photo);
          if (t) images.push({ row: i, col: 0, data: t.data, ext: "jpeg", w: t.w, h: t.h });
        }
        done += 1;
        if (done % 20 === 0) status(`엑셀 만드는 중… 사진 ${fmt(done)} / ${fmt(rows.length)}`);
      });
      for (let i = 0; i < jobs.length; i += 8) await Promise.all(jobs.slice(i, i + 8).map((j) => j()));
      images.sort((a, b) => a.row - b.row);
      const bytes = buildXlsx({ sheetName: "선택 상품", columns: PB_EXCEL_COLUMNS, rows: rows.map((r) => r.cells), images, rowHeightPx: THUMB + 8 });
      const stamp = new Date(Date.now() + 9 * 3600000).toISOString().slice(2, 16).replace(/[-T:]/g, "").replace(/^(\d{6})(\d{4})$/, "$1_$2");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      a.download = `상품현황_선택_${stamp}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 30000);
      status(`엑셀 내려받기: ${fmt(rows.length)}옵션 · 사진 ${fmt(images.length)}장 — ${a.download} (브라우저 다운로드 폴더)`, "is-ok");
    } catch (error) {
      status(`엑셀을 만들지 못했습니다: ${error?.message || error}`, "is-bad");
    } finally {
      st.busy = false;
      const keep = $("[data-pb-status]").textContent;
      render();
      status(keep, "is-ok");
    }
  }

  // ---------- 이벤트 ----------
  const reset = () => { st.page = 1; render(); };
  let timer = 0;
  root.addEventListener("input", (e) => {
    if (e.target.matches("[data-pb-search]")) { window.clearTimeout(timer); timer = window.setTimeout(() => { st.q = e.target.value; reset(); }, 250); return; }
    const f = e.target.dataset.pbF;
    if (f && e.target.type === "number") { window.clearTimeout(timer); timer = window.setTimeout(() => { st[f] = e.target.value.trim(); reset(); }, 300); }
  });
  root.addEventListener("change", (e) => {
    const t = e.target;
    if (t.matches("[data-pb-days]")) { st.days = Number(t.value) || 0; reset(); }
    else if (t.matches("[data-pb-sort]")) { st.sort = t.value; reset(); }
    else if (t.dataset.pbF === "photo") { st.photo = t.value; reset(); }
    else if (t.matches("[data-pb-disc]")) { st.discMode = ["include", "only"].includes(t.value) ? t.value : "exclude"; reset(); }
    else if (t.matches("[data-pb-pick-sku]")) {
      if (t.checked) st.picked.add(t.dataset.pbPickSku); else st.picked.delete(t.dataset.pbPickSku);
      render();
    } else if (t.matches("[data-pb-pick-product]")) {
      const item = view().find((x) => x.p.code === t.dataset.pbPickProduct);
      if (item) for (const o of item.options) { if (t.checked) st.picked.add(o.sku); else st.picked.delete(o.sku); }
      render();
    } else if (t.matches("[data-pb-pick-all]")) {
      for (const x of view()) for (const o of x.options) { if (t.checked) st.picked.add(o.sku); else st.picked.delete(o.sku); }
      if (!st.picked.size) st.collect = false;
      render();
    }
  });
  root.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    if (b.dataset.pbCat) { st.cat = b.dataset.pbCat; st.collect = false; reset(); }
    else if (b.dataset.pbUnit) { st.unit = b.dataset.pbUnit; reset(); }
    else if (b.dataset.pbPage) { st.page = Number(b.dataset.pbPage) || 1; render(); $("[data-pb-head]").scrollIntoView?.({ block: "start" }); }
    else if (b.dataset.pbToggle) { const c = b.dataset.pbToggle; if (st.open.has(c)) st.open.delete(c); else st.open.add(c); if (st.allOpen) { st.allOpen = false; st.open = new Set(view().map((x) => x.p.code).filter((x) => x !== c)); } render(); }
    else if (b.matches("[data-pb-openall]")) { st.allOpen = !st.allOpen; st.open.clear(); render(); }
    else if (b.matches("[data-pb-collect]")) { st.collect = !st.collect; reset(); }
    else if (b.matches("[data-pb-unpick]")) { st.picked.clear(); st.collect = false; render(); }
    else if (b.matches("[data-pb-excel]")) exportExcel();
    else if (b.dataset.pbDiscAct) setDisc(b.dataset.pbDiscAct === "on");
    else if (b.matches("[data-pb-clear]")) {
      Object.assign(st, { stockMin: "", stockMax: "", photo: "all", salesMin: "", salesMax: "", q: "", discMode: "exclude" });
      $("[data-pb-disc]").value = "exclude";
      root.querySelectorAll("[data-pb-f]").forEach((el) => { el.value = el.tagName === "SELECT" ? "all" : ""; });
      $("[data-pb-search]").value = "";
      reset();
    } else if (b.matches("[data-pb-reload]")) { st.loaded = false; load(); }
  });
  render();
  // 상품 현황 탭을 처음 열 때 불러옴 (다른 탭만 쓰면 안 읽음)
  const panel = root.closest("[data-purchase-panel]");
  const maybeLoad = () => { if (!st.loaded && !st.loading && panel && !panel.hidden) load(); };
  maybeLoad();
  if (panel && window.MutationObserver) new window.MutationObserver(maybeLoad).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  return { state: st, load, render, exportExcel };
}

if (typeof document !== "undefined" && document.querySelector("[data-product-board]")) {
  const safe = (k) => { try { return window[k]; } catch { return null; } };
  mountProductBoard({ document, window, storages: [safe("sessionStorage"), safe("localStorage")] });
}
