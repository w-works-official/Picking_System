// 🚚 배송기록 › 주문별 메모 (11-11) — CSV · 목록 거르기 · 화면 계약
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shipMemoCsv, filterShipGroups, LINE_FIELDS, memoT } from "../src/app/shipPhotosPanel.mjs";

const groups = [
  { key: "before", recipient: "", invoice: null, items: [{ t: "20261110100000" }] },
  { key: "INV1", recipient: "홍○동", invoice: { id: "INV1", t: "20261110143012" }, items: [] },
  { key: "INV2", recipient: "김철수", invoice: { id: "INV2", t: "20261112150000" }, items: [] },
  { key: "memo-abc12345", memoOnly: true, recipient: "", invoice: null, items: [] },
];
const memos = {
  INV1: { name: "홍길동", phone: "010-1234-5678", vendor: "세븐피어싱", ordNo: "O1", lines: [{ pname: "미니볼", option: "3mm", qty: "2", own: "WW-1", code: "A-1", etc: '영상 확인, "파손" 없음' }, { pname: "", option: "", qty: "1", own: "", code: "=B2", etc: "반품 요청" }], editor: "김성수", updatedAt: "2026-11-11T03:00:00Z" },
  "memo-abc12345": { key: "memo-abc12345", name: "전화 반품", t: "2026-11-11 14:05:00", lines: [{ pname: "링", qty: "1" }] },
};
assert.deepEqual(LINE_FIELDS.map((f) => f.label), ["상품명", "옵션명", "수량", "자사코드", "상품코드", "기타"]);
assert.equal(memoT(memos["memo-abc12345"]), "20261111140500");
const csv = shipMemoCsv(groups, memos);
assert.ok(csv.startsWith("﻿"), "엑셀 한글용 BOM");
const rows = csv.slice(1).trim().split("\r\n");
assert.equal(rows[0], '"순번","송장 시각","수신자","이름","전화번호","매입처","상품명","옵션명","수량","자사코드","상품코드","기타","주문번호","수정자","수정 시각"');
assert.equal(rows.length, 5, "상품 줄마다 + 메모 없는 묶음 한 줄 + 메모 슬롯 · 송장 전 묶음 제외");
assert.equal(rows[1], '"1","11-10 14:30:12","홍○동","홍길동","010-1234-5678","세븐피어싱","미니볼","3mm","2","WW-1","A-1","영상 확인, ""파손"" 없음","O1","김성수","11-11 12:00"');
assert.match(rows[2], /^"2",.*,"1","","'=B2","반품 요청",/, "수식으로 안 열림 · 기타도 줄마다");
assert.match(rows[4], /^"4","11-11 14:05:00","","전화 반품",.*"링","","1",/, "메모 슬롯도 CSV 에");

// 목록 거르기
const keys = (o) => filterShipGroups(groups, memos, o).map((g) => g.key);
assert.deepEqual(keys({}), ["before", "INV1", "INV2", "memo-abc12345"], "조건 없으면 전부");
assert.deepEqual(keys({ codeOnly: true }), ["INV1"], "상품코드(또는 자사코드) 적힌 주문만");
assert.deepEqual(keys({ from: "2026-11-11" }), ["INV2", "memo-abc12345"], "날짜부터");
assert.deepEqual(keys({ to: "2026-11-10" }), ["INV1"], "날짜까지 · 송장 전 파일은 거르기 때 빠짐");
assert.deepEqual(keys({ q: "세븐" }), ["INV1"], "메모 글자로 찾기");
assert.deepEqual(keys({ q: "철수" }), ["INV2"], "수신자 이름으로 찾기");
assert.deepEqual(keys({ q: "반품" }), ["INV1", "memo-abc12345"]);

const panel = readFileSync(new URL("../src/app/shipPhotosPanel.mjs", import.meta.url), "utf8");
for (const t of ['action: "shipMemoList"', 'action: "shipMemoSave"', 'action: "shipHints"', "base: m.version", "data-sp-csv", "＋ 상품", "📝 메모 CSV", "주문<br>찾기", "m.name || g?.recipient", "👤＋ 슬롯 추가", "data-sp-codeonly", "data-sp-from", "data-sp-to"]) assert.ok(panel.includes(t), t);
for (const t of ["이름", "전화번호", "매입처"]) assert.ok(panel.includes(`<span>${t}</span>`), `메모 칸 ${t}`);
assert.ok(!panel.includes("data-sp-mode"), "🔎 파일 찾기 버튼 뺌");
assert.ok(!panel.includes('class="sp-memo-t"'), "메모 앞 📝 메모 글자 없음");
assert.match(panel, /order_items\?select=\$\{cols\}&ord_no=eq\./, "주문 상품 읽기");
assert.ok(panel.includes('q("p_name,p_option,o_amount,p_dpcode,p_code,sellpia_supplier_cell_raw")'), "매입처도 피킹 주문 상품에서");
assert.ok(panel.includes("m.vendor = vendorsOf(items)"), "매입처 채움");
assert.ok(!panel.includes("old[k]?.etc"), "다시 채우면 앞 상품 줄 지움");
assert.ok(panel.includes("data-spm-clear") && panel.includes('phone: "", vendor: "", ordNo: "", lines: [emptyLine()]'), "비우기");
assert.ok(panel.includes("sp-file-empty"), "빈 슬롯도 사진·동영상 빈자리");
assert.match(panel, /"x-picking-session": session\.token/, "피킹 로그인 세션으로만");
assert.ok(!/method: "(POST|PATCH|DELETE)"/.test(panel.split("pickRows")[1] || ""), "피킹 DB 는 읽기만");
assert.ok(!/confirm\(|alert\(/.test(panel), "확인 창 없음");
const app = readFileSync(new URL("../src/app/csBoardApp.mjs", import.meta.url), "utf8");
assert.ok(!/returnsPanel|openRet/.test(app), "반품기록 탭은 배송기록 메모로 옮김");
assert.match(app, /editor: \(\) => state\.editor, storages: \[/);
assert.match(panel, /<label class="sp-cal"[^>]*><b data-sp-cal="from">📅<\/b><input type="date" data-sp-from/, "날짜는 달력 아이콘");
assert.match(panel, /Prefer: "count=exact"/, "피킹 DB 주문 범위·건수 표시");
// 🗑 선택 지우기 (11-11) — 빈 메모 슬롯만 · 두 번 눌러야 지움 · 확인 창 없음
assert.ok(panel.includes('action: "shipMemoDelete"'), "시트 지우기 요청");
assert.ok(panel.includes("data-sp-del"), "🗑 선택 지우기 버튼");
assert.match(panel, /const pickedSlots = \(\) => memoOnlyGroups\(\)/, "지우기는 빈 메모 슬롯 체크만 (송장 묶음 아님)");
assert.match(panel, /한 번 더 누르면 \$\{slotPicks\}개 지움/, "두 번 눌러야 지움");
assert.match(panel, /clearTimeout\(st\.memoTimers\.get\(k\)\)/, "지우기 전 안 보낸 저장 취소");
console.log("shipMemo.mock.test: OK");
