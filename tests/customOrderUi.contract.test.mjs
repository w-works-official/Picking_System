import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../src/app/pickingApp.mjs", import.meta.url), "utf8");
const css = await readFile(new URL("../src/styles/picking.css", import.meta.url), "utf8");

for (const tab of ["dashboard", "picking", "shortage", "inspection", "cs", "custom-orders", "completed"]) {
  assert.match(html, new RegExp(`data-app-tab=["']${tab}["']`), `tab must remain wired: ${tab}`);
}
assert.match(html, /id="custom-orders-panel"/);
assert.match(html, /id="custom-orders-status"/);
assert.match(html, /id="custom-orders-supplier"/);
assert.match(html, /id="custom-orders-sort"/);
const workflowSort = html.match(/<select id="custom-orders-sort">([\s\S]*?)<\/select>/)?.[1];
assert.ok(workflowSort, "custom-order workflow must expose a sort selector");
for (const order of ["supplier_asc", "supplier_desc", "required_desc"]) {
  assert.match(workflowSort, new RegExp(`value="${order}"`), `workflow sort must support ${order}`);
}
assert.match(html, /id="custom-orders-date-criterion"/);
assert.match(html, /id="custom-orders-date-from"/);
assert.match(html, /id="custom-orders-date-to"/);
assert.match(html, /id="custom-orders-search"/);
assert.match(html, /data-custom-orders-view="workflow"/);
assert.match(html, /data-custom-orders-view="inbound"/);
assert.match(html, /id="custom-orders-inbound-source"/);
assert.match(html, /id="custom-orders-inbound-supplier"/);
assert.match(html, /id="custom-orders-inbound-date-from"/);
assert.match(html, /id="custom-orders-inbound-date-to"/);
assert.match(html, /id="custom-orders-inbound-sort"/);
assert.match(html, /id="custom-orders-inbound-search"/);
assert.match(html, /id="custom-orders-sku-schedule-panel"/);
assert.match(html, /id="custom-orders-sku-input"/);
assert.match(html, /id="custom-orders-sku-input"[^>]*placeholder="예: 1000-1"/);
assert.match(html, /id="custom-orders-sku-date"/);
assert.match(html, /id="custom-orders-sku-own-code"/);
assert.match(html, /id="custom-orders-sku-own-code"[^>]*placeholder="예: GPA-14-19_5"/);
assert.match(html, /id="custom-orders-sku-upload"/);
assert.match(html, /id="custom-orders-sku-download"/);
assert.match(html, /셀피아 SKU \| 입고예정일 \| 자사코드/);

const tabStart = app.indexOf("function setActiveTab");
const tabEnd = app.indexOf("function scrollToTrayItem", tabStart);
const tabSource = app.slice(tabStart, tabEnd);
assert.match(tabSource, /state\.activeTab === "custom-orders"/);
assert.match(tabSource, /!state\.customOrders\.loaded/);
assert.match(tabSource, /loadCustomOrdersData\(\)/, "custom orders must lazy-load on first tab entry");

assert.match(app, /data-action="custom-order-toggle"/);
assert.match(app, /data-action="custom-order-memo-save"/);
assert.match(app, /class="custom-order-memo-inline"/);
assert.doesNotMatch(app, /<details class="custom-order-memo"/);
assert.match(app, /canClearCustomRequired\(existing\)/);
assert.match(app, /주문제작 탭에서 취소 처리/);
assert.match(app, /internal_memo: memo \|\| null/);
assert.match(app, /data-custom-order-action="ordered-today"/);
assert.match(app, /addCalendarDays\(orderedOn, 14\)/);
assert.match(app, /class="custom-order-product-photo"/);
const customOrderRenderer = app.slice(app.indexOf("function renderCustomOrderRow"), app.indexOf("function inboundRowIdentity"));
assert.match(customOrderRenderer, /custom-order-row custom-order-slip-card/);
assert.match(customOrderRenderer, /class="custom-order-slip-facts"/);
assert.match(customOrderRenderer, /class="custom-order-slip-quantity(?:\s|")/);
assert.match(customOrderRenderer, /class="custom-order-slip-management"/);
assert.match(customOrderRenderer, /class="custom-order-slip-management-heading"/);
const primarySlipSource = customOrderRenderer.slice(
  customOrderRenderer.indexOf('<div class="custom-order-row-primary '),
  customOrderRenderer.indexOf('<div class="custom-order-slip-management">'),
);
assert.match(primarySlipSource, /custom-order-product-photo/);
assert.match(primarySlipSource, /custom-order-supplier/);
assert.match(primarySlipSource, /custom-order-slip-facts/);
assert.match(primarySlipSource, /custom-order-slip-quantity/);
assert.doesNotMatch(primarySlipSource, /custom-order-status|workflow-row-badge|custom-order-slip-source|data-custom-order-field|data-custom-order-action/, "the left capture area must contain only supplier order-slip content");
assert.match(customOrderRenderer, /옵션/);
assert.match(customOrderRenderer, /바길이/);
assert.match(customOrderRenderer, /업체상품코드/);
assert.match(customOrderRenderer, /미수집/, "supplier product codes must not be invented from a different code");
const vendorCodeSource = primarySlipSource.match(/<div><dt>업체상품코드<\/dt>([\s\S]*?)<\/dd><\/div>/)?.[1];
assert.ok(vendorCodeSource, "the capture area must expose a vendor-code field");
assert.match(vendorCodeSource, /display\.arbitraryFieldRaw/, "vendor codes must use the dedicated raw Sellpia arbitrary field");
assert.match(vendorCodeSource, /escapeHtml\(display\.arbitraryFieldRaw \|\| "미수집"\)/, "raw vendor-code text must be escaped before rendering");
assert.match(vendorCodeSource, /is-unavailable/, "missing vendor codes must retain their unavailable styling");
assert.match(vendorCodeSource, /title="셀피아 임의필드 원문"/, "the vendor-code source must be identified accurately");
assert.doesNotMatch(vendorCodeSource, /display\.(?:ownCode|sellpiaProductCode)/, "own codes and Sellpia SKUs must never be substituted for missing vendor codes");
assert.match(customOrderRenderer, /slip\.quantity === null \? "확인 필요"/, "missing source quantities must remain visibly unknown");
assert.match(app, /customOrderSlipDetails/);
assert.match(app, /sortCustomOrderRows/);
assert.match(app, /sort: "supplier_asc"/, "workflow sort must initially group suppliers in ascending order");
assert.match(app, /<section class="custom-order-supplier-group"/, "supplier-sorted workflow rows must be wrapped in supplier sections");
assert.match(app, /<h3[^>]*class="custom-order-supplier-group-head"/, "supplier sections must contain a semantic compact header");
assert.match(app, /class="custom-order-supplier-group-items"/, "supplier cards must follow their group heading in a dedicated container");
assert.match(app, /data-custom-order-supplier="\$\{escapeHtml\(/, "raw supplier text must be escaped in group identity attributes");
assert.match(app, /엑셀 열:[\s\S]*셀피아 SKU \| 입고예정일\(YYYY-MM-DD\) \| 자사코드\(선택\)/);
assert.match(app, /1000-1 \| 2026-10-08 \| GPA-14-19_5/);
assert.match(app, /data-custom-order-action="received-today"/);
assert.match(app, /data-custom-order-action="cancel"/);
assert.match(app, /custom_cancelled_at: new Date\(\)\.toISOString\(\)/);
assert.match(app, /inbound_expected_source: "manual"/);
assert.match(app, /loadCustomOrderWorkspace/);
assert.match(app, /buildInboundExpectedRows/);
assert.match(app, /sortInboundExpectedRows/);
assert.match(app, /data-inbound-expected-field="inbound_expected_date"/);
assert.match(app, /upsertOperationForCurrentOrderItem\(currentItem/);
assert.match(app, /skuInboundSchedules\.upsertSchedule/);
assert.match(app, /skuInboundSchedules\.upsertSchedules/);
assert.match(app, /parseSkuInboundScheduleRows/);
assert.match(app, /SKU_INBOUND_SCHEDULE_HEADERS/);
assert.doesNotMatch(app, /from\("order_item_operations"\)\.delete/, "UI must never delete operation rows");
assert.match(css, /\.custom-orders-toolbar/);
assert.match(css, /\.custom-order-row/);
assert.match(css, /\.custom-order-slip-card/);
assert.match(css, /\.custom-order-slip-facts/);
assert.match(css, /\.custom-order-slip-management/);
assert.match(css, /\.custom-order-supplier-group\s*\{/, "supplier sections must have scoped layout rules");
assert.match(css, /\.custom-order-supplier-group-head\s*\{/, "compact supplier headers must be styled independently of workflow cards");
assert.match(css, /\.custom-order-supplier-group-items\s*\{/, "grouped cards must retain a dedicated layout container");
assert.match(css, /(?:#custom-orders-list|\.custom-orders-list)\s*\{[^}]*grid-row:\s*6\s*;/, "workflow list must occupy the final panel grid row");
assert.match(css, /\.custom-order-product-photo\s*\{[^}]*width:\s*9rem\s*;/);
assert.match(css, /\.custom-order-product-photo img\s*\{[^}]*object-fit:\s*contain\s*;/);
assert.match(css, /\.custom-orders-subtabs/);
assert.match(css, /\.inbound-expected-row/);
assert.match(css, /\.picking-custom-order/);
assert.match(css, /\.custom-order-row\.status-before_order/);
assert.match(css, /\.custom-order-row\.status-ordered/);
assert.match(css, /\.custom-order-row\.status-received/);
assert.match(css, /\.sku-inbound-schedule-panel/);

console.log("customOrderUi.contract.test: OK");
