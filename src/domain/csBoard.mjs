// CS 게시판 답변 (2026-10-29 대표님 요청 — G1 CS 수집기의 [📋 게시판] 답변 고르기를 웹으로)
// 수집은 지금처럼 수집기 PC가 하고, 문의·답변안·선택은 구글 시트(Apps Script 웹앱)에 모입니다.
// 이 화면은 설치 없이 브라우저에서 문의를 보고 답변안 A~J 중에서 고르고 고치고 보류합니다.
// AI 추천은 Apps Script가 대신 부릅니다(키는 스크립트 설정에만 — 이 공개 저장소에는 없음).
// 이 파일은 화면·네트워크에 손대지 않는 순수 계산만 담당합니다(그리기는 csBoardApp.mjs).

// 대표님이 시트 스크립트를 배포한 뒤 알려주시는 웹앱 주소를 넣습니다. 비어 있으면 기능이 꺼진 상태입니다.
export const CS_BOARD_ENDPOINT = "";
export const CS_BOARD_STORAGE_KEY = "system_v3_cs_board";
export const CS_BOARD_SAVE_DELAY_MS = 800; // 수집기와 같은 자동 저장 간격
export const CS_BOARD_VIEW_SIZE = 2; // 화면에 보이는 답변 칸 A·B
export const CS_BOARD_TEXT_LIMIT = 2000;

const LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// 수집기 업체 이름 → 칩 색(수집기 VCOLOR와 같은 계열)
export const CS_VENDOR_COLORS = {
  스마트스토어: { bg: "#dcfce7", fg: "#166534" },
  지그재그: { bg: "#fce7f3", fg: "#9d174d" },
  에이블리: { bg: "#e0e7ff", fg: "#3730a3" },
  메이크샵: { bg: "#fef3c7", fg: "#92400e" },
};

export const CS_STATUS = {
  waiting: "미답변",
  drafted: "답변안",
  picked: "채택",
  held: "보류",
  closed: "종료",
};

export function isCsBoardTokenValid(token) {
  return /^[A-Za-z0-9_-]{8,128}$/.test(String(token ?? "").trim());
}

export function draftLabel(index) {
  return index >= 0 && index < LABELS.length ? LABELS[index] : String(index + 1);
}

function text(value, limit = CS_BOARD_TEXT_LIMIT) {
  return String(value ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, limit);
}

function line(value, limit = 300) {
  return text(value, limit).replace(/\s+/g, " ").trim();
}

function httpsUrl(value) {
  const url = String(value ?? "").trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(url) ? url : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

export function emptyChoice() {
  return { pick: -1, view: [], edits: {}, hold: false };
}

// 시트에 저장된 선택 값 정리 — 이상한 값은 버리고 기본값으로
export function normalizeChoice(raw, draftCount = Infinity) {
  const choice = emptyChoice();
  if (!raw || typeof raw !== "object") return choice;
  const inRange = (n) => Number.isInteger(n) && n >= 0 && n < draftCount;
  const pick = Number(raw.pick);
  choice.pick = inRange(pick) ? pick : -1;
  choice.view = [...new Set(list(raw.view).map(Number).filter(inRange))].slice(0, CS_BOARD_VIEW_SIZE);
  for (const [key, value] of Object.entries(raw.edits && typeof raw.edits === "object" ? raw.edits : {})) {
    const index = Number(key);
    if (inRange(index)) choice.edits[index] = text(value);
  }
  choice.hold = raw.hold === true;
  if (choice.hold) choice.pick = -1;
  return choice;
}

export function csStatusOf({ closed = false, drafts = [], choice = emptyChoice() } = {}) {
  if (closed) return CS_STATUS.closed;
  if (choice.hold) return CS_STATUS.held;
  if (choice.pick >= 0) return CS_STATUS.picked;
  return drafts.length ? CS_STATUS.drafted : CS_STATUS.waiting;
}

// 시트 응답 한 줄 → 화면용 문의 1건
export function normalizeCsRow(raw = {}) {
  const inquiry = raw.inquiry && typeof raw.inquiry === "object" ? raw.inquiry : {};
  const drafts = list(raw.drafts)
    .map((draft) => ({
      text: text(typeof draft === "string" ? draft : draft?.text),
      from: line(typeof draft === "string" ? "" : draft?.from, 20) || "수집",
    }))
    .filter((draft) => draft.text.trim());
  const choice = normalizeChoice(raw.choice, drafts.length);
  const closed = raw.closed === true;
  return {
    key: line(raw.key, 200),
    vendor: line(raw.vendor, 40),
    board: line(raw.board, 40),
    id: line(raw.id, 120),
    date: line(raw.date, 40),
    product: line(raw.product, 300),
    productLink: httpsUrl(inquiry.productLink),
    productImage: httpsUrl(inquiry.productImage),
    title: line(inquiry.title, 300),
    question: text(inquiry.question, 6000),
    type: line(inquiry.type, 60),
    option: line(inquiry.option, 300),
    check: text(inquiry.check, 1000),
    link: httpsUrl(inquiry.link),
    photos: list(inquiry.photos).map(httpsUrl).filter(Boolean).slice(0, 12),
    context: list(inquiry.context).slice(-12).map((entry) => ({
      kind: line(entry?.kind, 30),
      date: line(entry?.date, 40),
      question: text(entry?.question, 3000),
      answer: text(entry?.answer, 3000),
    })),
    drafts,
    choice,
    closed,
    version: Math.max(0, Math.trunc(Number(raw.version) || 0)),
    editor: line(raw.editor, 40),
    editedAt: line(raw.editedAt, 40),
    collectedAt: line(raw.collectedAt, 40),
    status: csStatusOf({ closed, drafts, choice }),
  };
}

export function parseCsBoardResponse(json) {
  if (!json || typeof json !== "object") throw new Error("CS 시트 응답을 읽지 못했습니다.");
  if (json.ok !== true) {
    const error = new Error(String(json.error || "CS 시트가 요청을 거절했습니다."));
    if (json.conflict) {
      error.conflict = true;
      error.row = json.row ? normalizeCsRow(json.row) : null;
    }
    if (json.denied) error.denied = true;
    throw error;
  }
  const seen = new Set();
  const rows = [];
  for (const raw of list(json.rows)) {
    const row = normalizeCsRow(raw);
    if (!row.key || seen.has(row.key)) continue;
    seen.add(row.key);
    rows.push(row);
  }
  return {
    rows,
    row: json.row ? normalizeCsRow(json.row) : null,
    aiEnabled: json.aiEnabled === true,
    added: Math.max(0, Number(json.added) || 0),
    serverTime: line(json.serverTime, 40),
  };
}

// 지금 보이는 문안(고친 문안 우선)
export function draftText(row, index) {
  if (Object.hasOwn(row.choice.edits, index)) return row.choice.edits[index];
  return row.drafts[index]?.text ?? "";
}

// 내용 있는 답변안 번호들(비운 칸은 제외 — 수집기 pool 과 같음)
export function draftPool(row) {
  return row.drafts.map((_, index) => index).filter((index) => draftText(row, index).trim());
}

// 처음 보일 두 칸: 저장된 보기 → 선택한 안 포함 → 앞에서부터 채우기 (수집기와 같은 규칙)
export function initialView(row) {
  const pool = draftPool(row);
  let view = row.choice.view.filter((index) => pool.includes(index)).slice(0, CS_BOARD_VIEW_SIZE);
  const pick = row.choice.pick;
  if (pool.includes(pick) && !view.includes(pick)) view = [pick, ...view].slice(0, CS_BOARD_VIEW_SIZE);
  for (const index of pool) {
    if (view.length >= CS_BOARD_VIEW_SIZE) break;
    if (!view.includes(index)) view.push(index);
  }
  return view;
}

// ⟳ 새로고침: 그 칸만 다음 답변안으로(다른 칸에 보이는 안은 건너뜀)
export function nextDraftInView(row, view, box) {
  const pool = draftPool(row);
  if (pool.length <= 1 || box < 0 || box >= view.length) return view;
  const other = view[1 - box];
  let position = pool.indexOf(view[box]);
  for (let step = 0; step < pool.length; step += 1) {
    position = (position + 1) % pool.length;
    if (pool[position] !== other) break;
  }
  const next = [...view];
  next[box] = pool[position];
  return next;
}

export function canCycleBox(row, view) {
  const pool = draftPool(row);
  return pool.length > 2 || (pool.length === 2 && view.length === 1);
}

// 문안 고치기 — 원래 문안과 같아지면 고친 기록을 지움
export function withEdit(row, index, value) {
  const edits = { ...row.choice.edits };
  const next = text(value);
  if (next === (row.drafts[index]?.text ?? "")) delete edits[index];
  else edits[index] = next;
  return { ...row.choice, edits };
}

export function withPick(row, index) {
  return { ...row.choice, pick: index, hold: index >= 0 ? false : row.choice.hold };
}

export function withHold(row, hold) {
  return { ...row.choice, hold: Boolean(hold), pick: hold ? -1 : row.choice.pick };
}

export function pickedText(row) {
  return row.choice.pick >= 0 ? draftText(row, row.choice.pick) : "";
}

export function csSavePayload(row, choice, editor = "") {
  return {
    action: "save",
    key: row.key,
    baseVersion: row.version,
    choice: normalizeChoice(choice, row.drafts.length),
    editor: line(editor, 40),
  };
}

export function csSuggestPayload(row) {
  return { action: "suggest", key: row.key };
}

export function csBoardSummary(rows = []) {
  const open = rows.filter((row) => !row.closed);
  return {
    total: open.length,
    picked: open.filter((row) => row.status === CS_STATUS.picked).length,
    held: open.filter((row) => row.status === CS_STATUS.held).length,
    waiting: open.filter((row) => row.status === CS_STATUS.waiting || row.status === CS_STATUS.drafted).length,
  };
}

export const CS_BOARD_FILTERS = ["전체", "미선택", "채택", "보류"];

export function filterCsRows(rows = [], { vendor = "", status = "전체", search = "" } = {}) {
  const needle = String(search || "").trim().toLowerCase();
  return rows.filter((row) => {
    if (row.closed) return false;
    if (vendor && row.vendor !== vendor) return false;
    if (status === "미선택" && !(row.status === CS_STATUS.waiting || row.status === CS_STATUS.drafted)) return false;
    if (status === "채택" && row.status !== CS_STATUS.picked) return false;
    if (status === "보류" && row.status !== CS_STATUS.held) return false;
    if (!needle) return true;
    return [row.product, row.question, row.title, row.id, row.board].some((value) => value.toLowerCase().includes(needle));
  });
}

// 최신 문의가 위로, 시각이 같으면 업체·번호 순
export function sortCsRows(rows = []) {
  return [...rows].sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.vendor.localeCompare(b.vendor, "ko") || a.id.localeCompare(b.id, "en", { numeric: true }));
}

export function csVendors(rows = []) {
  return [...new Set(rows.filter((row) => !row.closed).map((row) => row.vendor).filter(Boolean))];
}

// 바로가기: 수집기가 준 글 주소 우선, 없으면 업체 관리 화면(가게 주소가 필요 없는 공통 화면만)
export function csAdminLink(row) {
  if (row.link) return row.link;
  if (row.vendor === "스마트스토어") {
    return row.board === "상품문의" ? "https://sell.smartstore.naver.com/#/comment/" : "https://sell.smartstore.naver.com/#/inquiry/";
  }
  if (row.vendor === "에이블리") {
    return /^[A-Za-z0-9_-]+$/.test(row.id) ? `https://seller-admin.a-bly.com/inquiry/${row.id}?iframe=true` : "https://my.a-bly.com/inquiry";
  }
  if (row.vendor === "지그재그") return "https://partners.kakaostyle.com/";
  return "";
}

export function csSavedLabel({ dirty = false, saving = false, savedAt = "", error = "" } = {}) {
  if (error) return `저장 안 됨 — ${error}`;
  if (saving) return "저장 중…";
  if (dirty) return "저장 대기";
  return savedAt ? `자동 저장됨 ${savedAt}` : "";
}
