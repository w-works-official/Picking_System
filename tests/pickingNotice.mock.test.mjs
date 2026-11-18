// ★ 공지 메모장 (11-11) — 맨 아래 3줄 · 피킹 화면 맨 위 · 테스트 글씨 지움
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tailLines } from "../src/app/pickingNotice.mjs";

assert.deepEqual(tailLines("a\nb\nc\nd\ne"), ["c", "d", "e"], "맨 아래 3줄");
assert.deepEqual(tailLines("a\nb\n\n\n"), ["a", "b"], "끝 빈 줄 빼고");
assert.deepEqual(tailLines(""), []);
assert.deepEqual(tailLines("a\r\nb"), ["a", "b"]);

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
assert.ok(!html.includes("피킹탭 단독 이식 테스트"), "제목 밑 테스트 글씨 지움");
assert.match(html, /<\/nav>\s*<div id="pk-notice" class="pk-notice"/, "★ 칸은 상위 메뉴 바로 오른쪽");
assert.match(html, /src\/app\/pickingNoticeBoot\.mjs\?v=/);
assert.match(html, /src\/styles\/pickingNotice\.css\?v=/);
const mod = readFileSync(new URL("../src/app/pickingNotice.mjs", import.meta.url), "utf8");
assert.ok(mod.includes('action: "noticeGet"') && mod.includes('action: "noticeSave"') && mod.includes("base: st.version"));
assert.ok(mod.includes("ta.scrollTop = ta.scrollHeight"), "창은 맨 아래부터 · 위로 올리면 앞 메모");
assert.ok(!/confirm\(|alert\(/.test(mod), "확인 창 없음");
// 11-18 대표님 요청: 빈 칸 안내 '(비어 있음 — 눌러서 쓰기)' → '공지사항'
assert.ok(mod.includes('"공지사항"') && !mod.includes("비어 있음 — 눌러서 쓰기"), "빈 칸은 '공지사항'");
// 11-18: 세 화면 같은 자리 (상위 메뉴 바로 오른쪽)
for (const page of ["../cs/index.html", "../purchase/index.html"]) {
  const h = readFileSync(new URL(page, import.meta.url), "utf8");
  assert.match(h, /<\/nav>\s*<!--[^>]*-->\s*<div id="pk-notice" class="pk-notice"/, page);
  assert.match(h, /\.\.\/src\/app\/pickingNoticeBoot\.mjs\?v=/, page);
  assert.match(h, /\.\.\/src\/styles\/pickingNotice\.css\?v=/, page);
}

// CS 관리: 가상 데이터 · 테스트 버튼 지움
const cs = readFileSync(new URL("../cs/index.html", import.meta.url), "utf8");
for (const t of ["🧪 테스트용", "🧪 가상셋팅", "cs-sample-toggle", "화면 미리보기(가상 예시)"]) assert.ok(!cs.includes(t), t);
const guide = readFileSync(new URL("../src/app/csSetupGuide.mjs", import.meta.url), "utf8");
assert.ok(!guide.includes("🧪 테스트용"));
const chat = readFileSync(new URL("../src/app/chatTalkPanel.mjs", import.meta.url), "utf8");
assert.match(chat, /function useSample[^}]*st\.data = perZone\(\(\) => \[\]\)/, "상담톡 예시 대화 안 보여 줌");
console.log("pickingNotice.mock.test: OK");
