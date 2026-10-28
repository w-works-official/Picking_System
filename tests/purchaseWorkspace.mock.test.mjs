import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { safeWorkspaceSearch, workspaceHref } from "../src/app/workspaceNavigation.mjs";
import { PURCHASE_TABS, purchaseTabFromHash, showPurchaseTab } from "../src/app/purchaseApp.mjs";

// Existing links are unchanged; 사입 관리 is a new sibling document (2026-10-28).
assert.equal(workspaceHref("picking", "?write=1&events=0"), "./?write=1&events=0");
assert.equal(workspaceHref("cs", "?write=1"), "./cs/?write=1");
assert.equal(workspaceHref("purchase", "?write=1&token=x"), "./purchase/?write=1");
assert.equal(workspaceHref("picking", "", "../"), "../");
assert.equal(workspaceHref("cs", "?events=1", "../"), "../cs/?events=1");
assert.equal(workspaceHref("purchase", "", "../"), "../purchase/");
assert.equal(workspaceHref("purchase", "", "https://evil.invalid/"), "./purchase/", "base is limited to ./ or ../");
assert.throws(() => workspaceHref("hub"));
assert.equal(safeWorkspaceSearch("?write=1&write=0&returnUrl=x"), "?write=0");

assert.deepEqual(PURCHASE_TABS, ["order", "receiving"]);
assert.equal(purchaseTabFromHash("#receiving"), "receiving");
assert.equal(purchaseTabFromHash("#nope"), "order");
assert.equal(purchaseTabFromHash(""), "order");

// Tab switching against a tiny fake DOM.
const make = (data) => ({ dataset: data, hidden: false, attrs: {}, classList: { set: new Set(), toggle(name, on) { on ? this.set.add(name) : this.set.delete(name); } }, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } });
const buttons = [make({ purchaseTab: "order" }), make({ purchaseTab: "receiving" })];
const panels = [make({ purchasePanel: "order" }), make({ purchasePanel: "receiving" })];
const doc = { querySelectorAll: (sel) => (sel === "[data-purchase-tab]" ? buttons : panels) };
assert.equal(showPurchaseTab(doc, "receiving"), "receiving");
assert.deepEqual(panels.map((p) => p.hidden), [true, false]);
assert.ok(buttons[1].classList.set.has("active") && buttons[1].attrs["aria-current"] === "page" && !buttons[0].classList.set.has("active"));

const page = await readFile(new URL("../purchase/index.html", import.meta.url), "utf8");
for (const ref of page.matchAll(/(?:src|href)="(\.\.\/[^"?#]+)/g)) {
  assert.ok(existsSync(new URL(`../purchase/${ref[1]}`, import.meta.url)), `missing ${ref[1]}`);
}
assert.match(page, /data-workspace-base="\.\.\/"/);
assert.match(page, /id="workspace-purchase-link" class="workspace-link is-current"[^>]*aria-current="page">사입 관리</);
assert.match(page, /data-purchase-tab="order"[^>]*>발주</);
assert.match(page, /data-purchase-tab="receiving">입고</);
assert.doesNotMatch(page, /supabase|pickingAuth|pickingApp\.mjs/, "screen frame only: no data access yet");

const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
assert.match(index, /id="workspace-cs-link"[^\n]*\n\s*<a id="workspace-purchase-link" class="workspace-link" href="\.\/purchase\/\?write=0&amp;events=0">사입 관리<\/a>/);
const build = await readFile(new URL("../scripts/build-pages.mjs", import.meta.url), "utf8");
assert.match(build, /"cs","purchase"\]/);

const css = await readFile(new URL("../src/styles/purchase.css", import.meta.url), "utf8");
assert.match(css, /--purchase-bg: #fff8dc;/, "light yellow background");
assert.match(css, /\.purchase-tab\.active \{[^}]*background: var\(--purchase-green\);/, "green active menu");
assert.match(css, /\.workspace-link\.is-current \{[^}]*background: var\(--purchase-green\);/, "green current workspace button");

console.log("purchaseWorkspace.mock.test: OK");
