import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app/pickingApp.mjs", import.meta.url), "utf8");
const pick = (name) => {
  const start = app.indexOf(`function ${name}(`);
  return app.slice(start, app.indexOf("\n}\n", start) + 2);
};
const { invoiceHasGiftItem, giftCheckBadge } = new Function(
  "itemIsEffectivelyCancelled",
  `${pick("invoiceHasGiftItem")}\n${pick("giftCheckBadge")}\nreturn { invoiceHasGiftItem, giftCheckBadge };`,
)((_invoice, item) => Boolean(item.cancelled));

const gift = { productName: "(사은품)[사은품] 기본볼 3/4mm(3ea)" };
const normal = { productName: "써지컬 바 피어싱 하트&스타" };
const bracketOnly = { productName: "[사은품] 기본볼" };

assert.equal(invoiceHasGiftItem({ items: [normal, gift] }), true);
assert.equal(invoiceHasGiftItem({ items: [normal, bracketOnly] }), false, "only (사은품) with parentheses counts");
assert.equal(invoiceHasGiftItem({ items: [normal, { ...gift, cancelled: true }] }), false, "cancelled gift rows do not count");
assert.equal(invoiceHasGiftItem({ items: [] }), false);
assert.doesNotMatch(giftCheckBadge({ items: [gift] }), /no-gift/);
assert.match(giftCheckBadge({ items: [normal] }), /class="workflow-row-badge gift no-gift"/);
assert.match(app, /\$\{totalAmount >= 20000 \? giftCheckBadge\(invoice\) : ""\}/, "badge still only appears at 20,000원 or more");

const css = await readFile(new URL("../src/styles/picking.css", import.meta.url), "utf8");
assert.match(css, /\.workflow-row-badge\.gift\.no-gift \{\s*color: var\(--red\);/);

console.log("giftCheckBadge.mock.test: OK");
