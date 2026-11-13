// 11-13 대표님 요청: 수량 2개 이상 강조 · 휴대폰 상위 버튼 로고 옆 · CS 관리 핑크 탭
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const app = readFileSync(new URL("../src/app/pickingApp.mjs", import.meta.url), "utf8");
assert.match(app, /function qtyMultiClass\(item\) \{\s*return \(Number\(item\?\.quantity\) \|\| 1\) >= 2 \? " qty-multi" : "";/);
assert.equal((app.match(/qtyMultiClass\(item\)/g) || []).length, 8, "트레이 · 골드 · 검품·피킹 줄 6곳 · 수량 칸");
const css = readFileSync(new URL("../src/styles/picking.css", import.meta.url), "utf8");
assert.match(css, /\.qty-multi \{[^}]*color: #e11d48/);
assert.match(css, /\.qty-tile\.qty-multi \{[^}]*background: #e11d48/);
const nav = readFileSync(new URL("../src/styles/workspaceNavigation.css", import.meta.url), "utf8");
assert.match(nav, /@media \(max-width: 720px\) \{\s*header\.topbar, header\.cs-topbar, header\.purchase-topbar \{ flex-wrap: wrap;/, "휴대폰: 로고 옆 한 줄");
const cs = readFileSync(new URL("../src/styles/csBoard.css", import.meta.url), "utf8");
assert.match(cs, /\.cs-main > \.cs-left-tabs \.cs-left-tab\[class\*="tab-"\] \{ background: #ffe4e6; color: #e11d48; font-weight: 900;/);
console.log("qtyMultiStyle.contract.test: OK");
