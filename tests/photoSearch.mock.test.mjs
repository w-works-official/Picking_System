// 🔍 사진으로 찾기 — 기기 안 비교 (2026-11-07)
import assert from "node:assert/strict";
import { DIM, b64ToInt8, bytesToB64, chunkText, codeOfPhoto, decodeIndex, encodeIndex, keywordSearch, percentOf, project, projection, quantize, refreshPlan, searchIndex, stampOf } from "../src/domain/photoSearch.mjs";

// 투영 행렬은 늘 같음 (기기마다 같은 색인)
const p1 = projection();
assert.equal(p1.length, DIM * 1280);
assert.equal(Math.round(p1[0] * 1e6), Math.round(projection()[0] * 1e6));
const mean = p1.reduce((a, b) => a + b, 0) / p1.length;
assert.ok(Math.abs(mean) < 0.01, "가우스 난수 평균 ≈ 0");

// 특징값 → 투영 → 길이 1 · 닮은 것은 닮게 남음
const rnd = (seed) => { let x = seed; return () => ((x = (x * 16807) % 2147483647) / 2147483647); };
const feat = (seed) => { const r = rnd(seed); return Float32Array.from({ length: 1280 }, () => Math.max(0, r() - 0.6) * 6); };
const a = feat(11), b = Float32Array.from(feat(11), (v, i) => v + (i % 7 === 0 ? 0.3 : 0)), c = feat(999);
const [pa, pb, pc] = [a, b, c].map(project);
const dot = (x, y) => x.reduce((s, v, i) => s + v * y[i], 0);
assert.ok(Math.abs(dot(pa, pa) - 1) < 1e-4, "길이 1");
assert.ok(dot(pa, pb) > dot(pa, pc) + 0.1, "조금 바뀐 사진이 다른 사진보다 가까움");

// int8 · base64 왕복
const q = quantize(pa);
assert.deepEqual([...b64ToInt8(bytesToB64(q))], [...q]);
assert.equal(bytesToB64(q).length, Math.ceil(DIM / 3) * 4);

// 이름 → 코드
assert.equal(codeOfPhoto("8601-2.__priority.jpg"), "8601-2");
assert.equal(codeOfPhoto("8601-2.__sub3.jpg"), "8601-2");
assert.equal(codeOfPhoto("8601-2.__range.__priority.jpg"), "8601-2");
assert.equal(codeOfPhoto("8601.jpg"), "8601");
assert.equal(stampOf("2026-11-07T01:02:03Z"), Math.floor(Date.parse("2026-11-07T01:02:03Z") / 1000).toString(36));
assert.equal(stampOf(""), "");

// 색인 글자 ⇄ 표 · 찾기 (코드별 최고 점수 · 질문 여러 개 중 최고)
const text = encodeIndex([
  { name: "8601-2.jpg", stamp: "s1", b64: bytesToB64(quantize(pc)) },
  { name: "8601-2.__sub1.jpg", stamp: "s2", b64: bytesToB64(quantize(pb)) },
  { name: "9000-1.jpg", stamp: "s3", b64: bytesToB64(quantize(pc)) },
]);
const idx = decodeIndex(text);
assert.deepEqual(idx.names, ["8601-2.jpg", "8601-2.__sub1.jpg", "9000-1.jpg"]);
const hits = searchIndex(idx, [pa], { center: false });
assert.deepEqual(hits.map((h) => h.code), ["8601-2", "9000-1"], "보조사진이 닮아서 8601-2 가 1등 · 코드 한 번씩");
assert.equal(hits[0].name, "8601-2.__sub1.jpg", "어느 사진이 맞았는지");
assert.ok(hits[0].score > 0.9);
assert.equal(searchIndex(idx, [pc, pa], { center: false })[0].score > 0.95, true, "질문 여러 개 중 최고");
// 가운데 맞추기: 사진 여러 장 색인에서 닮은 것은 높게 · 상관없는 것은 0 근처
{
  const many = Array.from({ length: 40 }, (_, i) => project(feat(1000 + i)));
  const ix = decodeIndex(encodeIndex(many.map((v, i) => ({ name: `${5000 + i}-1.jpg`, stamp: "", b64: bytesToB64(quantize(v)) }))));
  const raw = searchIndex(ix, [many[7]], { center: false, limit: 40 });
  const cen = searchIndex(ix, [many[7]], { limit: 40 });
  assert.equal(cen[0].code, "5007-1");
  assert.ok(cen[0].score > 0.9);
  const rawOthers = raw.slice(1).reduce((a, h) => a + h.score, 0) / 39, cenOthers = cen.slice(1).reduce((a, h) => a + h.score, 0) / 39;
  assert.ok(rawOthers > cenOthers + 0.15, `가운데 안 맞추면 상관없는 사진도 높게 나옴 (${rawOthers.toFixed(2)} vs ${cenOthers.toFixed(2)})`);
  assert.ok(Math.abs(cenOthers) < 0.15, `가운데 맞추면 0 근처 (${cenOthers.toFixed(2)})`);
}
assert.equal(decodeIndex("엉뚱한 글자").names.length, 0);
assert.deepEqual(chunkText("abcdefg", 3), ["abc", "def", "g"]);
assert.equal(chunkText(text, 45000).join(""), text);
assert.equal(percentOf(0.8), 100); assert.equal(percentOf(0.1), 0); assert.equal(percentOf(0.45), 50);

// 갱신 계획: 그대로 · 바뀐 것 · 새것 · 지워진 것 · __ 로 시작하는 파일 무시
const plan = refreshPlan([
  { name: "8601-2.jpg", updated_at: "x" },                                  // 수정표시 다름("" vs s1) → 다시
  { name: "9000-1.jpg", updated_at: "" },
  { name: "7777-1.jpg", updated_at: "2026-11-07T00:00:00Z" },
  { name: "__test.jpg" }, { name: "note.txt" },
], { names: ["9000-1.jpg", "8601-2.jpg", "gone.jpg"], stamps: ["", "s1", ""], b64s: ["AAAA", "BBBB", "CCCC"] });
assert.deepEqual(plan.keep.map((x) => x.name), ["9000-1.jpg"]);
assert.deepEqual(plan.todo.map((x) => x.name), ["8601-2.jpg", "7777-1.jpg"]);
assert.equal(plan.removed, 1);

// AI 낱말 → 상품명 찾기
const cat = [
  { sku: "1-1", name: "써지컬 링 피어싱 큐빅", option: "골드" },
  { sku: "2-1", name: "14K 볼 피어싱", option: "" },
  { sku: "3-1", name: "진주 귀걸이", option: "실버" },
];
assert.deepEqual(keywordSearch(cat, "써지컬 큐빅 링 피어싱").map((x) => x.sku), ["1-1"], "낱말 4개면 2개 이상 맞아야");
assert.deepEqual(keywordSearch(cat, "피어싱").map((x) => x.sku), ["1-1", "2-1"]);
assert.deepEqual(keywordSearch(cat, ""), []);
console.log("photoSearch.mock.test: OK");
