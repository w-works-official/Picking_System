// Cross-document navigation only. The picking app keeps its existing default
// permissions, session handling, keyboard events, and business state.
const MODE_FLAGS = ["write", "events", "reorder"];

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

export function workspaceHref(workspace, search = "") {
  if (workspace !== "picking" && workspace !== "cs") throw new Error("Unknown workspace");
  return `${workspace === "cs" ? "./cs/" : "./"}${safeWorkspaceSearch(search)}`;
}

export function configureWorkspaceNavigation(document, search = "") {
  const picking = document.getElementById("workspace-picking-link");
  const cs = document.getElementById("workspace-cs-link");
  if (picking) picking.setAttribute("href", workspaceHref("picking", search));
  if (cs) cs.setAttribute("href", workspaceHref("cs", search));
  // The operational app reserves Tab/arrows/Space globally. Within this new
  // navigation, retain native link keyboard behavior without changing those
  // existing shortcuts anywhere else in the picking workflow.
  cs?.closest(".workspace-navigation")?.addEventListener("keydown", (event) => event.stopPropagation());
}

if (typeof document !== "undefined") {
  configureWorkspaceNavigation(document, location.search);
}
