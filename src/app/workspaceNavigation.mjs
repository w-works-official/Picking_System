// Cross-document navigation only. The picking app keeps its existing default
// permissions, session handling, keyboard events, and business state.
const MODE_FLAGS = ["write", "events", "reorder"];
// 상위 업무 화면: 피킹시스템(루트) · CS 관리(cs/) · 상품 관리(purchase/, 2026-10-28 사입 관리 → 2026-10-29 이름 바꿈)
const WORKSPACE_PATHS = { picking: "", cs: "cs/", purchase: "purchase/" };

export function safeWorkspaceSearch(search = "") {
  const input = new URLSearchParams(search);
  const safe = new URLSearchParams();
  for (const key of MODE_FLAGS) {
    const values = input.getAll(key);
    if (!values.length) continue;
    // Ambiguous or invalid flags fall back to the less permissive mode.
    const value = values.length === 1 && /^[01]$/.test(values[0]) ? values[0] : "0";
    safe.set(key, value);
  }
  const query = safe.toString();
  return query ? `?${query}` : "";
}

// base = path from the current page to the app root ("./" on the picking page, "../" inside purchase/).
export function workspaceHref(workspace, search = "", base = "./") {
  if (!Object.hasOwn(WORKSPACE_PATHS, workspace)) throw new Error("Unknown workspace");
  const root = base === "../" ? "../" : "./";
  return `${root}${WORKSPACE_PATHS[workspace]}${safeWorkspaceSearch(search)}`;
}

export function configureWorkspaceNavigation(document, search = "") {
  const nav = document.querySelector(".workspace-navigation");
  const base = nav?.dataset?.workspaceBase || "./";
  for (const workspace of Object.keys(WORKSPACE_PATHS)) {
    const link = document.getElementById(`workspace-${workspace}-link`);
    if (link) link.setAttribute("href", workspaceHref(workspace, search, base));
  }
  // The operational app reserves Tab/arrows/Space globally. Within this new
  // navigation, retain native link keyboard behavior without changing those
  // existing shortcuts anywhere else in the picking workflow.
  nav?.addEventListener("keydown", (event) => event.stopPropagation());
}

if (typeof document !== "undefined") {
  configureWorkspaceNavigation(document, location.search);
}
