// 🆕 신상품 등록 (2026-11-10) — 구글시트 '업데이트 list' › '업데이트 순서' 탭 (순수 함수)
//  · 시트는 정보만: 읽기(newList) · 칸 하나 고치기(newSave) · 새 줄(newAdd) — 화면 모양은 V3 가 따로
//  · 칸 번호는 0부터 (A=0 … AD=29). 머리글 글자는 시트에서 받은 것을 그대로 씀 — 칸이 옮겨지면 여기 번호만 고치면 됨
export const COL = {
  brand: 1, image: 2, folder: 3, check: 4, option: 5, feature: 6, model: 7, name: 8, buyOption: 9,
  orderUnit: 10, minOrder: 11, cost: 12, price: 13, ratio: 14, vendor: 15, etc: 16, field: 17, barcode: 18,
  htmlMs: 19, htmlSs: 20, htmlAb: 21, direct: 22, sellpia: 23, own: 24, memo: 25,
};
// 카드에 늘 보이는 칸 (순서대로) · 여러 줄 칸
export const MAIN_FIELDS = [COL.name, COL.buyOption, COL.option, COL.check, COL.cost, COL.price, COL.ratio, COL.memo];
export const MULTILINE = new Set([COL.check, COL.option, COL.feature, COL.etc, COL.field, COL.htmlMs, COL.htmlSs, COL.htmlAb, 26, 27, 28]);
// 등록 진행 표시 (칸이 차 있으면 끝)
export const STEPS = [
  { c: COL.htmlMs, label: "HTML 메이크샵" },
  { c: COL.htmlSs, label: "HTML 스스" },
  { c: COL.htmlAb, label: "HTML 에이블리" },
  { c: 29, label: "메이크샵 등록" },
];
// 새 상품 입력 칸
export const ADD_FIELDS = [COL.folder, COL.check, COL.option, COL.name, COL.buyOption, COL.cost, COL.price, COL.vendor, COL.memo];

export const colName = (c) => { let s = ""; let n = c + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

// 머리글 → 짧은 이름 (시트 머리글의 첫 낱말 묶음, 너무 길면 자름)
const SHORT = { [COL.folder]: "제품폴더", [COL.option]: "옵션", [COL.name]: "제품명", [COL.cost]: "매입가", [COL.ratio]: "배율", [COL.vendor]: "매입처", [COL.memo]: "메모", [COL.check]: "체크 항목", [COL.feature]: "제품 특징", [COL.model]: "모델 착용", [COL.buyOption]: "매입옵션명", [COL.minOrder]: "최소발주", [COL.price]: "소비자가", [COL.barcode]: "바코드(등록일)", [COL.orderUnit]: "발주단위" };
export function labelOf(labels = [], c) {
  if (SHORT[c]) return SHORT[c];
  const t = String(labels[c] || "").replace(/\s+/g, " ").trim();
  if (!t) return `${colName(c)}열`;
  return t.length > 18 ? `${t.slice(0, 18)}…` : t;
}

export const isHtml = (v) => /<\s*(p|div|img|table|span|br)\b/i.test(String(v || ""));
export function preview(v, max = 120) {
  const t = String(v ?? "");
  if (isHtml(t)) return `HTML ${t.length.toLocaleString("ko-KR")}자`;
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export const stepsOf = (cells = []) => STEPS.map((s) => ({ ...s, done: !!String(cells[s.c] || "").trim() }));
export const allDone = (cells = []) => stepsOf(cells).every((s) => s.done);

// 찾기: 띄어쓰기로 나눈 낱말이 모두 어딘가 칸에 있으면 (HTML 칸은 빼고)
export function filterRows(rows = [], { q = "", todo = false } = {}) {
  const words = String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((row) => {
    if (todo && allDone(row.cells)) return false;
    if (!words.length) return true;
    const hay = row.cells.filter((v) => !isHtml(v)).join(" ").toLowerCase() + ` ${row.r}`;
    return words.every((w) => hay.includes(w));
  });
}

// 🤖 Claude 에게 보낼 글 (그 줄의 정보)
export function claudePrompt(row, labels = []) {
  const pick = [COL.folder, COL.check, COL.option, COL.feature, COL.model, COL.name, COL.buyOption, COL.vendor, COL.memo];
  const lines = pick.map((c) => [labelOf(labels, c), String(row.cells[c] || "").trim()]).filter(([, v]) => v).map(([k, v]) => `- ${k}: ${v.replace(/\n+/g, " / ")}`);
  return `[신상품 등록 · 업데이트 순서 ${row.r}줄]\n${lines.join("\n")}\n\n이 상품의 판매용 상품명 후보를 만들어 주세요.`;
}
export const CLAUDE_URL_DEFAULT = "https://claude.ai/new";
export function claudeLink(base, prompt) {
  const url = String(base || CLAUDE_URL_DEFAULT).trim();
  if (/^https:\/\/claude\.ai\/new\/?$/.test(url)) return `${url}?q=${encodeURIComponent(prompt).slice(0, 6000)}`;
  return /^https:\/\//.test(url) ? url : CLAUDE_URL_DEFAULT;
}
