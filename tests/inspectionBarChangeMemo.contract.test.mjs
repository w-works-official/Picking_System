// 2026-11-09 검품 주문창: 상품순서번호 밑 [바변경] 미니메모 · 머리글 한 줄
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app/pickingApp.mjs", import.meta.url), "utf8");
const css = await readFile(new URL("../src/styles/picking.css", import.meta.url), "utf8");

const start = app.indexOf("function barChangeInfo");
const end = app.indexOf("function optionClass", start);
const escapeHtml = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const { barChangeInfo, optionHasBarChange, barChangeMemoHtml } = new Function("escapeHtml", `${app.slice(start, end)}; return { barChangeInfo, optionHasBarChange, barChangeMemoHtml };`)(escapeHtml);

const opt = (optionName) => ({ optionName });
assert.deepEqual(barChangeInfo(opt("골드 / 바 길이 변경(주문제작/취소불가): 10mm바")), { length: "10mm" });
assert.deepEqual(barChangeInfo(opt("실버, 바변경 8mm")), { length: "8mm" });
assert.deepEqual(barChangeInfo(opt("바 변경")), { length: "" });
assert.equal(barChangeInfo(opt("바 길이 변경: 없음")), null, "변경 없음은 아님");
assert.equal(barChangeInfo(opt("바길이변경 안함")), null);
assert.equal(barChangeInfo(opt("골드 8mm바")), null, "그냥 바 길이는 변경 아님");
assert.equal(barChangeInfo(opt("실버,바변경:일반바6mm(기본)")), null, "(기본) 표시 = 기본 바길이 → 변경 아님");
assert.equal(barChangeInfo(opt("골드,바변경:8mm(기본)")), null, "8mm 가 기본인 상품도 (기본) 이면 변경 아님");
assert.equal(barChangeInfo(opt("바변경:6mm( 기본 )")), null);
assert.deepEqual(barChangeInfo(opt("실버,바변경:일반바6mm")), { length: "6mm" }, "(기본) 표시가 없으면 변경");
assert.deepEqual(barChangeInfo(opt("실버,바변경:롱바8mm")), { length: "8mm" }, "기본이 아닌 값은 변경");
assert.deepEqual(barChangeInfo(opt("실버,바변경:일반바6mm(기본),골드")), null);
assert.equal(optionHasBarChange({ optionName: "", raw: { p_option: "바변경 6mm" } }), true, "원본 옵션도 봄");
assert.equal(barChangeMemoHtml(opt("골드")), "");
assert.match(barChangeMemoHtml(opt("바 길이 변경(주문제작/취소불가): 10mm바")), /class="bar-change-memo"[^>]*>바변경<b>10mm<\/b><\/em>/);

// 검품 표 두 곳(검품 탭 · CS 주문창) 모두 번호 칸에 붙음
assert.equal((app.match(/<span class="workflow-seq-cell">\$\{itemSequenceNo\(item, index\)\}\$\{barChangeMemoHtml\(item\)\}<\/span>/g) || []).length, 2);
// 번호 칸 넓힘 + 머리글 한 줄
assert.match(css, /\.inspection-item-table\.is-code-stacked \.workflow-item-row \{ grid-template-columns: 84px /);
assert.match(css, /\.inspection-item-table \.workflow-item-header > span:first-child \{ white-space: nowrap; \}/);
assert.match(css, /\.bar-change-memo \{[^}]*background: #fff1f2[^}]*color: #dc2626/);
console.log("inspectionBarChangeMemo.contract.test: OK");
