// CS 관리 · 엑셀 내려받기 / 📥 엑셀 적용 (2026-10-29) — 수집기 [엑셀]·[엑셀 적용]을 웹으로.
// 내려받은 엑셀에서 "채택"(A~J)·"최종 문안"·"보류"만 고쳐서 올리면 그대로 고른 것으로 저장됩니다.
// 키 칸이 없거나 이미 등록 요청·완료된 줄은 건드리지 않습니다.
import { draftLabel, draftText, isCsRowLocked, pickedText, withEdit, withHold, withPick } from "./csBoard.mjs?v=20261029-cs-full1";

export const CS_EXCEL_FIXED = ["번호", "업체", "게시판", "날짜", "상품명", "문의", "채택", "최종 문안", "보류"];
export const CS_EXCEL_KEY = "키 (고치지 마세요)";

export function csExcelSheet(rows = [], kind = "문의") {
  const list = rows.filter((row) => row.kind === kind && !row.closed);
  const most = Math.min(10, Math.max(1, ...list.map((row) => row.drafts.length)));
  const header = [...CS_EXCEL_FIXED, ...Array.from({ length: most }, (_, i) => `답변안 ${draftLabel(i)}`), CS_EXCEL_KEY];
  const body = list.map((row, i) => [
    i + 1,
    row.vendor,
    row.board,
    row.date,
    row.product,
    [row.inquiry?.title, row.inquiry?.question].filter(Boolean).join("\n"),
    row.choice.pick >= 0 ? draftLabel(row.choice.pick) : "",
    pickedText(row),
    row.choice.hold ? "O" : "",
    ...Array.from({ length: most }, (_, d) => draftText(row, d)),
    row.key,
  ]);
  return { header, body, count: list.length };
}

function cell(record, name) {
  const value = record[name];
  return value === undefined || value === null ? "" : String(value).trim();
}

// 올린 엑셀(첫 줄 = 제목) → 바뀌는 문의별 새 선택 [{ key, choice, summary }]
export function csExcelChanges(rows = [], records = []) {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const changes = [];
  let locked = 0;
  let unknown = 0;
  let bad = 0;
  for (const record of records) {
    const key = cell(record, CS_EXCEL_KEY) || cell(record, "키");
    if (!key) continue;
    const row = byKey.get(key);
    if (!row) { unknown += 1; continue; }
    if (isCsRowLocked(row)) { locked += 1; continue; }
    const letter = cell(record, "채택").toUpperCase();
    const hold = /^(o|ㅇ|y|예|보류|1|true)$/i.test(cell(record, "보류"));
    const finalText = cell(record, "최종 문안");
    let choice = row.choice;
    let index = -1;
    if (letter) {
      index = row.drafts.findIndex((_, i) => draftLabel(i) === letter);
      if (index < 0) { bad += 1; continue; }
    }
    if (hold) {
      choice = withHold({ ...row, choice }, true);
    } else if (index >= 0) {
      choice = withPick({ ...row, choice }, index);
      if (finalText && finalText !== draftText({ ...row, choice }, index)) choice = withEdit({ ...row, choice }, index, finalText);
    } else if (row.choice.pick >= 0 || row.choice.hold) {
      choice = { ...withPick({ ...row, choice }, -1), hold: false };
    }
    const same = choice.pick === row.choice.pick && choice.hold === row.choice.hold && JSON.stringify(choice.edits) === JSON.stringify(row.choice.edits);
    if (same) continue;
    changes.push({ key, choice, summary: hold ? "보류" : index >= 0 ? `채택 ${letter}${choice.edits[index] !== undefined ? " (고침)" : ""}` : "선택 해제" });
  }
  return { changes, locked, unknown, bad };
}
