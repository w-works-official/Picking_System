// 피킹시스템 › 데이터 › 미송 추이 (2026-11-24) — 계산만
// 미송 비율 = 미송 처리 ÷ 피킹 완료 (피킹 완료는 체크 횟수라 대략값)

export function shortageRate(created, picked) {
  const c = Number(created) || 0, p = Number(picked) || 0;
  return p > 0 ? Math.round((c / p) * 1000) / 10 : null;
}

export function normalizeTrendRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    day: String(r.day || "").slice(0, 10),
    created: Number(r.shortage_created) || 0,
    qty: Number(r.shortage_qty) || 0,
    changed: Number(r.shortage_changed) || 0,
    repicked: Number(r.shortage_repicked) || 0,
    picked: Number(r.picked) || 0,
  })).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.day)).sort((a, b) => a.day.localeCompare(b.day));
}

// 'YYYY-MM-DD' 의 그 주 월요일
export function weekStart(day) {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const back = (t.getUTCDay() + 6) % 7;
  return new Date(t.getTime() - back * 86400000).toISOString().slice(0, 10);
}

export function weeklyTrend(rows) {
  const map = new Map();
  for (const r of rows) {
    const k = weekStart(r.day);
    const w = map.get(k) || { week: k, days: 0, created: 0, qty: 0, picked: 0 };
    w.days += 1; w.created += r.created; w.qty += r.qty; w.picked += r.picked;
    map.set(k, w);
  }
  return [...map.values()].sort((a, b) => a.week.localeCompare(b.week)).map((w) => ({ ...w, rate: shortageRate(w.created, w.picked) }));
}

const WD = ["일", "월", "화", "수", "목", "금", "토"];
export function dayLabel(day) {
  const [y, m, d] = day.split("-").map(Number);
  return `${m}/${d}(${WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
}

export function kstToday(now = Date.now()) {
  return new Date(now + 9 * 3600000).toISOString().slice(0, 10);
}

export function addDays(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * 86400000).toISOString().slice(0, 10);
}
