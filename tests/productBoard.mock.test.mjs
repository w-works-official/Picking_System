import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PB_CATEGORIES, PB_EXCEL_COLUMNS, applyDisc, attachSales, boardView, buildProducts, buildSales, categoryCounts, categoryOf, excelRows, matchProduct, optionStats, pageOf, photoFor, photoIndex, pickState, salesKey, salesSum, sortView } from "../src/domain/productBoard.mjs";
import { buildXlsx, colName, crc32, zipStore } from "../src/domain/xlsxWriter.mjs";
import { zipEntries } from "../src/domain/orderSheet.mjs";

// 대분류 (상품명 글자) — 14K 먼저, 써지컬, 실버(귀걸이 아님), 귀걸이, 나머지
assert.deepEqual(PB_CATEGORIES.map((c) => c.label), ["써지컬 피어싱", "14K 피어싱", "실버 피어싱", "귀걸이", "나머지", "단종"]);
assert.equal(categoryOf("14K 써지컬 볼 피어싱"), "k14");
assert.equal(categoryOf("써지컬 스틸 링 피어싱"), "surgical");
assert.equal(categoryOf("서지컬 하트"), "surgical");
assert.equal(categoryOf("925 실버 큐빅 피어싱"), "silver");
assert.equal(categoryOf("실버 드롭 귀걸이"), "earring");
assert.equal(categoryOf("진주 이어링"), "earring");
assert.equal(categoryOf("헤어핀"), "etc");
assert.equal(categoryOf(""), "etc");

// 사진 규칙
const idx = photoIndex(["1000-1.jpg", "1000-2.__group.jpg", "1000.jpg", "2000.jpg", "3000-1.jpg", "3000-1.__priority.jpg", "x.png", "4000-2.jpg"]);
assert.deepEqual(photoFor("1000-1", "1000", idx), { file: "1000-1.jpg", kind: "option" }, "옵션 사진 1순위");
assert.deepEqual(photoFor("1000-2", "1000", idx), { file: "1000-2.__group.jpg", kind: "option" }, ".__group 도 옵션 사진");
assert.deepEqual(photoFor("1000-3", "1000", idx), { file: "", kind: "missing" }, "옵션 사진 있는 상품의 빈 옵션 → 노랑 빈칸 (대표사진 안 씀)");
assert.deepEqual(photoFor("2000-1", "2000", idx), { file: "2000.jpg", kind: "product" }, "옵션 사진 없는 상품 → 대표코드 사진");
assert.deepEqual(photoFor("2000", "", idx), { file: "2000.jpg", kind: "product" }, "옵션 하나(코드=대표코드)");
assert.deepEqual(photoFor("3000-1", "3000", idx), { file: "3000-1.__priority.jpg", kind: "option" }, ".__priority 가 먼저");
assert.deepEqual(photoFor("4000-1", "4000", idx), { file: "", kind: "missing" });
assert.deepEqual(photoFor("5000-1", "5000", idx), { file: "", kind: "none" });

// 상품 묶기 · 정렬 · 합계
const rows = [
  { sellpia_sku_code: "1000-10", sellpia_product_code: "1000", sellpia_product_name: "써지컬 링", sellpia_option_name: "10mm", own_sku: "A10", stock: "3", available_stock: 2 },
  { sellpia_sku_code: "1000-2", sellpia_product_code: "1000", sellpia_product_name: "써지컬 링", sellpia_option_name: "8mm", stock: 5, available_stock: 5 },
  { sellpia_sku_code: "200-1", sellpia_product_code: "200", sellpia_product_name: "14k 볼", sellpia_option_name: "골드", stock: 0, available_stock: 0 },
  { sellpia_sku_code: "", stock: 9 },
];
const products = buildProducts(rows, idx);
assert.deepEqual(products.map((p) => p.code), ["200", "1000"], "코드 숫자 순");
assert.deepEqual(products[1].options.map((o) => o.sku), ["1000-2", "1000-10"], "옵션 번호 숫자 순");
assert.equal(products[1].stock, 8);
assert.equal(products[1].category, "surgical");
assert.equal(products[1].options[0].photo.kind, "option");
assert.equal(products[1].options[1].photo.kind, "missing");
assert.equal(products[1].options[1].ownSku, "A10");
assert.deepEqual(categoryCounts(products), { surgical: 1, k14: 1, silver: 0, earring: 0, etc: 0, disc: 0 });

// 검색: 낱말 모두
assert.ok(matchProduct(products[1], "써지컬 10mm"));
assert.ok(matchProduct(products[1], "a10"));
assert.ok(!matchProduct(products[1], "써지컬 골드"));
assert.ok(matchProduct(products[1], "  "));

// 출고: 접수일 × 수량
const sales = buildSales(
  [{ ord_no: "o1", receipt_date: "2026-11-06" }, { ord_no: "o2", receipt_date: "2026-10-20T10:00:00" }, { ord_no: "o3", receipt_date: "2026-07-01" }, { ord_no: "o4", receipt_date: null }],
  [{ ord_no: "o1", p_code: "1000-2", qty: 2 }, { ord_no: "o2", p_code: "1000-2", qty: "3" }, { ord_no: "o3", p_code: "1000-2", qty: 1 }, { ord_no: "o1", p_code: "200-1", qty: 0 }, { ord_no: "o4", p_code: "1000-2", qty: 9 }, { ord_no: "zz", p_code: "1000-2", qty: 9 }],
);
assert.equal(sales.first, "2026-07-01");
assert.equal(sales.last, "2026-11-06");
assert.equal(salesSum(sales, "1000-2", 7, "2026-11-06"), 2);
assert.equal(salesSum(sales, "1000-2", 30, "2026-11-06"), 5);
assert.equal(salesSum(sales, "1000-2", 0, "2026-11-06"), 6, "전체 (날짜 없는 주문 · 없는 주문 제외)");
assert.equal(salesSum(sales, "200-1", 0, "2026-11-06"), 1, "수량 0/빈칸 = 1개");
assert.equal(salesSum(sales, "9999", 30, "2026-11-06"), 0);
assert.equal(salesSum(null, "1000-2", 30, "2026-11-06"), 0);

// ---------- 11-06 2차: 가격 · 기간별 출고 · 검색 기준 · 상품/옵션 단위 · 쪽 · 선택 · 엑셀 ----------
const rows2 = [
  { sellpia_sku_code: "1000-1", sellpia_product_code: "1000", sellpia_product_name: "써지컬 링", sellpia_option_name: "6mm", stock: 0, available_stock: 0, buy: "150", sell: "900" },
  { sellpia_sku_code: "1000-2", sellpia_product_code: "1000", sellpia_product_name: "써지컬 링", sellpia_option_name: "8mm", stock: 7, available_stock: 7, buy: "800", sell: "2500" },
  { sellpia_sku_code: "1000-3", sellpia_product_code: "1000", sellpia_product_name: "써지컬 링", sellpia_option_name: "10mm", stock: 3, available_stock: 2, raw_payload: { purchase_price: 900, sell_price: 2700 } },
  { sellpia_sku_code: "2000-1", sellpia_product_code: "2000", sellpia_product_name: "14K 볼", sellpia_option_name: "골드", stock: 12, available_stock: 12, buy: 5000, sell: 15000 },
];
const idx2 = photoIndex(["1000-1.jpg", "1000-2.jpg", "2000.jpg"]);
const ps = buildProducts(rows2, idx2);
assert.deepEqual(ps[0].options.map((o) => [o.buy, o.sell]), [[150, 900], [800, 2500], [900, 2700]], "매입가·출고가 (줄 또는 raw_payload)");
assert.equal(ps[0].rep, "1000-1.jpg", "대표 사진 = 대표코드 사진 없으면 첫 옵션 사진");
assert.equal(ps[1].rep, "2000.jpg");
const sales2 = buildSales(
  [{ ord_no: "a", receipt_date: "2026-11-06" }, { ord_no: "b", receipt_date: "2026-10-20" }, { ord_no: "c", receipt_date: "2026-08-20" }],
  [{ ord_no: "a", p_code: "1000-2", qty: 2 }, { ord_no: "b", p_code: "1000-2", qty: 3 }, { ord_no: "c", p_code: "1000-2", qty: 4 }, { ord_no: "a", p_code: "2000-1", qty: 1 }],
);
attachSales(ps, sales2, "2026-11-06");
assert.deepEqual(["s7", "s30", "s90", "sAll"].map((k) => ps[0].options[1][k]), [2, 5, 9, 9], "7 · 30 · 90 · 전체 출고");
assert.equal(salesKey(7), "s7"); assert.equal(salesKey(0), "sAll");
const st2 = optionStats(ps[0].options);
assert.deepEqual([st2.stock, st2.available, st2.buyMin, st2.buyMax, st2.sellMin, st2.sellMax, st2.s30], [10, 9, 150, 900, 900, 2700, 5]);
// 검색 기준
assert.deepEqual(boardView(ps, {}).map((x) => [x.p.code, x.options.length]), [["1000", 3], ["2000", 1]]);
assert.deepEqual(boardView(ps, { stockMin: "", stockMax: "0" }).map((x) => x.options.map((o) => o.sku)), [["1000-1"]], "재고 0 옵션만 (옵션 단위)");
assert.deepEqual(boardView(ps, { stockMin: "5" }).flatMap((x) => x.options.map((o) => o.sku)), ["1000-2", "2000-1"]);
assert.deepEqual(boardView(ps, { photo: "none" }).flatMap((x) => x.options.map((o) => o.sku)), ["1000-3"], "사진 없는 것 (노랑 빈칸 포함)");
assert.deepEqual(boardView(ps, { photo: "has" }).flatMap((x) => x.options.map((o) => o.sku)), ["1000-1", "1000-2", "2000-1"]);
assert.deepEqual(boardView(ps, { days: 30, salesMax: "0", unit: "option" }).flatMap((x) => x.options.map((o) => o.sku)), ["1000-1", "1000-3"], "30일 출고 0 (부진) 옵션");
assert.deepEqual(boardView(ps, { days: 30, salesMax: "1", unit: "product" }).map((x) => x.p.code), ["2000"], "상품 단위 = 옵션 합계로 (1000 은 합계 5)");
assert.deepEqual(boardView(ps, { days: 90, salesMin: "9", unit: "product" }).map((x) => x.p.code), ["1000"]);
assert.deepEqual(boardView(ps, { cat: "k14" }).map((x) => x.p.code), ["2000"]);
assert.deepEqual(boardView(ps, { q: "써지컬 10mm" }).map((x) => x.p.code), ["1000"]);
assert.deepEqual(boardView(ps, { cat: "k14", stockMax: "0", only: new Set(["1000-2", "2000-1"]) }).flatMap((x) => x.options.map((o) => o.sku)), ["1000-2", "2000-1"], "선택 모아보기 = 다른 조건 무시");
assert.deepEqual(sortView(boardView(ps, {}), "sales", 30).map((x) => x.p.code), ["1000", "2000"]);
assert.deepEqual(sortView(boardView(ps, {}), "salesLow", 30).map((x) => x.p.code), ["2000", "1000"]);
assert.deepEqual(sortView(boardView(ps, {}), "stockHigh", 30).map((x) => x.p.code), ["2000", "1000"]);
// 쪽 (상품 100개씩)
const many = Array.from({ length: 250 }, (_, i) => ({ p: { code: String(i) }, options: [], stats: {} }));
assert.deepEqual([pageOf(many, 1).items.length, pageOf(many, 3).items.length, pageOf(many, 3).pages, pageOf(many, 9).page, pageOf([], 1).pages], [100, 50, 3, 3, 1]);
// 선택 상태 · 엑셀 줄
assert.equal(pickState(ps[0].options, new Set()), "none");
assert.equal(pickState(ps[0].options, new Set(["1000-1"])), "some");
assert.equal(pickState(ps[0].options, new Set(["1000-1", "1000-2", "1000-3"])), "all");
const ex = excelRows(ps, new Set(["2000-1", "1000-3"]));
assert.deepEqual(ex.map((r) => [r.photo, ...r.cells.slice(1, 4), r.cells[8], r.cells[9], r.cells[11]]), [["1000-1.jpg", "1000-3", "써지컬 링", "10mm", 900, 2700, 0], ["2000.jpg", "2000-1", "14K 볼", "골드", 5000, 15000, 1]], "사진 없는 옵션은 대표 사진");
assert.equal(ex[0].cells.length, PB_EXCEL_COLUMNS.length);
// 11-06 단종: 옵션만 단종 → 상품은 그대로(옵션만 회색) · 옵션 모두 단종 → 상품 단종 → [단종] 카테고리, 일반 검색에서 빠짐
applyDisc(ps, new Set(["1000-1"]));
assert.deepEqual([ps[0].disc, ps[0].options.map((o) => o.disc)], [false, [true, false, false]], "옵션만 단종");
assert.deepEqual(boardView(ps, {}).map((x) => x.p.code), ["1000", "2000"], "옵션 단종은 그대로 보임 (회색)");
applyDisc(ps, new Set(["2000-1"]));
assert.equal(ps[1].disc, true, "옵션이 모두 단종 → 상품 단종");
assert.deepEqual(categoryCounts(ps), { surgical: 1, k14: 0, silver: 0, earring: 0, etc: 0, disc: 1 }, "단종 카테고리로 옮겨 셈");
assert.deepEqual(boardView(ps, {}).map((x) => x.p.code), ["1000"], "기본 = 단종 미포함");
assert.deepEqual(boardView(ps, { cat: "k14" }).map((x) => x.p.code), [], "원래 카테고리에서도 빠짐");
assert.deepEqual(boardView(ps, { disc: "include" }).map((x) => x.p.code), ["1000", "2000"], "단종 포함");
assert.deepEqual(boardView(ps, { cat: "k14", disc: "include" }).map((x) => x.p.code), ["2000"]);
assert.deepEqual(boardView(ps, { cat: "disc" }).map((x) => x.p.code), ["2000"], "[단종] 카테고리 = 단종 상품만");
applyDisc(ps, new Set(["1000-1", "2000-1"]));
assert.deepEqual(boardView(ps, { disc: "only" }).map((x) => [x.p.code, x.options.map((o) => o.sku)]), [["1000", ["1000-1"]], ["2000", ["2000-1"]]], "단종만 = 단종 옵션 있는 상품 · 단종 옵션만");
assert.deepEqual(boardView(ps, { disc: "only", cat: "k14" }).map((x) => x.p.code), ["2000"], "단종만 + 카테고리");
assert.deepEqual(boardView(ps, { only: new Set(["2000-1"]) }).map((x) => x.p.code), ["2000"], "모아보기는 단종도");
assert.match(excelRows(ps, new Set(["2000-1"]))[0].cells[3], /\(단종\)$/);
applyDisc(ps, new Set());

// xlsx 쓰기 (사진 포함) — zip 이 맞게 읽힘
assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926, "crc32");
assert.deepEqual([colName(0), colName(25), colName(26), colName(27)], ["A", "Z", "AA", "AB"]);
const z = zipEntries(zipStore([{ name: "a.txt", data: "안녕" }]));
assert.equal(new TextDecoder().decode(z.get("a.txt").data), "안녕");
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const book = zipEntries(buildXlsx({ sheetName: "선택 상품", columns: PB_EXCEL_COLUMNS, rows: ex.map((r) => r.cells), images: [{ row: 1, col: 0, data: jpg, ext: "jpeg", w: 80, h: 60 }], rowHeightPx: 88 }));
const sheetXml = new TextDecoder().decode(book.get("xl/worksheets/sheet1.xml").data);
assert.match(sheetXml, /<c r="C2" s="2" t="inlineStr"><is><t xml:space="preserve">써지컬 링<\/t>/);
assert.match(sheetXml, /<c r="I3" s="3"><v>5000<\/v><\/c>/, "숫자는 숫자 칸");
assert.match(sheetXml, /<row r="2" ht="66" customHeight="1">/);
assert.match(new TextDecoder().decode(book.get("xl/drawings/drawing1.xml").data), /<xdr:row>2<\/xdr:row>[\s\S]*r:embed="rId1"/, "사진은 그 줄에");
assert.deepEqual([...book.get("xl/media/image1.jpeg").data], [...jpg]);
assert.match(new TextDecoder().decode(book.get("[Content_Types].xml").data), /Extension="jpeg"/);

// 화면: 상품 관리 사이드 메뉴에 붙음 · 읽기 전용 (쓰기 요청 없음)
const panel = await readFile(new URL("../src/app/productBoardPanel.mjs", import.meta.url), "utf8");
assert.doesNotMatch(panel, /method:\s*"(PATCH|PUT|DELETE)"|Prefer:\s*"return/, "읽기 전용");
assert.match(panel, /x-picking-session/);
assert.match(panel, /sessionStorage/, "피킹 로그인은 탭마다(sessionStorage)");
assert.match(panel, /is-missing/);
const page = await readFile(new URL("../purchase/index.html", import.meta.url), "utf8");
assert.match(page, /productBoardPanel\.mjs\?v=/);
const css = await readFile(new URL("../src/styles/purchase.css", import.meta.url), "utf8");
assert.match(css, /\.pb-photo\.is-missing \{[^}]*background: #fef08a;/, "노랑 빈칸");

console.log("productBoard.mock.test: OK");
