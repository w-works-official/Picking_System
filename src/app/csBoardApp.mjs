// CS 관리 · CS 자동화 화면 (2026-10-29) — G1 CS 수집기 화면을 웹으로.
// 작동하는 것: 문의·리뷰 보기 · 답변안 A/B 고르기 · ⟳ 다른 안 보기 · 문안 고치기 · 보류 · 선택 해제 · 복사 ·
//              🤖 AI 추천(시트 Apps Script 경유) · 0.8초 자동 저장 · 🧪 가상셋팅 · 메신저 예시 칸 ·
//              수집기 PC에 요청(게시판·리뷰·테스트 수집, 📤 등록) · 요청 현황 · 업체별 마지막 수집 상태 · AI 사용량.
// 작동 안 하는 것(빨간 글씨, 누를 수 없음): 수집기 PC 앞에서만 되는 것(로그인·엑셀·폴더·API 키·설정) · 개발 예정.
import {
  CS_BOARD_ENDPOINT,
  CS_BOARD_FILTERS,
  CS_BOARD_SAVE_DELAY_MS,
  CS_BOARD_STORAGE_KEY,
  canCycleBox,
  collectorStatus,
  csAdminLink,
  csBoardSummary,
  csRegisterPayload,
  csRequestPayload,
  csSavePayload,
  csSavedLabel,
  csStatusOf,
  csSuggestPayload,
  csVendors,
  draftLabel,
  draftPool,
  draftText,
  filterCsRows,
  initialView,
  isCsBoardTokenValid,
  isCsRowLocked,
  isJobActive,
  nextDraftInView,
  normalizeCsRow,
  parseCsBoardResponse,
  pickedText,
  registerCandidates,
  sortCsRows,
  usageForMonth,
  withEdit,
  withHold,
  withPick,
} from "../domain/csBoard.mjs?v=20261029-cs-endpoint1";
import { CS_SAMPLE_BOARD_ROWS, CS_SAMPLE_MESSENGER, CS_SAMPLE_REVIEW_ROWS } from "../domain/csBoardSamples.mjs?v=20261029-cs-board1";

const VENDORS = ["스마트스토어", "지그재그", "에이블리", "메이크샵"];
const REVIEW_VENDORS = ["지그재그", "에이블리", "메이크샵"];
const VENDOR_KEY = "system_v3_cs_board_vendors";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clock(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function shortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "").slice(5, 16);
  return `${date.getMonth() + 1}/${date.getDate()} ${clock(date)}`;
}

function agoText(seconds) {
  if (!Number.isFinite(seconds)) return "신호 없음";
  if (seconds < 60) return `${seconds}초 전`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}분 전`;
  return `${Math.round(seconds / 3600)}시간 전`;
}

function readStored(storage) {
  try {
    const raw = JSON.parse(storage?.getItem(CS_BOARD_STORAGE_KEY) || "{}");
    return { token: isCsBoardTokenValid(raw.token) ? String(raw.token).trim() : "", editor: String(raw.editor || "").slice(0, 20) };
  } catch {
    return { token: "", editor: "" };
  }
}

function writeStored(storage, value) {
  try {
    if (!value.token && !value.editor) storage?.removeItem(CS_BOARD_STORAGE_KEY);
    else storage?.setItem(CS_BOARD_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // 저장 못 해도 이번 화면에서는 그대로 씀
  }
}

function readVendorSel(storage) {
  try {
    const raw = JSON.parse(storage?.getItem(VENDOR_KEY) || "{}");
    return {
      board: new Set(Array.isArray(raw.board) ? raw.board.filter((v) => VENDORS.includes(v)) : VENDORS),
      review: new Set(Array.isArray(raw.review) ? raw.review.filter((v) => REVIEW_VENDORS.includes(v)) : REVIEW_VENDORS),
    };
  } catch {
    return { board: new Set(VENDORS), review: new Set(REVIEW_VENDORS) };
  }
}

const REG_BADGE = {
  요청: { cls: "is-requested", text: "📤 등록 요청됨" },
  완료: { cls: "is-registered", text: "✅ 등록완료" },
  "확인 필요": { cls: "is-check", text: "⚠ 등록 확인 필요" },
  건너뜀: { cls: "is-skipped", text: "등록 건너뜀" },
};

// ---------- 카드 그리기 (게시판·리뷰 같이 씀) ----------
export function cardHtml(row, no, view, { readonly = false, sample = false, aiReady = false, suggesting = false, savedLabel = "" } = {}) {
  const key = escapeHtml(row.key);
  const pool = draftPool(row);
  const locked = !readonly && isCsRowLocked(row);
  const off = readonly || locked; // 누를 수 없음 (readonly = 빨간 미작동, locked = 등록 중·끝남)
  const red = readonly ? " is-pending" : "";
  const lock = off ? " disabled" : "";
  const pickBox = view.indexOf(row.choice.pick);
  const result = row.choice.hold ? "보류" : pickBox >= 0 ? `채택 ${"AB"[pickBox]}` : "미선택";
  const resultClass = row.choice.hold ? "is-held" : pickBox >= 0 ? "is-picked" : "";
  const meta = [row.board, row.id, shortDate(row.date), row.type].filter(Boolean).map(escapeHtml).join(" · ");
  const link = csAdminLink(row);
  const pending = (reason) => `class="cs-btn is-pending" disabled title="${escapeHtml(reason)}"`;
  const badge = row.reg && REG_BADGE[row.reg.state];

  const product = `
    <div class="cs-card-product">
      ${row.productImage
        ? `<img class="cs-card-photo" src="${escapeHtml(row.productImage)}" alt="상품 사진" loading="lazy" referrerpolicy="no-referrer">`
        : `<div class="cs-card-nophoto">상품 사진 없음</div>`}
      ${row.product ? (row.productLink
        ? `<a href="${escapeHtml(row.productLink)}" target="_blank" rel="noopener noreferrer">🔗 ${escapeHtml(row.product)}</a>`
        : `<span>${escapeHtml(row.product)}</span>`) : ""}
      ${row.option ? `<span>옵션: ${escapeHtml(row.option)}</span>` : ""}
    </div>`;

  const context = row.context.length ? `
      <details class="cs-context">
        <summary>이전 대화 ${row.context.length}건</summary>
        ${row.context.map((entry) => `
          <div class="cs-context-item">
            <b>${escapeHtml([entry.kind, entry.date].filter(Boolean).join(" · "))}</b>
            ${entry.question ? `\n고객: ${escapeHtml(entry.question)}` : ""}${entry.answer ? `\n우리: ${escapeHtml(entry.answer)}` : ""}
          </div>`).join("")}
      </details>` : "";

  const regNote = row.reg && row.reg.state !== "요청" && row.reg.note ? `<div class="cs-check-box">${escapeHtml(`${badge?.text || ""} — ${row.reg.note}`)}</div>` : "";
  const question = `
    <div class="cs-card-question">
      <div class="cs-question-text">${row.title ? `<span class="cs-question-title">${escapeHtml(row.title)}</span>` : ""}${escapeHtml(row.question || "(내용 없음)")}</div>
      ${row.photos.length ? `<div class="cs-photos">${row.photos.map((src) => `<a href="${escapeHtml(src)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(src)}" alt="고객 사진" loading="lazy" referrerpolicy="no-referrer"></a>`).join("")}</div>` : ""}
      ${row.check ? `<div class="cs-check-box">⚠ 확인 필요\n${escapeHtml(row.check)}</div>` : ""}
      ${regNote}
      ${context}
    </div>`;

  let aiButton;
  if (readonly) aiButton = `<button type="button" ${pending("시트 연결 후 작동합니다 (가상 예시)")}>🤖 AI 추천 더 받기</button>`;
  else if (locked) aiButton = "";
  else if (sample) aiButton = `<button type="button" ${pending("시트 연결 후 작동합니다 (가상 예시)")}>🤖 AI 추천 더 받기</button>`;
  else if (!aiReady) aiButton = `<button type="button" ${pending("시트 스크립트 속성에 CLAUDE_KEY 등록 후 작동")}>🤖 AI 추천 더 받기</button>`;
  else if (suggesting) aiButton = `<button type="button" class="cs-btn cs-btn-ai" disabled>🤖 받는 중… (3~7초)</button>`;
  else aiButton = `<button type="button" class="cs-btn cs-btn-ai" data-act="ai" data-key="${key}">🤖 AI 추천 ${row.drafts.length ? "더 받기" : "받기"}</button>`;

  let answers;
  if (!pool.length) {
    answers = `<div class="cs-answer-empty">추천 문안이 없습니다${off ? "" : " — 🤖 AI 추천을 받아 보세요"}</div>`;
  } else {
    const cycleOk = canCycleBox(row, view);
    answers = view.map((index, box) => {
      const edited = Object.hasOwn(row.choice.edits, index);
      const from = row.drafts[index]?.from === "AI" ? `<span class="cs-draft-from">AI</span>` : "";
      return `
      <div class="cs-answer-row">
        <button type="button" class="cs-pick${red}" data-act="pick" data-key="${key}" data-box="${box}" aria-pressed="${row.choice.pick === index}" title="이 문안 채택"${lock}>${"AB"[box]}</button>
        <textarea class="cs-answer-text${edited ? " is-edited" : ""}${red}" data-act="edit" data-key="${key}" data-index="${index}" rows="3" aria-label="답변 ${"AB"[box]} (${draftLabel(index)}안)"${off ? " readonly" : ""}>${escapeHtml(draftText(row, index))}</textarea>
        <div class="cs-answer-side">
          <button type="button" class="cs-cycle${red}" data-act="cycle" data-key="${key}" data-box="${box}"${!cycleOk || off ? " disabled" : ""}>⟳\n새로고침</button>
          <span class="cs-count">${pool.indexOf(index) + 1}/${pool.length}</span>
          ${from}
        </div>
      </div>`;
    }).join("");
  }

  const noReply = row.noReply ? `<span class="cs-note">답글 기능 없는 업체 — 목록 확인용</span>` : "";
  const foot = `
      <div class="cs-answer-foot">
        <label${readonly ? ' class="cs-pending-text"' : ""}><input type="checkbox" data-act="hold" data-key="${key}"${row.choice.hold ? " checked" : ""}${lock}> 보류 (이번에 답하지 않음)</label>
        <button type="button" class="cs-btn cs-btn-mini${red}" data-act="clear" data-key="${key}"${lock || (row.choice.pick < 0 ? " disabled" : "")}>선택 해제</button>
        <button type="button" class="cs-btn cs-btn-mini${red}" data-act="copy" data-key="${key}"${readonly || row.choice.pick < 0 ? " disabled" : ""} title="채택한 문안 복사 (지그재그·에이블리·메이크샵은 붙여넣어 직접 등록)">📋 복사</button>
        ${aiButton}
        ${noReply}
        <span class="cs-flex"></span>
        <span class="cs-note" data-saved-for="${key}">${escapeHtml(savedLabel)}</span>
      </div>`;

  return `
  <article class="cs-card ${resultClass}${locked ? " is-locked" : ""}" data-card="${key}">
    <header class="cs-card-head">
      <span class="cs-card-no">${no}</span>
      <span class="cs-vendor-chip" data-vendor="${escapeHtml(row.vendor)}">${escapeHtml(row.vendor || "업체?")}</span>
      <span class="cs-card-meta">${meta}</span>
      ${link ? `<a class="cs-btn cs-btn-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">바로가기</a>` : ""}
      ${badge ? `<span class="cs-reg-badge ${badge.cls}">${badge.text}</span>` : ""}
      <span class="cs-card-result ${resultClass}" data-result-for="${key}">${result}</span>
    </header>
    <div class="cs-card-body">
      ${product}
      ${question}
      <div class="cs-card-answers">${answers}${foot}</div>
    </div>
  </article>`;
}

// ---------- 메신저 예시 칸 ----------
export function slotHtml(slot, index) {
  const sugg = ["A", "B"].map((box) => {
    const at = slot.used[box];
    const text = slot.picks.length ? slot.picks[at % slot.picks.length] : "";
    return `
      <div class="cs-sugg">
        <p>${escapeHtml(text || "추천 없음")}</p>
        <div class="cs-sugg-bar">
          <button type="button" class="cs-btn cs-btn-mini" data-msn="paste" data-slot="${index}" data-box="${box}">⬆ 붙여넣기</button>
          <span class="cs-flex"></span>
          <span class="cs-count">${slot.picks.length ? (at % slot.picks.length) + 1 : 0}/${slot.picks.length}</span>
          <button type="button" class="cs-btn cs-btn-mini" data-msn="refresh" data-slot="${index}" data-box="${box}"${slot.picks.length > 1 ? "" : " disabled"}>↻ 새로고침</button>
        </div>
      </div>`;
  }).join("");
  const sub = slot.messenger !== slot.vendor ? `${slot.messenger} · ` : "";
  return `
  <div class="cs-slot" data-slot="${index}">
    <div class="cs-slot-head">
      <button type="button" class="cs-btn cs-btn-mini" data-msn="left" data-slot="${index}" title="왼쪽으로">◀</button>
      <button type="button" class="cs-btn cs-btn-mini" data-msn="right" data-slot="${index}" title="오른쪽으로">▶</button>
      <span class="cs-vendor-chip" data-vendor="${escapeHtml(slot.vendor)}">${escapeHtml(slot.vendor)}</span>
      <button type="button" class="cs-btn cs-btn-mini is-pending" disabled title="개발 예정 — 메신저는 수집기에서도 아직 예시 화면">🤖</button>
      <button type="button" class="cs-btn cs-btn-mini" data-msn="close" data-slot="${index}" title="칸 닫기">✕</button>
    </div>
    <div class="cs-slot-sub">${escapeHtml(`${sub}${slot.customer} · ${slot.at}`)}</div>
    <div class="cs-chat">${slot.history.map((m) => `<div class="cs-bubble ${m.who === "me" ? "me" : "them"}">${escapeHtml(m.text)}${m.at ? `<small>${escapeHtml(m.at)}</small>` : ""}</div>`).join("")}</div>
    <div class="cs-slot-sugg">${sugg}</div>
    <div class="cs-slot-send">
      <textarea data-msn-answer="${index}" placeholder="보낼 답변">${escapeHtml(slot.answer)}</textarea>
      <div class="cs-row">
        <button type="button" class="cs-btn cs-btn-mini is-pending" disabled title="수집기 PC 앞에서만 — 윈도우 음성 입력">🎤</button>
        <button type="button" class="cs-btn cs-btn-mini is-pending" disabled title="개발 예정 — 메신저 사진 보내기">📷</button>
        <button type="button" class="cs-btn cs-btn-mini" data-msn="clear" data-slot="${index}">지우기</button>
        <span class="cs-flex"></span>
        <button type="button" class="cs-btn is-pending" disabled title="개발 예정 — 실제 메신저 전송">↵ 보내기</button>
      </div>
    </div>
  </div>`;
}

export function jobsHtml(jobs = [], collector = null) {
  const head = collector
    ? `<p class="cs-note">수집기 PC: <b class="cs-collector-${collector.state}">${collector.state === "on" ? "● 연결됨" : collector.state === "late" ? "◐ 늦음" : "○ 꺼짐"}</b>${collector.pc ? ` · ${escapeHtml(collector.pc)}` : ""} · ${agoText(collector.ago)}${collector.state === "off" ? " — 수집기 PC에서 ▶G1수집기_5_웹연결.bat 을 켜 주세요" : ""}</p>`
    : "";
  if (!jobs.length) return `${head}<p class="cs-note">아직 요청이 없습니다.</p>`;
  return `${head}<ul class="cs-job-list">${jobs.slice(0, 6).map((job) => `
    <li class="cs-job is-${escapeHtml(job.status)}">
      <span class="cs-job-status">${escapeHtml(job.status)}</span>
      <b>${escapeHtml(job.label)}</b>${job.kind === "register" && job.count ? ` ${job.count}건` : ""}
      <span class="cs-note">${escapeHtml(shortDate(job.at))}${job.by ? ` · ${escapeHtml(job.by)}` : ""}${job.pc ? ` · ${escapeHtml(job.pc)}` : ""}</span>
      ${job.message ? `<div class="cs-note">${escapeHtml(job.message)}</div>` : ""}
      ${job.status === "대기" ? `<button type="button" class="cs-btn cs-btn-mini" data-job-cancel="${escapeHtml(job.id)}">취소</button>` : ""}
    </li>`).join("")}</ul>`;
}

// ---------- 앱 ----------
export function createCsBoardApp({ document, window, endpoint = CS_BOARD_ENDPOINT, fetchImpl, storage, samples = {}, now = () => Date.now() } = {}) {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const doFetch = fetchImpl || ((...args) => window.fetch(...args));
  const sampleBoard = samples.board || CS_SAMPLE_BOARD_ROWS;
  const sampleReview = samples.review || CS_SAMPLE_REVIEW_ROWS;
  const sampleMessenger = samples.messenger || CS_SAMPLE_MESSENGER;
  const stored = readStored(storage);

  const state = {
    endpoint: String(endpoint || ""),
    token: stored.token,
    editor: stored.editor,
    rows: [],
    sample: false,
    connected: false,
    aiEnabled: false,
    loading: false,
    loadedAt: 0,
    filter: { vendor: "", status: "전체", search: "" },
    views: new Map(),
    timers: new Map(),
    saving: new Set(),
    errors: new Map(),
    savedAt: "",
    suggesting: new Set(),
    slots: [],
    demoIndex: 0,
    collector: null,
    jobs: [],
    usage: {},
    usageMonth: (() => { const d = new Date(now()); return { y: d.getFullYear(), m: d.getMonth() + 1 }; })(),
    vendorSel: readVendorSel(storage),
    pollTimer: null,
    requesting: false,
  };

  // ---------- 알림·로그 ----------
  let toastTimer = null;
  function toast(message) {
    const box = $("#cs-toast");
    if (!box) return;
    box.textContent = message;
    box.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { box.hidden = true; }, 3600);
  }

  function log(message, warn = false) {
    const line = `${clock()}  ${message}\n`;
    $$('[data-log="all"]').forEach((box) => { box.textContent += line; box.scrollTop = box.scrollHeight; });
    if (warn) $$('[data-log="warn"]').forEach((box) => { box.textContent += line; box.scrollTop = box.scrollHeight; });
  }

  // ---------- 탭·접기 ----------
  function showLeft(tab) {
    $$("[data-left-tab]").forEach((b) => { const on = b.dataset.leftTab === tab; b.classList.toggle("active", on); b.setAttribute("aria-selected", String(on)); });
    $$("[data-left-panel]").forEach((p) => { p.hidden = p.dataset.leftPanel !== tab; });
    if (tab === "settings" && state.connected && !state.sample) loadUsage();
  }

  const RIGHT_COLORS = { board: "#2563eb", review: "#ea8a00", msn: "#16a34a" };
  function showRight(tab) {
    $$("[data-right-tab]").forEach((b) => { const on = b.dataset.rightTab === tab; b.classList.toggle("active", on); b.setAttribute("aria-selected", String(on)); });
    $$("[data-right-panel]").forEach((p) => { p.hidden = p.dataset.rightPanel !== tab; });
    const line = $("#cs-right-line");
    if (line) line.style.background = RIGHT_COLORS[tab] || RIGHT_COLORS.board;
  }

  // 시트에 연결되면 풀리는 버튼(data-job·data-live): 연결 전·가상셋팅이면 빨간 미작동
  function setLive(el, on, reason) {
    el.disabled = !on;
    el.classList.toggle("is-pending", !on);
    el.title = on ? "" : reason || el.dataset.pending || "";
  }

  function live() {
    return state.connected && !state.sample;
  }

  function renderLiveControls() {
    const on = live();
    const reason = state.sample ? "가상셋팅 중 — 끄면 작동" : "시트 연결 후 작동";
    $$("[data-job], [data-live]").forEach((el) => setLive(el, on && !state.requesting, reason));
    $$("[data-vendor-group] [data-vendor]").forEach((card) => {
      const group = card.closest("[data-vendor-group]").dataset.vendorGroup;
      card.classList.toggle("is-off", !state.vendorSel[group].has(card.dataset.vendor));
      card.classList.toggle("is-toggle", on);
      card.title = on ? "눌러서 웹 수집 요청에 넣기/빼기" : "";
    });
  }

  // ---------- 연결·수집기 표시 ----------
  function renderConnection() {
    const badge = $("#cs-connection");
    const note = $("#cs-endpoint-note");
    const tokenState = $("#cs-token-state");
    const ai = $("#cs-ai-state");
    if (badge) {
      badge.className = "cs-connection";
      if (state.sample) { badge.classList.add("is-sample"); badge.textContent = "🧪 가상셋팅"; }
      else if (!state.endpoint) { badge.classList.add("is-off"); badge.textContent = "시트 연결 전"; }
      else if (state.connected) { badge.classList.add("is-on"); badge.textContent = `연결됨 · ${state.rows.filter((r) => !r.closed).length}건`; }
      else if (!state.token) { badge.classList.add("is-off"); badge.textContent = "비밀번호 필요"; }
      else { badge.classList.add("is-error"); badge.textContent = "연결 안 됨"; }
    }
    const chip = $("#cs-collector");
    if (chip) {
      const c = state.collector;
      chip.className = "cs-connection";
      if (!live() || !c) { chip.classList.add("is-off"); chip.textContent = "수집기 PC —"; }
      else {
        chip.classList.add(c.state === "on" ? "is-on" : c.state === "late" ? "is-sample" : "is-error");
        const active = state.jobs.find((job) => job.status === "실행중");
        chip.textContent = `수집기 PC ${c.state === "on" ? "●" : c.state === "late" ? "◐" : "○"}${active ? ` · ${active.label} 중` : ""}`;
        chip.title = `${c.pc || "수집기 PC"} · 마지막 신호 ${agoText(c.ago)}${c.version ? ` · ${c.version}` : ""}`;
      }
    }
    if (note) {
      note.textContent = state.endpoint ? "CS 시트 주소: 등록됨" : "CS 시트 주소가 아직 없습니다 — 시트 스크립트를 배포하면 연결됩니다.";
      note.classList.toggle("cs-pending-text", !state.endpoint);
    }
    const off = !state.endpoint;
    ["#cs-token-input", "#cs-token-save"].forEach((selector) => {
      const el = $(selector);
      if (!el) return;
      el.disabled = off;
      el.classList.toggle("is-pending", off);
      if (off) el.title = "시트 주소 등록 후 작동";
      else el.removeAttribute("title");
    });
    if (tokenState) tokenState.textContent = state.token ? (state.connected ? "연결됨" : "저장됨") : "저장된 비밀번호 없음";
    if (ai) ai.textContent = !state.connected ? "연결 후 확인" : state.aiEnabled ? "사용 가능 (시트에 키 등록됨)" : "키 없음 — 스크립트 속성 CLAUDE_KEY 등록 필요";
  }

  function renderVendorStatus() {
    const last = state.collector?.last;
    const reviewLast = state.collector?.reviewLast;
    for (const vendor of VENDORS) {
      const cell = document.querySelector(`[data-vendor-status="${vendor}"]`);
      if (!cell) continue;
      const rows = state.rows.filter((row) => row.vendor === vendor && !row.closed && row.kind === "문의");
      if (!state.sample && !state.connected) { cell.textContent = "아직 수집 전"; cell.className = "cs-vendor-status"; continue; }
      if (state.sample) { cell.textContent = `가상 문의 ${rows.length}건`; continue; }
      const v = last?.vendors.find((x) => x.vendor === vendor);
      const r = reviewLast?.vendors.find((x) => x.vendor === vendor);
      const line1 = v ? (v.state === "ok" ? `✓ ${v.count}건` : `⚠ ${v.state}`) : `문의 ${rows.length}건`;
      const line2 = last?.at ? `마지막 수집 ${last.at.slice(5)}` : "수집 기록 없음";
      cell.textContent = `${line1}${r && r.state !== "ok" ? ` · 리뷰 ${r.state}` : ""}\n${line2}`;
      cell.className = `cs-vendor-status${v && v.state !== "ok" ? " is-bad" : ""}`;
      cell.title = [v?.note, r?.note].filter(Boolean).join(" / ");
    }
  }

  let warned = "";
  function warnCollectorProblems() {
    const items = [...(state.collector?.last?.vendors || []).map((v) => ({ ...v, kind: "" })), ...(state.collector?.reviewLast?.vendors || []).map((v) => ({ ...v, kind: " 리뷰" }))]
      .filter((v) => v.state && v.state !== "ok" && v.state !== "미지원");
    const text = items.map((v) => `${v.vendor}${v.kind}: ${v.state}${v.note ? ` (${v.note})` : ""}`).join(" / ");
    if (text && text !== warned) log(`수집기 확인 필요 — ${text}${items.some((v) => v.state === "로그인 필요") ? " → 수집기 PC에서 [🔑 로그인]" : ""}`, true);
    warned = text;
  }

  function renderJobs() {
    const box = $("#cs-jobs");
    if (!box) return;
    box.innerHTML = live() ? jobsHtml(state.jobs, state.collector) : `<p class="cs-note">${state.sample ? "가상셋팅 중에는 요청을 보내지 않습니다." : "시트 연결 후 보입니다."}</p>`;
  }

  // ---------- 목록 ----------
  function viewFor(row) {
    let view = state.views.get(row.key);
    const pool = draftPool(row);
    if (!view || view.some((index) => !pool.includes(index)) || (view.length < 2 && pool.length > view.length)) {
      view = initialView(row);
      state.views.set(row.key, view);
    }
    return view;
  }

  function savedLabelFor(key) {
    if (state.sample) return "가상 — 저장 안 함";
    return csSavedLabel({ dirty: state.timers.has(key), saving: state.saving.has(key), savedAt: state.savedAt, error: state.errors.get(key) || "" });
  }

  function cardOptions(row) {
    return { sample: state.sample, aiReady: state.connected && state.aiEnabled, suggesting: state.suggesting.has(row.key), savedLabel: savedLabelFor(row.key) };
  }

  function renderFilters() {
    const select = $("#cs-filter-vendor");
    if (select) {
      const vendors = csVendors(state.rows, "문의");
      const current = state.filter.vendor;
      select.innerHTML = `<option value="">전체 업체</option>${vendors.map((v) => `<option value="${escapeHtml(v)}"${v === current ? " selected" : ""}>${escapeHtml(v)}</option>`).join("")}`;
    }
    const seg = $("#cs-filter-status");
    if (seg) seg.innerHTML = CS_BOARD_FILTERS.map((name) => `<button type="button" data-status="${name}" class="${state.filter.status === name ? "active" : ""}">${name}</button>`).join("");
  }

  function renderSummary() {
    const anyPending = state.timers.size || state.saving.size;
    const tail = state.sample ? " · 가상(저장 안 함)" : anyPending ? " · 저장 중…" : state.savedAt ? ` · 자동 저장됨 ${state.savedAt}` : "";
    const box = $("#cs-summary");
    if (box) {
      const s = csBoardSummary(state.rows, "문의");
      box.textContent = `${s.total}건 · 채택 ${s.picked} · 보류 ${s.held}${tail}`;
    }
    const review = $("#cs-review-summary");
    if (review) {
      const s = csBoardSummary(state.rows, "리뷰");
      review.textContent = live() ? `${s.total}건 · 채택 ${s.picked} · 보류 ${s.held}${tail}` : "";
    }
  }

  function emptyText() {
    if (state.loading) return "시트에서 불러오는 중…";
    if (!state.endpoint) return "아직 CS 시트가 연결되지 않았습니다.<br>오른쪽 위 <b>🧪 가상셋팅</b>으로 화면 모양을 미리 볼 수 있습니다.";
    return "왼쪽 <b>[설정]</b> 탭에서 비밀번호를 입력하면 문의가 보입니다.";
  }

  function renderBoard() {
    const list = $("#cs-board-list");
    if (!list) return;
    $("#cs-sample-banner").hidden = !state.sample;
    const sampleButton = $("#cs-sample-toggle");
    if (sampleButton) {
      sampleButton.setAttribute("aria-pressed", String(state.sample));
      sampleButton.textContent = state.sample ? "🧪 가상셋팅 끄기" : "🧪 가상셋팅";
    }
    const reload = $("#cs-reload");
    if (reload) setLive(reload, !state.sample && !!state.endpoint && !!state.token, state.sample ? "가상셋팅 중" : "시트 연결 후 작동");
    renderFilters();
    renderSummary();
    renderVendorStatus();
    renderConnection();
    renderLiveControls();
    renderJobs();
    if (!state.sample && !state.connected) {
      list.innerHTML = `<div class="cs-empty">${emptyText()}</div>`;
    } else {
      const rows = sortCsRows(filterCsRows(state.rows, { ...state.filter, kind: "문의" }));
      list.innerHTML = rows.length
        ? rows.map((row, i) => cardHtml(row, i + 1, viewFor(row), cardOptions(row))).join("")
        : `<div class="cs-empty">${state.rows.some((r) => r.kind === "문의" && !r.closed) ? "조건에 맞는 문의가 없습니다." : "답변할 문의가 없습니다 🎉"}</div>`;
    }
    renderReview();
  }

  function renderReview() {
    const list = $("#cs-review-list");
    if (!list) return;
    const banner = $("#cs-review-banner");
    if (!live()) {
      if (banner) banner.hidden = false;
      const rows = sampleReview.map((raw) => normalizeCsRow(raw));
      list.innerHTML = rows.map((row, i) => cardHtml(row, i + 1, initialView(row), { readonly: true })).join("");
      return;
    }
    if (banner) banner.hidden = true;
    const rows = sortCsRows(filterCsRows(state.rows, { kind: "리뷰" }));
    list.innerHTML = rows.length
      ? rows.map((row, i) => cardHtml(row, i + 1, viewFor(row), cardOptions(row))).join("")
      : `<div class="cs-empty">답글 달 리뷰가 없습니다 — [▶ 수집 시작]으로 리뷰를 모아 보세요.</div>`;
  }

  function findCard(key) {
    return document.querySelector(`[data-card="${CSS.escape(key)}"]`);
  }

  function rerenderCard(key) {
    const card = findCard(key);
    const row = findRow(key);
    if (!card || !row) return renderBoard();
    const no = card.querySelector(".cs-card-no")?.textContent || "";
    card.outerHTML = cardHtml(row, no, viewFor(row), cardOptions(row));
    renderSummary();
  }

  function updateCardMarks(key) {
    const label = findCard(key)?.querySelector("[data-saved-for]");
    if (label) label.textContent = savedLabelFor(key);
    renderSummary();
  }

  function findRow(key) {
    return state.rows.find((row) => row.key === key);
  }

  function replaceRow(next) {
    state.rows = state.rows.map((row) => (row.key === next.key ? next : row));
  }

  function setChoice(key, choice) {
    const row = findRow(key);
    if (!row || isCsRowLocked(row)) return;
    const view = state.views.get(key) || initialView(row);
    const next = { ...row, choice: { ...choice, view: [...view] } };
    next.status = csStatusOf(next);
    replaceRow(next);
    scheduleSave(key);
  }

  // ---------- 시트 호출 ----------
  async function post(body) {
    const response = await doFetch(state.endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // 사전 요청(preflight) 없이
      body: JSON.stringify({ ...body, token: state.token }),
    });
    if (!response.ok) throw new Error(`시트 응답 오류 (${response.status})`);
    return parseCsBoardResponse(await response.json());
  }

  function scheduleSave(key) {
    if (state.sample) { updateCardMarks(key); return; }
    window.clearTimeout(state.timers.get(key));
    state.timers.set(key, window.setTimeout(() => flushSave(key), CS_BOARD_SAVE_DELAY_MS));
    state.errors.delete(key);
    updateCardMarks(key);
  }

  async function flushSave(key) {
    window.clearTimeout(state.timers.get(key));
    state.timers.delete(key);
    const row = findRow(key);
    if (!row || state.sample || !state.connected) return;
    if (state.saving.has(key)) { state.timers.set(key, window.setTimeout(() => flushSave(key), CS_BOARD_SAVE_DELAY_MS)); return; }
    const payload = csSavePayload(row, row.choice, state.editor);
    const sentChoice = JSON.stringify(payload.choice);
    state.saving.add(key);
    updateCardMarks(key);
    try {
      const result = await post(payload);
      const latest = findRow(key);
      if (latest && JSON.stringify(csSavePayload(latest, latest.choice).choice) === sentChoice) replaceRow(result.row);
      else if (latest) { replaceRow({ ...latest, version: result.row.version }); state.saving.delete(key); scheduleSave(key); return; }
      state.savedAt = clock();
    } catch (error) {
      if (error.row) {
        replaceRow(error.row);
        state.views.delete(key);
        toast(error.conflict ? "다른 사람이 먼저 바꿨습니다 — 새 내용으로 다시 불러왔습니다." : error.message);
        log(`[${key}] ${error.conflict ? "다른 사람이 먼저 바꿔서 새 내용으로 바꿈" : error.message}`, true);
        state.saving.delete(key);
        rerenderCard(key);
        return;
      }
      if (error.denied) handleDenied(error);
      state.errors.set(key, error.message);
      log(`[${key}] 저장 실패: ${error.message}`, true);
    } finally {
      state.saving.delete(key);
    }
    updateCardMarks(key);
  }

  function flushAllBeacon() {
    if (!state.timers.size || !state.endpoint || !window.navigator?.sendBeacon) return;
    for (const key of [...state.timers.keys()]) {
      window.clearTimeout(state.timers.get(key));
      state.timers.delete(key);
      const row = findRow(key);
      if (!row) continue;
      const body = JSON.stringify({ ...csSavePayload(row, row.choice, state.editor), token: state.token });
      window.navigator.sendBeacon(state.endpoint, new Blob([body], { type: "text/plain;charset=utf-8" }));
    }
  }

  // ---------- AI 추천 ----------
  async function suggest(key) {
    const row = findRow(key);
    if (!row || !live() || !state.aiEnabled || state.suggesting.has(key)) return;
    state.suggesting.add(key);
    rerenderCard(key);
    log(`[${row.vendor} ${row.id}] 🤖 AI 추천 요청`);
    try {
      const result = await post(csSuggestPayload(row));
      const latest = findRow(key);
      const keepChoice = latest && (state.timers.has(key) || state.saving.has(key)); // 저장 안 된 내 선택은 그대로
      replaceRow(keepChoice ? { ...result.row, choice: latest.choice, version: latest.version } : result.row);
      toast(`🤖 AI 추천 ${result.added}개를 붙였습니다.`);
      log(`[${row.vendor} ${row.id}] 🤖 AI 추천 ${result.added}개 추가`);
    } catch (error) {
      if (error.denied) handleDenied(error);
      toast(`AI 추천 실패: ${error.message}`);
      log(`[${row.vendor} ${row.id}] AI 추천 실패: ${error.message}`, true);
    } finally {
      state.suggesting.delete(key);
      rerenderCard(key);
    }
  }

  // ---------- 수집기 PC에 요청 ----------
  function applyJobs(result) {
    if (result.jobs) state.jobs = result.jobs;
    if (result.collector) state.collector = collectorStatus(result.collector, now());
    schedulePoll();
  }

  async function requestJob(kind) {
    if (!live() || state.requesting) return;
    const group = kind === "reviews" || kind === "testReviews" ? "review" : "board";
    const vendors = [...state.vendorSel[group]];
    if (!vendors.length) { toast("수집할 업체를 하나 이상 켜 주세요."); return; }
    const reviewDays = Number($("#cs-review-days")?.value) || 0;
    state.requesting = true;
    renderLiveControls();
    try {
      const result = await post(csRequestPayload(kind, { vendors, reviewDays }, state.editor));
      applyJobs(result);
      const label = result.job?.label || kind;
      const offline = state.collector?.state === "off";
      toast(result.duplicate ? `이미 ${label} 요청이 있습니다 — 끝날 때까지 기다려 주세요.` : `${label} 요청을 보냈습니다${offline ? " — 수집기 PC가 꺼져 있어 켜지면 실행합니다" : " — 수집기 PC가 곧 실행합니다"}.`);
      log(`${label} 요청 (${vendors.join(", ")})${result.duplicate ? " — 이미 대기 중" : ""}`);
    } catch (error) {
      if (error.denied) handleDenied(error);
      toast(`요청 실패: ${error.message}`);
      log(`요청 실패: ${error.message}`, true);
    } finally {
      state.requesting = false;
      renderBoard();
    }
  }

  async function cancelJob(id) {
    try {
      const result = await post({ action: "cancel", id });
      applyJobs(result);
      toast("요청을 취소했습니다.");
      await load({ quiet: true });
    } catch (error) {
      toast(`취소 실패: ${error.message}`);
    }
  }

  let pollHandle = null;
  function schedulePoll() {
    window.clearTimeout(pollHandle);
    if (!live()) return;
    const active = state.jobs.some(isJobActive);
    pollHandle = window.setTimeout(async () => {
      if (!state.timers.size && !state.saving.size) await load({ quiet: true });
      else schedulePoll();
    }, active ? 10000 : 60000);
  }

  // ---------- 📤 등록 확인 창 ----------
  function openRegister() {
    if (!live()) return;
    const { auto, manual } = registerCandidates(state.rows);
    const pendingSaves = state.timers.size + state.saving.size;
    const list = (rows, cls) => rows.map((row) => `<li class="${cls}"><span class="cs-vendor-chip" data-vendor="${escapeHtml(row.vendor)}">${escapeHtml(row.vendor)}</span> ${escapeHtml(row.board)} · ${escapeHtml(row.id)}<div class="cs-note">${escapeHtml(pickedText(row).slice(0, 120))}</div></li>`).join("");
    $("#cs-modal-body").innerHTML = `
      <p class="cs-note">'등록 대상'만 올라갑니다. 수집기 PC가 등록 직전에 한 번 더 조회해서 이미 답변이 있으면 덮어쓰지 않고 건너뜁니다.</p>
      ${pendingSaves ? `<p class="cs-pending-text">저장 중인 선택이 있습니다 — 잠시 뒤 다시 눌러 주세요.</p>` : ""}
      <h3>자동 등록 ${auto.length}건 <small>(스마트스토어 상품문의·고객문의)</small></h3>
      ${auto.length ? `<ul class="cs-reg-list">${list(auto, "")}</ul>` : `<p class="cs-note">채택된 스마트스토어 문의가 없습니다.</p>`}
      <h3>직접 등록 ${manual.length}건 <small>(지그재그·에이블리·메이크샵 — 아직 자동 등록 기능 없음)</small></h3>
      ${manual.length ? `<ul class="cs-reg-list">${list(manual, "is-manual")}</ul><p class="cs-note">각 카드의 [📋 복사] → [바로가기]로 열어 붙여넣어 주세요.</p>` : `<p class="cs-note">없음</p>`}`;
    const ok = $("#cs-modal-ok");
    ok.textContent = `${auto.length}건 등록 요청`;
    ok.disabled = !auto.length || pendingSaves > 0;
    ok.onclick = () => submitRegister(auto);
    $("#cs-modal").hidden = false;
    ok.focus();
  }

  function closeModal() {
    $("#cs-modal").hidden = true;
  }

  async function submitRegister(rows) {
    closeModal();
    state.requesting = true;
    renderLiveControls();
    try {
      const result = await post(csRegisterPayload(rows, state.editor));
      applyJobs(result);
      if (result.hasRows) state.rows = result.rows;
      toast(`등록 요청 ${rows.length}건을 보냈습니다 — 수집기 PC가 실행합니다.`);
      log(`📤 등록 요청 ${rows.length}건`);
    } catch (error) {
      if (error.denied) handleDenied(error);
      toast(`등록 요청 실패: ${error.message}`);
      log(`등록 요청 실패: ${error.message}`, true);
    } finally {
      state.requesting = false;
      renderBoard();
    }
  }

  // ---------- AI 사용량 ----------
  function renderUsage() {
    const { y, m } = state.usageMonth;
    const title = $("#cs-usage-month");
    if (title) title.textContent = `${y}년 ${m}월`;
    const sum = $("#cs-usage-sum");
    const days = $("#cs-usage-days");
    if (!live()) { if (days) days.innerHTML = ""; return; }
    const month = usageForMonth(state.usage, y, m);
    if (sum) sum.textContent = `이번 달 웹 AI 추천 ${month.n}회 · 약 ${month.won.toLocaleString("ko-KR")}원`;
    if (days) days.innerHTML = month.days.length
      ? month.days.map((d) => `<span class="cs-usage-day"><b>${Number(d.day.slice(8))}일</b> ${d.n}회 · ${d.won}원</span>`).join("")
      : `<span class="cs-note">이 달 기록 없음</span>`;
  }

  async function loadUsage() {
    if (!live()) return renderUsage();
    try {
      const result = await post({ action: "usage" });
      state.usage = result.usage || {};
    } catch (error) {
      log(`AI 사용량 불러오기 실패: ${error.message}`, true);
    }
    renderUsage();
  }

  function shiftMonth(delta) {
    let { y, m } = state.usageMonth;
    m += delta;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    state.usageMonth = { y, m };
    renderUsage();
  }

  // ---------- 불러오기 ----------
  function handleDenied(error) {
    state.token = "";
    state.connected = false;
    writeStored(storage, { token: "", editor: state.editor });
    toast(error.message || "비밀번호가 맞지 않습니다.");
    renderBoard();
  }

  async function load({ quiet = false } = {}) {
    if (!state.endpoint || !state.token || state.sample) { renderBoard(); return false; }
    state.loading = true;
    if (!quiet) renderBoard();
    const hadActive = state.jobs.some(isJobActive);
    try {
      const result = await post({ action: "list" });
      const local = new Map(state.rows.filter((row) => state.timers.has(row.key) || state.saving.has(row.key)).map((row) => [row.key, row]));
      state.rows = result.rows.map((row) => local.get(row.key) || row);
      state.connected = true;
      state.aiEnabled = result.aiEnabled;
      state.loadedAt = now();
      applyJobs(result);
      if (hadActive && !state.jobs.some(isJobActive)) {
        const last = state.jobs[0];
        if (last) { toast(`${last.label} ${last.status}${last.message ? ` — ${last.message}` : ""}`); log(`${last.label} ${last.status} — ${last.message}`, last.status === "실패"); }
      }
      warnCollectorProblems();
      if (!quiet) log(`시트에서 문의·리뷰 ${result.rows.length}건을 불러왔습니다.`);
      return true;
    } catch (error) {
      state.connected = false;
      if (error.denied) handleDenied(error);
      log(`시트 불러오기 실패: ${error.message}`, true);
      if (!quiet) toast(`시트 불러오기 실패: ${error.message}`);
      return false;
    } finally {
      state.loading = false;
      renderBoard();
    }
  }

  function setSample(on) {
    state.sample = on;
    state.views.clear();
    window.clearTimeout(pollHandle);
    if (on) {
      state.rows = sampleBoard.map((raw) => normalizeCsRow(raw));
      log("🧪 가상셋팅 켬 — 가상 예시를 보여 줍니다(저장 안 함).");
      renderBoard();
    } else {
      state.rows = [];
      log("🧪 가상셋팅 끔");
      load();
    }
  }

  // ---------- 메신저 (예시 칸) ----------
  function renderSlots() {
    const box = $("#cs-msn-slots");
    if (!box) return;
    box.innerHTML = state.slots.length
      ? state.slots.map((slot, index) => slotHtml(slot, index)).join("")
      : `<p class="cs-msn-empty">감시를 시작하면 메신저 문의가 들어오는 순서대로 여기에 칸이 하나씩 생깁니다.</p>`;
  }

  function addDemoSlot() {
    const sample = sampleMessenger[state.demoIndex % sampleMessenger.length];
    state.demoIndex += 1;
    state.slots.push({ ...sample, at: clock(), used: { A: 0, B: Math.min(1, Math.max(0, sample.picks.length - 1)), next: 2 }, answer: "" });
    renderSlots();
    const box = $("#cs-msn-slots");
    if (box) box.scrollLeft = box.scrollWidth;
  }

  function onSlotClick(event) {
    const button = event.target.closest("[data-msn]");
    if (!button) return;
    const index = Number(button.dataset.slot);
    const slot = state.slots[index];
    if (!slot) return;
    const act = button.dataset.msn;
    if (act === "close") state.slots.splice(index, 1);
    else if (act === "left" && index > 0) [state.slots[index - 1], state.slots[index]] = [state.slots[index], state.slots[index - 1]];
    else if (act === "right" && index < state.slots.length - 1) [state.slots[index + 1], state.slots[index]] = [state.slots[index], state.slots[index + 1]];
    else if (act === "refresh") {
      const box = button.dataset.box;
      const other = slot.used[box === "A" ? "B" : "A"] % slot.picks.length;
      for (let i = 0; i < slot.picks.length; i += 1) {
        const n = slot.used.next % slot.picks.length;
        slot.used.next += 1;
        if (n !== other) { slot.used[box] = n; break; }
      }
    } else if (act === "paste") {
      slot.answer = slot.picks[slot.used[button.dataset.box] % slot.picks.length] || "";
    } else if (act === "clear") slot.answer = "";
    renderSlots();
  }

  // ---------- 이벤트 ----------
  function onListClick(event) {
    const statusButton = event.target.closest("[data-status]");
    if (statusButton) { state.filter.status = statusButton.dataset.status; renderBoard(); return; }
    const button = event.target.closest("[data-act]");
    if (!button || button.disabled || button.tagName === "TEXTAREA" || button.type === "checkbox") return;
    const key = button.dataset.key;
    const row = findRow(key);
    if (!row) return;
    const view = viewFor(row);
    const act = button.dataset.act;
    if (act === "pick") {
      setChoice(key, withPick(row, view[Number(button.dataset.box)]));
      rerenderCard(key);
    } else if (act === "cycle") {
      const box = Number(button.dataset.box);
      const before = view[box];
      const next = nextDraftInView(row, view, box);
      state.views.set(key, next);
      setChoice(key, row.choice.pick === before ? withPick(row, next[box]) : row.choice);
      rerenderCard(key);
    } else if (act === "clear") {
      setChoice(key, withPick(row, -1));
      rerenderCard(key);
    } else if (act === "copy") {
      const text = pickedText(row);
      if (!text) return;
      Promise.resolve(window.navigator?.clipboard?.writeText(text))
        .then(() => toast("채택한 문안을 복사했습니다."))
        .catch(() => toast("복사하지 못했습니다 — 문안을 직접 선택해 복사해 주세요."));
    } else if (act === "ai") {
      suggest(key);
    }
  }

  function onListInput(event) {
    const box = event.target;
    if (box.dataset?.act !== "edit" || box.readOnly) return;
    const key = box.dataset.key;
    const row = findRow(key);
    if (!row) return;
    const index = Number(box.dataset.index);
    setChoice(key, withEdit(row, index, box.value));
    box.classList.toggle("is-edited", Object.hasOwn(findRow(key).choice.edits, index));
  }

  function onListChange(event) {
    const box = event.target;
    if (box.dataset?.act !== "hold" || box.disabled) return;
    const key = box.dataset.key;
    const row = findRow(key);
    if (!row) return;
    setChoice(key, withHold(row, box.checked));
    rerenderCard(key);
  }

  function onVendorToggle(event) {
    const card = event.target.closest("[data-vendor-group] [data-vendor]");
    if (!card || !live() || event.target.closest("button")) return;
    const group = card.closest("[data-vendor-group]").dataset.vendorGroup;
    const set = state.vendorSel[group];
    if (set.has(card.dataset.vendor)) set.delete(card.dataset.vendor);
    else set.add(card.dataset.vendor);
    try {
      storage?.setItem(VENDOR_KEY, JSON.stringify({ board: [...state.vendorSel.board], review: [...state.vendorSel.review] }));
    } catch {
      // 이 기기에 기억 못 해도 이번 화면에는 적용
    }
    renderLiveControls();
  }

  function bind() {
    $$("[data-left-tab]").forEach((b) => b.addEventListener("click", () => showLeft(b.dataset.leftTab)));
    $$("[data-right-tab]").forEach((b) => b.addEventListener("click", () => showRight(b.dataset.rightTab)));
    $("#cs-fold")?.addEventListener("click", () => {
      const folded = $("#cs-main").classList.toggle("left-folded");
      const fold = $("#cs-fold");
      fold.textContent = folded ? "▶" : "◀";
      fold.setAttribute("aria-expanded", String(!folded));
      fold.title = folded ? "왼쪽 창 펴기" : "왼쪽 창 접기";
    });
    $$("[data-log-toggle]").forEach((b) => b.addEventListener("click", () => {
      const logs = $$('[data-log="all"]');
      const collapsed = !logs[0]?.classList.contains("collapsed");
      logs.forEach((box) => box.classList.toggle("collapsed", collapsed));
      b.textContent = collapsed ? "▼ 펼쳐보기" : "▲ 접기";
    }));
    for (const list of [$("#cs-board-list"), $("#cs-review-list")]) {
      list?.addEventListener("click", onListClick);
      list?.addEventListener("input", onListInput);
      list?.addEventListener("change", onListChange);
    }
    $("#cs-filter-status")?.addEventListener("click", onListClick);
    $("#cs-filter-vendor")?.addEventListener("change", (e) => { state.filter.vendor = e.target.value; renderBoard(); });
    $("#cs-filter-search")?.addEventListener("input", (e) => { state.filter.search = e.target.value; renderBoard(); });
    $("#cs-reload")?.addEventListener("click", () => load());
    $("#cs-sample-toggle")?.addEventListener("click", () => setSample(!state.sample));
    $$("[data-job]").forEach((b) => b.addEventListener("click", () => requestJob(b.dataset.job)));
    $("#cs-jobs")?.addEventListener("click", (e) => { const b = e.target.closest("[data-job-cancel]"); if (b) cancelJob(b.dataset.jobCancel); });
    $$("[data-vendor-group]").forEach((g) => g.addEventListener("click", onVendorToggle));
    $("#cs-register-open")?.addEventListener("click", openRegister);
    $("#cs-modal-cancel")?.addEventListener("click", closeModal);
    $("#cs-modal")?.addEventListener("click", (e) => { if (e.target.id === "cs-modal") closeModal(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#cs-modal")?.hidden) closeModal(); });
    $("#cs-usage-prev")?.addEventListener("click", () => shiftMonth(-1));
    $("#cs-usage-next")?.addEventListener("click", () => shiftMonth(1));
    $("#cs-usage-reload")?.addEventListener("click", loadUsage);
    $("#cs-msn-demo")?.addEventListener("click", addDemoSlot);
    $("#cs-msn-slots")?.addEventListener("click", onSlotClick);
    $("#cs-msn-slots")?.addEventListener("input", (e) => {
      const index = e.target.dataset?.msnAnswer;
      if (index !== undefined && state.slots[Number(index)]) state.slots[Number(index)].answer = e.target.value;
    });

    const editorInput = $("#cs-editor-input");
    if (editorInput) editorInput.value = state.editor;
    $("#cs-token-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const token = String($("#cs-token-input")?.value || "").trim();
      state.editor = String(editorInput?.value || "").trim().slice(0, 20);
      if (!state.endpoint) return;
      if (token && !isCsBoardTokenValid(token)) { toast("비밀번호는 영문·숫자·-·_ 8자 이상입니다."); return; }
      if (token) state.token = token;
      if (!state.token) { writeStored(storage, { token: "", editor: state.editor }); toast("이름을 저장했습니다."); return; }
      if (state.sample) { state.sample = false; state.rows = []; }
      const ok = await load();
      if (ok) {
        writeStored(storage, { token: state.token, editor: state.editor });
        $("#cs-token-input").value = "";
        toast("CS 시트에 연결했습니다.");
      }
    });
    $("#cs-token-clear")?.addEventListener("click", () => {
      state.token = "";
      state.connected = false;
      state.rows = [];
      writeStored(storage, { token: "", editor: "" });
      if (editorInput) editorInput.value = "";
      state.editor = "";
      window.clearTimeout(pollHandle);
      toast("이 기기에 저장된 비밀번호를 지웠습니다.");
      renderBoard();
    });
    window.addEventListener?.("pagehide", flushAllBeacon);
    window.addEventListener?.("focus", () => {
      if (live() && !state.timers.size && !state.saving.size && now() - state.loadedAt > 30000) load({ quiet: true });
    });
  }

  function start() {
    // 빨간 버튼에 마우스를 올리면 왜 아직 안 되는지 보이게
    $$("[data-pending]").forEach((el) => { if (!el.title) el.title = el.dataset.pending; });
    bind();
    showLeft("main");
    showRight("board");
    renderSlots();
    renderUsage();
    log("CS 자동화 화면을 열었습니다.");
    if (state.endpoint && state.token) load();
    else if (!state.endpoint) {
      log("CS 시트가 아직 연결되지 않아 가상 예시를 보여 줍니다.");
      setSample(true);
    } else renderBoard();
  }

  return { state, start, load, setSample, suggest, flushSave, renderBoard, addDemoSlot, requestJob, openRegister };
}

if (typeof document !== "undefined" && document.getElementById("cs-board-app")) {
  createCsBoardApp({ document, window, storage: (() => { try { return window.localStorage; } catch { return null; } })() }).start();
}
