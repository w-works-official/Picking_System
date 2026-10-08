import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import "../src/auth/pickingAuth.js";
import "../tools/picking-tool-auth.js";

const scraper = await readFile(new URL("../tools/sellpia_scraper.html", import.meta.url), "utf8");
const scripts = [...scraper.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
const elements = new Map();
const getElementById = (id) => {
  if (!elements.has(id)) elements.set(id, { href: "", textContent: "", removeAttribute(name) { delete this[name]; } });
  return elements.get(id);
};
const setupContext = vm.createContext({
  securePickingBookmarklet: globalThis.securePickingBookmarklet,
  console: { error() {}, warn() {}, log() {} },
  document: { getElementById },
});
scripts.forEach((script) => vm.runInContext(script, setupContext));
const generated = decodeURIComponent(getElementById("bookmarklet-link").href.replace(/^javascript:/, ""));
new Function(generated);
assert.equal(getElementById("code-display").textContent, generated, "copied code and bookmark link must use the same complete source");

const collectionStart = generated.indexOf("async function runScraper(");
const enrichmentStart = generated.indexOf("async function enrichOrderDateTimes(");
const enrichmentEnd = generated.indexOf("function hasOrderMemoOverride", enrichmentStart);
assert.ok(collectionStart >= 0 && enrichmentStart >= 0 && enrichmentEnd > enrichmentStart);
assert.equal((generated.match(/sellpia_arbitrary_field_raw:sellpiaArbitraryFieldRaw\(it\)/g) || []).length, 1);
assert.match(generated.slice(collectionStart), /sellpia_arbitrary_field_raw:sellpiaArbitraryFieldRaw\(it\)/);
assert.doesNotMatch(generated.slice(enrichmentStart, enrichmentEnd), /sellpia_arbitrary_field_raw/, "datetime enrichment must not collect this field");
assert.match(generated, /p_code:String\(it\.c_p_code\|\|""\),p_dpcode:String\(it\.c_dp_code\|\|""\)/);
assert.match(generated, /prod_code:String\(it\.c_dp_code\|\|""\)/, "the existing own-code mapping must remain independent");
assert.doesNotMatch(generated, /arbitrary_field_raw_snapshot/, "the scraper must not write operator-owned snapshots");

const headerStart = generated.indexOf("function cleanSellpiaHeaderLabel");
const headerEnd = generated.indexOf("\n", headerStart);
const resolverStart = generated.indexOf("function getSellpiaArbitraryFieldColumn");
const resolverEnd = generated.indexOf("\n", resolverStart);
const readerStart = generated.indexOf("function sellpiaArbitraryFieldRaw");
const readerEnd = generated.indexOf("\n", readerStart);
assert.ok(headerStart >= 0 && headerEnd > headerStart && resolverStart >= 0 && resolverEnd > resolverStart && readerStart >= 0 && readerEnd > readerStart);

let columns = [{ name: "임의필드", field: "observed_header_field", id: "wrong_id" }];
const window = { grid: { getColumns: () => columns } };
const helperContext = vm.createContext({ window });
vm.runInContext([
  generated.slice(headerStart, headerEnd),
  generated.slice(resolverStart, resolverEnd),
  generated.slice(readerStart, readerEnd),
  "globalThis.readArbitrary=sellpiaArbitraryFieldRaw;",
].join("\n"), helperContext);
const readArbitrary = (row) => helperContext.readArbitrary(row);

assert.equal(readArbitrary({ observed_header_field: "  0012-A\n ", wrong_id: "wrong" }), "  0012-A\n ", "raw spaces, line breaks and leading zeros must survive");
assert.equal(readArbitrary({ observed_header_field: 0 }), "0", "numeric zero is a present value");
assert.equal(readArbitrary({ observed_header_field: "" }), "", "an explicitly empty raw cell remains empty");
assert.equal(readArbitrary({ observed_header_field: " \t " }), " \t ");
assert.equal(readArbitrary({ observed_header_field: null }), null);
assert.equal(readArbitrary({}), null);
assert.equal(readArbitrary(null), null);
assert.equal(readArbitrary(Object.create({ observed_header_field: "inherited" })), null);

columns = [{ title: "<b> 임의 &nbsp; 필드 </b>", id: "observed_id" }];
assert.equal(readArbitrary({ observed_id: "0009", observed_header_field: "old" }), "0009", "header normalization and id fallback must use the current column without a stale cache");
columns = [{ name: "임의필드1", field: "first" }, { name: "임의필드2", field: "second" }];
assert.equal(readArbitrary({ first: "wrong1", second: "wrong2", c_user_field: "guessed", c_dp_code: "OWN-1" }), null, "numbered or guessed fields must not substitute for the exact header");
columns = [{ name: "임의필드", field: "first" }, { name: "임의 필드", field: "second" }];
assert.equal(readArbitrary({ first: "one", second: "two" }), null, "duplicate normalized exact headers are ambiguous");
columns = [{ name: "임의필드" }];
assert.equal(readArbitrary({ c_user_field: "guessed" }), null, "a label without a field or id cannot identify a value");
columns = [];
assert.equal(readArbitrary({ observed_id: "stale" }), null);
window.grid.getColumns = () => { throw new Error("optional column unavailable"); };
assert.equal(readArbitrary({ observed_id: "value" }), null, "optional header failure must not abort collection");
window.grid.getColumns = () => [{ name: "임의필드", field: "value" }];
const failingRow = Object.defineProperty({}, "value", { get() { throw new Error("optional value unavailable"); } });
assert.equal(readArbitrary(failingRow), null, "optional cell failure must not abort collection");
window.grid = null;
assert.equal(readArbitrary({ value: "value" }), null);

console.log("sellpiaArbitraryFieldRaw.mock.test: OK");
