// 💬 CS 관리 › 상담톡 (11-11) — 슬롯 채우기 · 후보 앞뒤 · 화면 계약
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fillSlots, stepIndex, CHAT_SAMPLE, CHAT_SLOT_CHOICES } from "../src/app/chatTalkPanel.mjs";

const convs = [{ id: "a", unread: 0 }, { id: "b", unread: 2 }, { id: "c", unread: 0 }, { id: "d", unread: 1 }];
assert.deepEqual(fillSlots([], convs, 4), ["b", "d", "a", "c"], "안 읽음 먼저");
assert.deepEqual(fillSlots(["c", "", "x"], convs, 4), ["c", "b", "d", "a"], "남겨 둔 자리 · 없어진 대화는 비움 뒤 채움");
assert.deepEqual(fillSlots(["a"], convs.slice(0, 1), 4), ["a", "", "", ""], "대화가 모자라면 빈 슬롯");
assert.equal(fillSlots([], convs, 10).length, 10);
assert.deepEqual([stepIndex(0, 5, -1), stepIndex(4, 5, 1), stepIndex(2, 5, 1), stepIndex(0, 0, 1)], [4, 0, 3, 0], "끝에서 돌아감");
assert.deepEqual(CHAT_SLOT_CHOICES, [4, 6, 8, 10]);
assert.ok(CHAT_SAMPLE.smart.length && CHAT_SAMPLE.kakao.length && CHAT_SAMPLE.smart.every((c) => /^예시/.test(c.name)), "예시는 지어낸 이름");

const html = readFileSync(new URL("../cs/index.html", import.meta.url), "utf8");
assert.match(html, /data-left-tab="vendor"[^>]*>📦 거래처<\/button>\s*<button[^>]*data-left-tab="chat"[^>]*>💬 상담톡<\/button>/);
assert.match(html, /data-right-panel="chat" hidden>\s*<div class="ct" data-chat><\/div>/);
const app = readFileSync(new URL("../src/app/csBoardApp.mjs", import.meta.url), "utf8");
assert.match(app, /if \(tab === "chat"\) openChat\(\); else chat\?\.stop\?\.\(\);/);
assert.match(app, /import\("\.\/chatTalkPanel\.mjs\?v=20261111-chat2"\)/);
assert.ok(app.indexOf("let chat = null") < app.indexOf("function showLeft") || app.indexOf("let chat = null") < app.indexOf('if (tab === "chat")'), "chat 은 쓰기 전에 선언");
const panel = readFileSync(new URL("../src/app/chatTalkPanel.mjs", import.meta.url), "utf8");
for (const t of ['action: "chatList"', 'action: "chatSuggest"', "avoid: ai.list", "count: 5", "&lt;&lt;", "&gt;&gt;", "data-ct-copy"]) assert.ok(panel.includes(t), t);
assert.ok(!/\.click\(\)|dispatchEvent|send\(/i.test(panel), "자동 전송 없음");
assert.ok(CHAT_SAMPLE.smart[0].aux.items?.length, "예시에 상품 카드");
for (const t of ["ct-card", "safeImg", 'referrerpolicy="no-referrer"', "사진 없음"]) assert.ok(panel.includes(t), t);
const css = readFileSync(new URL("../src/styles/csBoard.css", import.meta.url), "utf8");
assert.match(css, /\.ct-card \{/);
console.log("chatTalk.mock.test: OK");
