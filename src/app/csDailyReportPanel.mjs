// 📊 CS 관리 › ⚙ 설정 › 오늘 CS 리포트 (2026-11-17)
//  · 설정(리뷰 N개 · 상담톡 N줄 · 게시판 N줄 · 받는 카톡방)은 여기 한 곳에서 — 이 기기에 기억
//  · [👀 미리보기] 시트 v30 reportData 로 오늘 리뷰·문의·상담톡을 받고, 상담톡·게시판은 AI 가 N줄로(reportSummary · 안 되면 간단 요약)
//  · 미리보기 글은 고쳐 쓸 수 있음 → [📨 카톡 3건 보내기] = 이 PC 창 도우미(웹연결 1.30+)가 그 카톡방에 3개를 차례로 보냄
import { normalizeCsRow, pickedText } from "../domain/csBoard.mjs?v=20261111-msqa1";
import {
  REPORT_STORE_KEY, REPORT_SENT_KEY, REPORT_LIMITS, REPORT_MAX_ROOMS, normalizeReportSettings, sendRooms, reportDue, autoLabel, kstClock, kstDay, pickReviews, chatItems, boardItems,
  fallbackLines, reviewMessage, summaryMessage,
} from "../domain/csDailyReport.mjs?v=20261117-auto1";

export const REPORT_HELPER_URL = "http://127.0.0.1:47811/msn";
export const REPORT_HELPER_MIN = "1.30";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const verNums = (v) => (String(v || "").split(" ")[0].match(/\d+/g) || []).slice(0, 3).map(Number);
export function helperTooOld(ver, min = REPORT_HELPER_MIN) {
  const a = verNums(ver), b = verNums(min);
  if (!a.length) return true;
  for (let i = 0; i < 3; i++) { const x = a[i] || 0, y = b[i] || 0; if (x !== y) return x < y; }
  return false;
}

export function mountDailyReport({ document, window, root, post, isLive = () => true, storage = null } = {}) {
  if (!root) return null;
  const read = () => { try { return JSON.parse(storage?.getItem(REPORT_STORE_KEY) || "{}"); } catch { return {}; } };
  let cfg = normalizeReportSettings(read());
  let busy = false;

  root.innerHTML = `
    <fieldset class="cs-box cs-report-box">
      <legend>📊 오늘 CS 리포트 (카톡 3건)</legend>
      <p class="cs-note">리뷰 · 상담톡 · 게시판을 오늘 것만 모아 카톡 메시지 <b>3개</b>로 보냅니다. 설정은 여기 한 곳에서 (이 기기에 기억).</p>
      <div class="cs-report-set">
        <label>⭐ 리뷰 <input type="number" data-rp="reviewN" min="${REPORT_LIMITS.reviewN[0]}" max="${REPORT_LIMITS.reviewN[1]}" class="cs-input-num"> 개씩 <small>(별5 · 별1 각각 · 보통 평가는 뺌)</small></label>
        <label>💬 상담톡 <input type="number" data-rp="chatLines" min="${REPORT_LIMITS.chatLines[0]}" max="${REPORT_LIMITS.chatLines[1]}" class="cs-input-num"> 줄 요약</label>
        <label>📋 게시판 <input type="number" data-rp="boardLines" min="${REPORT_LIMITS.boardLines[0]}" max="${REPORT_LIMITS.boardLines[1]}" class="cs-input-num"> 줄 요약</label>
      </div>
      <div class="cs-report-rooms">
        <b>📨 받는 사람 (카톡방 · 3곳까지)</b>
        ${Array.from({ length: REPORT_MAX_ROOMS }, (_, i) => `<label>${i + 1} <input type="text" data-rp-room="${i}" maxlength="40" placeholder="${i ? "비워 두면 안 보냄" : "카톡 대화방 이름 그대로 (예: 나와의 채팅 = 내 이름)"}"></label>`).join("")}
      </div>
      <div class="cs-report-auto">
        <label class="cs-report-auto-on"><input type="checkbox" data-rp-chk="auto"> ⏰ 자동 보내기</label>
        <label>예약 시각 <input type="time" data-rp="time" step="60"></label>
        <label><input type="checkbox" data-rp-chk="weekend"> 주말 포함</label>
        <p class="cs-note" data-rp-auto-note></p>
      </div>
      <div class="cs-row">
        <button type="button" class="cs-btn cs-btn-white" data-rp-act="preview">👀 미리보기 만들기</button>
        <button type="button" class="cs-btn cs-btn-primary" data-rp-act="send" disabled>📨 카톡 3건 보내기</button>
      </div>
      <p class="cs-note cs-report-state" data-rp-state>[👀 미리보기 만들기] → 확인·수정 → [📨 카톡 3건 보내기]</p>
      <div class="cs-report-msgs" data-rp-msgs hidden></div>
      <p class="cs-note">자동 보내기는 <b>이 PC 에서 CS 관리 화면이 열려 있을 때</b> 예약 시각에 하루 한 번 보냅니다 (켠 PC 에서만 · 늦게 켜도 3시간 안이면 보냄). 보내기는 <b>이 PC</b>의 카톡으로 합니다 (카톡 PC 켜 두기 · 창 도우미 웹연결 1.30 이상). 받는 사람마다 대화방 이름이 <b>똑같은</b> 방에만 차례로 보냅니다.</p>
    </fieldset>`;
  const $ = (sel) => root.querySelector(sel);
  const state = $("[data-rp-state]");
  const msgsBox = $("[data-rp-msgs]");
  const sendBtn = $('[data-rp-act="send"]');
  const say = (text, cls = "") => { state.textContent = text; state.className = `cs-note cs-report-state ${cls}`.trim(); };

  const sentDay = () => { try { return storage?.getItem(REPORT_SENT_KEY) || ""; } catch { return ""; } };
  function fill() {
    for (const el of root.querySelectorAll("[data-rp]")) el.value = cfg[el.dataset.rp];
    for (const el of root.querySelectorAll("[data-rp-chk]")) el.checked = cfg[el.dataset.rpChk] === true;
    const note = $("[data-rp-auto-note]");
    if (note) note.textContent = autoLabel(cfg) + (cfg.auto && sentDay() === kstClock().day ? " · 오늘 보냄 ✓" : "");
    for (const el of root.querySelectorAll("[data-rp-room]")) el.value = cfg.rooms[Number(el.dataset.rpRoom)] || "";
  }
  function save() {
    const raw = { rooms: [] };
    for (const el of root.querySelectorAll("[data-rp]")) raw[el.dataset.rp] = el.value;
    for (const el of root.querySelectorAll("[data-rp-room]")) raw.rooms[Number(el.dataset.rpRoom)] = el.value;
    for (const el of root.querySelectorAll("[data-rp-chk]")) raw[el.dataset.rpChk] = el.checked;
    cfg = normalizeReportSettings(raw);
    try { storage?.setItem(REPORT_STORE_KEY, JSON.stringify(cfg)); } catch { /* 저장 못 해도 이번엔 씀 */ }
  }
  fill();
  root.addEventListener("change", (e) => { if (e.target.closest("[data-rp], [data-rp-room], [data-rp-chk]")) { save(); fill(); } });

  async function summarize(kind, items, lines) {
    if (!items.length) return { lines: [], ai: false };
    try {
      const r = await post({ action: "reportSummary", kind, lines, items });
      if (Array.isArray(r.lines) && r.lines.length) return { lines: r.lines.slice(0, lines), ai: true };
    } catch (error) { return { lines: fallbackLines(items, lines), ai: false, note: String(error?.message || error) }; }
    return { lines: fallbackLines(items, lines), ai: false };
  }

  function showMsgs(texts) {
    msgsBox.hidden = false;
    msgsBox.innerHTML = texts.map((t, i) => `<label class="cs-report-msg"><span>${["⭐ 리뷰", "💬 상담톡", "📋 게시판"][i]}</span><textarea rows="${Math.min(16, t.split("\n").length + 1)}" data-rp-msg="${i}">${esc(t)}</textarea></label>`).join("");
    sendBtn.disabled = false;
  }

  async function preview() {
    if (busy) return false;
    if (!isLive()) { say("시트에 연결된 뒤에 만들 수 있습니다 (🏠 메인보드 › 웹 연결).", "is-bad"); return false; }
    busy = true; save();
    say("오늘 리뷰·상담톡·게시판을 모으는 중…");
    let ok = false;
    try {
      let data;
      try { data = await post({ action: "reportData" }); }
      catch (error) { throw new Error(`시트에서 오늘 내용을 못 받았습니다 (${error?.message || error}) — 시트 v31 [배포]가 안 됐으면 먼저 배포해 주세요`); }
      if (!Array.isArray(data.rows)) throw new Error("시트가 리포트 요청을 모릅니다 — 시트 v31 [배포]가 필요합니다");
      const today = kstDay(data.serverTime ? new Date(data.serverTime) : new Date());
      const rows = data.rows.map((raw) => normalizeCsRow(raw));
      const reviews = pickReviews(rows, today, cfg.reviewN);
      const chats = chatItems({ smart: data.smart, kakao: data.kakao, ably: data.ably }, today);
      const boards = boardItems(rows, today, (row) => { try { return pickedText(row); } catch { return ""; } });
      say(`AI 가 요약하는 중… (상담톡 ${chats.length}건 · 게시판 ${boards.length}건)`);
      const [c, b] = await Promise.all([summarize("상담톡", chats, cfg.chatLines), summarize("게시판", boards, cfg.boardLines)]);
      showMsgs([
        reviewMessage(today, reviews),
        summaryMessage(today, 2, "💬 상담톡", "상담", chats, c.lines),
        summaryMessage(today, 3, "📋 게시판", "문의", boards, b.lines),
      ]);
      const plain = [c, b].filter((x, i) => [chats, boards][i].length && !x.ai);
      ok = true;
      say(plain.length ? `미리보기 완료 — AI 요약이 안 돼서 간단 요약으로 넣었습니다${plain[0].note ? ` (${plain[0].note})` : ""}. 고쳐 쓰고 보내도 됩니다.` : "미리보기 완료 — 고쳐 쓸 수 있습니다. 확인 후 [📨 카톡 3건 보내기]", plain.length ? "is-warn" : "is-ok");
    } catch (error) {
      say(String(error?.message || error), "is-bad");
    } finally { busy = false; }
    return ok;
  }

  async function helper(path, body, ms = 4000) {
    const opt = body === undefined ? { method: "GET" } : { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) };
    if (window.AbortSignal?.timeout) opt.signal = window.AbortSignal.timeout(ms);
    const res = await window.fetch(`${REPORT_HELPER_URL}${path}`, opt);
    const js = await res.json().catch(() => ({}));
    if (!res.ok || js.ok === false) throw new Error(js.error || `HTTP ${res.status}`);
    return js;
  }

  async function send() {
    if (busy) return;
    save();
    const rooms = sendRooms(cfg.rooms);
    if (!rooms.length) { say("받는 카톡방 이름을 먼저 적어 주세요 (2글자 이상).", "is-bad"); root.querySelector('[data-rp-room="0"]')?.focus(); return; }
    const texts = [...root.querySelectorAll("[data-rp-msg]")].map((t) => t.value.trim()).filter(Boolean);
    if (!texts.length) { say("먼저 [👀 미리보기 만들기]를 눌러 주세요.", "is-bad"); return; }
    busy = true; sendBtn.disabled = true;
    try {
      let ping;
      try { ping = await helper("/ping"); }
      catch { throw new Error("이 PC 의 창 도우미에 연결하지 못했습니다 — 카톡이 있는 PC 에서 💬 메신저 탭 [🖥 화면 연결] 후 다시 눌러 주세요"); }
      if (helperTooOld(ping.ver)) {
        say(`창 도우미 ${String(ping.ver || "").split(" ")[0]} → 1.30 으로 바꾸는 중…`);
        try { await helper("/update", {}, 40000); }
        catch (error) {
          throw new Error(/마스터/.test(String(error?.message))
            ? "이 PC 는 수집기(마스터) PC 라 ⚙ 설정 › ⬆ 수집기 PC 업데이트 [⬆ 업데이트]로 웹연결 1.30 을 받은 뒤 다시 눌러 주세요"
            : `창 도우미를 1.30 으로 바꾸지 못했습니다: ${error?.message || error}`);
        }
        throw new Error("창 도우미를 새 버전으로 바꿨습니다 — 10초쯤 뒤에 [📨 카톡 3건 보내기]를 다시 눌러 주세요");
      }
      const done = [], fail = [];
      for (const [i, room] of rooms.entries()) {   // 한 방씩 차례로 (카톡 창이 겹치지 않게)
        say(`카톡 ${i + 1}/${rooms.length} '${room}' 에 ${texts.length}건 보내는 중… (카톡 창이 잠깐 앞으로 나옵니다)`);
        try { const r = await helper("/text", { room, texts }, 30000); done.push(`${r.title} ${r.sent}건`); }
        catch (error) { fail.push(`${room}: ${error?.message || error}`); }
      }
      if (fail.length) say(`${done.length ? `✅ ${done.join(" · ")} 보냄\n` : ""}⚠ 못 보냄 — ${fail.join(" / ")}`, done.length ? "is-warn" : "is-bad");
      else say(`✅ ${rooms.length}곳에 보냈습니다 — ${done.join(" · ")}`, "is-ok");
    } catch (error) {
      say(String(error?.message || error), "is-bad");
    } finally { busy = false; sendBtn.disabled = false; }
  }

  // ⏰ 자동 보내기: 30초마다 확인 → 때가 되면 미리보기 만들고 그대로 보냄 (오늘 보냄 표시를 먼저 남겨 두 번 안 보냄)
  async function tick(now = new Date()) {
    if (busy || !isLive() || !reportDue(cfg, now, sentDay())) return false;
    // 같은 PC 에 CS 화면 탭이 여러 개(아침 7시 예약으로 또 열림 등)여도 한 탭만: 내 표시를 남기고 잠깐 뒤 그대로면 내가 보냄
    const me = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try { storage?.setItem(`${REPORT_SENT_KEY}_lock`, me); } catch { /* 없으면 그냥 */ }
    await new Promise((r) => window.setTimeout(r, 1500));
    try { if (storage && storage.getItem(`${REPORT_SENT_KEY}_lock`) !== me) return false; } catch { /* 읽기 실패면 그냥 */ }
    if (!reportDue(cfg, now, sentDay())) return false;
    try { storage?.setItem(REPORT_SENT_KEY, kstClock(now).day); } catch { /* 표시 못 남겨도 이번엔 보냄 */ }
    fill();
    if (!(await preview())) { say(`⏰ 자동 보내기 실패 (미리보기) — ${state.textContent}`, "is-bad"); return false; }
    await send();
    say(`⏰ 자동 보내기 ${cfg.time} — ${state.textContent}`, state.className.includes("is-ok") ? "is-ok" : "is-warn");
    return true;
  }
  const timer = window.setInterval?.(() => { tick(); }, 30000);

  root.addEventListener("click", (e) => {
    const act = e.target.closest("[data-rp-act]")?.dataset.rpAct;
    if (act === "preview") preview();
    else if (act === "send") send();
  });
  return { preview, send, tick, stop() { window.clearInterval?.(timer); }, get settings() { return cfg; } };
}
