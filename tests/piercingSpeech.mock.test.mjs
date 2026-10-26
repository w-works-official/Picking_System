import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { piercingSpeechText } from "../src/domain/piercingSpeech.mjs";

assert.equal(piercingSpeechText("[P] S-11-02 ]"), "피어싱 S 11 다시 02");
assert.equal(piercingSpeechText("[p] s-11-02 ]"), "피어싱 S 11 다시 02");
assert.equal(piercingSpeechText("[P]S-11-02]"), "피어싱 S 11 다시 02");
assert.equal(piercingSpeechText("[P] T-14-02 ]0323"), "피어싱 T 14 다시 02");
assert.equal(piercingSpeechText("낱[P] A-01-01 ]"), "피어싱 A 01 다시 01");
assert.equal(piercingSpeechText("[P] S-11 ]"), "피어싱 S 11");
assert.equal(piercingSpeechText("[P] S-11-02-3 ]"), "피어싱 S 11 다시 02 다시 3");
// Non-piercing codes stay silent.
assert.equal(piercingSpeechText("[CA-02-01_1]0323"), "");
assert.equal(piercingSpeechText("[EA-01-01]"), "");
assert.equal(piercingSpeechText(""), "");
assert.equal(piercingSpeechText(null), "");

const app = await readFile(new URL("../src/app/pickingApp.mjs", import.meta.url), "utf8");
assert.match(app, /import \{ piercingSpeechText \} from "\.\.\/domain\/piercingSpeech\.mjs\?v=/);
assert.match(app, /function announcePickingSelection\(key\) \{\s*if \(state\.activeTab !== "picking" \|\| !pickingVoiceEnabled\(\)\) return;/);

console.log("piercingSpeech.mock.test: OK");
