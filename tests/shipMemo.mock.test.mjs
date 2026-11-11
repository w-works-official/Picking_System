// 🚚 배송기록 › 주문별 메모 (11-11) — CSV · 화면 계약
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shipMemoCsv } from "../src/app/shipPhotosPanel.mjs";

const groups = [
  { key: "before", recipient: "", invoice: null, items: [] },
  { key: "INV1", recipient: "홍○동", invoice: { id: "INV1", t: "20261110143012" }, items: [] },
  { key: "INV2", recipient: "김철수", invoice: { id: "INV2", t: "20261110150000" }, items: [] },
];
const memos = { INV1: { name: "홍길동", lines: [{ code: "A-1", qty: "2" }, { code: "=B2", qty: "1" }], etc: '영상 확인, "파손" 없음', editor: "김성수", updatedAt: "2026-11-11T03:00:00Z" } };
const csv = shipMemoCsv(groups, memos);
assert.ok(csv.startsWith("﻿"), "엑셀 한글용 BOM");
const rows = csv.slice(1).trim().split("\r\n");
assert.equal(rows[0], '"순번","송장 시각","수신자","이름","상품코드","수량","기타","수정자","수정 시각"');
assert.equal(rows.length, 4, "상품 줄마다 한 줄 + 메모 없는 묶음 한 줄 · 송장 전 묶음 제외");
assert.equal(rows[1], '"1","11-10 14:30:12","홍○동","홍길동","A-1","2","영상 확인, ""파손"" 없음","김성수","11-11 12:00"', "송장 시각 · 수정 시각(한국)");
assert.match(rows[2], /^"2",.*,"'=B2","1",/, "수식으로 안 열림");
assert.equal(rows[3], '"3","11-10 15:00:00","김철수","","","","","",""');

const panel = readFileSync(new URL("../src/app/shipPhotosPanel.mjs", import.meta.url), "utf8");
assert.ok(!panel.includes("new Date(g.invoice.t)"), "배송 시각은 14자리 글자 그대로 보냄");
for (const t of ['action: "shipMemoList"', 'action: "shipMemoSave"', "base: m.version", "data-sp-csv", "＋ 상품", "📝 메모 CSV", 'type="number"']) assert.ok(panel.includes(t), t);
for (const t of ["이름", "상품코드", "수량", "기타"]) assert.ok(panel.includes(`<span>${t}</span>`), `메모 칸 ${t}`);
assert.ok(!/confirm\(|alert\(/.test(panel), "확인 창 없음");
const app = readFileSync(new URL("../src/app/csBoardApp.mjs", import.meta.url), "utf8");
assert.ok(!/returnsPanel|openRet/.test(app), "반품기록 탭은 배송기록 메모로 옮김");
assert.match(app, /editor: \(\) => state\.editor \}\); ship\.load\(\);/);
assert.match(panel, /<div class="sp-body"><div class="sp-files">.*<\/div>\$\{g\.invoice \? memoHtml\(g\) : ""\}<\/div>/, "메모는 사진·동영상 옆");
console.log("shipMemo.mock.test: OK");
