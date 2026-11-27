// 🗄 자사코드 자리 정리 · 신상품 자리 추천 (2026-11-27) — 계산만 (화면 없음, 어디에도 쓰지 않음)
//  · 대표님 11-27: 피어싱 매대(A~T)에서 단종·삭제(임의필드 XXX) · 판매부진 상품을 빼서
//    그 코드의 아랫칸(짝수 알파벳 B·D·F…) 30열 서랍으로 옮기고, 비운 위 칸에 신상품을 최대한 붙여서 배치
//  · 자사코드 = 매대-행-열 (예: [P] A-04-13 ]). 1~25행 = 위 칸. 26~30열(가운데 번호) = 짝수 알파벳의 서랍
//  · 서랍 열 하나 = 서랍 10개 × 서랍당 10케이스(5칸 × 2케이스) = 100자리 → [P] B-30-01_1 ] ~ [P] B-30-10_10 ] (모든 아랫칸 매대에 30열)
//  · 1자리 = 1케이스(박스) = 뺄 상품 1개 (옵션 20개 이상이면 2박스, 20개마다 1박스 추가) — 옵션과 1:1 이 아님
//  · 대표코드(1234-11 의 1234)가 같은 상품은 옵션 전부 같이 움직임
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

// 옵션의 XXX 표시 (11-27 대표님: 전달사항 · 임의필드 모두에 XXX)
//  mode "both" = 두 칸 모두 · "either" = 둘 중 하나. 칸 글이 없으면(허브 + XX표시 탭) o.xxx 그대로
export function optionXxx(o, mode = "both") {
  const fields = [o.note, o.memo].filter((v) => v != null);   // 있는 칸만 (엑셀에 전달사항 칸이 없으면 임의필드만)
  if (!fields.length) return Boolean(o.xxx);
  const hits = fields.map((v) => hasXxx(v));
  return mode === "either" ? hits.some(Boolean) : hits.every(Boolean);
}

// 상품 하나의 뺄 이유 (없으면 "") — 상품 단위 (11-27: 대표코드가 같은 상품은 무조건 같이 움직임)
//  · 단종·삭제: 상품의 모든 옵션이 XXX · 판매부진: 상품 전체 출고 합계가 기간 안에 max 개 이하
//  rule: { xxx: true, xxxMode: "both"|"either", slow: { days, max } | null } · salesOf(sku, days) → 옵션 기간 출고 수량
export function productReason(opts = [], rule = {}, salesOf = () => 0) {
  const out = [];
  if (rule.xxx && opts.length && opts.every((o) => optionXxx(o, rule.xxxMode || "both"))) out.push("단종·삭제");
  if (rule.slow && rule.slow.days > 0) {
    const q = opts.reduce((a, o) => a + num(salesOf(o.sku, rule.slow.days)), 0);
    if (q <= num(rule.slow.max)) out.push(`판매부진 ${rule.slow.days}일 ${q}개`);
  }
  return out.join(" · ");
}
// (옵션 하나 — 예전 호환)
export function retireReason(o, rule = {}, salesOf = () => 0) { return productReason([o], rule, salesOf); }

// 정리 계획 (11-27 대표님): 뺄 "상품"을 박스에 담아 아랫칸 30열 서랍으로. 박스 하나 = 30열 서랍 1자리(1케이스)
//  · 셀피아 코드 = 대표코드-옵션코드 (1234-11) — 대표코드가 같은 상품은 옵션 전부 같이 움직임 (옵션 단위로 빠지지 않음)
//  · 상품의 옵션이 피어싱 매대 위 칸(A~T 1~25행) 밖에도 있으면 옮기지 않고 '다른 자리 있음'으로 둠
//  · 박스 수 = 옵션 20개 미만 1박스 · 20개 이상 2박스 · 40개 이상 3박스 … · 박스가 여럿이면 옵션을 고르게 나눔 (코드 순서대로)
//  · 같은 박스의 옵션은 모두 같은 자사코드 ([P] B-30-01_1 ])
//  · 옮길 매대 = 그 상품이 있던 매대의 아랫칸. 여러 매대에 흩어진 상품은 30열이 덜 찬 아랫칸
//  · 위 칸은 칸 안 옵션이 모두 옮겨질 때만 비움 (다른 상품과 같이 쓰는 칸은 남음)
//  · limit = 한 번에 찾을 상품 수 (위 칸 순서대로 앞에서부터) — 0 이면 전체
//  반환 { moves, vacated: Set(cellKey), shared: [cellKey…] (옮기지만 다른 상품이 남는 칸), elsewhere: [상품코드…],
//         found: 조건에 맞는 상품 수(제한 전), overflow, byShelf: { B: { cells, products, boxes, options, overflow, left } } }
export const FS_BOX_MAX = 20;
export const productOf = (o) => String(o.productCode || String(o.sku || "").replace(/-\d+$/, ""));
export function splitEven(list = [], boxes = 1) {
  const out = [];
  const base = Math.floor(list.length / boxes), extra = list.length % boxes;
  let at = 0;
  for (let i = 0; i < boxes; i++) { const n = base + (i < extra ? 1 : 0); out.push(list.slice(at, at + n)); at += n; }
  return out;
}
export function planRetire(options = [], rule = {}, { salesOf = () => 0, shelves = FS_SHELVES, maxRow = FS_UPPER_MAX_ROW, drawer = FS_DRAWER, prefix = FS_PREFIX, only = "", boxMax = FS_BOX_MAX, limit = 0 } = {}) {
  const idx = indexOptions(options, { shelves, maxRow, drawer });
  const used = new Set(idx.drawerUsed);
  const total = drawer.cols.length * drawer.drawers * drawer.slots;
  const slotAt = (i) => {
    const c = drawer.cols[Math.floor(i / (drawer.drawers * drawer.slots))];
    const rest = i % (drawer.drawers * drawer.slots);
    return { c, d: Math.floor(rest / drawer.slots) + 1, s: (rest % drawer.slots) + 1 };
  };
  const keyOf = (lower, x) => `${lower}-${x.c}-${x.d}-${x.s}`;
  const fill = {};                                     // 아랫칸 매대 → 쓴 자리 수 (덜 찬 매대 고르기)
  for (const s of shelves) {
    const l = lowerShelf(s);
    if (!l || fill[l] != null) continue;
    let n = 0; for (let i = 0; i < total; i++) if (used.has(keyOf(l, slotAt(i)))) n++;
    fill[l] = n;
  }
  function takeSlot(lower) {
    for (let i = 0; i < total; i++) {
      const x = slotAt(i); const key = keyOf(lower, x);
      if (used.has(key)) continue;
      used.add(key); fill[lower] = (fill[lower] || 0) + 1;
      return { code: drawerCode(lower, x.c, x.d, x.s, prefix), key };
    }
    return null;
  }
  // 상품별 옵션 (자사코드가 있는 옵션 전부) · 위 칸에 있는 옵션의 칸
  const prods = new Map();   // 상품코드 → { opts: [], cells: [], outside: bool, first }
  const rank = (c) => shelfOrder(c.shelf) * 10000 + c.row * 100 + c.col;
  for (const o of options) {
    if (!String(o.ownSku || "").trim()) continue;
    const pc = productOf(o);
    if (!prods.has(pc)) prods.set(pc, { opts: [], cells: [], outside: false, first: Infinity });
    const g = prods.get(pc);
    g.opts.push(o);
    const p = parseOwn(o.ownSku);
    if (!p || !shelves.includes(p.shelf) || p.row > maxRow) { g.outside = true; continue; }
    const cell = idx.cells.get(cellKey(p));
    g.cells.push({ o, cell });
    g.first = Math.min(g.first, rank(cell));
  }
  const elsewhere = [], picked = [];
  for (const [pc, g] of [...prods].sort((a, b) => a[1].first - b[1].first)) {
    if (!g.cells.length) continue;
    if (only && !g.cells.some((x) => x.cell.shelf === only || lowerShelf(x.cell.shelf) === only)) continue;
    const reason = productReason(g.opts, rule, salesOf);
    if (!reason) continue;
    if (g.outside) { elsewhere.push(pc); continue; }
    picked.push({ pc, g, reason });
  }
  const found = picked.length;
  const chosen = limit > 0 ? picked.slice(0, limit) : picked;
  const moving = new Set(chosen.flatMap((x) => x.g.opts));
  const vacated = new Set(), shared = new Set(), byShelf = {};
  const box = (l) => (byShelf[l] ||= { cells: 0, products: 0, boxes: 0, options: 0, overflow: 0, left: 0 });
  for (const x of chosen) for (const { cell } of x.g.cells) {
    if (vacated.has(cell.key) || shared.has(cell.key)) continue;
    if (cell.options.every((o) => moving.has(o))) { vacated.add(cell.key); box(lowerShelf(cell.shelf)).cells++; }
    else shared.add(cell.key);
  }
  const moves = [], overflow = [];
  for (const { pc, g, reason } of chosen) {
    const count = {};
    for (const { cell } of g.cells) { const l = lowerShelf(cell.shelf); count[l] = (count[l] || 0) + 1; }
    const cands = Object.keys(count);
    const lower = cands.length === 1 ? cands[0] : cands.sort((a, z) => (fill[a] || 0) - (fill[z] || 0) || count[z] - count[a] || a.localeCompare(z))[0];
    const items = [...g.cells].sort((a, z) => String(a.o.sku).localeCompare(String(z.o.sku), "en", { numeric: true }));
    const nBox = Math.floor(items.length / boxMax) + 1;          // 20개 미만 1박스 · 20개 이상 2박스 · 40개 이상 3박스 …
    const b = box(lower);
    b.products++;
    splitEven(items, nBox).forEach((part, bi) => {
      const slot = takeSlot(lower);
      if (slot) b.boxes++;
      for (const it of part) {
        const mv = { sku: it.o.sku, productCode: pc, product: it.o.product || "", option: it.o.option || "", stock: num(it.o.stock), from: it.o.ownSku, to: slot?.code || "", toKey: slot?.key || "", box: `${bi + 1}/${nBox}`, reason, cell: it.cell.key, lower };
        b.options++;
        if (slot) moves.push(mv); else { overflow.push(mv); b.overflow++; }
      }
    });
  }
  for (const [lower, b] of Object.entries(byShelf)) b.left = total - (fill[lower] || 0);
  return { moves, vacated, shared: [...shared], elsewhere, found, overflow, byShelf, partial: [...shared] };
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
