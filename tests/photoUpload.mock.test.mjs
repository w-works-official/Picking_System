// 📷 상품 현황 › 상품 사진 관리 — 파일명 규칙 (피킹 대시보드와 같음, 11-10)
import assert from "node:assert/strict";
import { photoStorageName, photoTargets, photoTier, uploadPlan } from "../src/domain/photoUpload.mjs";
import { readFileSync } from "node:fs";

assert.deepEqual(photoTargets("8601.jpg"), ["8601"]);
assert.deepEqual(photoTargets("8601-2.jpg"), ["8601-2"]);
assert.deepEqual(photoTargets("8601-[1][3].jpg"), ["8601-1", "8601-3"]);
assert.deepEqual(photoTargets("8601-[1-3].png"), ["8601-1", "8601-2", "8601-3"]);
assert.deepEqual(photoTargets("{8601-[2-3]}.webp"), ["8601-2", "8601-3"]);
assert.deepEqual(photoTargets("8601-[a].jpg"), []);
assert.deepEqual(photoTargets("8601-[1-500].jpg"), [], "200개 넘는 범위는 거절");
assert.deepEqual([photoTier("8601.jpg"), photoTier("8601-[1][3].jpg"), photoTier("8601-[1-3].jpg"), photoTier("8601-[1][2-3].jpg")], ["direct", "group", "range", ""]);
assert.equal(photoStorageName("8601-2", "group", true), "8601-2.__group.__priority.jpg");
assert.equal(photoStorageName("8601", "direct", false), "8601.jpg");
assert.deepEqual(uploadPlan({ name: "{8601-[1-2]}.jpg", type: "image/jpeg" }).names, ["8601-1.__range.__priority.jpg", "8601-2.__range.__priority.jpg"]);
assert.deepEqual(uploadPlan({ name: "8601-[1][3].png", type: "image/png" }).names, ["8601-1.__group.jpg", "8601-3.__group.jpg"]);
assert.equal(uploadPlan({ name: "8601.gif", type: "image/gif" }).ok, false, "GIF 거절");
assert.match(uploadPlan({ name: "8601-[x].jpg", type: "image/jpeg" }).error, /파일명 형식/);

// 피킹 대시보드(pickingApp.mjs)와 같은 규칙인지 — 핵심 정규식이 같아야 함
const app = readFileSync(new URL("../src/app/pickingApp.mjs", import.meta.url), "utf8");
const mine = readFileSync(new URL("../src/domain/photoUpload.mjs", import.meta.url), "utf8");
for (const re of ["/^(.*)-((?:\\[[^\\]]+\\])+)$/", "end - start >= 200".replace("end - start", "b - a"), "/^\\{(.+)\\}$/"]) assert.ok(mine.includes(re), `규칙 ${re}`);
assert.ok(app.includes("/^(.*)-((?:\\[[^\\]]+\\])+)$/") && app.includes("end - start >= 200"), "대시보드 규칙 그대로");
console.log("photoUpload.mock.test: OK");
