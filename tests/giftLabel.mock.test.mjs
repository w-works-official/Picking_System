import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app/pickingApp.mjs", import.meta.url), "utf8");
const pick = (name) => {
  const start = app.indexOf(`function ${name}(`);
  const end = app.indexOf("\n}\n", start) + 2;
  return app.slice(start, end);
};
const productNameHtml = new Function(`${pick("escapeHtml")}\n${pick("productNameHtml")}\nreturn productNameHtml;`)();

assert.equal(productNameHtml("(사은품)[사은품] 기본볼 3/4mm(3ea)"), '<span class="gift-label">(사은품)</span>[사은품] 기본볼 3/4mm(3ea)');
assert.equal(productNameHtml("기본볼 (사은품) 2개 (사은품)"), '기본볼 <span class="gift-label">(사은품)</span> 2개 <span class="gift-label">(사은품)</span>');
assert.equal(productNameHtml("[사은품] 괄호 다름"), "[사은품] 괄호 다름");
assert.equal(productNameHtml("<b>(사은품)</b>"), '&lt;b&gt;<span class="gift-label">(사은품)</span>&lt;/b&gt;', "other text stays escaped");
assert.equal(productNameHtml(null), "");
assert.equal((app.match(/\$\{productNameHtml\(product\)\}/g) || []).length, 3, "inspection, completed and picking card product names");
assert.match(app, /\$\{productNameHtml\(item\.productName \|\| ""\)\}/, "gold picking card product name");

console.log("giftLabel.mock.test: OK");
