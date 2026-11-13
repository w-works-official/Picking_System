// 💬 CS 관리 › 상담톡 (11-11) — 슬롯 채우기 · 후보 앞뒤 · 화면 계약
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fillSlots, stepIndex, CHAT_SAMPLE, CHAT_SLOT_CHOICES, CHAT_ZONES, zoneOrder, moveZone } from "../src/app/chatTalkPanel.mjs";

const convs = [{ id: "a", unread: 0 }, { id: "b", unread: 2 }, { id: "c", unread: 0 }, { id: "d", unread: 1 }];
assert.deepEqual(fillSlots([], convs, 4), ["b", "d", "a", "c"], "안 읽음 먼저");
assert.deepEqual(fillSlots(["c", "", "x"], convs, 4), ["c", "b", "d", "a"], "남겨 둔 자리 · 없어진 대화는 비움 뒤 채움");
assert.deepEqual(fillSlots(["a"], convs.slice(0, 1), 4), ["a", "", "", ""], "대화가 모자라면 빈 슬롯");
assert.equal(fillSlots([], convs, 10).length, 10);
assert.deepEqual([stepIndex(0, 5, -1), stepIndex(4, 5, 1), stepIndex(2, 5, 1), stepIndex(0, 0, 1)], [4, 0, 3, 0], "끝에서 돌아감");
assert.deepEqual(CHAT_SLOT_CHOICES, [4, 6, 8, 10]);
assert.ok(CHAT_SAMPLE.smart.length && CHAT_SAMPLE.kakao.length && CHAT_SAMPLE.smart.every((c) => /^예시/.test(c.name)), "예시는 지어낸 이름");

const html = readFileSync(new URL("../cs/index.html", import.meta.url), "utf8");
assert.match(html, /data-left-tab="review"[^>]*>⭐ 리뷰<\/button>\s*<button[^>]*data-left-tab="chat"[^>]*>💬 상담톡<\/button>/, "리뷰 다음");
assert.match(html, /data-right-panel="chat" hidden>\s*<div class="ct" data-chat><\/div>/);
const app = readFileSync(new URL("../src/app/csBoardApp.mjs", import.meta.url), "utf8");
assert.match(app, /if \(tab === "chat"\) openChat\(\); else chat\?\.stop\?\.\(\);/);
assert.match(app, /import\("\.\/chatTalkPanel\.mjs\?v=20261113-ably1"\)/);
assert.ok(app.indexOf("let chat = null") < app.indexOf("function showLeft") || app.indexOf("let chat = null") < app.indexOf('if (tab === "chat")'), "chat 은 쓰기 전에 선언");
const panel = readFileSync(new URL("../src/app/chatTalkPanel.mjs", import.meta.url), "utf8");
for (const t of ['action: "chatList"', 'action: "chatSuggest"', "avoid: ai.list", "count: 5", "&lt;&lt;", "&gt;&gt;", "data-ct-copy"]) assert.ok(panel.includes(t), t);
assert.ok(!/\.click\(\)|dispatchEvent/i.test(panel), "화면이 매체 버튼을 누르지 않음");
assert.match(panel, /e\.key !== "Enter" \|\| e\.shiftKey \|\| e\.isComposing/, "Enter = 보내기 · Shift+Enter 줄바꿈 · 한글 조합 중 아님");
assert.match(panel, /if \(!sender\) \{/, "수집기 연결 전에는 복사만");
assert.ok(CHAT_SAMPLE.smart[0].aux.items?.length, "예시에 상품 카드");
for (const t of ["ct-card", "safeImg", 'referrerpolicy="no-referrer"', "사진 없음"]) assert.ok(panel.includes(t), t);
const css = readFileSync(new URL("../src/styles/csBoard.css", import.meta.url), "utf8");
assert.match(css, /\.ct-card \{/);
assert.match(css, /\.ct-slots \{[^}]*grid-template-columns: repeat\(var\(--ct-cols\), minmax\(256px, 318px\)\)/, "메시지 창 폭 최소·최대");
assert.match(css, /\.ct-zone \{[^}]*width: fit-content; max-width: 100%;[^}]*grid-template-columns: 230px minmax\(0, max-content\) 240px;/, "넓으면 보조내용이 바로 옆 · 남는 건 여백");
// 11-13 에이블리 문의 구역 · 끌어서 순서 바꾸기
assert.deepEqual(CHAT_ZONES.map((z) => z.key), ["smart", "kakao", "ably"]);
assert.deepEqual(zoneOrder(), ["smart", "kakao", "ably"]);
assert.deepEqual(zoneOrder(["ably", "smart", "x", "ably"]), ["ably", "smart", "kakao"], "모르는 것·겹친 것 빼고 새 구역은 뒤");
assert.deepEqual(moveZone(["smart", "kakao", "ably"], "ably", "smart"), ["ably", "smart", "kakao"], "위로 끌면 그 앞");
assert.deepEqual(moveZone(["smart", "kakao", "ably"], "smart", "kakao"), ["kakao", "smart", "ably"], "아래로 끌면 그 뒤");
assert.deepEqual(moveZone(["smart", "kakao", "ably"], "smart", "smart"), ["smart", "kakao", "ably"]);
for (const t of ['draggable="true"', "data-ct-drag", "order: st.order"]) assert.ok(panel.includes(t), t);
assert.match(css, /\.ct-zone\.ct-ably \{/);
assert.match(css, /\.ct \{[^}]*grid-auto-rows: minmax\(0, 1fr\)/, "구역 수만큼 줄");
console.log("chatTalk.mock.test: OK");
