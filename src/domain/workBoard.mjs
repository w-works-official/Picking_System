// 📋 업무 관리 › 업무 내역 (2026-11-25) — 화면 없는 계산만
export const WORK_SLOT_MAX = 5;
export const WORK_SLOTS_KEY = "system_v3_work_slots";
export const WORK_DRAFT_PREFIX = "system_v3_work_draft:";

const pad = (n) => String(n).padStart(2, "0");
export function kstDay(now = new Date()) {
  const d = new Date(now.getTime() + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
export function kstHour(now = new Date()) { return new Date(now.getTime() + 9 * 3600 * 1000).getUTCHours(); }
export function addDays(day, n) {
  const t = Date.parse(`${day}T00:00:00Z`) + n * 86400000;
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
export function dayLabel(day) {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(day || "");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${"일월화수목금토"[d.getUTCDay()]})`;
}

let seq = 0;
export function newId() { seq = (seq + 1) % 1e6; return `w${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 5)}`; }

export function cleanMin(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1440) : 0;
}
export function normalizeItems(list) {
  return (Array.isArray(list) ? list : []).map((it = {}) => ({ id: String(it.id || newId()), text: String(it.text || "").trim(), min: cleanMin(it.min) })).filter((it) => it.text);
}
export function sumMin(list) { return (list || []).reduce((a, it) => a + cleanMin(it.min), 0); }
export function fmtMin(m) {
  m = cleanMin(m);
  if (!m) return "0분";
  const h = Math.floor(m / 60), r = m % 60;
  return h ? `${h}시간${r ? ` ${r}분` : ""}` : `${r}분`;
}

// 자주 하는 업무에서 고른 것을 아래로 복사 (새 줄 아이디 · 예상 시간 그대로)
export function copyChecked(templates, checkedIds) {
  const pick = new Set(checkedIds || []);
  return normalizeItems(templates).filter((t) => pick.has(t.id)).map((t) => ({ id: newId(), text: t.text, min: t.min, from: t.id }));
}

// 줄 옮기기: id 줄을 to(am|pm) 칸의 beforeId 앞(없으면 맨 끝)으로
export function moveLine(day, id, to, beforeId = null) {
  const am = [...(day.am || [])], pm = [...(day.pm || [])];
  const lists = { am, pm };
  let item = null;
  for (const k of ["am", "pm"]) {
    const i = lists[k].findIndex((x) => x.id === id);
    if (i >= 0) item = lists[k].splice(i, 1)[0];
  }
  if (!item || !lists[to]) return day;
  const at = beforeId ? lists[to].findIndex((x) => x.id === beforeId) : -1;
  if (at >= 0) lists[to].splice(at, 0, item); else lists[to].push(item);
  return { ...day, am, pm };
}

// 직원별 내역 → 저장한 날 수 · 하루 평균 · 업무별 평균 시간 · 메모
export function historyStats(list) {
  const days = (Array.isArray(list) ? list : []).filter((d) => d && d.day);
  const tasks = new Map();
  let total = 0;
  for (const d of days) {
    const lines = [...normalizeItems(d.am), ...normalizeItems(d.pm)];
    total += sumMin(lines);
    for (const it of lines) {
      const key = it.text.replace(/\s+/g, " ").trim();
      const t = tasks.get(key) || { text: key, count: 0, min: 0, timed: 0 };
      t.count += 1;
      if (it.min) { t.min += it.min; t.timed += 1; }
      tasks.set(key, t);
    }
  }
  return {
    days: days.length,
    avgTotal: days.length ? Math.round(total / days.length) : 0,
    tasks: [...tasks.values()].map((t) => ({ text: t.text, count: t.count, avgMin: t.timed ? Math.round(t.min / t.timed) : 0 }))
      .sort((a, b) => b.count - a.count || b.avgMin - a.avgMin || a.text.localeCompare(b.text, "ko")),
    memos: days.filter((d) => String(d.memo || "").trim()).map((d) => ({ day: d.day, memo: String(d.memo).trim() })),
    perDay: days.map((d) => ({ day: d.day, total: sumMin([...normalizeItems(d.am), ...normalizeItems(d.pm)]), count: normalizeItems(d.am).length + normalizeItems(d.pm).length })),
  };
}

// 달력: 그 달 주별 칸 (일요일 시작, 빈 칸은 null)
export function monthGrid(day) {
  const [y, m] = String(day).split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Array(first.getUTCDay()).fill(null);
  for (let d = 1; d <= last; d++) cells.push(`${y}-${pad(m)}-${pad(d)}`);
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
export function monthShift(day, n) {
  const [y, m] = String(day).split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`;
}

// 슬롯 = 이 기기에 저장한 직원 이름 목록 (최대 5)
export function readSlots(storage) {
  try {
    const v = JSON.parse(storage?.getItem(WORK_SLOTS_KEY) || "[]");
    const out = (Array.isArray(v) ? v : []).map((x) => String(x || "").slice(0, 30)).slice(0, WORK_SLOT_MAX);
    return out.length ? out : [""];
  } catch { return [""]; }
}
export function writeSlots(storage, slots) {
  try { storage?.setItem(WORK_SLOTS_KEY, JSON.stringify((slots || []).slice(0, WORK_SLOT_MAX))); } catch {}
}
