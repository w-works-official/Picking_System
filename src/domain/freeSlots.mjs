// 🗄 자사코드 자리 정리 · 신상품 자리 추천 (2026-11-27) — 계산만 (화면 없음, 어디에도 쓰지 않음)
//  · 대표님 11-27: 피어싱 매대(A~T)에서 단종·삭제(임의필드 XXX) · 판매부진 상품을 빼서
//    그 코드의 아랫칸(짝수 알파벳 B·D·F…) 30열 서랍으로 옮기고, 비운 위 칸에 신상품을 최대한 붙여서 배치
//  · 자사코드 = 매대-행-열 (예: [P] A-04-13 ]). 1~25행 = 위 칸. 26~30열(가운데 번호) = 짝수 알파벳의 서랍
//  · 서랍 열 하나 = 서랍 10개 × 서랍당 10자리(5칸 × 2케이스) = 100자리 → [P] B-30-01_1 ] ~ [P] B-30-10_10 ]
//  · 한 칸(매대-행-열)에 옵션이 여러 개면, 그 칸 옵션이 모두 뺄 대상일 때만 칸을 비운 것으로 봄

const RX_OWN = /([A-Z]{1,3})\s*-\s*(\d{1,2})\s*-\s*(\d{1,2})(?:\s*[_-]\s*(\d{1,2}))?/;
const RX_XXX = /(?<![A-Za-z])[Xx]{3}(?![A-Za-z])/;
export const FS_SHELVES = "ABCDEFGHIJKLMNOPQRST".split("");   // 피어싱 매대
export const FS_UPPER_MAX_ROW = 25;                                // 1~25행 = 위 칸
export const FS_DRAWER = { cols: [30], drawers: 10, slots: 10 };   // 30열 · 서랍 10개 · 서랍당 10자리
export const FS_PREFIX = "[P] ";

const pad2 = (n) => String(n).padStart(2, "0");
const num = (v) => { const n = Number(String(v ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : 0; };
const shelfOrder = (s) => FS_SHELVES.indexOf(s);

// 자사코드 글 → { shelf, row, col, sub } (못 읽으면 null). 행·열은 정수 (A-04-17 = A-4-17), _1 · -1 = 칸 안 번호
export function parseOwn(text) {
  const m = RX_OWN.exec(String(text ?? "").toUpperCase());
  if (!m) return null;
  return { shelf: m[1], row: Number(m[2]), col: Number(m[3]), sub: m[4] ? Number(m[4]) : 0 };
}
export const cellKey = (p) => `${p.shelf}-${p.row}-${p.col}`;
export const upperCode = (shelf, row, col, prefix = FS_PREFIX) => `${prefix}${shelf}-${pad2(row)}-${pad2(col)} ]`;
export const drawerCode = (shelf, col, drawer, slot, prefix = FS_PREFIX) => `${prefix}${shelf}-${col}-${pad2(drawer)}_${slot} ]`;
export const hasXxx = (...values) => values.some((v) => RX_XXX.test(String(v ?? "")));

// 아랫칸 매대: 홀수 번째 알파벳(A·C·E…) → 바로 다음 짝수(B·D·F…), 짝수는 그대로
export function lowerShelf(shelf) {
  const i = FS_SHELVES.indexOf(shelf);
  if (i < 0) return "";
  return i % 2 === 0 ? FS_SHELVES[i + 1] || "" : shelf;
}

// 옵션들 → 위 칸(1~25행)별 묶음 · 서랍 자리 사용 현황
//  options: [{ sku, ownSku, ... }] — 피어싱 매대(A~T)만 봄
export function indexOptions(options = [], { shelves = FS_SHELVES, maxRow = FS_UPPER_MAX_ROW, drawer = FS_DRAWER } = {}) {
  const cells = new Map();        // 'A-4-13' → { shelf,row,col, options: [] }
  const drawerUsed = new Set();   // 'B-30-1-1'
  const colMax = {};              // 매대별 위 칸 최대 열 · 최대 행
  const rowMax = {};
  for (const o of options) {
    const p = parseOwn(o.ownSku);
    if (!p || !shelves.includes(p.shelf)) continue;
    if (p.row <= maxRow) {
      const k = cellKey(p);
      if (!cells.has(k)) cells.set(k, { shelf: p.shelf, row: p.row, col: p.col, key: k, options: [] });
      cells.get(k).options.push(o);
      colMax[p.shelf] = Math.max(colMax[p.shelf] || 0, p.col);
      rowMax[p.shelf] = Math.max(rowMax[p.shelf] || 0, p.row);
    } else if (drawer.cols.includes(p.row)) {
      drawerUsed.add(`${p.shelf}-${p.row}-${p.col}-${p.sub || 1}`);
    }
  }
  return { cells, drawerUsed, colMax, rowMax };
}

// 옵션 하나의 뺄 이유 (없으면 "")
//  rule: { xxx: true, slow: { days, max } | null } · salesOf(sku, days) → 기간 출고 수량
export function retireReason(o, rule = {}, salesOf = () => 0) {
  const out = [];
  if (rule.xxx && (o.xxx || hasXxx(o.memo))) out.push("단종·삭제");
  if (rule.slow && rule.slow.days > 0) {
    const q = num(salesOf(o.sku, rule.slow.days));
    if (q <= num(rule.slow.max)) out.push(`판매부진 ${rule.slow.days}일 ${q}개`);
  }
  return out.join(" · ");
}

// 정리 계획: 비울 칸 · 옮길 옵션 → 아랫칸 서랍 자리
//  반환 { moves: [{ sku, product, option, from, to, toKey, reason, cell, lower }], vacated: Set(cellKey),
//         partial: [{ key, shelf, row, col, hit, total }], overflow: [...moves without to], byShelf: { B: { cells, options, overflow, left } } }
export function planRetire(options = [], rule = {}, { salesOf = () => 0, shelves = FS_SHELVES, maxRow = FS_UPPER_MAX_ROW, drawer = FS_DRAWER, prefix = FS_PREFIX, only = "" } = {}) {
  const idx = indexOptions(options, { shelves, maxRow, drawer });
  const used = new Set(idx.drawerUsed);
  const sorted = [...idx.cells.values()].sort((a, b) => shelfOrder(a.shelf) - shelfOrder(b.shelf) || a.row - b.row || a.col - b.col);
  const moves = [], partial = [], overflow = [], vacated = new Set(), byShelf = {};
  const nextSlot = new Map();   // 아랫칸 매대 → 다음에 볼 자리 번호(0부터)
  const total = drawer.cols.length * drawer.drawers * drawer.slots;
  function takeSlot(lower) {
    for (let i = nextSlot.get(lower) || 0; i < total; i++) {
      const c = drawer.cols[Math.floor(i / (drawer.drawers * drawer.slots))];
      const rest = i % (drawer.drawers * drawer.slots);
      const d = Math.floor(rest / drawer.slots) + 1, s = (rest % drawer.slots) + 1;
      const key = `${lower}-${c}-${d}-${s}`;
      if (used.has(key)) continue;
      used.add(key); nextSlot.set(lower, i + 1);
      return { code: drawerCode(lower, c, d, s, prefix), key };
    }
    nextSlot.set(lower, total);
    return null;
  }
  for (const cell of sorted) {
    if (only && cell.shelf !== only && lowerShelf(cell.shelf) !== only) continue;
    const reasons = cell.options.map((o) => retireReason(o, rule, salesOf));
    const hit = reasons.filter(Boolean).length;
    if (!hit) continue;
    if (hit < cell.options.length) { partial.push({ key: cell.key, shelf: cell.shelf, row: cell.row, col: cell.col, hit, total: cell.options.length }); continue; }
    const lower = lowerShelf(cell.shelf);
    const b = (byShelf[lower] ||= { cells: 0, options: 0, overflow: 0, left: 0 });
    b.cells++;
    vacated.add(cell.key);
    const opts = [...cell.options].sort((a, z) => String(a.sku).localeCompare(String(z.sku), "en", { numeric: true }));
    opts.forEach((o, i) => {
      const slot = takeSlot(lower);
      const mv = { sku: o.sku, product: o.product || "", option: o.option || "", stock: num(o.stock), from: o.ownSku, to: slot?.code || "", toKey: slot?.key || "", reason: reasons[cell.options.indexOf(o)] || reasons[i], cell: cell.key, lower };
      b.options++;
      if (slot) moves.push(mv); else { overflow.push(mv); b.overflow++; }
    });
  }
  for (const [lower, b] of Object.entries(byShelf)) {
    let free = 0;
    for (const c of drawer.cols) for (let d = 1; d <= drawer.drawers; d++) for (let s = 1; s <= drawer.slots; s++) if (!used.has(`${lower}-${c}-${d}-${s}`)) free++;
    b.left = free;
  }
  return { moves, vacated, partial, overflow, byShelf };
}

// 위 칸 빈자리: 매대마다 1~(쓰인 최대 행) × 1~(쓰인 최대 열) 안에서 자사코드가 없는 칸 (+ 정리로 비울 칸)
//  반환 [{ shelf, row, col, key, freed }] — freed = 정리로 비운 칸
export function freeCells(options = [], { vacated = new Set(), shelves = FS_SHELVES, maxRow = FS_UPPER_MAX_ROW, size = null } = {}) {
  const idx = indexOptions(options, { shelves, maxRow });
  const out = [];
  for (const shelf of shelves) {
    const rows = Math.min(maxRow, size?.[shelf]?.rows || idx.rowMax[shelf] || 0);
    const cols = size?.[shelf]?.cols || idx.colMax[shelf] || 0;
    for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) {
      const key = `${shelf}-${r}-${c}`;
      const busy = idx.cells.has(key);
      if (!busy || vacated.has(key)) out.push({ shelf, row: r, col: c, key, freed: busy });
    }
  }
  return out;
}

// 신상품 옵션 n개 → 최대한 붙은 자리 추천 (최대 limit 개 안)
//  1순위: 한 줄(같은 매대·같은 행)에 연속으로 n칸 — 남는 칸이 적은 줄 먼저 (큰 빈 줄은 아껴 둠)
//  2순위: 같은 매대 안에서 행·열 순서로 가장 가깝게 모인 n칸
export function suggestSlots(free = [], n = 1, { shelf = "", limit = 3, prefix = FS_PREFIX } = {}) {
  n = Math.max(1, Math.floor(num(n)) || 1);
  const list = free.filter((f) => !shelf || f.shelf === shelf)
    .sort((a, b) => shelfOrder(a.shelf) - shelfOrder(b.shelf) || a.row - b.row || a.col - b.col);
  const runs = [];
  let cur = null;
  for (const f of list) {
    if (cur && cur.shelf === f.shelf && cur.row === f.row && cur.cells.at(-1).col === f.col - 1) cur.cells.push(f);
    else { cur = { shelf: f.shelf, row: f.row, cells: [f] }; runs.push(cur); }
  }
  const pick = [];
  for (const r of runs) if (r.cells.length >= n) pick.push({ kind: "line", spare: r.cells.length - n, cells: r.cells.slice(0, n) });
  pick.sort((a, b) => a.spare - b.spare || shelfOrder(a.cells[0].shelf) - shelfOrder(b.cells[0].shelf) || a.cells[0].row - b.cells[0].row || a.cells[0].col - b.cells[0].col);
  if (pick.length < limit) {
    const near = [];
    const byShelf = new Map();
    for (const f of list) { if (!byShelf.has(f.shelf)) byShelf.set(f.shelf, []); byShelf.get(f.shelf).push(f); }
    for (const cells of byShelf.values()) {
      if (cells.length < n) continue;
      const wins = [];
      for (let i = 0; i + n <= cells.length; i++) {
        const w = cells.slice(i, i + n);
        const rows = w.at(-1).row - w[0].row;
        const cols = Math.max(...w.map((x) => x.col)) - Math.min(...w.map((x) => x.col));
        wins.push({ cost: rows * 100 + cols, i, cells: w });
      }
      wins.sort((a, b) => a.cost - b.cost || a.i - b.i);
      const taken = new Set(pick.flatMap((p) => p.cells.map((c) => c.key)));
      let k = 0;
      for (const w of wins) {                     // 매대마다 겹치지 않는 가까운 묶음 limit 개까지
        if (k >= limit) break;
        if (w.cells.some((c) => taken.has(c.key))) continue;
        w.cells.forEach((c) => taken.add(c.key));
        near.push({ kind: "near", spare: w.cost, cells: w.cells }); k++;
      }
    }
    near.sort((a, b) => a.spare - b.spare);
    pick.push(...near);
  }
  return pick.slice(0, limit).map((p) => ({
    kind: p.kind,
    shelf: p.cells[0].shelf,
    label: slotLabel(p.cells),
    freed: p.cells.filter((c) => c.freed).length,
    codes: p.cells.map((c) => upperCode(c.shelf, c.row, c.col, prefix)),
  }));
}

// 'A-04-10~13' · 여러 줄이면 'A-04-20 ~ A-05-02'
export function slotLabel(cells = []) {
  if (!cells.length) return "";
  const a = cells[0], z = cells.at(-1);
  const one = (c) => `${c.shelf}-${pad2(c.row)}-${pad2(c.col)}`;
  if (cells.length === 1) return one(a);
  if (a.row === z.row && cells.every((c, i) => !i || c.col === cells[i - 1].col + 1)) return `${one(a)}~${pad2(z.col)}`;
  return `${one(a)} ~ ${one(z)}`;
}

// 매대별 요약: 위 칸 쓰는 칸 · 빈 칸(원래) · 정리로 비울 칸
export function shelfSummary(free = [], options = [], { shelves = FS_SHELVES, maxRow = FS_UPPER_MAX_ROW } = {}) {
  const idx = indexOptions(options, { shelves, maxRow });
  const out = [];
  for (const s of shelves) {
    const used = [...idx.cells.values()].filter((c) => c.shelf === s).length;
    const f = free.filter((x) => x.shelf === s);
    out.push({ shelf: s, used, empty: f.filter((x) => !x.freed).length, freed: f.filter((x) => x.freed).length, rows: idx.rowMax[s] || 0, cols: idx.colMax[s] || 0 });
  }
  return out;
}

// 엑셀용 줄: 옮길 옵션 목록
export const FS_MOVE_COLUMNS = ["셀피아 코드", "상품명", "옵션명", "재고", "지금 자사코드", "옮길 자사코드", "이유"];
export function moveRows(plan) {
  return [...plan.moves, ...plan.overflow].map((m) => [m.sku, m.product, m.option, m.stock, m.from, m.to || "자리 없음", m.reason]);
}
