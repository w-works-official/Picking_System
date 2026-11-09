// 11-05: 아무 PC 에서나 창 도우미 — tools/msn_helper.bat (메신저 전용 모드 --msn) + V3 [▶ 창 도우미 켜기] (v3msn://)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const bat = readFileSync("tools/msn_helper.bat", "latin1");
assert.ok([...bat].every((c) => c.charCodeAt(0) < 128), "한글 없이 ASCII 만 (cmd 가 한글 줄을 잘못 읽는 문제)");
assert.ok(!/[^\r]\n/.test(bat), "줄바꿈은 CRLF");
assert.match(bat, /g1_v3_link\.py" --msn/, "메신저 전용 모드로만 켬 (시트 요청 안 가져감)");
assert.match(bat, /raw\.githubusercontent\.com\/w-works-official\/Picking_System\/main\/docs\/g1_v3_link\.py/);
assert.match(bat, /ast\.parse/, "받은 파일이 깨졌으면 바꾸지 않음");
assert.match(bat, /HKCU\\Software\\Classes\\v3msn/, "v3msn:// 링크 등록 (관리자 권한 필요 없음)");
assert.match(bat, /GetFolderPath\('Startup'\)/, "컴퓨터 켤 때 자동 시작");
assert.match(bat, /127\.0\.0\.1:47811\/msn\/ping/, "이미 켜져 있으면 또 켜지 않음");
assert.ok(!/echo [^\r\n]*[^>]>[^n]/.test(bat.replace(/>nul/g, "")), "echo 글에 > 가 없어야 함 (파일로 새어 나감)");
const html = readFileSync("cs/index.html", "utf8");
assert.equal((html.match(/href="v3msn:\/\/start"/g) || []).length, 3, "메신저 답변 · 거래처 두 탭 + 💬 메신저 사이드바 '이 PC 에서 메신저 쓰기'");
assert.equal((html.match(/href="\.\.\/tools\/msn_helper\.bat"/g) || []).length, 3);
assert.ok(html.indexOf('data-left-panel="msn"') < html.indexOf("cs-other-pc") && html.indexOf("cs-other-pc") < html.indexOf('data-left-panel="vendor"'), "11-09: 이 PC 에서 메신저 쓰기 = 💬 메신저 사이드바");
assert.ok(html.indexOf('data-left-panel="settings"') < html.indexOf('class="cs-master"') && html.indexOf('class="cs-master"') < html.indexOf('id="cs-install"') && html.indexOf('id="cs-onetouch"') > html.indexOf('class="cs-master"'), "⚙ 설정: 🖥 마스터 PC 설정(원터치·설치 파일·수집기 설정)");
console.log("msnHelperBat.contract.test: OK");
