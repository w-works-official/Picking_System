// 📦 거래처 메신저 — 주문서 → 업체별 표 그림 → 업체 카톡 창에 붙여넣기 (2026-11-05)
//  · [📥 주문서업로드] 또는 끌어다 놓기: PT-LIST(.xlsx) → 매입처별로 묶어 표 그림 1장 (멘트는 그림 위쪽)
//    kakao_order_send 가 만든 '업체명_MMDD.jpg'(·_2) 를 끌어다 놓아도 됨 (파일명 업체명 기준)
//  · 업체명 ↔ 슬롯 메모로 짝 → [🖼 사진적용] = 짝 맞은 창마다 붙여넣기 (보내기는 사람이: 카톡 미리보기 창 [전송])
//  · 그림은 이 브라우저 안에서만 만들고, 카톡 창으로만 갑니다 (어디에도 올리지 않음)
import { groupByVendor, matchSlot, normName, readOrderSheet, vendorFromFileName } from "../domain/orderSheet.mjs?v=20261112-color1";

const MEMO_KEY = "system_v3_cs_vendor_memo";
export const DEFAULT_ORDER_MEMO = "• 전달된 실수량 꼭 필요 부탁드립니다\n• 단가 다를시 꼭 말씀 부탁드립니다\n감사합니다 ☺";
const PASTE_GAP_MS = 1500;
const FONT = "'Pretendard', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif";
// 11-06: 엑셀과 같은 칸 — 순번 · 사진 · 옵션명 · 발주량 · 임의필드 · 매입가 · 상품코드 (A~G열, 발주량 칸 노랑 = 급한 상품)
//  11-10: A열 순번 꼭 포함 (업체와 줄 번호로 확인)
export const COLS = [
  { key: "no", title: "순번", w: 64 },
  { key: "photo", title: "사진", w: 176 },
  { key: "option", title: "옵션명", w: 260 },
  { key: "qty", title: "발주량", w: 92 },
  { key: "extra", title: "임의필드", w: 260 },
  { key: "price", title: "매입가", w: 92 },
  { key: "code", title: "상품코드", w: 112 },
];

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// 칸 폭에 맞춰 줄바꿈 (최대 maxLines 줄, 넘치면 …)
function wrap(g, text, width, maxLines) {
  const out = [];
  let cur = "";
  for (const ch of String(text ?? "")) {
    if (ch === "\n") { out.push(cur); cur = ""; continue; }
    if (g.measureText(cur + ch).width > width && cur) { out.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) out.push(cur);
  if (out.length > maxLines) { out.length = maxLines; out[maxLines - 1] = `${out[maxLines - 1].slice(0, -1)}…`; }
  return out;
}

// 11-12 대표님: 매입가가 0 이면 분홍칠 + "가격 확인 부탁드립니다"
export const ZERO_PRICE_BG = "#FFC7CE";
export const ZERO_PRICE_TEXT = "가격 확인\n부탁드립니다";
export function isZeroPrice(v) {
  const t = String(v ?? "").replace(/[\s,₩원]/g, "");
  return t !== "" && /^0+(\.0+)?$/.test(t);
}

// 칠한 색 위 글자색 고르기 (11-12)
function rgbOf(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ""));
  return m ? m.slice(1).map((h) => parseInt(h, 16)) : null;
}
const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
export function isDark(hex) {
  const c = rgbOf(hex);
  return !!c && lum(c) < 140;
}
// 11-12 대표님: 어두운 색은 연분홍(#FFC7CE) 정도 밝기까지만 흰색을 섞음 (밝은 색은 원본 그대로)
export const MIN_LUM = 210;   // 연분홍(#FFC7CE) 정도의 밝기
export function softColor(hex) {
  const c = rgbOf(hex);
  if (!c || lum(c) >= MIN_LUM) return c ? `#${c.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}` : "";
  let lo = 0, hi = 1;
  for (let i = 0; i < 20; i += 1) {
    const t = (lo + hi) / 2;
    if (lum(c.map((v) => v + (255 - v) * t)) >= MIN_LUM) hi = t; else lo = t;
  }
  return `#${c.map((v) => Math.round(v + (255 - v) * hi).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}
export function isReddish(hex) {
  const c = rgbOf(hex);
  return !!c && c[0] >= 0xc0 && c[0] - Math.max(c[1], c[2]) >= 0x40;
}

async function bitmapOf(blob) {
  try { return await createImageBitmap(blob); } catch { return null; }
}

// 업체 한 곳의 표 그림 (PNG Blob)
export async function renderVendorTable(document, { vendor, lines, memo = "", image }) {
  const pad = 16, rowH = 136, headH = 40, titleH = 44;
  const memoLines = String(memo || "").split("\n").filter((x, i, a) => x.trim() || i < a.length - 1);
  const width = COLS.reduce((s, c) => s + c.w, 0) + pad * 2;
  const top = pad + titleH + memoLines.length * 30 + (memoLines.length ? 10 : 0);
  const height = top + headH + lines.length * rowH + pad;
  const c = document.createElement("canvas");
  c.width = width; c.height = height;
  const g = c.getContext("2d");
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, width, height);
  g.fillStyle = "#111827"; g.font = `800 24px ${FONT}`; g.textBaseline = "middle";
  g.fillText(`${vendor} 주문 (${lines.length}건)`, pad, pad + titleH / 2);
  g.font = `600 19px ${FONT}`; g.fillStyle = "#1f2937";
  memoLines.forEach((t, i) => g.fillText(t, pad, pad + titleH + 15 + i * 30));
  // 머리줄
  let x = pad;
  g.fillStyle = "#fde68a"; g.fillRect(pad, top, width - pad * 2, headH);
  g.font = `800 16px ${FONT}`; g.fillStyle = "#111827"; g.textAlign = "center";
  for (const col of COLS) { g.fillText(col.title, x + col.w / 2, top + headH / 2); x += col.w; }
  // 줄
  for (let r = 0; r < lines.length; r += 1) {
    const line = lines[r], y = top + headH + r * rowH;
    if (r % 2) { g.fillStyle = "#f9fafb"; g.fillRect(pad, y, width - pad * 2, rowH); }
    x = pad;
    for (const col of COLS) {
      const zero = col.key === "price" && isZeroPrice(line.price);   // 11-12: 매입가 0 → 분홍칠 + 가격 확인 문구
      const bg = zero ? ZERO_PRICE_BG : softColor(line.colors?.[col.key] || "");   // 11-12: 엑셀에서 칠한 칸 색 그대로 (금액 변동 빨강 등)
      if (bg) { g.fillStyle = bg; g.fillRect(x, y, col.w, rowH); }
      if (col.key === "photo") {
        const img = line.images?.[0] ? await image(line.images[0]) : null;
        const bmp = img ? await bitmapOf(new Blob([img.data], { type: img.mime })) : null;
        if (bmp) {
          const s = Math.min((col.w - 12) / bmp.width, (rowH - 12) / bmp.height);
          const w = bmp.width * s, h = bmp.height * s;
          g.drawImage(bmp, x + (col.w - w) / 2, y + (rowH - h) / 2, w, h);
        } else { g.fillStyle = "#9ca3af"; g.font = `500 14px ${FONT}`; g.textAlign = "center"; g.fillText("(사진 없음)", x + col.w / 2, y + rowH / 2); }
      } else {
        const qty = col.key === "qty";
        if (qty && line.urgent) { g.fillStyle = "#ffff00"; g.fillRect(x + 1, y + 1, col.w - 2, rowH - 2); }   // 급한 상품 (엑셀 노랑 그대로)
        const small = col.key === "price" || col.key === "code" || col.key === "no";
        g.font = qty ? `900 26px ${FONT}` : col.key === "no" ? `800 18px ${FONT}` : col.key === "extra" ? `800 16px ${FONT}` : small ? `500 15px ${FONT}` : `500 16px ${FONT}`;
        g.fillStyle = qty ? "#111827" : col.key === "extra" && !isReddish(bg) ? "#dc2626" : "#111827";
        g.textAlign = qty || small ? "center" : "left";
        const tx = g.textAlign === "center" ? x + col.w / 2 : x + 8;
        if (zero) g.font = `800 13px ${FONT}`;
        const parts = wrap(g, zero ? ZERO_PRICE_TEXT : line[col.key], col.w - (zero ? 6 : 16), 5);
        parts.forEach((t, i) => g.fillText(t, tx, y + rowH / 2 + (i - (parts.length - 1) / 2) * 22));
      }
      x += col.w;
    }
  }
  // 칸 선
  g.strokeStyle = "#9ca3af"; g.lineWidth = 1;
  g.strokeRect(pad + 0.5, top + 0.5, width - pad * 2 - 1, headH + lines.length * rowH - 1);
  for (let r = 0; r <= lines.length; r += 1) { const y = top + headH + r * rowH + 0.5; g.beginPath(); g.moveTo(pad, y); g.lineTo(width - pad, y); g.stroke(); }
  x = pad;
  for (const col of COLS.slice(0, -1)) { x += col.w; g.beginPath(); g.moveTo(x + 0.5, top); g.lineTo(x + 0.5, top + headH + lines.length * rowH); g.stroke(); }
  return new Promise((res) => c.toBlob((b) => res(b), "image/png"));
}

// 끌어다 놓은 사진(JPG·PNG) → 클립보드용 PNG
async function toPng(document, blob) {
  if (blob.type === "image/png") return blob;
  const bmp = await bitmapOf(blob);
  if (!bmp) throw new Error("사진을 읽지 못했습니다.");
  const c = document.createElement("canvas");
  c.width = bmp.width; c.height = bmp.height;
  c.getContext("2d").drawImage(bmp, 0, 0);
  return new Promise((res) => c.toBlob((b) => res(b), "image/png"));
}

export function mountVendorOrder({ document, window, storage, panel }) {
  const box = panel?.root?.querySelector("[data-vendor-order]");
  if (!box) return null;
  const $ = (sel) => box.querySelector(sel);
  const st = { vendors: [], file: "", busy: false };     // vendors: [{ vendor, lines?, files?, blobs: [Blob], off }]
  // 11-06: 그림 위쪽 멘트 편집 칸은 뺌 — 이 기기에 저장된 멘트(없으면 기본 멘트)를 그대로 씀
  let savedMemo = DEFAULT_ORDER_MEMO;
  try { savedMemo = storage?.getItem(MEMO_KEY) ?? DEFAULT_ORDER_MEMO; } catch { /* 기본 멘트 */ }
  const memoEl = $("[data-vo-memo]") || { value: savedMemo, addEventListener() {}, dispatchEvent() {} };
  memoEl.value = savedMemo;

  // 11-06: 안내 글은 문제가 있을 때만 (잘 된 결과는 슬롯마다 작은 표시로)
  const say = (t, tone = "") => { const el = $("[data-vo-msg]"); if (!el) return; const show = tone === "is-bad" && t; el.textContent = show ? t : ""; el.hidden = !show; el.className = `vo-msg ${tone}`; };
  const names = () => Array.from({ length: panel.prefs.count }, (_, i) => panel.prefs.names[i] || "");
  // 11-06: 주문서 순서로 넣은 슬롯이 그대로면 그 슬롯 (메모를 고쳤으면 이름으로 다시 짝)
  const slotOf = (v, nm) => (Number.isInteger(v.slot) && v.slot < nm.length && normName(nm[v.slot]) === normName(v.vendor) ? v.slot : matchSlot(v.vendor, nm));
  // 11-06: 미리보기 목록 대신 슬롯에서 바로 — 짝 맞은 슬롯 = 초록 테두리(보냄 대상) · 슬롯 번호를 누르면 빼기/넣기
  //  · 슬롯 틀에 그 업체 주문 그림 · 오른쪽 위 작은 표시 = 붙여넣음 / 보냄 / 창 없음 …
  const urlOf = (v) => { if (!v.url && v.blobs?.[0]) v.url = URL.createObjectURL(v.blobs[0]); return v.url || ""; };
  function decorateSlots(nm) {
    panel.root.querySelectorAll(".msn-frame-pic, .msn-vo-state").forEach((el) => el.remove());
    panel.root.querySelectorAll("[data-msn-slot]").forEach((el) => { el.classList.remove("is-pick", "is-skip"); delete el.dataset.voK; });
    st.vendors.forEach((v, k) => {
      const slot = slotOf(v, nm);
      const el = slot >= 0 ? panel.root.querySelector(`[data-msn-slot="${slot}"]`) : null;
      if (!el) return;
      el.classList.add(v.off ? "is-skip" : "is-pick");
      el.dataset.voK = String(k);
      const no = el.querySelector(".msn-no");
      if (no) no.title = v.off ? "빠짐 — 누르면 다시 넣기" : "보냄 대상 — 누르면 빼기";
      const frame = el.querySelector("[data-msn-frame]");
      const url = urlOf(v);
      if (frame && url) {
        const img = document.createElement("img");
        img.className = "msn-frame-pic";
        img.src = url;
        img.alt = `${v.vendor} 주문 그림`;
        frame.appendChild(img);
      }
      const noted = !!panel.state?.notes?.[slot] && panel.state.notes[slot].state !== "ok";   // 노란 안내가 있으면 작은 표시는 생략 (겹침 방지)
      if (frame && v.state && !(noted && v.tone === "is-bad")) {
        const chip = document.createElement("span");
        chip.className = `msn-vo-state ${v.tone || ""}`;
        chip.dataset.voState = String(slot);
        chip.textContent = v.off ? "빠짐" : v.state;
        frame.appendChild(chip);
      } else if (frame && v.off) {
        const chip = document.createElement("span");
        chip.className = "msn-vo-state";
        chip.dataset.voState = String(slot);
        chip.textContent = "빠짐";
        frame.appendChild(chip);
      }
    });
  }

  function renderList() {
    const nm = names();
    decorateSlots(nm);
    const nomatch = st.vendors.filter((v) => slotOf(v, nm) < 0).map((v) => v.vendor);
    const matched = st.vendors.filter((v) => slotOf(v, nm) >= 0);
    const picked = matched.filter((v) => !v.off).length;
    for (const [act, on] of [["pickall", picked < matched.length], ["picknone", picked > 0]]) {
      const b = $(`[data-vo-act=${act}]`);
      if (b) b.disabled = st.busy || !matched.length || !on;
    }
    const pickInfo = $("[data-vo-picked]");
    if (pickInfo) pickInfo.textContent = matched.length ? `선택 ${picked} / ${matched.length}곳` : "";
    const toSend = st.vendors.filter((v) => v.pasted && !v.sent && !v.off).length;
    const sendAll = panel.root.querySelector("[data-vo-act=sendall]");
    if (sendAll) { sendAll.disabled = st.busy || !toSend; sendAll.textContent = st.busy ? "📨 보내는 중…" : `📨 선택 보내기${toSend ? ` (${toSend}곳)` : ""}`; }
    $("[data-vo-summary]").textContent = st.vendors.length ? `${st.file} · 업체 ${st.vendors.length}곳 · 짝 맞음 ${st.vendors.length - nomatch.length}곳${nomatch.length ? ` · 짝 없음: ${nomatch.join(", ")} (슬롯 메모에 업체명을 적으면 짝)` : ""}` : "주문서(.xlsx)나 업체 사진(업체명_MMDD.jpg)을 여기로 끌어다 놓으세요";
  }

  async function loadFiles(files) {
    const list = [...(files || [])];
    if (!list.length) return;
    st.busy = true; renderList();
    try {
      const xlsx = list.filter((f) => /\.xlsx$/i.test(f.name));
      const pics = list.filter((f) => /\.(jpe?g|png)$/i.test(f.name));
      const vendors = [];
      for (const f of xlsx) {
        say(`${f.name} 읽는 중…`);
        const sheet = await readOrderSheet(new Uint8Array(await f.arrayBuffer()));
        for (const grp of groupByVendor(sheet.lines)) {
          const blob = await renderVendorTable(document, { vendor: grp.vendor, lines: grp.lines, memo: memoEl.value, image: sheet.image });
          vendors.push({ vendor: grp.vendor, lines: grp.lines, blobs: [blob], image: sheet.image });
        }
      }
      const byName = new Map();
      for (const f of pics.sort((a, b) => a.name.localeCompare(b.name, "ko"))) {
        const who = vendorFromFileName(f.name);
        if (!who) continue;
        if (!byName.has(who.vendor)) byName.set(who.vendor, { vendor: who.vendor, blobs: [] });
        byName.get(who.vendor).blobs.push(f);
      }
      vendors.push(...byName.values());
      if (!vendors.length) { say("읽을 주문서·사진이 없습니다 — PT-LIST(.xlsx) 또는 업체명_MMDD.jpg 를 넣어 주세요.", "is-bad"); return; }
      // 11-06: 주문서(.xlsx)가 있으면 업체명을 주문서 위에서부터 순서대로 슬롯 1·2·3… 메모에 (매일 새 리스트 — 예전 메모는 바뀜)
      const fromSheet = vendors.filter((v) => v.lines && v.vendor !== "(매입처 없음)");
      let placed = 0;
      if (fromSheet.length && panel.setNames) {
        placed = panel.setNames(fromSheet.map((v) => v.vendor));
        fromSheet.forEach((v, i) => { if (i < placed) v.slot = i; });
      }
      st.vendors.forEach((v) => v.url && URL.revokeObjectURL?.(v.url));
      st.vendors = vendors;
      st.file = [...xlsx, ...pics].map((f) => f.name).slice(0, 2).join(", ") + (xlsx.length + pics.length > 2 ? ` 외 ${xlsx.length + pics.length - 2}개` : "");
      const skipped = pics.length - [...byName.values()].reduce((s, v) => s + v.blobs.length, 0);
      const over = fromSheet.length - placed;
      say(placed
        ? `업체 ${vendors.length}곳 준비됨 — 주문서 순서대로 슬롯 1~${placed} 메모에 업체명을 넣었습니다${over > 0 ? ` (슬롯이 모자라 ${over}곳은 빠짐)` : ""}. [📐 일괄 붙이기] → [🖼 사진적용]${skipped ? ` · 이름 규칙이 다른 사진 ${skipped}장은 뺌` : ""}`
        : `업체 ${vendors.length}곳 준비됨 — 짝이 안 맞는 업체는 슬롯 메모에 업체명(또는 카톡방 이름)을 적으면 바로 짝이 됩니다.${skipped ? ` (이름 규칙이 다른 사진 ${skipped}장은 뺌)` : ""}`, "is-ok");
    } catch (error) {
      say(`주문서를 읽지 못했습니다: ${error?.message || error}`, "is-bad");
    } finally {
      st.busy = false; renderList();
    }
  }

  async function apply() {
    if (st.busy) return;
    const nm = names();
    // 11-06: [📐 일괄 붙이기]에 합침 — 선택(초록)된 업체 중 아직 붙여넣지·보내지 않은 곳만 (다시 눌러도 이미 한 곳은 그대로)
    const todo = st.vendors.map((v, k) => ({ v, k, slot: slotOf(v, nm) })).filter((x) => !x.v.off && x.slot >= 0 && !x.v.pasted && !x.v.sent);
    if (!todo.length) return;
    st.busy = true; renderList();
    const mark = (k, text, tone) => { Object.assign(st.vendors[k], { state: text, tone }); decorateSlots(names()); };
    let ok = 0, miss = 0, bad = 0;
    try {
      await panel.syncSlots(true);
      let used = [];
      try { used = await panel.usedSlots(); } catch { /* 아래에서 실패 표시 */ }
      for (const { v, k, slot } of todo) {
        if (!used.includes(slot)) { miss += 1; mark(k, "창 없음", "is-bad"); continue; }
        try {
          for (const b of v.blobs) {
            await panel.pasteImage(slot, await toPng(document, b));
            await new Promise((r) => window.setTimeout(r, PASTE_GAP_MS));
          }
          ok += 1; v.pasted = true; v.sent = false; v.pastedSlot = slot; mark(k, `✓ 붙여넣음${v.blobs.length > 1 ? ` (${v.blobs.length}장)` : ""}`, "is-ok");
        } catch (error) { bad += 1; mark(k, `실패: ${error?.message || error}`, "is-bad"); }
      }
      st.last = { ok, miss, bad };   // (결과는 슬롯마다 작은 표시 — 전체 안내 글 없음)
    } finally {
      st.busy = false; renderList();
    }
  }

  // 11-06 📨 일괄 보내기: [🖼 사진적용]으로 붙여넣은 슬롯마다 카톡 [사진 보내기] 창에서 [전송] (Enter) — 누르기 전에 한 번 확인
  async function sendAll() {
    if (st.busy) return;
    const todo = st.vendors.map((v, k) => ({ v, k })).filter(({ v }) => v.pasted && !v.sent && !v.off);
    if (!todo.length) return;
    if (!window.confirm(`선택한 ${todo.length}곳 (${todo.map(({ v }) => v.vendor).join(", ")}) 카톡에 주문 그림을 [전송]합니다. 보낼까요?`)) return;
    st.busy = true; renderList();
    const mark = (k, text, tone) => { Object.assign(st.vendors[k], { state: text, tone }); decorateSlots(names()); };
    let ok = 0, none = 0, bad = 0;
    try {
      for (const { v, k } of todo) {
        try {
          const r = await panel.confirmSend(v.pastedSlot);
          if (r.popup) { ok += 1; v.sent = true; mark(k, "📨 보냄", "is-ok"); }
          else { none += 1; mark(k, "보낼 그림 창 없음 — 카톡 창 확인", "is-bad"); }
        } catch (error) { bad += 1; mark(k, `보내기 실패: ${error?.message || error}`, "is-bad"); }
        if (v !== todo[todo.length - 1].v) await new Promise((r) => window.setTimeout(r, PASTE_GAP_MS));
      }
      st.lastSend = { ok, none, bad };
    } finally {
      st.busy = false; renderList();
    }
  }
  panel.root.querySelector("[data-vo-act=sendall]")?.addEventListener("click", sendAll);
  panel.afterArrange = () => apply();   // 11-06: [📐 일괄 붙이기] = 창 붙이기 + 그림 붙여넣기

  const drop = $("[data-vo-drop]");
  const input = $("[data-vo-file]");
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("is-over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("is-over"); loadFiles(e.dataTransfer?.files); });
  input.addEventListener("change", () => { loadFiles(input.files); input.value = ""; });
  box.addEventListener("click", (e) => {
    const b = e.target.closest("[data-vo-act]");
    if (!b) return;
    if (b.dataset.voAct === "upload") input.click();
    else if (b.dataset.voAct === "apply") apply();
    else if (b.dataset.voAct === "pickall" || b.dataset.voAct === "picknone") {   // 전체 선택 / 선택 해제
      const off = b.dataset.voAct === "picknone";
      st.vendors.forEach((v) => { v.off = off; });
      renderList();
    }
    else if (b.dataset.voAct === "memo-reset") { memoEl.value = DEFAULT_ORDER_MEMO; memoEl.dispatchEvent(new window.Event("input")); }
  });
  // 슬롯 번호를 누르면 그 업체를 빼기/넣기 (초록 테두리 = 보냄 대상)
  panel.root.addEventListener("click", (e) => {
    const no = e.target.closest(".msn-no");
    const slot = no?.closest("[data-msn-slot]");
    if (!slot || slot.dataset.voK === undefined || st.busy) return;
    const v = st.vendors[Number(slot.dataset.voK)];
    if (v) { v.off = !v.off; renderList(); }
  });
  // 🗑 일괄 비우기: 올린 주문서·그림 · 슬롯 메모(업체명)·★·안내 · 보낼 답변 칸 (카톡 창은 그대로)
  async function clearAll() {
    if (st.busy) { say("붙이거나 보내는 중에는 비울 수 없습니다 — 끝난 뒤 다시 눌러 주세요.", "is-bad"); return; }
    if (!window.confirm("거래처 탭을 처음 상태로 비웁니다.\n· 올린 주문서·그림 · 선택\n· 슬롯 메모(업체명)·★·안내 · 보낼 답변 칸\n· 슬롯에 붙은 카톡 대화창과 [이미지 전송] 창 닫기\n(화면 연결·창 도우미 연결은 그대로) 비울까요?")) return;
    st.busy = true;
    try { await panel.resetWindows?.(); } finally { st.busy = false; }
    st.vendors.forEach((v) => v.url && URL.revokeObjectURL?.(v.url));
    st.vendors = []; st.file = "";
    panel.setNames?.([]);
    panel.root.querySelectorAll("[data-msn-text]").forEach((t) => { t.value = ""; });
    say("");
    renderList();
  }
  panel.root.querySelector("[data-vo-act=clearall]")?.addEventListener("click", clearAll);
  memoEl.addEventListener("input", () => {
    try { storage?.setItem(MEMO_KEY, memoEl.value); } catch { /* 이번 화면만 */ }
    window.clearTimeout(st.memoTimer);
    st.memoTimer = window.setTimeout(async () => {        // 멘트를 고치면 주문서 그림도 다시
      for (const v of st.vendors) if (v.lines) { v.blobs = [await renderVendorTable(document, { vendor: v.vendor, lines: v.lines, memo: memoEl.value, image: v.image })]; if (v.url) URL.revokeObjectURL?.(v.url); v.url = ""; }
      renderList();
    }, 600);
  });
  panel.root.addEventListener("input", (e) => { if (e.target.matches("[data-msn-name]")) renderList(); });   // 메모를 고치면 짝 다시
  panel.root.addEventListener("change", (e) => { if (e.target.matches("[data-msn-count]")) renderList(); });
  renderList();
  return { loadFiles, apply, sendAll, clearAll, state: st, renderList };
}
