// 🔎 상품찾기 · 📷 보조사진 (2026-11-07)
import assert from "node:assert/strict";
import { buildCatalog, initialSlots, searchCatalog } from "../src/domain/productFinder.mjs";
import { isSubFile, listSubs, masterCandidates, masterName, nextEmpty, parseSub, publicUrl, registerPlan, subName, subsFromList, swapMaster } from "../src/domain/subPhotos.mjs";

// --- 이름 규칙 ---
assert.equal(subName("8601-2", 1), "8601-2.__sub1.jpg");
assert.equal(masterName("8601-2"), "8601-2.__priority.jpg");
assert.ok(isSubFile("8601-2.__sub3.jpg") && !isSubFile("8601-2.jpg") && !isSubFile("8601-2.__priority.jpg"));
assert.deepEqual(parseSub("8601-2.__sub2.jpg"), { sku: "8601-2", slot: 2 });
assert.equal(parseSub("8601-2.jpg"), null);
assert.deepEqual(masterCandidates("8601-2"), [
  "8601-2.__priority.jpg", "8601-2.__group.__priority.jpg", "8601-2.__range.__priority.jpg", "8601.__priority.jpg",
  "8601-2.jpg", "8601-2.__group.jpg", "8601-2.__range.jpg", "8601.jpg",
], "마스터 = 피킹과 같은 순서");
assert.deepEqual(masterCandidates("8601"), ["8601.__priority.jpg", "8601.jpg"]);
assert.match(publicUrl("8601-2.__sub1.jpg", "t1"), /\/object\/public\/product-images\/sellpia\/8601-2.__sub1.jpg\?v=t1$/);

// --- 목록: 같은 코드만 (8601-21 은 아님) · 칸 순서 · 3칸까지 ---
const rows = [
  { name: "8601-21.__sub1.jpg", updated_at: "a" }, { name: "8601-2.__sub3.jpg", updated_at: "c" },
  { name: "8601-2.__sub1.jpg", updated_at: "b" }, { name: "8601-2.__sub4.jpg" }, { name: "8601-2.jpg" },
];
assert.deepEqual(subsFromList("8601-2", rows).map((s) => s.slot), [1, 3]);
{
  const calls = [];
  const fake = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => rows }; };
  const subs = await listSubs(fake, "8601-2");
  assert.deepEqual(subs.map((s) => s.name), ["8601-2.__sub1.jpg", "8601-2.__sub3.jpg"]);
  assert.equal(calls.length, 1, "요청 한 번");
  assert.deepEqual([calls[0].body.prefix, calls[0].body.search], ["sellpia", "8601-2.__sub"]);
  assert.deepEqual(await listSubs(fake, "../x"), [], "이상한 코드는 요청 안 함");
}

// --- 칸 · 등록 계획 ---
const saved = [{ slot: 2, url: "u2" }];
const slots = initialSlots(saved);
assert.deepEqual(slots.map((s) => s.kind), ["empty", "saved", "empty"]);
assert.equal(nextEmpty(slots), 1);
slots[0] = { slot: 1, kind: "new", blob: {}, url: "b1" };
slots[1] = { slot: 2, kind: "empty" };               // 등록된 2번을 ✕
assert.deepEqual(registerPlan(slots, saved), [{ op: "put", slot: 1 }, { op: "remove", slot: 2 }]);
assert.equal(nextEmpty([{ slot: 1, kind: "new" }, { slot: 2, kind: "saved" }, { slot: 3, kind: "new" }]), 0);

// --- ★ 맞바꾸기: 두 사진을 먼저 받고 → 보조 칸 ← 원래 마스터 → 마스터 ← 보조 ---
{
  const log = [];
  const blob = (t) => ({ size: 3, t });
  const fake = async (url, init = {}) => {
    const m = init.method || "GET";
    log.push(`${m} ${decodeURIComponent(url.replace(/^.*\/sellpia\//, "")).replace(/[?&]t=\d+/, "")}`);
    if (m === "GET") return { ok: true, blob: async () => blob(url.includes("__sub2") ? "SUB" : "MASTER") };
    return { ok: true, text: async () => "" };
  };
  const r = await swapMaster(fake, { sku: "8601-2", slot: 2, masterUrl: publicUrl("8601-2.jpg") });
  assert.equal(r.swapped, true);
  assert.deepEqual(log, ["GET 8601-2.__sub2.jpg", "GET 8601-2.jpg", "POST 8601-2.__sub2.jpg", "POST 8601-2.__priority.jpg"]);
}
{ // 마스터가 없던 상품: 보조 → 마스터, 보조 칸은 비움
  const log = [];
  const fake = async (url, init = {}) => { log.push(init.method || "GET"); return init.method ? { ok: true, text: async () => "" } : { ok: true, blob: async () => ({ size: 2 }) }; };
  const r = await swapMaster(fake, { sku: "8601-2", slot: 1, masterUrl: "" });
  assert.equal(r.swapped, false);
  assert.deepEqual(log, ["GET", "POST", "DELETE"]);
}
await assert.rejects(swapMaster(async () => ({ ok: false }), { sku: "8601-2", slot: 1 }), /보조사진을 읽지 못했습니다/);

// --- 검색: 코드 · 자사코드 · 낱말 여러 개, 딱 맞는 코드 먼저 ---
const cat = buildCatalog([
  { sellpia_sku_code: "8601-1", sellpia_product_code: "8601", sellpia_product_name: "써지컬 링 피어싱", sellpia_option_name: "골드 8mm", own_sku: "W100", stock: 3 },
  { sellpia_sku_code: "8601-2", sellpia_product_code: "8601", sellpia_product_name: "써지컬 링 피어싱", sellpia_option_name: "실버 8mm", own_sku: "W101", available_stock: 5 },
  { sellpia_sku_code: "18601-1", sellpia_product_name: "14K 볼", own_sku: "G8601" },
  { sellpia_sku_code: "8601-1", sellpia_product_name: "중복" },
]);
assert.equal(cat.length, 3, "중복 코드 한 번");
assert.equal(cat.find((x) => x.sku === "8601-2").stock, 5);
assert.deepEqual(searchCatalog(cat, "8601").map((x) => x.sku), ["8601-1", "8601-2", "18601-1"], "앞이 맞는 코드 먼저");
assert.deepEqual(searchCatalog(cat, "w101").map((x) => x.sku), ["8601-2"], "자사코드 (대소문자 무시)");
assert.deepEqual(searchCatalog(cat, "피어싱 실버").map((x) => x.sku), ["8601-2"], "낱말 여러 개");
assert.deepEqual(searchCatalog(cat, ""), []);

console.log("productFinder.mock.test: OK");
