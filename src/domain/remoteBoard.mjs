// 원격 실행 보드 연동 (2026-10-28 대표님 요청)
// 원격 실행 보드(kakamail80-cell/remote-board)와 같은 Apps Script 웹앱·같은 작업 큐를 씁니다.
// 버튼 목록은 구글 시트 [작업목록]이 정하므로 여기서는 받은 목록을 그대로 그립니다.
// 토큰은 코드에 넣지 않습니다(공개 저장소) — 화면에서 한 번 입력받아 이 기기에만 저장합니다.
export const REMOTE_BOARD_URL = "https://script.google.com/macros/s/AKfycbxfPwqeMm7oy2bm4gUp3orBDBsTLrKA2Q9wQNC-ADs3Qp9hc2nZyT_uK7Lvmgqc4t3x/exec";
export const REMOTE_BOARD_PAGE = "https://kakamail80-cell.github.io/remote-board/";
export const REMOTE_BOARD_STORAGE_KEY = "system_v3_remote_board";

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

// 큐 → 작업코드별 칩 목록(먼저 누른 것이 앞). 취소된 건과 숨김 처리한 건은 뺍니다.
export function remoteQueueByCode(queue = [], hidden = () => false) {
  const byCode = {};
  [...(queue || [])].reverse().forEach((row) => {
    if (!row || row["상태"] === "취소" || hidden(row["ID"])) return;
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
