import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pickKoreanVoice, piercingSpeechText } from "../src/domain/piercingSpeech.mjs";

assert.equal(piercingSpeechText("[P] S-11-02 ]"), "피어싱 S 일일 다시 공이");
assert.equal(piercingSpeechText("[p] s-11-02 ]"), "피어싱 S 일일 다시 공이");
assert.equal(piercingSpeechText("[P]S-11-02]"), "피어싱 S 일일 다시 공이");
assert.equal(piercingSpeechText("[P] T-304-09 ]"), "피어싱 T 삼공사 다시 공구", "digits one by one, 0 is 공");
assert.equal(piercingSpeechText("[P] T-14-02 ]0323"), "피어싱 T 일사 다시 공이", "text after the bracket is dropped");
assert.equal(piercingSpeechText("낱[P] A-01-01 ]"), "피어싱 A 공일 다시 공일");
assert.equal(piercingSpeechText("[P] S-11 ]"), "피어싱 S 일일");
assert.equal(piercingSpeechText("[P] S-11-02-3 ]"), "피어싱 S 일일 다시 공이 다시 삼");
assert.equal(piercingSpeechText("[P] R-26-01_2 ]##"), "피어싱 R 이육 다시 공일 언더바 이", "underscore is read 언더바");
assert.equal(piercingSpeechText("[P] A-01-09 ]-피킹패스-"), "피어싱 A 공일 다시 공구");
// Set piercing (SA) and leading text before "[" (real data: 끝, 낱, ###).
assert.equal(piercingSpeechText("[SA-01-03_3]", { quantity: 2 }), "세트피어싱 공일 다시 공삼 언더바 삼, 2개");
assert.equal(piercingSpeechText("끝[SA-05-05_1]"), "세트피어싱 공오 다시 공오 언더바 일");
assert.equal(piercingSpeechText("[SA-12-01]"), "세트피어싱 일이 다시 공일");
assert.equal(piercingSpeechText("###[P] K-08-07 ]"), "피어싱 K 공팔 다시 공칠");
assert.equal(piercingSpeechText("끝[P] M-07-01 ]99"), "피어싱 M 공칠 다시 공일");
assert.equal(piercingSpeechText("[SAB-01]"), "S A B 공일", "unknown zones are spelled as written");
assert.equal(piercingSpeechText("###[NA-03-04_5]"), "목걸이 A 공삼 다시 공사 언더바 오");
// Quantity is read last.
assert.equal(piercingSpeechText("[P] S-11-02 ]", { quantity: 2 }), "피어싱 S 일일 다시 공이, 2개");
assert.equal(piercingSpeechText("[P] Q-23-07 ]", { quantity: "1" }), "피어싱 Q 이삼 다시 공칠, 1개");
assert.equal(piercingSpeechText("[P] Q-23-07 ]", { quantity: 0 }), "피어싱 Q 이삼 다시 공칠", "no quantity when unknown");
assert.equal(piercingSpeechText("[CA-02-01_1]", { quantity: 3 }), "부품 공이 다시 공일 언더바 일, 3개");
// Category names (2026-10-27).
const say = (code) => piercingSpeechText(code);
assert.equal(say("[PG-2-05]"), "피어싱 G 이 다시 공오", "P+letter zones are piercing");
assert.equal(say("[EA-11-01_1]"), "귀걸이 A 일일 다시 공일 언더바 일");
assert.equal(say("끝[EB-15-17_1]"), "귀걸이 B 일오 다시 일칠 언더바 일");
assert.equal(say("[ED-04-12]"), "귀걸이 D 공사 다시 일이");
assert.equal(say("[EE-02-09_4]"), "은피어싱 E 공이 다시 공구 언더바 사");
assert.equal(say("[EF-09-01_2]"), "은피어싱 F 공구 다시 공일 언더바 이");
assert.equal(say("[HA-03-01_1]"), "헤어 A 공삼 다시 공일 언더바 일");
assert.equal(say("XX[HB-6-01-1]"), "헤어 B 육 다시 공일 다시 일");
assert.equal(say("[HD-04-01_1]"), "헤어 D 공사 다시 공일 언더바 일");
assert.equal(say("XX[RA-7-01_4]"), "반지 A 칠 다시 공일 언더바 사");
assert.equal(say("[RC-01-02]"), "반지 C 공일 다시 공이");
assert.equal(say("[BA-06-02_1]0720"), "팔찌 A 공육 다시 공이 언더바 일");
assert.equal(say("[GPA-07-15_1]"), "십사케이 A 공칠 다시 일오 언더바 일");
assert.equal(say("[GPB-01-17_1]0226"), "십사케이 B 공일 다시 일칠 언더바 일");
assert.equal(say("[CA-02-01_1]0323"), "부품 공이 다시 공일 언더바 일");
// Other zones: spelled as written.
assert.equal(say("[TA-02_5]"), "T A 공이 언더바 오");
assert.equal(say("[HH-1-01]"), "H H 일 다시 공일", "only HA~HD are 헤어");
// Codes without a bracket stay silent.
assert.equal(say("성수문의 7"), "");
assert.equal(say("xx"), "");
assert.equal(piercingSpeechText(""), "");
assert.equal(piercingSpeechText(null), "");

// Female Korean voice first; male-named voices only as a last resort.
const v = (name, lang = "ko-KR") => ({ name, lang });
assert.equal(pickKoreanVoice([v("Microsoft InJoon Online (Natural) - Korean (Korea)"), v("Microsoft Heami - Korean (Korean)")]).name, "Microsoft Heami - Korean (Korean)");
assert.equal(pickKoreanVoice([v("Microsoft Hyunsu Online"), v("Google 한국의")]).name, "Google 한국의");
assert.equal(pickKoreanVoice([v("Samantha", "en-US"), v("Yuna", "ko-KR")]).name, "Yuna");
assert.equal(pickKoreanVoice([v("Microsoft InJoon Online"), v("한국어 1", "ko_KR")]).name, "한국어 1", "unknown-gender Korean voice beats a male one");
assert.equal(pickKoreanVoice([v("Microsoft InJoon Online")]).name, "Microsoft InJoon Online", "male voice only when nothing else");
assert.equal(pickKoreanVoice([v("Samantha", "en-US")]), null);

const app = await readFile(new URL("../src/app/pickingApp.mjs", import.meta.url), "utf8");
assert.match(app, /import \{ pickKoreanVoice, piercingSpeechText \} from "\.\.\/domain\/piercingSpeech\.mjs\?v=/);
assert.match(app, /const voice = pickKoreanVoice\(synth\.getVoices\(\)\);/);
assert.match(app, /piercingSpeechText\(item\?\.ownCode, \{ quantity: item\?\.quantity \}\)/);
assert.match(app, /function announcePickingSelection\(key\) \{\s*if \(state\.activeTab !== "picking" \|\| !pickingVoiceEnabled\(\)\) return;/);

assert.match(app, /return window\.localStorage\.getItem\(PICKING_VOICE_STORAGE_KEY\) === "on";\s*\} catch \{\s*return false;/, "voice is OFF unless this device turned it on");
const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
assert.match(index, /<strong id="metric-voice">OFF<\/strong>/);

console.log("piercingSpeech.mock.test: OK");
