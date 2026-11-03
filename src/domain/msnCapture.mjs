// 메신저 슬롯 화면 감지 — 계산만 (2026-11-03 대표님 요청)
// 메신저 탭의 슬롯(빈 틀) 위에 카톡 등 메신저 창을 끌어다 놓으면, 그 영역만 화면 공유 영상에서 잘라 보고
// 바뀌었을 때 "새 변화" 로 알림. 다른 창·알림은 보지 않음 (슬롯 영역만).
// 틀 네 모서리에 분홍(#ff00ff) 표시 → 보이면 = 틀 위에 창이 없음(또는 브라우저가 앞에 와서 가려짐), 안 보이면 = 메신저 창이 덮고 있음.

export const MSN_MARK = { r: 255, g: 0, b: 255 };
export const MSN_DIFF_ON = 3.5;        // 작게 줄인 화면의 평균 밝기 차이(0~255) 이상이면 "바뀌는 중"
export const MSN_STABLE_TICKS = 2;     // 바뀐 뒤 이만큼 조용하면 "새 변화" 1건
export const MSN_LIMITS = { slotsMin: 1, slotsMax: 4, heights: [420, 560, 700] };

export function isMark(r, g, b) {
  return r > 200 && g < 70 && b > 200;
}

// 화면 공유 영상(전체 화면) 안에서 요소가 있는 자리 (영상 픽셀)
//  rect: 요소 getBoundingClientRect (CSS px, 브라우저 안) · win: window · scr: window.screen
//  fit: 영역 자동 맞춤 결과 {ax, bx, ay, by} — 영상 = a × (화면 CSS 좌표) + b. 없으면 창 위치로 계산
export function screenCss(rect, win, scr) {
  const border = Math.max(0, ((win.outerWidth || 0) - (win.innerWidth || 0)) / 2);
  const top = Math.max(0, (win.outerHeight || 0) - (win.innerHeight || 0) - border);
  const ox = Number.isFinite(scr?.left) ? scr.left : (scr?.availLeft || 0);
  const oy = Number.isFinite(scr?.top) ? scr.top : (scr?.availTop || 0);
  const x = (win.screenX || 0) - ox + border + rect.left;
  const y = (win.screenY || 0) - oy + top + rect.top;
  return { x, y, w: rect.width, h: rect.height };
}

export function regionOnVideo(rect, win, scr, video, fit = null) {
  const c = screenCss(rect, win, scr);
  const vw = video.width || 0, vh = video.height || 0;
  if (!vw || !vh) return null;
  const ax = fit?.ax || vw / (scr?.width || vw), ay = fit?.ay || vh / (scr?.height || vh);
  const bx = fit ? fit.bx : 0, by = fit ? fit.by : 0;
  let x = Math.round(ax * c.x + bx), y = Math.round(ay * c.y + by);
  let w = Math.round(ax * c.w), h = Math.round(ay * c.h);
  if (x < 0) { w += x; x = 0; }
  if (y < 0) { h += y; y = 0; }
  w = Math.min(w, vw - x); h = Math.min(h, vh - y);
  return w > 8 && h > 8 ? { x, y, w, h } : null;
}

// 분홍 표시가 있는 픽셀들의 범위 (영역 자동 맞춤용) — data: RGBA, step 만큼 건너뛰며
export function markBox(data, w, h, step = 2) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, n = 0;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      if (isMark(data[i], data[i + 1], data[i + 2])) {
        n += 1;
        if (x < x0) x0 = x; if (y < y0) y0 = y;
        if (x > x1) x1 = x; if (y > y1) y1 = y;
      }
    }
  }
  return n >= 4 ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, n } : null;
}

// 화면 CSS 좌표(틀) ↔ 영상에서 찾은 분홍 범위 → 영상 = a × CSS + b
export function fitFromMarks(css, box) {
  if (!css || !box || css.w < 20 || css.h < 20) return null;
  const ax = box.w / css.w, ay = box.h / css.h;
  return { ax, ay, bx: box.x - ax * css.x, by: box.y - ay * css.y };
}

// 잘라 온 작은 그림의 네 모서리에 분홍 표시가 몇 개 보이나 (0~4)
export function cornerMarks(data, w, h, size = 4) {
  const corners = [[0, 0], [w - size, 0], [0, h - size], [w - size, h - size]];
  let seen = 0;
  for (const [cx, cy] of corners) {
    let hit = 0;
    for (let y = Math.max(0, cy); y < Math.min(h, cy + size); y += 1) {
      for (let x = Math.max(0, cx); x < Math.min(w, cx + size); x += 1) {
        const i = (y * w + x) * 4;
        if (isMark(data[i], data[i + 1], data[i + 2])) hit += 1;
      }
    }
    if (hit >= 2) seen += 1;
  }
  return seen;
}

// 두 그림의 평균 밝기 차이 (0~255, 같은 크기)
export function frameDiff(a, b, step = 2) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let sum = 0, n = 0;
  for (let i = 0; i < a.length; i += 4 * step) {
    const la = a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11;
    const lb = b[i] * 0.3 + b[i + 1] * 0.59 + b[i + 2] * 0.11;
    sum += Math.abs(la - lb); n += 1;
  }
  return n ? sum / n : 0;
}

// 슬롯 한 칸의 상태 바꾸기 — prev: {mode, changing, quiet, events, last}
//  mode: "none"(틀 비었음/가려짐) · "watch"(메신저 창이 덮고 있음, 감시 중)
//  돌려주는 event 가 true 면 "새 변화" 1건 (창이 막 들어온 첫 화면은 기준만 잡고 알리지 않음)
export function stepSlot(prev = {}, { marks = 4, diff = 0, now = 0 } = {}) {
  const s = { mode: "none", changing: false, quiet: 0, events: 0, last: 0, ...prev };
  if (marks >= 2) return { state: { ...s, mode: "none", changing: false, quiet: 0 }, event: false, baseline: false };
  if (s.mode !== "watch") return { state: { ...s, mode: "watch", changing: false, quiet: 0 }, event: false, baseline: true };
  if (diff >= MSN_DIFF_ON) return { state: { ...s, changing: true, quiet: 0 }, event: false, baseline: false };
  if (s.changing) {
    const quiet = s.quiet + 1;
    if (quiet >= MSN_STABLE_TICKS) return { state: { ...s, changing: false, quiet: 0, events: s.events + 1, last: now }, event: true, baseline: false };
    return { state: { ...s, quiet }, event: false, baseline: false };
  }
  return { state: s, event: false, baseline: false };
}

export function readMsnPrefs(storage, key) {
  try {
    const raw = JSON.parse(storage?.getItem(key) || "{}") || {};
    const count = Math.min(MSN_LIMITS.slotsMax, Math.max(MSN_LIMITS.slotsMin, Math.trunc(Number(raw.count) || 3)));
    const height = MSN_LIMITS.heights.includes(Number(raw.height)) ? Number(raw.height) : 560;
    const names = Array.isArray(raw.names) ? raw.names.map((v) => String(v || "").slice(0, 30)) : [];
    const fit = raw.fit && ["ax", "ay", "bx", "by"].every((k) => Number.isFinite(raw.fit[k])) ? raw.fit : null;
    return { count, height, names, fit };
  } catch {
    return { count: 3, height: 560, names: [], fit: null };
  }
}
