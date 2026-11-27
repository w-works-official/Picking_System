// 🗄 자사코드 자리 정리 · 신상품 자리 추천 (2026-11-27) — 계산 시험 (견본 데이터)
import assert from "node:assert/strict";
import { splitEven, parseOwn, lowerShelf, hasXxx, upperCode, drawerCode, retireReason, planRetire, freeCells, suggestSlots, slotLabel, shelfSummary, moveRows, FS_MOVE_COLUMNS } from "../src/domain/freeSlots.mjs";

// 자사코드 읽기 — 섞인 모양 · 앞뒤 표시 무시 · 행열 정수
assert.deepEqual(parseOwn("[P] A-04-13 ]"), { shelf: "A", row: 4, col: 13, sub: 0 });
assert.deepEqual(parseOwn("###[P] B-26-01_3 ]"), { shelf: "B", row: 26, col: 1, sub: 3 });
assert.deepEqual(parseOwn("[P] B -30-01_10"), { shelf: "B", row: 30, col: 1, sub: 10 }, "B 뒤 띄어쓰기도");
assert.deepEqual(parseOwn("xx[GPA-02-03_1]"), { shelf: "GPA", row: 2, col: 3, sub: 1 });
assert.deepEqual(parseOwn("끝[P] a-1-9 ]"), { shelf: "A", row: 1, col: 9, sub: 0 }, "소문자 · 한 자리 숫자");
assert.equal(parseOwn("주문제작용"), null);
assert.equal(parseOwn(""), null);

// 아랫칸: A→B · B→B · C→D … S→T · 없는 매대 ""
assert.equal(lowerShelf("A"), "B"); assert.equal(lowerShelf("B"), "B");
assert.equal(lowerShelf("C"), "D"); assert.equal(lowerShelf("S"), "T"); assert.equal(lowerShelf("T"), "T");
assert.equal(lowerShelf("EA"), "");

assert.equal(upperCode("A", 4, 3), "[P] A-04-03 ]");
assert.equal(drawerCode("B", 30, 1, 10), "[P] B-30-01_10 ]");
assert.equal(hasXxx("ㅁ[xxx]"), true); assert.equal(hasXxx("ㅁxxx-트리플"), true);
assert.equal(hasXxx("xx 미송"), false, "XX 두 개는 아님"); assert.equal(hasXxx("xxxx"), false, "네 개는 아님"); assert.equal(hasXxx("box"), false);

// 뺄 이유: XXX · 판매부진(기간 · 출고 이하)
const sales = { "1-1": 0, "1-2": 5, "2-1": 1 };
const salesOf = (sku) => sales[sku] ?? 0;
assert.equal(retireReason({ sku: "1-1", memo: "ㅁ[xxx]" }, { xxx: true }), "단종·삭제");
assert.equal(retireReason({ sku: "1-1", memo: "" }, { xxx: true }), "");
assert.equal(retireReason({ sku: "2-1", memo: "" }, { slow: { days: 90, max: 1 } }, salesOf), "판매부진 90일 1개");
assert.equal(retireReason({ sku: "1-2", memo: "" }, { slow: { days: 90, max: 1 } }, salesOf), "", "5개 팔린 건 아님");
assert.equal(retireReason({ sku: "1-1", memo: "[xxx]" }, { xxx: true, slow: { days: 30, max: 0 } }, salesOf), "단종·삭제 · 판매부진 30일 0개");

// 견본 매대: A 위 칸 · B 위 칸 · B 서랍(30열 일부 사용 중)
const opts = [
  { sku: "10-1", ownSku: "[P] A-01-01 ]", memo: "ㅁ[xxx]", product: "링", option: "1", stock: 2 },
  { sku: "10-2", ownSku: "[P] A-01-02 ]", memo: "" },
  { sku: "10-3", ownSku: "[P] A-01-03 ]", memo: "[xxx]" },
  { sku: "11-1", ownSku: "[P] A-02-01 ]", memo: "[xxx]" },          // A-2-1 칸: 둘 다 XXX → 비움
  { sku: "11-2", ownSku: "[P] A-02-01 ]", memo: "[xxx]" },
  { sku: "12-1", ownSku: "[P] A-02-02 ]", memo: "[xxx]" },          // A-2-2 칸: 하나만 XXX → 그대로 (일부)
  { sku: "12-2", ownSku: "[P] A-02-02 ]", memo: "" },
  { sku: "13-1", ownSku: "[P] A-02-04 ]", memo: "" },
  { sku: "20-1", ownSku: "[P] B-01-01 ]", memo: "[xxx]" },
  { sku: "30-1", ownSku: "###[P] B-30-01_1 ]", memo: "" },          // 서랍 자리 이미 씀
  { sku: "30-2", ownSku: "###[P] B-30-01_3 ]", memo: "" },
  { sku: "40-1", ownSku: "[EA-01-17]", memo: "[xxx]" },              // 피어싱 매대 아님 → 안 봄
];
const plan = planRetire(opts, { xxx: true });
assert.deepEqual([...plan.vacated].sort(), ["A-1-1", "A-1-3", "A-2-1", "B-1-1"]);
assert.deepEqual(plan.partial.map((p) => [p.key, p.hit, p.total]), [["A-2-2", 1, 2]], "옵션 일부만 뺄 대상인 칸은 비우지 않음");
assert.deepEqual(plan.moves.map((m) => [m.sku, m.to, m.box]), [
  ["10-1", "[P] B-30-01_2 ]", "1/1"],   // 상품 10 (옵션 2개) → 박스 하나 · 01_1 은 이미 씀
  ["10-3", "[P] B-30-01_2 ]", "1/1"],
  ["11-1", "[P] B-30-01_4 ]", "1/1"],   // 상품 11 → 다음 박스 (01_3 은 씀)
  ["11-2", "[P] B-30-01_4 ]", "1/1"],
  ["20-1", "[P] B-30-01_5 ]", "1/1"],
], "상품 단위로 한 박스(같은 자사코드) · 쓰는 자리 건너뜀");
assert.equal(plan.moves[0].from, "[P] A-01-01 ]");
assert.deepEqual(plan.byShelf.B, { cells: 4, products: 3, boxes: 3, options: 5, overflow: 0, left: 100 - 2 - 3 });
assert.equal(plan.overflow.length, 0);

// 박스 나누기: 20개당 1박스 · 고르게
assert.deepEqual(splitEven([1, 2, 3, 4, 5], 2).map((x) => x.length), [3, 2]);
assert.deepEqual(splitEven(Array(69).fill(0), 4).map((x) => x.length), [18, 17, 17, 17]);
const big = (n, shelf = "C", pc = "77") => Array.from({ length: n }, (_, i) => ({ sku: `${pc}-${i + 1}`, ownSku: `[P] ${shelf}-${String(Math.floor(i / 21) + 1).padStart(2, "0")}-${String((i % 21) + 1).padStart(2, "0")} ]`, memo: "[xxx]" }));
const p19 = planRetire(big(19), { xxx: true });
assert.equal(new Set(p19.moves.map((m) => m.to)).size, 1, "19개 → 1박스"); assert.equal(planRetire(big(40), { xxx: true }).byShelf.D.boxes, 3, "40개 → 3박스");
const p20 = planRetire(big(20), { xxx: true });
assert.deepEqual([...new Set(p20.moves.map((m) => m.to))], ["[P] D-30-01_1 ]", "[P] D-30-01_2 ]"], "20개 → 2박스");
assert.deepEqual(p20.moves.filter((m) => m.to.endsWith("01_1 ]")).length, 10, "반으로 나눔");
const p69 = planRetire(big(69), { xxx: true });
assert.equal(p69.byShelf.D.boxes, 4); assert.equal(p69.moves.filter((m) => m.box === "1/4").length, 18);

// 서랍 자리 모자람 → overflow (상품 12개, 자리 10개)
const many = Array.from({ length: 12 }, (_, i) => ({ sku: `9${i}-1`, ownSku: `[P] C-01-${String(i + 1).padStart(2, "0")} ]`, memo: "[xxx]" }));
const small = planRetire(many, { xxx: true }, { drawer: { cols: [30], drawers: 1, slots: 10 } });
assert.equal(small.moves.length, 10); assert.equal(small.overflow.length, 2); assert.equal(small.byShelf.D.overflow, 2);
assert.equal(small.moves[9].to, "[P] D-30-01_10 ]");

// 흩어진 상품: 30열이 덜 찬 아랫칸으로
const spread = [
  { sku: "50-1", ownSku: "[P] A-01-01 ]", memo: "[xxx]" }, { sku: "50-2", ownSku: "[P] A-01-02 ]", memo: "[xxx]" },
  { sku: "50-3", ownSku: "[P] C-01-01 ]", memo: "[xxx]" },
  { sku: "60-1", ownSku: "[P] B-30-01_1 ]" }, { sku: "60-2", ownSku: "[P] B-30-01_2 ]" },   // B 30열 2자리 씀 · D 는 비어 있음
];
const sp = planRetire(spread, { xxx: true });
assert.deepEqual([...new Set(sp.moves.map((m) => m.to))], ["[P] D-30-01_1 ]"], "B 보다 덜 찬 D 로 한 박스");
assert.equal(sp.byShelf.D.products, 1); assert.equal(sp.byShelf.B.cells, 2, "비운 칸 수는 원래 매대 기준 (A-1-1 · A-1-2)"); assert.equal(sp.byShelf.D.cells, 1);

// 판매부진만 · 매대 하나만
const slow = planRetire(opts, { slow: { days: 30, max: 0 } }, { salesOf: (sku) => (sku === "13-1" ? 0 : 9) });
assert.deepEqual([...slow.vacated], ["A-2-4"]);
assert.match(slow.moves[0].reason, /^판매부진 30일 0개$/);
assert.deepEqual([...planRetire(opts, { xxx: true }, { only: "B" }).vacated].sort(), ["A-1-1", "A-1-3", "A-2-1", "B-1-1"], "B 고르면 위 짝 A 도 같이");
assert.equal(planRetire(opts, { xxx: true }, { only: "D" }).moves.length, 0);

// 빈자리: A 는 1~2행 × 1~4열 (쓰인 최대) · B 는 1행 × 1열
const free = freeCells(opts, { vacated: plan.vacated });
const keysA = free.filter((f) => f.shelf === "A").map((f) => `${f.key}${f.freed ? "*" : ""}`);
assert.deepEqual(keysA, ["A-1-1*", "A-1-3*", "A-1-4", "A-2-1*", "A-2-3"], "원래 빈 칸 + 정리로 비운 칸(*)");
assert.deepEqual(free.filter((f) => f.shelf === "B").map((f) => f.key), ["B-1-1"]);
assert.equal(freeCells(opts).filter((f) => f.shelf === "A").length, 2, "정리 전엔 원래 빈 칸만");
assert.equal(freeCells(opts, { size: { A: { rows: 3, cols: 4 } } }).filter((f) => f.shelf === "A").length, 2 + 4, "매대 크기 직접 정하면 3행도");

// 추천: 한 줄 연속 우선 · 남는 칸 적은 줄 먼저
const grid = [];
for (let c = 1; c <= 6; c++) grid.push({ shelf: "C", row: 3, col: c, key: `C-3-${c}`, freed: c <= 2 });   // C-3-1~6 (6칸 연속)
for (let c = 10; c <= 12; c++) grid.push({ shelf: "C", row: 5, col: c, key: `C-5-${c}`, freed: false });  // C-5-10~12 (3칸)
grid.push({ shelf: "E", row: 1, col: 1, key: "E-1-1", freed: false }, { shelf: "E", row: 2, col: 1, key: "E-2-1", freed: false });
const s3 = suggestSlots(grid, 3);
assert.equal(s3[0].label, "C-05-10~12", "딱 맞는 줄 먼저 (큰 빈 줄은 아낌)");
assert.deepEqual(s3[0].codes, ["[P] C-05-10 ]", "[P] C-05-11 ]", "[P] C-05-12 ]"]);
assert.equal(s3[1].label, "C-03-01~03"); assert.equal(s3[1].freed, 2);
const s2e = suggestSlots(grid, 2, { shelf: "E" });
assert.equal(s2e[0].kind, "near"); assert.equal(s2e[0].label, "E-01-01 ~ E-02-01", "한 줄에 없으면 가장 가까이 모인 칸");
assert.equal(suggestSlots(grid, 20).length, 0, "자리가 모자라면 추천 없음");
assert.equal(suggestSlots(grid, "0")[0].codes.length, 1, "0 · 이상한 값 → 1개");
assert.equal(slotLabel([]), "");

// 매대 요약 · 엑셀 줄
const sum = shelfSummary(free, opts).find((x) => x.shelf === "A");
assert.deepEqual(sum, { shelf: "A", used: 6, empty: 2, freed: 3, rows: 2, cols: 4 });
assert.equal(FS_MOVE_COLUMNS.length, moveRows(plan)[0].length);
assert.deepEqual(moveRows(small).at(-1).slice(4, 7), ["[P] C-01-12 ]", "자리 없음", "1/1"]);
// 셀피아 엑셀 → 옵션 (화면 파일의 순수 함수)
const { optionsFromRows } = await import("../src/app/freeSlotsPanel.mjs");
const xl = optionsFromRows([
  ["매입처", "상품코드", "상품명", "옵션명", "재고", "임의필드", "자사코드"],
  ["가", "1000-1", "링", "골드", "3", "ㅁ[xxx]", "[P] A-01-01 ]"],
  ["가", "1000-2", "링", "실버", "", "", "[P] A-01-02 ]"],
  ["가", "1000-3", "링", "로즈", "1", "", ""],
]);
assert.deepEqual(xl.map((o) => [o.sku, o.ownSku, o.stock, o.xxx]), [["1000-1", "[P] A-01-01 ]", 3, true], ["1000-2", "[P] A-01-02 ]", 0, false]], "자사코드 없는 줄은 뺌");
assert.deepEqual(optionsFromRows([["상품코드", "재고"]]), [], "자사코드 칸 없으면 빈 목록");
console.log("freeSlots ok");

// 11-27 V_1 연결: 상품 관리 › 자사코드 자리 (신상품 등록 아래)
{
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../purchase/index.html", import.meta.url), "utf8");
  if (!/data-purchase-tab="naming">신상품 등록<\/button>\s*<button class="purchase-tab" type="button" data-purchase-tab="slots">자사코드 자리<\/button>/.test(page)) throw new Error("자사코드 자리 메뉴");
  if (!/data-purchase-panel="slots"[\s\S]*?<div data-fs-root><\/div>/.test(page)) throw new Error("자사코드 자리 패널");
  if (!/freeSlotsBoot\.mjs\?v=20261127-slots1/.test(page)) throw new Error("boot 스크립트");
  const boot = readFileSync(new URL("../src/app/freeSlotsBoot.mjs", import.meta.url), "utf8");
  if (!/freeSlotsPanel\.mjs\?v=20261127-slots1/.test(boot)) throw new Error("패널 버전");
  console.log("freeSlots V3 연결: OK");
}
