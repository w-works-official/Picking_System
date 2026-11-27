// 🗄 상품 관리 › 자사코드 자리 (2026-11-27) — 피어싱 매대(A~T) 정리 · 신상품 자리 추천
//  · 11-27 3차: 표 칸 너비 끌기 · 매대 여러 개 · 요약 빼기 · 전달사항/임의필드 칸 · 상품 사이 빈 줄 · [엑셀 다운로드](☐/☑ 완료 칸)
//    · [엑셀 업로드](끌어다 놓기) · [✓ 완료 저장] → CS 시트 '자사코드이동' 탭 (slotSave/slotList) · [⬇ 매칭엑셀다운로드] 셀피아 자사코드 일괄 CSV
//    · 완료 저장한 이동은 셀피아에 올리기 전이라도 옮긴 것으로 계산 (서랍 자리 겹치지 않게)
//  · 11-27 2차: 대표코드가 같은 상품은 옵션 전부 같이 움직임 · 한 번에 찾을 상품 수(기본 5) · 간격·목록 높이(끌어서 조절)
//  · ① 뺄 상품 찾기: 단종·삭제(전달사항 · 임의필드 XXX) · 판매부진(기간 × 출고 개수) → 상품마다 박스(20개 미만 1 · 20개 이상 2 …)에 담아
//    아랫칸(B·D·F…) 30열 서랍 자리(1자리 = 1박스)로 옮길 목록
//  · ② 신상품 자리: 옵션 개수 → 비운 칸 + 원래 빈 칸에서 최대한 붙은 자사코드 추천
//  · 데이터: 운영 허브 sellpia_stock_latest(자사코드 · 재고) · CS 시트 'XX표시' 탭(xxList) · 피킹 주문(출고)
//    또는 [📥 셀피아 엑셀] (상품코드 · 자사코드 · 재고 · 임의필드 칸) 한 파일로
//  · 셀피아에는 쓰지 않음 — 완료 기록만 CS 시트에 더함 · 셀피아 반영은 매칭 CSV 를 사람이(또는 셀피아 세션이) 올림
import { CS_BOARD_ENDPOINT, CS_BOARD_STORAGE_KEY, isCsBoardTokenValid } from "../domain/csBoard.mjs?v=20261111-msqa1";
import { buildSales, salesSum } from "../domain/productBoard.mjs?v=20261127-vs2";
import { buildXlsx } from "../domain/xlsxWriter.mjs?v=20261127-slots5";
import { isVirtualStock, realStock } from "../domain/virtualStock.mjs?v=20261127-vs2";
import { FS_DONE, FS_DRAWER, FS_SHEET_COLUMNS, FS_SHELVES, FS_TODO, applySaved, doneFromRows, freeCells, hasXxx, latestBySku, lowerShelf, matchingCsv, planRetire, sheetLines, sheetRows, shelfSummary, suggestSlots } from "../domain/freeSlots.mjs?v=20261127-slots5";

const HUB_URL = "https://bpgvqmtsjgegnrdzmpep.supabase.co";
const HUB_KEY = "sb_publishable__NVp6Ra227_e1TQqQE40oA_O2PVwv5C";
const PICK_URL = "https://vgxocngpykhlkosiaeew.supabase.co";
const PICK_KEY = "sb_publishable_XVnKGJo66GZiYTq5Ivu8dA_SjBVvX0g";
const PICK_SESSION_KEY = "system-v3-picking-session-v1";
const PAGE = 1000;
const DAYS = [30, 60, 90, 180];
const MAXQ = [0, 1, 2, 3, 5];
const LIST_MAX = 300;
const LIMITS = [5, 10, 20, 50, 0];           // 한 번에 찾을 상품 수 (0 = 전체) — 11-27 대표님: 기본 5상품
const GAP_KEY = "system_v3_fs_gap";          // 11-27: 간격 · 목록 높이 — 끌어서 조절, 이 브라우저에 기억
const LIST_KEY = "system_v3_fs_list";
const COLS_KEY = "system_v3_fs_cols";        // 11-27 3차: 표 칸 너비 (머리줄 경계선을 끌어서)
const COL_W = [90, 220, 150, 52, 120, 110, 130, 130, 66];   // FS_SHEET_COLUMNS 기본 너비(px)

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
.fs-scroll{height:var(--fs-list,320px);overflow:auto;border:1px solid #eef0f3;border-radius:8px}
.fs-cards{display:flex;flex-wrap:wrap;gap:10px}
.fs-card{border:1px solid #d9dee5;border-radius:10px;padding:10px 12px;min-width:220px;background:#fbfcfe}
.fs-card b{font-size:15px}
.fs-card .fs-codes{font-family:ui-monospace,Consolas,monospace;font-size:12px;color:#334;margin:6px 0;white-space:pre-line}
.fs-tag{display:inline-block;font-size:11px;border-radius:6px;padding:1px 6px;margin-left:6px;background:#eef3ff;color:#2f6fde}
.fs-tag.is-near{background:#fff4e5;color:#b26a00}
.fs-num{display:inline-flex;align-items:center;gap:4px}
.fs-num b{min-width:28px;text-align:center;font-size:16px}
.fs-wrap{--g:14px;gap:var(--g)}.fs-wrap .fs-box{padding:calc(var(--g)*.85) calc(var(--g)*1)}.fs-wrap .fs-row{margin:calc(var(--g)*.4) 0;gap:calc(var(--g)*.4) calc(var(--g)*.7)}
.fs-wrap .fs-box h3{margin:0 0 calc(var(--g)*.7)}.fs-wrap .fs-tbl th,.fs-wrap .fs-tbl td{padding:calc(2px + var(--g)*.15) 6px}.fs-wrap .fs-seg button{padding:calc(2px + var(--g)*.2) 10px}
.fs-gap{display:inline-flex;align-items:center;gap:6px;color:#556}.fs-gap input{width:140px;cursor:ew-resize}
.fs-grip{height:10px;margin-top:2px;border-radius:5px;background:repeating-linear-gradient(90deg,#d9dee5 0 6px,transparent 6px 10px);cursor:ns-resize;touch-action:none}
.fs-tbl.is-list{table-layout:fixed;width:auto}
.fs-tbl.is-list th{position:relative;overflow:hidden;text-overflow:ellipsis}
.fs-tbl.is-list td{overflow:hidden;text-overflow:ellipsis}
.fs-tbl td.c,.fs-tbl th.c{text-align:center}
.fs-tbl td.to,.fs-tbl th.to{background:#f1f3f5}
.fs-tbl tr.fs-blank td{border-bottom:0;height:10px;padding:0}
.fs-rz{position:absolute;top:0;right:-3px;width:7px;height:100%;cursor:col-resize;z-index:1;touch-action:none}
.fs-rz:hover,.fs-rz.is-drag{background:#2f6fde55}
.fs-drop{display:inline-flex;align-items:center;gap:6px;border:2px dashed #9fb3d1;border-radius:8px;padding:5px 14px;color:#2f6fde;cursor:pointer;background:#f7faff}
.fs-drop.is-over{background:#e3edff;border-color:#2f6fde}
.fs-grip:hover{background:repeating-linear-gradient(90deg,#2f6fde 0 6px,transparent 6px 10px)}
`;

export function mountFreeSlots({ document, window, root, storages = [], fetchImpl = (...a) => window.fetch(...a), today = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10) } = {}) {
  if (!root) return null;
  const st = {
    options: [], source: "", loading: false, note: "", xxNote: "", salesNote: "", sales: null,
    xxx: true, xxxMode: "both", slowOn: false, days: 90, maxQ: 0, only: new Set(), limit: 5, raw: [], saved: new Map(), savedNote: "", checked: new Set(), colW: COL_W.slice(), gap: 14, listH: 320,
    n: 3, shelf: "", onlyFreed: false, plan: null, free: [], copied: "",
  };
  const getNum = (k) => { for (const s of storages) { try { const v = Number(s?.getItem?.(k)); if (v) return v; } catch { /* 없음 */ } } return 0; };
  const setNum = (k, v) => { for (const s of storages) { try { s?.setItem?.(k, String(Math.round(v))); } catch { /* 없음 */ } } };
  st.gap = Math.min(30, Math.max(2, getNum(GAP_KEY) || st.gap));
  st.listH = Math.min(1200, Math.max(120, getNum(LIST_KEY) || st.listH));
  for (const s of storages) { try { const v = JSON.parse(s?.getItem?.(COLS_KEY) || "null"); if (Array.isArray(v) && v.length === COL_W.length) { st.colW = v.map((x, i) => Math.max(30, Number(x) || COL_W[i])); break; } } catch { /* 없음 */ } }
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
        <label class="fs-btn" title="DB1 PC LIST · DB2 AC-LIST 파일 그대로 (둘 다 한 번에 골라도 됨)">📥 셀피아 엑셀 (DB1 · DB2)<input type="file" accept=".xlsx,.xlsm,.xls" multiple data-fs-file hidden></label>
        <span class="fs-status" data-fs-status></span>
        <span style="flex:1"></span>
        <label class="fs-gap">간격 <input type="range" min="2" max="30" step="1" data-fs-gap aria-label="간격 (끌어서 조절)"></label>
      </div>
      <div class="fs-box">
        <h3>① 뺄 상품 → 아랫칸 서랍</h3>
        <div class="fs-row"><span class="fs-lab">기준</span>
          <span class="fs-seg"><button type="button" data-fs-xxx>단종·삭제 (XXX)</button></span>
          <span class="fs-seg"><button type="button" data-fs-slow>판매부진</button></span>
        </div>
        <div class="fs-row" data-fs-xxxrow><span class="fs-lab">XXX</span>
          <span class="fs-seg"><button type="button" data-fs-xmode="both">전달사항 · 임의필드 둘 다</button><button type="button" data-fs-xmode="either">둘 중 하나</button></span>
        </div>
        <div class="fs-row" data-fs-slowrow><span class="fs-lab">기간</span>
          <span class="fs-seg">${DAYS.map((d) => `<button type="button" data-fs-days="${d}">${d}일</button>`).join("")}</span>
          <span class="fs-lab">출고</span>
          <span class="fs-seg">${MAXQ.map((q) => `<button type="button" data-fs-maxq="${q}">${q ? `${q}개 이하` : "0개"}</button>`).join("")}</span>
        </div>
        <div class="fs-row"><span class="fs-lab">상품 수</span>
          <span class="fs-seg">${LIMITS.map((n) => `<button type="button" data-fs-limit="${n}">${n ? `${n}상품` : "전체"}</button>`).join("")}</span>
        </div>
        <div class="fs-row"><span class="fs-lab">매대</span>
          <span class="fs-seg" title="여러 개 고를 수 있음"><button type="button" data-fs-only="">전체</button>${LOWER.map((s) => `<button type="button" data-fs-only="${s}">${FS_SHELVES[FS_SHELVES.indexOf(s) - 1]}·${s}</button>`).join("")}</span>
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
    const ap = applySaved(st.raw, st.saved);              // 11-27 3차: 완료 저장한 이동은 셀피아에 올리기 전이라도 옮긴 것으로 계산
    st.options = ap.options; st.applied = ap.applied;
    st.plan = (st.xxx || slow) ? planRetire(st.options, { xxx: st.xxx, xxxMode: st.xxxMode, slow }, { salesOf, drawer: FS_DRAWER, only: [...st.only], limit: st.limit }) : null;
    st.free = freeCells(st.options, { vacated: st.plan?.vacated || new Set() });
    const live = new Set((st.plan?.moves || []).map((m) => m.sku));
    for (const k of [...st.checked]) if (!live.has(k)) st.checked.delete(k);
  }

  function renderPlan() {
    const box = $("[data-fs-plan]");
    if (!st.options.length) { box.innerHTML = ""; return; }
    const p = st.plan;
    if (!p) { box.innerHTML = `<p class="fs-status">기준을 하나 이상 고르세요</p>`; return; }
    const all = [...p.moves, ...p.overflow];
    const lines = sheetLines(all.slice(0, LIST_MAX));
    const nCheck = st.checked.size;
    const head = FS_SHEET_COLUMNS.map((t, i) => `<th class="${i === 7 ? "to" : i === 3 || i === 8 ? "c" : ""}">${i === 8 ? `<input type="checkbox" data-fs-checkall title="모두 체크" ${all.length && all.every((m) => !m.to || st.checked.has(m.sku)) ? "checked" : ""}> 완료` : esc(t)}<span class="fs-rz" data-fs-rz="${i}"></span></th>`).join("");
    const row = (m) => m ? `<tr><td>${esc(m.sku)}</td><td title="${esc(m.product)}">${esc(m.product)}</td><td title="${esc(m.option)}">${esc(m.option)}</td><td class="c">${fmt(m.stock)}</td><td title="${esc(m.note)}">${esc(m.note)}</td><td title="${esc(m.memo)}">${esc(m.memo)}</td><td>${esc(m.from)}</td><td class="to">${m.to ? esc(m.to) : '<span class="fs-bad">자리 없음</span>'}</td><td class="c">${m.to ? `<input type="checkbox" data-fs-check="${esc(m.productCode)}" ${st.checked.has(m.sku) ? "checked" : ""}>` : ""}</td></tr>`
      : `<tr class="fs-blank"><td colspan="${FS_SHEET_COLUMNS.length}"></td></tr>`;
    box.innerHTML = `
      <div class="fs-row">
        <button type="button" class="fs-btn" data-fs-excel ${all.length ? "" : "disabled"}>📄 엑셀 다운로드</button>
        <label class="fs-drop" data-fs-drop title="완료(☑)를 고른 엑셀을 여기에 끌어다 놓거나 눌러서 고르기">📤 엑셀 업로드 <small>(끌어다 놓기)</small><input type="file" accept=".xlsx,.xlsm,.xls" data-fs-up hidden></label>
        <button type="button" class="fs-btn fs-btn-main" data-fs-save ${nCheck ? "" : "disabled"}>✓ 완료 저장${nCheck ? ` (${fmt(nCheck)})` : ""}</button>
        <span style="flex:1"></span>
        <button type="button" class="fs-btn" data-fs-csv title="V3에 저장된 완료 기록 중 옵션마다 최신 자사코드 → 셀피아 상품통합관리 자사코드 일괄 CSV (상품코드,자사코드 · 머리줄 없음)">⬇ 매칭엑셀다운로드 (CSV)</button>
        <span class="fs-status">${esc(st.savedNote)}</span>
      </div>
      ${lines.length ? `<div class="fs-scroll"><table class="fs-tbl is-list" style="width:${st.colW.reduce((a, x) => a + x, 0)}px"><colgroup>${st.colW.map((w) => `<col style="width:${w}px">`).join("")}</colgroup><thead><tr>${head}</tr></thead><tbody>
        ${lines.map(row).join("")}
      </tbody></table></div><div class="fs-grip" data-fs-grip title="끌어서 목록 높이 조절"></div>${all.length > LIST_MAX ? `<p class="fs-status">앞 ${LIST_MAX}줄만 보임 — 전체는 엑셀로</p>` : ""}` : `<p class="fs-status">해당 상품 없음</p>`}`;
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
    for (const b of root.querySelectorAll("[data-fs-only]")) b.classList.toggle("is-on", b.dataset.fsOnly ? st.only.has(b.dataset.fsOnly) : !st.only.size);
    for (const b of root.querySelectorAll("[data-fs-shelf]")) b.classList.toggle("is-on", b.dataset.fsShelf === st.shelf);
    for (const b of root.querySelectorAll("[data-fs-nset]")) b.classList.toggle("is-on", Number(b.dataset.fsNset) === st.n);
    for (const b of root.querySelectorAll("[data-fs-freed]")) b.classList.toggle("is-on", (b.dataset.fsFreed === "1") === st.onlyFreed);
    $("[data-fs-xxx]").classList.toggle("is-on", st.xxx);
    for (const b of root.querySelectorAll("[data-fs-xmode]")) b.classList.toggle("is-on", b.dataset.fsXmode === st.xxxMode);
    for (const b of root.querySelectorAll("[data-fs-limit]")) b.classList.toggle("is-on", Number(b.dataset.fsLimit) === st.limit);
    applySize();
    $("[data-fs-xxxrow]").hidden = !st.xxx;
    $("[data-fs-slow]").classList.toggle("is-on", st.slowOn);
    $("[data-fs-slowrow]").hidden = !st.slowOn;
    $("[data-fs-load]").disabled = st.loading;
    renderPlan();
    renderSuggest();
    if (st.options.length && !st.loading) {
      status(`${st.source} · 자사코드 ${fmt(st.options.length)}옵션 · XXX: ${st.xxNote}${st.applied ? ` · 완료 저장 반영 ${fmt(st.applied)}옵션` : ""}${st.slowOn ? ` · 출고: ${st.salesNote}` : ""}`, st.slowOn && !st.sales ? "is-bad" : "");
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
      const rows = await pagedRest(HUB_URL, "sellpia_stock_latest?select=sellpia_sku_code,sellpia_product_code,sellpia_product_name,sellpia_option_name,own_sku,stock&order=sellpia_sku_code.asc", hub, (n) => status(`셀피아 재고 불러오는 중… ${fmt(n)}줄`));
      let xxx = new Set();
      if (csToken()) {
        try {
          const js = await csPost({ action: "xxList" });
          const items = (js.items || []).filter((x) => x.mark === "XXX" || hasXxx(x.text));
          xxx = new Set(items.map((x) => String(x.sku)));
          st.xxNote = `${fmt(xxx.size)}옵션${js.at ? ` (${String(js.at).slice(5)} 올림)` : ""}`;
        } catch (error) { st.xxNote = `못 읽음 (${error.message})`; }
      } else st.xxNote = "CS 시트 연결 필요 (또는 📥 셀피아 엑셀)";
      st.raw = rows.filter((r) => String(r.own_sku || "").trim()).map((r) => ({
        sku: String(r.sellpia_sku_code || ""), productCode: String(r.sellpia_product_code || ""), product: String(r.sellpia_product_name || ""), option: String(r.sellpia_option_name || ""),
        ownSku: String(r.own_sku || "").trim(), stock: realStock(r.stock), virtual: isVirtualStock(r.stock), xxx: xxx.has(String(r.sellpia_sku_code || "")),
      }));
      st.source = "운영 허브";
      await Promise.all([loadSales(), loadSaved()]);
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
  // 11-27 DB1 PC LIST · DB2 AC-LIST (.xlsm) 그대로 — 여러 파일을 한 번에 · 파일마다 자사코드 머리줄이 있는 시트(Sheet1)를 찾음
  async function loadFile(fileOrList) {
    const files = [...(fileOrList?.length !== undefined && typeof fileOrList !== "string" ? fileOrList : [fileOrList])].filter(Boolean);
    if (!files.length || st.loading) return;
    st.loading = true; render(); status(`${files.map((f) => f.name).join(" · ")} 읽는 중…`);
    try {
      const XLSX = await loadSheetJs();
      const seen = new Set(), opts = [], names = [];
      for (const file of files) {
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        let got = [];
        for (const name of wb.SheetNames) {
          got = optionsFromRows(XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: "" }));
          if (got.length) break;
        }
        if (!got.length) throw new Error(`${file.name}: 머리줄에 상품코드 · 자사코드 칸이 있어야 합니다`);
        for (const o of got) if (!seen.has(o.sku)) { seen.add(o.sku); opts.push(o); }
        names.push(`${file.name.replace(/\.[^.]+$/, "")} ${fmt(got.length)}`);
      }
      st.raw = opts;
      st.source = names.join(" + ");
      await loadSaved();
      st.xxNote = `엑셀 ${c2(opts)} · 가상재고 ${fmt(opts.filter((o) => o.virtual).length)}옵션 (1000 단위 뺌)`;
      if (!st.sales) await loadSales();
      compute();
    } catch (error) {
      status(`엑셀을 읽지 못했습니다: ${error.message}`, "is-bad");
    } finally { st.loading = false; render(); }
  }

  const stamp = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(2, 16).replace(/[-T:]/g, "").replace(/^(\d{6})(\d{4})$/, "$1_$2");
  function download(data, name, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([data], { type }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }
  // 엑셀 다운로드: 화면 표 그대로 (상품 사이 빈 줄 · 완료 칸은 ☐/☑ 고르기 목록)
  function exportExcel() {
    const p = st.plan;
    if (!p) return;
    const moves = [...p.moves, ...p.overflow];
    const rows = sheetRows(moves, st.checked);
    const pick = rows.map((r, i) => (r[0] && r[7] !== "자리 없음" ? i : -1)).filter((i) => i >= 0);
    const bytes = buildXlsx({ sheetName: "자사코드 옮길 목록", columns: FS_SHEET_COLUMNS.map((title, i) => ({ title, width: Math.max(4, Math.round(st.colW[i] / 7)) })), rows, validations: [{ col: 8, rows: pick, values: [FS_TODO, FS_DONE] }] });
    download(bytes, `자사코드_옮길목록_${stamp()}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }
  // 완료 기록 (CS 시트 '자사코드이동' 탭)
  async function loadSaved() {
    if (!csToken()) { st.savedNote = "완료 기록: CS 시트 연결 필요"; return; }
    try {
      const js = await csPost({ action: "slotList" });
      if (js?.ok === false) throw new Error(js.error || "읽기 실패");
      st.saved = latestBySku(js.items || []);
      st.savedNote = `완료 기록 ${fmt(st.saved.size)}옵션`;
    } catch (error) { st.savedNote = `완료 기록 못 읽음 (${error.message})`; }
  }
  async function saveDone(items, how) {
    if (!items.length) { status(`${how}: 완료(☑) 표시한 줄이 없습니다`, "is-bad"); return; }
    status(`${how}: ${fmt(items.length)}옵션 저장 중…`);
    try {
      const js = await csPost({ action: "slotSave", items });
      if (js?.ok === false) throw new Error(js.error || "저장 실패");
      st.checked.clear();
      await loadSaved();
      compute(); render();
      status(`✓ ${how}: ${fmt(js.saved)}옵션 완료 저장 (${String(js.at || "").slice(5, 16)}) — [⬇ 매칭엑셀다운로드]로 셀피아에 올리세요`);
    } catch (error) { status(`${how} 실패: ${error.message}`, "is-bad"); }
  }
  function saveChecked() {
    const moves = (st.plan?.moves || []).filter((m) => st.checked.has(m.sku) && m.to);
    saveDone(moves.map((m) => ({ sku: m.sku, from: m.from, to: m.to, product: m.product, option: m.option })), "화면 체크");
  }
  async function uploadDone(file) {
    if (!file) return;
    status(`${file.name} 읽는 중…`);
    try {
      const XLSX = await loadSheetJs();
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      let items = [];
      for (const name of wb.SheetNames) {
        items = doneFromRows(XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: "" }));
        if (items.length) break;
      }
      await saveDone(items, file.name);
    } catch (error) { status(`엑셀 업로드 실패: ${error.message}`, "is-bad"); }
  }
  // 매칭엑셀다운로드: 저장된 기록 중 옵션마다 최신 자사코드 → 상품코드,자사코드 (머리줄 없음)
  async function exportCsv() {
    await loadSaved();
    if (!st.saved.size) { status(st.savedNote.includes("못") || st.savedNote.includes("필요") ? st.savedNote : "완료 저장한 기록이 없습니다", "is-bad"); render(); return; }
    download(matchingCsv(st.saved), `셀피아_자사코드_일괄_${stamp()}.csv`, "text/csv");
    status(`⬇ 매칭 CSV ${fmt(st.saved.size)}옵션 — 셀피아 상품통합관리 › 자사코드 일괄(CSV)에 올리세요`);
    render();
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
    else if (d.fsXmode) { st.xxxMode = d.fsXmode; refresh(); }
    else if (d.fsLimit !== undefined) { st.limit = Number(d.fsLimit); refresh(); }

    else if (d.fsDays) { st.days = Number(d.fsDays); refresh(); }
    else if (d.fsMaxq !== undefined) { st.maxQ = Number(d.fsMaxq); refresh(); }
    else if (d.fsOnly !== undefined) { if (!d.fsOnly) st.only.clear(); else if (st.only.has(d.fsOnly)) st.only.delete(d.fsOnly); else st.only.add(d.fsOnly); refresh(); }
    else if (d.fsN) { st.n = Math.max(1, Math.min(60, st.n + Number(d.fsN))); st.copied = ""; render(); }
    else if (d.fsNset) { st.n = Number(d.fsNset); st.copied = ""; render(); }
    else if (d.fsShelf !== undefined) { st.shelf = d.fsShelf; st.copied = ""; render(); }
    else if (d.fsFreed !== undefined) { st.onlyFreed = d.fsFreed === "1"; st.copied = ""; render(); }
    else if (d.fsExcel !== undefined) exportExcel();
    else if (d.fsSave !== undefined) saveChecked();
    else if (d.fsCsv !== undefined) exportCsv();
    else if (d.fsCopy !== undefined) copy(Number(d.fsCopy));
  });
  function applySize() {
    const w = $(".fs-wrap");
    w.style.setProperty("--g", `${st.gap}px`);
    w.style.setProperty("--fs-list", `${st.listH}px`);
    const r = $("[data-fs-gap]"); if (r && Number(r.value) !== st.gap) r.value = String(st.gap);
  }
  // 간격: 막대를 끌어서 (2~30px)
  root.querySelector("[data-fs-gap]").addEventListener("input", (e) => { st.gap = Number(e.target.value) || 14; applySize(); });
  root.querySelector("[data-fs-gap]").addEventListener("change", () => setNum(GAP_KEY, st.gap));
  // 목록 높이: 목록 아래 줄무늬를 위아래로 끌어서
  root.addEventListener("pointerdown", (e) => {
    const g = e.target.closest?.("[data-fs-grip]");
    if (!g) return;
    e.preventDefault();
    const y0 = e.clientY, h0 = st.listH;
    const move = (ev) => { st.listH = Math.min(1200, Math.max(120, h0 + ev.clientY - y0)); applySize(); };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); setNum(LIST_KEY, st.listH); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  });
  // 완료 체크: 상품(대표코드) 단위로 같이 · 머리줄 = 모두
  root.addEventListener("change", (e) => {
    const t = e.target;
    if (t.matches?.("[data-fs-up]")) { uploadDone(t.files?.[0]); t.value = ""; return; }
    const moves = (st.plan?.moves || []).filter((m) => m.to);
    if (t.matches?.("[data-fs-check]")) { for (const m of moves) if (m.productCode === t.dataset.fsCheck) { if (t.checked) st.checked.add(m.sku); else st.checked.delete(m.sku); } renderPlan(); }
    else if (t.matches?.("[data-fs-checkall]")) { if (t.checked) for (const m of moves) st.checked.add(m.sku); else st.checked.clear(); renderPlan(); }
  });
  // 엑셀 업로드: 끌어다 놓기
  root.addEventListener("dragover", (e) => { const z = e.target.closest?.("[data-fs-drop]"); if (!z) return; e.preventDefault(); z.classList.add("is-over"); });
  root.addEventListener("dragleave", (e) => { e.target.closest?.("[data-fs-drop]")?.classList.remove("is-over"); });
  root.addEventListener("drop", (e) => { const z = e.target.closest?.("[data-fs-drop]"); if (!z) return; e.preventDefault(); z.classList.remove("is-over"); uploadDone(e.dataTransfer?.files?.[0]); });
  // 칸 너비: 머리줄 칸 경계선을 좌우로 끌어서
  root.addEventListener("pointerdown", (e) => {
    const h = e.target.closest?.("[data-fs-rz]");
    if (!h) return;
    e.preventDefault(); e.stopPropagation();
    const i = Number(h.dataset.fsRz), x0 = e.clientX, w0 = st.colW[i];
    const tbl = h.closest("table"), col = tbl?.querySelectorAll("col")[i];
    h.classList.add("is-drag");
    const move = (ev) => { st.colW[i] = Math.max(30, Math.min(800, w0 + ev.clientX - x0)); if (col) col.style.width = `${st.colW[i]}px`; if (tbl) tbl.style.width = `${st.colW.reduce((a, x) => a + x, 0)}px`; };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); h.classList.remove("is-drag"); for (const s of storages) { try { s?.setItem?.(COLS_KEY, JSON.stringify(st.colW)); } catch { /* 없음 */ } } };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  });
  root.querySelector("[data-fs-file]").addEventListener("change", (e) => { loadFile([...(e.target.files || [])]); e.target.value = ""; });

  render();
  status("[⟳ 불러오기] 를 누르세요");
  return { state: st, load, loadFile, render, setOptions: (opts, source = "견본") => { st.raw = opts; st.options = opts; st.source = source; st.xxNote = `${fmt(opts.filter((o) => o.xxx).length)}옵션`; compute(); render(); } };
}

// 셀피아 엑셀 표(행 배열) → 옵션 목록 — 머리줄(앞 6줄 안)의 상품코드 · 자사코드 · 재고 · 임의필드 · 상품명 · 옵션명 칸
const c2 = (opts) => `전달사항·임의필드 둘 다 ${fmt(opts.filter((o) => hasXxx(o.note) && hasXxx(o.memo)).length)}옵션 · 둘 중 하나 ${fmt(opts.filter((o) => hasXxx(o.note) || hasXxx(o.memo)).length)}옵션`;
export function optionsFromRows(rows = []) {
  const headAt = rows.slice(0, 6).findIndex((r) => (r || []).some((c) => String(c ?? "").replace(/\s+/g, "") === "자사코드"));
  if (headAt < 0) return [];
  const head = rows[headAt].map((c) => String(c ?? "").replace(/\s+/g, ""));
  const at = (name) => head.indexOf(name);
  const c = { sku: at("상품코드"), own: at("자사코드"), stock: at("재고"), memo: at("임의필드"), note: at("전달사항"), product: at("상품명"), option: at("옵션명") };
  if (c.sku < 0 || c.own < 0) return [];
  const out = [];
  for (const r of rows.slice(headAt + 1)) {
    const own = String(r?.[c.own] ?? "").trim();
    const sku = String(r?.[c.sku] ?? "").trim();
    if (!own || !sku) continue;
    const memo = c.memo >= 0 ? String(r[c.memo] ?? "") : undefined;
    const note = c.note >= 0 ? String(r[c.note] ?? "") : undefined;
    const raw = Number(String(r?.[c.stock] ?? "").replace(/[^\d.-]/g, "")) || 0;   // 11-27 가상재고(500 이상)는 1000 단위를 빼고
    out.push({ sku, ownSku: own, stock: realStock(raw), virtual: isVirtualStock(raw), memo, note, xxx: hasXxx(memo) && (note === undefined || hasXxx(note)), product: c.product >= 0 ? String(r[c.product] ?? "") : "", option: c.option >= 0 ? String(r[c.option] ?? "") : "" });
  }
  return out;
}
