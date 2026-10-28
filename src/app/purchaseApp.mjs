// 사입 관리 (2026-10-28): 피킹시스템과 같은 화면 틀, 사이드 메뉴 발주 · 입고.
// 아직 데이터는 읽거나 쓰지 않습니다(화면 틀만).
export const PURCHASE_TABS = ["order", "receiving"];

export function purchaseTabFromHash(hash = "") {
  const value = String(hash || "").replace(/^#/, "");
  return PURCHASE_TABS.includes(value) ? value : "order";
}

export function showPurchaseTab(document, tab) {
  const active = PURCHASE_TABS.includes(tab) ? tab : "order";
  document.querySelectorAll("[data-purchase-tab]").forEach((button) => {
    const on = button.dataset.purchaseTab === active;
    button.classList.toggle("active", on);
    if (on) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.querySelectorAll("[data-purchase-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.purchasePanel !== active;
  });
  return active;
}

export function initPurchaseWorkspace(document, location, history) {
  showPurchaseTab(document, purchaseTabFromHash(location.hash));
  document.querySelector(".purchase-tabs")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-purchase-tab]");
    if (!button) return;
    const tab = showPurchaseTab(document, button.dataset.purchaseTab);
    history.replaceState(null, "", `${location.pathname}${location.search}#${tab}`);
  });
  const toggle = document.getElementById("purchase-sidebar-toggle");
  toggle?.addEventListener("click", () => {
    const collapsed = document.getElementById("purchase-main").classList.toggle("sidebar-collapsed");
    document.getElementById("purchase-sidebar").classList.toggle("collapsed", collapsed);
    toggle.textContent = collapsed ? "▶" : "◀";
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.title = collapsed ? "사이드바 펼치기" : "사이드바 접기";
  });
}

if (typeof document !== "undefined" && document.getElementById("purchase-app")) {
  initPurchaseWorkspace(document, window.location, window.history);
}
