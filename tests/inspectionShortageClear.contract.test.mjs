import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app/pickingApp.mjs", import.meta.url), "utf8");
const css = await readFile(new URL("../src/styles/picking.css", import.meta.url), "utf8");

// 2026-10-28: 검품 표 부족수량 칸 바로 밑 [수량삭제] — the grid keeps one cell (input + button stacked).
const inspection = app.slice(app.indexOf("function renderInspectionPanels("), app.indexOf("function renderCompletedPanels("));
assert.match(inspection, /<div class="shortage-stack">\s*\$\{shortageQtyInput\(selected, item, shortage, "workflow-shortage-cell compact"\)\}\s*\$\{shortageClearButton\(selected, item, shortage\)\}\s*<\/div>/);
// Only the inspection table gets the button.
assert.equal((app.match(/\$\{shortageClearButton\(/g) || []).length, 1);

const helper = app.slice(app.indexOf("function shortageClearButton("), app.indexOf("function firstRawText("));
assert.match(helper, /data-action="shortage-clear"/);
assert.match(helper, /!allowWrites \|\| !hasValue \|\| itemIsEffectivelyCancelled\(invoice, item\)/, "disabled when read-only, empty or cancelled");

// Clearing uses exactly the same save path as erasing the field by hand (setShortageQty with "").
const click = app.slice(app.indexOf('if (button.dataset.action === "shortage-clear") {'), app.indexOf('if (button.dataset.action === "inspection-complete") {'));
assert.match(click, /setShortageQty\(button\.dataset\.orderGroup, button\.dataset\.itemNo, ""\)\.catch\(showError\);/);
assert.match(click, /if \(button\.disabled\) return;\s*button\.disabled = true;/, "no double clicks");
assert.match(app, /input\.value = normalizedShortageMemo2\(input\.value\);\s*setShortageQty\(input\.dataset\.orderGroup, input\.dataset\.itemNo, input\.value\)/);

assert.match(css, /\.shortage-stack \{[^}]*flex-direction: column;/);
assert.match(css, /\.shortage-clear-btn \{/);

console.log("inspectionShortageClear.contract.test: OK");
