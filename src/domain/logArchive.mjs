// 🗂 기록 보관함 (2026-11-25) — 피킹시스템 [데이터] 탭에서 CS 시트 '기록보관' 탭 검색 (평일 5일치)
export const LOG_KINDS = ["문의", "리뷰", "상담톡", "메신저", "거래처 회신"];

export function normalizeLogResult(json = {}) {
  const items = (Array.isArray(json.items) ? json.items : []).map((it = {}) => ({
    id: String(it.id || ""),
    at: String(it.at || ""),
    kind: String(it.kind || ""),
    platform: String(it.platform || ""),
    name: String(it.name || ""),
    text: String(it.text || ""),
    answer: String(it.answer || ""),
  })).filter((it) => it.id);
  const counts = {};
  for (const [k, v] of Object.entries(json.counts || {})) if (Number(v) > 0) counts[k] = Number(v);
  return { items, counts, matched: Number(json.matched) || items.length, total: Number(json.total) || 0, cutoff: String(json.cutoff || ""), keepWeekdays: Number(json.keepWeekdays) || 5 };
}

// 검색어 낱말 (띄어쓰기로 나눔, 소문자)
export function searchWords(q = "") {
  return String(q).toLowerCase().replace(/\s+/g, " ").trim().split(" ").filter(Boolean).slice(0, 10);
}

// 글을 [{ text, hit }] 조각으로 — 검색 낱말을 표시하려고 (대소문자 무시)
export function highlightParts(text = "", words = []) {
  const src = String(text);
  const ws = [...new Set(words.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!ws.length || !src) return [{ text: src, hit: false }];
  const low = src.toLowerCase();
  const out = [];
  let i = 0, start = 0;
  while (i < src.length) {
    const w = ws.find((x) => low.startsWith(x, i));
    if (w) {
      if (i > start) out.push({ text: src.slice(start, i), hit: false });
      out.push({ text: src.slice(i, i + w.length), hit: true });
      i += w.length; start = i;
    } else i += 1;
  }
  if (start < src.length) out.push({ text: src.slice(start), hit: false });
  return out;
}

// 첫 검색 낱말 둘레만 잘라 미리보기
export function snippet(text = "", words = [], size = 160) {
  const src = String(text).replace(/\s+/g, " ").trim();
  if (src.length <= size) return src;
  const low = src.toLowerCase();
  let at = -1;
  for (const w of words) { const k = low.indexOf(w); if (k >= 0 && (at < 0 || k < at)) at = k; }
  if (at < 0) return src.slice(0, size) + "…";
  const from = Math.max(0, at - Math.floor(size / 3));
  return (from > 0 ? "…" : "") + src.slice(from, from + size) + (from + size < src.length ? "…" : "");
}

// "11/25(수) 14:03" — 한국 시간
export function kstStamp(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t + 9 * 3600 * 1000);
  const w = "일월화수목금토"[d.getUTCDay()];
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${w}) ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
