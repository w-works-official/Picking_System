import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app/pickingApp.mjs", import.meta.url), "utf8");
const css = await readFile(new URL("../src/styles/picking.css", import.meta.url), "utf8");

// Inspection table: Sellpia code sits under the own code in one column (2026-10-27).
const header = app.slice(app.indexOf("function renderInspectionItemHeader("), app.indexOf("function inspectionLabelNumberMap("));
const headerCells = (header.match(/<span[ >]/g) || []).length;
assert.match(header, /<span class="workflow-code-stack-head">자사코드 \/ 셀피아코드<\/span>/);
assert.doesNotMatch(header, /<span>셀피아코드<\/span>/);
assert.match(app, /class="workflow-item-table inspection-item-table is-code-stacked /);
const inspection = app.slice(app.indexOf("function renderInspectionPanels("), app.indexOf("function renderCompletedPanels("));
assert.match(inspection, /<div class="workflow-code-stack">\s*<strong class="workflow-code-cell">[^\n]*\n\s*<span class="workflow-sellpia-cell">/);
// Column count of the stacked grid must match the header (label-number column is optional).
const cols = (selector) => css.match(new RegExp(`${selector.replace(/\./g, "\\.")} \\.workflow-item-row \\{[^}]*grid-template-columns: ([^;]+);`))[1].trim().split(/\s+/).length;
assert.equal(cols(".inspection-item-table.is-code-stacked"), headerCells - 1, "without the label-number column");
assert.equal(cols(".inspection-item-table.is-code-stacked.has-label-number"), headerCells, "with the label-number column");
// Other screens are unchanged: the legacy CS invoice table keeps its own Sellpia column.
const legacyCs = app.slice(app.indexOf("function renderLegacyCsInvoicePanels("), app.indexOf("function renderCompletedPanels("));
assert.match(legacyCs, /<strong class="workflow-code-cell">[^\n]*\n\s*<span class="workflow-sellpia-cell">/);
assert.doesNotMatch(legacyCs, /is-code-stacked|workflow-code-stack/);

// 2026-10-28: Sellpia code 35% bigger (11px → 14.85px) and the stack is centered.
const tail = css.slice(css.indexOf("/* 검품 표 코드 칸 (2026-10-28"));
assert.match(tail, /\.workflow-code-stack > \.workflow-sellpia-cell \{\s*font-size: 14\.85px;/);
assert.match(tail, /\.workflow-code-stack \{\s*align-items: center;/);
assert.match(tail, /text-align: center;/);
console.log("inspectionCodeStack.contract.test: OK");
