// 상품 관리 · 상품명 요청 (2026-10-29 대표님 요청) — 키워드·메모 → AI 상품명 후보.
// 지금은 형태만: 규칙은 CS 시트의 [상품명 규칙] 탭 A1(나중에 대표님이 셋팅), 요청·결과는 [상품명 요청] 탭에 기록.
// 시트·비밀번호는 CS 관리와 같은 것(BOARD_TOKEN)을 씁니다 — 코드에는 비밀번호 없음.
// 이 파일은 순수 계산만(그리기·네트워크는 productNamePanel.mjs).
export const NAME_COUNTS = [3, 5, 10];
export const NAME_DEFAULT_COUNT = 5;
export const NAME_KEYWORDS_LIMIT = 2000;

export function nameRequestPayload({ keywords = "", count = NAME_DEFAULT_COUNT, editor = "" } = {}) {
  const text = String(keywords ?? "").trim();
  if (!text) throw new Error("키워드·메모를 넣어 주세요.");
  if (text.length > NAME_KEYWORDS_LIMIT) throw new Error(`키워드·메모는 ${NAME_KEYWORDS_LIMIT}자까지입니다.`);
  const n = Math.floor(Number(count));
  return {
    action: "name",
    keywords: text,
    count: NAME_COUNTS.includes(n) ? n : NAME_DEFAULT_COUNT,
    editor: String(editor ?? "").trim().slice(0, 20),
  };
}

export function parseNameResponse(json) {
  if (!json || typeof json !== "object") throw new Error("시트 응답을 읽지 못했습니다.");
  if (json.ok !== true) {
    const error = new Error(String(json.error || "시트가 요청을 거절했습니다."));
    if (json.denied) error.denied = true;
    throw error;
  }
  const seen = new Set();
  const names = [];
  for (const raw of Array.isArray(json.names) ? json.names : []) {
    const name = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  if (!names.length) throw new Error("AI 가 상품명을 만들지 못했습니다. 다시 눌러 주세요.");
  return names;
}
