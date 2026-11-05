// 💬 메신저 탭 — 슬롯(빈 틀)에 메신저 창을 끌어다 놓고, 그 영역만 감지 (2026-11-03 1단계: 디자인·기본 셋팅·카톡창 시험)
//  · 슬롯 위쪽 = 메신저 창을 올려놓을 틀 (네 모서리 분홍 표시) / 아래쪽 = 대답 영역(보낼 답변·복사)
//  · [🖥 화면 연결] → 전체 화면 공유 → 슬롯 영역만 1초마다 작게 잘라 비교 → 바뀌면 "🔔 새 변화"
//  · 화면 그림은 이 브라우저 안에서만 씀 (어디에도 보내거나 저장하지 않음). AI 읽기·추천은 다음 단계
import { MSN_LIMITS, cornerMarks, fitFromMarks, frameDiff, markBox, readMsnPrefs, regionOnVideo, screenCss, stepSlot } from "../domain/msnCapture.mjs?v=20261103-msn1";

const PREF_KEY = "system_v3_cs_msn_slots";
// 2026-11-05: 수집기 PC 웹연결 1.10 의 "메신저 창 도우미" (이 PC 안 127.0.0.1) — 카톡 창을 슬롯에 붙이기·항상 위·일괄 정렬
export const MSN_HELPER_URL = "http://127.0.0.1:47811/msn";
const HELPER_SYNC_MS = 1500;
const HELPER_PING_EVERY = 6;          // 동기화 6번(약 9초)마다 연결 확인
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
  const st = { stream: null, video: null, timer: 0, slots: [], prev: [], snaps: [], fit: prefs.fit, helper: { on: false, ver: "", sent: "", n: 0, busy: false } };
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

  // ---------- 🪄 창 도우미 (수집기 PC 웹연결 1.10) ----------
  // 슬롯 틀의 화면 위치(물리 픽셀): 영역 맞춤을 했으면 그 값(정확), 아니면 브라우저 창 위치 × 화면 배율로 어림
  function slotScreenRects() {
    const out = [];
    for (let i = 0; i < prefs.count; i += 1) {
      const rect = frameRect(i);
      if (!rect || rect.width < 60 || rect.height < 60) return [];
      const v = videoSize();
      const r = st.fit && v.width ? regionOnVideo(rect, window, window.screen, v, st.fit) : null;
      if (r) { out.push({ x: r.x, y: r.y, w: r.w, h: r.h }); continue; }
      const c = screenCss(rect, window, window.screen);
      const dpr = window.devicePixelRatio || 1;
      const sl = Number.isFinite(window.screen?.left) ? window.screen.left : (window.screen?.availLeft || 0);
      const stp = Number.isFinite(window.screen?.top) ? window.screen.top : (window.screen?.availTop || 0);
      out.push({ x: Math.round((sl + c.x) * dpr), y: Math.round((stp + c.y) * dpr), w: Math.round(c.w * dpr), h: Math.round(c.h * dpr) });
    }
    return out;
  }
  async function helperCall(path, body) {
    const opt = body === undefined ? { method: "GET" } : { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) };
    if (window.AbortSignal?.timeout) opt.signal = window.AbortSignal.timeout(2500);
    const res = await window.fetch(`${MSN_HELPER_URL}${path}`, opt);
    const js = await res.json().catch(() => ({}));
    if (!res.ok || js.ok === false) throw new Error(js.error || `HTTP ${res.status}`);
    return js;
  }
  // 크롬 '로컬 네트워크 액세스' 허가 상태 (이 화면 → 이 PC 안 프로그램 접속) — granted / prompt / denied / ""(모름)
  async function lnaState() {
    for (const name of ["local-network-access", "loopback-network", "local-network"]) {
      try { const r = await navigator?.permissions?.query({ name }); if (r?.state) return r.state; } catch { /* 이 이름은 없음 */ }
    }
    return "";
  }
  function setHelper(on, js = {}) {
    st.helper.on = on;
    if (!on) st.helper.sent = "";
    const el = $("[data-msn-helper]");
    if (el) {
      el.textContent = on ? `🪄 창 도우미 ● 연결됨${Number.isFinite(js.managed) ? ` · 붙은 창 ${js.managed}` : ""}` : "🪄 창 도우미 ○ 없음 — 눌러서 연결";
      el.className = `msn-helper ${on ? "is-on" : "is-off"}`;
      if (!on) lnaState().then((perm) => {
        if (st.helper.on || !el) return;
        const note = $("[data-msn-cta-note]");
        if (perm === "denied" && note) note.innerHTML = "예전에 [차단]을 눌러 막혀 있습니다 — <b>앱</b>: 오른쪽 위 <b>⋮</b> → <b>앱 정보</b> → <b>'로컬 네트워크 액세스'</b> 허용 / <b>크롬 탭</b>: 주소창 맨 왼쪽 아이콘 → <b>'로컬 네트워크 액세스'</b> 켜기 → 그다음 새로고침(F5).";
        if (perm === "denied") el.textContent = "🪄 창 도우미 ⛔ 막힘 — 앱 ⋮ → 앱 정보 → 로컬 네트워크 액세스 허용";
        else if (perm === "prompt") el.textContent = "🪄 창 도우미 ○ 눌러서 연결 (크롬이 물으면 [허용])";
        st.helper.perm = perm;
      });
      el.title = on ? `수집기 PC 웹연결 ${js.ver || ""} — 카톡·네이트온 대화창을 슬롯 가까이 끌어다 놓으면 딱 맞춰 붙고 항상 위에 있습니다` : "수집기 PC 웹연결 1.10 이상이 이 PC에서 켜져 있어야 합니다 (CS 관리 ⚙ 설정 → ⬆ 웹연결 업데이트). 크롬이 '로컬 네트워크 접근'을 물으면 [허용]";
    }
    root.querySelectorAll("[data-msn-act=arrange], [data-msn-act=release]").forEach((b) => { b.disabled = !on; });
    const cta = $("[data-msn-cta]");
    if (cta) cta.hidden = on;
  }
  const panelShown = () => document.visibilityState !== "hidden" && !!root.getClientRects?.().length && root.offsetWidth > 0;
  async function pingHelper() {
    try { setHelper(true, await helperCall("/ping")); } catch { setHelper(false); }
  }
  async function syncSlots(force = false) {
    if (!st.helper.on || !panelShown()) return;
    const rects = slotScreenRects();
    if (!rects.length) return;
    const key = JSON.stringify(rects);
    if (!force && key === st.helper.sent) return;
    try { await helperCall("/slots", { slots: rects }); st.helper.sent = key; } catch { setHelper(false); }
  }
  async function helperTick() {
    if (st.helper.busy || !panelShown()) return;
    st.helper.busy = true;
    try {
      st.helper.n += 1;
      if (!st.helper.on || st.helper.n % HELPER_PING_EVERY === 0) await pingHelper();
      await syncSlots();
    } finally { st.helper.busy = false; }
  }
  // 🪄 표시를 누르면: 사람이 누른 순간에 접속 → 크롬이 '로컬 네트워크 액세스'를 물음 → [허용]
  async function connectHelper() {
    say("창 도우미에 연결하는 중… 크롬이 '로컬 네트워크의 기기에 액세스'를 물으면 [허용]을 눌러 주세요.");
    await pingHelper();
    if (st.helper.on) { say("창 도우미 연결됨 — 대화창을 슬롯 가까이 끌어다 놓거나 [📐 일괄 정렬]을 누르세요.", "is-ok"); syncSlots(true); return; }
    const perm = await lnaState();
    say(perm === "denied"
      ? "이 화면의 PC 접속이 막혀 있습니다 — 앱: 오른쪽 위 ⋮ → 앱 정보 → '로컬 네트워크 액세스' 허용 (크롬 탭: 주소창 왼쪽 아이콘 → '로컬 네트워크 액세스' 켜기) → 새로고침(F5)."
      : "창 도우미에 연결하지 못했습니다 — ① 수집기 PC 웹연결 1.10 이상이 켜져 있는지 ② 이 화면을 수집기 PC(카톡이 있는 PC)에서 열었는지 확인해 주세요.", "is-bad");
  }

  async function arrange() {
    if (!st.helper.on) await pingHelper();
    if (!st.helper.on) { say("창 도우미가 연결되지 않았습니다 — 수집기 PC 웹연결 1.10 이상이 이 PC에서 켜져 있어야 합니다 (⚙ 설정 → ⬆ 웹연결 업데이트).", "is-bad"); return; }
    try {
      await syncSlots(true);
      const r = await helperCall("/arrange", {});
      say(r.placed ? `열린 대화창 ${r.placed}개를 슬롯에 같은 크기로 맞췄습니다 (항상 위).` : "열린 카톡·네이트온 대화창이 없습니다 — 대화창을 먼저 열어 주세요.", r.placed ? "is-ok" : "is-bad");
      pingHelper();
    } catch (error) { say(`일괄 정렬 실패: ${error?.message || error}`, "is-bad"); }
  }
  async function release() {
    try {
      const r = await helperCall("/release", {});
      say(`대화창 ${r.released || 0}개의 '항상 위'를 풀었습니다 (자리는 그대로).`, "is-ok");
      pingHelper();
    } catch (error) { say(`놓아주기 실패: ${error?.message || error}`, "is-bad"); }
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
    else if (act === "fit") fit().then(() => syncSlots(true));
    else if (act === "arrange") arrange();
    else if (act === "helper") connectHelper();
    else if (act === "release") release();
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
    if (e.target.matches("[data-msn-count]")) { prefs.count = Number(e.target.value) || 3; save(); render(); syncSlots(true); }
    else if (e.target.matches("[data-msn-height]")) { prefs.height = Number(e.target.value) || 560; save(); render(); syncSlots(true); }
  });
  root.addEventListener("input", (e) => {
    if (e.target.matches("[data-msn-name]")) { prefs.names[Number(e.target.dataset.msnName)] = e.target.value; save(); }
  });

  render();
  setConn(false);
  setHelper(false);
  if (!can) say("이 기기는 화면 연결을 지원하지 않습니다 — 메신저 감지는 PC 크롬에서.", "is-bad");
  window.setInterval?.(helperTick, HELPER_SYNC_MS);
  window.addEventListener?.("resize", () => syncSlots(true));
  return { connect, disconnect, fit, tick, state: st, prefs, limits: MSN_LIMITS, arrange, release, syncSlots, pingHelper, slotScreenRects };
}

if (typeof document !== "undefined" && document.querySelector("[data-msn-panel]")) {
  mountMsnSlots({ document, window, storage: (() => { try { return window.localStorage; } catch { return null; } })() });
}
