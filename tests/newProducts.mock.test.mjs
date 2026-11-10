// 🆕 신상품 등록 (11-10) — 업데이트 순서 시트 동기화: 칸 번호 · 진행 표시 · 찾기 · 🤖 Claude 글 · 화면 계약
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COL, MAIN_FIELDS, STEPS, allDone, claudeLink, claudePrompt, colName, filterRows, isHtml, labelOf, preview, stepsOf } from "../src/domain/newProducts.mjs";

assert.deepEqual([colName(0), colName(3), colName(25), colName(29)], ["A", "D", "Z", "AD"]);
assert.equal(COL.name, 8, "I 제품명");
assert.equal(COL.sellpia, 23, "X 셀피아코드");
assert.deepEqual(STEPS.map((s) => colName(s.c)), ["T", "U", "V", "AD"]);
assert.ok(MAIN_FIELDS.every((c) => c < 30));
const cells = Array(30).fill("");
Object.assign(cells, { 3: "GP00540 14K 링", 5: "골드\n로즈", 8: "14K 스컬프 링", 15: "아트골드", 19: "<p><img src='x'></p>", 25: "신상 16" });
const rows = [{ r: 4, cells }, { r: 5, cells: Object.assign(Array(30).fill(""), { 3: "GP00541 아코디언", 19: "a", 20: "b", 21: "c", 29: "완료" }) }];
assert.deepEqual(stepsOf(cells).map((s) => s.done), [true, false, false, false]);
assert.equal(allDone(rows[1].cells), true);
assert.deepEqual(filterRows(rows, { todo: true }).map((r) => r.r), [4], "등록 안 끝남");
assert.deepEqual(filterRows(rows, { q: "14k 아트" }).map((r) => r.r), [4], "낱말 모두");
assert.deepEqual(filterRows(rows, { q: "img" }).map((r) => r.r), [], "HTML 칸은 찾기에서 뺌");
assert.deepEqual(filterRows(rows, { q: "아코디언" }).map((r) => r.r), [5]);
assert.equal(isHtml(cells[19]), true);
assert.match(preview(cells[19]), /^HTML \d+자$/);
assert.equal(preview("가".repeat(200), 10), "가".repeat(10) + "…");
const longLabels = []; longLabels[31] = "아주 길게 이어지는 시트 머리글 설명 글자";
assert.equal(labelOf(longLabels, 31), "아주 길게 이어지는 시트 머리글 …", "AE~ 는 시트 머리글");
assert.equal(labelOf(["", "", "", "제품폴더 PR03416-260112-10 예시 상품"], 3), "제품폴더", "2~3줄 예시 상품이 섞인 머리글은 안 씀");
assert.equal(labelOf([], 10), "발주단위");
assert.equal(labelOf([], 4), "체크 항목");
assert.equal(labelOf([], 32), "AG열");
const p = claudePrompt(rows[0], []);
assert.match(p, /업데이트 순서 4줄/);
assert.match(p, /옵션: 골드 \/ 로즈/);
assert.match(p, /매입처: 아트골드/);
assert.doesNotMatch(p, /<p>/, "HTML 칸은 안 보냄");
assert.match(claudeLink("", "가 나"), /^https:\/\/claude\.ai\/new\?q=%EA%B0%80%20%EB%82%98$/);
assert.equal(claudeLink("https://claude.ai/project/abc", "x"), "https://claude.ai/project/abc", "쓰던 대화·프로젝트 주소는 그대로 (글은 복사)");
assert.equal(claudeLink("javascript:alert(1)", "x"), "https://claude.ai/new", "https 아닌 주소는 무시");

const page = readFileSync(new URL("../purchase/index.html", import.meta.url), "utf8");
assert.match(page, /data-purchase-panel="naming"[\s\S]*?<div class="np" data-new-products><\/div>/);
assert.doesNotMatch(page, /data-product-names/, "옛 상품명 요청 칸은 뺌");
const panel = readFileSync(new URL("../src/app/newProductsPanel.mjs", import.meta.url), "utf8");
for (const t of ['action: "newList"', 'action: "newSave"', 'action: "newAdd"', "expect: row.cells[e.c]", "＋ 새 상품", "🤖 Claude", "시트 열기"]) assert.ok(panel.includes(t), t);
assert.doesNotMatch(panel, /api\.anthropic\.com|x-api-key/, "AI 키 없음");
const gs = readFileSync(new URL("../docs/cs-board-sheet.gs", import.meta.url), "utf8");
assert.match(gs, /'shipList', 'shipScan', 'shipUpload', 'newList', 'newSave', 'newAdd'\]/, "비밀번호(직원) 요청만");
assert.match(gs, /function 신상품_권한\(\)/);
assert.doesNotMatch(gs, /@OnlyCurrentDoc/, "다른 시트(업데이트 list)를 열어야 해서 뺌 — 주석 안에 있어도 Apps Script 가 읽으므로 글자 자체가 없어야 함");
console.log("newProducts.mock.test: OK");
// 11-10 카드 사진: 시트 C열 → 허브 (셀피아코드)
{
  const { photoCandidates } = await import("../src/domain/newProducts.mjs");
  const c = Array(30).fill(""); c[23] = "11606";
  assert.deepEqual(photoCandidates({ img: "https://lh3.googleusercontent.com/x", cells: c }).map((p) => p.src || p.hub), ["https://lh3.googleusercontent.com/x", "11606.__priority.jpg", "11606.jpg", "11606-1.__priority.jpg", "11606-1.jpg", "11606-1.__group.jpg", "11606-1.__range.jpg"]);
  assert.deepEqual(photoCandidates({ img: "", cells: Array(30).fill("") }), [], "사진도 코드도 없으면 '사진 없음'");
  const bad = Array(30).fill(""); bad[23] = "<p>html</p>";
  assert.deepEqual(photoCandidates({ img: "javascript:x", cells: bad }), [], "https 아닌 주소 · 이상한 코드는 안 씀");
  console.log("newProducts.mock.test (photos): OK");
}
