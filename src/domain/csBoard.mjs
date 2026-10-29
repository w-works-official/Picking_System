// CS 게시판 답변 (2026-10-29 대표님 요청 — G1 CS 수집기의 [📋 게시판] 답변 고르기를 웹으로)
// 수집은 지금처럼 수집기 PC가 하고, 문의·답변안·선택은 구글 시트(Apps Script 웹앱)에 모입니다.
// 이 화면은 설치 없이 브라우저에서 문의를 보고 답변안 A~J 중에서 고르고 고치고 보류합니다.
// AI 추천은 Apps Script가 대신 부릅니다(키는 스크립트 설정에만 — 이 공개 저장소에는 없음).
// 이 파일은 화면·네트워크에 손대지 않는 순수 계산만 담당합니다(그리기는 csBoardApp.mjs).

// 대표님이 시트 스크립트를 배포한 뒤 알려주시는 웹앱 주소를 넣습니다. 비어 있으면 기능이 꺼진 상태입니다.
export const CS_BOARD_ENDPOINT = "https://script.google.com/macros/s/AKfycbxnqdvAQCrWSHO6NbmJZJQJHqH8WAwhF084t3im5lY4RIdRi7pyC0pJjD03o3ryNJxd/exec";
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
  requested: "등록요청",
  registered: "등록완료",
};

// 수집기(g1_register.SUPPORTED)가 자동 등록할 수 있는 게시판 — 나머지는 복사·바로가기로 직접 등록
export const CS_REGISTER_SUPPORTED = ["스마트스토어|상품문의", "스마트스토어|고객문의"];

// 웹에서 수집기 PC에 보내는 요청 종류 (시트 JOB_KINDS 와 같음)
export const CS_JOB_KINDS = {
  collect: "게시판 수집", reviews: "리뷰 수집", test: "테스트 수집", testReviews: "테스트 리뷰 수집", register: "등록",
  login: "🔑 로그인", settings: "설정 저장", apiTest: "API 연결 테스트", apiKey: "API 키 저장", ip: "공인 IP 확인", files: "수집 파일 목록", auto: "⏰ 자동 수집",
};
// 수집기 PC에 시키는 일 (수집·등록 말고) — 로그인·설정·API·IP·파일 목록
export const CS_PC_KINDS = ["login", "settings", "apiTest", "apiKey", "ip", "files"];
export const CS_LOGIN_VENDORS = ["스마트스토어", "지그재그", "에이블리", "메이크샵"];

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

export function csStatusOf({ closed = false, drafts = [], choice = emptyChoice(), reg = null } = {}) {
  if (reg?.state === "완료") return CS_STATUS.registered;
  if (closed) return CS_STATUS.closed;
  if (reg?.state === "요청") return CS_STATUS.requested;
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
  const reg = raw.reg && typeof raw.reg === "object" && ["요청", "완료", "확인 필요", "건너뜀"].includes(raw.reg.state)
    ? { state: raw.reg.state, at: line(raw.reg.at, 40), note: line(raw.reg.note, 300), text: text(raw.reg.text) }
    : null;
  const board = line(raw.board, 40);
  return {
    key: line(raw.key, 200),
    vendor: line(raw.vendor, 40),
    board,
    kind: inquiry.kind === "리뷰" || board === "리뷰" ? "리뷰" : "문의",
    noReply: inquiry.noReply === true,
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
    reg,
    version: Math.max(0, Math.trunc(Number(raw.version) || 0)),
    editor: line(raw.editor, 40),
    editedAt: line(raw.editedAt, 40),
    collectedAt: line(raw.collectedAt, 40),
    status: csStatusOf({ closed, drafts, choice, reg }),
  };
}

// 이 카드에서 더 고칠 수 없는 상태 (등록 요청 중·끝난 문의)
export function isCsRowLocked(row) {
  return row.closed || row.reg?.state === "요청" || row.reg?.state === "완료";
}

export function isRegisterSupported(row) {
  return CS_REGISTER_SUPPORTED.includes(`${row.vendor}|${row.board}`);
}

// 📤 등록 확인 창: 채택된 문의를 자동 등록(스마트스토어)·직접 등록(나머지)으로 나눔
export function registerCandidates(rows = []) {
  const picked = rows.filter((row) => row.kind === "문의" && !isCsRowLocked(row) && !row.choice.hold && row.choice.pick >= 0 && pickedText(row).trim());
  return { auto: picked.filter(isRegisterSupported), manual: picked.filter((row) => !isRegisterSupported(row)) };
}

export function normalizeCsJob(raw = {}) {
  const result = raw.result && typeof raw.result === "object" ? raw.result : {};
  return {
    id: line(raw.id, 40),
    kind: line(raw.kind, 20),
    label: CS_JOB_KINDS[raw.kind] || line(raw.kind, 20),
    status: line(raw.status, 10),
    by: line(raw.by, 40),
    at: line(raw.at, 40),
    started: line(raw.started, 40),
    ended: line(raw.ended, 40),
    pc: line(raw.pc, 60),
    message: line(result.message, 300),
    progress: result.progress === true,
    count: Number(raw.body?.count ?? (raw.body?.items || []).length) || 0,
    data: result.data && typeof result.data === "object" ? result.data : null,
  };
}

// 수집기 PC 일 요청 (로그인 비밀번호·API 키는 이미 잠근 값만 받음)
export function csPcPayload(kind, options = {}, editor = "") {
  if (!CS_PC_KINDS.includes(kind)) throw new Error("알 수 없는 요청입니다.");
  const out = { action: "request", kind, options: {}, editor: line(editor, 40) };
  if (kind === "login") {
    const vendors = [...new Set((options.vendors || []).filter((v) => CS_LOGIN_VENDORS.includes(v)))];
    if (!vendors.length) throw new Error("로그인할 업체를 고르세요.");
    const creds = {};
    for (const [v, c] of Object.entries(options.creds || {})) {
      if (vendors.includes(v) && /^[A-Za-z0-9_-]{100,700}$/.test(c?.id || "") && /^[A-Za-z0-9_-]{100,700}$/.test(c?.pw || "")) creds[v] = { id: c.id, pw: c.pw };
    }
    out.options = { vendors, creds, collectAfter: options.collectAfter === true };
  } else if (kind === "settings") {
    out.options = { settings: { ...(options.settings || {}) } };
  } else if (kind === "apiKey") {
    out.options = { clientId: String(options.clientId || ""), secret: String(options.secret || "") };
  }
  return out;
}

// 가장 최근에 끝난 그 종류 요청 (API 테스트·IP·파일 목록 결과 보여 주기)
export function latestJob(jobs = [], kind) {
  return jobs.find((job) => job.kind === kind && !isJobActive(job)) || null;
}

// 자동 수집 설정 화면 값 → 설정 저장 요청용
export function autoSettings({ on, hour, minute, interval }) {
  const hh = String(Math.min(23, Math.max(0, Math.trunc(Number(hour) || 0)))).padStart(2, "0");
  const mm = String(Math.min(59, Math.max(0, Math.trunc(Number(minute) || 0)))).padStart(2, "0");
  const iv = Math.min(1440, Math.max(10, Math.trunc(Number(interval) || 60)));
  return { auto_on: !!on, auto_start: `${hh}:${mm}`, interval: iv };
}

export function isJobActive(job) {
  return job.status === "대기" || job.status === "실행중";
}

// 수집기 PC 연결 프로그램 상태: 15초마다 알림 → 1분 안 = 켜짐, 5분 안 = 늦음, 그 밖 = 꺼짐
export function collectorStatus(raw = {}, nowMs = Date.now()) {
  const seen = new Date(raw?.seenAt || "").getTime();
  const ago = Number.isFinite(seen) ? Math.max(0, Math.round((nowMs - seen) / 1000)) : Infinity;
  const state = ago < 60 ? "on" : ago < 300 ? "late" : "off";
  const vendors = (info) => Object.entries(info?.vendors || {}).map(([vendor, v]) => ({ vendor: line(vendor, 20), state: line(v?.state, 20), count: Number(v?.count) || 0, note: line(v?.note, 200) }));
  return {
    state,
    ago,
    pc: line(raw?.pc, 60),
    version: line(raw?.version, 60),
    busy: raw?.busy === true,
    last: raw?.last ? { at: line(raw.last.at, 40), count: Number(raw.last.count) || 0, vendors: vendors(raw.last) } : null,
    reviewLast: raw?.reviewLast ? { at: line(raw.reviewLast.at, 40), count: Number(raw.reviewLast.count) || 0, vendors: vendors(raw.reviewLast) } : null,
    setup: normalizeCollectorSetup(raw?.setup),
  };
}

// 수집기 PC 처음 설정 상태 (연결 1.2 부터 보냄). 모르면 null — 안내창에서 "확인 못 함"
export function normalizeCollectorSetup(raw) {
  if (!raw || typeof raw !== "object") return null;
  const flag = (v) => (v === true ? true : v === false ? false : null);
  const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0);
  const list = (v) => (Array.isArray(v) ? v.map((x) => line(x, 20)).filter(Boolean).slice(0, 6) : []);
  return {
    dir: line(raw.dir, 200), outDir: line(raw.outDir, 200), days: num(raw.days), reviewDays: num(raw.reviewDays), zzSlug: line(raw.zzSlug, 40),
    showBrowser: flag(raw.showBrowser), autoStart: line(raw.autoStart, 10), interval: num(raw.interval),
    vendors: list(raw.vendors), reviewVendors: list(raw.reviewVendors),
    loginOk: flag(raw.loginOk), api: line(raw.api, 10), claude: flag(raw.claude), parts: flag(raw.parts), icon: flag(raw.icon),
    autostart: flag(raw.autostart), bg: flag(raw.bg), collector: line(raw.collector, 40), link: line(raw.link, 40),
    pubKey: /^[A-Za-z0-9_-]{300,800}$/.test(String(raw.pubKey || "")) ? String(raw.pubKey) : "",
    autoOn: flag(raw.autoOn), nextAuto: line(raw.nextAuto, 20), savedLogins: list(raw.savedLogins),
  };
}

export function csRequestPayload(kind, { vendors = [], reviewDays = 0 } = {}, editor = "") {
  if (!Object.hasOwn(CS_JOB_KINDS, kind) || kind === "register") throw new Error("알 수 없는 요청입니다.");
  const options = { vendors: [...new Set(vendors.map((v) => line(v, 20)).filter(Boolean))].slice(0, 4) };
  const days = Math.trunc(Number(reviewDays));
  if ((kind === "reviews" || kind === "testReviews") && days >= 1 && days <= 365) options.reviewDays = days;
  return { action: "request", kind, options, editor: line(editor, 40) };
}

export function csRegisterPayload(rows = [], editor = "") {
  return { action: "request", kind: "register", keys: rows.map((row) => row.key).slice(0, 100), editor: line(editor, 40) };
}

// AI 사용량: 그 달 날짜별 [{day, n, won}] + 합계
export function usageForMonth(usage = {}, year, month) {
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  const days = Object.entries(usage || {})
    .filter(([day]) => day.startsWith(prefix))
    .map(([day, v]) => ({ day, n: Number(v?.n) || 0, won: Number(v?.won) || 0 }))
    .sort((a, b) => a.day.localeCompare(b.day));
  return { days, n: days.reduce((sum, d) => sum + d.n, 0), won: Math.round(days.reduce((sum, d) => sum + d.won, 0) * 10) / 10 };
}

export function parseCsBoardResponse(json) {
  if (!json || typeof json !== "object") throw new Error("CS 시트 응답을 읽지 못했습니다.");
  if (json.ok !== true) {
    const error = new Error(String(json.error || "CS 시트가 요청을 거절했습니다."));
    if (json.conflict) error.conflict = true;
    if (json.row) error.row = normalizeCsRow(json.row); // 충돌·종료·등록 중이면 시트의 최신 줄을 같이 돌려줌
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
    jobs: Array.isArray(json.jobs) ? json.jobs.map(normalizeCsJob) : null,
    job: json.job ? normalizeCsJob(json.job) : null,
    duplicate: json.duplicate === true,
    collector: json.collector ? json.collector : null,
    usage: json.usage && typeof json.usage === "object" ? json.usage : null,
    hasRows: Array.isArray(json.rows),
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

export function csBoardSummary(rows = [], kind = "문의") {
  const open = rows.filter((row) => !row.closed && (!kind || row.kind === kind));
  return {
    total: open.length,
    picked: open.filter((row) => row.status === CS_STATUS.picked).length,
    held: open.filter((row) => row.status === CS_STATUS.held).length,
    waiting: open.filter((row) => row.status === CS_STATUS.waiting || row.status === CS_STATUS.drafted).length,
  };
}

export const CS_BOARD_FILTERS = ["전체", "미선택", "채택", "보류"];

export function filterCsRows(rows = [], { vendor = "", status = "전체", search = "", kind = "문의" } = {}) {
  const needle = String(search || "").trim().toLowerCase();
  return rows.filter((row) => {
    if (kind && row.kind !== kind) return false;
    if (row.closed && row.reg?.state !== "완료") return false;
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

export function csVendors(rows = [], kind = "문의") {
  return [...new Set(rows.filter((row) => !row.closed && (!kind || row.kind === kind)).map((row) => row.vendor).filter(Boolean))];
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
