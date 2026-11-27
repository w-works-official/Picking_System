// 2026-11-27 자사코드의 '낱' 글자만 밝은 노랑 배경 — 피킹하시는 분들이 자꾸 놓쳐서 (사장님 요청)
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app/pickingApp.mjs", import.meta.url), "utf8");
const css = await readFile(new URL("../src/styles/picking.css", import.meta.url), "utf8");
const slots = await readFile(new URL("../src/app/freeSlotsPanel.mjs", import.meta.url), "utf8");

const esc0 = app.slice(app.indexOf("function escapeHtml"), app.indexOf("\n}\n", app.indexOf("function escapeHtml")) + 3);
const own0 = app.slice(app.indexOf("function ownCodeHtml"), app.indexOf("\n}\n", app.indexOf("function ownCodeHtml")) + 3);
const { ownCodeHtml } = new Function(`${esc0}${own0}; return { ownCodeHtml };`)();
assert.equal(ownCodeHtml("낱[EA-11-01_3]"), '<mark class="own-code-loose">낱</mark>[EA-11-01_3]');
assert.equal(ownCodeHtml("[P] B-11-06 ]"), "[P] B-11-06 ]", "낱이 없으면 그대로");
assert.equal(ownCodeHtml("<낱>"), '&lt;<mark class="own-code-loose">낱</mark>&gt;', "다른 글자는 그대로 escape");
assert.ok((app.match(/\$\{ownCodeHtml\(/g) || []).length >= 14, "피킹 · 검품 · CS 화면의 자사코드 칸");
assert.doesNotMatch(app, /\$\{escapeHtml\((?:item|selected\.item|row\.item|display)\.ownCode \|\| "-"\)\}/, "화면 글자 칸은 모두 ownCodeHtml");
assert.match(css, /\.own-code-loose \{[^}]*background: #ffeb3b/);
assert.match(slots, /<td>\$\{loose\(m\.from\)\}<\/td>/);
assert.match(slots, /\.fs-loose\{background:#ffeb3b/);
console.log("ownCodeLoose.contract.test: OK");
