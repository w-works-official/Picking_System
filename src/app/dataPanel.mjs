// 피킹시스템 › 사이드바 [데이터] (2026-11-24)
//  · 📉 미송 추이: 날짜별 미송 처리 건수 · 미송 비율(미송 처리 ÷ 피킹 완료) · 주별 합계
//  · DB 함수 picking_shortage_trend(p_from, p_to) — 피킹 기록 읽기만
//  · 11-25 🗂 기록 보관함: CS 시트 '기록보관' 탭(평일 5일치) 검색 — 게시판 문의·리뷰 · 상담톡 · 메신저 · 거래처 회신
import { normalizeTrendRows, weeklyTrend, shortageRate, dayLabel, kstToday, addDays } from "../domain/shortageTrend.mjs?v=20261124-data1";
import { LOG_KINDS, normalizeLogResult, searchWords, highlightParts, snippet, kstStamp } from "../domain/logArchive.mjs?v=20261125-log1";
import { CS_BOARD_ENDPOINT, CS_BOARD_STORAGE_KEY, isCsBoardTokenValid } from "../domain/csBoard.mjs?v=20261125-log1";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (v) => (v == null ? "-" : `${v.toFixed(1)}%`);

export function mountDataPanel({ root, db, fetchImpl, storage } = {}) {
  if (!root) return null;
  const today = kstToday();
  let from = addDays(today, -41), to = today, rows = [], busy = false;
  root.innerHTML = `
    <div class="panel-head">
      <div>
        <h2>데이터</h2>
        <p>피킹 기록으로 본 작업 추이입니다. (읽기만)</p>
      </div>
    </div>
    <section class="dp-card">
      <div class="dp-head">
        <h3>📉 미송 추이</h3>
        <div class="dp-tools">
          <input type="date" class="dp-date" data-dp-from value="${from}">
          <span>~</span>
          <input type="date" class="dp-date" data-dp-to value="${to}">
          <button type="button" class="filter-chip" data-dp-range="13">최근 2주</button>
          <button type="button" class="filter-chip active" data-dp-range="41">최근 6주</button>
          <button type="button" class="filter-chip" data-dp-range="90">최근 3개월</button>
          <button type="button" class="btn" data-dp-load>조회</button>
          <span class="dp-state" data-dp-state></span>
        </div>
      </div>
      <div data-dp-body></div>
      <p class="dp-note">미송 처리 = 피킹 중 미송 표시를 새로 한 횟수(옵션 줄) · 미송 비율 = 미송 처리 ÷ 피킹 완료 체크 수 (체크를 풀었다 다시 하면 두 번 세므로 대략값) · 오늘은 아직 진행 중인 숫자입니다.</p>
    </section>
    <section class="dp-card" data-la>
      <div class="dp-head">
        <h3>🗂 기록 보관함 <small class="la-sub">평일 5일치</small></h3>
        <span class="dp-state" data-la-state></span>
      </div>
      <form class="la-search" data-la-form>
        <input type="search" class="la-q" data-la-q placeholder="검색 — 고객 이름 · 상품명 · 거래처 · 문의 내용 (띄어쓰기 = 모두 들어간 것)" autocomplete="off">
        <button type="submit" class="btn">검색</button>
      </form>
      <div class="la-kinds" data-la-kinds></div>
      <div class="la-list" data-la-list></div>
      <p class="dp-note">게시판 문의·리뷰(수집 때, 등록 완료되면 답변까지) · 상담톡(대화 전체) · 메신저(대화방 이름과 AI 답장 후보 — 대화창 그림은 남기지 않음) · 거래처 회신 판독 결과를 남깁니다. 오늘 포함 평일 5일보다 오래된 기록은 자동으로 지워집니다. (게시판 원본 'CS문의' 탭은 그대로)</p>
    </section>`;
  const $ = (s) => root.querySelector(s);
  const say = (t) => { const el = $("[data-dp-state]"); if (el) el.textContent = t; };

  function render() {
    const body = $("[data-dp-body]");
    if (!rows.length) { body.innerHTML = `<div class="workflow-empty">이 기간에는 기록이 없습니다.</div>`; return; }
    const weeks = weeklyTrend(rows);
    const maxC = Math.max(...rows.map((r) => r.created), 1);
    const total = rows.reduce((a, r) => ({ c: a.c + r.created, q: a.q + r.qty, p: a.p + r.picked }), { c: 0, q: 0, p: 0 });
    body.innerHTML = `
      <div class="dp-summary">
        <span>기간 미송 처리 <b>${total.c.toLocaleString()}</b>건 (수량 ${total.q.toLocaleString()}개)</span>
        <span>피킹 완료 <b>${total.p.toLocaleString()}</b>건</span>
        <span>평균 미송 비율 <b>${pct(shortageRate(total.c, total.p))}</b></span>
      </div>
      <div class="dp-grid">
        <div>
          <h4>주별 (월요일 시작)</h4>
          <table class="dp-table">
            <thead><tr><th>주</th><th>일수</th><th>미송 처리</th><th>피킹 완료</th><th>미송 비율</th></tr></thead>
            <tbody>${weeks.map((w, i) => {
              const prev = weeks[i - 1]?.rate;
              const up = prev != null && w.rate != null ? w.rate - prev : null;
              return `<tr><td>${esc(dayLabel(w.week))} 주</td><td>${w.days}</td><td>${w.created}</td><td>${w.picked}</td>
                <td class="${w.rate >= 15 ? "dp-hot" : ""}">${pct(w.rate)}${up == null ? "" : ` <small class="${up > 0 ? "dp-up" : "dp-down"}">${up > 0 ? "▲" : "▼"}${Math.abs(up).toFixed(1)}</small>`}</td></tr>`;
            }).join("")}</tbody>
          </table>
        </div>
        <div>
          <h4>일별</h4>
          <table class="dp-table dp-daily">
            <thead><tr><th>날짜</th><th>미송 처리</th><th></th><th>수량</th><th>고침</th><th>미송피킹 완료</th><th>피킹 완료</th><th>비율</th></tr></thead>
            <tbody>${rows.slice().reverse().map((r) => {
              const rate = shortageRate(r.created, r.picked);
              return `<tr class="${r.day === today ? "dp-today" : ""}"><td>${esc(dayLabel(r.day))}${r.day === today ? " <small>진행 중</small>" : ""}</td><td><b>${r.created}</b></td>
                <td class="dp-barcell"><span class="dp-bar" style="width:${Math.round((r.created / maxC) * 100)}%"></span></td>
                <td>${r.qty}</td><td>${r.changed}</td><td>${r.repicked}</td><td>${r.picked}</td><td class="${rate >= 15 ? "dp-hot" : ""}">${pct(rate)}</td></tr>`;
            }).join("")}</tbody>
          </table>
        </div>
      </div>`;
  }

  async function load() {
    if (busy) return;
    if (!db?.rpc) { say("DB 연결이 없습니다"); return; }
    if (from > to) [from, to] = [to, from];
    busy = true; say("불러오는 중…");
    try {
      const { data, error } = await db.rpc("picking_shortage_trend", { p_from: from, p_to: to });
      if (error) throw error;
      rows = normalizeTrendRows(data);
      render();
      say(`${dayLabel(from)} ~ ${dayLabel(to)} · ${rows.length}일`);
    } catch (e) {
      say(`불러오지 못함: ${e?.message || e}`);
    } finally {
      busy = false;
    }
  }

  root.addEventListener("click", (e) => {
    const r = e.target.closest("[data-dp-range]");
    if (r) {
      to = kstToday(); from = addDays(to, -Number(r.dataset.dpRange));
      $("[data-dp-from]").value = from; $("[data-dp-to]").value = to;
      root.querySelectorAll("[data-dp-range]").forEach((b) => b.classList.toggle("active", b === r));
      load(); return;
    }
    if (e.target.closest("[data-dp-load]")) load();
  });
  root.addEventListener("change", (e) => {
    if (e.target.closest("[data-dp-from]")) from = e.target.value || from;
    if (e.target.closest("[data-dp-to]")) to = e.target.value || to;
    if (e.target.closest(".dp-date")) { root.querySelectorAll("[data-dp-range]").forEach((b) => b.classList.remove("active")); load(); }
  });
  load();
  const archive = mountLogArchive({ root: root.querySelector("[data-la]"), fetchImpl, storage });
  return { load: () => { load(); archive?.search(); } };
}

// ---------- 🗂 기록 보관함 ----------
function csToken(storage) {
  try {
    const raw = JSON.parse((storage || window.localStorage).getItem(CS_BOARD_STORAGE_KEY) || "{}");
    return isCsBoardTokenValid(raw.token) ? String(raw.token).trim() : "";
  } catch { return ""; }
}
const mark = (text, words) => highlightParts(text, words).map((p) => (p.hit ? `<mark>${esc(p.text)}</mark>` : esc(p.text))).join("");

export function mountLogArchive({ root, fetchImpl, storage } = {}) {
  if (!root) return null;
  const $ = (s) => root.querySelector(s);
  const doFetch = fetchImpl || ((...a) => window.fetch(...a));
  let kind = "", q = "", res = null, open = new Set(), seq = 0, timer = 0;
  const say = (t) => { $("[data-la-state]").textContent = t; };

  function render() {
    const words = searchWords(q);
    const counts = res?.counts || {};
    const all = Object.values(counts).reduce((a, b) => a + b, 0);
    $("[data-la-kinds]").innerHTML = [["", "전체", all], ...LOG_KINDS.map((k) => [k, k, counts[k] || 0])]
      .map(([k, label, n]) => `<button type="button" class="filter-chip${kind === k ? " active" : ""}" data-la-kind="${esc(k)}">${esc(label)} <b>${n}</b></button>`).join("");
    const list = $("[data-la-list]");
    if (!res) { list.innerHTML = ""; return; }
    if (!res.items.length) { list.innerHTML = `<div class="workflow-empty">${q ? "찾는 기록이 없습니다." : "아직 남은 기록이 없습니다."}</div>`; return; }
    list.innerHTML = res.items.map((it) => {
      const isOpen = open.has(it.id);
      return `<article class="la-item${isOpen ? " is-open" : ""}" data-la-id="${esc(it.id)}">
        <div class="la-top"><span class="la-kind la-k-${LOG_KINDS.indexOf(it.kind)}">${esc(it.kind)}</span>
          <span class="la-plat">${mark(it.platform, words)}</span><b class="la-name">${mark(it.name, words)}</b>
          <time>${esc(kstStamp(it.at))}</time></div>
        ${isOpen ? `<div class="la-full">${mark(it.text, words)}</div>${it.answer ? `<div class="la-answer"><span>답변</span>${mark(it.answer, words)}</div>` : ""}`
          : `<div class="la-snip">${mark(snippet(it.text, words), words)}${it.answer ? ` <span class="la-has">답변 있음</span>` : ""}</div>`}
      </article>`;
    }).join("") + (res.matched > res.items.length ? `<div class="dp-note">최근 ${res.items.length}건만 보입니다 (전체 ${res.matched}건) — 검색어를 더 넣어 주세요.</div>` : "");
  }

  async function search() {
    const token = csToken(storage);
    if (!token) { res = null; render(); say("CS 관리 화면에서 비밀번호를 한 번 넣어 주세요 (이 기기에 저장된 CS 비밀번호로 읽습니다)"); return; }
    const my = ++seq;
    say("찾는 중…");
    try {
      const r = await doFetch(CS_BOARD_ENDPOINT, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "logSearch", token, q, kind }) });
      if (!r.ok) throw new Error(`시트 응답 오류 (${r.status})`);
      const json = await r.json();
      if (my !== seq) return;
      if (!json?.ok) throw new Error(json?.error || "시트가 요청을 거절했습니다");
      res = normalizeLogResult(json);
      render();
      say(`${res.cutoff ? kstStamp(res.cutoff).replace(/ 00:00$/, "") + " 부터 · " : ""}${q || kind ? `찾음 ${res.matched}건 / ` : ""}보관 ${res.total}건`);
    } catch (e) {
      if (my !== seq) return;
      say(`불러오지 못함: ${e?.message || e}`);
    }
  }

  root.addEventListener("submit", (e) => { if (e.target.closest("[data-la-form]")) { e.preventDefault(); q = $("[data-la-q]").value; open.clear(); search(); } });
  root.addEventListener("input", (e) => {
    if (!e.target.closest("[data-la-q]")) return;
    clearTimeout(timer);
    timer = setTimeout(() => { const v = $("[data-la-q]").value; if (v !== q) { q = v; open.clear(); search(); } }, 500);
  });
  root.addEventListener("click", (e) => {
    const k = e.target.closest("[data-la-kind]");
    if (k) { kind = k.dataset.laKind; open.clear(); search(); return; }
    const item = e.target.closest("[data-la-id]");
    if (item && !window.getSelection?.()?.toString()) { const id = item.dataset.laId; open.has(id) ? open.delete(id) : open.add(id); render(); }
  });
  render();
  search();
  return { search };
}
