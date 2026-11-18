// 오늘 검품 리포트 (2026-11-18) — 계산·글자만 (화면 없음)
// 검품 건수 = 검품 화면에서 송장번호로 조회한 송장 수 (같은 날 · 같은 컴퓨터 · 같은 송장은 1건, DB inspection_lookup_log 가 막음)

export const INSPECTION_PC_KEY = "system-v3-inspection-pc";

// 송장번호 숫자만 (8자리 미만이면 기록 안 함)
export function invoiceDigits(v) {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length >= 8 ? d : "";
}

// 컴퓨터 이름: 이름이 있으면 '이름 (컴퓨터2)', 없으면 '컴퓨터2'
export function pcLabel(pc, name = "") {
  const n = String(name || "").trim();
  return n ? `${n} (컴퓨터${pc})` : `컴퓨터${pc}`;
}

// 리포트 정리: 컴퓨터별 건수(많은 순 X — 번호 순) · 합계 · 발송 · 누락
export function summarizeInspection(r = {}) {
  const pcs = (Array.isArray(r.pcs) ? r.pcs : []).map((p) => ({ pc: Number(p.pc) || 0, name: String(p.name || ""), count: Number(p.count) || 0 })).filter((p) => p.pc > 0).sort((a, b) => a.pc - b.pc);
  const sum = pcs.reduce((s, p) => s + p.count, 0);
  const looked = Number(r.looked) || 0;
  const shipped = Number(r.shipped) || 0;
  const missing = Number(r.missing) || 0;
  return {
    day: String(r.day || ""),
    pcs,
    sum,                       // 컴퓨터별 합 (두 컴퓨터가 같은 송장을 조회하면 2)
    looked,                    // 조회한 송장 (컴퓨터 상관없이 1건)
    shipped,                   // 그날 목록에서 빠져나간(출고된) 송장
    missing,                   // 그중 어디서도 조회 안 한 송장
    missingRate: shipped ? Math.round((missing / shipped) * 100) : 0,
    missingList: (Array.isArray(r.missingList) ? r.missingList : []).map((m) => ({ invoice: String(m.invoice || ""), order: String(m.order || ""), at: String(m.at || "") })),
    waiting: Number(r.waiting) || 0,
    trackingSince: String(r.trackingSince || ""),
  };
}

// '2026-11-18T15:08:27+09:00' → '15:08'
export function hhmm(at) {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return "";
  const k = new Date(t + 9 * 3600000);
  return `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}
