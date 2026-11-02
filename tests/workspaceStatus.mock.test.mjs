// 2026-11-02 연결 상태 띠: 러너 · 수집기 PC · CS 시트 (순수 계산 + 가짜 화면으로 붙이기)
import assert from "node:assert/strict";
import { runnerPill, collectorPill, csPill, mountWorkspaceStatus } from "../src/app/workspaceStatus.mjs";

const now = Date.parse("2026-11-02T10:00:00Z");
// 러너
assert.deepEqual(runnerPill({ hasToken: false }).text, "러너 —");
assert.equal(runnerPill({ error: "x" }).cls, "is-error");
let p = runnerPill({ runners: { 사무실: now - 10_000, 집: now - 600_000 }, queue: [] }, now);
assert.equal(p.text, "러너 ● 사무실 · ○ 집");
assert.equal(p.cls, "is-on");
p = runnerPill({ runners: { 사무실: now - 10_000 }, queue: [{ 상태: "실행중", 러너: "사무실" }] }, now);
assert.equal(p.text, "러너 ◐ 사무실");
assert.equal(p.cls, "is-busy");
p = runnerPill({ runners: { 사무실: now - 600_000, 집: now - 600_000 } }, now);
assert.equal(p.cls, "is-error", "둘 다 꺼지면 빨강");
assert.equal(runnerPill({ runners: {} }, now).text, "러너 —");
// 수집기 PC (CS 화면과 같은 글자)
assert.equal(collectorPill(null).text, "수집기 PC —");
assert.equal(collectorPill({ seenAt: new Date(now - 5_000).toISOString(), pc: "사무실PC" }, now).text, "수집기 PC ●");
assert.equal(collectorPill({ seenAt: new Date(now - 120_000).toISOString() }, now).cls, "is-sample");
assert.equal(collectorPill({ seenAt: new Date(now - 900_000).toISOString() }, now).text, "수집기 PC ○");
// CS 시트
assert.equal(csPill({ hasToken: false }).text, "비밀번호 필요");
assert.equal(csPill({ ok: true, count: 3 }).text, "연결됨 · 3건");
assert.equal(csPill({ error: "x" }).text, "연결 안 됨");

// 가짜 화면: 상품 관리(셋 다) / CS 관리(러너만 — 나머지 둘은 CS 화면이 그림)
function fakeDom(page) {
  const make = () => ({ textContent: "", title: "", classList: { set: new Set(), add(c) { this.set.add(c); }, remove(...c) { c.forEach((x) => this.set.delete(x)); } } });
  const parts = { "[data-ws-runner]": make(), "[data-ws-collector]": make(), "[data-ws-cs]": make() };
  const box = { dataset: { wsStatus: page }, querySelector: (s) => parts[s] || null };
  return { parts, document: { visibilityState: "visible", querySelector: (s) => (s === "[data-ws-status]" ? box : null), addEventListener() {} } };
}
const storage = { getItem: (k) => (k === "system_v3_remote_board" ? JSON.stringify({ token: "rb-token-1234567890" }) : k === "system_v3_cs_board" ? JSON.stringify({ token: "cs-token-1234567890abcd" }) : null) };
const calls = [];
const fetchImpl = async (url, opt = {}) => {
  calls.push({ url: String(url), body: opt.body || "" });
  if (String(url).includes("remote")) return { ok: true, json: async () => ({ ok: true, runners: { 사무실: Date.now() - 1000 }, queue: [] }) };
  return { ok: true, json: async () => ({ ok: true, rows: [{ closed: false }, { closed: false }, { closed: true }], collector: { seenAt: new Date().toISOString(), pc: "PC" } }) };
};
const timers = [];
const win = { setInterval: (fn, ms) => { timers.push(ms); return timers.length; }, clearInterval() {} };
{
  const { parts, document } = fakeDom("purchase");
  const api = mountWorkspaceStatus({ document, window: win, storage, fetchImpl, csEndpoint: "https://cs.example/exec", remoteUrl: "https://remote.example/exec" });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(parts["[data-ws-runner]"].textContent, "러너 ● 사무실");
  assert.equal(parts["[data-ws-collector]"].textContent, "수집기 PC ●");
  assert.equal(parts["[data-ws-cs]"].textContent, "연결됨 · 2건");
  assert.ok(parts["[data-ws-cs]"].classList.set.has("is-on"));
  assert.deepEqual(timers, [30000, 60000], "러너 30초 · 시트 1분");
  const remoteCall = calls.find((c) => c.url.includes("remote"));
  assert.match(remoteCall.url, /action=queue/);
  assert.match(calls.find((c) => c.url.includes("cs.example")).body, /"action":"list"/);
  api.stop();
}
{
  calls.length = 0;
  const { parts, document } = fakeDom("cs");
  mountWorkspaceStatus({ document, window: win, storage, fetchImpl, csEndpoint: "https://cs.example/exec", remoteUrl: "https://remote.example/exec" });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(parts["[data-ws-runner]"].textContent, "러너 ● 사무실");
  assert.equal(parts["[data-ws-cs]"].textContent, "", "CS 화면에서는 CS 칸을 건드리지 않음");
  assert.ok(!calls.some((c) => c.url.includes("cs.example")), "CS 화면은 시트를 따로 부르지 않음(CS 화면이 이미 부름)");
}
{
  // 토큰 없는 기기: 부르지 않고 안내만
  calls.length = 0;
  const { parts, document } = fakeDom("purchase");
  mountWorkspaceStatus({ document, window: win, storage: { getItem: () => null }, fetchImpl, csEndpoint: "https://cs.example/exec", remoteUrl: "https://remote.example/exec" });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(calls.length, 0);
  assert.equal(parts["[data-ws-runner]"].textContent, "러너 —");
  assert.equal(parts["[data-ws-cs]"].textContent, "비밀번호 필요");
}
console.log("workspaceStatus.mock.test: OK");
