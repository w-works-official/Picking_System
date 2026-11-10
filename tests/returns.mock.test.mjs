// ↩ CS 관리 › 반품기록 (11-10) — 찾기 · 화면 계약
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filterReturns } from "../src/app/returnsPanel.mjs";

const items = [
  { id: "a", who: "홍길동 / 111", item: "14K 링", reason: "사이즈", memo: "", status: "접수", by: "유지영" },
  { id: "b", who: "김철수", item: "볼 피어싱", reason: "불량", memo: "환불함", status: "끝", by: "" },
];
assert.deepEqual(filterReturns(items, { status: "열림" }).map((x) => x.id), ["a"], "열림 = 끝 아닌 것");
assert.deepEqual(filterReturns(items, { status: "끝" }).map((x) => x.id), ["b"]);
assert.deepEqual(filterReturns(items, {}).map((x) => x.id), ["a", "b"]);
assert.deepEqual(filterReturns(items, { q: "환불" }).map((x) => x.id), ["b"]);
assert.deepEqual(filterReturns(items, { q: "14k 사이즈" }).map((x) => x.id), ["a"], "낱말 모두");
const html = readFileSync(new URL("../cs/index.html", import.meta.url), "utf8");
assert.match(html, /data-left-tab="ship"[^>]*>🚚 배송기록<\/button>\s*<button[^>]*data-left-tab="ret"[^>]*>↩ 반품기록<\/button>/, "배송기록 옆");
assert.match(html, /data-right-panel="ret" hidden>\s*<div class="rt" data-ret><\/div>/);
const app = readFileSync(new URL("../src/app/csBoardApp.mjs", import.meta.url), "utf8");
assert.match(app, /if \(tab === "ret"\) openRet\(\);/);
assert.match(app, /import\("\.\/returnsPanel\.mjs\?v=20261110-ret1"\)/);
const panel = readFileSync(new URL("../src/app/returnsPanel.mjs", import.meta.url), "utf8");
for (const t of ['action: "retList"', 'action: "retSave"', "base: it.version", "＋ 새 반품"]) assert.ok(panel.includes(t), t);
console.log("returns.mock.test: OK");
