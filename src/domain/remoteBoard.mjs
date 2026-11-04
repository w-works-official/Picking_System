// 원격 실행 보드 연동 (2026-10-28 대표님 요청)
// 원격 실행 보드(kakamail80-cell/remote-board)와 같은 Apps Script 웹앱·같은 작업 큐를 씁니다.
// 버튼 목록은 구글 시트 [작업목록]이 정하므로 여기서는 받은 목록을 그대로 그립니다.
// 토큰은 코드에 넣지 않습니다(공개 저장소) — 화면에서 한 번 입력받아 이 기기에만 저장합니다.
export const REMOTE_BOARD_URL = "https://script.google.com/macros/s/AKfycbxfPwqeMm7oy2bm4gUp3orBDBsTLrKA2Q9wQNC-ADs3Qp9hc2nZyT_uK7Lvmgqc4t3x/exec";
export const REMOTE_BOARD_PAGE = "https://kakamail80-cell.github.io/remote-board/";
export const REMOTE_BOARD_STORAGE_KEY = "system_v3_remote_board";

// 2026-11-04: 6자리 하나로 열기 — CS 시트(v8)가 6자리(UNLOCK_PASSWORD) 확인 뒤 CS 키와 원격보드 토큰(REMOTE_BOARD_TOKEN)을 같이 돌려줌.
// 원격보드 토큰은 대표님이 CS 시트 스크립트 속성에 한 번만 넣어 두면, 6자리를 넣은 기기마다 자동으로 저장됨.
export function saveRemoteBoardToken(storage, token) {
  const t = String(token ?? "").trim();
  if (!isRemoteBoardTokenValid(t)) return false;
  try { storage?.setItem(REMOTE_BOARD_STORAGE_KEY, JSON.stringify({ token: t })); return true; } catch { return false; }
}

export function readCsKey(storage, csStorageKey) {
  try {
    const raw = JSON.parse(storage?.getItem(csStorageKey) || "{}") || {};
    return /^[A-Za-z0-9_-]{8,128}$/.test(String(raw.token || "").trim()) ? String(raw.token).trim() : "";
  } catch { return ""; }
}

function rememberCsKey(storage, csStorageKey, token) {
  try {
    const raw = JSON.parse(storage?.getItem(csStorageKey) || "{}") || {};
    storage?.setItem(csStorageKey, JSON.stringify({ ...raw, token }));
  } catch { /* 이번 화면에서만 */ }
}

async function postJson(fetchImpl, endpoint, body) {
  const response = await fetchImpl(endpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`시트 응답 오류 (${response.status})`);
  return response.json();
}

// 이 기기에 CS 키가 있으면 → 시트에서 원격보드 토큰 받아 저장 (없거나 시트가 v8 전이면 "")
export async function remoteTokenFromCs({ storage, fetchImpl, endpoint, csStorageKey }) {
  const key = readCsKey(storage, csStorageKey);
  if (!key || !endpoint) return "";
  try {
    const json = await postJson(fetchImpl, endpoint, { action: "secrets", token: key });
    return json?.ok && saveRemoteBoardToken(storage, json.remote) ? String(json.remote).trim() : "";
  } catch { return ""; }
}

// 6자리 → CS 키 + 원격보드 토큰 저장. 돌려줌: { csKey, remote }  (틀리면 시트 메시지로 오류)
export async function unlockWithPin({ pin, storage, fetchImpl, endpoint, csStorageKey }) {
  const json = await postJson(fetchImpl, endpoint, { action: "unlock", password: String(pin ?? "").trim() });
  if (!(json && json.ok === true && /^[A-Za-z0-9_-]{8,128}$/.test(String(json.token || "").trim()))) {
    throw new Error(String(json?.error || "비밀번호를 확인하지 못했습니다."));
  }
  const csKey = String(json.token).trim();
  rememberCsKey(storage, csStorageKey, csKey);
  const remote = saveRemoteBoardToken(storage, json.remote) ? String(json.remote).trim() : "";
  return { csKey, remote };
}

// 사입 관리 메뉴별로 보여줄 보드 주제(시트 [작업목록] 주제 열 값)
export const REMOTE_BOARD_TOPICS = {
  order: ["I 재고 체크 / 주문서"],
  receiving: ["재고매칭", "셀피아 주문서 등록"],
};

const ACTIVE_STATES = ["대기", "실행중", "중지요청"];

export function isRemoteBoardTokenValid(token) {
  return /^[A-Za-z0-9_-]{1,64}$/.test(String(token ?? "").trim());
}

// 파라미터 열 → 화면 동작. V3 에서는 카메라·사진·입력이 필요한 버튼은 보드 화면으로 넘깁니다.
export function remoteJobKind(job = {}) {
  const par = String(job["파라미터"] ?? "").trim();
  if (par === "제목") return "title";
  if (par === "하위목업") return "mock";
  if (par === "하위사진" || par === "그룹사진" || par === "사진" || par === "기간" || par === "텍스트") return "board";
  return "run";
}

export function isRemoteSubJob(job = {}) {
  return String(job["파라미터"] ?? "").startsWith("하위");
}

// 주제별 묶음: [{ topic, headJob, rows:[job...] }] — '그룹'·'그룹사진' 은 소제목 오른쪽 버튼(보드와 같음)
export function remoteBoardSections(jobs = [], topics = []) {
  const wanted = (topics || []).map(String);
  return wanted
    .map((topic) => {
      const all = (jobs || []).filter((job) => String(job?.["주제"] ?? "") === topic);
      const headJob = all.find((job) => ["그룹", "그룹사진"].includes(String(job["파라미터"] ?? ""))) || null;
      return { topic, headJob, rows: all.filter((job) => job !== headJob) };
    })
    .filter((section) => section.headJob || section.rows.length);
}

// 끝난 표식(완료·중지)은 끝난 지 5분 지나면 자동으로 안 보이게 (2026-11-02 대표님 요청).
// 실패는 놓치지 않게 [×] 로 지울 때까지 남겨 둡니다. 보드 원본·시트 기록은 그대로입니다.
export const REMOTE_DONE_HIDE_MS = 5 * 60 * 1000;
const AUTO_HIDE_STATES = ["완료", "중지"];

export function isRemoteChipExpired(row = {}, nowMs = Date.now(), hideMs = REMOTE_DONE_HIDE_MS) {
  if (!AUTO_HIDE_STATES.includes(String(row["상태"] ?? ""))) return false;
  const at = Date.parse(row["종료시각"] || row["요청시각"] || "");
  return Number.isFinite(at) && nowMs - at > hideMs;
}

// 큐 → 작업코드별 칩 목록(먼저 누른 것이 앞). 취소된 건·숨김 처리한 건·끝난 지 5분 지난 완료/중지는 뺍니다.
export function remoteQueueByCode(queue = [], hidden = () => false, nowMs = Date.now()) {
  const byCode = {};
  [...(queue || [])].reverse().forEach((row) => {
    if (!row || row["상태"] === "취소" || hidden(row["ID"]) || isRemoteChipExpired(row, nowMs)) return;
    (byCode[row["작업코드"]] ||= []).push(row);
  });
  return byCode;
}

// "(F_1) PC_LIST - 1007.xlsm" → "(F_1) 1007" (보드와 같은 규칙)
export function remoteShortFileName(name) {
  const base = String(name ?? "").replace(/\.[^.]+$/, "").trim();
  const head = base.match(/^\s*(\([^)]*\))/);
  if (!head) return base;
  const date = base.match(/(\d{4,8})\s*$/);
  return date ? `${head[1]} ${date[1]}` : head[1];
}

export function remoteClock(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(11, 16);
  const pad = (number) => String(number).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// 칩 1개에 필요한 값만 (화면 그리기는 앱에서)
export function remoteChip(row = {}, now = new Date()) {
  const status = String(row["상태"] ?? "");
  const active = ACTIVE_STATES.includes(status);
  const when = active ? row["요청시각"] : (row["종료시각"] || row["요청시각"]);
  const date = new Date(when);
  const otherDay = !Number.isNaN(date.getTime()) && date.toDateString() !== now.toDateString();
  const names = String(row["결과파일"] ?? "").split("\n").filter(Boolean);
  const links = String(row["결과링크"] ?? "").split("\n").filter(Boolean);
  return {
    id: String(row["ID"] ?? ""),
    status,
    active,
    running: status === "실행중" || status === "중지요청",
    time: `${otherDay ? `${date.getMonth() + 1}/${date.getDate()} ` : ""}${remoteClock(when)}`,
    files: names.map((name, index) => ({
      name,
      label: remoteShortFileName(name),
      href: /^https:\/\//.test(links[index] || "") ? links[index] : "",
    })),
  };
}

// 러너 표시: ● 켜짐(60초 안 신호) / ◐ 실행 중 / ○ 꺼짐
export function remoteRunnerStates(runners = {}, queue = [], nowMs = Date.now()) {
  const names = ["사무실", "집"];
  Object.keys(runners || {}).forEach((name) => { if (!names.includes(name)) names.push(name); });
  const busy = {};
  (queue || []).forEach((row) => {
    if (row?.["상태"] === "실행중" || row?.["상태"] === "중지요청") busy[row["러너"] || "사무실"] = true;
  });
  return names
    .filter((name) => Object.hasOwn(runners || {}, name))
    .map((name) => {
      const seen = Number(runners[name]);
      const ago = Number.isFinite(seen) ? (nowMs - seen) / 1000 : Infinity;
      return { name, state: busy[name] ? "busy" : ago < 60 ? "on" : "off" };
    });
}

// 사진 촬영(STOCK_PHOTO)처럼 사진 1장마다 큐에 1건씩 쌓이는 작업은 끝난 건을 칩 1개로 묶음 (2026-11-03 대표님 요청 —
// 보드와 같은 방식: [완료 ×] 09:49~09:51 · 사진 4장, X 하나로 전부 지움). 대기·실행 중인 건은 따로 보임.
export const REMOTE_GROUPED = { STOCK_PHOTO: "사진" };

export function remoteGroupChips(code, rows = [], now = new Date()) {
  const unit = REMOTE_GROUPED[code];
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (!unit) return { group: null, rest: list };
  const done = list.filter((row) => !ACTIVE_STATES.includes(String(row["상태"] ?? "")));
  const rest = list.filter((row) => ACTIVE_STATES.includes(String(row["상태"] ?? "")));
  if (!done.length) return { group: null, rest };
  const stamps = done
    .map((row) => row["종료시각"] || row["요청시각"])
    .filter(Boolean)
    .map((value) => ({ value, ms: new Date(value).getTime() }))
    .sort((a, b) => (Number.isNaN(a.ms) || Number.isNaN(b.ms) ? String(a.value).localeCompare(String(b.value)) : a.ms - b.ms));
  const first = stamps[0]?.value, last = stamps[stamps.length - 1]?.value;
  const day = (() => {
    const date = new Date(last);
    return !Number.isNaN(date.getTime()) && date.toDateString() !== now.toDateString() ? `${date.getMonth() + 1}/${date.getDate()} ` : "";
  })();
  const a = remoteClock(first), b = remoteClock(last);
  const bad = done.filter((row) => row["상태"] !== "완료").length;
  return {
    group: {
      ids: done.map((row) => String(row["ID"] ?? "")).filter(Boolean),
      status: bad ? "실패" : "완료",
      time: `${day}${a && b && a !== b ? `${a}~${b}` : (b || a)}`,
      label: bad ? `${unit} ${done.length}장 (실패 ${bad})` : `${unit} ${done.length}장`,
    },
    rest,
  };
}
