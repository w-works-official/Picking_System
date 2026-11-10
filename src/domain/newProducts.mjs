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

// 칸 이름: 시트 2~3줄은 예시 상품이라 머리글로 못 씀 → 알려진 칸은 정해 둔 이름, 그 밖(AE~)만 시트 1줄 머리글
const NAMES = ["", "브랜드", "이미지", "제품폴더", "체크 항목", "옵션", "제품 특징", "모델 착용", "제품명", "매입옵션명",
  "발주단위", "최소발주", "매입가", "소비자가", "배율", "매입처", "기타", "임의필드", "바코드(등록일)",
  "HTML 메이크샵", "HTML 스스", "HTML 에이블리", "직진배송", "셀피아코드", "자사코드", "메모",
  "셀피아 추가정보", "스스 추가상품", "에이블리 직접입력옵션", "메이크샵 등록"];
export function labelOf(labels = [], c) {
  if (NAMES[c]) return NAMES[c];
  const t = String(labels[c] || "").split(/\n/)[0].replace(/\s+/g, " ").trim();
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

// 카드 사진: 시트 C열 셀 안 사진(구글 임시 주소) → 없으면 허브 상품 사진(셀피아코드 X열: 공용 → 1번 옵션)
export function photoCandidates(row) {
  const out = [];
  if (/^https:\/\//.test(String(row?.img || ""))) out.push({ src: row.img, from: "시트" });
  const code = String(row?.cells?.[COL.sellpia] || "").trim();
  if (/^[0-9A-Za-z][0-9A-Za-z_-]{0,40}$/.test(code)) {
    for (const stem of [`${code}.__priority`, code, `${code}-1.__priority`, `${code}-1`, `${code}-1.__group`, `${code}-1.__range`]) out.push({ hub: `${stem}.jpg`, from: "허브" });
  }
  return out;
}
