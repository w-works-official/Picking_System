// 🗄 자사코드 자리 정리 · 신상품 자리 추천 (2026-11-27) — 계산만 (화면 없음, 어디에도 쓰지 않음)
//  · 대표님 11-27: 피어싱 매대(A~T)에서 단종·삭제(임의필드 XXX) · 판매부진 상품을 빼서
//    그 코드의 아랫칸(짝수 알파벳 B·D·F…) 30열 서랍으로 옮기고, 비운 위 칸에 신상품을 최대한 붙여서 배치
//  · 자사코드 = 매대-행-열 (예: [P] A-04-13 ]). 1~25행 = 위 칸. 26~30열(가운데 번호) = 짝수 알파벳의 서랍
//  · 서랍 열 하나 = 서랍 10개 × 서랍당 10케이스(5칸 × 2케이스) = 100자리 → [P] B-30-01_1 ] ~ [P] B-30-10_10 ] (모든 아랫칸 매대에 30열)
//  · 1자리 = 1케이스(박스) = 뺄 상품 1개 (옵션 20개 이상이면 2박스, 20개마다 1박스 추가) — 옵션과 1:1 이 아님
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

// 정리 계획 (11-27 대표님): 뺄 옵션을 "상품" 단위로 모아 박스에 넣고, 박스 하나 = 30열 서랍 1자리(1케이스)
//  · 박스 수 = 옵션 20개 미만 1박스 · 20개 이상 2박스 · 40개 이상 3박스 … (20개당 1박스 추가) · 박스가 여럿이면 옵션을 고르게 나눔 (코드 순서대로)
//  · 같은 박스의 옵션은 모두 같은 자사코드 ([P] B-30-01_1 ])
//  · 옮길 매대 = 그 상품이 있던 매대의 아랫칸. 여러 매대에 흩어진 상품은 30열이 덜 찬 아랫칸
//  · 위 칸은 칸 안 옵션이 모두 뺄 대상일 때만 비움 (일부만 해당하는 칸의 옵션은 그대로 둠)
//  반환 { moves: [{ sku, productCode, product, option, stock, from, to, toKey, box, reason, cell, lower }], vacated: Set(cellKey),
//         partial: [{ key, shelf, row, col, hit, total }], overflow: [...to 없는 moves], byShelf: { B: { cells, products, boxes, options, overflow, left } } }
export const FS_BOX_MAX = 20;
export const productOf = (o) => String(o.productCode || String(o.sku || "").replace(/-\d+$/, ""));
export function splitEven(list = [], boxes = 1) {
  const out = [];
  const base = Math.floor(list.length / boxes), extra = list.length % boxes;
  let at = 0;
  for (let i = 0; i < boxes; i++) { const n = base + (i < extra ? 1 : 0); out.push(list.slice(at, at + n)); at += n; }
  return out;
}
export function planRetire(options = [], rule = {}, { salesOf = () => 0, shelves = FS_SHELVES, maxRow = FS_UPPER_MAX_ROW, drawer = FS_DRAWER, prefix = FS_PREFIX, only = "", boxMax = FS_BOX_MAX } = {}) {
  const idx = indexOptions(options, { shelves, maxRow, drawer });
  const used = new Set(idx.drawerUsed);
  const total = drawer.cols.length * drawer.drawers * drawer.slots;
  const slotKey = (lower, i) => {
    const c = drawer.cols[Math.floor(i / (drawer.drawers * drawer.slots))];
    const rest = i % (drawer.drawers * drawer.slots);
    return { c, d: Math.floor(rest / drawer.slots) + 1, s: (rest % drawer.slots) + 1, key: "" };
  };
  const keyOf = (lower, x) => `${lower}-${x.c}-${x.d}-${x.s}`;
  const usedCount = (lower) => { let n = 0; for (let i = 0; i < total; i++) if (used.has(keyOf(lower, slotKey(lower, i)))) n++; return n; };
  const fill = {};                                     // 아랫칸 매대 → 쓴 자리 수 (덜 찬 매대 고르기)
  for (const s of shelves) { const l = lowerShelf(s); if (l && fill[l] == null) fill[l] = usedCount(l); }
  function takeSlot(lower) {
    for (let i = 0; i < total; i++) {
      const x = slotKey(lower, i); const key = keyOf(lower, x);
      if (used.has(key)) continue;
      used.add(key); fill[lower] = (fill[lower] || 0) + 1;
      return { code: drawerCode(lower, x.c, x.d, x.s, prefix), key };
    }
    return null;
  }
  const sorted = [...idx.cells.values()].sort((a, b) => shelfOrder(a.shelf) - shelfOrder(b.shelf) || a.row - b.row || a.col - b.col);
  const partial = [], vacated = new Set(), byShelf = {};
  const prods = new Map();                             // 상품코드 → { items: [{ o, reason, cell }], first }
  for (const cell of sorted) {
    if (only && cell.shelf !== only && lowerShelf(cell.shelf) !== only) continue;
    const reasons = cell.options.map((o) => retireReason(o, rule, salesOf));
    const hit = reasons.filter(Boolean).length;
    if (!hit) continue;
    if (hit < cell.options.length) { partial.push({ key: cell.key, shelf: cell.shelf, row: cell.row, col: cell.col, hit, total: cell.options.length }); continue; }
    vacated.add(cell.key);
    const b = (byShelf[lowerShelf(cell.shelf)] ||= { cells: 0, products: 0, boxes: 0, options: 0, overflow: 0, left: 0 });
    b.cells++;
    cell.options.forEach((o, i) => {
      const pc = productOf(o);
      if (!prods.has(pc)) prods.set(pc, { items: [] });
      prods.get(pc).items.push({ o, reason: reasons[i], cell });
    });
  }
  const moves = [], overflow = [];
  for (const [pc, g] of prods) {
    const count = {};
    for (const it of g.items) { const l = lowerShelf(it.cell.shelf); count[l] = (count[l] || 0) + 1; }
    const cands = Object.keys(count);
    const lower = cands.length === 1 ? cands[0] : cands.sort((a, z) => (fill[a] || 0) - (fill[z] || 0) || count[z] - count[a] || a.localeCompare(z))[0];
    const items = [...g.items].sort((a, z) => String(a.o.sku).localeCompare(String(z.o.sku), "en", { numeric: true }));
    const nBox = Math.floor(items.length / boxMax) + 1;          // 20개 미만 1박스 · 20개 이상 2박스 · 40개 이상 3박스 …
    const b = (byShelf[lower] ||= { cells: 0, products: 0, boxes: 0, options: 0, overflow: 0, left: 0 });
    b.products++;
    splitEven(items, nBox).forEach((part, bi) => {
      const slot = takeSlot(lower);
      if (slot) b.boxes++;
      for (const it of part) {
        const mv = { sku: it.o.sku, productCode: pc, product: it.o.product || "", option: it.o.option || "", stock: num(it.o.stock), from: it.o.ownSku, to: slot?.code || "", toKey: slot?.key || "", box: `${bi + 1}/${nBox}`, reason: it.reason, cell: it.cell.key, lower };
        b.options++;
        if (slot) moves.push(mv); else { overflow.push(mv); b.overflow++; }
      }
    });
  }
  for (const [lower, b] of Object.entries(byShelf)) b.left = total - (fill[lower] || 0);
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
export const FS_MOVE_COLUMNS = ["셀피아 코드", "상품명", "옵션명", "재고", "지금 자사코드", "옮길 자사코드", "박스", "이유"];
export function moveRows(plan) {
  return [...plan.moves, ...plan.overflow].map((m) => [m.sku, m.product, m.option, m.stock, m.from, m.to || "자리 없음", m.box, m.reason]);
}
