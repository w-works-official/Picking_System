// CS 관리 · CS 자동화 화면 (2026-10-29) — G1 CS 수집기 화면을 웹으로.
// 작동하는 것: 문의·리뷰 보기 · 답변안 A/B 고르기 · ⟳ 다른 안 보기 · 문안 고치기 · 보류 · 선택 해제 · 복사 ·
//              🤖 AI 추천(시트 Apps Script 경유) · 0.8초 자동 저장 · 🧪 가상셋팅 · 메신저 예시 칸 ·
//              수집기 PC에 요청(게시판·리뷰·테스트 수집, 📤 등록) · 요청 현황 · 업체별 마지막 수집 상태 · AI 사용량.
// 작동 안 하는 것(흐린 회색, 누를 수 없음 — 2026-11-03 빨간 점선에서 바꿈): 수집기 PC 앞에서만 되는 것(로그인·엑셀·폴더·API 키·설정) · 개발 예정.
import {
  CS_BOARD_ENDPOINT,
  CS_BOARD_FILTERS,
  CS_BOARD_SAVE_DELAY_MS,
  CS_BOARD_STORAGE_KEY,
  csPasswordKind,
  csUnlockResult,
  CS_LOGIN_VENDORS,
  LINK_REPO,
  autoSettings,
  linkRawUrl,
  linkVersionNewer,
  linkVersionOf,
  csPcPayload,
  latestJob,
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
  csLoginBoth,
  csLoginStatus,
  csPointAmount,
  csPointPayload,
  CS_POINT_DEFAULT,
  csShotPoint,
} from "../domain/csBoard.mjs?v=20261106-remote1";
import { CS_SAMPLE_BOARD_ROWS, CS_SAMPLE_MESSENGER, CS_SAMPLE_REVIEW_ROWS } from "../domain/csBoardSamples.mjs?v=20261029-cs-board1";
import { collectorSettingsView, guideStepsHtml, setupProgress, setupSteps } from "./csSetupGuide.mjs?v=20261109-layout1";
import { lockForPc } from "./csPcLock.mjs?v=20261029-cs-update1";
import { csExcelChanges, csExcelSheet } from "../domain/csExcel.mjs?v=20261103-loginmemo1";

const VENDORS = ["스마트스토어", "지그재그", "에이블리", "메이크샵"];
const REVIEW_VENDORS = ["스마트스토어", "지그재그", "에이블리", "메이크샵"];
const CS_MANUAL_LOGIN = ["스마트스토어"];   // 웹연결 1.6: 네이버는 자동 입력하면 퀴즈·2단계 인증에 막혀 사람이 직접 로그인
const REVIEW_DEFAULT = ["지그재그", "에이블리", "메이크샵"];   // 스마트스토어 리뷰는 직접 로그인이 필요해 처음엔 꺼 둠 (2026-11-03)
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

const SHOP_KEY = "system_v3_cs_makeshop_shop"; // 메이크샵 부운영자 상점 URL (비밀값 아님 — 다음에 다시 안 쓰게)
let shopStorage = null;
function readShop() {
  try { return String(shopStorage?.getItem(SHOP_KEY) || "").slice(0, 80); } catch { return ""; }
}
function writeShop(value) {
  try { shopStorage?.setItem(SHOP_KEY, String(value || "").slice(0, 80)); } catch { /* 저장 못 해도 이번에는 그대로 */ }
}

// 2026-11-04: 로그인 칸 체크(업체·게시판+리뷰 수집)를 요청 뒤에도 유지 — 이 기기에 기억 (비밀값 아님)
const LOGIN_PICK_KEY = "system_v3_cs_login_pick";
function readLoginPick() {
  try {
    const raw = JSON.parse(shopStorage?.getItem(LOGIN_PICK_KEY) || "null");
    if (!raw || !Array.isArray(raw.vendors)) return null;
    return { vendors: raw.vendors.map(String).slice(0, 4), collect: raw.collect === true };
  } catch { return null; }
}
function writeLoginPick(value) {
  try { shopStorage?.setItem(LOGIN_PICK_KEY, JSON.stringify({ vendors: value.vendors || [], collect: !!value.collect })); } catch { /* 이번 화면에서만 유지 */ }
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
      review: new Set(Array.isArray(raw.review) ? raw.review.filter((v) => REVIEW_VENDORS.includes(v)) : REVIEW_DEFAULT),
    };
  } catch {
    return { board: new Set(VENDORS), review: new Set(REVIEW_DEFAULT) };
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

// ---------- 진행 작은 창 (계산·그림만) ----------
export const PROGRESS_KINDS = ["collect", "test", "reviews", "testReviews", "auto", "login"];
function mmss(sec) {
  const s = Math.max(0, Math.floor(sec));
  return s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export function csProgressView(job, { now = Date.now(), waiting = 0, collector = null } = {}) {
  const since = Date.parse(job.status === "실행중" ? job.started || job.at : job.status === "대기" ? job.at : job.ended || job.at);
  const sec = Number.isFinite(since) ? (now - since) / 1000 : NaN;
  const icon = job.kind === "login" ? "🔑" : job.kind === "reviews" || job.kind === "testReviews" ? "⭐" : "📋";
  const name = String(job.label || job.kind).replace(/^🔑\s*|^⏰\s*/, "");
  if (job.status === "완료" || job.status === "실패") {
    const ok = job.status === "완료";
    return { id: job.id, tone: ok ? "ok" : "fail", icon, title: `${name} ${ok ? "완료" : "실패"}`, message: job.message || "", time: "", waiting: 0 };
  }
  const run = job.status === "실행중";
  const off = collector?.state === "off";
  const message = run ? job.message || (job.kind === "login" ? "수집기 PC가 로그인 창을 여는 중…" : "수집기 PC가 수집하는 중…")
    : off ? "수집기 PC가 꺼져 있어요 — 켜지면 바로 시작합니다" : "수집기 PC가 가져가길 기다리는 중…";
  return { id: job.id, tone: run ? "run" : "wait", icon, title: `${name} ${run ? "중" : "대기"}`, message, time: Number.isFinite(sec) ? mmss(sec) : "", waiting: Math.max(0, waiting) };
}
export function csProgressHtml(v) {
  const mark = v.tone === "ok" ? `<span class="cs-progress-mark">✓</span>` : v.tone === "fail" ? `<span class="cs-progress-mark">!</span>` : `<span class="cs-progress-spin" aria-hidden="true"></span>`;
  return `<div class="cs-progress-icon">${mark}<span class="cs-progress-emoji">${v.icon}</span></div>
    <div class="cs-progress-main">
      <div class="cs-progress-top"><b>${escapeHtml(v.title)}</b>${v.time ? `<span class="cs-progress-time">${escapeHtml(v.time)}</span>` : ""}</div>
      <div class="cs-progress-msg">${escapeHtml(v.message)}</div>
      ${v.tone === "run" || v.tone === "wait" ? `<div class="cs-progress-bar"><i></i></div>` : ""}
      ${v.waiting ? `<div class="cs-progress-more">+ 대기 ${v.waiting}건</div>` : ""}
    </div>
    <button type="button" class="cs-progress-close" data-progress-close="${escapeHtml(v.id)}" aria-label="닫기">✕</button>`;
}

export function jobsHtml(jobs = [], collector = null) {
  const head = collector
    ? `<p class="cs-note">수집기 PC: <b class="cs-collector-${collector.state}">${collector.state === "on" ? "● 연결됨" : collector.state === "late" ? "◐ 늦음" : "○ 꺼짐"}</b>${collector.pc ? ` · ${escapeHtml(collector.pc)}` : ""} · ${agoText(collector.ago)}${collector.state === "off" ? " — 수집기 PC가 꺼져 있거나 잠들었습니다 (켜지면 웹연결이 자동으로 같이 켜짐)" : ""}</p>`
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
  shopStorage = storage;
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
    point: { ...CS_POINT_DEFAULT },
    pointDirty: false,
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
    guideFocus: "",
    update: null,
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
  // 2026-11-04: 왼쪽 탭 = 메뉴 이동 (게시판·리뷰·메신저는 오른쪽 답변 화면도 같이), 오른쪽은 제목만
  const TAB_COLORS = { main: "#e11d74", board: "#2563eb", review: "#ff7a00", msn: "#00b84a", vendor: "#eab308", ship: "#0891b2", settings: "#64748b" };
  // 11-06: 왼쪽 창 접힘·보던 탭 = 마지막 상태 그대로 (이 기기에 기억 → 새로고침·다시 열어도 유지)
  const FOLD_KEY = "system_v3_cs_left_fold";
  const foldState = (() => { try { const v = JSON.parse(storage?.getItem(FOLD_KEY) || "{}"); return { tab: String(v.tab || ""), folded: v.folded === true }; } catch { return { tab: "", folded: false }; } })();
  let leftTab = "main";
  function setFold(folded) {
    const main = $("#cs-main"), fold = $("#cs-fold");
    if (!main || !fold) return;
    main.classList.toggle("left-folded", folded);
    fold.textContent = folded ? "▶" : "◀";
    fold.setAttribute("aria-expanded", String(!folded));
    fold.title = folded ? "왼쪽 창 펴기" : "왼쪽 창 접기";
  }
  function saveFold() { try { storage?.setItem(FOLD_KEY, JSON.stringify({ tab: leftTab, folded: foldState.folded })); } catch { /* 이번 화면만 */ } }
  const AUTO_FOLD = ["msn", "vendor"];       // 11-06: 메신저·거래처 탭은 들어가면 접힘이 기본 (슬롯을 넓게)
  function showLeft(tab, { open = false } = {}) {
    leftTab = tab;
    if (open) foldState.folded = false;     // 로그인·설정으로 바로 가는 버튼은 펼쳐서 보여 줌
    setFold(open ? false : AUTO_FOLD.includes(tab) ? true : foldState.folded);
    saveFold();
    $$("[data-left-tab]").forEach((b) => { const on = b.dataset.leftTab === tab; b.classList.toggle("active", on); b.setAttribute("aria-selected", String(on)); });
    $$("[data-left-panel]").forEach((p) => { p.hidden = p.dataset.leftPanel !== tab; });
    $("#cs-main")?.style.setProperty("--tab-color", TAB_COLORS[tab] || TAB_COLORS.main);   // 11-06: 탭 줄이 맨 위로 — 색은 본문 전체에
    if (RIGHT_TITLES[tab]) showRight(tab);
    if (tab === "settings" && state.connected && !state.sample) loadUsage();
    if (tab === "ship") openShip();
    if (tab === "settings" && !state.update) checkUpdate({ quiet: true });
  }

  const RIGHT_TITLES = { board: "📋 게시판 답변", review: "⭐ 리뷰 답글", msn: "💬 메신저 답변", vendor: "📦 거래처 메신저", ship: "🚚 배송사진" };
  function showRight(tab) {
    $$("[data-right-panel]").forEach((p) => { p.hidden = p.dataset.rightPanel !== tab; });
    const title = $("[data-right-title]");
    if (title) { title.textContent = RIGHT_TITLES[tab] || RIGHT_TITLES.board; title.dataset.tone = tab; }
    const line = $("#cs-right-line");
    if (line) line.style.background = TAB_COLORS[tab] || TAB_COLORS.board;
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
    // 2026-11-03: 요청을 보내는 몇 초 동안은 잠깐 못 누르게만(흐리게) — 빨간 "아직 작동 안 함" 표시로 번쩍이지 않게
    $$("[data-job], [data-live]").forEach((el) => {
      if (on && state.requesting) {
        el.disabled = true;
        el.classList.remove("is-pending");
        el.classList.add("is-busy");
        el.title = "요청 보내는 중…";
        return;
      }
      el.classList.remove("is-busy");
      setLive(el, on, reason);
    });
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
    // 11-06: 연결된 상태면 비밀번호 칸 없이 "🟢 연결중" (연결 버튼 = 이름 저장, [지우기] = 연결 끊기)
    const linked = !!(state.token && state.connected && !state.sample);
    const pwLabel = $("#cs-token-input")?.closest("label");
    if (pwLabel) pwLabel.hidden = linked;
    const saveBtn = $("#cs-token-save");
    if (saveBtn) saveBtn.textContent = linked ? "이름 저장" : "연결";
    const clearBtn = $("#cs-token-clear");
    if (clearBtn) clearBtn.textContent = linked ? "연결 끊기" : "지우기";
    if (tokenState) {
      tokenState.textContent = state.token ? (state.connected ? "🟢 연결중" : "저장됨 (연결 안 됨)") : "저장된 비밀번호 없음";
      tokenState.classList.toggle("cs-token-on", linked);
    }
    if (ai) ai.textContent = !state.connected ? "연결 후 확인" : state.aiEnabled ? "사용 가능 (시트에 키 등록됨)" : "키 없음 — 스크립트 속성 CLAUDE_KEY 등록 필요";
  }

  // 리뷰 수집이 로그인 문제로 실패했어도 그 뒤 로그인이 성공했으면 true (옛 경고 숨김용)
  function reviewLoginFixed(vendor, r) {
    if (!r || r.state === "ok" || !/로그인|인증/.test(String(r.state || ""))) return false;
    return csLoginBoth(vendor, { jobs: state.jobs, last: state.collector?.last, reviewLast: state.collector?.reviewLast }).review === true;
  }

  // 경고 칸 → 연결 버튼처럼 (data-pc="conn") · part = all | board | review | null(보통 칸으로)
  const LOGIN_RE = /로그인|인증/;
  const CONN_LABEL = { all: "전체연결 (로그인 → 게시판 → 리뷰 수집)", board: "게시판 연결 (로그인)", review: "리뷰 연결 (로그인)" };
  function setLoginLink(el, vendor, part) {
    const on = !!part && live();
    el.classList.toggle("is-login-link", on);
    if (!on) {
      if (el.dataset.pc === "conn") { delete el.dataset.pc; delete el.dataset.conn; delete el.dataset.connVendor; el.removeAttribute("role"); el.removeAttribute("tabindex"); }
      return;
    }
    Object.assign(el.dataset, { pc: "conn", conn: part, connVendor: vendor });
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    if (part === "all") el.classList.toggle("is-clickable", !state.requesting);
    el.textContent = `${el.textContent}\n🔑 눌러서 ${part === "all" ? "전체연결" : part === "board" ? "게시판 연결" : "리뷰 연결"}`;
    el.title = [`눌러서 ${CONN_LABEL[part]} — 수집기(마스터) PC에서 로그인 시도`, el.title].filter(Boolean).join(" / ");
  }

  // 11-06: 해결된 로그인 안내는 칸 대신 로그에 한 번만
  const quietLogged = new Set();
  function quietLog(key, text) {
    if (quietLogged.has(`${key}|${text}`)) return;
    quietLogged.add(`${key}|${text}`);
    log(text);
  }
  function renderVendorStatus() {
    const last = state.collector?.last;
    const reviewLast = state.collector?.reviewLast;
    for (const vendor of VENDORS) {
      const cells = $$(`[data-vendor-status="${vendor}"]`);
      if (!cells.length) continue;
      const cell = { set textContent(v) { cells.forEach((c) => { c.textContent = v; }); }, set className(v) { cells.forEach((c) => { c.className = v; }); }, set title(v) { cells.forEach((c) => { c.title = v; }); } };
      const rows = state.rows.filter((row) => row.vendor === vendor && !row.closed && row.kind === "문의");
      cells.forEach((c) => setLoginLink(c, vendor, null));
      if (!state.sample && !state.connected) { cell.textContent = "아직 수집 전"; cell.className = "cs-vendor-status"; continue; }
      if (state.sample) { cell.textContent = `가상 문의 ${rows.length}건`; continue; }
      const v = last?.vendors.find((x) => x.vendor === vendor);
      const r = reviewLast?.vendors.find((x) => x.vendor === vendor);
      const login = csLoginStatus(vendor, { jobs: state.jobs, last, saved: (state.sample ? null : state.collector?.setup)?.savedLogins?.includes(vendor) });
      const fixed = v && v.state !== "ok" && login.changed && login.ok;   // 지난 수집은 실패였지만 그 뒤 로그인 성공 → 해결 표시 (바뀌었을 때만)
      // 11-06: 칸에는 로그인이 필요할 때만 로그인 안내 — 해결된 것은 로그에만
      const line1 = fixed ? `문의 ${rows.length}건` : v ? (v.state === "ok" ? `✓ ${v.count}건` : `⚠ ${v.state}`) : `문의 ${rows.length}건`;
      if (fixed) quietLog(`${vendor} 문의`, `${vendor}: 지난 문의 수집은 ${v.state} → 그 뒤 로그인 됨 (${login.text.replace(/^✓ 로그인됨 \(|\)$/g, "")}) — 다음 수집부터 반영`);
      const line2 = last?.at ? `문의 수집 ${last.at.slice(5)}` : "수집 기록 없음";
      const rFixed = reviewLoginFixed(vendor, r);   // 11-06: 지난 리뷰 수집은 로그인 필요였지만 그 뒤 로그인 성공 → 옛 경고 숨김
      // 11-06: 리뷰는 수집 시각이 따로 — 문의 시각과 섞이지 않게 셋째 줄
      const line3 = r && r.state !== "미지원" && r.state !== "ok" && !rFixed && reviewLast?.at ? `\n리뷰 ⚠ ${r.state} · ${reviewLast.at.slice(5)}` : "";   // 리뷰는 문제가 있을 때만
      if (rFixed) quietLog(`${vendor} 리뷰`, `${vendor}: 지난 리뷰 수집은 ${r.state} (${reviewLast?.at?.slice(5) || ""}) → 그 뒤 로그인 됨 — 다음 리뷰 수집부터 반영`);
      cell.textContent = `${line1}\n${line2}${line3}`;
      cell.className = `cs-vendor-status${v && v.state !== "ok" && !fixed ? " is-bad" : ""}`;
      cell.title = [fixed ? "" : v?.note, rFixed ? "" : r?.note].filter(Boolean).join(" / ");
      // 11-06: 로그인 경고 문구를 누르면 그 메뉴에 맞는 연결 — 메인보드 = 전체연결 · 게시판 탭 = 게시판 연결 · (게시판 탭의 리뷰 줄만 경고면 리뷰 연결)
      const boardNeed = !!v && !fixed && LOGIN_RE.test(String(v.state || ""));
      const reviewNeed = !!r && !rFixed && LOGIN_RE.test(String(r.state || ""));
      cells.forEach((c) => setLoginLink(c, vendor, c.closest("[data-login-grid]") ? (boardNeed || reviewNeed ? "all" : null) : boardNeed ? "board" : reviewNeed ? "review" : null));
    }
    // ⭐ 리뷰 탭 업체 칸: 지난 리뷰 수집 결과
    for (const vendor of VENDORS) {
      const el = document.querySelector(`[data-review-status="${vendor}"]`);
      if (!el) continue;
      const rows = state.rows.filter((row) => row.vendor === vendor && !row.closed && row.kind === "리뷰");
      if (state.sample) { el.textContent = `가상 리뷰 ${rows.length}건`; el.className = "cs-vendor-status"; continue; }
      if (!state.connected) { el.textContent = "아직 수집 전"; el.className = "cs-vendor-status"; continue; }
      const r = reviewLast?.vendors.find((x) => x.vendor === vendor);
      const rFixed = reviewLoginFixed(vendor, r);
      el.textContent = `${r ? (r.state === "ok" ? `✓ ${r.count}건` : rFixed ? `리뷰 ${rows.length}건` : `⚠ ${r.state}`) : `리뷰 ${rows.length}건`}\n${reviewLast?.at ? `마지막 수집 ${reviewLast.at.slice(5)}` : "수집 기록 없음"}`;
      el.className = `cs-vendor-status${r && r.state !== "ok" && r.state !== "미지원" && !rFixed ? " is-bad" : ""}`;
      el.title = rFixed ? "" : r?.note || "";
      setLoginLink(el, vendor, r && !rFixed && LOGIN_RE.test(String(r.state || "")) ? "review" : null);   // 리뷰 탭 = 리뷰 연결
    }
  }

  // 2026-11-04: [🔑 직접 로그인] 버튼 옆 로그인 상태 — 버튼이 늘 보여서 "로그인 안 된 건가" 헷갈리지 않게
  // 스마트스토어 = 리뷰용 판매자센터 로그인이라 리뷰 수집 결과와 비교 (게시판 문의는 API)
  // 2026-11-04 밤: 메인보드 로그인 현황 — 업체마다 [전체연결] · [게시판 연결] · [리뷰 연결] (+ 스마트스토어 [API 설정])
  //  글씨: 연결 전 = 빨강 · 연결중(요청 대기·실행 중) = 회색 · 연결완료 = 검정. 게시판·리뷰 중 하나라도 풀리면 [전체연결] 빨강
  const activeJob = (kind, vendor) => state.jobs.some((j) => j.kind === kind && (j.status === "대기" || j.status === "실행중") && (!(j.vendors || []).length || j.vendors.includes(vendor)));
  function connView(vendor) {
    const st = csLoginBoth(vendor, { jobs: state.jobs, last: state.collector?.last, reviewLast: state.collector?.reviewLast });
    const loginBusy = activeJob("login", vendor);
    const apiBusy = vendor === "스마트스토어" && state.jobs.some((j) => j.kind === "apiTest" && (j.status === "대기" || j.status === "실행중"));
    const mode = (busy, ok) => (busy ? "ing" : ok === true ? "ok" : "req");
    return {
      all: mode(loginBusy, st.ok),
      board: mode(vendor === "스마트스토어" ? apiBusy : loginBusy, st.board),
      review: mode(loginBusy, st.review),
    };
  }
  // 11-04 밤: 카드 자체가 [전체연결] (부분 버튼 밖을 누르면) — 상태는 부분 버튼(게시판·리뷰)에만 표시
  function renderConnectButtons() {
    document.querySelectorAll('[data-login-grid] [data-conn="all"]').forEach((card) => card.classList.toggle("is-clickable", live() && !state.requesting));
    document.querySelectorAll('[data-login-grid] button[data-conn]').forEach((btn) => {
      const mode = live() ? connView(btn.dataset.connVendor)[btn.dataset.conn] : "req";
      const label = btn.querySelector(".cs-conn-state");
      if (label) label.textContent = mode === "ing" ? "연결중" : mode === "ok" ? "연결완료" : "연결요청";
      btn.classList.toggle("cs-conn-req", mode === "req");
      btn.classList.toggle("cs-conn-ing", mode === "ing");
      btn.classList.toggle("cs-conn-ok", mode === "ok");
    });
  }

  // 연결 버튼: 전체 = 로그인 → 게시판 → 리뷰 수집까지(둘 다 확인) · 게시판/리뷰 = 그 부분만 (스마트스토어 게시판 = 커머스 API 연결 확인)
  async function requestConn(vendor, part) {
    if (!vendor) return;
    if (part === "board" && vendor === "스마트스토어") { await requestPc("apiTest", {}, "스마트스토어 게시판(커머스 API) 연결 확인을 요청했습니다"); return; }
    const manual = CS_MANUAL_LOGIN.includes(vendor) ? " — 막히면 수집기 PC 크롬 창에서 직접 로그인 (되면 창 자동으로 닫힘)" : "";
    const what = part === "all" ? "전체연결(로그인 → 게시판 → 리뷰 수집)" : part === "board" ? "게시판 연결(로그인)" : "리뷰 연결(로그인)";
    await requestPc("login", { vendors: [vendor], creds: {}, collectAfter: part === "all" }, `${vendor} ${what} 요청을 보냈습니다${manual}`);
  }

  function renderLoginBadges() {
    renderConnectButtons();
    document.querySelectorAll("[data-login-badge]").forEach((el) => {
      const vendor = el.dataset.loginBadge;
      if (state.sample || !state.connected) { el.textContent = ""; el.className = "cs-login-badge"; return; }
      const last = vendor === "스마트스토어" ? state.collector?.reviewLast : state.collector?.last;
      const st = csLoginStatus(vendor, { jobs: state.jobs, last });
      el.textContent = st.ok === null ? "로그인 기록 없음" : st.ok ? st.text : `⚠ ${st.text}`;
      el.className = `cs-login-badge${st.ok === true ? " is-ok" : st.ok === false ? " is-bad" : ""}`;
      el.title = st.note || "";
    });
  }

  let warned = "";
  function warnCollectorProblems() {
    const items = [...(state.collector?.last?.vendors || []).map((v) => ({ ...v, kind: "" })), ...(state.collector?.reviewLast?.vendors || []).map((v) => ({ ...v, kind: " 리뷰" }))]
      .filter((v) => v.state && v.state !== "ok" && v.state !== "미지원")
      .filter((v) => !(v.kind ? reviewLoginFixed(v.vendor, v) : v.state === "로그인 필요" && csLoginStatus(v.vendor, { jobs: state.jobs, last: state.collector?.last }).ok === true)); // 그 뒤 로그인 성공 = 해결
    const text = items.map((v) => `${v.vendor}${v.kind}: ${v.state}${v.note ? ` (${v.note})` : ""}`).join(" / ");
    if (text && text !== warned) log(`수집기 확인 필요 — ${text}${items.some((v) => v.state === "로그인 필요") ? " → [🔑 로그인] (이 화면에서)" : ""}`, true);
    warned = text;
  }

  function renderJobs() {
    const box = $("#cs-jobs");
    if (!box) return;
    box.innerHTML = live() ? jobsHtml(state.jobs, state.collector) : `<p class="cs-note">${state.sample ? "가상셋팅 중에는 요청을 보내지 않습니다." : "시트 연결 후 보입니다."}</p>`;
    renderProgress();
    remoteSync();
  }

  // ---------- 🧩 원격 로그인 (11-06 · 시트 v11 · 웹연결 1.19) ----------
  //  로그인 요청이 실행 중이면 3초마다 수집기 PC 로그인 창 그림을 확인 → 있으면 작은 창으로 보여 줌
  //  정답 칸에 넣고 [정답 넣고 로그인] → 수집기 PC가 몇 초 안에 정답 칸에 넣고 [로그인] · 그림을 누르면 그 자리를 수집기 PC 창에서 누름
  //  퀴즈를 푸는 건 사람 (AI·자동 풀이 없음)
  const remote = { job: "", at: "", timer: 0, busy: false, closed: new Set() };
  const remoteJob = () => (live() ? state.jobs.find((j) => j.kind === "login" && j.status === "실행중") : null);
  function remoteSync() {
    const job = remoteJob();
    if (!job) { window.clearInterval(remote.timer); remote.timer = 0; remote.job = ""; const box = $("#cs-remote"); if (box) box.hidden = true; return; }
    if (remote.job !== job.id) { remote.job = job.id; remote.at = ""; }
    if (!remote.timer) { remote.timer = window.setInterval(remotePoll, 3000); remotePoll(); }
  }
  async function remotePoll() {
    const job = remoteJob();
    if (!job) { remoteSync(); return; }
    if (remote.busy || remote.closed.has(job.id)) return;
    remote.busy = true;
    try {
      const r = await post({ action: "loginShotGet", id: job.id });
      if (r.shot) showRemote(job, r.shot, r.pending);
    } catch { /* 옛 시트(v10)면 조용히 */ } finally { remote.busy = false; }
  }
  function showRemote(job, shot, pending) {
    const box = $("#cs-remote");
    if (!box) return;
    box.hidden = false;
    $("#cs-remote-title").textContent = `🧩 원격 로그인 — ${shot.vendor || "로그인"} (수집기 PC 화면)`;
    const img = $("#cs-remote-img");
    if (remote.at !== shot.at) { remote.at = shot.at; img.src = shot.image; }
    const ago = Math.max(0, Math.round((Date.now() - Date.parse(shot.at)) / 1000));
    $("#cs-remote-state").textContent = `${Number.isFinite(ago) ? `${ago}초 전 화면` : "화면"}${pending ? " · 보낸 것을 수집기 PC가 넣는 중…" : ""}`;
  }
  async function remoteSend(extra) {
    const job = remoteJob();
    if (!job) { toast("실행 중인 로그인 요청이 없습니다."); return; }
    try {
      await post({ action: "loginAnswer", id: job.id, editor: state.editor, ...extra });
      $("#cs-remote-state").textContent = "보냄 — 수집기 PC가 몇 초 안에 넣습니다";
      window.setTimeout(remotePoll, 1500);
    } catch (error) { toast(error.message || "보내지 못했습니다."); }
  }
  function bindRemote() {
    const box = $("#cs-remote");
    if (!box) return;
    $("#cs-remote-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = $("#cs-remote-answer");
      const answer = String(input?.value || "").trim();
      if (!answer) { toast("퀴즈 정답을 넣어 주세요."); return; }
      remoteSend({ answer, submit: e.submitter?.dataset?.remoteSubmit !== "0" });
      input.value = "";
    });
    $("#cs-remote-img")?.addEventListener("click", (e) => {
      const img = e.currentTarget;
      const box = img.getBoundingClientRect();   // 11-09: 화면 90%(zoom) — 마우스 자리(화면 px) → 그림 안 CSS px
      const z = img.offsetWidth ? box.width / img.offsetWidth : 1;
      const pt = csShotPoint((e.clientX - box.left) / z - img.clientLeft, (e.clientY - box.top) / z - img.clientTop, img.clientWidth, img.clientHeight, img.naturalWidth, img.naturalHeight);
      if (pt) remoteSend({ click: pt });
    });
    $("#cs-remote-close")?.addEventListener("click", () => { if (remote.job) remote.closed.add(remote.job); box.hidden = true; });
  }

  // ---------- 진행 작은 창 (2026-11-04: 수집 중·로그인 중에 화면 오른쪽 아래) ----------
  const progress = { seen: new Map(), done: null, hidden: "", timer: null };
  function renderProgress() {
    const box = $("#cs-progress");
    if (!box) return;
    const jobs = live() ? state.jobs.filter((j) => PROGRESS_KINDS.includes(j.kind)) : [];
    const active = jobs.filter((j) => j.status === "대기" || j.status === "실행중");
    for (const j of jobs) {                     // 보던 요청이 끝나면 결과를 잠깐 보여 줌
      const before = progress.seen.get(j.id);
      if (before && (before === "대기" || before === "실행중") && (j.status === "완료" || j.status === "실패")) progress.done = { job: j, until: now() + 8000 };
      progress.seen.set(j.id, j.status);
    }
    if (progress.done && progress.done.until < now()) progress.done = null;
    const run = active.find((j) => j.status === "실행중") || active[active.length - 1];
    const view = run ? csProgressView(run, { now: now(), waiting: active.length - 1, collector: state.collector }) : progress.done ? csProgressView(progress.done.job, { now: now() }) : null;
    const show = !!view && view.id !== progress.hidden;
    box.hidden = !show;
    box.className = `cs-progress${show ? ` is-${view.tone}` : ""}`;
    box.innerHTML = show ? csProgressHtml(view) : "";
    window.clearTimeout(progress.timer);
    if (show) progress.timer = window.setTimeout(renderProgress, 1000);
  }

  // ---------- 🚀 처음 설정 안내 (수집기 [설정] 탭 원터치 설정 + 떠 있는 안내창을 웹으로) ----------
  function guideContext() {
    return { connected: state.connected && !state.sample, token: state.token, aiEnabled: state.aiEnabled, collector: state.sample ? null : state.collector };
  }

  function renderSetup() {
    const steps = setupSteps(guideContext());
    const { done, total } = setupProgress(steps);
    const progress = $("#cs-guide-progress");
    if (progress) progress.textContent = `${done}/${total} 완료`;
    const count = $("#cs-guide-count");
    if (count) count.textContent = `${done}/${total} 완료`;
    const body = $("#cs-guide-body");
    if (body && !$("#cs-guide")?.hidden) body.innerHTML = guideStepsHtml(steps, { live: live() && !state.requesting, focus: state.guideFocus });
    const view = collectorSettingsView(state.sample ? null : state.collector);
    const note = $("#cs-set-note");
    if (note) note.textContent = view ? `${view.note} — [설정 저장]을 누르면 수집기 PC 설정이 바뀝니다` : "수집기 PC가 연결되면 현재 값이 보입니다. [설정 저장]을 누르면 수집기 PC 설정이 바뀝니다.";
    // 수집기 PC가 알려 준 현재 값으로 채움 (고치는 중인 칸은 그대로)
    const fill = (selector, value) => {
      const el = $(selector);
      if (!el || !view || el.dataset.dirty) return;
      if (el.type === "checkbox") el.checked = !!value;
      else el.value = value ?? "";
    };
    const outDir = $("#cs-set-outdir");
    if (outDir && view) { outDir.value = view.outDir; outDir.classList.remove("is-pending"); outDir.title = "결과 저장 폴더는 수집기 PC 위치라 보기만 합니다"; }
    fill("#cs-set-days", view?.days);
    fill("#cs-board-days", view?.days);   // 11-06: 게시판 탭 [최근 ○일] = 설정의 수집 기간
    fill("#cs-set-review-days", view?.reviewDays);
    fill("#cs-set-slug", view?.zzSlug);
    fill("#cs-set-browser", view?.showBrowser);
    renderPcPanels();
    renderUpdate();
  }

  // ---------- 수집기 PC에 시키는 일 (로그인·설정·자동 수집·API·IP·파일) ----------
  const setupNow = () => (state.sample ? null : state.collector?.setup) || null;

  async function requestPc(kind, options = {}, done = "") {
    if (!live() || state.requesting) return null;
    let payload;
    try { payload = csPcPayload(kind, options, state.editor); } catch (error) { toast(error.message); return null; }
    state.requesting = true;
    renderLiveControls();
    try {
      const result = await post(payload);
      applyJobs(result);
      const label = result.job?.label || kind;
      const offline = state.collector?.state === "off";
      toast(result.duplicate ? `이미 ${label} 요청이 있습니다 — 끝날 때까지 기다려 주세요.` : `${done || `${label} 요청을 보냈습니다`}${offline ? " — 수집기 PC가 꺼져 있어 켜지면 실행합니다" : " — 수집기 PC가 곧 실행합니다"}.`);
      log(`${label} 요청${result.duplicate ? " — 이미 대기 중" : ""}`);
      return result;
    } catch (error) {
      if (error.denied) handleDenied(error);
      toast(`요청 실패: ${error.message}`);
      log(`요청 실패: ${error.message}`, true);
      return null;
    } finally {
      state.requesting = false;
      renderBoard();
    }
  }

  const AUTO_INTERVALS = [10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 360, 720, 1440];
  function fillSelect(el, values, label) {
    if (!el || el.options.length) return;
    el.innerHTML = values.map((v) => `<option value="${v}">${label(v)}</option>`).join("");
  }

  function renderPcPanels() {
    const su = setupNow();
    // 자동 수집
    const hour = $("#cs-auto-hour"), minute = $("#cs-auto-minute"), interval = $("#cs-auto-interval");
    fillSelect(hour, Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")), (v) => v);
    fillSelect(minute, Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0")), (v) => v);
    fillSelect(interval, AUTO_INTERVALS, (v) => (v >= 60 && v % 60 === 0 ? `${v / 60}시간` : `${v}분`));
    if (su?.autoStart && hour && !hour.dataset.dirty) {
      const [hh, mm] = su.autoStart.split(":");
      hour.value = hh; if (minute && !minute.dataset.dirty) minute.value = String(Math.round(Number(mm) / 5) * 5 % 60).padStart(2, "0");
    }
    if (su?.interval && interval && !interval.dataset.dirty) interval.value = String(AUTO_INTERVALS.includes(su.interval) ? su.interval : 60);
    const toggle = $("#cs-auto-toggle");
    if (toggle) toggle.textContent = su?.autoOn ? "자동 수집 끄기" : "자동 수집 켜기";
    const autoNote = $("#cs-auto-note");
    if (autoNote) {
      autoNote.textContent = !su ? "자동 수집: 수집기 PC 연결 후 켜고 끌 수 있습니다 (수집기 PC 웹연결이 창 없이 실행)"
        : su.autoOn ? `자동 수집: 켜짐 · 다음 수집 ${su.nextAuto || "계산 중"} · ${su.autoStart} 시작 ${su.interval}분 간격 (수집기 PC 웹연결이 실행 — 수집기 창은 안 열어도 됨)`
          : "자동 수집: 꺼짐 — 시작 시간·간격을 고르고 [자동 수집 켜기]";
      autoNote.classList.toggle("cs-auto-on", !!su?.autoOn);
    }
    // API
    const apiState = $("#cs-api-state");
    if (apiState) apiState.textContent = !su ? "저장된 키: 수집기 PC 연결 후 확인" : su.api === "own" ? "저장된 키: ✓ 수집기 PC에 저장된 키 사용 중" : su.api === "e1" ? "저장된 키: E_1 스마트스토어 API 설정 사용 중 (여기서 새로 저장하면 그 키를 씁니다)" : "저장된 키: 없음 — 아래에 넣고 [저장]";
    const apiResult = $("#cs-api-result");
    if (apiResult) {
      const last = [latestJob(state.jobs, "apiKey"), latestJob(state.jobs, "apiTest"), latestJob(state.jobs, "ip")].filter(Boolean).sort((a, b) => String(b.ended || b.at).localeCompare(String(a.ended || a.at)))[0];
      const running = state.jobs.find((j) => ["apiKey", "apiTest", "ip"].includes(j.kind) && isJobActive(j));
      apiResult.textContent = running ? `${running.label} ${running.status}…${running.message ? ` ${running.message}` : ""}` : last ? `${last.label}: ${last.message}` : "";
    }
    // 파일 목록
    const files = $("#cs-files");
    const lastFiles = latestJob(state.jobs, "files");
    if (files) {
      const list = lastFiles?.data?.files || [];
      files.hidden = !lastFiles;
      if (lastFiles) files.innerHTML = `<div class="cs-note">${escapeHtml(lastFiles.message)} · ${escapeHtml(shortDate(lastFiles.ended || lastFiles.at))} 기준</div>`
        + (list.length ? `<table class="cs-files-table"><thead><tr><th>파일</th><th>크기</th><th>시각</th></tr></thead><tbody>${list.map((f) => `<tr><td>${escapeHtml(f.name)}</td><td>${Math.max(1, Math.round((Number(f.size) || 0) / 1024))}KB</td><td>${escapeHtml(f.at)}</td></tr>`).join("")}</tbody></table>` : "");
    }
  }

  // ⬆ 웹연결 업데이트: 저장소 main 의 최신 커밋 파일 → 확인값(sha256)·버전 → 수집기 PC에 요청
  function currentLinkVersion() {
    const su = setupNow();
    if (su?.link) return su.link;
    return (String(state.collector?.version || "").match(/연결 ([0-9.]+(?: \([^)]*\))?)/) || [])[1] || "";
  }

  async function checkUpdate({ quiet = false } = {}) {
    try {
      const commit = await doFetch(`https://api.github.com/repos/${LINK_REPO}/commits/main`, { headers: { Accept: "application/vnd.github+json" } }).then((r) => {
        if (!r.ok) throw new Error(`GitHub 응답 ${r.status}`);
        return r.json();
      });
      const url = linkRawUrl(commit.sha);
      const bytes = new Uint8Array(await doFetch(url).then((r) => {
        if (!r.ok) throw new Error(`파일 받기 ${r.status}`);
        return r.arrayBuffer();
      }));
      const digest = new Uint8Array(await window.crypto.subtle.digest("SHA-256", bytes));
      const sha256 = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
      const ver = linkVersionOf(new TextDecoder().decode(bytes));
      if (!ver) throw new Error("웹연결 파일이 아닙니다");
      state.update = { url, sha256, ver, commit: commit.sha.slice(0, 7), at: clock() };
      if (!quiet) toast(`최신 웹연결: ${ver.split(" ")[0]}`);
    } catch (error) {
      state.update = { error: error.message, at: clock() };
      if (!quiet) toast(`최신 버전 확인 실패: ${error.message}`);
    }
    renderUpdate();
  }

  function renderUpdate() {
    const note = $("#cs-update-state");
    const run = $("#cs-update-run");
    if (!note || !run) return;
    const cur = currentLinkVersion();
    const u = state.update;
    const busy = state.jobs.find((j) => j.kind === "update" && isJobActive(j));
    const newer = !!(u?.ver && cur && linkVersionNewer(u.ver, cur));
    note.textContent = `수집기 PC 버전: ${cur ? cur.split(" ")[0] : "확인 전 (수집기 PC 연결 후)"}`
      + (u?.error ? ` · 최신 확인 실패 (${u.error})` : u?.ver ? ` · 최신: ${u.ver.split(" ")[0]} (${u.commit}, ${u.at} 확인)${newer ? " — 새 버전 있음" : " — 최신입니다"}` : "")
      + (busy ? ` · 업데이트 ${busy.status}…` : "");
    const on = live() && newer && !busy && !state.requesting;
    run.disabled = !on;
    run.classList.toggle("is-pending", !on);
    run.textContent = newer ? `⬆ 업데이트 (${cur.split(" ")[0]} → ${u.ver.split(" ")[0]})` : "⬆ 업데이트";
  }

  function runUpdate() {
    const u = state.update;
    if (!u?.sha256) return;
    requestPc("update", { url: u.url, sha256: u.sha256, ver: u.ver }, `웹연결 ${u.ver.split(" ")[0]} 업데이트 요청을 보냈습니다`);
  }

  function saveSettings() {
    const num = (sel) => Number($(sel)?.value);
    const settings = {};
    if (num("#cs-set-days") >= 1) settings.days = Math.trunc(num("#cs-set-days"));
    if (num("#cs-set-review-days") >= 1) settings.review_days = Math.trunc(num("#cs-set-review-days"));
    const slug = String($("#cs-set-slug")?.value || "").trim();
    if (slug) settings.zz_slug = slug;
    settings.show_browser = !!$("#cs-set-browser")?.checked;
    requestPc("settings", { settings }, "설정 저장 요청을 보냈습니다").then((r) => {
      if (r) ["#cs-set-days", "#cs-set-review-days", "#cs-set-slug", "#cs-set-browser"].forEach((sel) => { const el = $(sel); if (el) delete el.dataset.dirty; });
    });
  }

  function saveAuto(on) {
    const settings = autoSettings({ on, hour: $("#cs-auto-hour")?.value, minute: $("#cs-auto-minute")?.value, interval: $("#cs-auto-interval")?.value });
    requestPc("settings", { settings }, on ? `자동 수집 켜기 요청을 보냈습니다 (${settings.auto_start} 시작 ${settings.interval}분 간격)` : "자동 수집 끄기 요청을 보냈습니다").then((r) => {
      if (r) ["#cs-auto-hour", "#cs-auto-minute", "#cs-auto-interval"].forEach((sel) => { const el = $(sel); if (el) delete el.dataset.dirty; });
    });
  }

  async function saveApiKey() {
    const idBox = $("#cs-api-id"), secretBox = $("#cs-api-secret");
    const id = String(idBox?.value || "").trim(), secret = String(secretBox?.value || "").trim();
    if (!id || !secret) { toast("Client ID 와 Client Secret 을 둘 다 넣어 주세요."); return; }
    try {
      const pub = setupNow()?.pubKey;
      const options = { clientId: await lockForPc(pub, id), secret: await lockForPc(pub, secret) };
      idBox.value = ""; secretBox.value = "";
      await requestPc("apiKey", options, "API 키를 잠가서 보냈습니다 (수집기 PC에만 저장)");
    } catch (error) {
      toast(error.message);
    }
  }

  // 🔑 판매자센터 로그인 (2026-11-04: 메인보드 안에 늘 펼쳐 둠 — 창 아님)
  //  고르거나 입력하는 중(loginDirty)에는 다시 그리지 않고 상태 글자만 바꿈
  let loginDirty = false;
  const loginOpen = new Map();   // 11-06: [자세히]/[접기]로 고른 업체 줄 (업체 → 펼침 여부)
  function openLogin(vendor = "") {
    showLeft("main", { open: true });
    if (vendor) loginOpen.set(vendor, true);
    renderLogin({ vendor, force: true });
    const box = $("#cs-login");
    if (box && "open" in box) box.open = true;   // 11-06: 접혀 있으면 펼침
    box?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    if (vendor) box?.querySelector(`[data-login-row="${vendor}"]`)?.classList.add("is-flash");
  }

  function renderLogin({ vendor = "", force = false } = {}) {
    const box = $("#cs-login");
    if (!box) return;
    if (!live()) {
      $("#cs-login-body").innerHTML = `<p class="cs-note">${state.sample ? "가상셋팅 중에는 로그인 요청을 보내지 않습니다." : "시트 연결 후 업체별 로그인 상태가 보입니다."}</p>`;
      loginDirty = false;
      return;
    }
    if (loginDirty && !force) return;
    const su = setupNow();
    const lastInfo = state.collector?.last || null;
    // 2026-11-03: 업체별 상태 = 지난 수집 vs 그 뒤 로그인 결과 중 새 것. 해결된 업체는 "(바뀌었을 때만)" + 해결 메모(바뀌었을 때만)
    const status = Object.fromEntries(CS_LOGIN_VENDORS.map((v) => [v, csLoginStatus(v, { jobs: state.jobs, last: lastInfo, saved: su?.savedLogins?.includes(v) })]));
    // 2026-11-03: 스마트스토어는 문의 수집·답변을 커머스 API 로 함 → API 가 잡혀 있으면 로그인 필요 없음(네이버 2단계 인증·자동입력 방지에 막히는 로그인은 피함)
    const ssApi = !!su?.api;
    const needs = CS_LOGIN_VENDORS.filter((v) => status[v].ok === false && !(v === "스마트스토어" && ssApi));
    const kept = readLoginPick();
    const pick = vendor ? [...new Set([...(kept?.vendors || []), vendor])] : kept ? kept.vendors : needs;
    const collectBox = $("#cs-login-collect");
    if (collectBox && kept) collectBox.checked = kept.collect;
    const canLock = !!su?.pubKey;
    $("#cs-login-body").innerHTML = CS_LOGIN_VENDORS.map((v) => {
      const st = status[v];
      const saved = st.saved;
      const apiOnly = v === "스마트스토어" && ssApi;
      const done = st.resolved || saved || apiOnly;
      const manual = CS_MANUAL_LOGIN.includes(v);
      // 11-06: 업체 줄은 평소 한 줄(체크 + 이름 + 짧은 상태) — [자세히]를 누르면 안내·아이디·비밀번호
      const open = loginOpen.has(v) ? loginOpen.get(v) : pick.includes(v) && !done && !manual && !apiOnly;
      const mini = apiOnly ? "✓ API" : st.ok === true || saved ? "✓" : st.ok === false ? "⚠ 로그인 필요" : "—";
      return `<div class="cs-login-row${open ? " is-open" : ""}" data-login-row="${escapeHtml(v)}">
        <div class="cs-login-head">
          <label class="cs-check"><input type="checkbox" data-login-pick value="${escapeHtml(v)}"${pick.includes(v) ? " checked" : ""}> <b>${escapeHtml(v)}</b></label>
          <span class="cs-login-mini${mini.startsWith("⚠") ? " is-bad" : ""}" data-login-mini>${mini}</span>
          <button type="button" class="cs-login-more" data-login-more="${escapeHtml(v)}" aria-expanded="${open}">${open ? "접기 ▲" : "자세히 ▼"}</button>
        </div>
        <div class="cs-login-detail" data-login-detail${open ? "" : " hidden"}>
        <span class="cs-note${st.ok === false && !apiOnly ? " cs-login-bad" : ""}" data-login-state>${apiOnly ? "✓ 문의는 커머스 API 사용 중 (로그인 필요 없음) · 리뷰 수집만 판매자센터 로그인 필요" : escapeHtml(st.changed ? st.note : st.text)}${saved && !manual ? " · PC에 저장된 비밀번호 ✓" : ""}</span>
        ${manual ? `<p class="cs-note" data-login-manual>🙋 <b>자동 한 번 → 막히면 직접 로그인</b> — 수집기 PC에 <b>일반 크롬 창</b>이 뜨고 저장된 아이디·비밀번호로 한 번 로그인해 봅니다. 막히면 그 창에서 평소처럼 직접 로그인(퀴즈·2단계 인증 포함, 최대 5분)하시면, 로그인되는 순간 <b>창은 자동으로 닫힙니다</b>. 수집기 PC 앞에 계실 때 누르세요.</p>` : ""}<details${pick.includes(v) && !done && !manual ? " open" : ""}><summary>새 아이디·비밀번호 넣기${manual ? " (자동 시도용 — 처음 한 번)" : apiOnly ? " (지금은 필요 없음)" : done ? " (바뀌었을 때만)" : ""}</summary>
          ${canLock ? `<div class="cs-form cs-login-creds">
            ${v === "메이크샵" ? `<label class="cs-check"><input type="checkbox" data-login-sub${readShop() ? " checked" : ""}> <span>부운영자로 로그인 <small>(운영자와 따로 로그인 — 동시 로그인으로 튕기지 않음)</small></span></label>
            <label data-login-shop-wrap${readShop() ? "" : " hidden"}>상점 URL <input type="text" data-login-shop autocomplete="off" placeholder="예: pinkrocket.co.kr" value="${escapeHtml(readShop())}"></label>` : ""}
            <label>아이디 <input type="text" data-login-id autocomplete="off"></label>
            <label>비밀번호 <input type="password" data-login-pw autocomplete="new-password"></label>
          </div>` : `<p class="cs-note">수집기 PC 웹연결 1.3 이상이 켜져 있어야 비밀번호를 잠가 보낼 수 있습니다.</p>`}
        </details>
        </div>
      </div>`;
    }).join("");
    loginDirty = !!vendor;
  }

  function closeLogin() {
    const box = $("#cs-login");
    if (!box) return;
    box.querySelectorAll("input[data-login-id], input[data-login-pw]").forEach((el) => { el.value = ""; });
    loginDirty = false;
    renderLogin();
  }

  async function submitLogin() {
    const box = $("#cs-login");
    if (!live() || state.requesting) return;
    const vendors = [...box.querySelectorAll("[data-login-pick]:checked")].map((el) => el.value);
    if (!vendors.length) { toast("로그인할 업체를 고르세요."); return; }
    const creds = {};
    try {
      for (const v of vendors) {
        const row = box.querySelector(`[data-login-row="${v}"]`);
        const id = String(row?.querySelector("[data-login-id]")?.value || "").trim();
        const pw = String(row?.querySelector("[data-login-pw]")?.value || "");
        if (!id && !pw) continue;
        if (!id || !pw) { toast(`${v}: 아이디와 비밀번호를 둘 다 넣어 주세요.`); return; }
        let plainId = id;
        if (row?.querySelector("[data-login-sub]")?.checked) {    // 메이크샵 부운영자 (웹연결 1.5): 상점 URL 까지 함께 잠가 보냄
          const shop = String(row.querySelector("[data-login-shop]")?.value || "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
          if (!shop || /[|\s]/.test(shop) || id.includes("|")) { toast(`${v}: 부운영자는 상점 URL 을 넣어 주세요 (예: pinkrocket.co.kr).`); return; }
          plainId = `부운영자|${shop}|${id}`;
          writeShop(shop);
        }
        const pub = setupNow()?.pubKey;
        creds[v] = { id: await lockForPc(pub, plainId), pw: await lockForPc(pub, pw) };
      }
    } catch (error) {
      toast(error.message); return;
    }
    const collectAfter = !!$("#cs-login-collect")?.checked;
    writeLoginPick({ vendors, collect: collectAfter });
    closeLogin();
    const manualPick = vendors.filter((v) => CS_MANUAL_LOGIN.includes(v));
    await requestPc("login", { vendors, creds, collectAfter }, `${vendors.join("·")} 로그인 요청을 보냈습니다${collectAfter ? " (로그인되면 게시판 + 리뷰 수집)" : ""}${Object.keys(creds).length ? " (비밀번호는 잠가서)" : ""}${manualPick.length ? ` — ${manualPick.join("·")}: 자동으로 한 번 해 보고, 막히면 수집기 PC 크롬 창에서 직접 로그인 (창은 로그인되면 자동으로 닫힘)` : ""}`);
  }

  // 엑셀 내려받기 / 📥 엑셀 등록 (SheetJS — 피킹 화면과 같은 라이브러리)
  let xlsxPromise = null;
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxPromise) return xlsxPromise;
    xlsxPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
      script.async = true;
      script.addEventListener("load", () => (window.XLSX ? resolve(window.XLSX) : reject(new Error("엑셀 부품을 불러오지 못했습니다."))), { once: true });
      script.addEventListener("error", () => reject(new Error("엑셀 부품을 불러오지 못했습니다 — 인터넷 연결을 확인하세요.")), { once: true });
      document.head.appendChild(script);
    }).catch((error) => { xlsxPromise = null; throw error; });
    return xlsxPromise;
  }

  async function exportExcel(kind) {
    try {
      const sheet = csExcelSheet(state.rows, kind);
      if (!sheet.count) { toast(`내려받을 ${kind}가 없습니다.`); return; }
      const XLSX = await loadXlsx();
      const ws = XLSX.utils.aoa_to_sheet([sheet.header, ...sheet.body]);
      ws["!cols"] = sheet.header.map((h) => ({ wch: /문의|문안|답변안/.test(h) ? 40 : h.startsWith("키") ? 30 : 12 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, kind === "리뷰" ? "리뷰" : "게시판");
      const d = new Date(now());
      const stamp = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
      const bytes = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const url = window.URL.createObjectURL(new window.Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `CS_${kind === "리뷰" ? "리뷰" : "게시판"}_답변안_${stamp}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 5000);
      toast(`엑셀 ${sheet.count}건을 내려받았습니다 — "채택"(A~J)·"최종 문안"·"보류"만 고쳐서 [📥 엑셀 등록]`);
    } catch (error) {
      toast(error.message);
    }
  }

  let importKind = "문의";
  async function importExcel(file) {
    if (!file) return;
    try {
      const XLSX = await loadXlsx();
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const records = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false });
      const { changes, locked, unknown, bad } = csExcelChanges(state.rows.filter((r) => r.kind === importKind), records);
      const notes = [locked && `등록 중·완료라 건너뜀 ${locked}건`, unknown && `화면에 없는 줄 ${unknown}건`, bad && `채택 글자 오류 ${bad}건`].filter(Boolean).join(" · ");
      if (!changes.length) { toast(`바뀐 내용이 없습니다${notes ? ` (${notes})` : ""}.`); return; }
      const preview = changes.slice(0, 8).map((c) => `· ${findRow(c.key)?.vendor} ${findRow(c.key)?.id}: ${c.summary}`).join("\n");
      if (!window.confirm(`엑셀 내용 ${changes.length}건을 적용할까요?\n${preview}${changes.length > 8 ? "\n…" : ""}${notes ? `\n(${notes})` : ""}`)) return;
      for (const c of changes) setChoice(c.key, c.choice);
      renderBoard();
      toast(`엑셀 ${changes.length}건을 적용했습니다 — 자동 저장 중`);
      log(`📥 엑셀 등록 ${changes.length}건${notes ? ` (${notes})` : ""}`);
    } catch (error) {
      toast(`엑셀 등록 실패: ${error.message}`);
    }
  }

  function onPcClick(event) {
    const button = event.target.closest("[data-pc], [data-excel]");
    if (!button || button.disabled) return;
    const act = button.dataset.pc;
    if (act === "login") openLogin(button.dataset.loginVendor || "");
    else if (act === "conn") { if (button.dataset.conn !== "all" || button.classList.contains("is-clickable")) requestConn(button.dataset.connVendor, button.dataset.conn); }
    else if (act === "api-tab") { showLeft("settings", { open: true }); const m = $(".cs-master"); if (m) m.open = true; $("#cs-api-box")?.scrollIntoView?.({ block: "start", behavior: "smooth" }); }   // API 설정은 🖥 마스터 PC 설정 안 (접혀 있으면 펼침)
    else if (act === "apiKey") saveApiKey();
    else if (act === "apiTest" || act === "ip" || act === "files") requestPc(act);
    else if (button.dataset.excel === "export") exportExcel(button.dataset.excelKind);
    else if (button.dataset.excel === "import") { importKind = button.dataset.excelKind; const f = $("#cs-excel-file"); if (f) { f.value = ""; f.click(); } }
  }

  function openGuide(focusNext = false) {
    const box = $("#cs-guide");
    if (!box) return;
    const steps = setupSteps(guideContext());
    state.guideFocus = focusNext ? setupProgress(steps).next?.key || "" : "";
    box.hidden = false;
    renderSetup();
    if (state.guideFocus) {
      const el = box.querySelector(`[data-guide-step="${state.guideFocus}"]`);
      el?.scrollIntoView?.({ block: "nearest" });
      toast(setupProgress(steps).next ? `다음 할 일: ${setupProgress(steps).next.title}` : "처음 설정이 모두 끝났습니다 ✅");
    }
  }

  function onGuideClick(event) {
    const copy = event.target.closest("[data-guide-copy]");
    if (copy) {
      Promise.resolve(window.navigator?.clipboard?.writeText(copy.dataset.guideCopy))
        .then(() => toast("복사했습니다 — 수집기 PC에서 Win+R 에 붙여넣고 Enter"))
        .catch(() => toast("복사하지 못했습니다 — 글자를 직접 선택해 복사해 주세요."));
      return;
    }
    const button = event.target.closest("[data-guide-act]");
    if (!button || button.disabled) return;
    const act = button.dataset.guideAct;
    if (act === "close") { $("#cs-guide").hidden = true; state.guideFocus = ""; }
    else if (act === "focus-token") { showLeft("main", { open: true }); $("#cs-token-input")?.focus(); }
    else if (act === "open-login") openLogin();
    else if (act.startsWith("tab:")) showLeft(act.slice(4));
    else if (act.startsWith("job:")) requestJob(act.slice(4));
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
    return "<b>[🏠 메인보드]</b> 맨 위 웹 연결에 비밀번호를 입력하면 문의가 보입니다. (휴대폰·태블릿은 화면 아래쪽)";
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
    renderLoginBadges();
    renderLogin();
    renderConnection();
    renderLiveControls();
    renderJobs();
    renderSetup();
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

  // ---------- 🚚 배송사진 (11-10): 탭을 처음 열 때 불러옴 ----------
  let ship = null;
  async function postRaw(body) {
    const response = await doFetch(state.endpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ ...body, token: state.token }) });
    if (!response.ok) throw new Error(`시트 응답 오류 (${response.status})`);
    const json = await response.json();
    if (!json?.ok) { const error = new Error(String(json?.error || "CS 시트가 요청을 거절했습니다.")); if (json?.denied) error.denied = true; throw error; }
    return json;
  }
  function openShip() {
    if (ship) { if (!ship.state.loaded && !ship.state.loading) ship.load(); return; }
    ship = { state: { loaded: false, loading: true }, load() {} };
    import("./shipPhotosPanel.mjs?v=20261110-ship1")
      .then((m) => { ship = m.mountShipPhotos({ document, window, root: $("[data-ship]"), side: $("[data-ship-side]"), post: postRaw, isLive: () => state.connected && !state.sample }); ship.load(); })
      .catch((error) => { ship = null; toast(`배송사진 화면을 불러오지 못했습니다: ${error?.message || error}`); });
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

  // ---------- 💰 메이크샵 리뷰 적립금 설정 (시트 v10) ----------
  function pointLine(p = state.point) {
    return p.pct > 0 ? `실구매금액 × ${p.pct}% (${p.unit}원 미만 버림) · 사유 "${p.msg}"` : "0% — 답글만 (적립금 안 줌)";
  }
  function renderPoint() {
    const pct = $("#cs-point-pct"), msg = $("#cs-point-msg"), st = $("#cs-point-state");
    if (pct && msg && !state.pointDirty && document.activeElement !== pct && document.activeElement !== msg) {
      pct.value = String(state.point.pct);
      msg.value = state.point.msg;
    }
    if (st) st.textContent = `지금: ${pointLine()}${state.point.at ? ` · ${state.point.by || ""} ${state.point.at.slice(5, 16).replace("T", " ")} 저장` : ""}`;
    renderPointExample();
  }
  function renderPointExample() {
    const el = $("#cs-point-example");
    if (!el) return;
    const pct = Number($("#cs-point-pct")?.value ?? state.point.pct) || 0;
    el.textContent = pct > 0 ? `예) 실구매 4,277원 × ${pct}% = ${csPointAmount(4277, pct, state.point.unit).toLocaleString("ko-KR")}원 · 15,000원 × ${pct}% = ${csPointAmount(15000, pct, state.point.unit).toLocaleString("ko-KR")}원` : "0% 면 답글만 등록합니다.";
  }
  async function savePoint() {
    if (!live()) return;
    let body;
    try { body = csPointPayload({ pct: $("#cs-point-pct")?.value, msg: $("#cs-point-msg")?.value }, state.editor); } catch (error) { toast(error.message); return; }
    try {
      const result = await post(body);
      if (result.point) state.point = result.point;
      state.pointDirty = false;
      renderPoint();
      toast(`적립금 설정 저장 — ${pointLine()}`);
      log(`💰 메이크샵 리뷰 적립금: ${pointLine()}`);
    } catch (error) {
      if (error.denied) handleDenied(error);
      toast(`적립금 설정 저장 실패: ${error.message}`);
    }
  }

  // ---------- 📤 등록 확인 창 ----------
  function openRegister(kind = "문의") {
    if (!live()) return;
    const review = kind === "리뷰";
    const { auto, manual } = registerCandidates(state.rows, review ? "리뷰" : "문의");
    const pendingSaves = state.timers.size + state.saving.size;
    const list = (rows, cls) => rows.map((row) => `<li class="${cls}"><span class="cs-vendor-chip" data-vendor="${escapeHtml(row.vendor)}">${escapeHtml(row.vendor)}</span> ${escapeHtml(row.board)} · ${escapeHtml(row.id)}<div class="cs-note">${escapeHtml(pickedText(row).slice(0, 120))}</div></li>`).join("");
    $("#cs-modal-body").innerHTML = `
      <p class="cs-note">'등록 대상'만 올라갑니다. 수집기 PC가 등록 직전에 한 번 더 조회해서 이미 답변이 있으면 덮어쓰지 않고 건너뜁니다.</p>
      ${pendingSaves ? `<p class="cs-pending-text">저장 중인 선택이 있습니다 — 잠시 뒤 다시 눌러 주세요.</p>` : ""}
      ${review ? `<h3>자동 등록 ${auto.length}건 <small>(메이크샵 리뷰 — 답글 + 적립금)</small></h3>
      <p class="cs-note cs-point-note">💰 적립금: <b>${escapeHtml(pointLine())}</b><br>네이버페이 리뷰(쇼핑몰 회원 아님)·이미 적립된 리뷰는 답글만 올립니다. 설정은 왼쪽 [💰 메이크샵 리뷰 적립금].</p>
      ${auto.length ? `<ul class="cs-reg-list">${list(auto, "")}</ul>` : `<p class="cs-note">채택된 메이크샵 리뷰가 없습니다.</p>`}
      <h3>직접 등록 ${manual.length}건 <small>(스마트스토어·지그재그 리뷰 — 아직 자동 등록 없음 · 에이블리는 답글 기능 없음)</small></h3>` : `<h3>자동 등록 ${auto.length}건 <small>(스마트스토어 상품문의·고객문의)</small></h3>
      ${auto.length ? `<ul class="cs-reg-list">${list(auto, "")}</ul>` : `<p class="cs-note">채택된 스마트스토어 문의가 없습니다.</p>`}
      <h3>직접 등록 ${manual.length}건 <small>(지그재그·에이블리·메이크샵 — 아직 자동 등록 기능 없음)</small></h3>`}
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
      if (result.point) { state.point = result.point; renderPoint(); }
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
    $("#cs-fold")?.addEventListener("click", () => {
      const folded = !$("#cs-main").classList.contains("left-folded");
      if (!AUTO_FOLD.includes(leftTab)) foldState.folded = folded;   // 메신저·거래처 탭에서 편 것은 그 탭에서만
      setFold(folded);
      saveFold();
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
    $("#cs-progress")?.addEventListener("click", (e) => { const b = e.target.closest("[data-progress-close]"); if (b) { progress.hidden = b.dataset.progressClose; renderProgress(); } });
    $("#cs-jobs")?.addEventListener("click", (e) => { const b = e.target.closest("[data-job-cancel]"); if (b) cancelJob(b.dataset.jobCancel); });
    $$("[data-vendor-group]").forEach((g) => g.addEventListener("click", onVendorToggle));
    $("#cs-register-open")?.addEventListener("click", () => openRegister("문의"));
    $("#cs-review-register-open")?.addEventListener("click", () => openRegister("리뷰"));
    $("#cs-point-save")?.addEventListener("click", savePoint);
    ["#cs-point-pct", "#cs-point-msg"].forEach((sel) => $(sel)?.addEventListener("input", () => { state.pointDirty = true; renderPointExample(); }));
    $("#cs-modal-cancel")?.addEventListener("click", closeModal);
    $("#cs-modal")?.addEventListener("click", (e) => { if (e.target.id === "cs-modal") closeModal(); });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!$("#cs-modal")?.hidden) closeModal();
      else if ($("#cs-guide") && !$("#cs-guide").hidden) $("#cs-guide").hidden = true;
    });
    $("#cs-usage-prev")?.addEventListener("click", () => shiftMonth(-1));
    $("#cs-usage-next")?.addEventListener("click", () => shiftMonth(1));
    $("#cs-usage-reload")?.addEventListener("click", loadUsage);
    $("#cs-msn-demo")?.addEventListener("click", addDemoSlot);
    $("#cs-onetouch")?.addEventListener("click", () => openGuide(true));
    document.addEventListener("click", onPcClick);
    document.addEventListener("keydown", (e) => {   // 카드(전체연결)도 Enter·Space 로
      if ((e.key === "Enter" || e.key === " ") && e.target.matches?.('[data-login-grid] [data-conn="all"], .cs-vendor-status[data-pc="conn"]')) { e.preventDefault(); onPcClick(e); }
    });
    bindRemote();
    $("#cs-login-ok")?.addEventListener("click", submitLogin);
    $("#cs-login-body")?.addEventListener("change", (e) => {   // [부운영자로 로그인] 체크하면 상점 URL 칸 보이기
      if (!e.target.matches?.("[data-login-sub]")) return;
      const wrap = e.target.closest("[data-login-row]")?.querySelector("[data-login-shop-wrap]");
      if (wrap) wrap.hidden = !e.target.checked;
    });
    ["input", "change"].forEach((type) => $("#cs-login-body")?.addEventListener(type, () => { loginDirty = true; }));
    const keepPick = () => writeLoginPick({ vendors: $$("#cs-login [data-login-pick]:checked").map((el) => el.value), collect: !!$("#cs-login-collect")?.checked });
    $("#cs-login-body")?.addEventListener("change", (e) => { if (e.target.matches?.("[data-login-pick]")) keepPick(); });
    $("#cs-login-collect")?.addEventListener("change", (e) => {   // 11-04: [전체 선택 + 게시판 + 리뷰 수집] — 켜면 업체 4곳 모두, 끄면 모두 풀기
      $$("#cs-login [data-login-pick]").forEach((el) => { el.checked = e.target.checked; });
      loginDirty = true;
      keepPick();
    });
    $("#cs-login-body")?.addEventListener("click", (e) => { if (e.target.closest("summary")) loginDirty = true; });
    $("#cs-login-body")?.addEventListener("click", (e) => {   // 11-06: 업체 줄 [자세히]/[접기] — 다시 그리지 않고 그 자리에서 (입력한 값 유지)
      const b = e.target.closest("[data-login-more]");
      if (!b) return;
      const v = b.dataset.loginMore, row = b.closest("[data-login-row]");
      const open = !row.classList.contains("is-open");
      loginOpen.set(v, open);
      row.classList.toggle("is-open", open);
      row.querySelector("[data-login-detail]").hidden = !open;
      b.setAttribute("aria-expanded", String(open));
      b.textContent = open ? "접기 ▲" : "자세히 ▼";
    });
    $("#cs-excel-file")?.addEventListener("change", (e) => importExcel(e.target.files?.[0]));
    $("#cs-set-save")?.addEventListener("click", saveSettings);
    // 11-06: 게시판 탭 [최근 ○일] ↔ 설정 [수집 기간(일)] 같은 값 — 게시판 탭에서 바꾸면 바로 수집기 PC에 저장
    $("#cs-board-days")?.addEventListener("change", (e) => {
      const days = Math.trunc(Number(e.target.value));
      if (!(days >= 1 && days <= 90)) { toast("기간은 1~90일"); return; }
      const set = $("#cs-set-days");
      if (set) { set.value = String(days); }
      requestPc("settings", { settings: { days } }, `문의 수집 기간 ${days}일 저장 요청을 보냈습니다`).then((r) => { if (r) { delete e.target.dataset.dirty; if (set) delete set.dataset.dirty; } });
    });
    $("#cs-set-days")?.addEventListener("input", (e) => { const b = $("#cs-board-days"); if (b) b.value = e.target.value; });
    $("#cs-update-check")?.addEventListener("click", () => checkUpdate());
    $("#cs-update-run")?.addEventListener("click", runUpdate);
    $("#cs-auto-toggle")?.addEventListener("click", () => saveAuto(!setupNow()?.autoOn));
    ["#cs-auto-hour", "#cs-auto-minute", "#cs-auto-interval", "#cs-set-days", "#cs-board-days", "#cs-set-review-days", "#cs-set-slug", "#cs-set-browser"].forEach((sel) => {
      $(sel)?.addEventListener("input", (e) => { e.target.dataset.dirty = "1"; });
      $(sel)?.addEventListener("change", (e) => {
        e.target.dataset.dirty = "1";
        if (sel.startsWith("#cs-auto") && setupNow()?.autoOn) saveAuto(true);       // 켜져 있으면 바꾼 시각·간격 바로 적용
      });
    });
    $("#cs-guide-open")?.addEventListener("click", () => openGuide(false));
    $("#cs-guide")?.addEventListener("click", onGuideClick);
    $("#cs-msn-slots")?.addEventListener("click", onSlotClick);
    $("#cs-msn-slots")?.addEventListener("input", (e) => {
      const index = e.target.dataset?.msnAnswer;
      if (index !== undefined && state.slots[Number(index)]) state.slots[Number(index)].answer = e.target.value;
    });

    const editorInput = $("#cs-editor-input");
    if (editorInput) editorInput.value = state.editor;
    $("#cs-token-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      let token = String($("#cs-token-input")?.value || "").trim();
      state.editor = String(editorInput?.value || "").trim().slice(0, 20);
      if (!state.endpoint) return;
      const kind = csPasswordKind(token);
      if (kind === "short") { toast("비밀번호는 6자 이상입니다."); return; }
      if (kind === "simple") {                     // 간단 비밀번호 → 시트가 확인하고 긴 키를 돌려줌 (v6)
        try {
          const response = await doFetch(state.endpoint, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: "unlock", password: token }),
          });
          if (!response.ok) throw new Error(`시트 응답 오류 (${response.status})`);
          token = csUnlockResult(await response.json());
        } catch (error) {
          toast(error.message || "비밀번호를 확인하지 못했습니다.");
          return;
        }
      }
      if (token && !isCsBoardTokenValid(token)) { toast("긴 키는 영문·숫자·-·_ 로 된 BOARD_TOKEN 입니다."); return; }
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
    showRight("board");
    const LEFT_TABS = $$("[data-left-tab]").map((b) => b.dataset.leftTab);
    showLeft(LEFT_TABS.includes(foldState.tab) ? foldState.tab : "main");   // 11-06: 마지막에 보던 탭 · 그 탭의 접힘 상태
    renderSlots();
    renderUsage();
    log("CS 자동화 화면을 열었습니다.");
    if (state.endpoint && state.token) load();
    else if (!state.endpoint) {
      log("CS 시트가 아직 연결되지 않아 가상 예시를 보여 줍니다.");
      setSample(true);
    } else renderBoard();
  }

  return { state, start, load, setSample, suggest, flushSave, renderBoard, addDemoSlot, requestJob, openRegister, openGuide, openLogin, requestPc };
}

if (typeof document !== "undefined" && document.getElementById("cs-board-app")) {
  createCsBoardApp({ document, window, storage: (() => { try { return window.localStorage; } catch { return null; } })() }).start();
}
