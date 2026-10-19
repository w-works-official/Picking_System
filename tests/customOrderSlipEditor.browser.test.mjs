import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const server = spawn(process.execPath, ["tests/helpers/customOrderPreviewServer.mjs"], { env: { ...process.env, CUSTOM_ORDER_PREVIEW_PORT: "0" }, stdio: ["ignore", "pipe", "pipe"] });
let browser;
try {
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Local preview startup timed out")), 15000);
    let output = "";
    server.once("error", (error) => { clearTimeout(timeout); reject(error); });
    server.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/CUSTOM_ORDER_PREVIEW_READY (http:\/\/127\.0\.0\.1:\d+\/\?write=1)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: "block", timezoneId: "Asia/Seoul" });
  const page = await context.newPage();
  const errors = [], external = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin === new URL(url).origin) return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  await page.goto(url);
  await page.getByRole("button", { name: "주문제작", exact: true }).click();
  const first = page.locator('[data-operation-id="preview-before"]');
  await first.waitFor();
  assert.equal(await page.locator("#custom-orders-edit, #custom-orders-edit-save, #custom-orders-edit-cancel").count(), 0, "no global editing mode may remain");
  assert.equal(await first.locator("[data-slip-field]").count(), 6, "fields must be editable without an edit-mode click");
  const source = await page.evaluate(() => JSON.stringify({ orders: window.__previewTables.orders, items: window.__previewTables.order_items }));
  const ids = () => page.locator(".custom-order-slip-card").evaluateAll((nodes) => nodes.map((node) => node.dataset.operationId));
  const dragPointer = async (handle, target, after = false) => {
    const start = await handle.boundingBox(), end = await target.boundingBox();
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x + start.width / 2 - 12, start.y + start.height / 2, { steps: 3 });
    await page.mouse.move(end.x + 40, after ? end.y + end.height - 8 : end.y + 8, { steps: 12 });
    assert.equal(await page.locator(".custom-order-drag-hint").count(), 1);
    await page.mouse.up();
  };
  const waitValue = (key, value) => page.waitForFunction(({ key, value }) => {
    const row = window.__previewTables.order_item_operations.find((entry) => entry.operation_id === "preview-before");
    return (key === "internal_memo" ? row.internal_memo : row.slip_overrides[key]) === value
      && document.getElementById("custom-orders-edit-status").textContent.includes("자동 저장됨");
  }, { key, value });
  await first.locator("[data-slip-memo]").fill("메모 즉시 입력");
  await first.locator("[data-slip-memo]").press("Tab");
  await waitValue("internal_memo", "메모 즉시 입력");
  const values = { supplierCellRaw: "수동 조합 업체", productName: '<img src=x onerror="window.__slipXss=true"> 낱개 주문', optionName: "골드 + 실버", barLength: "8바", supplierCode: "VENDOR-PAIR", quantity: "4" };
  for (const [key, value] of Object.entries(values)) {
    await first.locator(`[data-slip-field="${key}"]`).fill(value);
    await first.locator(`[data-slip-field="${key}"]`).press("Enter");
    await waitValue(key, key === "quantity" ? Number(value) : value);
  }
  assert.equal(await page.evaluate(() => Boolean(window.__slipXss)), false);
  assert.equal(await page.evaluate(() => JSON.stringify({ orders: window.__previewTables.orders, items: window.__previewTables.order_items })), source);
  const originalIds = await ids();
  const secondId = originalIds[originalIds.indexOf("preview-before") + 1];
  assert.ok(secondId, "drag fixture must have an adjacent following card");
  const target = page.locator(`[data-operation-id="${secondId}"]`);
  await first.evaluate((node, targetId) => {
    const list = node.closest("#custom-orders-list");
    const next = [...list.querySelectorAll("[data-operation-id]")].find((card) => card.dataset.operationId === targetId);
    // Both drag endpoints must be visible in this nested scrolling list before
    // Playwright calculates mouse coordinates; scrolling after mousedown is not a drag.
    const bounds = list.getBoundingClientRect();
    list.scrollTop += (node.getBoundingClientRect().top + next.getBoundingClientRect().bottom) / 2 - (bounds.top + list.clientHeight / 2);
  }, secondId);
  const targetSupplier = await target.locator('[data-slip-field="supplierCellRaw"]').inputValue();
  await dragPointer(first.locator("[data-slip-drag]"), target, true);
  await page.waitForFunction(() => document.getElementById("custom-orders-edit-status").textContent.includes("목록 순서가 저장"));
  assert.equal(await page.locator("#custom-orders-sort").inputValue(), "manual");
  const moved = await ids();
  assert.ok(moved.indexOf("preview-before") > moved.indexOf(secondId), "dragging a card handle must move and save it without another save click");
  assert.equal(await first.locator('[data-slip-field="supplierCellRaw"]').inputValue(), targetSupplier, "cross-supplier drop must reassign the slip to its destination supplier");
  assert.equal(await first.evaluate((node) => node.closest("[data-custom-order-supplier]").dataset.customOrderSupplier), targetSupplier);
  assert.equal(await page.locator('[data-custom-order-supplier="수동 조합 업체"]').count(), 0, "the old supplier heading must not follow the transferred card");
  const groups = await page.locator("[data-custom-order-supplier]").evaluateAll((nodes) => nodes.map((node) => node.dataset.customOrderSupplier));
  assert.equal(new Set(groups).size, groups.length, "supplier headers may never split or repeat due to manual positions");
  assert.equal(await page.evaluate(() => JSON.stringify({ orders: window.__previewTables.orders, items: window.__previewTables.order_items })), source);
  await first.locator('[data-slip-move="up"]').click();
  await page.waitForFunction(() => document.getElementById("custom-orders-edit-status").textContent.includes("목록 순서가 저장"));
  assert.ok((await ids()).indexOf("preview-before") < moved.indexOf("preview-before"), "one arrow click must move and save immediately");
  const savedIds = await ids();
  await page.reload();
  await page.getByRole("button", { name: "주문제작", exact: true }).click();
  await first.waitFor();
  assert.deepEqual(await ids(), savedIds);
  assert.equal(await first.locator('[data-slip-field="quantity"]').inputValue(), "4");
  assert.equal(await first.locator("[data-slip-memo]").inputValue(), "메모 즉시 입력");
  assert.equal(await first.locator('[data-slip-field="supplierCellRaw"]').inputValue(), targetSupplier, "destination assignment must survive reload");
  await page.evaluate(() => { window.__previewSlipDelayMs = 250; });
  await first.locator("[data-slip-memo]").fill("메모 입력 후 이동 한 번");
  await first.locator('[data-slip-move="down"]').click();
  await page.waitForFunction(() => document.getElementById("custom-orders-edit-status").textContent.includes("목록 순서가 저장"));
  assert.equal(await first.locator("[data-slip-memo]").inputValue(), "메모 입력 후 이동 한 번");
  assert.ok((await ids()).indexOf("preview-before") > savedIds.indexOf("preview-before"), "one move click must wait for the memo's blur-save and still complete the move");
  await first.locator('[data-slip-move="up"]').click();
  await page.waitForFunction(() => document.getElementById("custom-orders-edit-status").textContent.includes("목록 순서가 저장"));
  await first.locator('[data-slip-field="optionName"]').fill("느린 저장 옵션");
  await first.locator('[data-slip-field="barLength"]').focus();
  await first.locator('[data-slip-field="barLength"]').fill("12바");
  await waitValue("optionName", "느린 저장 옵션");
  assert.equal(await first.locator('[data-slip-field="barLength"]').inputValue(), "12바");
  assert.equal(await first.locator('[data-slip-field="barLength"]').evaluate((node) => document.activeElement === node), true, "autosave must preserve focus in the next field");
  await first.locator('[data-slip-field="barLength"]').press("Enter");
  await waitValue("barLength", "12바");
  await page.evaluate(() => { window.__previewSlipDelayMs = 0; });
  await first.locator('[data-slip-field="quantity"]').fill("-1");
  await first.locator('[data-slip-field="quantity"]').press("Enter");
  await first.locator("[data-slip-discard]").waitFor();
  assert.equal(await first.locator('[data-slip-field="quantity"]').inputValue(), "-1");
  assert.equal(await page.evaluate(() => window.__previewTables.order_item_operations.find((row) => row.operation_id === "preview-before").slip_overrides.quantity), 4);
  await first.locator("[data-slip-discard]").click();
  assert.equal(await first.locator('[data-slip-field="quantity"]').inputValue(), "4");
  await page.evaluate(() => { window.__previewSlipSaveFailure = true; });
  await first.locator("[data-slip-memo]").fill("실패해도 유지할 메모");
  await first.locator("[data-slip-memo]").press("Enter");
  await first.locator("[data-slip-retry]").waitFor();
  assert.equal(await first.locator("[data-slip-memo]").inputValue(), "실패해도 유지할 메모");
  await page.evaluate(() => { window.__previewSlipSaveFailure = false; });
  await first.locator("[data-slip-retry]").click();
  await waitValue("internal_memo", "실패해도 유지할 메모");
  await first.locator('[data-slip-field="quantity"]').fill("7");
  await page.evaluate(() => { window.__previewTables.order_item_operations.find((row) => row.operation_id === "preview-before").updated_at = "2030-01-01T00:00:00Z"; });
  await first.locator('[data-slip-field="quantity"]').press("Enter");
  await page.waitForFunction(() => document.getElementById("custom-orders-edit-status").textContent.includes("다른 작업자"));
  await first.locator("[data-slip-discard]").click();
  await page.locator("#custom-orders-refresh").click();
  await page.locator("#custom-orders-status").selectOption("cancelled");
  const cancelled = page.locator('[data-operation-id="preview-cancelled"]');
  await cancelled.locator("[data-slip-memo]").fill("취소 건도 바로 메모");
  await cancelled.locator("[data-slip-memo]").press("Enter");
  await page.waitForFunction(() => window.__previewTables.order_item_operations.find((row) => row.operation_id === "preview-cancelled").internal_memo === "취소 건도 바로 메모");
  assert.equal(await page.evaluate(() => window.__previewTables.order_item_operations.find((row) => row.operation_id === "preview-cancelled").custom_cancelled_at), "2026-10-01T04:00:00Z");
  await page.locator("#custom-orders-status").selectOption("active");
  for (const width of [1920, 1240]) {
    await page.setViewportSize({ width, height: 1080 });
    const geometry = await first.evaluate((card) => {
      const primary = card.querySelector(".custom-order-row-primary").getBoundingClientRect();
      const management = card.querySelector(".custom-order-slip-management").getBoundingClientRect();
      return { sideBySide: primary.right <= management.left + 1, clipped: card.scrollHeight - card.clientHeight };
    });
    assert.equal(geometry.sideBySide, true);
    assert.ok(geometry.clipped <= 1);
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await first.locator("[data-slip-drag]").scrollIntoViewIfNeeded();
  const handleBounds = await first.locator("[data-slip-drag]").boundingBox();
  const beforeCancel = await ids();
  await page.mouse.move(handleBounds.x + 10, handleBounds.y + 10);
  await page.mouse.down();
  await page.mouse.move(handleBounds.x - 20, handleBounds.y + 10, { steps: 4 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.deepEqual(await ids(), beforeCancel, "Escape must cancel without writes");
  await first.locator("[data-slip-drag]").scrollIntoViewIfNeeded();
  const outsideHandle = await first.locator("[data-slip-drag]").boundingBox();
  await page.mouse.move(outsideHandle.x + 10, outsideHandle.y + 10);
  await page.mouse.down();
  await page.mouse.move(10, 10, { steps: 12 });
  await page.mouse.up();
  assert.deepEqual(await ids(), beforeCancel, "dropping outside the list must not change supplier or order");
  // A header is a real destination. Hold near the list's top edge to exercise
  // auto-scroll, then drop into a different supplier without moving its heading.
  await first.locator("[data-slip-drag]").scrollIntoViewIfNeeded();
  const dragStart = await first.locator("[data-slip-drag]").boundingBox();
  const listBounds = await page.locator("#custom-orders-list").boundingBox();
  const initialScroll = await page.locator("#custom-orders-list").evaluate((node) => node.scrollTop);
  assert.ok(initialScroll > 0);
  await page.mouse.move(dragStart.x + 10, dragStart.y + 10);
  await page.mouse.down();
  await page.mouse.move(listBounds.x + 80, listBounds.y + 4, { steps: 15 });
  await page.waitForFunction((before) => document.getElementById("custom-orders-list").scrollTop < before - 20, initialScroll);
  await page.waitForFunction(() => document.getElementById("custom-orders-list").scrollTop === 0);
  const destination = page.locator(".custom-order-supplier-group-head").first();
  const destinationSupplier = await destination.evaluate((node) => node.closest("[data-custom-order-supplier]").dataset.customOrderSupplier);
  const destinationBounds = await destination.boundingBox();
  await page.mouse.move(destinationBounds.x + 80, destinationBounds.y + 12, { steps: 4 });
  await page.waitForFunction(() => Boolean(document.querySelector(".slip-drop-group")));
  await page.mouse.up();
  await page.waitForFunction(() => document.getElementById("custom-orders-edit-status").textContent.includes("목록 순서가 저장"));
  assert.equal(await first.locator('[data-slip-field="supplierCellRaw"]').inputValue(), destinationSupplier);
  assert.equal(await first.evaluate((node) => node.closest("[data-custom-order-supplier]").querySelector("[data-operation-id]").dataset.operationId), "preview-before", "header drop inserts into destination group, not into a copied supplier section");
  await page.evaluate(() => { window.__previewSlipSaveFailure = true; });
  const beforeFailedMove = await ids();
  await first.locator('[data-slip-move="down"]').click();
  await page.waitForFunction(() => document.getElementById("custom-orders-edit-status").textContent.includes("순서 저장 실패"));
  assert.deepEqual(await ids(), beforeFailedMove);
  await page.goto(url.replace("write=1", "write=0"));
  await page.getByRole("button", { name: "주문제작", exact: true }).click();
  await first.waitFor();
  assert.equal(await first.locator("[data-slip-memo]").isDisabled(), true);
  assert.equal(await first.locator('[data-slip-field="quantity"]').isDisabled(), true);
  assert.equal(await first.locator("[data-slip-drag]").isDisabled(), true);
  await context.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(external, [], "no production API or Storage request may leave this preview");
  console.log("customOrderSlipEditor.browser.test: OK (inline autosave, drag, one-click move, focus, reload, failures, source preservation)");
} finally {
  await browser?.close();
  server.kill();
}
