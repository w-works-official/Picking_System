// 📊 오늘 CS 리포트 (2026-11-17) — 리뷰 · 상담톡 · 게시판을 카톡 메시지 3개로
//  · 리뷰: 보통 평가는 빼고 별5(아주 좋음) N개 · 별1(아주 나쁨) N개 — 내용이 긴(자세한) 것부터
//  · 상담톡: 오늘 상담 건수 + 문의 & 결과를 N줄(제목처럼)
//  · 게시판: 상담톡과 같음 (에이블리 문의방은 상담톡에 있으므로 뺌, 리뷰도 뺌)
//  · 설정(N개 · N줄 · 받는 카톡방 3곳까지)은 ⚙ 설정에서 한 번에 — 이 기기에 기억
export const REPORT_STORE_KEY = "system_v3_cs_report";
export const REPORT_DEFAULTS = Object.freeze({ reviewN: 3, chatLines: 5, boardLines: 5, rooms: Object.freeze(["", "", ""]), auto: false, time: "18:00", weekend: false });
export const REPORT_SENT_KEY = "system_v3_cs_report_sent";   // 자동 보내기: 그날 보냈는지 (이 기기)
export const REPORT_AUTO_WINDOW_MIN = 180;                    // 예약 시각이 지나고 3시간 안에 화면이 열려 있으면 보냄 (늦게 켜도 한 번)
export const REPORT_MAX_ROOMS = 3;   // 11-17: 받는 사람(카톡방) 3곳까지
export const REPORT_LIMITS = Object.freeze({ reviewN: [1, 10], chatLines: [1, 15], boardLines: [1, 15] });
const CHAT_SRC = { smart: "톡톡", kakao: "해피톡", ably: "에이블리" };
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

const str = (v) => String(v ?? "");
const oneLine = (v) => str(v).replace(/\s+/g, " ").trim();
const cut = (v, n) => { const s = oneLine(v); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const clampInt = (v, [lo, hi], dflt) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) && n >= lo ? Math.min(hi, n) : dflt; };

export function normalizeReportSettings(raw = {}) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    reviewN: clampInt(r.reviewN, REPORT_LIMITS.reviewN, REPORT_DEFAULTS.reviewN),
    chatLines: clampInt(r.chatLines, REPORT_LIMITS.chatLines, REPORT_DEFAULTS.chatLines),
    boardLines: clampInt(r.boardLines, REPORT_LIMITS.boardLines, REPORT_DEFAULTS.boardLines),
    rooms: reportRooms(r),
    auto: r.auto === true,
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(str(r.time)) ? str(r.time) : REPORT_DEFAULTS.time,
    weekend: r.weekend === true,
  };
}

// 한국 시각: 날짜 · 분(0~1439) · 요일(0=일)
export function kstClock(when = new Date()) {
  const k = new Date(when.getTime() + 9 * 3600 * 1000);
  return { day: k.toISOString().slice(0, 10), min: k.getUTCHours() * 60 + k.getUTCMinutes(), wd: k.getUTCDay() };
}

// ⏰ 지금 자동으로 보낼 때인가 — 켜짐 · 받는 사람 있음 · 평일(주말 포함이면 매일) · 예약 시각 ~ 3시간 안 · 오늘 아직 안 보냄
export function reportDue(cfg, now = new Date(), sentDay = "") {
  if (!cfg?.auto || !sendRooms(cfg.rooms).length) return false;
  const { day, min, wd } = kstClock(now);
  if (sentDay === day) return false;
  if (!cfg.weekend && (wd === 0 || wd === 6)) return false;
  const [h, m] = str(cfg.time).split(":").map(Number);
  const at = h * 60 + m;
  return min >= at && min < at + REPORT_AUTO_WINDOW_MIN;
}

// 자동 보내기 안내 한 줄
export function autoLabel(cfg) {
  if (!cfg?.auto) return "⏰ 자동 보내기 꺼짐 — 버튼으로만 보냅니다";
  return `⏰ ${cfg.weekend ? "매일" : "평일(월~금)"} ${cfg.time} 에 자동으로 보냅니다${sendRooms(cfg.rooms).length ? "" : " — 받는 사람을 적어 주세요"}`;
}

// 받는 카톡방 칸 3개 (빈칸 그대로 자리 유지 · 예전 설정 room 한 개도 1번 칸으로)
export function reportRooms(r = {}) {
  const src = Array.isArray(r.rooms) ? r.rooms : [r.room];
  return Array.from({ length: REPORT_MAX_ROOMS }, (_, i) => oneLine(src[i]).slice(0, 40));
}

// 실제로 보낼 곳: 2글자 이상 · 같은 이름은 한 번만
export function sendRooms(rooms = []) {
  const seen = new Set();
  return rooms.map(oneLine).filter((n) => {
    const k = n.replace(/\s+/g, "").toLowerCase();
    if (k.length < 2 || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// 한국 시간 날짜 'YYYY-MM-DD'
export function kstDay(when = new Date()) {
  const t = when instanceof Date ? when.getTime() : new Date(when).getTime();
  if (!Number.isFinite(t)) return "";
  return new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// 글의 날짜 → 한국 날짜. ISO(시각 포함)는 한국 시간으로, '2026.11.17' · '11-17' · '오늘' · '3시간 전' 도 읽음
export function dayOf(value, today) {
  const s = oneLine(value);
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return kstDay(s);
  let m = s.match(/(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\s*[-./월]\s*(\d{1,2})(?!\d)/);
  if (m && today) return `${today.slice(0, 4)}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  if (today && (/^(오늘|방금)/.test(s) || /\d+\s*(분|시간)\s*전/.test(s) || /^\d{1,2}:\d{2}$/.test(s))) return today;
  return "";
}

// 행이 오늘 것인가 — 글 날짜를 못 읽으면 수집 시각으로
export function isRowToday(row, today) {
  const d = dayOf(row?.date, today);
  return (d || dayOf(row?.collectedAt, today)) === today;
}

// 리뷰 별점 (1~5) — '별점 5' · '5점' · '★★★★★' · '4.5' · 10점 만점(10 → 5)
export function reviewStars(row) {
  const s = `${str(row?.type)} ${str(row?.title)}`;
  const stars = (s.match(/★/g) || []).length;
  if (stars) return Math.min(5, stars);
  const m = s.match(/(\d+(?:\.\d+)?)\s*(?:점|\/\s*(\d+))?/);
  if (!m) return 0;
  let n = Number(m[1]);
  const scale = Number(m[2]) || (n > 5 ? 10 : 5);
  if (scale === 10) n /= 2;
  return n >= 1 && n <= 5 ? n : 0;
}

const reviewText = (row) => oneLine(row?.question || row?.title);

// 오늘 리뷰 → 별5 N개 · 별1 N개 (내용이 긴 것부터 — 자세한 리뷰가 먼저)
export function pickReviews(rows = [], today, n = REPORT_DEFAULTS.reviewN) {
  const list = rows.filter((r) => r?.kind === "리뷰" && isRowToday(r, today));
  const byLen = (a, b) => reviewText(b).length - reviewText(a).length;
  const good = list.filter((r) => reviewStars(r) >= 5).sort(byLen);
  const bad = list.filter((r) => { const s = reviewStars(r); return s > 0 && s <= 1; }).sort(byLen);
  return { total: list.length, goodCount: good.length, badCount: bad.length, good: good.slice(0, n), bad: bad.slice(0, n) };
}

// 오늘 상담톡 대화 → 요약용 항목 {src, q, a, done}
export function chatItems(chats = {}, today) {
  const out = [];
  for (const key of Object.keys(CHAT_SRC)) {
    for (const conv of Array.isArray(chats?.[key]) ? chats[key] : []) {
      if (dayOf(conv?.at, today) !== today) continue;
      const msgs = (Array.isArray(conv.messages) ? conv.messages : []).filter((m) => oneLine(m?.text));
      const ours = msgs.filter((m) => m.who === "s");
      const theirs = msgs.filter((m) => m.who !== "s");
      out.push({
        src: CHAT_SRC[key],
        tag: cut(conv.tag, 30),
        q: cut(theirs.slice(-3).map((m) => m.text).join(" / ") || conv.preview, 300),
        a: cut(ours.length ? ours[ours.length - 1].text : "", 200),
        done: msgs.length > 0 && msgs[msgs.length - 1].who === "s",
      });
    }
  }
  return out;
}

// 오늘 게시판 문의 → 요약용 항목 (리뷰 · 에이블리 문의방 제외)
export function boardItems(rows = [], today, answerOf = () => "") {
  return rows
    .filter((r) => r?.kind === "문의" && !(r.vendor === "에이블리" && r.board === "문의방") && isRowToday(r, today))
    .map((r) => {
      const a = oneLine(r.reg?.text || answerOf(r));
      return {
        src: r.vendor || r.board || "게시판",
        tag: cut(r.type, 30),
        q: cut([r.title, r.question].filter(Boolean).join(" — "), 300),
        a: cut(a, 200),
        done: r.reg?.state === "완료" || r.closed === true,
      };
    });
}

// AI 없이 만드는 N줄 (AI 가 안 될 때) — 미답부터
export function fallbackLines(items = [], n = 5) {
  const sorted = [...items].sort((a, b) => Number(a.done) - Number(b.done));
  const lines = sorted.slice(0, n).map((it) => `[${it.src}] ${cut(it.tag || it.q, 26)} → ${it.done ? (cut(it.a, 18) || "답변함") : "미답"}`);
  if (items.length > n && lines.length) lines[lines.length - 1] += ` (외 ${items.length - n}건)`;
  return lines;
}

function countBy(items) {
  const m = new Map();
  for (const it of items) m.set(it.src, (m.get(it.src) || 0) + 1);
  return [...m].map(([k, v]) => `${k} ${v}`).join(" · ");
}

// 받침 있으면 '이', 없으면 '가'
export function josaIga(word) {
  const c = str(word).trim().slice(-1).charCodeAt(0);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? "이" : "가";
}

export function reportHead(today, part, title) {
  const [y, mo, d] = today.split("-").map(Number);
  const wd = WEEK[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  return `📊 ${mo}/${d}(${wd}) CS 리포트 ${part}/3 · ${title}`;
}

function reviewLine(r, i) {
  const where = [r.vendor, cut(r.product, 24)].filter(Boolean).join(" · ");
  return `${i + 1}. ${where ? `[${where}]` : "리뷰"}\n   "${cut(reviewText(r), 80)}"`;
}

export function reviewMessage(today, picked) {
  const head = reportHead(today, 1, "⭐ 리뷰");
  if (!picked.total) return `${head}\n오늘 들어온 리뷰가 없습니다.`;
  const lines = [head, `오늘 리뷰 ${picked.total}건 (별5 ${picked.goodCount} · 별1 ${picked.badCount} · 보통 평가는 뺌)`, ""];
  lines.push(`👍 아주 좋은 리뷰 (별5) ${picked.good.length}개`);
  lines.push(...(picked.good.length ? picked.good.map(reviewLine) : ["   없음"]));
  lines.push("", `👎 아주 나쁜 리뷰 (별1) ${picked.bad.length}개`);
  lines.push(...(picked.bad.length ? picked.bad.map(reviewLine) : ["   없음"]));
  return lines.join("\n");
}

export function summaryMessage(today, part, title, unit, items, lines) {
  const head = reportHead(today, part, title);
  if (!items.length) return `${head}\n오늘 들어온 ${unit}${josaIga(unit)} 없습니다.`;
  const open = items.filter((it) => !it.done).length;
  return [head, `오늘 ${unit} ${items.length}건 (${countBy(items)}) · 답변 ${items.length - open} · 미답 ${open}`, "", ...lines.map((l) => `▪ ${oneLine(l)}`)].join("\n");
}
