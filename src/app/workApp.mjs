// 📋 업무 관리 (2026-11-25) — 사이드 메뉴: 업무 내역 · 배송 내역(목업)
//  · 데이터 = CS 시트 '업무내역' 탭 (CS 관리 비밀번호로 읽고 씀 — 공지 메모와 같은 방식)
//  · 슬롯(직원 칸) 최대 5개, 슬롯 이름은 이 기기에만 저장
import { CS_BOARD_ENDPOINT, CS_BOARD_STORAGE_KEY, isCsBoardTokenValid } from "../domain/csBoard.mjs?v=20261125-work1";
import {
  WORK_SLOT_MAX, WORK_DRAFT_PREFIX, kstDay, kstHour, addDays, dayLabel, newId, cleanMin, normalizeItems, sumMin, fmtMin,
  copyChecked, moveLine, historyStats, monthGrid, monthShift, readSlots, writeSlots,
} from "../domain/workBoard.mjs?v=20261125-work1";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function mountWorkApp({ document, window, fetchImpl, storage } = {}) {
  const store = storage || (() => { try { return window.localStorage; } catch { return null; } })();
  const doFetch = fetchImpl || ((...a) => window.fetch(...a));
  const $ = (s, el = document) => el.querySelector(s);
  const root = $("#work-log-root");
  if (!root) return null;

  const S = {
    day: kstDay(), month: kstDay(), staff: [], templates: {}, days: {}, calendar: {},
    slots: readSlots(store), drafts: {}, editTpl: {}, checked: {}, busy: false, loaded: false,
    notice: { text: "", savedAt: "", editor: "" }, noticeDirty: false,
  };

  function creds() {
    try {
      const raw = JSON.parse(store?.getItem(CS_BOARD_STORAGE_KEY) || "{}");
      return isCsBoardTokenValid(raw.token) ? { token: String(raw.token).trim(), editor: String(raw.editor || "") } : null;
    } catch { return null; }
  }
  async function call(action, body = {}) {
    const c = creds();
    if (!c) throw new Error("CS 관리 화면에서 비밀번호를 한 번 넣어 주세요 (같은 비밀번호로 저장합니다)");
    const r = await doFetch(CS_BOARD_ENDPOINT, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action, token: c.token, editor: c.editor, ...body }) });
    if (!r.ok) throw new Error(`시트 응답 오류 (${r.status})`);
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.error || "시트가 요청을 거절했습니다");
    return j;
  }
  const say = (t, bad) => { const el = $("[data-wk-state]", root); if (el) { el.textContent = t; el.classList.toggle("is-bad", !!bad); } };

  // ---- 그 날 업무(초안) ----
  const draftKey = (name) => `${WORK_DRAFT_PREFIX}${name}|${S.day}`;
  function dayOf(name) {
    if (!S.drafts[name]) {
      let d = null;
      try { d = JSON.parse(store?.getItem(draftKey(name)) || "null"); } catch {}
      const saved = S.days[name];
      S.drafts[name] = d && d.dirty ? d : { am: normalizeItems(saved?.am), pm: normalizeItems(saved?.pm), memo: String(saved?.memo || ""), dirty: false };
    }
    return S.drafts[name];
  }
  function setDay(name, next, dirty = true) {
    S.drafts[name] = { ...next, dirty };
    try { dirty ? store?.setItem(draftKey(name), JSON.stringify(S.drafts[name])) : store?.removeItem(draftKey(name)); } catch {}
  }

  // ---- 그리기 ----
  function renderCalendar() {
    const box = $("[data-wk-cal]", root);
    const weeks = monthGrid(S.month);
    const [y, m] = S.month.split("-");
    const today = kstDay();
    box.innerHTML = `<div class="wk-cal-head"><button type="button" data-wk-mon="-1">◀</button><b>${Number(y)}년 ${Number(m)}월</b><button type="button" data-wk-mon="1">▶</button></div>
      <table class="wk-cal"><thead><tr>${"일월화수목금토".split("").map((w) => `<th>${w}</th>`).join("")}</tr></thead><tbody>
      ${weeks.map((wk) => `<tr>${wk.map((d) => {
        if (!d) return "<td></td>";
        const who = S.calendar[d] || [];
        return `<td><button type="button" class="wk-cal-day${d === S.day ? " is-sel" : ""}${d === today ? " is-today" : ""}${who.length ? " has-log" : ""}" data-wk-day="${d}" title="${esc(who.join(", "))}">${Number(d.slice(8))}${who.length ? `<i>${who.length}</i>` : ""}</button></td>`;
      }).join("")}</tr>`).join("")}</tbody></table>
      <p class="wk-hint">점 = 저장한 직원 수 · 날짜를 누르면 그 날 업무</p>`;
  }

  function lineRow(it, name, sec) {
    return `<div class="wk-line" draggable="true" data-line="${esc(it.id)}" data-sec="${sec}" data-staff="${esc(name)}">
      <span class="wk-grip" title="끌어서 오전·오후로 옮기기">⠿</span>
      <input class="wk-line-text" data-line-text value="${esc(it.text)}" aria-label="업무">
      <input class="wk-min" type="number" min="0" max="1440" step="5" data-line-min value="${it.min || ""}" aria-label="분"><span class="wk-unit">분</span>
      <button type="button" class="wk-del" data-line-del>삭제</button></div>`;
  }

  function slotHtml(name, i) {
    const options = [...new Set([...S.staff, ...S.slots.filter(Boolean)])].sort((a, b) => a.localeCompare(b, "ko"));
    const head = `<div class="wk-slot-head">
      <select data-slot-staff aria-label="직원"><option value="">이름을 넣어주세요</option>${options.map((n) => `<option${n === name ? " selected" : ""}>${esc(n)}</option>`).join("")}<option value="__new">+ 이름 등록하기</option></select>
      <span class="wk-slot-tools">${name ? `<button type="button" data-slot-hist>내역</button>` : ""}${S.slots.length > 1 ? `<button type="button" data-slot-close title="이 슬롯 닫기">✕</button>` : ""}</span></div>`;
    if (!name) return `<section class="wk-slot is-empty" data-slot="${i}">${head}<div class="wk-empty">위에서 이름을 고르거나 + 이름 등록하기로 넣어 주세요</div></section>`;
    const tpl = normalizeItems(S.templates[name]);
    const editing = !!S.editTpl[name];
    const checked = S.checked[name] || new Set();
    const d = dayOf(name);
    const am = d.am || [], pm = d.pm || [];
    return `<section class="wk-slot" data-slot="${i}" data-staff="${esc(name)}">${head}
      <div class="wk-tpl">
        <div class="wk-sub"><b>자주 하는 업무</b><span>날이 바뀌어도 그대로</span><button type="button" data-tpl-edit>${editing ? "편집 끝" : "편집"}</button></div>
        <div class="wk-tpl-list">${tpl.length ? tpl.map((t) => editing
          ? `<div class="wk-tpl-row is-edit" data-tpl="${esc(t.id)}"><input data-tpl-text value="${esc(t.text)}"><input class="wk-min" type="number" min="0" step="5" data-tpl-min value="${t.min || ""}"><span class="wk-unit">분</span><button type="button" class="wk-del" data-tpl-del>✕</button></div>`
          : `<label class="wk-tpl-row" data-tpl="${esc(t.id)}"><input type="checkbox" data-tpl-chk${checked.has(t.id) ? " checked" : ""}><span class="wk-tpl-text">${esc(t.text)}</span><span class="wk-tpl-min">${t.min ? `${t.min}분` : ""}</span></label>`).join("")
          : `<div class="wk-empty sm">아래 칸에 자주 하는 업무와 예상 시간을 넣어 주세요</div>`}</div>
        <div class="wk-add"><input data-tpl-new placeholder="자주 하는 업무 추가"><input class="wk-min" type="number" min="0" step="5" data-tpl-newmin placeholder="분"><button type="button" data-tpl-add>추가</button></div>
        <button type="button" class="wk-copy" data-tpl-copy ${checked.size ? "" : "disabled"}>⬇ 복사 (${checked.size})</button>
      </div>
      <div class="wk-day">
        <div class="wk-sub"><b>${esc(dayLabel(S.day))} 업무</b><span>합계 ${fmtMin(sumMin(am) + sumMin(pm))}</span></div>
        <div class="wk-sec" data-drop="am"><div class="wk-sec-title">오전 <span>${fmtMin(sumMin(am))}</span></div>${am.map((it) => lineRow(it, name, "am")).join("") || `<div class="wk-drop-hint">여기로 끌어 놓기</div>`}</div>
        <div class="wk-divider" data-drop="pm"><span>오후</span></div>
        <div class="wk-sec" data-drop="pm"><div class="wk-sec-title">오후 <span>${fmtMin(sumMin(pm))}</span></div>${pm.map((it) => lineRow(it, name, "pm")).join("") || `<div class="wk-drop-hint">여기로 끌어 놓기</div>`}</div>
        <div class="wk-add"><input data-own-text placeholder="직접 쓰기 (오늘만)"><input class="wk-min" type="number" min="0" step="5" data-own-min placeholder="분"><button type="button" data-own-add>추가</button></div>
        <textarea data-memo rows="3" placeholder="메모">${esc(d.memo)}</textarea>
      </div>
      <div class="wk-foot"><span class="wk-saved">${d.dirty ? "⚠ 저장 안 됨" : S.days[name]?.savedAt ? `저장됨 ${esc(String(S.days[name].savedAt).slice(11, 16) || S.days[name].savedAt)}` : "아직 저장 안 함"}</span><button type="button" class="wk-save" data-slot-save>저장</button></div>
    </section>`;
  }

  function renderSlots() {
    const box = $("[data-wk-slots]", root);
    box.innerHTML = S.slots.map((n, i) => slotHtml(n, i)).join("");
    $("[data-wk-addslot]", root).disabled = S.slots.length >= WORK_SLOT_MAX;
    $("[data-wk-addslot]", root).textContent = `＋ 슬롯 (${S.slots.length}/${WORK_SLOT_MAX})`;
  }
  // 달력 옆 공지사항 = 맨 위 공지(롤링)와 같은 내용 — pickingNoticeBoot 가 내놓은 window.SystemV3Notice 로 읽고 저장
  const noticeApi = () => window.SystemV3Notice || null;
  function bindNotice() {
    const api = noticeApi();
    if (!api || S.noticeBound) return;
    S.noticeBound = true;
    api.subscribe((n) => { S.notice = { text: n.text || "", savedAt: n.updatedAt || "", editor: n.editor || "" }; renderNotice(); });
  }
  window.addEventListener?.("system-v3-notice-ready", bindNotice);
  function renderNotice() {
    const ta = $("[data-wk-notice-text]", root);
    if (ta && !S.noticeDirty && document.activeElement !== ta) ta.value = S.notice.text || "";
    const meta = $("[data-wk-notice-meta]", root);
    const when = (() => { const d = new Date(S.notice.savedAt); if (Number.isNaN(d.getTime())) return String(S.notice.savedAt || "").slice(5, 16); const k = new Date(d.getTime() + 9 * 3600000).toISOString(); return `${k.slice(5, 10)} ${k.slice(11, 16)}`; })();
    if (meta) meta.textContent = S.noticeDirty ? "⚠ 저장 안 됨" : S.notice.savedAt ? `${when}${S.notice.editor ? ` · ${S.notice.editor}` : ""} · 한 줄 = 메시지 하나 (위 칸에서 3초마다 넘어감)` : "한 줄 = 메시지 하나 (위 칸에서 3초마다 넘어감)";
  }
  function render() {
    $("[data-wk-date]", root).value = S.day;
    renderCalendar();
    renderNotice();
    renderSlots();
  }
  async function saveNotice() {
    const text = $("[data-wk-notice-text]", root)?.value || "";
    const api = noticeApi();
    if (!api) { say("공지 칸을 아직 불러오는 중입니다 — 잠시 뒤 다시 눌러 주세요", true); return; }
    say("공지 저장 중…");
    const r = await api.saveText(text);
    if (r.ok) { S.noticeDirty = false; say("공지를 저장했습니다 — 위 칸에 바로 보입니다"); }
    else { if (r.conflict) S.noticeDirty = false; say(r.error || "공지를 저장하지 못했습니다", true); }
    renderNotice();
  }

  // ---- 불러오기·저장 ----
  async function load(day = S.day) {
    S.day = day; S.month = day; S.drafts = {}; S.checked = {};
    say("불러오는 중…");
    try {
      const j = await call("workLoad", { day });
      S.staff = j.staff || []; S.templates = j.templates || {}; S.days = j.days || {}; S.calendar = j.calendar || {};
      S.loaded = true;
      say(`${dayLabel(day)} · 저장한 직원 ${Object.keys(S.days).length}명`);
    } catch (e) { say(e.message || String(e), true); }
    render();
  }
  async function loadMonth() {
    try { const j = await call("workLoad", { day: S.month }); S.calendar = j.calendar || {}; } catch (e) { say(e.message || String(e), true); }
    renderCalendar();
  }
  async function saveDay(name) {
    const d = dayOf(name);
    say(`${name} 저장 중…`);
    try {
      const j = await call("workSave", { staff: name, day: S.day, am: d.am, pm: d.pm, memo: d.memo });
      S.days[name] = { am: d.am, pm: d.pm, memo: d.memo, savedAt: j.savedAt };
      setDay(name, d, false);
      if (S.day.slice(0, 7) === S.month.slice(0, 7)) { const who = new Set(S.calendar[S.day] || []); who.add(name); S.calendar[S.day] = [...who]; }
      if (!S.staff.includes(name)) S.staff.push(name);
      say(`${name} · ${dayLabel(S.day)} 저장했습니다`);
    } catch (e) { say(e.message || String(e), true); }
    render();
  }
  async function saveTemplate(name, items) {
    S.templates[name] = items;
    renderSlots();
    try { await call("workTemplate", { staff: name, items }); if (!S.staff.includes(name)) S.staff.push(name); say(`${name} · 자주 하는 업무 저장`); }
    catch (e) { say(e.message || String(e), true); }
  }

  // ---- 내역 (직원별 업무 내역 · 평균 시간 · 메모) ----
  async function showHistory(name) {
    const dlg = $("#wk-hist");
    $("[data-hist-title]", dlg).textContent = `${name} · 업무 내역`;
    const body = $("[data-hist-body]", dlg);
    body.innerHTML = `<div class="wk-empty">불러오는 중…</div>`;
    dlg.hidden = false;
    try {
      const j = await call("workHistory", { staff: name, days: 90 });
      const st = historyStats(j.items);
      body.innerHTML = !st.days ? `<div class="wk-empty">저장한 날이 아직 없습니다</div>` : `
        <div class="wk-hsum"><span>저장한 날 <b>${st.days}</b>일</span><span>하루 평균 <b>${fmtMin(st.avgTotal)}</b></span></div>
        <h4>업무별 평균 시간</h4>
        <table class="wk-htable"><thead><tr><th>업무</th><th>한 날</th><th>평균</th></tr></thead><tbody>${st.tasks.map((t) => `<tr><td>${esc(t.text)}</td><td>${t.count}일</td><td>${t.avgMin ? fmtMin(t.avgMin) : "-"}</td></tr>`).join("")}</tbody></table>
        <h4>날짜별</h4>
        <table class="wk-htable"><thead><tr><th>날짜</th><th>업무 수</th><th>합계</th></tr></thead><tbody>${st.perDay.map((d) => `<tr><td><button type="button" class="wk-link" data-hist-day="${d.day}">${esc(dayLabel(d.day))}</button></td><td>${d.count}</td><td>${fmtMin(d.total)}</td></tr>`).join("")}</tbody></table>
        ${st.memos.length ? `<h4>메모</h4>${st.memos.map((m) => `<div class="wk-hmemo"><b>${esc(dayLabel(m.day))}</b> ${esc(m.memo)}</div>`).join("")}` : ""}`;
    } catch (e) { body.innerHTML = `<div class="wk-empty is-bad">${esc(e.message || e)}</div>`; }
  }

  // ---- 이벤트 ----
  const slotOf = (el) => el.closest("[data-slot]");
  const nameOf = (el) => slotOf(el)?.dataset.staff || "";
  function updateLine(el) {
    const line = el.closest("[data-line]"); const name = line.dataset.staff; const d = dayOf(name);
    const patch = (list) => list.map((it) => (it.id === line.dataset.line ? { ...it, text: $("[data-line-text]", line).value.trim() || it.text, min: cleanMin($("[data-line-min]", line).value) } : it));
    setDay(name, { ...d, am: patch(d.am), pm: patch(d.pm) });
  }

  root.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("[data-wk-mon]")) { S.month = monthShift(S.month, Number(t.closest("[data-wk-mon]").dataset.wkMon)); loadMonth(); return; }
    if (t.closest("[data-wk-day]")) { load(t.closest("[data-wk-day]").dataset.wkDay); return; }
    if (t.closest("[data-wk-today]")) { load(kstDay()); return; }
    if (t.closest("[data-wk-step]")) { load(addDays(S.day, Number(t.closest("[data-wk-step]").dataset.wkStep))); return; }
    if (t.closest("[data-wk-notice-save]")) { saveNotice(); return; }
    if (t.closest("[data-wk-addslot]")) { if (S.slots.length < WORK_SLOT_MAX) { S.slots.push(""); writeSlots(store, S.slots); renderSlots(); } return; }
    const slot = slotOf(t); if (!slot) return;
    const idx = Number(slot.dataset.slot), name = nameOf(t);
    if (t.closest("[data-slot-close]")) { S.slots.splice(idx, 1); writeSlots(store, S.slots); renderSlots(); return; }
    if (t.closest("[data-slot-hist]")) { showHistory(name); return; }
    if (t.closest("[data-slot-save]")) { saveDay(name); return; }
    if (t.closest("[data-tpl-edit]")) { S.editTpl[name] = !S.editTpl[name]; renderSlots(); return; }
    if (t.closest("[data-tpl-del]")) { const id = t.closest("[data-tpl]").dataset.tpl; saveTemplate(name, normalizeItems(S.templates[name]).filter((x) => x.id !== id)); return; }
    if (t.closest("[data-tpl-add]")) {
      const text = $("[data-tpl-new]", slot).value.trim(); if (!text) return;
      saveTemplate(name, [...normalizeItems(S.templates[name]), { id: newId(), text, min: cleanMin($("[data-tpl-newmin]", slot).value) }]); return;
    }
    if (t.closest("[data-tpl-copy]")) {
      const add = copyChecked(S.templates[name], [...(S.checked[name] || [])]);
      if (!add.length) return;
      const d = dayOf(name), sec = kstHour() < 13 ? "am" : "pm";
      setDay(name, { ...d, [sec]: [...d[sec], ...add] });
      S.checked[name] = new Set();
      renderSlots(); say(`${add.length}개 복사 → ${sec === "am" ? "오전" : "오후"} (끌어서 옮길 수 있음)`); return;
    }
    if (t.closest("[data-own-add]")) {
      const text = $("[data-own-text]", slot).value.trim(); if (!text) return;
      const d = dayOf(name), sec = kstHour() < 13 ? "am" : "pm";
      setDay(name, { ...d, [sec]: [...d[sec], { id: newId(), text, min: cleanMin($("[data-own-min]", slot).value) }] });
      renderSlots(); return;
    }
    if (t.closest("[data-line-del]")) {
      const id = t.closest("[data-line]").dataset.line, d = dayOf(name);
      setDay(name, { ...d, am: d.am.filter((x) => x.id !== id), pm: d.pm.filter((x) => x.id !== id) });
      renderSlots(); return;
    }
  });
  root.addEventListener("change", (e) => {
    const t = e.target;
    if (t.matches("[data-wk-date]")) { if (t.value) load(t.value); return; }
    const slot = slotOf(t); if (!slot) return;
    const idx = Number(slot.dataset.slot), name = nameOf(t);
    if (t.matches("[data-slot-staff]")) {
      let v = t.value;
      if (v === "__new") {
        v = (window.prompt?.("등록할 이름") || "").trim().slice(0, 30);
        if (!v) { renderSlots(); return; }
      }
      S.slots[idx] = v; writeSlots(store, S.slots); renderSlots(); return;
    }
    if (t.matches("[data-tpl-chk]")) {
      const set = S.checked[name] || (S.checked[name] = new Set()); const id = t.closest("[data-tpl]").dataset.tpl;
      t.checked ? set.add(id) : set.delete(id);
      const b = $("[data-tpl-copy]", slot); b.disabled = !set.size; b.textContent = `⬇ 복사 (${set.size})`; return;
    }
    if (t.matches("[data-tpl-text], [data-tpl-min]")) {
      const row = t.closest("[data-tpl]");
      saveTemplate(name, normalizeItems(S.templates[name]).map((x) => (x.id === row.dataset.tpl ? { ...x, text: $("[data-tpl-text]", row).value.trim() || x.text, min: cleanMin($("[data-tpl-min]", row).value) } : x))); return;
    }
    if (t.matches("[data-line-text], [data-line-min]")) { updateLine(t); renderSlots(); return; }
  });
  root.addEventListener("input", (e) => {
    const t = e.target;
    if (t.matches("[data-wk-notice-text]")) { S.noticeDirty = true; renderNotice(); return; }
    if (t.matches("[data-memo]")) { const name = nameOf(t); setDay(name, { ...dayOf(name), memo: t.value }); const s = $(".wk-saved", slotOf(t)); if (s) s.textContent = "⚠ 저장 안 됨"; }
  });
  root.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    const t = e.target;
    if (t.matches("[data-tpl-new], [data-tpl-newmin]")) { e.preventDefault(); $("[data-tpl-add]", slotOf(t)).click(); }
    if (t.matches("[data-own-text], [data-own-min]")) { e.preventDefault(); $("[data-own-add]", slotOf(t)).click(); }
  });

  // 끌어서 오전·오후로 옮기기 (같은 슬롯 안에서)
  let drag = null;
  root.addEventListener("dragstart", (e) => {
    const line = e.target.closest?.("[data-line]");
    if (!line || e.target.matches?.("input")) return;
    drag = { id: line.dataset.line, staff: line.dataset.staff };
    line.classList.add("is-drag");
    try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", drag.id); } catch {}
  });
  root.addEventListener("dragend", () => { drag = null; root.querySelectorAll(".is-drag, .is-over").forEach((el) => el.classList.remove("is-drag", "is-over")); });
  root.addEventListener("dragover", (e) => {
    const zone = e.target.closest?.("[data-drop]");
    if (!drag || !zone || nameOf(zone) !== drag.staff) return;
    e.preventDefault();
    root.querySelectorAll(".is-over").forEach((el) => el.classList.remove("is-over"));
    zone.classList.add("is-over");
  });
  root.addEventListener("drop", (e) => {
    const zone = e.target.closest?.("[data-drop]");
    if (!drag || !zone || nameOf(zone) !== drag.staff) return;
    e.preventDefault();
    const before = e.target.closest?.("[data-line]");
    const d = dayOf(drag.staff);
    setDay(drag.staff, moveLine(d, drag.id, zone.dataset.drop, before && before.dataset.line !== drag.id ? before.dataset.line : null));
    drag = null;
    renderSlots();
  });

  const hist = $("#wk-hist");
  hist?.addEventListener("click", (e) => {
    if (e.target === hist || e.target.closest("[data-hist-close]")) { hist.hidden = true; return; }
    const d = e.target.closest("[data-hist-day]");
    if (d) { hist.hidden = true; load(d.dataset.histDay); }
  });

  // 날이 바뀌면(자정) 오늘 업무로 — 자주 하는 업무는 그대로
  let lastToday = kstDay();
  window.setInterval?.(() => { const t = kstDay(); if (t !== lastToday) { const follow = S.day === lastToday; lastToday = t; if (follow) load(t); } }, 60000);

  render();
  bindNotice();
  load();
  return { load, state: S };
}

// 사이드 메뉴
export function mountWorkTabs({ document } = {}) {
  const tabs = [...document.querySelectorAll("[data-work-tab]")];
  const panels = [...document.querySelectorAll("[data-work-panel]")];
  const show = (key) => {
    tabs.forEach((b) => { const on = b.dataset.workTab === key; b.classList.toggle("active", on); on ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"); });
    panels.forEach((p) => { p.hidden = p.dataset.workPanel !== key; });
  };
  tabs.forEach((b) => b.addEventListener("click", () => show(b.dataset.workTab)));
  const toggle = document.getElementById("work-sidebar-toggle");
  toggle?.addEventListener("click", () => {
    const shell = document.getElementById("work-main");
    const closed = shell.classList.toggle("sidebar-collapsed");
    document.getElementById("work-sidebar")?.classList.toggle("collapsed", closed);
    toggle.textContent = closed ? "▶" : "◀";
    toggle.setAttribute("aria-expanded", String(!closed));
  });
  return { show };
}
