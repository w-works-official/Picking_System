// 가상재고 (2026-11-27 사장님 규칙) — 가상재고는 1000 단위로 관리
//  · 11-27 13:26 기준 900 → 500 (주문 100개짜리도 있어서)
//  · 재고 500 이상 = 가상재고 → 가까운 1000 단위를 빼고 계산 (1175 → 175 · 981 → -19 · 600 → -400 · 2003 → 3 · 10000 → 0)
//  · 500 미만(1 · 5 · 50 · 100 · 300 …)은 실제 재고 → 그대로
export const VIRTUAL_UNIT = 1000;
export const VIRTUAL_FROM = 500;

export function isVirtualStock(n) {
  return (Number(n) || 0) >= VIRTUAL_FROM;
}

export function realStock(n) {
  const v = Number(n) || 0;
  if (v < VIRTUAL_FROM) return v;
  return v - VIRTUAL_UNIT * Math.floor((v + VIRTUAL_UNIT - VIRTUAL_FROM) / VIRTUAL_UNIT);
}
