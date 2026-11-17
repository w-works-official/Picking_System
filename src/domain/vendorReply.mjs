// 📥 거래처 회신 읽기 (2026-11-17) — AI 판독 결과 + 우리가 보낸 주문 줄 → 팝업 줄
//  · 표시 없는 줄 = 주문 수량대로 출고 (AI 가 빠뜨린 줄도 같음)
//  · img · y = 그 줄이 회신 그림 몇 번째의 어느 높이에 있는지 (사진 옆에 숫자를 붙이는 자리, 없으면 null)
//  · 애매(sure:false) · 회신을 못 찾음 · 주문보다 많음 · 숫자를 못 읽음 → 노랑 (사람이 확인)

const num = (v) => { const n = Number(String(v ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : 0; };

export function mergeReply(lines = [], ai = {}) {
  const found = ai.replyFound !== false;
  const byNo = new Map((ai.items || []).map((it) => [String(it.no).trim(), it]));
  return lines.map((line) => {
    const order = num(line.qty);
    const it = byNo.get(String(line.no).trim());
    let qty = order, sure = found, mark = it?.mark || "";
    if (it) {
      if (it.qty === null || it.qty === undefined || !Number.isFinite(Number(it.qty))) { sure = false; mark = mark || "숫자 못 읽음"; }
      else { qty = Math.max(0, Math.round(Number(it.qty))); sure = found && it.sure === true; }
    } else if (found) mark = "표시 없음 → 주문대로";
    if (qty > order && order > 0) { sure = false; mark = `${mark ? `${mark} · ` : ""}주문보다 많음`; }
    const y = Number(it?.y), img = Number(it?.img);
    const at = it && it.y !== null && it.y !== undefined && Number.isFinite(y) && y >= 0 && y <= 1 && Number.isInteger(img) && img >= 0;
    return { no: String(line.no), option: line.option || "", code: line.code || "", order, qty, sure, mark, img: at ? img : null, y: at ? y : null };
  });
}

// 팝업에서 저장할 줄: F 메인 탭 줄이 짝 맞은 것만 { row, qty }
export function saveUpdates(rows = [], matches = []) {
  const rowOf = new Map(matches.filter((m) => m.row).map((m) => [String(m.line.no), m.row]));
  return rows.filter((r) => rowOf.has(String(r.no))).map((r) => ({ row: rowOf.get(String(r.no)), qty: Math.max(0, Math.round(num(r.qty))) }));
}

// 업체 줄과 가장 많이 짝이 맞는 F 파일
export function pickStockFile(files = [], lines = [], match) {
  let best = null;
  for (const f of files) {
    const m = match(lines, f.main || []);
    const n = m.filter((x) => x.row).length;
    if (n && (!best || n > best.n)) best = { file: f, matches: m, n };
  }
  return best;
}
