// 상품 관리 › 자사코드 자리 (2026-11-27) — 패널 붙이기 (패널 · 계산은 V3 개발 세션 dev/freeslots-261127)
import { mountFreeSlots } from "./freeSlotsPanel.mjs?v=20261127-slots8";

const root = typeof document !== "undefined" ? document.querySelector("[data-fs-root]") : null;
if (root) {
  const safe = (k) => { try { return window[k]; } catch { return null; } };
  mountFreeSlots({ document, window, root, autoLoad: true, storages: [safe("sessionStorage"), safe("localStorage")] });   // 11-27 열면 마지막 정보로 바로
}
