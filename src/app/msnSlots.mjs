// 💬 메신저 탭 — 슬롯(빈 틀)에 메신저 창을 끌어다 놓고, 그 영역만 감지 (2026-11-03 1단계: 디자인·기본 셋팅·카톡창 시험)
//  · 슬롯 위쪽 = 메신저 창을 올려놓을 틀 (네 모서리 분홍 표시) / 아래쪽 = 대답 영역(보낼 답변·복사)
//  · [🖥 화면 연결] → 전체 화면 공유 → 슬롯 영역만 1초마다 작게 잘라 비교 → 바뀌면 "🔔 새 변화"
//  · 화면 그림은 이 브라우저 안에서만 씀 (어디에도 보내거나 저장하지 않음). AI 읽기·추천은 다음 단계
import { MSN_LIMITS, cornerMarks, fitFromMarks, frameDiff, markBox, readMsnPrefs, regionOnVideo, screenCss, stepSlot } from "../domain/msnCapture.mjs?v=20261103-msn1";

const PREF_KEY = "system_v3_cs_msn_slots";
const TICK_MS = 1000;
const SMALL_W = 96;                   // 비교용으로 줄인 폭

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function msnSlotHtml(i, { name = "", height = 560 } = {}) {
  return `
  <div class="msn-slot" data-msn-slot="${i}">
    <div class="msn-slot-head">
      <b>슬롯 ${i + 1}</b>
      <input class="msn-name" data-msn-name="${i}" value="${esc(name)}" placeholder="이름 (예: 카톡 · 고객)" maxlength="30">
      <span class="msn-badge" data-msn-badge="${i}" hidden>🔔 0</span>
      <span class="msn-state is-none" data-msn-state="${i}">창 없음</span>
    </div>
    <div class="msn-frame" data-msn-frame="${i}" style="height:${height}px">
      <i class="msn-mark tl"></i><i class="msn-mark tr"></i><i class="msn-mark bl"></i><i class="msn-mark br"></i>
      <div class="msn-frame-guide">
        <b>여기에 메신저 창을 끌어다 놓으세요</b>
        <span>카톡 대화창을 이 테두리 안에 맞춰 놓으면<br>이 칸만 보고 새 메시지를 알려 줍니다</span>
        <small>네 모서리 분홍 점이 가려지게 덮어 주세요</small>
      </div>
    </div>
    <div class="msn-answer">
      <div class="msn-answer-top">
        <span class="msn-last" data-msn-last="${i}">마지막 변화 —</span>
        <span class="cs-flex"></span>
        <button type="button" class="cs-btn cs-btn-mini" data-msn-act="peek" data-i="${i}" title="이 슬롯이 보고 있는 화면 (이 브라우저 안에서만)">👁 보기</button>
        <button type="button" class="cs-btn cs-btn-mini is-pending" disabled title="다음 단계 — 메신저 화면을 AI 가 읽고 답변 추천">🤖 추천</button>
      </div>
      <img class="msn-peek" data-msn-peek="${i}" alt="슬롯 ${i + 1} 이 보고 있는 화면" hidden>
      <textarea data-msn-text="${i}" placeholder="보낼 답변 — 쓰고 [📋 복사] → 메신저 창에 붙여넣기(Ctrl+V)"></textarea>
      <div class="cs-row">
        <button type="button" class="cs-btn cs-btn-mini" data-msn-act="clear" data-i="${i}">지우기</button>
        <span class="cs-flex"></span>
        <button type="button" class="cs-btn cs-btn-green" data-msn-act="copy" data-i="${i}">📋 복사</button>
      </div>
    </div>
  </div>`;
}

export function mountMsnSlots({ document, window, storage, navigator = window?.navigator, now = () => Date.now() } = {}) {
  const root = document.querySelector("[data-msn-panel]");
  if (!root) return null;
  const $ = (sel) => root.querySelector(sel);
  const prefs = readMsnPrefs(storage, PREF_KEY);
  const st = { stream: null, video: null, timer: 0, slots: [], prev: [], snaps: [], fit: prefs.fit };
  const can = !!navigator?.mediaDevices?.getDisplayMedia;

  function save() {
    try { storage?.setItem(PREF_KEY, JSON.stringify({ count: prefs.count, height: prefs.height, names: prefs.names, fit: st.fit })); } catch { /* 이번 화면에서만 */ }
  }
  function say(text, tone = "") {
    const el = $("[data-msn-msg]");
    if (el) { el.textContent = text; el.className = `msn-msg ${tone}`; }
  }
  function render() {
    const box = $("[data-msn-slots]");
    box.innerHTML = Array.from({ length: prefs.count }, (_, i) => msnSlotHtml(i, { name: prefs.names[i] || "", height: prefs.height })).join("");
    st.slots = Array.from({ length: prefs.count }, () => ({}));
    st.prev = []; st.snaps = [];
    $("[data-msn-count]").value = String(prefs.count);
    $("[data-msn-height]").value = String(prefs.height);
  }
  function setConn(on) {
    const el = $("[data-msn-conn]");
    el.textContent = on ? "● 화면 연결됨 — 감시 중" : "○ 화면 연결 안 됨";
    el.className = `msn-conn ${on ? "is-on" : ""}`;
    $("[data-msn-act=connect]").textContent = on ? "■ 연결 끊기" : "🖥 화면 연결";
    $("[data-msn-act=fit]").disabled = !on;
  }
  const videoSize = () => ({ width: st.video?.videoWidth || 0, height: st.video?.videoHeight || 0 });
  const frameRect = (i) => root.querySelector(`[data-msn-frame="${i}"]`)?.getBoundingClientRect();

  function grab(region, w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(st.video, region.x, region.y, region.w, region.h, 0, 0, w, h);
    return { c, data: g.getImageData(0, 0, w, h).data };
  }

  function tick() {
    if (!st.video || !videoSize().width) return;
    for (let i = 0; i < prefs.count; i += 1) {
      const rect = frameRect(i);
      if (!rect) continue;
      const region = regionOnVideo(rect, window, window.screen, videoSize(), st.fit);
      const stateEl = root.querySelector(`[data-msn-state="${i}"]`);
      if (!region) { stateEl.textContent = "화면 밖"; stateEl.className = "msn-state is-none"; continue; }
      const h = Math.max(8, Math.round(SMALL_W * region.h / region.w));
      const { data } = grab(region, SMALL_W, h);
      const marks = cornerMarks(data, SMALL_W, h, 3);
      const diff = st.prev[i] ? frameDiff(st.prev[i], data) : 0;
      const r = stepSlot(st.slots[i], { marks, diff, now: now() });
      st.slots[i] = r.state;
      st.prev[i] = data;
      stateEl.textContent = r.state.mode === "none" ? (marks >= 4 ? "창 없음" : "가려짐·맞춤 필요") : r.state.changing ? "바뀌는 중…" : "감시 중";
      stateEl.className = `msn-state ${r.state.mode === "none" ? "is-none" : r.state.changing ? "is-busy" : "is-on"}`;
      if (r.event || r.baseline) st.snaps[i] = region;
      if (r.event) {
        const badge = root.querySelector(`[data-msn-badge="${i}"]`);
        badge.hidden = false; badge.textContent = `🔔 ${r.state.events}`;
        root.querySelector(`[data-msn-slot="${i}"]`).classList.add("is-new");
        root.querySelector(`[data-msn-last="${i}"]`).textContent = `마지막 변화 ${new Date(r.state.last).toLocaleTimeString("ko-KR", { hour12: false })}`;
        const peek = root.querySelector(`[data-msn-peek="${i}"]`);
        if (!peek.hidden) peek.src = shot(region);
      }
    }
  }

  function shot(region) {
    const w = Math.min(region.w, 480), h = Math.round(w * region.h / region.w);
    return grab(region, w, h).c.toDataURL("image/jpeg", 0.8);
  }

  async function connect() {
    if (st.stream) return disconnect();
    if (!can) { say("이 브라우저는 화면 연결을 지원하지 않습니다 — PC 크롬에서 열어 주세요.", "is-bad"); return; }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "monitor", frameRate: 2 }, audio: false, selfBrowserSurface: "include", monitorTypeSurfaces: "include", surfaceSwitching: "exclude" });
      const track = stream.getVideoTracks()[0];
      const surface = track?.getSettings?.().displaySurface;
      if (surface && surface !== "monitor") {
        stream.getTracks().forEach((t) => t.stop());
        say("'전체 화면'을 골라 주세요 — 창·탭 하나만 공유하면 슬롯 영역을 볼 수 없습니다.", "is-bad");
        return;
      }
      const video = document.createElement("video");
      video.muted = true; video.playsInline = true; video.srcObject = stream;
      await video.play();
      st.stream = stream; st.video = video;
      track?.addEventListener?.("ended", disconnect);
      st.timer = window.setInterval(tick, TICK_MS);
      setConn(true);
      say(st.fit ? "연결됨 — 메신저 창을 슬롯 틀에 올려 주세요." : "연결됨 — 먼저 슬롯 위에 다른 창이 없는 상태에서 [🎯 영역 맞춤]을 눌러 주세요.", "is-ok");
    } catch (error) {
      say(error?.name === "NotAllowedError" ? "화면 공유를 취소했습니다." : `화면 연결 실패: ${error?.message || error}`, "is-bad");
    }
  }

  function disconnect() {
    window.clearInterval(st.timer);
    st.stream?.getTracks().forEach((t) => t.stop());
    st.stream = null; st.video = null; st.slots = st.slots.map(() => ({})); st.prev = [];
    root.querySelectorAll("[data-msn-state]").forEach((el) => { el.textContent = "창 없음"; el.className = "msn-state is-none"; });
    setConn(false);
    say("화면 연결을 끊었습니다.");
  }

  // 🎯 영역 맞춤: 슬롯 1 의 분홍 표시만 남기고 전체 화면에서 찾아 → 화면 좌표 ↔ 공유 영상 맞춤
  async function fit() {
    if (!st.video) return;
    root.classList.add("msn-fitting");
    await new Promise((r) => window.setTimeout(r, 400));
    try {
      const { width, height } = videoSize();
      const step = width > 2400 ? 3 : 2;
      const { data } = grab({ x: 0, y: 0, w: width, h: height }, width, height);
      const box = markBox(data, width, height, step);
      const r0 = frameRect(0), bw = 2;               // 분홍 점은 점선 테두리(2px) 안쪽 모서리에 있음
      const css = screenCss({ left: r0.left + bw, top: r0.top + bw, width: r0.width - 2 * bw, height: r0.height - 2 * bw }, window, window.screen);
      const f = fitFromMarks(css, box);
      if (!f) { say("슬롯 1 의 분홍 점을 화면에서 찾지 못했습니다 — 슬롯 1 위를 덮은 창을 치우고 다시 눌러 주세요.", "is-bad"); return; }
      st.fit = f; save();
      st.slots = st.slots.map(() => ({})); st.prev = [];
      say("영역 맞춤 완료 — 이제 카톡 대화창을 슬롯 틀에 끌어다 놓아 보세요. (브라우저 창을 옮기거나 확대 비율을 바꾸면 다시 맞춤)", "is-ok");
    } finally {
      root.classList.remove("msn-fitting");
    }
  }

  async function copy(i) {
    const ta = root.querySelector(`[data-msn-text="${i}"]`);
    const text = ta?.value || "";
    if (!text.trim()) { say(`슬롯 ${i + 1}: 복사할 답변이 없습니다.`, "is-bad"); return; }
    try { await navigator.clipboard.writeText(text); } catch { ta.select(); document.execCommand?.("copy"); }
    say(`슬롯 ${i + 1}: 답변을 복사했습니다 — 메신저 창에서 Ctrl+V`, "is-ok");
  }

  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-msn-act]");
    const slot = e.target.closest("[data-msn-slot]");
    if (slot && !b) {                         // 슬롯을 누르면 새 변화 표시 지움
      const i = Number(slot.dataset.msnSlot);
      slot.classList.remove("is-new");
      const badge = root.querySelector(`[data-msn-badge="${i}"]`); if (badge) badge.hidden = true;
      if (st.slots[i]) st.slots[i].events = 0;
    }
    if (!b) return;
    const act = b.dataset.msnAct, i = Number(b.dataset.i);
    if (act === "connect") connect();
    else if (act === "fit") fit();
    else if (act === "copy") copy(i);
    else if (act === "clear") { const ta = root.querySelector(`[data-msn-text="${i}"]`); if (ta) ta.value = ""; }
    else if (act === "peek") {
      const peek = root.querySelector(`[data-msn-peek="${i}"]`);
      peek.hidden = !peek.hidden;
      if (!peek.hidden) {
        const rect = frameRect(i);
        const region = st.video && rect ? regionOnVideo(rect, window, window.screen, videoSize(), st.fit) : null;
        if (region) peek.src = shot(region); else { peek.hidden = true; say("먼저 [🖥 화면 연결]을 해 주세요.", "is-bad"); }
      }
    }
  });
  root.addEventListener("change", (e) => {
    if (e.target.matches("[data-msn-count]")) { prefs.count = Number(e.target.value) || 3; save(); render(); }
    else if (e.target.matches("[data-msn-height]")) { prefs.height = Number(e.target.value) || 560; save(); render(); }
  });
  root.addEventListener("input", (e) => {
    if (e.target.matches("[data-msn-name]")) { prefs.names[Number(e.target.dataset.msnName)] = e.target.value; save(); }
  });

  render();
  setConn(false);
  if (!can) say("이 기기는 화면 연결을 지원하지 않습니다 — 메신저 감지는 PC 크롬에서.", "is-bad");
  return { connect, disconnect, fit, tick, state: st, prefs, limits: MSN_LIMITS };
}

if (typeof document !== "undefined" && document.querySelector("[data-msn-panel]")) {
  mountMsnSlots({ document, window, storage: (() => { try { return window.localStorage; } catch { return null; } })() });
}
