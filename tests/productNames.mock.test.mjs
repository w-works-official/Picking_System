// 상품 관리 · 상품명 요청 (2026-10-29) — 순수 계산 + 화면 파일 계약
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { NAME_COUNTS, NAME_DEFAULT_COUNT, nameRequestPayload, parseNameResponse } from "../src/domain/productNames.mjs";

assert.deepEqual(NAME_COUNTS, [3, 5, 10]);
assert.deepEqual(nameRequestPayload({ keywords: "  써지컬 링  ", count: "10", editor: "대표님" }), { action: "name", keywords: "써지컬 링", count: 10, editor: "대표님" });
assert.equal(nameRequestPayload({ keywords: "a", count: 7 }).count, NAME_DEFAULT_COUNT, "only 3/5/10");
assert.equal(nameRequestPayload({ keywords: "a", editor: "x".repeat(50) }).editor.length, 20);
assert.throws(() => nameRequestPayload({ keywords: "   " }), /키워드·메모를 넣어/);
assert.throws(() => nameRequestPayload({ keywords: "x".repeat(2001) }), /2000자/);
assert.equal("token" in nameRequestPayload({ keywords: "a" }), false, "token is added only when sending");

assert.deepEqual(parseNameResponse({ ok: true, names: [" 링  피어싱 ", "링 피어싱", "", null, "볼 피어싱"] }), ["링 피어싱", "볼 피어싱"]);
assert.throws(() => parseNameResponse({ ok: true, names: [] }), /만들지 못했습니다/);
assert.throws(() => parseNameResponse(null), /읽지 못했습니다/);
const denied = (() => { try { parseNameResponse({ ok: false, denied: true, error: "비밀번호가 맞지 않습니다." }); } catch (e) { return e; } })();
assert.equal(denied.denied, true);
assert.match(denied.message, /비밀번호/);

const [page, panel, sheet] = await Promise.all(["../purchase/index.html", "../src/app/productNamePanel.mjs", "../docs/cs-board-sheet.gs"].map((f) => readFile(new URL(f, import.meta.url), "utf8")));
assert.match(page, /data-purchase-tab="naming">상품명 요청</);
assert.match(page, /data-purchase-panel="naming"[^>]*hidden/);
assert.match(page, /<div class="product-names" data-product-names><\/div>/);
assert.match(page, /productNamePanel\.mjs\?v=20261029-names1/);
assert.match(panel, />상품명 요청하기</);
assert.match(panel, /"Content-Type": "text\/plain;charset=utf-8"/);
assert.match(panel, /if \(!state\.token\) \{ state\.token = token; writeToken\(storage, token\); \} \/\/ 맞는 비밀번호일 때만 저장/);
assert.doesNotMatch(panel, /claude\.ai|api\.anthropic\.com|x-api-key/, "AI key stays in the sheet script");
assert.match(sheet, /var staff = \[[^\]]*'name'\]/, "sheet name action is staff-token only");
console.log("productNames.mock.test: OK");
