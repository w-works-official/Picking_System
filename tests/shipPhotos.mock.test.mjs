// 🚚 CS 관리 › 배송사진 (11-10) — 송장 사진 기준 묶음 · 수신자 찾기 · 화면 계약
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { groupShipFiles, nameFromFile, nameMatches, searchShipGroups, shipDownloadUrl, shipSizeLabel, shipTimeLabel } from "../src/domain/shipPhotos.mjs";

const f = (id, kind, extra = {}) => ({ id, kind, name: `${id}.${kind === "video" ? "mp4" : "jpg"}`, t: "20261110101000", ...extra });
const files = [
  f("v0", "video"),                                              // 첫 송장 전
  f("p1", "photo", { invoice: true, recipient: "홍*동", checked: true }),
  f("v1", "video"), f("p1b", "photo", { checked: true }), f("v2", "video"),
  f("p2", "photo", { invoice: true, recipient: "김 철수", checked: true }),
  f("v3", "video"),
  f("p3", "photo", { invoice: true, recipient: "", checked: true }),   // 송장인데 이름 못 읽음 → 묶음 시작 아님
  f("v4", "video"),
];
const g = groupShipFiles(files);
assert.deepEqual(g.map((x) => [x.key, x.recipient, x.items.map((i) => i.id)]), [
  ["before", "", ["v0"]],
  ["p1", "홍*동", ["v1", "p1b", "v2"]],
  ["p2", "김철수", ["v3", "p3", "v4"]],
], "송장 사진 뒤 파일은 다음 송장 사진 전까지 그 묶음");

// 11-27: 방금 올린(NAS 로 보내는 중)·미확인 사진은 새 묶음 · 30분 넘게 떨어진 파일도 새 묶음 (11-06 송장 묶음에 11-12·11-18 파일이 줄줄이 붙던 것)
const g2 = groupShipFiles([
  f("a", "photo", { invoice: true, recipient: "의성단북우세국", checked: true, t: "20261106171101" }),
  f("av", "video", { t: "20261106171101" }),
  f("k", "photo", { name: "김미영.jpg", pending: true, t: "20261112150535" }),
  f("kv", "video", { name: "김미영.mp4", pending: true, t: "20261112150559" }),
  f("bv", "video", { name: "bandicam 2026-11-12 16-23.mp4", pending: true, t: "20261112162304" }),
  f("b", "photo", { name: "bandicam 2026-11-18 13-31.jpg", pending: true, t: "20261118133141" }),
  f("bv2", "video", { pending: true, t: "20261118133145" }),
]);
assert.deepEqual(g2.map((x) => [x.key, x.recipient, !!x.unread, x.items.map((i) => i.id)]), [
  ["a", "의성단북우세국", false, ["av"]],
  ["k", "김미영", true, ["kv"]],
  ["gap-bv", "", false, ["bv"]],
  ["b", "", true, ["bv2"]],
]);
assert.equal(nameFromFile("김미영.jpg"), "김미영");
assert.equal(nameFromFile("bandicam 2026-11-18 13-31-41-123.jpg"), "");
assert.ok(nameMatches("홍길동", "홍*동"), "가려진 글자는 아무 글자");
assert.ok(nameMatches("길동", "홍○동"), "가린 자리는 아무 글자 (이름 뒤쪽 일부)");
assert.ok(!nameMatches("박길동", "홍○동"), "가리지 않은 글자가 다르면 안 맞음");
assert.ok(nameMatches("철수", "김철수"), "이름 일부");
assert.ok(nameMatches("김 철 수", "김철수"), "띄어쓰기 무시");
assert.ok(!nameMatches("이영희", "김철수"));
assert.ok(!nameMatches("", "김철수"));
assert.deepEqual(searchShipGroups(g, "홍길동").map((x) => x.key), ["p1"]);
assert.deepEqual(searchShipGroups(g, "철수").map((x) => x.key), ["p2"]);
assert.deepEqual(searchShipGroups(g, "없는사람"), []);

assert.equal(shipTimeLabel("20261110143012"), "11-10 14:30:12");
assert.equal(shipSizeLabel(5 * 1024 * 1024), "5.0MB");
assert.equal(shipDownloadUrl("a b"), "https://drive.google.com/uc?export=download&id=a%20b");

// 화면: 거래처 뒤 🚚 배송사진 탭 · 왼쪽 안내 · 오른쪽 목록 · 시트 v16
const html = readFileSync(new URL("../cs/index.html", import.meta.url), "utf8");
const order = [...html.matchAll(/data-left-tab="([a-z]+)"/g)].map((m) => m[1]);
assert.deepEqual(order, ["main", "board", "review", "chat", "ship", "vendor", "settings"], "메뉴 순서 (11-11: 리뷰·상담톡·배송기록·거래처·설정 · 반품기록은 배송기록 안 메모로 · 11-25 💬 메신저 탭 삭제)");
assert.match(html, /data-left-panel="ship"[^>]*><div data-ship-side><\/div><\/div>/);
assert.match(html, /data-right-panel="ship" hidden>\s*<div class="sp" data-ship><\/div>/);
const app = readFileSync(new URL("../src/app/csBoardApp.mjs", import.meta.url), "utf8");
assert.match(app, /if \(tab === "ship"\) openShip\(\);/);
assert.match(app, /import\("\.\/shipPhotosPanel\.mjs\?v=20261127-ship2"\)/);
const panel = readFileSync(new URL("../src/app/shipPhotosPanel.mjs", import.meta.url), "utf8");
for (const t of ["▶ 파일 정리 실행", "📋 전체 리스트", "🔎 파일 찾기", "⬇ 사진/영상", 'action: "shipScan"', 'action: "shipList"']) assert.ok(panel.includes(t), t);
const gs = readFileSync(new URL("../docs/cs-board-sheet.gs", import.meta.url), "utf8");
assert.match(gs, /'optionPhotoAi', 'shipList', 'shipScan'[,\]]/);
assert.match(gs, /function 배송사진_권한\(\)/, "드라이브 권한 허용용 함수");
console.log("shipPhotos.mock.test: OK");
