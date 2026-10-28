import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startCsIntegrationPreview } from "./helpers/csIntegrationPreviewServer.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "outputs/ui-qa/phase2-cs");
const report = { checks: [], screenshots: [], externalRequests: [], businessRequests: [], pageErrors: [], csRequests: [] };
let preview;
let browser;
const pass = name => report.checks.push(name);
const sessionKey = "system-v3-picking-session-v1";

async function screenshot(page, filename) {
  await page.screenshot({ path: path.join(output, filename), fullPage: true });
  report.screenshots.push(filename);
}

async function pickingReady(page) {
  await page.locator("#app:not([hidden])").waitFor();
  await page.waitForFunction(() => document.querySelectorAll("#order-list [data-slot-key]").length > 0);
}

async function csReady(page) {
  await page.locator('[data-testid="company-workspace"]').waitFor();
  await page.locator("[data-inquiry-id]").first().waitFor();
  assert.equal(await page.locator("#order-list").count(), 0, "Picking runtime must not share the CS DOM");
}

async function clickAndWait(page, selector, pathname) {
  await Promise.all([page.waitForURL(url => url.pathname === pathname), page.locator(selector).click()]);
}

try {
  await mkdir(output, { recursive: true });
  const url = process.env.CS_INTEGRATION_TEST_URL || (preview = await startCsIntegrationPreview({ port: 0, root: process.env.CS_INTEGRATION_PREVIEW_ROOT || root })).url;
  const origin = new URL(url).origin;
  report.targetUrl = url;
  const manifestResponse = await fetch(new URL("cs/artifact-manifest.json", url));
  assert.equal(manifestResponse.status, 200, "The integrated CS artifact must include its provenance manifest");
  const manifestText = await manifestResponse.text();
  const manifest = JSON.parse(manifestText);
  report.artifact = {
    buildId: manifest.buildId, sourceCommit: manifest.sourceCommit,
    inputSnapshotSha256: manifest.inputSnapshotSha256,
    manifestSha256: createHash("sha256").update(manifestText).digest("hex"),
  };
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "Asia/Seoul", serviceWorkers: "block", permissions: ["clipboard-read", "clipboard-write"] });
  context.on("page", page => page.on("pageerror", error => report.pageErrors.push(error.message)));
  await context.route("**/*", async route => {
    const request = route.request();
    const target = new URL(request.url());
    if (!["http:", "https:"].includes(target.protocol)) return route.continue();
    const entry = { method: request.method(), url: target.href, kind: request.resourceType() };
    if (target.origin !== origin) { report.externalRequests.push(entry); return route.abort("blockedbyclient"); }
    if (request.method() !== "GET" || /\/(?:api|rest|functions)\//.test(target.pathname)) { report.businessRequests.push(entry); return route.abort("blockedbyclient"); }
    if (target.pathname.startsWith("/Picking_System/cs/")) report.csRequests.push(entry);
    return route.continue();
  });
  const page = await context.newPage();
  await page.goto(`${url}?write=0&events=0&previewLogin=1`, { waitUntil: "networkidle" });
  await page.locator("#picking-login-gate").waitFor();
  assert.equal(await page.locator("#app").isVisible(), false, "Picking stays locked before local mock login");
  await page.locator('[name="username"]').fill("local-preview");
  await page.locator('[name="password"]').fill("wrong-fixture-password");
  await page.locator('#picking-login-form [type="submit"]').click();
  await page.waitForFunction(() => document.getElementById("picking-login-status")?.textContent.includes("비밀번호"));
  assert.equal(await page.locator("#app").isVisible(), false);
  await page.locator('[name="password"]').fill("fixture-only");
  await page.locator('#picking-login-form [type="submit"]').click();
  await pickingReady(page);
  assert.equal(await page.locator("#metric-write").innerText(), "OFF");
  assert.equal(await page.locator("#metric-events").innerText(), "OFF");
  const initialToken = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)).token, sessionKey);
  assert.equal(initialToken, "0".repeat(64), "Only the explicit local fixture session is used");
  pass("existing-login-gate-wrong-credentials-and-local-session");

  assert.equal(await page.locator('[data-app-tab="cs"]').innerText(), "CS", "Existing logistics CS tab is retained");
  const existingTabs = await page.locator("[data-app-tab]").evaluateAll(nodes => nodes.map(node => node.dataset.appTab));
  assert.deepEqual(existingTabs, ["dashboard", "picking", "shortage", "inspection", "cs", "custom-orders", "completed"]);
  await page.locator("#search-input").fill("아트피어스");
  assert.ok(await page.locator("#order-list [data-slot-key]").count() > 0, "Normal order search remains usable");
  await page.locator("#search-input").fill("6890123456789".repeat(3));
  await page.waitForFunction(() => document.getElementById("search-input")?.value === "");
  assert.ok(await page.locator('#order-list [data-order-group="LOCAL-PICK-1"]').count() > 0, "Repeated scanner payload resolves the synthetic invoice");
  await page.locator("#jump-invoice-input").fill("6890123456789".repeat(2));
  await page.waitForFunction(() => document.getElementById("jump-invoice-input")?.value === "6890123456789");
  await page.locator("#jump-invoice-input").blur();
  await page.keyboard.press("4");
  await page.locator("#inspection-panel:not([hidden])").waitFor();
  await page.keyboard.press("q");
  assert.equal(await page.locator("#inspection-search-input").evaluate(node => node === document.activeElement), true);
  await page.locator("#inspection-search-input").blur();
  await page.keyboard.press("5");
  await page.locator("#cs-panel:not([hidden])").waitFor();
  assert.ok(await page.locator("#cs-list-sort").isVisible(), "Logistics CS controls stay separate and usable");
  await page.keyboard.press("2");
  await page.locator("#picking-panel:not([hidden])").waitFor();
  pass("existing-tabs-order-search-barcode-buffer-and-keyboard-shortcuts");

  await page.goto(`${url}?write=1&events=0&reorder=1&token=never-forward-this&returnUrl=https%3A%2F%2Fexample.invalid%2F#unsafe`, { waitUntil: "networkidle" });
  await pickingReady(page);
  const csLink = new URL(await page.locator("#workspace-cs-link").getAttribute("href"), page.url());
  assert.equal(csLink.pathname, "/Picking_System/cs/");
  assert.equal(csLink.search, "?write=1&events=0&reorder=1");
  assert.equal(csLink.hash, "");
  await screenshot(page, "picking-desktop.png");
  await page.locator("#workspace-picking-link").focus();
  await page.keyboard.press("Tab");
  assert.equal(await page.locator("#workspace-cs-link").evaluate(node => node === document.activeElement), true, "Existing global Tab shortcut must not trap the new navigation");
  await page.keyboard.press("Space");
  assert.equal(await page.evaluate(() => window.__previewTables.picking?.length ?? 0), 0, "A Space key on the navigation must not trigger a Picking mutation");
  await Promise.all([page.waitForURL(target => target.pathname === "/Picking_System/cs/"), page.keyboard.press("Enter")]);
  await csReady(page);
  assert.equal(new URL(page.url()).search, "?write=1&events=0&reorder=1");
  assert.equal(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)).token, sessionKey), initialToken);
  await screenshot(page, "cs-desktop.png");
  await page.reload({ waitUntil: "networkidle" });
  await csReady(page);
  // 2026-10-28: 사입 관리 링크가 CS 화면에서도 보여야 함 (같은 안전 쿼리만 전달)
  const csPurchaseLink = new URL(await page.locator("#workspace-purchase-link").getAttribute("href"), page.url());
  assert.equal(await page.locator("#workspace-purchase-link").innerText(), "사입 관리");
  assert.equal(csPurchaseLink.pathname, "/Picking_System/purchase/");
  assert.equal(csPurchaseLink.search, "?write=1&events=0&reorder=1");
  const backLink = new URL(await page.locator("#workspace-picking-link").getAttribute("href"), page.url());
  assert.equal(backLink.pathname, "/Picking_System/");
  assert.equal(backLink.search, "?write=1&events=0&reorder=1");
  await clickAndWait(page, "#workspace-picking-link", "/Picking_System/");
  await pickingReady(page);
  assert.equal(await page.locator("#picking-login-gate").isVisible(), false, "Returning preserves the existing Picking session");
  assert.equal(await page.locator("#metric-write").innerText(), "ON");
  assert.equal(await page.locator("#metric-events").innerText(), "OFF");
  await page.goBack({ waitUntil: "networkidle" }); await csReady(page);
  await page.goForward({ waitUntil: "networkidle" }); await pickingReady(page);
  pass("picking-cs-return-reload-back-forward-session-and-safe-query-preservation");

  // Mutations below affect the existing in-memory fixture, never a database.
  const pickToggle = page.locator('#order-list [data-action="toggle"]').first();
  await pickToggle.click();
  await page.waitForFunction(() => window.__previewTables.picking?.some(row => row.is_checked === true));
  assert.equal(await pickToggle.evaluate(node => node.classList.contains("checked")), true);
  await page.locator('[data-app-tab="inspection"]').click();
  await page.locator("#inspection-panel:not([hidden])").waitFor();
  assert.ok(await page.locator("#inspection-detail").isVisible());
  pass("existing-picking-toggle-and-inspection-render-use-memory-only");

  await page.goto(`${url}cs/?write=1&write=0&events=wrong&reorder=1&access_token=never-forward-this&return=https%3A%2F%2Fexample.invalid`, { waitUntil: "networkidle" });
  await csReady(page);
  const invalidBack = new URL(await page.locator("#workspace-picking-link").getAttribute("href"), page.url());
  assert.equal(invalidBack.origin, origin);
  assert.equal(invalidBack.pathname, "/Picking_System/");
  assert.equal(invalidBack.search, "?write=0&events=0&reorder=1");
  await clickAndWait(page, "#workspace-picking-link", "/Picking_System/"); await pickingReady(page);
  assert.equal(await page.locator("#metric-write").innerText(), "OFF");
  assert.equal(await page.locator("#metric-events").innerText(), "OFF");
  pass("direct-cs-entry-rejects-duplicate-invalid-and-sensitive-url-parameters");

  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 960 });
    const navBounds = await page.locator('.workspace-navigation').boundingBox();
    assert.ok(navBounds && navBounds.x >= 0 && navBounds.x + navBounds.width <= width + 1, `Picking top navigation fits ${width}px`);
    await screenshot(page, `picking-${width}.png`);
    await clickAndWait(page, "#workspace-cs-link", "/Picking_System/cs/"); await csReady(page);
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(dimensions.scroll <= dimensions.viewport + 1, `CS has no horizontal overflow at ${width}px: ${JSON.stringify(dimensions)}`);
    await screenshot(page, `cs-${width}.png`);
    await clickAndWait(page, "#workspace-picking-link", "/Picking_System/"); await pickingReady(page);
  }
  pass("desktop-tablet-mobile-navigation-and-independent-cs-layout");

  assert.deepEqual(report.externalRequests, [], "All integrated preview resources must stay local");
  assert.deepEqual(report.businessRequests, [], "Browser must attempt zero business API requests");
  assert.deepEqual(report.pageErrors, [], "No browser runtime error during integration flows");
  assert.ok(report.csRequests.some(request => /\/assets\/.*\.js$/.test(new URL(request.url).pathname)), "The actual copied static CS bundle is loaded");
  pass("static-cs-assets-and-zero-external-or-business-api-network-requests");
  report.result = "passed";
  await context.close();
  console.log(`CS integration browser: ${report.checks.length} flows passed; external/business API requests 0; ${report.screenshots.length} screenshots.`);
} catch (error) {
  report.result = "failed";
  report.failure = { message: error.message, stack: error.stack };
  throw error;
} finally {
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "integration-report.json"), JSON.stringify(report, null, 2));
  await browser?.close();
  await preview?.close();
}
