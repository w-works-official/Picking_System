// 📦 거래처 › 💬 전체 멘트 (11-11) — 붙이기 · 바꾸기 · 저장 · 최근 · 화면 계약
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mergeMent, pushRecent, mountVendorMent, MENT_SAVED } from "../src/app/vendorMent.mjs";

assert.equal(mergeMent("", "", "감사합니다"), "감사합니다", "빈 칸에는 멘트만");
assert.equal(mergeMent("수량 확인 부탁드려요  ", "", "감사합니다"), "수량 확인 부탁드려요\n감사합니다", "쓴 글 뒤에 붙임");
assert.equal(mergeMent("수량 확인\n감사합니다", "감사합니다", "오늘 출고 부탁드려요"), "수량 확인\n오늘 출고 부탁드려요", "앞서 붙인 멘트만 바꿈");
assert.equal(mergeMent("수량 확인\n감사합니다", "감사합니다", ""), "수량 확인", "빈 멘트 적용 = 붙인 멘트 빼기");
assert.equal(mergeMent("직접 고친 글", "감사합니다", "새 멘트"), "직접 고친 글\n새 멘트", "붙인 멘트를 지웠으면 새로 붙임");
assert.deepEqual(pushRecent(["a", "b"], "b"), ["b", "a"], "같은 멘트는 맨 앞으로");
assert.equal(pushRecent(["1", "2", "3", "4", "5"], "6").length, 5, "최근 5개");
assert.equal(MENT_SAVED, 3);

// 화면: 가짜 DOM 없이 계약만
const html = readFileSync(new URL("../cs/index.html", import.meta.url), "utf8");
assert.match(html, /<div class="vo-row">\s*<div class="vo-box" data-vendor-order>[\s\S]*?<div class="vm-box" data-vendor-ment><\/div>\s*<\/div>/, "주문서 올리기 옆");
const slots = readFileSync(new URL("../src/app/msnSlots.mjs", import.meta.url), "utf8");
assert.match(slots, /placeholder="Tab\(\+←→ 또는 숫자\)"/, "안내는 Tab 만");
assert.ok(!/placeholder="보낼 답변/.test(slots), "나머지 설명 지움");
assert.match(slots, /import\("\.\/vendorMent\.mjs\?v=20261111-ment2"\)/);
const panel = readFileSync(new URL("../src/app/vendorMent.mjs", import.meta.url), "utf8");
assert.match(panel, /const bars = \[slotsRoot\?\.querySelector\("\.cs-answer-top"\), row\]/, "슬롯 설정 줄 · 멘트 줄 둘 다");
assert.match(panel, /el\.style\.maxWidth = /, "슬롯 오른쪽 끝까지만");
for (const t of ["전체 적용", "data-vm-save", "data-vm-load", "data-vm-recent", "dataset.vmApplied"]) assert.ok(panel.includes(t), t);
assert.ok(!/helperCall|\/send|confirm\(/.test(panel), "붙이기만 — 보내지 않음");
assert.equal(typeof mountVendorMent, "function");
console.log("vendorMent.mock.test: OK");
