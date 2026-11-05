// 메신저 슬롯 화면 감지 계산 (src/domain/msnCapture.mjs) — node tests/msnCapture.mock.test.mjs
import assert from "node:assert/strict";
import { cornerMarks, fitFromMarks, frameDiff, markBox, readMsnPrefs, regionOnVideo, screenCss, stepSlot, MSN_STABLE_TICKS } from "../src/domain/msnCapture.mjs";

const img = (w, h, fill = [255, 255, 255]) => { const d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i += 1) d.set([...fill, 255], i * 4); return d; };
const paint = (d, w, x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) d.set([...c, 255], (y * w + x) * 4); };
const PINK = [255, 0, 255];

// 화면 좌표: 최대화 창(테두리 -8), 탭·주소줄 높이, 다른 모니터 원점
const win = { screenX: -8, screenY: -8, outerWidth: 1936, innerWidth: 1920, outerHeight: 1056, innerHeight: 950 };
const scr = { width: 1920, height: 1080, left: 0, top: 0 };
assert.deepEqual(screenCss({ left: 100, top: 50, width: 300, height: 500 }, win, scr), { x: 100, y: 140, w: 300, h: 500 });
assert.deepEqual(screenCss({ left: 0, top: 0, width: 10, height: 10 }, { ...win, screenX: 1912 }, { ...scr, left: 1920 }), { x: 0, y: 90, w: 10, h: 10 }, "두 번째 모니터");
// 영상이 150% 배율(2880×1620)이면 영상 좌표도 1.5배
assert.deepEqual(regionOnVideo({ left: 100, top: 50, width: 300, height: 500 }, win, scr, { width: 2880, height: 1620 }), { x: 150, y: 210, w: 450, h: 750 });
assert.equal(regionOnVideo({ left: 5000, top: 0, width: 300, height: 500 }, win, scr, { width: 1920, height: 1080 }), null, "화면 밖");
assert.equal(regionOnVideo({ left: 0, top: 0, width: 300, height: 500 }, win, scr, { width: 0, height: 0 }), null);

// 영역 맞춤: 분홍 범위 ↔ CSS → 맞춤값으로 다시 계산하면 그 자리
const W = 400, H = 300, d = img(W, H);
paint(d, W, 50, 40, 60, 50, PINK); paint(d, W, 240, 40, 250, 50, PINK); paint(d, W, 50, 250, 60, 260, PINK); paint(d, W, 240, 250, 250, 260, PINK);
const box = markBox(d, W, H, 1);
assert.deepEqual([box.x, box.y, box.w, box.h], [50, 40, 200, 220]);
assert.equal(markBox(img(W, H), W, H), null);
const css = { x: 20, y: 10, w: 100, h: 110 };
const f = fitFromMarks(css, box);
assert.equal(f.ax, 2); assert.equal(f.ay, 2); assert.equal(f.bx, 10); assert.equal(f.by, 20);
const flat = { screenX: 0, screenY: 0, outerWidth: 100, innerWidth: 100, outerHeight: 100, innerHeight: 100 };
assert.deepEqual(regionOnVideo({ left: 20, top: 10, width: 100, height: 110 }, flat, { width: 100, height: 100, left: 0, top: 0 }, { width: 400, height: 300 }, f), { x: 50, y: 40, w: 200, h: 220 });
assert.equal(fitFromMarks(css, null), null);

// 모서리 분홍 점 개수
const s = img(40, 60); paint(s, 40, 0, 0, 3, 3, PINK); paint(s, 40, 37, 57, 40, 60, PINK);
assert.equal(cornerMarks(s, 40, 60, 3), 2);
assert.equal(cornerMarks(img(40, 60, [200, 210, 220]), 40, 60, 3), 0);

// 밝기 차이
const a = img(10, 10), b = img(10, 10); paint(b, 10, 0, 0, 10, 5, [0, 0, 0]);
assert.equal(frameDiff(a, a), 0);
assert.ok(frameDiff(a, b) > 100);
assert.equal(frameDiff(a, img(5, 5)), Infinity);

// 상태: 창 없음 → (덮음) 기준만 → 바뀜 → 조용 n번 → 새 변화 1건
let r = stepSlot({}, { marks: 4 });
assert.equal(r.state.mode, "none"); assert.equal(r.event, false);
r = stepSlot(r.state, { marks: 0, diff: 80 });
assert.equal(r.state.mode, "watch"); assert.equal(r.baseline, true); assert.equal(r.event, false, "창이 막 들어온 화면은 알리지 않음");
r = stepSlot(r.state, { marks: 0, diff: 1 }); assert.equal(r.event, false);
r = stepSlot(r.state, { marks: 0, diff: 20 }); assert.equal(r.state.changing, true);
for (let i = 1; i < MSN_STABLE_TICKS; i += 1) { r = stepSlot(r.state, { marks: 0, diff: 0.5, now: 9 }); assert.equal(r.event, false); }
r = stepSlot(r.state, { marks: 0, diff: 0.5, now: 10 });
assert.equal(r.event, true); assert.equal(r.state.events, 1); assert.equal(r.state.last, 10);
r = stepSlot(r.state, { marks: 3 }); assert.equal(r.state.mode, "none", "브라우저가 앞에 와서 가려짐");
assert.equal(r.state.events, 1, "알림 개수는 유지");

// 설정 읽기
assert.deepEqual(readMsnPrefs(null, "k"), { count: 3, height: 560, names: [], fit: null, width: 340, stars: [] });
const st = { getItem: () => JSON.stringify({ count: 12, height: 840, width: 460, stars: [true, "x", false], names: ["카톡"], fit: { ax: 1, ay: 1, bx: 0, by: "x" } }) };
assert.deepEqual(readMsnPrefs(st, "k"), { count: 10, height: 840, names: ["카톡"], fit: null, width: 460, stars: [true, false, false] }, "11-05: 최대 10칸 · 높이 4단계 · 폭 2가지 · 별표");
assert.equal(readMsnPrefs({ getItem: () => JSON.stringify({ width: 999, height: 999 }) }, "k").width, 340);
assert.deepEqual(readMsnPrefs({ getItem: () => "{bad" }, "k").count, 3);

console.log("msnCapture.mock.test: OK");
