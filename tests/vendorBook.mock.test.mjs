// 📦 거래처 등록 (2026-11-26) — 정렬 · 화면 글 · 시트 v43
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { roomFor, sortVendors, vendorBookHtml, vendorKey, VENDOR_SLOTS } from "../src/app/vendorBook.mjs";

const sorted = sortVendors([{ name: "하나", uses: 2 }, { name: "가나", uses: 2 }, { name: "다라", uses: 5 }, { name: "마바", uses: 0 }]);
assert.deepEqual(sorted.map((v) => v.name), ["다라", "가나", "하나", "마바"], "많이 쓴 순 → 같으면 가나다");
assert.equal(VENDOR_SLOTS, 4);
assert.equal(vendorKey(" 세븐 피어싱 "), "세븐피어싱");

const html = vendorBookHtml({ users: ["민지", "", "수아", ""], vendors: [{ name: "세븐", rooms: ["세븐", "세븐 주문방", "", ""], uses: 3 }] });
assert.equal((html.match(/data-vb-user=/g) || []).length, 4);
assert.equal((html.match(/data-vb-room=/g) || []).length, 4);
assert.match(html, /value="민지"/);
assert.match(html, /value="세븐 주문방"/);
assert.match(html, />삭제</);
assert.match(html, />추가</);
assert.match(html, />저장</);
assert.match(html, /3회/);
assert.match(vendorBookHtml({ users: [], vendors: [{ name: "세븐", rooms: [] }] }, { pendingDel: "세븐" }), /삭제 확인/);
assert.match(vendorBookHtml({ users: [], vendors: [{ name: "a<b", rooms: [] }] }), /a&lt;b/);

const page = readFileSync(new URL("../cs/index.html", import.meta.url), "utf8");
const vendorPanel = page.slice(page.indexOf('data-left-panel="vendor"'), page.indexOf('data-left-panel="ship"'));
assert.match(vendorPanel, /<legend>거래처 등록<\/legend>\s*<div data-vendor-book><\/div>/);
assert.ok(vendorPanel.indexOf("거래처 등록") < vendorPanel.indexOf("거래처 카톡 주문 보내기"), "맨 위");
assert.doesNotMatch(vendorPanel.slice(0, vendorPanel.indexOf("거래처 카톡 주문 보내기")), /<details|<summary/, "접히지 않음");

const app = readFileSync(new URL("../src/app/csBoardApp.mjs", import.meta.url), "utf8");
assert.match(app, /if \(tab === "vendor"\) openVendorBook\(\);/);
assert.match(app, /import\("\.\/vendorBook\.mjs\?v=20261126-vb2"\)/);
const order = readFileSync(new URL("../src/app/vendorOrder.mjs", import.meta.url), "utf8");
assert.match(order, /system-v3-vendor-used/);

const gs = readFileSync(new URL("../docs/cs-board-sheet.gs", import.meta.url), "utf8");
for (const a of ["vendorBook", "vendorUse", "vendorEdit"]) {
  assert.match(gs, new RegExp(`'${a}'[,\\]]`), `${a} 직원 요청 목록`);
  assert.match(gs, new RegExp(`if \\(action === '${a}'\\) return ${a}_\\(`));
}
assert.match(gs, /var VENDOR_HEADER = \['업체명', '방1', '방2', '방3', '방4', '추가', '추가일'\];/);
// 11-26 이 PC 사용자 칸 → 일괄 붙이기 카톡방 이름
const bk = { vendors: [{ name: "세븐피어싱", rooms: ["세븐피어싱", "세븐 주문방", "", ""] }] };
assert.equal(roomFor(bk, 1, "세븐 피어싱"), "세븐 주문방");
assert.equal(roomFor(bk, 2, "세븐피어싱"), "", "빈 칸이면 업체명 그대로 쓰도록 빈 값");
assert.equal(roomFor(bk, -1, "세븐피어싱"), "", "이 PC 사용자 안 고름");
assert.equal(roomFor(bk, 1, "없는업체"), "");
const meHtml = vendorBookHtml({ users: ["민지", "지호", "", ""], vendors: bk.vendors }, { me: 1 });
assert.match(meHtml, /data-vb-me/);
assert.match(meHtml, /<option value="1" selected>지호<\/option>/);
assert.match(meHtml, /class="vb-user is-me" data-vb-user="1"/);
const slots = readFileSync(new URL("../src/app/msnSlots.mjs", import.meta.url), "utf8");
assert.match(slots, /const names = Array\.from\(\{ length: prefs\.count \}, \(_, i\) => roomOf\(prefs\.names\[i\]\)\);/);
assert.match(slots, /window\.SystemV3VendorRoom\?\.\(n\)/);
console.log("vendorBook mock: OK");

// 11-26 ✨ 로그인 필요 반짝이
const css = readFileSync(new URL("../src/styles/csBoard.css", import.meta.url), "utf8");
assert.match(css, /\.cs-sparkle \{ position: relative; animation: cs-sparkle-glow/);
assert.match(css, /prefers-reduced-motion: reduce\) \{ \.cs-sparkle/);
assert.match(app, /function renderLoginSparkle\(\)/);
assert.match(app, /renderConnectButtons\(\) \{\n    renderLoginSparkle\(\);/);
assert.match(app, /tab\.classList\.toggle\("cs-sparkle", names\.length > 0\)/);
console.log("login sparkle: OK");
