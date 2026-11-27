// 🗄 상품 관리 › 자사코드 자리 (2026-11-27) — 피어싱 매대(A~T) 정리 · 신상품 자리 추천
//  · ① 뺄 상품 찾기: 단종·삭제(임의필드 XXX) · 판매부진(기간 × 출고 개수) → 아랫칸(B·D·F…) 30열 서랍 자리로 옮길 목록
//  · ② 신상품 자리: 옵션 개수 → 비운 칸 + 원래 빈 칸에서 최대한 붙은 자사코드 추천
//  · 데이터: 운영 허브 sellpia_stock_latest(자사코드 · 재고) · CS 시트 'XX표시' 탭(xxList) · 피킹 주문(출고)
//    또는 [📥 셀피아 엑셀] (상품코드 · 자사코드 · 재고 · 임의필드 칸) 한 파일로
//  · 읽기 전용: 셀피아·시트 어디에도 쓰지 않음 — 옮길 목록은 엑셀로 받아 사람이 반영
import { CS_BOARD_ENDPOINT, CS_BOARD_STORAGE_KEY, isCsBoardTokenValid } from "../domain/csBoard.mjs?v=20261111-msqa1";
import { buildSales, salesSum } from "../domain/productBoard.mjs?v=20261110-subs1";
import { buildXlsx } from "../domain/xlsxWriter.mjs?v=20261106-board2";
import { FS_DRAWER, FS_MOVE_COLUMNS, FS_SHELVES, freeCells, hasXxx, lowerShelf, moveRows, planRetire, shelfSummary, suggestSlots } from "../domain/freeSlots.mjs";

const HUB_URL = "https://bpgvqmtsjgegnrdzmpep.supabase.co";
const HUB_KEY = "sb_publishable__NVp6Ra227_e1TQqQE40oA_O2PVwv5C";
const PICK_URL = "https://vgxocngpykhlkosiaeew.supabase.co";
const PICK_KEY = "sb_publishable_XVnKGJo66GZiYTq5Ivu8dA_SjBVvX0g";
const PICK_SESSION_KEY = "system-v3-picking-session-v1";
const PAGE = 1000;
const DAYS = [30, 60, 90, 180];
const MAXQ = [0, 1, 2, 3, 5];
const LIST_MAX = 300;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => Number(n || 0).toLocaleString("ko-KR");
const LOWER = FS_SHELVES.filter((s) => lowerShelf(s) === s);   // B D F … T

const CSS = `
.fs-wrap{display:flex;flex-direction:column;gap:14px;font-size:14px}
.fs-box{border:1px solid #d9dee5;border-radius:10px;padding:12px 14px;background:#fff}
.fs-box h3{margin:0 0 10px;font-size:15px}
.fs-row[hidden]{display:none}
.fs-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin:6px 0}
.fs-lab{color:#556;min-width:52px}
.fs-seg{display:inline-flex;border:1px solid #c8ced6;border-radius:8px;overflow:hidden}
.fs-seg button{border:0;background:#fff;padding:5px 10px;cursor:pointer;font:inherit}
.fs-seg button+button{border-left:1px solid #e1e5ea}
.fs-seg button.is-on{background:#2f6fde;color:#fff}
.fs-btn{border:1px solid #c8ced6;background:#f6f8fa;border-radius:8px;padding:5px 12px;cursor:pointer;font:inherit}
.fs-btn:disabled{opacity:.5;cursor:default}
.fs-btn-main{background:#2f6fde;border-color:#2f6fde;color:#fff}
.fs-status{color:#556;font-size:13px}
.fs-status.is-bad{color:#c0392b}
.fs-tbl{border-collapse:collapse;width:100%;font-size:13px}
.fs-tbl th,.fs-tbl td{border-bottom:1px solid #eef0f3;padding:4px 6px;text-align:left;white-space:nowrap}
.fs-tbl th{background:#f6f8fa;font-weight:600}
.fs-tbl td.n{text-align:right}
.fs-tbl.is-sum{width:auto}
.fs-tbl.is-sum td,.fs-tbl.is-sum th{min-width:70px}
.fs-bad{color:#c0392b;font-weight:600}
.fs-scroll{max-height:320px;overflow:auto;border:1px solid #eef0f3;border-radius:8px}
.fs-cards{display:flex;flex-wrap:wrap;gap:10px}
.fs-card{border:1px solid #d9dee5;border-radius:10px;padding:10px 12px;min-width:220px;background:#fbfcfe}
.fs-card b{font-size:15px}
.fs-card .fs-codes{font-family:ui-monospace,Consolas,monospace;font-size:12px;color:#334;margin:6px 0;white-space:pre-line}
.fs-tag{display:inline-block;font-size:11px;border-radius:6px;padding:1px 6px;margin-left:6px;background:#eef3ff;color:#2f6fde}
.fs-tag.is-near{background:#fff4e5;color:#b26a00}
.fs-num{display:inline-flex;align-items:center;gap:4px}
.fs-num b{min-width:28px;text-align:center;font-size:16px}
`;

export function mountFreeSlots({ document, window, root, storages = [], fetchImpl = (...a) => window.fetch(...a), today = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10) } = {}) {
  if (!root) return null;
  const st = {
    options: [], source: "", loading: false, note: "", xxNote: "", salesNote: "", sales: null,
    xxx: true, slowOn: false, days: 90, maxQ: 0, only: "", cols29: false,
    n: 3, shelf: "", onlyFreed: false, plan: null, free: [], copied: "",
  };
  if (!document.getElementById("fs-style")) { const s = document.createElement("style"); s.id = "fs-style"; s.textContent = CSS; document.head.appendChild(s); }
  const $ = (q) => root.querySelector(q);

  const csToken = () => {
    for (const s of storages) {
      try { const raw = JSON.parse(s?.getItem?.(CS_BOARD_STORAGE_KEY) || "null"); if (raw && isCsBoardTokenValid(raw.token)) return { token: String(raw.token).trim(), editor: String(raw.editor || "").slice(0, 20) }; } catch { /* 다음 */ }
    }
    return null;
  };
  async function csPost(body) {
    const t = csToken();
    if (!t) throw new Error("CS 시트 연결 필요");
    const res = await fetchImpl(CS_BOARD_ENDPOINT, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ ...body, token: t.token, editor: t.editor }) });
    if (!res.ok) throw new Error(`시트 응답 오류 (${res.status})`);
    const js = await res.json();
    if (js?.denied) throw new Error("비밀번호가 맞지 않습니다");
    return js;
  }
  async function pagedRest(base, path, headers, onPage) {
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

  root.innerHTML = `
    <div class="fs-wrap">
      <div class="fs-row">
        <button type="button" class="fs-btn fs-btn-main" data-fs-load>⟳ 불러오기</button>
        <label class="fs-btn" title="상품코드 · 자사코드 · 재고 · 임의필드 칸이 있는 셀피아 엑셀">📥 셀피아 엑셀<input type="file" accept=".xlsx,.xlsm,.xls" data-fs-file hidden></label>
        <span class="fs-status" data-fs-status></span>
      </div>
      <div class="fs-box">
        <h3>① 뺄 상품 → 아랫칸 서랍</h3>
        <div class="fs-row"><span class="fs-lab">기준</span>
          <span class="fs-seg"><button type="button" data-fs-xxx>단종·삭제 (XXX)</button></span>
          <span class="fs-seg"><button type="button" data-fs-slow>판매부진</button></span>
        </div>
        <div class="fs-row" data-fs-slowrow><span class="fs-lab">기간</span>
          <span class="fs-seg">${DAYS.map((d) => `<button type="button" data-fs-days="${d}">${d}일</button>`).join("")}</span>
          <span class="fs-lab">출고</span>
          <span class="fs-seg">${MAXQ.map((q) => `<button type="button" data-fs-maxq="${q}">${q ? `${q}개 이하` : "0개"}</button>`).join("")}</span>
        </div>
        <div class="fs-row"><span class="fs-lab">매대</span>
          <span class="fs-seg"><button type="button" data-fs-only="">전체</button>${LOWER.map((s) => `<button type="button" data-fs-only="${s}">${FS_SHELVES[FS_SHELVES.indexOf(s) - 1]}·${s}</button>`).join("")}</span>
        </div>
        <div class="fs-row"><span class="fs-lab">서랍</span>
          <span class="fs-seg"><button type="button" data-fs-cols29>30열 다 차면 29열도</button></span>
        </div>
        <div data-fs-plan></div>
      </div>
      <div class="fs-box">
        <h3>② 신상품 자리</h3>
        <div class="fs-row"><span class="fs-lab">옵션</span>
          <span class="fs-num"><button type="button" class="fs-btn" data-fs-n="-1">－</button><b data-fs-nval></b><button type="button" class="fs-btn" data-fs-n="1">＋</button></span>
          <span class="fs-seg">${[1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => `<button type="button" data-fs-nset="${n}">${n}</button>`).join("")}</span>
        </div>
        <div class="fs-row"><span class="fs-lab">매대</span>
          <span class="fs-seg"><button type="button" data-fs-shelf="">전체</button>${FS_SHELVES.map((s) => `<button type="button" data-fs-shelf="${s}">${s}</button>`).join("")}</span>
        </div>
        <div class="fs-row"><span class="fs-lab">칸</span>
          <span class="fs-seg"><button type="button" data-fs-freed="0">비운 칸 + 원래 빈 칸</button><button type="button" data-fs-freed="1">비운 칸만</button></span>
        </div>
        <div data-fs-suggest></div>
      </div>
    </div>`;

  function status(text, cls = "") { const el = $("[data-fs-status]"); el.textContent = text; el.className = `fs-status ${cls}`; }
  const salesOf = (sku, days) => (st.sales ? salesSum(st.sales, sku, days, today()) : 0);

  function compute() {
    const slow = st.slowOn && st.sales ? { days: st.days, max: st.maxQ } : null;
    const drawer = { ...FS_DRAWER, cols: st.cols29 ? [30, 29] : [30] };
    st.plan = (st.xxx || slow) ? planRetire(st.options, { xxx: st.xxx, slow }, { salesOf, drawer, only: st.only }) : null;
    st.free = freeCells(st.options, { vacated: st.plan?.vacated || new Set() });
  }

  function renderPlan() {
    const box = $("[data-fs-plan]");
    if (!st.options.length) { box.innerHTML = ""; return; }
    const p = st.plan;
    if (!p) { box.innerHTML = `<p class="fs-status">기준을 하나 이상 고르세요</p>`; return; }
    const rows = Object.entries(p.byShelf).sort(([a], [b]) => a.localeCompare(b));
    const tot = rows.reduce((a, [, b]) => ({ cells: a.cells + b.cells, options: a.options + b.options, overflow: a.overflow + b.overflow }), { cells: 0, options: 0, overflow: 0 });
    const list = [...p.moves, ...p.overflow].slice(0, LIST_MAX);
    box.innerHTML = `
      <div class="fs-row">
        <span>비울 칸 <b>${fmt(tot.cells)}</b> · 옮길 옵션 <b>${fmt(tot.options)}</b>${tot.overflow ? ` · <span class="fs-bad">자리 없음 ${fmt(tot.overflow)}</span>` : ""}${p.partial.length ? ` · 일부만 해당(그대로 둠) ${fmt(p.partial.length)}칸` : ""}</span>
        <button type="button" class="fs-btn" data-fs-excel ${p.moves.length + p.overflow.length ? "" : "disabled"}>📄 옮길 목록 엑셀</button>
      </div>
      ${rows.length ? `<table class="fs-tbl is-sum"><thead><tr><th>서랍</th><th>비울 칸</th><th>옮길 옵션</th><th>남는 자리</th><th>자리 없음</th></tr></thead><tbody>
        ${rows.map(([s, b]) => `<tr><td>${s} ${st.cols29 ? "30·29열" : "30열"}</td><td class="n">${fmt(b.cells)}</td><td class="n">${fmt(b.options)}</td><td class="n">${fmt(b.left)}</td><td class="n ${b.overflow ? "fs-bad" : ""}">${b.overflow ? fmt(b.overflow) : ""}</td></tr>`).join("")}
      </tbody></table>` : `<p class="fs-status">해당 상품 없음</p>`}
      ${list.length ? `<div class="fs-scroll" style="margin-top:8px"><table class="fs-tbl"><thead><tr><th>셀피아 코드</th><th>상품명</th><th>옵션</th><th>재고</th><th>지금</th><th>→ 옮길 자리</th><th>이유</th></tr></thead><tbody>
        ${list.map((m) => `<tr><td>${esc(m.sku)}</td><td>${esc(m.product)}</td><td>${esc(m.option)}</td><td class="n">${fmt(m.stock)}</td><td>${esc(m.from)}</td><td>${m.to ? esc(m.to) : '<span class="fs-bad">자리 없음</span>'}</td><td>${esc(m.reason)}</td></tr>`).join("")}
      </tbody></table></div>${p.moves.length + p.overflow.length > LIST_MAX ? `<p class="fs-status">앞 ${LIST_MAX}줄만 보임 — 전체는 엑셀로</p>` : ""}` : ""}`;
  }

  function renderSuggest() {
    const box = $("[data-fs-suggest]");
    $("[data-fs-nval]").textContent = st.n;
    if (!st.options.length) { box.innerHTML = ""; return; }
    const free = st.onlyFreed ? st.free.filter((f) => f.freed) : st.free;
    const list = suggestSlots(free, st.n, { shelf: st.shelf });
    const sum = shelfSummary(st.free, st.options).filter((x) => !st.shelf || x.shelf === st.shelf);
    const nFree = free.filter((f) => !st.shelf || f.shelf === st.shelf).length;
    box.innerHTML = `
      <p class="fs-status">빈 칸 ${fmt(nFree)}개 (비운 칸 ${fmt(sum.reduce((a, x) => a + x.freed, 0))} · 원래 빈 칸 ${fmt(sum.reduce((a, x) => a + x.empty, 0))})</p>
      ${list.length ? `<div class="fs-cards">${list.map((s, i) => `
        <div class="fs-card"><b>${esc(s.label)}</b><span class="fs-tag ${s.kind === "near" ? "is-near" : ""}">${s.kind === "line" ? "한 줄" : "가까이"}</span>${s.freed ? `<span class="fs-tag">비운 칸 ${s.freed}</span>` : ""}
          <div class="fs-codes">${s.codes.map(esc).join("\n")}</div>
          <button type="button" class="fs-btn" data-fs-copy="${i}">${st.copied === s.label ? "✓ 복사됨" : "📋 복사"}</button></div>`).join("")}</div>`
        : `<p class="fs-status">${fmt(st.n)}칸을 둘 자리가 없습니다 — 매대를 넓히거나 정리 기준을 바꿔 보세요</p>`}`;
    box._list = list;
  }

  function render() {
    for (const b of root.querySelectorAll("[data-fs-days]")) b.classList.toggle("is-on", Number(b.dataset.fsDays) === st.days);
    for (const b of root.querySelectorAll("[data-fs-maxq]")) b.classList.toggle("is-on", Number(b.dataset.fsMaxq) === st.maxQ);
    for (const b of root.querySelectorAll("[data-fs-only]")) b.classList.toggle("is-on", b.dataset.fsOnly === st.only);
    for (const b of root.querySelectorAll("[data-fs-shelf]")) b.classList.toggle("is-on", b.dataset.fsShelf === st.shelf);
    for (const b of root.querySelectorAll("[data-fs-nset]")) b.classList.toggle("is-on", Number(b.dataset.fsNset) === st.n);
    for (const b of root.querySelectorAll("[data-fs-freed]")) b.classList.toggle("is-on", (b.dataset.fsFreed === "1") === st.onlyFreed);
    $("[data-fs-xxx]").classList.toggle("is-on", st.xxx);
    $("[data-fs-slow]").classList.toggle("is-on", st.slowOn);
    $("[data-fs-cols29]").classList.toggle("is-on", st.cols29);
    $("[data-fs-slowrow]").hidden = !st.slowOn;
    $("[data-fs-load]").disabled = st.loading;
    renderPlan();
    renderSuggest();
    if (st.options.length && !st.loading) {
      status(`${st.source} · 자사코드 ${fmt(st.options.length)}옵션 · XXX: ${st.xxNote}${st.slowOn ? ` · 출고: ${st.salesNote}` : ""}`, st.slowOn && !st.sales ? "is-bad" : "");
    }
  }
  const refresh = () => { compute(); render(); };

  async function loadSales() {
    let session = null;
    for (const s of storages) {
      try { const v = JSON.parse(s?.getItem(PICK_SESSION_KEY) || "null"); if (v?.token && !(Date.parse(v.expiresAt) <= Date.now())) { session = v; break; } } catch { /* 다음 */ }
    }
    if (!session?.token) { st.sales = null; st.salesNote = "피킹 로그인 필요 — 피킹시스템에서 로그인한 탭에서 오면 보입니다"; return; }
    const headers = { apikey: PICK_KEY, Authorization: `Bearer ${PICK_KEY}`, "x-picking-session": session.token };
    try {
      const orders = await pagedRest(PICK_URL, "orders?select=ord_no,receipt_date&order=ord_no.asc", headers);
      const items = await pagedRest(PICK_URL, "order_items?select=ord_no,p_code,qty&order=ord_no.asc", headers, (n) => status(`출고 수량 계산 중… ${fmt(n)}줄`));
      st.sales = buildSales(orders, items);
      st.salesNote = st.sales.first ? `${st.sales.first} ~ ${st.sales.last}` : "피킹 주문 데이터 없음";
    } catch (error) {
      st.sales = null;
      st.salesNote = error.auth ? "피킹 로그인이 만료됐습니다" : `못 읽음 (${error.message})`;
    }
  }

  async function load() {
    if (st.loading) return;
    st.loading = true; render();
    try {
      status("셀피아 재고 불러오는 중…");
      const hub = { apikey: HUB_KEY, Authorization: `Bearer ${HUB_KEY}` };
      const rows = await pagedRest(HUB_URL, "sellpia_stock_latest?select=sellpia_sku_code,sellpia_product_name,sellpia_option_name,own_sku,stock&order=sellpia_sku_code.asc", hub, (n) => status(`셀피아 재고 불러오는 중… ${fmt(n)}줄`));
      let xxx = new Set();
      if (csToken()) {
        try {
          const js = await csPost({ action: "xxList" });
          const items = (js.items || []).filter((x) => x.mark === "XXX" || hasXxx(x.text));
          xxx = new Set(items.map((x) => String(x.sku)));
          st.xxNote = `${fmt(xxx.size)}옵션${js.at ? ` (${String(js.at).slice(5)} 올림)` : ""}`;
        } catch (error) { st.xxNote = `못 읽음 (${error.message})`; }
      } else st.xxNote = "CS 시트 연결 필요 (또는 📥 셀피아 엑셀)";
      st.options = rows.filter((r) => String(r.own_sku || "").trim()).map((r) => ({
        sku: String(r.sellpia_sku_code || ""), product: String(r.sellpia_product_name || ""), option: String(r.sellpia_option_name || ""),
        ownSku: String(r.own_sku || "").trim(), stock: Number(r.stock) || 0, xxx: xxx.has(String(r.sellpia_sku_code || "")),
      }));
      st.source = "운영 허브";
      await loadSales();
      compute();
    } catch (error) {
      status(`불러오지 못했습니다: ${error.message}`, "is-bad");
    } finally { st.loading = false; render(); }
  }

  function loadSheetJs() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise((ok, bad) => {
      const sc = document.createElement("script");
      sc.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      sc.onload = () => ok(window.XLSX); sc.onerror = () => bad(new Error("엑셀 읽기 도구를 받지 못했습니다"));
      document.head.appendChild(sc);
    });
  }
  async function loadFile(file) {
    if (!file || st.loading) return;
    st.loading = true; render(); status(`${file.name} 읽는 중…`);
    try {
      const XLSX = await loadSheetJs();
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
      const opts = optionsFromRows(rows);
      if (!opts.length) throw new Error("머리줄에 상품코드 · 자사코드 칸이 있어야 합니다");
      st.options = opts;
      st.source = file.name;
      st.xxNote = `${fmt(opts.filter((o) => o.xxx).length)}옵션 (엑셀 임의필드)`;
      if (!st.sales) await loadSales();
      compute();
    } catch (error) {
      status(`엑셀을 읽지 못했습니다: ${error.message}`, "is-bad");
    } finally { st.loading = false; render(); }
  }

  function exportExcel() {
    const p = st.plan;
    if (!p) return;
    const bytes = buildXlsx({ sheetName: "옮길 목록", columns: FS_MOVE_COLUMNS.map((title, i) => ({ title, width: [12, 30, 22, 6, 20, 20, 18][i] })), rows: moveRows(p) });
    const stamp = new Date(Date.now() + 9 * 3600000).toISOString().slice(2, 16).replace(/[-T:]/g, "").replace(/^(\d{6})(\d{4})$/, "$1_$2");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    a.download = `자사코드_옮길목록_${stamp}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }

  async function copy(i) {
    const s = $("[data-fs-suggest]")._list?.[i];
    if (!s) return;
    try { await window.navigator.clipboard.writeText(s.codes.join("\n")); st.copied = s.label; } catch { st.copied = ""; status("복사하지 못했습니다 — 코드를 직접 골라 복사해 주세요", "is-bad"); }
    renderSuggest();
  }

  root.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || !root.contains(b)) return;
    const d = b.dataset;
    if (d.fsLoad !== undefined) load();
    else if (d.fsXxx !== undefined) { st.xxx = !st.xxx; refresh(); }
    else if (d.fsSlow !== undefined) { st.slowOn = !st.slowOn; refresh(); }
    else if (d.fsDays) { st.days = Number(d.fsDays); refresh(); }
    else if (d.fsMaxq !== undefined) { st.maxQ = Number(d.fsMaxq); refresh(); }
    else if (d.fsOnly !== undefined) { st.only = d.fsOnly; refresh(); }
    else if (d.fsCols29 !== undefined) { st.cols29 = !st.cols29; refresh(); }
    else if (d.fsN) { st.n = Math.max(1, Math.min(60, st.n + Number(d.fsN))); st.copied = ""; render(); }
    else if (d.fsNset) { st.n = Number(d.fsNset); st.copied = ""; render(); }
    else if (d.fsShelf !== undefined) { st.shelf = d.fsShelf; st.copied = ""; render(); }
    else if (d.fsFreed !== undefined) { st.onlyFreed = d.fsFreed === "1"; st.copied = ""; render(); }
    else if (d.fsExcel !== undefined) exportExcel();
    else if (d.fsCopy !== undefined) copy(Number(d.fsCopy));
  });
  root.querySelector("[data-fs-file]").addEventListener("change", (e) => { loadFile(e.target.files?.[0]); e.target.value = ""; });

  render();
  status("[⟳ 불러오기] 를 누르세요");
  return { state: st, load, loadFile, render, setOptions: (opts, source = "견본") => { st.options = opts; st.source = source; st.xxNote = `${fmt(opts.filter((o) => o.xxx).length)}옵션`; compute(); render(); } };
}

// 셀피아 엑셀 표(행 배열) → 옵션 목록 — 머리줄(앞 6줄 안)의 상품코드 · 자사코드 · 재고 · 임의필드 · 상품명 · 옵션명 칸
export function optionsFromRows(rows = []) {
  const headAt = rows.slice(0, 6).findIndex((r) => (r || []).some((c) => String(c ?? "").replace(/\s+/g, "") === "자사코드"));
  if (headAt < 0) return [];
  const head = rows[headAt].map((c) => String(c ?? "").replace(/\s+/g, ""));
  const at = (name) => head.indexOf(name);
  const c = { sku: at("상품코드"), own: at("자사코드"), stock: at("재고"), memo: at("임의필드"), product: at("상품명"), option: at("옵션명") };
  if (c.sku < 0 || c.own < 0) return [];
  const out = [];
  for (const r of rows.slice(headAt + 1)) {
    const own = String(r?.[c.own] ?? "").trim();
    const sku = String(r?.[c.sku] ?? "").trim();
    if (!own || !sku) continue;
    const memo = c.memo >= 0 ? String(r[c.memo] ?? "") : "";
    out.push({ sku, ownSku: own, stock: Number(String(r?.[c.stock] ?? "").replace(/[^\d.-]/g, "")) || 0, memo, xxx: hasXxx(memo), product: c.product >= 0 ? String(r[c.product] ?? "") : "", option: c.option >= 0 ? String(r[c.option] ?? "") : "" });
  }
  return out;
}
