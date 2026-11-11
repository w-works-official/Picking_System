// ★ 공지 메모장 (2026-11-11 사장님 요청) — 피킹시스템 맨 위 줄
//  · 칸에는 맨 아래 3줄만 보임 (★ 표시) · 누르면 창이 열려 위쪽 메모까지 다 보고 고침
//  · 여러 PC가 같이 봄: CS 시트 '공지' 탭 (noticeGet · noticeSave, 시트 v27) — 이 PC 에서 CS 관리 웹 연결(비밀번호)을 해 둔 경우
//  · 먼저 고친 사람이 있으면 덮어쓰지 않음 (버전) · [저장] 또는 Ctrl+Enter · 닫을 때 고친 게 있으면 저장
//  · 1분마다 새 내용 확인 (창이 열려 있을 땐 안 함)
import { CS_BOARD_ENDPOINT, CS_BOARD_STORAGE_KEY, isCsBoardTokenValid } from "../domain/csBoard.mjs?v=20261105-point1";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const NOTICE_REFRESH_MS = 60000;

// 맨 아래 n줄 (끝의 빈 줄은 빼고)
export function tailLines(text = "", n = 3) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").replace(/\s+$/, "").split("\n");
  if (lines.length === 1 && !lines[0]) return [];
  return lines.slice(-n);
}
const kst = (iso) => { const d = new Date(iso); if (Number.isNaN(d.getTime())) return ""; const k = new Date(d.getTime() + 9 * 3600000).toISOString(); return `${k.slice(5, 10)} ${k.slice(11, 16)}`; };

export function mountNotice({ document, window, host, storages = [], fetchImpl = (...a) => window.fetch(...a) } = {}) {
  if (!host) return null;
  const st = { text: "", version: 0, editor: "", updatedAt: "", loaded: false, error: "", open: false, saving: false, timer: 0 };
  const cred = () => {
    for (const s of storages) {
      try { const raw = JSON.parse(s?.getItem?.(CS_BOARD_STORAGE_KEY) || "null"); if (raw && isCsBoardTokenValid(raw.token)) return { token: String(raw.token).trim(), editor: String(raw.editor || "").slice(0, 20) }; } catch { /* 다음 */ }
    }
    return null;
  };
  async function post(body) {
    const c = cred();
    if (!c) throw new Error("no-token");
    const res = await fetchImpl(CS_BOARD_ENDPOINT, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ ...body, token: c.token, editor: c.editor }) });
    if (!res.ok) throw new Error(`시트 응답 오류 (${res.status})`);
    const js = await res.json();
    if (!js?.ok) { const e = new Error(String(js?.error || "시트가 거절했습니다")); e.conflict = !!js?.conflict; e.notice = js?.notice; throw e; }
    return js;
  }
  const take = (n = {}) => Object.assign(st, { text: String(n.text || ""), version: Number(n.version) || 0, editor: String(n.editor || ""), updatedAt: String(n.updatedAt || "") });

  host.innerHTML = `<button type="button" class="pk-notice-box" data-notice-open title="공지 메모 — 누르면 전체 보기 · 고치기"><b class="pk-notice-star" aria-hidden="true">★</b><span class="pk-notice-lines" data-notice-lines></span></button>`;
  const modal = document.createElement("div");
  modal.className = "pk-notice-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="pk-notice-dialog" role="dialog" aria-modal="true" aria-label="공지 메모">
      <header><b>★</b><small data-notice-meta></small><button type="button" class="pk-notice-x" data-notice-close aria-label="닫기">×</button></header>
      <textarea data-notice-text spellcheck="false" placeholder="공지 · 메모를 적으세요 (맨 아래 3줄이 위 칸에 보입니다)"></textarea>
      <footer><small data-notice-msg></small><button type="button" class="pk-notice-btn" data-notice-close>닫기</button><button type="button" class="pk-notice-btn is-primary" data-notice-save>저장</button></footer>
    </div>`;
  document.body.appendChild(modal);
  const $ = (s) => modal.querySelector(s);
  const ta = $("[data-notice-text]");
  const msg = (t, bad = false) => { const el = $("[data-notice-msg]"); el.textContent = t; el.classList.toggle("is-bad", bad); };

  function paint() {
    const box = host.querySelector("[data-notice-lines]");
    const lines = tailLines(st.text, 3);
    if (!cred()) { box.innerHTML = `<span class="is-dim">CS 관리에서 웹 연결한 PC에서 보입니다</span>`; return; }
    if (st.error && !st.loaded) { box.innerHTML = `<span class="is-dim">${esc(st.error)}</span>`; return; }
    box.innerHTML = lines.length ? lines.map((l) => `<span>${esc(l) || "&nbsp;"}</span>`).join("") : `<span class="is-dim">${st.loaded ? "(비어 있음 — 눌러서 쓰기)" : "불러오는 중…"}</span>`;
  }
  const meta = () => { $("[data-notice-meta]").textContent = st.editor ? `${st.editor} · ${kst(st.updatedAt)}` : ""; };
  async function load() {
    if (!cred() || st.open) { paint(); return; }
    try { take((await post({ action: "noticeGet" })).notice); st.loaded = true; st.error = ""; }
    catch (e) { st.error = /알 수 없는 요청/.test(e?.message || "") ? "시트 v27 배포 뒤에 보입니다" : `공지를 못 읽음: ${e?.message || e}`; }
    paint();
  }
  async function save() {
    if (st.saving) return false;
    if (!cred()) { msg("이 PC는 CS 관리 웹 연결이 안 되어 있어 저장할 수 없습니다", true); return false; }
    st.saving = true; msg("저장 중…");
    try {
      take((await post({ action: "noticeSave", text: ta.value, base: st.version })).notice);
      st.loaded = true; meta(); paint(); msg("저장됨");
      return true;
    } catch (e) {
      if (e.conflict) { take(e.notice || {}); msg("⚠ 다른 사람이 먼저 고쳤습니다 — 새 내용을 불러왔습니다. 다시 고쳐 저장해 주세요.", true); ta.value = st.text; meta(); paint(); }
      else msg(`⚠ 저장 못 함: ${e?.message || e}`, true);
      return false;
    } finally { st.saving = false; }
  }
  async function openModal() {
    st.open = false; await load();
    st.open = true;
    ta.value = st.text; meta(); msg(cred() ? "" : "이 PC는 CS 관리 웹 연결이 안 되어 있어 볼 수 · 저장할 수 없습니다", !cred());
    modal.hidden = false;
    ta.focus();
    ta.scrollTop = ta.scrollHeight;               // 맨 아래(최근)부터 · 위로 올리면 앞 메모
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }
  async function closeModal() {
    if (ta.value !== st.text && cred()) { const ok = await save(); if (!ok) return; }   // 고친 게 있으면 저장하고 닫음
    modal.hidden = true; st.open = false; paint();
  }
  host.addEventListener("click", (e) => { if (e.target.closest("[data-notice-open]")) openModal(); });
  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target.closest("[data-notice-close]")) closeModal();
    else if (e.target.closest("[data-notice-save]")) save();
  });
  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); closeModal(); }
    else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
  });
  st.timer = window.setInterval(() => { if (!document.hidden) load(); }, NOTICE_REFRESH_MS);
  paint(); load();
  return { load, save, open: openModal, close: closeModal, state: st };
}
