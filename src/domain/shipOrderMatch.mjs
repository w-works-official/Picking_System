// 🚚 배송기록 › [주문서 찾기] (2026-11-11) — 송장에서 '보이는 글자만' 읽은 힌트로 피킹 주문(누적)과 일치도 매기기
//  · 힌트: { name: "홍?동", phone: "010-????-5678", invoice: "6891????4321", address: "서울 강남구 테헤란로" } — ? · * · ○ = 안 보이는 글자
//  · 주문: 피킹 DB orders (receiver · receiver_name · receiver_mobile · receiver_tel · receiver_address · inv_no · dnum)
//  · 점수 = 힌트가 있는 항목들만으로 0~100 (보이는 글자 중 몇 개가 맞는지)
const UNKNOWN = /[?*○●_]/;
const clean = (s) => String(s ?? "").trim();
const digitsAndMask = (s) => clean(s).replace(/[^0-9?*○●]/g, "");
const onlyDigits = (s) => clean(s).replace(/\D/g, "");

// 보이는 글자 자리 비교 — 힌트를 주문 글자 위에 겹쳐 가장 잘 맞는 자리에서 (맞은 수 / 보이는 글자 수)
export function maskedRatio(hint, target, { fromEnd = false } = {}) {
  const h = [...clean(hint).replace(/\s+/g, "")];
  const t = [...clean(target).replace(/\s+/g, "")];
  const known = h.filter((c) => !UNKNOWN.test(c)).length;
  if (!known || !t.length) return null;
  let best = 0;
  const offsets = [];
  if (fromEnd) offsets.push(t.length - h.length);
  else for (let o = -(h.length - 1); o < t.length; o++) offsets.push(o);
  for (const o of offsets) {
    let hit = 0;
    h.forEach((c, i) => { if (!UNKNOWN.test(c) && t[o + i] === c) hit++; });
    // 길이가 다르면 조금 깎음 (홍길동 vs 홍길동이)
    const ratio = (hit / known) * (h.length === t.length ? 1 : 0.85);
    if (ratio > best) best = ratio;
  }
  return best;
}

// 운송장: 보이는 숫자 덩어리(3자리 이상)가 주문 송장번호 안에 그대로 있는지 — 덩어리 길이만큼 점수
export function invoiceRatio(hint, inv) {
  const runs = digitsAndMask(hint).split(/[?*○●]+/).filter((r) => r.length >= 3);
  const target = onlyDigits(inv);
  if (!runs.length || !target) return null;
  const total = runs.reduce((n, r) => n + r.length, 0);
  const hit = runs.filter((r) => target.includes(r)).reduce((n, r) => n + r.length, 0);
  return hit / total;
}

// 주소: 힌트 낱말(2글자 이상, 가려진 글자 없는 것) 중 주문 주소에 들어 있는 비율
export function addressRatio(hint, address) {
  const words = clean(hint).split(/[\s,()]+/).filter((w) => w.length >= 2 && !UNKNOWN.test(w));
  const target = clean(address).replace(/\s+/g, "");
  if (!words.length || !target) return null;
  return words.filter((w) => target.includes(w)).length / words.length;
}

const WEIGHTS = { name: 30, phone: 30, invoice: 35, address: 25 };
export function scoreOrder(hints = {}, order = {}) {
  const parts = {};
  const name = clean(order.receiver_name || order.receiver);
  if (clean(hints.name)) parts.name = maskedRatio(hints.name, name);
  const phoneHint = digitsAndMask(hints.phone);
  if (phoneHint.replace(/[?*○●]/g, "").length >= 4) {
    const a = maskedRatio(phoneHint, onlyDigits(order.receiver_mobile), { fromEnd: true });
    const b = maskedRatio(phoneHint, onlyDigits(order.receiver_tel), { fromEnd: true });
    parts.phone = Math.max(a ?? 0, b ?? 0);
  }
  if (clean(hints.invoice)) parts.invoice = invoiceRatio(hints.invoice, order.inv_no || order.dnum || order.invoice_no);
  if (clean(hints.address)) parts.address = addressRatio(hints.address, order.receiver_address);
  let got = 0, max = 0;
  for (const [k, v] of Object.entries(parts)) { if (v == null) { max += WEIGHTS[k]; continue; } got += WEIGHTS[k] * v; max += WEIGHTS[k]; }
  return { score: max ? Math.round((got / max) * 100) : 0, parts };
}

export function rankOrders(hints = {}, orders = [], top = 5) {
  return orders
    .map((o) => ({ order: o, ...scoreOrder(hints, o) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || String(b.order.receipt_date || "").localeCompare(String(a.order.receipt_date || "")))
    .slice(0, top);
}

// 화면에서 쓴 이름·전화도 힌트로 (송장 힌트보다 앞)
//  · 11-11 이름은 사람이 확인해 이름칸에 확정한 것만 씀 — 송장에서 AI 가 다시 읽은 이름은 쓰지 않음
export function mergeHints(photo = {}, typed = {}) {
  return {
    name: clean(typed.name),
    phone: clean(typed.phone) || clean(photo.phone),
    invoice: clean(photo.invoice),
    address: clean(photo.address),
  };
}

// 배송 시각 yyyyMMdd… → 주문 접수일 범위 (배송일 기준 앞 14일 ~ 그날)
export function receiptWindow(t, days = 14) {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(String(t || ""));
  const end = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : new Date(Date.now() + 9 * 3600000);
  const start = new Date(end.getTime() - days * 86400000);
  const ymd = (d) => d.toISOString().slice(0, 10);
  return { from: ymd(start), to: ymd(end) };
}

// 피킹 order_items → 메모 상품 줄
export function itemsToLines(items = []) {
  return items.map((it) => ({
    pname: clean(it.p_name || it.product_name),
    option: clean(it.p_option || it.option_name),
    qty: String(it.o_amount ?? it.qty ?? it.quantity ?? "").trim(),
    own: clean(it.p_dpcode || it.prod_code || it.own_code),
    code: clean(it.p_code || it.sellpia_product_code),
    etc: "",
  }));
}

// 후보 표시용 — 전화는 끝 4자리만
export const phoneTail = (o = {}) => { const d = onlyDigits(o.receiver_mobile || o.receiver_tel); return d ? `…${d.slice(-4)}` : ""; };
