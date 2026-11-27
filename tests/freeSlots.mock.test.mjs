// 🗄 자사코드 자리 정리 · 신상품 자리 추천 (2026-11-27) — 계산 시험 (견본 데이터)
import assert from "node:assert/strict";
import { splitEven, parseOwn, lowerShelf, hasXxx, upperCode, drawerCode, retireReason, productReason, optionXxx, planRetire, freeCells, suggestSlots, slotLabel, shelfSummary, moveRows, FS_MOVE_COLUMNS } from "../src/domain/freeSlots.mjs";

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
// XXX: 전달사항 · 임의필드 둘 다(기본) / 둘 중 하나 · 칸 글이 없으면 o.xxx
assert.equal(optionXxx({ note: "[xxx]", memo: "ㅁ[xxx]" }), true);
assert.equal(optionXxx({ note: "", memo: "ㅁ[xxx]" }), false, "둘 다여야 함");
assert.equal(optionXxx({ note: "", memo: "ㅁ[xxx]" }, "either"), true);
assert.equal(optionXxx({ memo: "ㅁ[xxx]" }), true, "전달사항 칸이 없으면 임의필드만");
assert.equal(optionXxx({ xxx: true }), true, "허브 + XX표시 탭");
assert.equal(retireReason({ sku: "1-1", memo: "ㅁ[xxx]" }, { xxx: true }), "단종·삭제");
assert.equal(retireReason({ sku: "1-1", memo: "" }, { xxx: true }), "");
// 상품 단위: 모든 옵션이 XXX · 판매부진은 상품 출고 합계
assert.equal(productReason([{ sku: "1-1", memo: "[xxx]" }, { sku: "1-2", memo: "" }], { xxx: true }), "", "옵션 하나라도 XXX 아니면 아님");
assert.equal(productReason([{ sku: "1-1" }, { sku: "1-2" }], { slow: { days: 90, max: 5 } }, salesOf), "판매부진 90일 5개", "0 + 5 = 5개");
assert.equal(productReason([{ sku: "1-1" }, { sku: "1-2" }], { slow: { days: 90, max: 4 } }, salesOf), "");
assert.equal(retireReason({ sku: "1-1", memo: "[xxx]" }, { xxx: true, slow: { days: 30, max: 0 } }, salesOf), "단종·삭제 · 판매부진 30일 0개");

// 견본 매대: A 위 칸 · B 위 칸 · B 서랍(30열 일부 사용 중)
const opts = [
  { sku: "10-1", ownSku: "[P] A-01-01 ]", memo: "ㅁ[xxx]", product: "링", option: "1", stock: 2 },
  { sku: "10-2", ownSku: "[P] A-01-02 ]", memo: "" },                // 상품 10: 옵션 하나가 XXX 아님 → 상품 통째로 그대로
  { sku: "10-3", ownSku: "[P] A-01-03 ]", memo: "[xxx]" },
  { sku: "11-1", ownSku: "[P] A-02-01 ]", memo: "[xxx]" },          // 상품 11 → 옮김, A-2-1 칸 비움
  { sku: "11-2", ownSku: "[P] A-02-01 ]", memo: "[xxx]" },
  { sku: "12-1", ownSku: "[P] A-02-02 ]", memo: "[xxx]" },          // 상품 12 → 옮김, 칸엔 상품 14 가 남음
  { sku: "14-1", ownSku: "[P] A-02-02 ]", memo: "" },
  { sku: "13-1", ownSku: "[P] A-02-04 ]", memo: "" },
  { sku: "20-1", ownSku: "[P] B-01-01 ]", memo: "[xxx]" },
  { sku: "21-1", ownSku: "[P] B-01-02 ]", memo: "[xxx]" },          // 상품 21: 다른 매대(EA)에도 있음 → 그대로
  { sku: "21-2", ownSku: "[EA-01-17]", memo: "[xxx]" },
  { sku: "30-1", ownSku: "###[P] B-30-01_1 ]", memo: "" },          // 서랍 자리 이미 씀
  { sku: "30-2", ownSku: "###[P] B-30-01_3 ]", memo: "" },
  { sku: "40-1", ownSku: "[EA-01-18]", memo: "[xxx]" },              // 피어싱 매대 아님 → 안 봄
];
const plan = planRetire(opts, { xxx: true });
assert.equal(plan.found, 3);
assert.deepEqual([...plan.vacated].sort(), ["A-2-1", "B-1-1"]);
assert.deepEqual(plan.shared, ["A-2-2"], "다른 상품이 남는 칸은 비우지 않음 (상품 12 는 옮김)");
assert.deepEqual(plan.elsewhere, ["21"]);
assert.deepEqual(plan.moves.map((m) => [m.sku, m.to, m.box]), [
  ["11-1", "[P] B-30-01_2 ]", "1/1"],   // 상품 11 (옵션 2개) → 박스 하나 · 01_1 은 이미 씀
  ["11-2", "[P] B-30-01_2 ]", "1/1"],
  ["12-1", "[P] B-30-01_4 ]", "1/1"],   // 01_3 은 씀
  ["20-1", "[P] B-30-01_5 ]", "1/1"],
], "상품 단위로 한 박스(같은 자사코드) · 쓰는 자리 건너뜀");
assert.ok(!plan.moves.some((m) => m.productCode === "10"), "옵션 단위로 빠지지 않음");
assert.equal(plan.moves[0].from, "[P] A-02-01 ]");
assert.deepEqual(plan.byShelf.B, { cells: 2, products: 3, boxes: 3, options: 4, overflow: 0, left: 100 - 2 - 3 });
assert.equal(plan.overflow.length, 0);
assert.equal(planRetire(opts, { xxx: true, xxxMode: "either" }).found, 3, "임의필드만 있는 견본은 같음");
const opts2 = opts.map((o) => ({ ...o, note: o.sku === "11-1" || !hasXxx(o.memo) ? "" : "[xxx]" }));
assert.deepEqual(planRetire(opts2, { xxx: true }).moves.map((m) => m.productCode), ["12", "20"], "둘 다: 11-1 전달사항에 XXX 없음 → 상품 11 그대로");
assert.deepEqual([...new Set(planRetire(opts2, { xxx: true, xxxMode: "either" }).moves.map((m) => m.productCode))], ["11", "12", "20"]);

// 한 번에 찾을 상품 수
const lim = planRetire(opts, { xxx: true }, { limit: 2 });
assert.equal(lim.found, 3); assert.deepEqual([...new Set(lim.moves.map((m) => m.productCode))], ["11", "12"]);
assert.deepEqual([...lim.vacated], ["A-2-1"]);

// 박스 나누기: 20개 미만 1 · 20개 이상 2 · 고르게
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
assert.deepEqual([...planRetire(opts, { xxx: true }, { only: "B" }).vacated].sort(), ["A-2-1", "B-1-1"], "B 고르면 위 짝 A 도 같이");
assert.equal(planRetire(opts, { xxx: true }, { only: "D" }).moves.length, 0);


// 빈자리: A 는 1~2행 × 1~4열 (쓰인 최대) · B 는 1행 × 1열
const free = freeCells(opts, { vacated: plan.vacated });
const keysA = free.filter((f) => f.shelf === "A").map((f) => `${f.key}${f.freed ? "*" : ""}`);
assert.deepEqual(keysA, ["A-1-4", "A-2-1*", "A-2-3"], "원래 빈 칸 + 정리로 비운 칸(*)");
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
assert.deepEqual(sum, { shelf: "A", used: 6, empty: 2, freed: 1, rows: 2, cols: 4 });
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
  if (!/<h3 class="purchase-tab-group">영수증<\/h3>[\s\S]*?<h3 class="purchase-tab-group">자사코드<\/h3>\s*<button class="purchase-tab" type="button" data-purchase-tab="slots">자사코드 자리<\/button>/.test(page)) throw new Error("메뉴: 영수증 밑 자사코드 묶음");
  if (!/data-purchase-panel="slots"[\s\S]*?<div data-fs-root><\/div>/.test(page)) throw new Error("자사코드 자리 패널");
  if (!/freeSlotsBoot\.mjs\?v=20261127-slots4/.test(page)) throw new Error("boot 스크립트");
  const boot = readFileSync(new URL("../src/app/freeSlotsBoot.mjs", import.meta.url), "utf8");
  if (!/freeSlotsPanel\.mjs\?v=20261127-slots4/.test(boot)) throw new Error("패널 버전");
  console.log("freeSlots V3 연결: OK");
}

// 11-27 가상재고 1000 단위 — 500 이상만 1000 단위를 뺌 · 작은 재고(1~5 · 50 · 100)는 그대로
{
  const { realStock, isVirtualStock } = await import("../src/domain/virtualStock.mjs");
  const cases = [[0, 0], [1, 1], [5, 5], [50, 50], [100, 100], [300, 300], [499, 499], [500, -500], [600, -400], [899, -101], [900, -100], [981, -19], [1499, 499], [1500, -500], [1000, 0], [1003, 3], [1175, 175], [2003, 3], [6500, -500], [6499, 499], [9104, 104], [9900, -100], [10000, 0], [-2, -2]];
  for (const [n, want] of cases) if (realStock(n) !== want) throw new Error(`realStock(${n}) = ${realStock(n)} (기대 ${want})`);
  if (!isVirtualStock(1003) || isVirtualStock(100)) throw new Error("가상재고 판별");
  const { optionsFromRows } = await import("../src/app/freeSlotsPanel.mjs");
  const rows = [["False", "매입처", "매입처코드", "상품코드", "상품명", "매입옵션명", "옵션명", "미송수량", "안전재고", "배송준비수량", "전달사항", "당일배송", "발주단위", "최소발주수량", "가용재고", "재고", "매입가", "임의필드", "자사코드"],
    ["", "", "", "1-1", "A", "", "a", "", "", "", "", "", "", "", "", "1003", "", "", "A-01-01"],
    ["", "", "", "1-2", "A", "", "b", "", "", "", "", "", "", "", "", "3", "", "", "A-01-02"]];
  const o = optionsFromRows(rows);
  if (o[0].stock !== 3 || !o[0].virtual || o[1].stock !== 3 || o[1].virtual) throw new Error("엑셀 가상재고 적용");
}

// 11-27 3차: 매대 여러 개 · 화면 표 그대로 엑셀(빈 줄) · 완료 체크 · 저장 기록 · 매칭 CSV
{
  const fs = await import("../src/domain/freeSlots.mjs");
  const o3 = [
    { sku: "1-1", ownSku: "[P] A-01-01 ]", memo: "[xxx]", note: "ㅁ[xxx]" }, { sku: "1-2", ownSku: "[P] A-01-02 ]", memo: "[xxx]", note: "[xxx]" },
    { sku: "2-1", ownSku: "[P] C-01-01 ]", memo: "[xxx]", note: "[xxx]" },
    { sku: "3-1", ownSku: "[P] E-01-01 ]", memo: "[xxx]", note: "[xxx]" },
  ];
  const two = fs.planRetire(o3, { xxx: true }, { only: ["B", "D"] });
  assert.deepEqual([...new Set(two.moves.map((m) => m.productCode))], ["1", "2"], "매대 여러 개 (A·B + C·D)");
  assert.equal(fs.planRetire(o3, { xxx: true }, { only: [] }).moves.length, 4, "비우면 전체");
  assert.equal(two.moves[0].note, "ㅁ[xxx]", "전달사항 · 임의필드 함께");
  const lines = fs.sheetLines(two.moves);
  assert.deepEqual(lines.map((m) => (m ? m.sku : "-")), ["1-1", "1-2", "-", "2-1"], "상품 사이 빈 줄");
  const rows = fs.sheetRows(two.moves, new Set(["2-1"]));
  assert.equal(rows.length, 4); assert.deepEqual(rows[2], fs.FS_SHEET_COLUMNS.map(() => ""));
  assert.deepEqual(rows[0].slice(6), ["[P] A-01-01 ]", "[P] B-30-01_1 ]", "☐"]);
  assert.equal(rows[3][8], "☑");
  assert.equal(fs.FS_SHEET_COLUMNS.length, rows[0].length);
  for (const v of ["☑", "✓", "O", "o", "v", "1", "TRUE", " 완료 "]) assert.equal(fs.isDoneMark(v), true, v);
  for (const v of ["☐", "", "x", "0", "아니오"]) assert.equal(fs.isDoneMark(v), false, v);
  const up = [["제목 줄"], fs.FS_SHEET_COLUMNS, ...rows.map((r, i) => (i === 0 ? [...r.slice(0, 8), "☑"] : r)), ["9-9", "", "", "", "", "", "", "자리 없음", "☑"], ["9-8", "", "", "", "", "", "", "주문제작", "☑"]];
  assert.deepEqual(fs.doneFromRows(up).map((x) => [x.sku, x.to, x.from]), [["1-1", "[P] B-30-01_1 ]", "[P] A-01-01 ]"], ["2-1", "[P] D-30-01_1 ]", "[P] C-01-01 ]"]], "완료(☑) 줄만 · 빈 줄 · 자리 없음 · 이상한 코드 뺌");
  assert.deepEqual(fs.doneFromRows([["셀피아 코드", "지금"]]), [], "머리줄 없으면 빈 목록");
  const latest = fs.latestBySku([{ sku: "1-1", to: "[P] B-30-01_1 ]", at: "2026-11-27 10:00:00" }, { sku: "1-1", to: "[P] B-30-02_3 ]", at: "2026-11-27 11:00:00" }, { sku: "2-1", to: "[P] D-30-01_1 ]", at: "2026-11-27 09:00:00" }, { sku: "", to: "x" }]);
  assert.equal(latest.get("1-1").to, "[P] B-30-02_3 ]", "옵션마다 최신");
  assert.equal(fs.matchingCsv(latest), "1-1,[P] B-30-02_3 ]\r\n2-1,[P] D-30-01_1 ]\r\n", "상품코드,자사코드 · 머리줄 없음");
  assert.equal(fs.matchingCsv(new Map()), "");
  assert.equal(fs.matchingCsv(new Map([["5-1", { sku: "5-1", to: 'a,"b' }]])), '5-1,"a,""b"\r\n', "쉼표 · 따옴표 감싸기");
  const ap = fs.applySaved(o3, latest);
  assert.equal(ap.applied, 2); assert.equal(ap.options[0].ownSku, "[P] B-30-02_3 ]"); assert.equal(ap.options[0].savedFrom, "[P] A-01-01 ]");
  const after = fs.planRetire(ap.options, { xxx: true });
  assert.deepEqual(after.moves.map((m) => [m.sku, m.to]), [["3-1", "[P] F-30-01_1 ]"]], "저장한 이동은 옮긴 것으로 (1-2 는 상품 1의 남은 옵션 — 다른 자리라 그대로)");
  // 엑셀 고르기 목록(☐/☑)
  const { buildXlsx } = await import("../src/domain/xlsxWriter.mjs");
  const bytes = buildXlsx({ columns: fs.FS_SHEET_COLUMNS.map((title) => ({ title })), rows, validations: [{ col: 8, rows: [0, 1, 3], values: ["☐", "☑"] }] });
  const text = new TextDecoder().decode(bytes);
  assert.match(text, /<dataValidations count="1"><dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="I2 I3 I5"><formula1>"☐,☑"<\/formula1><\/dataValidation><\/dataValidations><pageMargins/);
  assert.doesNotMatch(new TextDecoder().decode(buildXlsx({ columns: [{ title: "a" }], rows: [["1"]] })), /dataValidation/, "안 주면 예전과 같음");
  // CS 시트 slotSave · slotList
  const { loadCsBoardScript } = await import("./helpers/csBoardFakeSheet.mjs");
  const TOKEN = "slot-token-1234";
  const g = await loadCsBoardScript({ props: { BOARD_TOKEN: TOKEN } });
  assert.equal(g.post({ action: "slotList", token: "bad" }).denied, true);
  assert.deepEqual(g.post({ action: "slotList", token: TOKEN }).items, []);
  let r = g.post({ action: "slotSave", token: TOKEN, editor: "지영", items: [{ sku: "1-1", from: "XX[P] A-01-01 ]", to: "[P] B-30-01_1 ]", product: "링", option: "골드" }, { sku: "1-1", to: "[P] B-30-01_2 ]" }, { sku: "bad sku!", to: "[P] B-30-01_3 ]" }, { sku: "2-1", to: "엉뚱" }] });
  assert.equal(r.ok, true); assert.equal(r.saved, 1, "같은 옵션 두 번 · 이상한 코드 · 자사코드 아닌 것 뺌");
  assert.equal(g.post({ action: "slotSave", token: TOKEN, items: [] }).ok, false);
  g.post({ action: "slotSave", token: TOKEN, items: [{ sku: "1-1", to: "[P] B-30-02_1 ]" }, { sku: "2-1", to: "=[P] D-30-01_1 ]" }] });
  const items = g.post({ action: "slotList", token: TOKEN }).items;
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((x) => [x.sku, x.to]), [["1-1", "[P] B-30-01_1 ]"], ["1-1", "[P] B-30-02_1 ]"], ["2-1", "=[P] D-30-01_1 ]"]], "수식 글자도 글자로 저장 · 그대로 돌려줌");
  assert.equal(items[0].from, "XX[P] A-01-01 ]"); assert.equal(items[0].editor, "지영");
  const tab = g.sheets.find((s) => s.getName() === "자사코드이동");
  assert.deepEqual(tab.data[0], ["셀피아코드", "지금 자사코드", "새 자사코드", "상품명", "옵션명", "저장 시각", "저장한 사람"]);
  console.log("freeSlots 3차: OK");
}

// 11-27 [셀피아 업데이트]: 바뀐 것만 · base64 조각
{
  const fs = await import("../src/domain/freeSlots.mjs");
  const latest = new Map([["1-1", { sku: "1-1", to: "[P] B-30-01_1 ]" }], ["2-1", { sku: "2-1", to: "[P] D-30-01_1 ]" }]]);
  const raw = [{ sku: "1-1", ownSku: "[P] B-30-01_1 ]" }, { sku: "2-1", ownSku: "XX[P] C-01-01 ]" }];
  assert.deepEqual([...fs.changedLatest(latest, raw).keys()], ["2-1"], "셀피아와 이미 같으면 뺌");
  assert.equal(fs.changedLatest(latest, []).size, 2, "셀피아 자료 없으면 전부");
  const csv = fs.matchingCsv(new Map(Array.from({ length: 400 }, (_, i) => [`${1000 + i}-1`, { sku: `${1000 + i}-1`, to: `[P] B-30-${String((i % 10) + 1).padStart(2, "0")}_${(i % 10) + 1} ]` }])));
  const parts = fs.csvChunks(csv, 6000);
  assert.ok(parts.length >= 2 && parts.every((p) => p.length <= 6000 && /^[A-Za-z0-9+/=]+$/.test(p)), "조각마다 6000자 이하 · base64 글자만");
  const back = parts.map((p) => Buffer.from(p, "base64").toString("utf8")).join("");
  assert.equal(back, csv, "조각을 이으면 원래 CSV");
  assert.deepEqual(fs.csvChunks(""), []);
  console.log("freeSlots 셀피아 업데이트: OK");
}
