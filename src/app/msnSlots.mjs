// 💬 메신저 탭 — 슬롯(빈 틀)에 메신저 창을 끌어다 놓고, 그 영역만 감지 (2026-11-03 1단계: 디자인·기본 셋팅·카톡창 시험)
//  · 슬롯 위쪽 = 메신저 창을 올려놓을 틀 (네 모서리 분홍 표시) / 아래쪽 = 대답 영역(보낼 답변·복사)
//  · [🖥 화면 연결] → 전체 화면 공유 → 슬롯 영역만 1초마다 작게 잘라 비교 → 바뀌면 "🔔 새 변화"
//  · 화면 그림은 이 브라우저 안에서만 씀 (어디에도 보내거나 저장하지 않음). AI 읽기·추천은 다음 단계
import { MSN_LIMITS, cornerMarks, fitFromMarks, frameDiff, markBox, readMsnPrefs, regionOnVideo, screenCss, stepSlot } from "../domain/msnCapture.mjs?v=20261105-vendor1";
import { CS_BOARD_ENDPOINT, CS_BOARD_STORAGE_KEY } from "../domain/csBoard.mjs?v=20261105-point1";

const PREF_KEY = "system_v3_cs_msn_slots";
const VENDOR_PREF_KEY = "system_v3_cs_msn_vendor";     // 📦 거래처 메신저 (11-05): 메모 = 업체명·카톡방 이름
export const MSN_PANELS = {};
// 2026-11-05: 수집기 PC 웹연결 1.10 의 "메신저 창 도우미" (이 PC 안 127.0.0.1) — 카톡 창을 슬롯에 붙이기·항상 위·일괄 정렬
export const MSN_HELPER_URL = "http://127.0.0.1:47811/msn";
// 11-09: 이 버전보다 낮은 창 도우미는 화면이 알아서 새 버전으로 바꿈 (1.25 부터 스스로 업데이트 /msn/update)
export const MSN_HELPER_MIN = "1.28";   // 11-13: 1.28 = 카톡 대화창만 붙임 (사진 보기 창 자유 · 네이트온 뺌)
export const MSN_HELPER_INSTALLER = "../tools/msn_helper.bat";
const verNums = (v) => (String(v || "").split(" ")[0].match(/\d+/g) || []).slice(0, 3).map(Number);
export function helperOutdated(ver, min = MSN_HELPER_MIN) {
  const a = verNums(ver), b = verNums(min);
  if (!a.length) return false;
  for (let i = 0; i < 3; i++) { const x = a[i] || 0, y = b[i] || 0; if (x !== y) return x < y; }
  return false;
}
const HELPER_SYNC_MS = 1500;
const HELPER_PING_EVERY = 6;          // 동기화 6번(약 9초)마다 연결 확인
const TICK_MS = 1000;
const SMALL_W = 96;                   // 비교용으로 줄인 폭

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function msnSlotHtml(i, { name = "", height = MSN_LIMITS.heights[1], star = false, memo = "메모 (예: 카톡 · 고객)" } = {}) {
  return `
  <div class="msn-slot${star ? " is-star" : ""}" data-msn-slot="${i}">
    <div class="msn-slot-head">
      <b class="msn-no" data-msn-no="${i}">${i + 1}</b>
      <input class="msn-name" data-msn-name="${i}" value="${esc(name)}" placeholder="${esc(memo)}" maxlength="30">
      <span class="msn-badge" data-msn-badge="${i}" hidden>🔔 0</span>
      <span class="msn-state is-none" data-msn-state="${i}">창 없음</span>
      <button type="button" class="msn-star${star ? " is-on" : ""}" data-msn-act="star" data-i="${i}" aria-pressed="${star}" title="주목 표시 켜기/끄기 (주목이 필요한 대화창 구분용)">${star ? "★" : "☆"}</button>
    </div>
    <div class="msn-frame" data-msn-frame="${i}" style="height:${height}px">
      <i class="msn-mark tl"></i><i class="msn-mark tr"></i><i class="msn-mark bl"></i><i class="msn-mark br"></i>
      <div class="msn-frame-guide">
        <b>여기에 메신저 창을 끌어다 놓으세요</b>
      </div>
    </div>
    <div class="msn-answer">
      <div class="msn-answer-top">
        <span class="cs-flex"></span>
        <button type="button" class="cs-btn cs-btn-mini msn-ai-btn" data-msn-act="suggest" data-i="${i}" title="붙은 대화창을 AI 가 읽고 답장 후보를 만듭니다 (그림은 저장 안 함)">💻 AI추천</button>
      </div>
      <div class="msn-sugg" data-msn-sugg="${i}" hidden></div>
      <textarea data-msn-text="${i}" placeholder="Tab(+←→ 또는 숫자)"></textarea>
      <div class="cs-row">
        <button type="button" class="cs-btn cs-btn-mini" data-msn-act="clear" data-i="${i}">지우기</button>
        <span class="cs-flex"></span>
        <button type="button" class="cs-btn cs-btn-green" data-msn-act="send" data-i="${i}" title="붙은 대화창에 붙여넣기 + Enter (커서는 이 칸에 그대로) — 창 도우미가 없으면 복사만">↵ 보내기</button>
      </div>
    </div>
  </div>`;
}

export function mountMsnSlots({ document, window, storage, navigator = window?.navigator, now = () => Date.now(), root = document.querySelector("[data-msn-panel]"), group = root?.dataset?.msnPanel === "vendor" ? "vendor" : "reply" } = {}) {
  if (!root) return null;
  const vendor = group === "vendor";
  const prefKey = vendor ? VENDOR_PREF_KEY : PREF_KEY;
  const slotsMax = vendor ? MSN_LIMITS.vendorSlotsMax : MSN_LIMITS.slotsMax;
  const memo = vendor ? "업체명·카톡방 이름 (예: 세븐피어싱)" : "메모 (예: 카톡 · 고객)";
  const $ = (sel) => root.querySelector(sel);
  const prefs = readMsnPrefs(storage, prefKey, slotsMax);
  if (vendor) prefs.names = [];   // 11-06: 거래처 슬롯 메모(업체명)는 기억하지 않음 — 매일 주문서로 새로
  // 거래처: 슬롯 수는 5 · 10 · 20 · 30 중에서
  const countOptions = vendor ? [5, 10, 20, 30] : Array.from({ length: slotsMax }, (_, k) => k + 1);
  const fitCount = (n) => (vendor ? countOptions.find((c) => c >= (Number(n) || 10)) || 30 : Number(n) || 3);
  prefs.count = fitCount(prefs.count);
  const st = { stream: null, video: null, timer: 0, slots: [], prev: [], snaps: [], fit: prefs.fit, helper: { on: false, ver: "", sent: "", n: 0, busy: false }, notes: {} };
  const can = !!navigator?.mediaDevices?.getDisplayMedia;

  function save() {
    try { storage?.setItem(prefKey, JSON.stringify({ count: prefs.count, height: prefs.height, width: prefs.width, names: vendor ? [] : prefs.names, stars: vendor ? [] : prefs.stars, fit: st.fit })); } catch { /* 이번 화면에서만 */ }
  }
  function say(text, tone = "") {
    const el = $("[data-msn-msg]");
    if (el) { el.textContent = text; el.className = `msn-msg ${tone}`; }
  }
  // 1.20 거래처: 일괄 붙이기 결과를 업체(슬롯)별 안내로 — 대화방 이름을 업체명으로 바꾸도록
  function noteText(name, n) {
    const q = `'${name}'`;
    if (n.state === "missing") return `카톡에서 ${q} 대화방을 못 찾았습니다\n→ 이 업체 카톡방 이름을 ${q}(으)로 바꿔 주세요\n(대화방 ≡ 메뉴 → 채팅방 설정 → 채팅방 이름)`;
    if (n.state === "dup") return `${q}이(가) 들어간 대화방이 ${n.titles?.length || 2}개입니다 (${(n.titles || []).join(" · ")})\n→ 이 업체 방만 이름에 ${q}이 들어가게 바꿔 주세요`;
    if (n.state === "similar") return `열린 방: '${n.title}'\n→ 이 업체가 맞으면 그대로, 아니면 카톡방 이름을 ${q}(으)로 바꿔 주세요`;
    if (n.state === "nokakao") return "카카오톡 PC 프로그램(친구 목록 창)이 꺼져 있어 검색하지 못했습니다\n→ 카톡을 켜 두고 다시 [📐 일괄 붙이기]";
    return "";
  }
  function applyNotes() {
    root.querySelectorAll(".msn-note").forEach((el) => el.remove());
    for (const [k, n] of Object.entries(st.notes || {})) {
      const i = Number(k), text = noteText(prefs.names[i] || "", n || {});
      const frame = text && root.querySelector(`[data-msn-frame="${i}"]`);
      if (!frame) continue;
      const el = document.createElement("div");
      el.className = `msn-note is-${n.state}`;
      el.dataset.msnNote = String(i);
      el.textContent = `⚠ ${text}`;
      frame.appendChild(el);
    }
  }
  function render() {
    const box = $("[data-msn-slots]");
    box.innerHTML = Array.from({ length: prefs.count }, (_, i) => msnSlotHtml(i, { name: prefs.names[i] || "", height: prefs.height, star: prefs.stars[i] === true, memo })).join("");
    applyNotes();
    const csel = $("[data-msn-count]");
    if (csel && csel.options.length !== countOptions.length) csel.innerHTML = countOptions.map((n) => `<option value="${n}">${n}</option>`).join("");
    box.style.setProperty("--msn-w", `${prefs.width}px`);
    box.style.setProperty("--msn-cols", String(Math.min(prefs.count, MSN_LIMITS.perRow)));
    st.slots = Array.from({ length: prefs.count }, () => ({}));
    st.prev = []; st.snaps = [];
    $("[data-msn-count]").value = String(prefs.count);
    $("[data-msn-height]").value = String(prefs.height);
    const wsel = $("[data-msn-width]");
    if (wsel) wsel.value = String(prefs.width);
  }
  function setConn(on) {
    const el = $("[data-msn-conn]");
    el.textContent = on ? "● 화면 연결됨 — 감시 중" : "○ 화면 연결 안 됨";
    el.className = `msn-conn ${on ? "is-on" : ""}`;
    $("[data-msn-act=connect]").textContent = on ? "■ 연결 끊기" : "🖥 화면 연결";
    const fitBtn = $("[data-msn-act=fit]"); if (fitBtn) fitBtn.disabled = !on;   // 거래처 탭엔 영역 맞춤 버튼 없음 (11-06)
    root.classList.toggle("msn-live", on);       // 화면 연결 중에만 슬롯 상태(창 없음·감시 중) 표시 — 그 자리엔 평소 ★ 주목 버튼
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
        badge.title = `마지막 새 메시지 ${new Date(r.state.last).toLocaleTimeString("ko-KR", { hour12: false })}`;
      }
    }
  }

  function shot(region) {
    const w = Math.min(region.w, 480), h = Math.round(w * region.h / region.w);
    return grab(region, w, h).c.toDataURL("image/jpeg", 0.8);
  }

  async function connect({ launched = false } = {}) {
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
      if (vendor) { await fit({ quiet: true }); return; }   // 11-06: 거래처는 [🎯 영역 맞춤] 버튼 없이 연결할 때 자동으로
      say(st.fit ? "연결됨 — 메신저 창을 슬롯 틀에 올려 주세요." : "연결됨 — 먼저 슬롯 위에 다른 창이 없는 상태에서 [🎯 영역 맞춤]을 눌러 주세요.", "is-ok");
    } catch (error) {
      say(launched ? "창 도우미를 켜는 중입니다 — 화면 공유 창이 안 떴으면 [🖥 화면 연결]을 한 번 더 눌러 주세요." : error?.name === "NotAllowedError" ? "화면 공유를 취소했습니다." : `화면 연결 실패: ${error?.message || error}`, launched ? "" : "is-bad");
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
  async function fit({ quiet = false } = {}) {
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
      if (!f) { say(quiet ? (st.fit ? "" : "화면 연결됨 — 슬롯 1 위를 덮은 창이 있어 영역을 못 맞췄습니다 (치우고 [🖥 화면 연결]을 다시)") : "슬롯 1 의 분홍 점을 화면에서 찾지 못했습니다 — 슬롯 1 위를 덮은 창을 치우고 다시 눌러 주세요.", st.fit ? "" : "is-bad"); return; }
      st.fit = f; save();
      st.slots = st.slots.map(() => ({})); st.prev = [];
      say(quiet ? "" : "영역 맞춤 완료 — 이제 카톡 대화창을 슬롯 틀에 끌어다 놓아 보세요. (브라우저 창을 옮기거나 확대 비율을 바꾸면 다시 맞춤)", "is-ok");
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
      const c = screenCss(rect, window, window.screen);
      const dpr = window.devicePixelRatio || 1;
      const sl = Number.isFinite(window.screen?.left) ? window.screen.left : (window.screen?.availLeft || 0);
      const stp = Number.isFinite(window.screen?.top) ? window.screen.top : (window.screen?.availTop || 0);
      const est = { x: Math.round((sl + c.x) * dpr), y: Math.round((stp + c.y) * dpr), w: Math.round(c.w * dpr), h: Math.round(c.h * dpr) };
      // 화면 연결로 맞춘 자리(영역 맞춤)가 있으면 그것을 씀 — 단 화면 그림 크기 ≠ 실제 화면 픽셀(4K·배율)일 수 있어 실제 픽셀로 환산 (11-06)
      const v = videoSize();
      const r = st.fit && v.width ? regionOnVideo(rect, window, window.screen, v, st.fit) : null;
      if (r) {
        const k = ((window.screen?.width || v.width) * dpr) / v.width;
        const fx = { x: Math.round(sl * dpr + r.x * k), y: Math.round(stp * dpr + r.y * k), w: Math.round(r.w * k), h: Math.round(r.h * k) };
        // 맞춘 자리가 예전 것(확대 비율 바뀜 등)이면 크기가 크게 어긋남 → 계산한 자리로 (크기는 확대 비율과 상관없이 계산이 정확)
        const off = Math.abs(fx.w - est.w) > est.w * 0.25 || Math.abs(fx.h - est.h) > est.h * 0.25;
        out.push(off ? est : fx);
        continue;
      }
      out.push(est);
    }
    return out;
  }
  async function helperCall(path, body, ms = 2500) {
    const opt = body === undefined ? { method: "GET" } : { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) };
    if (window.AbortSignal?.timeout) opt.signal = window.AbortSignal.timeout(ms);
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
    const was = st.helper.on;
    st.helper.on = on;
    if (!on) st.helper.sent = "";
    if (on && Array.isArray(js.used)) autoStarOff(js.used);
    if (on) st.helper.ver = js.ver || st.helper.ver || "";
    if (on && helperOutdated(js.ver) && !st.helper.upTried) { st.helper.upTried = true; autoUpdate(js.ver); }
    if (on && !was && st.helper.waiting) { st.helper.waiting = false; say(`창 도우미 연결됨 ✓ ${String(js.ver || "").split(" ")[0]} — 이제 [📐 일괄 붙이기]·대화창 붙이기를 쓸 수 있습니다`, "is-ok"); syncSlots(true); }
    const el = $("[data-msn-helper]");
    if (el) {
      el.textContent = on ? "🪄 창 도우미 ● 연결됨" : "🪄 창 도우미 ○ 꺼짐 — [🖥 화면 연결]";
      el.className = `msn-helper ${on ? "is-on" : "is-off"}`;
      if (!on) lnaState().then((perm) => {
        if (st.helper.on || !el) return;
        if (perm === "denied") el.textContent = "🪄 창 도우미 ⛔ 막힘 — 앱 ⋮ → 앱 정보 → 로컬 네트워크 액세스 허용";
        else if (perm === "prompt") el.textContent = "🪄 창 도우미 ○ 눌러서 연결 (크롬이 물으면 [허용])";
        st.helper.perm = perm;
      });
      el.title = on ? `창 도우미 ${js.ver || ""} — 누르면 찾은 대화창 목록(진단) · 카톡 대화창을 슬롯 가까이 끌어다 놓으면 딱 맞춰 붙고 항상 위에 있습니다` : "이 PC에 창 도우미가 켜져 있어야 합니다 (처음이면 💬 메신저 탭 → 💻 이 PC 에서 메신저 쓰기). 크롬이 '로컬 네트워크 접근'을 물으면 [허용]";
    }
    root.querySelectorAll("[data-msn-act=arrange], [data-msn-act=release]").forEach((b) => { b.disabled = !on; });
    const cta = $("[data-msn-cta]");
    if (cta) cta.hidden = on;
    if (!on || st.helper.waiting) renderSteps();
  }
  const panelShown = () => document.visibilityState !== "hidden" && !!root.getClientRects?.().length && root.offsetWidth > 0;
  async function pingHelper() {
    try { setHelper(true, await helperCall("/ping")); } catch { setHelper(false); }
  }
  async function syncSlots(force = false) {
    if (!st.helper.on || !panelShown()) return;
    const rects = slotScreenRects();
    if (!rects.length) return;
    const names = Array.from({ length: prefs.count }, (_, i) => String(prefs.names[i] || "").trim());
    const key = JSON.stringify([group, rects, names]);
    if (!force && key === st.helper.sent) return;
    try { const r = await helperCall("/slots", { slots: rects, group, names }); st.helper.sent = key; if (Array.isArray(r?.used)) autoStarOff(r.used); } catch { setHelper(false); }
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
  // ★ 주목 표시 (빨강 별) — 주목이 필요한 대화창 구분용, 이 기기에 기억
  //  11-05: 창 도우미(웹연결 1.13+)가 알려 준 '대화창이 붙은 슬롯(used)' 에 없는 슬롯은 ★·빨강 테두리를 저절로 끔
  function autoStarOff(used) {
    const has = new Set(used.map(Number));
    for (let i = 0; i < prefs.count; i += 1) if (prefs.stars[i] === true && !has.has(i)) toggleStar(i);
  }
  function toggleStar(i) {
    prefs.stars[i] = !(prefs.stars[i] === true);
    for (let k = 0; k < prefs.count; k += 1) if (prefs.stars[k] !== true) prefs.stars[k] = false;
    save();
    const on = prefs.stars[i];
    const slot = root.querySelector(`[data-msn-slot="${i}"]`);
    slot?.classList.toggle("is-star", on);
    const b = root.querySelector(`[data-msn-act="star"][data-i="${i}"]`);
    if (b) { b.textContent = on ? "★" : "☆"; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", String(on)); }
  }

  // 💻 AI추천 (2026-11-05): 붙은 대화창 그림(창 도우미) 또는 화면 공유 그림 → CS 시트 v9 msnSuggest → 답장 후보를 눌러 입력칸에
  function sheetAuth() {
    try { return { endpoint: CS_BOARD_ENDPOINT, token: String(JSON.parse(storage?.getItem(CS_BOARD_STORAGE_KEY) || "{}").token || "") }; } catch { return { endpoint: CS_BOARD_ENDPOINT, token: "" }; }
  }
  async function slotImage(i) {
    if (st.helper.on) {
      try { const r = await helperCall("/capture", { slot: i }); if (r.data) return { data: r.data, mime: r.mime || "image/png" }; } catch { /* 화면 공유로 */ }
    }
    const rect = frameRect(i);
    const region = st.video && rect ? regionOnVideo(rect, window, window.screen, videoSize(), st.fit) : null;
    if (!region) return null;
    const w = Math.min(region.w, 1000), h = Math.round(w * region.h / region.w);
    return { data: grab(region, w, h).c.toDataURL("image/jpeg", 0.9), mime: "image/jpeg" };
  }
  function showSugg(i, answers) {
    const box = root.querySelector(`[data-msn-sugg="${i}"]`);
    if (!box) return;
    box.hidden = !answers.length;
    box.innerHTML = answers.map((a, k) => `<button type="button" class="msn-sugg-item" data-msn-pick="${i}" data-k="${k}" title="눌러서 입력칸에 넣기 (Enter 로 보내기)">${esc(a)}</button>`).join("");
    st.sugg = st.sugg || {};
    st.sugg[i] = answers;
  }
  async function suggest(i) {
    const btn = root.querySelector(`[data-msn-act="suggest"][data-i="${i}"]`);
    const { endpoint, token } = sheetAuth();
    if (!endpoint || !token) { say("AI추천은 CS 시트에 연결된 뒤 쓸 수 있습니다 ([🏠 메인보드] 맨 위 웹 연결 비밀번호).", "is-bad"); return; }
    if (btn) { btn.disabled = true; btn.textContent = "💻 읽는 중…"; }
    try {
      const img = await slotImage(i);
      if (!img) { say(`슬롯 ${i + 1}: 대화창 그림을 가져오지 못했습니다 — 대화창을 슬롯에 붙이거나(창 도우미) [🖥 화면 연결]을 해 주세요.`, "is-bad"); return; }
      const ta = root.querySelector(`[data-msn-text="${i}"]`);
      const res = await window.fetch(endpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "msnSuggest", token, image: img.data, mime: img.mime, name: prefs.names[i] || "", draft: ta?.value || "" }) });
      const js = await res.json().catch(() => ({}));
      if (!res.ok || !js.ok) throw new Error(js.error || `시트 응답 오류 (${res.status})`);
      showSugg(i, js.answers || []);
      say(`슬롯 ${i + 1}: 답장 후보 ${js.answers.length}개 — 눌러서 입력칸에 넣고 Enter 로 보내세요.`, "is-ok");
    } catch (error) {
      say(`슬롯 ${i + 1}: AI 추천 실패 — ${error?.message || error}`, "is-bad");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "💻 AI추천"; }
    }
  }

  // 🪄 표시를 누르면: 사람이 누른 순간에 접속 → 크롬이 '로컬 네트워크 액세스'를 물음 → [허용]
  // 11-06: [🖥 화면 연결] 하나로 — 창 도우미가 꺼져 있으면 켜고(v3msn://) 연결 + 화면 공유 (+ 거래처는 영역 자동 맞춤)
  // 11-09: 켜지지 않으면(이 PC 에 없음) 설치 파일을 알아서 받고 → 사람은 받은 파일 [실행]만 → 켜지면 저절로 이어서 연결
  async function connectAll() {
    if (st.stream) { disconnect(); return; }
    let launched = false;
    if (!st.helper.on) {
      await pingHelper();
      if (!st.helper.on) { launchHelper(); launched = true; }
    }
    await connect({ launched });
  }
  // 11-09 승인은 크롬 위쪽 한 자리에 차례로 — 화면엔 체크리스트 한 개 (버튼 바로 밑 보라 상자)
  async function renderSteps() {
    const note = $("[data-msn-cta-note]");
    if (!note) return;
    const perm = await lnaState();
    const on = st.helper.on;
    const mark = (ok, bad) => (ok ? "✅" : bad ? "⛔" : "⬜");
    const rows = [
      `${mark(on || perm === "granted", perm === "denied")} 크롬 위쪽 <b>'로컬 네트워크의 기기에 액세스'</b> → <b>[허용]</b>${perm === "denied" ? " — 막혀 있음: 주소창 맨 왼쪽 아이콘 → '로컬 네트워크 액세스' 허용 → F5" : ""}`,
      `${mark(on)} 같은 자리 <b>'msn_helper 열기'</b> → <b>'항상 허용'</b> 체크 + <b>[열기]</b>`,
    ];
    if (st.helper.installOffered) rows.push(`${mark(on)} (처음 한 번) 받은 <b>msn_helper.bat</b> 실행 → 'PC 보호' 창이면 <b>추가 정보 → 실행</b>`);
    note.innerHTML = `<ol class="msn-steps">${rows.map((r) => `<li>${r}</li>`).join("")}</ol>${on ? "" : `<small>${st.helper.waiting ? "⏳ 창 도우미 기다리는 중 — 켜지면 저절로 이어서 연결합니다" : "[🖥 화면 연결]을 누르면 위 순서대로 진행됩니다 (처음 한 번만)"}</small>`}`;
  }

  function launchHelper() {
    const a = root.querySelector("[data-msn-launch]");
    if (a) a.dispatchEvent(new window.MouseEvent("click", { bubbles: false }));   // v3msn:// (설치돼 있으면 켜짐)
    if (st.helper.waiting) return;
    st.helper.waiting = true;
    say("창 도우미를 켜는 중… 크롬 위쪽에 뜨는 승인 창을 아래 순서대로 눌러 주세요");
    renderSteps();
    const started = Date.now();
    const poll = async () => {
      if (st.helper.on || !st.helper.waiting) return;
      await pingHelper();
      if (st.helper.on) return;
      const waited = Date.now() - started;
      if (waited > 20000 && !st.helper.installOffered) {
        st.helper.installOffered = true;
        const perm = await lnaState();
        if (perm === "denied") {
          say("이 화면의 PC 접속이 막혀 있습니다 — 주소창 맨 왼쪽 아이콘(앱은 ⋮ → 앱 정보) → '로컬 네트워크 액세스' 허용 → 새로고침(F5)", "is-bad");
        } else {
          const dl = document.createElement("a");
          dl.href = MSN_HELPER_INSTALLER; dl.download = "msn_helper.bat"; dl.hidden = true;
          document.body.appendChild(dl); dl.click(); dl.remove();
          say("이 PC 에 창 도우미가 없어 설치 파일(msn_helper.bat)을 받았습니다 — 크롬 오른쪽 위 받은 파일을 눌러 실행. 설치되면 여기서 저절로 이어서 연결합니다.", "is-bad");
        }
      }
      renderSteps();
      if (waited < 5 * 60000) window.setTimeout(poll, waited < 20000 ? 2500 : 4000);
      else { st.helper.waiting = false; say("창 도우미가 아직 켜지지 않았습니다 — 설치 파일을 실행했는지 확인하고 [🖥 화면 연결]을 다시 눌러 주세요.", "is-bad"); }
    };
    window.setTimeout(poll, 2500);
  }
  // 11-09: 창 도우미 버전이 낮으면 화면이 대신 업데이트 (1.25+ 는 /msn/update 로 스스로 바꾸고 다시 켜짐)
  async function autoUpdate(ver) {
    try {
      say(`창 도우미 ${String(ver || "").split(" ")[0]} → 새 버전으로 바꾸는 중… (자동 · 몇 초)`);
      const r = await helperCall("/update", {}, 40000);
      if (r.same) { say(""); return; }
      if (r.restarting) {
        st.helper.waiting = true;
        setHelper(false);
        const t0 = Date.now();
        const again = async () => { await pingHelper(); if (!st.helper.on && Date.now() - t0 < 30000) window.setTimeout(again, 1500); };
        window.setTimeout(again, 2000);
      }
    } catch (error) {
      const m = String(error?.message || error);
      if (/마스터/.test(m)) { say(""); return; }                       // 수집기 PC 는 ⚙ 설정의 [업데이트]로
      say(/not found|404/.test(m)
        ? `창 도우미가 예전 버전(${String(ver || "").split(" ")[0]})이라 스스로 못 바꿉니다 — 이 PC 를 다시 켜거나, 바탕화면 'V3 Messenger Helper' 를 한 번 눌러 주세요 (켤 때 새 버전을 받음).`
        : `창 도우미 업데이트 실패: ${m}`, "is-bad");
    }
  }
  async function connectHelper() {
    if (st.helper.on) { diagnose(); return; }
    say("창 도우미에 연결하는 중… 크롬이 '로컬 네트워크의 기기에 액세스'를 물으면 [허용]을 눌러 주세요.");
    await pingHelper();
    if (st.helper.on) { say("창 도우미 연결됨 — 대화창을 슬롯 가까이 끌어다 놓거나 [📐 일괄 붙이기]를 누르세요.", "is-ok"); syncSlots(true); return; }
    const perm = await lnaState();
    say(perm === "denied"
      ? "이 화면의 PC 접속이 막혀 있습니다 — 앱: 오른쪽 위 ⋮ → 앱 정보 → '로컬 네트워크 액세스' 허용 (크롬 탭: 주소창 왼쪽 아이콘 → '로컬 네트워크 액세스' 켜기) → 새로고침(F5)."
      : "창 도우미에 연결하지 못했습니다 — [🖥 화면 연결]을 누르거나, 처음이면 [⬇ 처음 한 번: 도우미 설치 파일]을 받아 더블클릭하세요 (카톡이 있는 이 PC에서).", "is-bad");
  }

  // 🔍 진단 (연결된 상태에서 🪄 표시를 누르면): 도우미가 보는 카톡·네이트온 프로그램 창 목록
  async function diagnose() {
    try {
      const r = await helperCall("/windows");
      const list = r.windows || [];
      const ok = list.filter((w) => w.ok);
      const lines = list.map((w) => `${w.ok ? "✓" : "✕"} ${w.exe} · ${w.title || "(제목 없음)"} · ${w.w}×${w.h}${w.tool ? " · 도구창" : ""}${w.min ? " · 최소화" : ""}`);
      say(`창 도우미가 찾은 대화창 ${ok.length}개 (✓ = 붙일 수 있음)${lines.length ? `\n${lines.join("\n")}` : " — 카톡 창이 하나도 안 보입니다"}`, ok.length ? "is-ok" : "is-bad");
    } catch (error) { say(`진단 실패: ${error?.message || error} — [🖥 화면 연결]을 다시 눌러 주세요`, "is-bad"); }
  }

  // 11-06: 크롬 확대 비율이 100%가 아니면 창 자리 계산이 어긋남 → 알려 줌 (Ctrl+0)
  function zoomWarn() {
    const ow = window.outerWidth || 0, iw = window.innerWidth || 0;
    if (!ow || !iw) return "";
    const z = (ow - 16) / iw;
    return z < 0.93 || z > 1.12 ? `크롬 확대 비율이 100%가 아닌 것 같습니다 (약 ${Math.round(z * 100)}%) — 창 자리가 어긋나면 Ctrl+0 으로 100%에 맞추고 다시 [📐 일괄 붙이기]` : "";
  }
  async function arrange() {
    if (!st.helper.on) await pingHelper();
    if (!st.helper.on) { say("창 도우미가 연결되지 않았습니다 — [🖥 화면 연결]을 누르거나, 처음이면 💬 메신저 탭 → 💻 이 PC 에서 메신저 쓰기.", "is-bad"); return; }
    try {
      await syncSlots(true);
      if (vendor) say("카톡에서 업체 대화방을 찾아 여는 중… (업체가 많으면 몇십 초)");
      const r = await helperCall("/arrange", { search: vendor }, vendor ? 90000 : 2500);   // 1.20: 거래처 = 카톡 검색으로 열기
      const named = Number(r.named) || 0;
      if (vendor) {               // 11-06: 전체 안내 글 없이 슬롯마다 노란 안내 → 이어서 그림 붙여넣기(사진적용 합침)
        st.notes = r.notes || {}; applyNotes();
        const zw = zoomWarn();
        say(zw, zw ? "is-bad" : "");
        await pingHelper();
        await api.afterArrange?.();
        return;
      }
      const zw = zoomWarn();
      if (zw) { say(zw, "is-bad"); pingHelper(); return; }
      say(r.placed ? `열린 대화창 ${r.placed}개를 슬롯에 같은 크기로 맞췄습니다 (항상 위)${named ? ` — 그중 ${named}개는 메모 이름으로` : ""}.` : vendor ? "메모 이름과 맞는 카톡 창이 없습니다 — 업체 대화창을 먼저 열고, 슬롯 메모에 카톡방 이름(일부)을 적어 주세요." : "열린 카톡 대화창이 없습니다 — 대화창을 먼저 열어 주세요.", r.placed ? "is-ok" : "is-bad");
      pingHelper();
    } catch (error) { say(`일괄 붙이기 실패: ${error?.message || error}`, "is-bad"); }
  }
  async function release() {
    try {
      const r = await helperCall("/release", {});
      say(`대화창 ${r.released || 0}개의 '항상 위'를 풀었습니다 (자리는 그대로).`, "is-ok");
      pingHelper();
    } catch (error) { say(`놓아주기 실패: ${error?.message || error}`, "is-bad"); }
  }

  // ↵ 보내기 (2026-11-05): 복사 → 창 도우미가 붙은 대화창에 붙여넣기 + Enter → 커서는 이 칸으로 되돌아옴
  async function send(i) {
    const ta = root.querySelector(`[data-msn-text="${i}"]`);
    const text = ta?.value || "";
    if (!text.trim()) { say(`슬롯 ${i + 1}: 보낼 답변이 없습니다.`, "is-bad"); return; }
    try { await navigator.clipboard.writeText(text); } catch { ta.select(); document.execCommand?.("copy"); }
    if (!st.helper.on) { say(`슬롯 ${i + 1}: 창 도우미가 연결되지 않아 복사만 했습니다 — 메신저 창에서 Ctrl+V 후 Enter`, "is-bad"); ta?.focus(); return; }
    try {
      await helperCall("/send", { slot: i, enter: true });
      ta.value = "";
      say(`슬롯 ${i + 1}: 보냈습니다.`, "is-ok");
    } catch (error) {
      say(`슬롯 ${i + 1}: 보내지 못함 — ${error?.message || error} (복사는 됨: 메신저 창에서 Ctrl+V)`, "is-bad");
    }
    ta?.focus();
  }

  // 키보드: Enter = 보내기 · Shift+Enter = 줄바꿈 · Tab = 다음 슬롯 (Shift+Tab 이전) · Tab 누른 채 ←→↑↓ 또는 숫자 = 그 슬롯
  const kb = { tab: false, used: false };
  function focusSlot(i) {
    const n = prefs.count;
    const j = ((i % n) + n) % n;
    const ta = root.querySelector(`[data-msn-text="${j}"]`);
    if (!ta) return;
    ta.focus();
    ta.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    root.querySelectorAll("[data-msn-slot]").forEach((el) => el.classList.toggle("is-typing", Number(el.dataset.msnSlot) === j));
  }
  function onKeyDown(e) {
    const ta = e.target.closest?.("[data-msn-text]");
    if (!ta) return;
    const i = Number(ta.dataset.msnText);
    if (e.key === "Tab") { e.preventDefault(); if (!kb.tab) { kb.tab = true; kb.used = false; kb.shift = e.shiftKey; } return; }
    if (kb.tab) {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (step) { e.preventDefault(); kb.used = true; focusSlot(i + step); return; }
      if (/^[1-9]$/.test(e.key) && Number(e.key) <= prefs.count) { e.preventDefault(); kb.used = true; focusSlot(Number(e.key) - 1); return; }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); send(i); }
  }
  function onKeyUp(e) {
    if (e.key !== "Tab" || !kb.tab) return;
    const ta = e.target.closest?.("[data-msn-text]");
    if (!kb.used && ta) focusSlot(Number(ta.dataset.msnText) + (kb.shift ? -1 : 1));
    kb.tab = false;
  }
  root.addEventListener("keydown", onKeyDown);
  root.addEventListener("keyup", onKeyUp);
  root.addEventListener("focusin", (e) => { const ta = e.target.closest?.("[data-msn-text]"); if (ta) focusSlot(Number(ta.dataset.msnText)); });

  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-msn-launch]")) {        // ▶ 창 도우미 켜기 (v3msn://) → 켜질 때까지 몇 번 확인
      say("창 도우미를 켜는 중… 크롬이 'msn_helper 열기'를 물으면 [열기] (항상 허용 체크하면 다음부터 안 물음). 처음이면 [⬇ 처음 한 번: 도우미 설치 파일]부터.");
      [3000, 6000, 10000, 15000, 22000].forEach((ms) => window.setTimeout(() => { if (!st.helper.on) pingHelper().then(() => { if (st.helper.on) { say("창 도우미 연결됨", "is-ok"); syncSlots(true); } }); }, ms));
      return;
    }
    const b = e.target.closest("[data-msn-act]");
    const slot = e.target.closest("[data-msn-slot]");
    if (slot && !b) {                         // 슬롯을 누르면 새 변화 표시 지움
      const i = Number(slot.dataset.msnSlot);
      slot.classList.remove("is-new");
      const badge = root.querySelector(`[data-msn-badge="${i}"]`); if (badge) badge.hidden = true;
      if (st.slots[i]) st.slots[i].events = 0;
    }
    const pick = e.target.closest("[data-msn-pick]");
    if (pick) {
      const i = Number(pick.dataset.msnPick);
      const ta = root.querySelector(`[data-msn-text="${i}"]`);
      if (ta) { ta.value = st.sugg?.[i]?.[Number(pick.dataset.k)] || pick.textContent; ta.focus(); ta.setSelectionRange?.(ta.value.length, ta.value.length); }
      return;
    }
    if (!b) return;
    const act = b.dataset.msnAct, i = Number(b.dataset.i);
    if (act === "connect") connectAll();
    else if (act === "fit") fit().then(() => syncSlots(true));
    else if (act === "arrange") arrange();
    else if (act === "helper") connectHelper();
    else if (act === "release") release();
    else if (act === "send") send(i);
    else if (act === "suggest") suggest(i);
    else if (act === "star") toggleStar(i);
    else if (act === "clear") { const ta = root.querySelector(`[data-msn-text="${i}"]`); if (ta) ta.value = ""; }
  });
  root.addEventListener("change", (e) => {
    if (e.target.matches("[data-msn-count]")) { prefs.count = fitCount(e.target.value); save(); render(); syncSlots(true); }
    else if (e.target.matches("[data-msn-height]")) { prefs.height = Number(e.target.value) || MSN_LIMITS.heights[1]; save(); render(); syncSlots(true); }
    else if (e.target.matches("[data-msn-width]")) { prefs.width = Number(e.target.value) || MSN_LIMITS.widths[0]; save(); render(); syncSlots(true); }
  });
  root.addEventListener("input", (e) => {
    if (e.target.matches("[data-msn-name]")) {
      const i = Number(e.target.dataset.msnName);
      prefs.names[i] = e.target.value; save();
      if (st.notes?.[i]) { delete st.notes[i]; applyNotes(); }   // 메모를 고치면 그 슬롯 안내는 지움
    }
  });

  render();
  setConn(false);
  setHelper(false);
  if (!can) say("이 기기는 화면 연결을 지원하지 않습니다 — 메신저 감지는 PC 크롬에서.", "is-bad");
  window.setInterval?.(helperTick, HELPER_SYNC_MS);
  window.addEventListener?.("resize", () => syncSlots(true));
  // 📦 거래처: 그림(PNG Blob)을 슬롯 i 에 붙은 창에 붙여넣기 (Enter 는 사람이 — 카톡 미리보기 창에서 [전송])
  async function pasteImage(i, blob, { enter = false } = {}) {
    if (!st.helper.on) throw new Error("창 도우미 연결 안 됨");
    for (let t = 0; t < 20 && document.hasFocus && !document.hasFocus(); t += 1) await new Promise((r) => window.setTimeout(r, 100));
    await navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })]);
    return helperCall("/send", { slot: i, enter });
  }
  // 📦 거래처 (11-06): 주문서 업체명을 위에서부터 순서대로 슬롯 메모에 — 매일 새 리스트 (남는 슬롯 메모·★ 는 비움) · 넣은 수 돌려줌
  function setNames(list = []) {
    const names = list.map((x) => String(x || "").trim().slice(0, 30)).filter(Boolean).slice(0, slotsMax);
    if (names.length > prefs.count) prefs.count = fitCount(names.length);
    prefs.names = Array.from({ length: slotsMax }, (_, i) => names[i] || "");
    prefs.stars = Array.from({ length: slotsMax }, () => false);
    st.notes = {};
    save(); render(); syncSlots(true);
    return names.length;
  }
  // 1.20 일괄 보내기: 슬롯 대화창의 [사진 보내기] 미리보기 창에서 Enter → { popup: 미리보기 창이 있었는지 }
  async function confirmSend(i) {
    if (!st.helper.on) throw new Error("창 도우미 연결 안 됨");
    return helperCall("/confirm", { slot: i }, 8000);
  }
  // 11-06 일괄 비우기: 이 탭 슬롯에 붙은 카톡 대화창 + [이미지 전송] 창 닫기 (웹연결 1.21)
  async function resetWindows() {
    if (!st.helper.on) return { ok: false };
    try { return await helperCall("/reset", {}, 15000); } catch (error) { return { ok: false, error: error?.message || String(error) }; }
  }
  async function usedSlots() {
    const r = await helperCall("/ping");
    return r.group === group && Array.isArray(r.used) ? r.used.map(Number) : [];
  }

  const api = { connect, disconnect, fit, tick, state: st, prefs, limits: MSN_LIMITS, slotsMax, group, root, arrange, release, syncSlots, pingHelper, slotScreenRects, send, focusSlot, diagnose, suggest, toggleStar, pasteImage, usedSlots, setNames, confirmSend, resetWindows, say };
  MSN_PANELS[group] = api;
  return api;
}

if (typeof document !== "undefined" && document.querySelector("[data-msn-panel]")) {
  const storage = (() => { try { return window.localStorage; } catch { return null; } })();
  document.querySelectorAll("[data-msn-panel]").forEach((root) => {
    const inst = mountMsnSlots({ document, window, storage, root });
    if (inst?.group === "vendor") import("./vendorMent.mjs?v=20261111-ment2").then((m) => m.mountVendorMent({ document, window, storage, root: root.querySelector("[data-vendor-ment]"), slotsRoot: root })).catch((e) => inst.say(`전체 멘트를 불러오지 못했습니다: ${e?.message || e}`, "is-bad"));
    if (inst?.group === "vendor") import("./vendorOrder.mjs?v=20261112-color1").then((m) => m.mountVendorOrder({ document, window, storage, panel: inst })).catch((e) => inst.say(`주문서 기능을 불러오지 못했습니다: ${e?.message || e}`, "is-bad"));
  });
}
