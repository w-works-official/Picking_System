import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pickKoreanVoice, piercingSpeechText } from "../src/domain/piercingSpeech.mjs";

assert.equal(piercingSpeechText("[P] S-11-02 ]"), "피어싱 S 11 다시 02");
assert.equal(piercingSpeechText("[p] s-11-02 ]"), "피어싱 S 11 다시 02");
assert.equal(piercingSpeechText("[P]S-11-02]"), "피어싱 S 11 다시 02");
assert.equal(piercingSpeechText("[P] T-14-02 ]0323"), "피어싱 T 14 다시 02");
assert.equal(piercingSpeechText("낱[P] A-01-01 ]"), "피어싱 A 01 다시 01");
assert.equal(piercingSpeechText("[P] S-11 ]"), "피어싱 S 11");
assert.equal(piercingSpeechText("[P] S-11-02-3 ]"), "피어싱 S 11 다시 02 다시 3");
assert.equal(piercingSpeechText("[P] R-26-01_2 ]##"), "피어싱 R 26 다시 01 다시 2", "underscore is read 다시");
assert.equal(piercingSpeechText("[P] A-01-09 ]-피킹패스-"), "피어싱 A 01 다시 09", "text after the bracket is dropped");
// Non-piercing codes stay silent.
assert.equal(piercingSpeechText("[CA-02-01_1]0323"), "");
assert.equal(piercingSpeechText("[EA-01-01]"), "");
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
assert.match(app, /function announcePickingSelection\(key\) \{\s*if \(state\.activeTab !== "picking" \|\| !pickingVoiceEnabled\(\)\) return;/);

assert.match(app, /return window\.localStorage\.getItem\(PICKING_VOICE_STORAGE_KEY\) === "on";\s*\} catch \{\s*return false;/, "voice is OFF unless this device turned it on");
const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
assert.match(index, /<strong id="metric-voice">OFF<\/strong>/);

console.log("piercingSpeech.mock.test: OK");
