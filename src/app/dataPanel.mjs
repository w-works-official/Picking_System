// 피킹시스템 › 사이드바 [데이터] (2026-11-24)
//  · 📉 미송 추이: 날짜별 미송 처리 건수 · 미송 비율(미송 처리 ÷ 피킹 완료) · 주별 합계
//  · DB 함수 picking_shortage_trend(p_from, p_to) — 피킹 기록 읽기만
import { normalizeTrendRows, weeklyTrend, shortageRate, dayLabel, kstToday, addDays } from "../domain/shortageTrend.mjs?v=20261124-data1";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (v) => (v == null ? "-" : `${v.toFixed(1)}%`);

export function mountDataPanel({ root, db } = {}) {
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
  return { load };
}
