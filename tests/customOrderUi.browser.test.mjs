import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const maliciousVendorRaw = '<img src=x onerror="window.__vendorRawExecuted=true"> & VENDOR';
const maliciousSupplierRaw = '<img src=x onerror="window.__supplierRawExecuted=true"> & SUPPLIER';

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://local.test").pathname);
    const requested = pathname === "/" ? "/index.html" : pathname;
    const file = path.resolve(root, `.${requested}`);
    if (!file.startsWith(root)) throw new Error("outside root");
    response.writeHead(200, { "content-type": contentTypes[path.extname(file)] || "application/octet-stream" });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404);
    response.end("not found");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

const launchOptions = { headless: true };
if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) {
  launchOptions.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
}
let browser;
let context;
try {
browser = await chromium.launch(launchOptions);
context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  timezoneId: "Asia/Seoul",
  serviceWorkers: "block",
});
const page = await context.newPage();
await page.clock.install({ time: new Date("2026-10-01T12:00:00+09:00") });
const pageErrors = [];
const supabaseNetworkAttempts = { blocked: 0, storage: 0, api: 0 };
const consoleErrors = [];
const failedRequests = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("requestfailed", (request) => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
await page.addInitScript(() => {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, options = {}) => {
    const url = String(typeof input === "string" ? input : input.url);
    if (url.includes("/rpc/picking_")) {
      const body = JSON.parse(options.body || "{}");
      if (url.endsWith("/picking_login_v1") && body.p_password !== "fixture-only") {
        return new Response(JSON.stringify({ authenticated: false, error_code: "invalid_credentials" }));
      }
      return new Response(JSON.stringify({
        authenticated: true, logged_out: true, session_token: "a".repeat(64), expires_at: "2030-01-01T00:00:00Z",
      }));
    }
    return originalFetch(input, options);
  };
  window.__xlsxUploadMatrix = [
    ["셀피아 SKU", "입고예정일", "자사코드"],
    ["UPLOADED-SKU", "2026-10-18", "UPLOADED-OWN"],
  ];
  window.XLSX = {
    read() {
      return { SheetNames: ["입고예정일"], Sheets: { 입고예정일: {} } };
    },
    utils: {
      sheet_to_json() { return window.__xlsxUploadMatrix; },
      book_new() { return { SheetNames: [], Sheets: {} }; },
      aoa_to_sheet(values) { return { __values: values }; },
      book_append_sheet(workbook, worksheet, name) {
        workbook.SheetNames.push(name);
        workbook.Sheets[name] = worksheet;
      },
    },
    writeFile(workbook, filename) {
      window.__xlsxDownload = { workbook, filename };
    },
  };
});
await page.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (url.hostname === "supabase.co" || url.hostname.endsWith(".supabase.co")) {
    supabaseNetworkAttempts.blocked += 1;
    if (url.pathname.startsWith("/storage/v1/")) supabaseNetworkAttempts.storage += 1;
    else supabaseNetworkAttempts.api += 1;
    await route.abort();
    return;
  }
  if (url.hostname === "127.0.0.1" && url.port === String(port)) {
    await route.continue();
    return;
  }
  await route.abort();
});
await page.route("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js", async (route) => {
  await route.fulfill({ contentType: "text/javascript", body: "/* test uses the init-script XLSX stub */" });
});
await page.route("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2", async (route) => {
  await route.fulfill({
    contentType: "text/javascript",
    body: `
      window.__supabaseCalls = [];
      const base = { custom_required_at: "2026-09-28T03:00:00Z", custom_ordered_on: null, custom_received_on: null, custom_cancelled_at: null, inbound_expected_date: null, inbound_expected_source: null, internal_memo: null };
      window.__tables = {
        orders: [{ ord_no: "O-P", inv_no: "6890123456789", receipt_date: "2026-10-01", sort_order: 1, receiver: "테스트", seller: "스마트스토어" }],
        order_item_operations: [
          { ...base, operation_id: "op-before", ord_no: "O-1", sellpia_order_item_no: "R-1", item_no: "1_R-1", sellpia_product_code_snapshot: "OLD", arbitrary_field_raw_snapshot: "OLD-VENDOR-SNAPSHOT", product_name_snapshot: "예전 상품", supplier_cell_raw_snapshot: "예전 매입처" },
          { ...base, operation_id: "op-missing", ord_no: "O-M", sellpia_order_item_no: "R-M", item_no: "1_R-M", custom_ordered_on: "2026-09-29", inbound_expected_date: "2026-10-05", inbound_expected_source: "sku_schedule", sellpia_product_code_snapshot: "SNAP", own_code_snapshot: "SNAP-OWN", arbitrary_field_raw_snapshot: "SNAP-VENDOR-TEST", product_name_snapshot: "스냅 상품", product_option_snapshot: "스냅 옵션", supplier_cell_raw_snapshot: "0-스냅매입처 [ 9 ]" },
          { ...base, operation_id: "op-manual-clear", ord_no: "O-2", sellpia_order_item_no: "R-2", item_no: "1_R-2", custom_ordered_on: "2026-09-30", inbound_expected_source: "manual", inbound_expected_date: null },
          { ...base, operation_id: "op-legacy", ord_no: "O-3", sellpia_order_item_no: "R-3", item_no: "1_R-3", custom_ordered_on: "2026-09-30" },
          { ...base, operation_id: "op-received", ord_no: "O-4", sellpia_order_item_no: "R-4", item_no: "1_R-4", custom_received_on: "2026-10-01" },
          { ...base, operation_id: "op-cancelled", ord_no: "O-5", sellpia_order_item_no: "R-5", item_no: "1_R-5", custom_cancelled_at: "2026-10-01T04:00:00Z" }
        ],
        order_items: [
          { ord_no: "O-P", sellpia_order_item_no: "R-P", item_no: "1_R-P", sort_order: 1, p_code: "PICK-SKU", p_dpcode: "PICK-OWN", p_name: "피킹 주문제작 상품", p_option: "테스트 옵션", p_location: "A-1", qty: 1 },
          { ord_no: "O-1", sellpia_order_item_no: "R-1", item_no: "9_R-1", p_code: "SAME-SKU", p_dpcode: "OWN-1", p_name: "현재 상품 1", p_option: "실버/6mm바[GPA-3-191],바길이 변경(주문제작/취소불가):8mm바", qty: 0, o_amount: 99, sellpia_supplier_cell_raw: "0-베니스톤 [ 28 ]", sellpia_arbitrary_field_raw: "001-VENDOR-TEST" },
          { ord_no: "O-2", sellpia_order_item_no: "R-2", item_no: "1_R-2", p_code: "SAME-SKU", p_dpcode: "OWN-2", p_name: "현재 상품 2", p_option: "골드 / 6mm 큐빅", o_amount: "3", sellpia_supplier_cell_raw: "0-세븐피어싱 [ 1 ]", sellpia_outbound_confirmed_date: "2026-10-08" },
          { ord_no: "O-3", sellpia_order_item_no: "R-3", item_no: "1_R-3", p_code: "LEGACY", p_dpcode: "OWN-3", p_name: "레거시 상품", p_option: "반지 8호", sellpia_supplier_cell_raw: "0-베니스톤 [ 28 ]", sellpia_arbitrary_field_raw: ${JSON.stringify(maliciousVendorRaw)}, sellpia_outbound_confirmed_date: "2026-10-09" },
          { ord_no: "O-LONLY", sellpia_order_item_no: "R-LONLY", item_no: "1_R-LONLY", p_code: "LEGACY-ONLY", p_dpcode: "OWN-LONLY", p_name: "operation 없는 셀피아 일정", sellpia_supplier_cell_raw: "0-신규매입처 [ 7 ]", sellpia_outbound_confirmed_date: "2026-10-11" }
        ],
        sku_inbound_schedules: [
          { sellpia_sku: "LEGACY-ONLY", inbound_expected_date: "2026-10-07", own_code: "OWN-LONLY", created_at: "2026-10-01T01:00:00Z", updated_at: "2026-10-01T01:00:00Z" }
        ]
      };
      function query(table) {
        const state = { table, mode: "select", payload: null, filters: [], notNull: "" };
        let proxy;
        proxy = new Proxy({}, {
          get(_target, prop) {
            if (prop === "then") return (resolve) => {
              let rows = [...(window.__tables[table] || [])];
              for (const [kind, column, value] of state.filters) {
                if (kind === "eq") rows = rows.filter((row) => row[column] === value);
                if (kind === "in") rows = rows.filter((row) => value.includes(row[column]));
              }
              if (state.notNull) rows = rows.filter((row) => row[state.notNull] !== null && row[state.notNull] !== undefined);
              if (state.mode === "update") {
                rows.forEach((row) => Object.assign(row, state.payload));
              }
              if (state.mode === "insert") {
                const inserted = { operation_id: "generated-" + Date.now(), ...state.payload };
                (window.__tables[table] ||= []).push(inserted);
                rows = [inserted];
              }
              if (state.mode === "upsert") {
                const payload = Array.isArray(state.payload) ? state.payload : [state.payload];
                rows = payload.map((value) => {
                  const existing = (window.__tables[table] ||= []).find((row) => row.sellpia_sku === value.sellpia_sku);
                  if (existing) return Object.assign(existing, value, { updated_at: new Date().toISOString() });
                  const inserted = { created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...value };
                  window.__tables[table].push(inserted);
                  return inserted;
                });
              }
              resolve({ data: structuredClone(rows), error: null });
            };
            return (...args) => {
              window.__supabaseCalls.push({ table, method: String(prop), args });
              if (prop === "eq") state.filters.push(["eq", args[0], args[1]]);
              if (prop === "in") state.filters.push(["in", args[0], args[1]]);
              if (prop === "not" && args[1] === "is" && args[2] === null) state.notNull = args[0];
              if (prop === "update") { state.mode = "update"; state.payload = args[0]; }
              if (prop === "insert") { state.mode = "insert"; state.payload = args[0]; }
              if (prop === "upsert") { state.mode = "upsert"; state.payload = structuredClone(args[0]); }
              return proxy;
            };
          }
        });
        return proxy;
      }
      window.supabase = { createClient() {
        return {
          from: (table) => query(table),
          rpc: () => Promise.resolve({ data: [], error: null }),
          storage: { from: () => ({ download: () => Promise.resolve({ data: null, error: new Error("mock empty") }), list: () => Promise.resolve({ data: [], error: null }) }) }
        };
      }};
    `,
  });
});

  await page.goto(`http://127.0.0.1:${port}/index.html?write=1`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#picking-login-form");
  assert.equal(await page.locator("#app").isVisible(), false);
  assert.equal(await page.evaluate(() => window.__supabaseCalls.length), 0, "no dataset request before login");
  await page.locator('[name="username"]').fill("demo");
  await page.locator('[name="password"]').fill("wrong");
  await page.locator('#picking-login-form [type="submit"]').click();
  await page.waitForFunction(() => document.getElementById("picking-login-status").textContent.includes("비밀번호"));
  assert.equal(await page.locator("#app").isVisible(), false);
  await page.locator('[name="password"]').fill("fixture-only");
  await page.locator('#picking-login-form [type="submit"]').click();
  await page.waitForSelector('[data-app-tab="custom-orders"]');
  try {
    await page.waitForSelector('.picking-item-card[data-order-group="O-P"]', { timeout: 10000 });
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      title: document.title,
      bodyText: document.body.innerText.slice(0, 600),
      supabaseCalls: JSON.stringify(window.__supabaseCalls?.map(({ table, method, args }) => ({ table, method, args }))),
      mockOrders: window.__tables?.orders,
      tabMarkup: [...document.querySelectorAll("[data-app-tab]")].map((node) => ({
        tab: node.dataset.appTab,
        active: node.classList.contains("active"),
      })),
    }));
    console.error("customOrderUi.browser.test initial picking card diagnostics", {
      diagnostics,
      pageErrors,
      consoleErrors,
      localFailedRequests: failedRequests.filter(({ url }) => url.startsWith(`http://127.0.0.1:${port}/`)),
    });
    throw error;
  }
  await page.fill("#search-input", "테스트");
  assert.equal(await page.locator("#search-input").inputValue(), "테스트", "normal keyboard search must remain immediate");
  await page.fill("#search-input", "6890123456789".repeat(3));
  await page.waitForFunction(() => document.getElementById("search-input")?.value === "");
  assert.equal(await page.locator('.picking-item-card[data-order-group="O-P"]').count(), 1, "a repeated scanner payload must resolve to the matching invoice once");
  await page.fill("#search-input", "6890123456789");
  await page.waitForFunction(() => document.getElementById("search-input")?.value === "");
  await page.fill("#jump-invoice-input", "6890123456789".repeat(2));
  await page.waitForFunction(() => document.getElementById("jump-invoice-input")?.value === "6890123456789");
  const before = await page.evaluate(() => window.__supabaseCalls.filter((entry) => entry.table === "order_item_operations" && entry.method === "not").length);
  assert.equal(before, 0, "custom-order workspace query must not run before the tab opens");

  let pickingCard = page.locator('.picking-item-card[data-order-group="O-P"]');
  assert.match(await pickingCard.textContent(), /스마트스토어/);
  assert.match(await pickingCard.textContent(), /A-1/);
  await pickingCard.locator('[data-action="custom-order-toggle"]').check();
  await page.waitForFunction(() => window.__tables.order_item_operations.some((row) => row.ord_no === "O-P" && row.custom_required_at));
  pickingCard = page.locator('.picking-item-card[data-order-group="O-P"]');
  assert.equal(await pickingCard.locator('[data-action="custom-order-toggle"]').isChecked(), true);
  await pickingCard.locator('[data-action="custom-order-toggle"]').click();
  await page.waitForFunction(() => window.__tables.order_item_operations.some((row) => row.ord_no === "O-P" && row.custom_required_at === null));
  pickingCard = page.locator('.picking-item-card[data-order-group="O-P"]');
  await pickingCard.locator('[data-action="custom-order-memo-input"]').fill("내부 제작 메모");
  await pickingCard.locator('[data-action="custom-order-memo-save"]').click();
  await page.waitForFunction(() => window.__tables.order_item_operations.some((row) => row.ord_no === "O-P" && row.internal_memo === "내부 제작 메모"));
  pickingCard = page.locator('.picking-item-card[data-order-group="O-P"]');
  await pickingCard.locator('[data-action="custom-order-toggle"]').check();
  assert.deepEqual(await pickingCard.locator(".picking-custom-order").evaluate((node) => [...node.children].map((child) => child.className)), [
    "custom-order-check",
    "custom-order-memo-inline",
    "custom-order-status status-before_order",
  ], "picking controls must be ordered as checkbox, memo, then status badge");
  pickingCard = page.locator('.picking-item-card[data-order-group="O-P"]');
  await pickingCard.locator('[data-action="custom-order-toggle"]').click();
  await page.waitForFunction(() => document.getElementById("toast")?.textContent.includes("주문제작 탭에서 취소"));
  pickingCard = page.locator('.picking-item-card[data-order-group="O-P"]');
  assert.equal(await pickingCard.locator('[data-action="custom-order-toggle"]').isChecked(), true, "memo-bearing workflow must refuse direct uncheck");

  await page.click('[data-app-tab="custom-orders"]');
  await page.waitForFunction(() => document.getElementById("custom-orders-count")?.textContent.includes("전체 7건"));
  assert.equal(await page.locator("#custom-orders-panel").isVisible(), true);
  assert.equal(await page.locator("#picking-panel").isVisible(), false);
  assert.equal(await page.locator("#custom-orders-status").inputValue(), "active");
  assert.equal(await page.locator("#custom-orders-sort").inputValue(), "supplier_asc");
  assert.deepEqual(await page.locator("#custom-orders-sort option").evaluateAll((nodes) => nodes.map((node) => node.value)), [
    "supplier_asc", "supplier_desc", "required_desc",
  ]);
  const layout = await page.evaluate(() => {
    const panel = document.getElementById("custom-orders-panel");
    const toolbar = document.querySelector(".custom-orders-toolbar");
    const status = document.getElementById("custom-orders-status");
    const firstEntry = document.querySelector(".custom-order-supplier-group, .custom-order-row");
    return {
      panelRows: getComputedStyle(panel).gridTemplateRows.split(" ").length,
      listGridRow: getComputedStyle(document.getElementById("custom-orders-list")).gridRowStart,
      toolbarHeight: toolbar.getBoundingClientRect().height,
      statusHeight: status.getBoundingClientRect().height,
      gapToFirstRow: firstEntry.getBoundingClientRect().top - toolbar.getBoundingClientRect().bottom,
    };
  });
  assert.equal(layout.panelRows, 6, "custom-order panel must allocate header/tabs/filters/SKU-manager/summary/list rows");
  assert.equal(layout.listGridRow, "6", "workflow list must explicitly occupy the final panel row");
  assert.ok(layout.toolbarHeight >= 48 && layout.toolbarHeight <= 60, `toolbar must match existing panel density (${layout.toolbarHeight}px)`);
  assert.equal(layout.statusHeight, 32, `filter controls must match the existing 32px form-control height (${layout.statusHeight}px)`);
  assert.ok(layout.gapToFirstRow < 70, `list must start directly below its summary (${layout.gapToFirstRow}px)`);
  assert.match(await page.locator("#custom-orders-count").textContent(), /^5건 \/ 전체 7건$/);
  assert.equal(await page.locator(".custom-order-row").count(), 5);
  assert.equal(await page.locator(".custom-order-slip-card").count(), 5, "workflow rows must use the new order-slip layout");
  assert.equal(await page.locator(".custom-order-row .workflow-row-badge.danger").count(), 1);
  assert.match(await page.locator('[data-operation-id="op-missing"]').textContent(), /스냅 상품/);
  assert.match(await page.locator('[data-operation-id="op-manual-clear"]').textContent(), /수동 · 삭제됨/);
  assert.match(await page.locator('[data-operation-id="op-legacy"]').textContent(), /셀피아/);
  assert.equal(await page.locator('[data-operation-id="op-before"] .custom-order-product-photo img').count(), 1, "custom-order workflow must show the product photo");

  const slipFacts = async (operationId) => page.locator(`[data-operation-id="${operationId}"] .custom-order-slip-facts`).evaluate((node) => (
    Object.fromEntries([...node.children].map((fact) => [fact.querySelector("dt").textContent.trim(), fact.querySelector("dd").textContent.trim()]))
  ));
  assert.deepEqual(await slipFacts("op-before"), { 업체상품코드: "001-VENDOR-TEST", 옵션: "실버[GPA-3-191]", 바길이: "8mm" }, "current raw vendor codes must override stale snapshots and preserve leading zeroes");
  assert.deepEqual(await slipFacts("op-missing"), { 업체상품코드: "SNAP-VENDOR-TEST", 옵션: "스냅 옵션", 바길이: "확인 필요" }, "a missing source row must retain its vendor-code snapshot");
  assert.deepEqual(await slipFacts("op-manual-clear"), { 업체상품코드: "미수집", 옵션: "골드 / 6mm 큐빅", 바길이: "확인 필요" });
  assert.deepEqual(await slipFacts("op-legacy"), { 업체상품코드: maliciousVendorRaw, 옵션: "반지 8호", 바길이: "확인 필요" });
  const vendorCodeFact = (operationId) => page.locator(`[data-operation-id="${operationId}"] .custom-order-slip-facts div`).filter({ has: page.locator("dt", { hasText: "업체상품코드" }) }).locator("dd");
  assert.equal(await vendorCodeFact("op-before").getAttribute("title"), "셀피아 임의필드 원문");
  assert.equal(await vendorCodeFact("op-before").evaluate((node) => node.classList.contains("is-unavailable")), false);
  assert.equal(await vendorCodeFact("op-missing").evaluate((node) => node.classList.contains("is-unavailable")), false);
  assert.equal(await vendorCodeFact("op-manual-clear").evaluate((node) => node.classList.contains("is-unavailable")), true);
  assert.notEqual((await slipFacts("op-manual-clear")).업체상품코드, "OWN-2", "an own code must never be inferred as the vendor code");
  assert.equal(await vendorCodeFact("op-legacy").locator("*").count(), 0, "raw vendor text containing markup must not create HTML elements");
  assert.equal(await page.evaluate(() => window.__vendorRawExecuted), undefined, "raw vendor text must never execute an event handler");
  assert.equal(await page.locator('[data-operation-id="op-before"] .custom-order-slip-quantity strong').textContent(), "0개", "a real zero quantity must not fall through to another source field or default to one");
  assert.equal(await page.locator('[data-operation-id="op-manual-clear"] .custom-order-slip-quantity strong').textContent(), "3개", "legacy o_amount quantities must remain visible");
  for (const operationId of ["op-missing", "op-legacy"]) {
    assert.match(await page.locator(`[data-operation-id="${operationId}"] .custom-order-slip-quantity`).textContent(), /수량\s+확인 필요/);
  }
  assert.equal(await page.locator(".custom-order-slip-facts dd.is-unavailable").filter({ hasText: "미수집" }).count(), 2, "only missing raw vendor codes must stay visibly uncollected");
  assert.equal(await page.locator('[data-operation-id="op-before"] .custom-order-slip-management [data-custom-order-field]').count(), 4, "management must retain three editable dates and its memo");
  assert.equal(await page.locator('[data-operation-id="op-before"] .custom-order-slip-management [data-custom-order-action]').count(), 3, "management must retain the workflow actions");
  for (const card of await page.locator(".custom-order-slip-card").all()) {
    const primary = card.locator(".custom-order-row-primary");
    const management = card.locator(".custom-order-slip-management");
    assert.equal(await primary.locator(".custom-order-product-photo, .custom-order-supplier, .custom-order-slip-facts, .custom-order-slip-quantity").count(), 4, "the left capture area must retain the photo, supplier, order facts and quantity");
    assert.equal(await primary.locator("input, button, .custom-order-status, .workflow-row-badge, .custom-order-slip-source, .custom-order-row-dates, .custom-order-row-memo").count(), 0, "the left capture area must exclude internal dates, memo, actions, status and source warnings");
    assert.equal(await management.locator(".custom-order-slip-management-heading .custom-order-status").count(), 1, "workflow status must be inside the right management heading");
    assert.equal(await management.locator(".custom-order-row-dates, .custom-order-row-memo, .custom-order-row-actions, .custom-order-slip-source").count(), 4, "the right management area must retain dates, memo, actions and source details");
  }
  assert.equal(await page.locator(".custom-order-slip-management-heading .workflow-row-badge.danger").count(), 1, "a missing source warning must stay on the internal management side");

  const readSupplierOrder = () => page.locator(".custom-order-slip-card .custom-order-supplier").allTextContents();
  const readSupplierGroups = () => page.locator("#custom-orders-list > .custom-order-supplier-group").evaluateAll((groups) => groups.map((group) => ({
    supplier: group.dataset.customOrderSupplier,
    name: group.querySelector(".custom-order-supplier-group-head strong").textContent.trim(),
    summary: group.querySelector(".custom-order-supplier-group-head span").textContent.trim(),
    operationIds: [...group.querySelectorAll(".custom-order-supplier-group-items > .custom-order-slip-card")].map((card) => card.dataset.operationId),
    childClasses: [...group.children].map((child) => child.className),
    headingTag: group.querySelector(".custom-order-supplier-group-head").tagName,
    labelledBy: group.getAttribute("aria-labelledby"),
    headingId: group.querySelector(".custom-order-supplier-group-head").id,
  })));
  const assertGroupSummaries = async (expected) => {
    const groups = await readSupplierGroups();
    assert.deepEqual(groups.map(({ supplier, name, summary }) => [supplier, name, summary]), expected);
    for (const group of groups) {
      assert.deepEqual(group.childClasses, ["custom-order-supplier-group-head", "custom-order-supplier-group-items"], "each supplier section must have a compact header followed by its cards");
      assert.equal(group.headingTag, "H3", "supplier names must be semantic group headings");
      assert.ok(group.headingId && group.labelledBy === group.headingId, "each supplier section must be labelled by its own heading");
    }
    assert.equal(new Set(groups.map((group) => group.headingId)).size, groups.length, "supplier headings must have unique IDs");
    return groups;
  };
  const pickingOperationId = await page.evaluate(() => window.__tables.order_item_operations.find((row) => row.ord_no === "O-P").operation_id);
  const ascendingGroupSummaries = [
    ["0-베니스톤 [ 28 ]", "0-베니스톤 [ 28 ]", "2건 · 총 0개 · 수량 미확인 1건"],
    ["0-세븐피어싱 [ 1 ]", "0-세븐피어싱 [ 1 ]", "1건 · 총 3개"],
    ["0-스냅매입처 [ 9 ]", "0-스냅매입처 [ 9 ]", "1건 · 수량 미확인 1건"],
    ["", "매입처 미확인", "1건 · 총 1개"],
  ];
  const ascendingSuppliers = ["0-베니스톤 [ 28 ]", "0-베니스톤 [ 28 ]", "0-세븐피어싱 [ 1 ]", "0-스냅매입처 [ 9 ]", "매입처 미확인"];
  assert.deepEqual(await readSupplierOrder(), ascendingSuppliers, "the default workflow list must group suppliers alphabetically and keep missing suppliers last");
  const initialGroups = await assertGroupSummaries(ascendingGroupSummaries);
  assert.deepEqual(initialGroups.map((group) => group.operationIds), [["op-before", "op-legacy"], ["op-manual-clear"], ["op-missing"], [pickingOperationId]], "grouping must preserve every order row and use the current supplier before a stale snapshot");
  assert.equal(await page.locator('[data-operation-id="op-before"] .custom-order-slip-source summary').filter({ hasText: "SAME-SKU" }).count(), 1);
  assert.equal(await page.locator('[data-operation-id="op-manual-clear"] .custom-order-slip-source summary').filter({ hasText: "SAME-SKU" }).count(), 1, "separate orders sharing a SKU must remain separate workflow cards");
  await page.selectOption("#custom-orders-sort", "supplier_desc");
  assert.deepEqual(await readSupplierOrder(), ["0-스냅매입처 [ 9 ]", "0-세븐피어싱 [ 1 ]", "0-베니스톤 [ 28 ]", "0-베니스톤 [ 28 ]", "매입처 미확인"], "descending supplier sorting must also keep missing suppliers last");
  await assertGroupSummaries([ascendingGroupSummaries[2], ascendingGroupSummaries[1], ascendingGroupSummaries[0], ascendingGroupSummaries[3]]);
  await page.selectOption("#custom-orders-sort", "required_desc");
  assert.equal(await page.locator(".custom-order-supplier-group").count(), 0, "registration-date sorting must retain a flat list in global date order");
  assert.equal(await page.locator("#custom-orders-list > .custom-order-slip-card").count(), 5, "registration-date sorting must keep every card directly in the list");
  assert.equal(await page.locator(".custom-order-slip-card").first().getAttribute("data-operation-id"), pickingOperationId, "registration-date sorting must place the newly registered order first");
  await page.selectOption("#custom-orders-sort", "supplier_asc");
  assert.deepEqual(await readSupplierOrder(), ascendingSuppliers, "returning to supplier sorting must restore the default order");
  await assertGroupSummaries(ascendingGroupSummaries);

  const originalOption = "실버/6mm바[GPA-3-191],바길이 변경(주문제작/취소불가):8mm바";
  const sourceDetails = page.locator('[data-operation-id="op-before"] .custom-order-slip-source');
  assert.equal(await sourceDetails.getAttribute("open"), null);
  assert.match(await sourceDetails.locator("summary").textContent(), /SAME-SKU.*OWN-1/);
  await sourceDetails.locator("summary").click();
  assert.ok((await sourceDetails.textContent()).includes(originalOption), "the source detail must preserve the complete original option");

  for (const viewport of [{ width: 1920, height: 1000 }, { width: 1240, height: 1100 }]) {
    await page.setViewportSize(viewport);
    const cardLayout = await page.evaluate(() => {
      const panel = document.getElementById("custom-orders-panel");
      const list = document.getElementById("custom-orders-list");
      const summary = document.querySelector(".custom-orders-summary");
      const groups = [...list.querySelectorAll(".custom-order-supplier-group")];
      const cards = [...list.querySelectorAll(".custom-order-slip-card")];
      const first = cards[0];
      const primary = first.querySelector(".custom-order-row-primary");
      const photo = first.querySelector(".custom-order-product-photo");
      const management = first.querySelector(".custom-order-slip-management");
      return {
        panelRows: getComputedStyle(panel).gridTemplateRows.split(" ").length,
        listGridRow: getComputedStyle(list).gridRowStart,
        listBottom: list.getBoundingClientRect().bottom,
        panelBottom: panel.getBoundingClientRect().bottom,
        gapFromSummary: groups[0].getBoundingClientRect().top - summary.getBoundingClientRect().bottom,
        firstWidth: first.clientWidth,
        primaryWidth: primary.getBoundingClientRect().width,
        managementWidth: management.getBoundingClientRect().width,
        primaryTop: primary.getBoundingClientRect().top,
        primaryRight: primary.getBoundingClientRect().right,
        managementTop: management.getBoundingClientRect().top,
        managementLeft: management.getBoundingClientRect().left,
        photoWidth: photo.getBoundingClientRect().width,
        photoHeight: photo.getBoundingClientRect().height,
        photoFit: getComputedStyle(photo.querySelector("img")).objectFit,
        groups: groups.map((group, index) => {
          const bounds = group.getBoundingClientRect();
          const heading = group.querySelector(".custom-order-supplier-group-head").getBoundingClientRect();
          const groupCards = [...group.querySelectorAll(".custom-order-slip-card")];
          const firstCard = groupCards[0].getBoundingClientRect();
          const lastCard = groupCards.at(-1).getBoundingClientRect();
          const previousLast = index ? groups[index - 1].getBoundingClientRect().bottom : null;
          return {
            supplier: group.dataset.customOrderSupplier,
            headingHeight: heading.height,
            headingBeforeCards: heading.bottom <= firstCard.top + 1,
            alignedWidth: Math.abs(heading.left - firstCard.left) <= 1 && Math.abs(heading.right - firstCard.right) <= 1,
            allCardsInside: groupCards.every((card) => {
              const box = card.getBoundingClientRect();
              return box.left >= bounds.left - 1 && box.right <= bounds.right + 1 && box.top >= heading.bottom - 1 && box.bottom <= bounds.bottom + 1;
            }),
            followsPreviousGroup: previousLast === null || bounds.top >= previousLast - 1,
            finalCardInside: lastCard.bottom <= bounds.bottom + 1,
            clippedWidth: group.scrollWidth - group.clientWidth,
          };
        }),
        cards: cards.map((card) => {
          const bounds = card.getBoundingClientRect();
          const slip = card.querySelector(".custom-order-row-primary").getBoundingClientRect();
          const controls = card.querySelector(".custom-order-slip-management").getBoundingClientRect();
          const quantity = card.querySelector(".custom-order-slip-quantity").getBoundingClientRect();
          const image = card.querySelector(".custom-order-product-photo").getBoundingClientRect();
          return {
            operationId: card.dataset.operationId,
            clippedWidth: card.scrollWidth - card.clientWidth,
            clippedHeight: card.scrollHeight - card.clientHeight,
            primaryRight: slip.right,
            alignedTop: Math.abs(slip.top - controls.top) <= 1,
            separatedHorizontally: slip.right <= controls.left + 1,
            quantityInsideSlip: quantity.left >= slip.left && quantity.right <= slip.right + 1 && quantity.top >= slip.top && quantity.bottom <= slip.bottom + 1,
            quantityBesidePhoto: quantity.left >= image.right && quantity.top < image.bottom,
            controlsOutside: [...card.querySelectorAll("input, button, summary")].some((control) => {
              const box = control.getBoundingClientRect();
              return box.width && (box.left < bounds.left || box.right > bounds.right + 1 || box.top < bounds.top || box.bottom > bounds.bottom + 1);
            }),
          };
        }),
      };
    });
    const screen = `${viewport.width}x${viewport.height}`;
    assert.equal(cardLayout.panelRows, 6, `${screen}: panel must retain its six tracks`);
    assert.equal(cardLayout.listGridRow, "6", `${screen}: list must stay in the final grid row`);
    assert.ok(cardLayout.listBottom <= cardLayout.panelBottom + 1 && cardLayout.listBottom <= viewport.height, `${screen}: the list must end inside the visible panel`);
    assert.ok(cardLayout.gapFromSummary >= 0 && cardLayout.gapFromSummary < 24, `${screen}: supplier groups must start immediately below the summary`);
    assert.ok(cardLayout.primaryWidth > cardLayout.managementWidth && cardLayout.primaryWidth < cardLayout.firstWidth, `${screen}: the left capture area must be the larger of two card columns`);
    assert.ok(Math.abs(cardLayout.primaryTop - cardLayout.managementTop) <= 1, `${screen}: the capture area and management area must start at the same height`);
    assert.ok(cardLayout.primaryRight <= cardLayout.managementLeft + 1, `${screen}: management controls must sit to the right of the order slip`);
    assert.equal(cardLayout.photoWidth, 144, `${screen}: workflow product photos must remain 9rem wide`);
    assert.equal(cardLayout.photoHeight, 144, `${screen}: workflow product photos must remain square`);
    assert.equal(cardLayout.photoFit, "contain", `${screen}: photos must preserve the full product image`);
    assert.equal(cardLayout.groups.length, 4, `${screen}: every supplier must have one group heading`);
    for (const group of cardLayout.groups) {
      assert.ok(group.headingHeight > 0 && group.headingHeight <= 64, `${screen}: ${group.supplier} heading must remain compact (${group.headingHeight}px)`);
      assert.equal(group.headingBeforeCards, true, `${screen}: ${group.supplier} heading must precede its cards`);
      assert.equal(group.alignedWidth, true, `${screen}: ${group.supplier} heading must align with its cards`);
      assert.equal(group.allCardsInside, true, `${screen}: ${group.supplier} cards must stay inside their supplier section`);
      assert.equal(group.followsPreviousGroup, true, `${screen}: ${group.supplier} section must follow the preceding supplier section`);
      assert.equal(group.finalCardInside, true, `${screen}: ${group.supplier} final card must fit inside its section`);
      assert.ok(group.clippedWidth <= 1, `${screen}: ${group.supplier} section must not clip horizontally`);
    }
    for (const card of cardLayout.cards) {
      assert.ok(card.clippedWidth <= 1, `${screen}: ${card.operationId} must not clip horizontal content (${card.clippedWidth}px)`);
      assert.ok(card.clippedHeight <= 1, `${screen}: ${card.operationId} must size itself to all content (${card.clippedHeight}px)`);
      assert.equal(card.alignedTop, true, `${screen}: ${card.operationId} must preserve a side-by-side split`);
      assert.equal(card.separatedHorizontally, true, `${screen}: ${card.operationId} management must remain right of its capture area`);
      assert.ok(Math.abs(card.primaryRight - cardLayout.primaryRight) <= 1, `${screen}: ${card.operationId} must share a straight capture boundary with the other cards`);
      assert.equal(card.quantityInsideSlip, true, `${screen}: ${card.operationId} quantity must fit completely inside the capture area`);
      assert.equal(card.quantityBesidePhoto, true, `${screen}: ${card.operationId} quantity must stay beside its photo without wrapping below it`);
      assert.equal(card.controlsOutside, false, `${screen}: ${card.operationId} controls must remain inside its card`);
    }
    const scrolledEnd = await page.locator("#custom-orders-list").evaluate((list) => {
      list.scrollTop = list.scrollHeight;
      const last = [...list.querySelectorAll(".custom-order-slip-card")].at(-1);
      return { lastBottom: last.getBoundingClientRect().bottom, listBottom: list.getBoundingClientRect().bottom, scrollTop: list.scrollTop };
    });
    assert.ok(scrolledEnd.scrollTop > 0, `${screen}: the test must exercise scrolling through multiple full-height cards`);
    assert.ok(scrolledEnd.lastBottom <= scrolledEnd.listBottom, `${screen}: the last card bottom must be reachable by scrolling`);
    await page.locator("#custom-orders-list").evaluate((list) => { list.scrollTop = 0; });
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  await sourceDetails.locator("summary").click();

  const statusColors = {};
  for (const [filter, key] of [["before_order", "before"], ["received", "received"]]) {
    await page.selectOption("#custom-orders-status", filter);
    const row = page.locator(".custom-order-row").first();
    statusColors[key] = await row.evaluate((node) => getComputedStyle(node).borderLeftColor);
  }
  assert.notEqual(statusColors.before, statusColors.received, "before-order and received rows must have distinct status colors");

  await page.selectOption("#custom-orders-status", "received");
  assert.equal(await page.locator('.custom-order-row[data-operation-id="op-received"]').count(), 1);
  assert.match(await page.locator('[data-operation-id="op-received"] .custom-order-status').textContent(), /입고 완료/);
  await page.selectOption("#custom-orders-status", "active");
  await page.selectOption("#custom-orders-supplier", "0-스냅매입처 [ 9 ]");
  assert.equal(await page.locator(".custom-order-row").count(), 1);
  await assertGroupSummaries([ascendingGroupSummaries[2]]);
  await page.selectOption("#custom-orders-supplier", "");
  await page.fill("#custom-orders-search", "OWN-2");
  assert.equal(await page.locator('.custom-order-row[data-operation-id="op-manual-clear"]').count(), 1);
  await assertGroupSummaries([ascendingGroupSummaries[1]]);
  await page.fill("#custom-orders-search", "OWN-1");
  await assertGroupSummaries([["0-베니스톤 [ 28 ]", "0-베니스톤 [ 28 ]", "1건 · 총 0개"]]);
  await page.fill("#custom-orders-search", "no-fixture-matches-this");
  assert.equal(await page.locator(".custom-order-supplier-group").count(), 0, "empty filter results must not leave stale supplier headers");
  assert.equal(await page.locator(".custom-order-slip-card").count(), 0);
  await page.fill("#custom-orders-search", "");
  await page.fill("#custom-orders-date-from", "2026-10-01");
  await page.fill("#custom-orders-date-to", "2026-10-01");
  assert.equal(await page.locator(".custom-order-slip-card").count(), 1, "workflow date filtering must keep working with supplier sorting enabled");
  assert.equal(await page.locator(".custom-order-slip-card").first().getAttribute("data-operation-id"), pickingOperationId);
  await assertGroupSummaries([ascendingGroupSummaries[3]]);
  await page.fill("#custom-orders-date-from", "");
  await page.fill("#custom-orders-date-to", "");
  await assertGroupSummaries(ascendingGroupSummaries);

  await page.locator('[data-operation-id="op-before"] [data-custom-order-action="ordered-today"]').click();
  await page.waitForFunction(() => {
    const row = window.__tables.order_item_operations.find((entry) => entry.operation_id === "op-before");
    return row?.custom_ordered_on === "2026-10-01"
      && row?.inbound_expected_date === "2026-10-15"
      && row?.inbound_expected_source === "manual";
  });
  assert.match(await page.locator('[data-operation-id="op-before"] .custom-order-status').textContent(), /주문완/);
  const orderedColor = await page.locator('[data-operation-id="op-before"]').evaluate((node) => getComputedStyle(node).borderLeftColor);
  assert.notEqual(orderedColor, statusColors.before, "ordered rows must be visually distinct from before-order rows");
  assert.notEqual(orderedColor, statusColors.received, "ordered rows must be visually distinct from received rows");

  await page.locator('[data-operation-id="op-missing"] [data-custom-order-field="inbound_expected_date"]').fill("2026-10-06");
  await page.locator('[data-operation-id="op-missing"] [data-custom-order-field="inbound_expected_date"]').press("Tab");
  await page.waitForFunction(() => {
    const row = window.__tables.order_item_operations.find((entry) => entry.operation_id === "op-missing");
    return row?.inbound_expected_date === "2026-10-06" && row?.inbound_expected_source === "manual";
  });
  await page.locator('[data-operation-id="op-missing"] [data-custom-order-action="received-today"]').click();
  await page.waitForFunction(() => window.__tables.order_item_operations.find((row) => row.operation_id === "op-missing")?.custom_received_on);
  assert.equal(await page.locator('[data-operation-id="op-missing"]').count(), 0, "received rows must leave the default active list");
  await page.selectOption("#custom-orders-status", "received");
  assert.equal(await page.locator('[data-operation-id="op-missing"]').count(), 1);
  await page.selectOption("#custom-orders-status", "active");

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('[data-operation-id="op-legacy"] [data-custom-order-action="cancel"]').click();
  await page.waitForFunction(() => window.__tables.order_item_operations.find((row) => row.operation_id === "op-legacy")?.custom_cancelled_at);
  assert.equal(await page.locator('[data-operation-id="op-legacy"]').count(), 0, "cancelled rows must leave the default active list");
  await page.selectOption("#custom-orders-status", "cancelled");
  assert.equal(await page.locator('[data-operation-id="op-legacy"]').count(), 1);

  await page.click('[data-custom-orders-view="inbound"]');
  await page.waitForFunction(() => document.getElementById("custom-orders-count")?.textContent === "5건 / 전체 5건");
  assert.equal(await page.locator('[data-custom-orders-toolbar="workflow"]').isVisible(), false);
  assert.equal(await page.locator('[data-custom-orders-toolbar="inbound"]').isVisible(), true);
  assert.equal(await page.locator("#custom-orders-sku-schedule-panel").isVisible(), true);
  assert.match(await page.locator("#custom-orders-sku-count").textContent(), /1개 SKU/);
  assert.equal(await page.locator(".inbound-expected-row").count(), 5);
  assert.equal(await page.locator(".custom-order-slip-card").count(), 0, "the inbound view must retain its existing row layout");
  assert.equal(await page.locator(".custom-order-supplier-group").count(), 0, "supplier group headers must be limited to the order-workflow view");
  assert.equal(await page.locator("#custom-orders-sort").isVisible(), false, "workflow sorting must not appear in the inbound view");
  assert.match(await page.locator('[data-inbound-row-key="O-2::R-2"]').textContent(), /명시적 삭제/);
  assert.match(await page.locator('[data-inbound-row-key="O-M::R-M"]').textContent(), /원천 주문행 없음/);
  assert.match(await page.locator('[data-inbound-row-key="O-LONLY::R-LONLY"]').textContent(), /SKU 일정/);
  await page.selectOption("#custom-orders-inbound-sort", "desc");
  assert.equal(await page.locator('.inbound-expected-row [data-inbound-expected-field="inbound_expected_date"]').first().inputValue(), "2026-10-15");
  await page.selectOption("#custom-orders-inbound-sort", "asc");
  assert.equal(await page.locator('.inbound-expected-row [data-inbound-expected-field="inbound_expected_date"]').first().inputValue(), "2026-10-06");
  await page.selectOption("#custom-orders-inbound-source", "legacy_sellpia");
  assert.equal(await page.locator(".inbound-expected-row").count(), 1);
  await page.selectOption("#custom-orders-inbound-source", "all");

  await page.fill("#custom-orders-sku-input", "DIRECT-SKU");
  await page.fill("#custom-orders-sku-date", "2026-10-17");
  await page.fill("#custom-orders-sku-own-code", "DIRECT-OWN");
  await page.click("#custom-orders-sku-save");
  await page.waitForFunction(() => window.__tables.sku_inbound_schedules.some((row) => row.sellpia_sku === "DIRECT-SKU" && row.inbound_expected_date === "2026-10-17"));
  assert.match(await page.locator("#custom-orders-sku-count").textContent(), /2개 SKU/);

  await page.click("#custom-orders-sku-download");
  await page.waitForFunction(() => window.__xlsxDownload);
  const download = await page.evaluate(() => window.__xlsxDownload);
  assert.match(download.filename, /^SKU_입고예정일_\d{4}-\d{2}-\d{2}\.xlsx$/);
  assert.deepEqual(download.workbook.Sheets["입고예정일"].__values[0], ["셀피아 SKU", "입고예정일", "자사코드"]);

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#custom-orders-sku-file").setInputFiles({
    name: "schedule.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("mock xlsx"),
  });
  await page.waitForFunction(() => window.__tables.sku_inbound_schedules.some((row) => row.sellpia_sku === "UPLOADED-SKU" && row.own_code === "UPLOADED-OWN"));
  assert.match(await page.locator("#custom-orders-sku-import-status").textContent(), /1개 SKU 일정을 업로드/);

  await page.fill("#custom-orders-inbound-search", "O-LONLY");
  assert.equal(await page.locator(".inbound-expected-row").count(), 1, "legacy-only rows must be searchable by order identity");
  const legacyOnly = page.locator('[data-inbound-row-key="O-LONLY::R-LONLY"]');
  await legacyOnly.locator('[data-inbound-expected-field="inbound_expected_date"]').fill("2026-10-12");
  await legacyOnly.locator('[data-inbound-expected-field="inbound_expected_date"]').press("Tab");
  await page.waitForFunction(() => window.__tables.order_item_operations.some((row) => row.ord_no === "O-LONLY" && row.inbound_expected_source === "manual" && row.inbound_expected_date === "2026-10-12"));
  assert.match(await page.locator('[data-inbound-row-key="O-LONLY::R-LONLY"]').textContent(), /수동/);
  await page.fill("#custom-orders-inbound-search", "");
  await page.click('[data-custom-orders-view="workflow"]');

  const after = await page.evaluate(() => window.__supabaseCalls.filter((entry) => entry.table === "order_item_operations" && entry.method === "not").length);
  assert.equal(after, 2, "custom-order and inbound operation queries must each lazy-load once on first tab entry");

  await page.evaluate((supplier) => {
    window.__tables.order_item_operations.find((row) => row.operation_id === "op-missing").supplier_cell_raw_snapshot = `  ${supplier}  `;
  }, maliciousSupplierRaw);
  await page.selectOption("#custom-orders-status", "received");
  await page.click("#custom-orders-refresh");
  await page.waitForFunction((supplier) => [...document.querySelectorAll(".custom-order-supplier-group")].some((group) => group.dataset.customOrderSupplier === supplier), maliciousSupplierRaw);
  const escapedSupplierGroup = page.locator(".custom-order-supplier-group").filter({ has: page.locator('[data-operation-id="op-missing"]') });
  assert.equal(await escapedSupplierGroup.getAttribute("data-custom-order-supplier"), maliciousSupplierRaw, "supplier group identity must use the trimmed effective raw supplier text");
  assert.equal(await escapedSupplierGroup.locator(".custom-order-supplier-group-head strong").textContent(), maliciousSupplierRaw, "snapshot supplier text must be preserved literally in the heading");
  assert.equal(await escapedSupplierGroup.locator(".custom-order-supplier-group-head strong *").count(), 0, "raw supplier markup must not create elements in a group heading");
  assert.equal(await page.evaluate(() => window.__supplierRawExecuted), undefined, "raw supplier text must never execute an event handler");

  for (const tab of ["dashboard", "picking", "shortage", "inspection", "cs", "completed", "custom-orders"]) {
    await page.click(`[data-app-tab="${tab}"]`);
    assert.equal(await page.locator(`[data-app-tab="${tab}"]`).evaluate((node) => node.classList.contains("active")), true);
  }
  assert.deepEqual(pageErrors, []);
  assert.equal(supabaseNetworkAttempts.api, 0, "the browser test must never attempt production Supabase API requests");
  assert.equal(
    supabaseNetworkAttempts.blocked,
    supabaseNetworkAttempts.storage,
    "every attempted Supabase Storage request must be intercepted and aborted before network access",
  );
  console.log("customOrderUi.browser.test: OK");
} finally {
  try {
    await context?.close();
  } finally {
    try {
      await browser?.close();
    } finally {
      if (server.listening) {
        await new Promise((resolve) => {
          server.close(resolve);
          server.closeAllConnections();
        });
      }
    }
  }
}
