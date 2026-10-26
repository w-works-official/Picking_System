import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../src/styles/picking.css", import.meta.url), "utf8");
const app = await readFile(new URL("../src/app/pickingApp.mjs", import.meta.url), "utf8");

// Pinned area: invoice header, notice and the black table header stay put; only rows scroll.
assert.match(css, /@media \(min-width: 981px\) \{\s*\.inspection-layout > \.workflow-detail \{\s*display: flex;\s*flex-direction: column;/);
assert.match(css, /\.inspection-layout #inspection-detail > \.inspection-item-table \{[^}]*overflow: auto;[^}]*scroll-padding-top: 64px;/);
// Same-invoice re-renders keep the row scroll position; a different invoice starts at the top.
assert.match(app, /const previousItemScroll = previousItemTable && els\.inspectionDetail\.dataset\.renderedGroup === selected\.orderGroupNo/);
assert.match(app, /els\.inspectionDetail\.dataset\.renderedGroup = selected\.orderGroupNo;\s*if \(previousItemScroll\)/);

console.log("inspectionStickyHeader.contract.test: OK");
