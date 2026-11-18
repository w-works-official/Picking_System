// 🔍 CS 관리 › ⚙ 설정 › 🖥 마스터 PC 설정 › 오늘 검품 리포트 (2026-11-18)
//  · 컴퓨터별 검품 건수 = 피킹시스템 검품 화면에서 송장번호로 조회한 송장 수 (같은 날 · 같은 컴퓨터 · 같은 송장 1건)
//  · 총 발송건 = 주문 목록에서 빠져나간(출고) 송장 · 검색 누락 = 그중 어느 컴퓨터에서도 조회 안 한 송장
//  · 피킹 DB 함수 inspection_report · inspection_pc_rename (피킹시스템 로그인 세션으로 읽음)
import { pcLabel, summarizeInspection, hhmm } from "../domain/inspectionReport.mjs?v=20261118-insp1";

const PICK_URL = "https://vgxocngpykhlkosiaeew.supabase.co";
const PICK_KEY = "sb_publishable_XVnKGJo66GZiYTq5Ivu8dA_SjBVvX0g";
const PICK_SESSION_KEY = "system-v3-picking-session-v1";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const kstToday = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

export function mountInspectionReport({ document, window, root, storages = [], fetchImpl = (...a) => window.fetch(...a) } = {}) {
  if (!root) return null;
  let day = kstToday();
  let showList = false;
  root.innerHTML = `
    <div class="cs-insp">
      <div class="cs-row">
        <input type="date" data-insp-day value="${day}" class="cs-input cs-insp-day">
        <button type="button" class="cs-btn cs-btn-mini" data-insp-reload>⟳ 새로고침</button>
        <span class="cs-note" data-insp-state></span>
      </div>
      <div data-insp-body></div>
      <p class="cs-note">검품 건수 = 피킹시스템 <b>검품 화면에서 송장번호로 조회(스캔·검색)</b>한 송장 수. 같은 날 같은 컴퓨터가 같은 송장을 여러 번 조회해도 1건입니다.
      컴퓨터 번호는 그 PC에서 처음 조회할 때 자동으로 정해지고(검품 화면 검색칸 옆에 표시), 이름은 아래 칸에 적으면 저장됩니다.
      총 발송건은 주문 목록에서 빠져나간(출고된) 송장 수 — 10분 간격으로 확인하고, 2026-11-18 오후부터 기록합니다.</p>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const say = (t) => { const el = $("[data-insp-state]"); if (el) el.textContent = t; };

  function session() {
    for (const s of storages) {
      try { const v = JSON.parse(s?.getItem(PICK_SESSION_KEY) || "null"); if (v?.token && !(Date.parse(v.expiresAt) <= Date.now())) return v; } catch { /* 다음 */ }
    }
    return null;
  }
  async function rpc(name, body) {
    const ses = session();
    if (!ses) throw new Error("피킹시스템 로그인이 필요합니다 — 이 크롬에서 피킹시스템에 로그인한 뒤 다시 열어 주세요");
    const res = await fetchImpl(`${PICK_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: PICK_KEY, Authorization: `Bearer ${PICK_KEY}`, "x-picking-session": ses.token, "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) throw new Error("피킹 로그인이 만료됐습니다 — 피킹시스템에서 다시 로그인해 주세요");
    if (!res.ok) throw new Error(`검품 리포트를 못 읽음 (${res.status})`);
    return res.json();
  }

  function render(s) {
    const rows = s.pcs.length
      ? s.pcs.map((p) => `<tr><td><b>컴퓨터${p.pc}</b></td><td><input class="cs-input cs-insp-name" data-insp-name="${p.pc}" value="${esc(p.name)}" placeholder="이름 (예: 검품대 왼쪽)" maxlength="20"></td><td class="cs-insp-n">${p.count}건</td></tr>`).join("")
      : `<tr><td colspan="3" class="cs-note">아직 조회한 컴퓨터가 없습니다.</td></tr>`;
    const list = s.missingList.length
      ? `<button type="button" class="cs-btn cs-btn-mini" data-insp-list>${showList ? "▲ 누락 송장 접기" : `▼ 누락 송장 ${s.missingList.length}건 보기`}</button>
         ${showList ? `<ol class="cs-insp-miss">${s.missingList.map((m) => `<li><code>${esc(m.invoice)}</code> <span class="cs-note">주문 ${esc(m.order)} · ${esc(hhmm(m.at))} 출고</span></li>`).join("")}</ol>` : ""}`
      : "";
    $("[data-insp-body]").innerHTML = `
      <table class="cs-insp-table"><tbody>${rows}</tbody></table>
      <div class="cs-insp-sum">
        <span>조회 송장 <b>${s.looked}</b>건${s.sum !== s.looked ? ` <small>(컴퓨터별 합 ${s.sum})</small>` : ""}</span>
        <span>총 발송 <b>${s.shipped}</b>건</span>
        <span class="${s.missing ? "is-bad" : "is-ok"}">검색 누락 <b>${s.missing}</b>건${s.shipped ? ` (${s.missingRate}%)` : ""}</span>
      </div>
      ${list}
      <p class="cs-note">아직 출고 전(목록에 남은) 송장 ${s.waiting}건은 발송·누락에 넣지 않았습니다.</p>`;
  }

  let last = null;
  async function load() {
    say("불러오는 중…");
    try {
      last = summarizeInspection(await rpc("inspection_report", { p_day: day }));
      render(last);
      say(`${day} 기준 · ${new Date().toTimeString().slice(0, 5)} 확인`);
    } catch (e) {
      $("[data-insp-body]").innerHTML = "";
      say(String(e?.message || e));
    }
  }

  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-insp-reload]")) load();
    if (e.target.closest("[data-insp-list]") && last) { showList = !showList; render(last); }
  });
  root.addEventListener("change", async (e) => {
    const d = e.target.closest("[data-insp-day]");
    if (d) { day = d.value || kstToday(); load(); return; }
    const n = e.target.closest("[data-insp-name]");
    if (n) {
      try { await rpc("inspection_pc_rename", { p_pc: Number(n.dataset.inspName), p_name: n.value }); say(`컴퓨터${n.dataset.inspName} 이름 저장 ✓ ${pcLabel(n.dataset.inspName, n.value)}`); }
      catch (err) { say(`이름 저장 실패: ${err?.message || err}`); }
    }
  });
  load();
  return { load };
}
