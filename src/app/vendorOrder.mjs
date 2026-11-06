// 📦 거래처 메신저 — 주문서 → 업체별 표 그림 → 업체 카톡 창에 붙여넣기 (2026-11-05)
//  · [📥 주문서업로드] 또는 끌어다 놓기: PT-LIST(.xlsx) → 매입처별로 묶어 표 그림 1장 (멘트는 그림 위쪽)
//    kakao_order_send 가 만든 '업체명_MMDD.jpg'(·_2) 를 끌어다 놓아도 됨 (파일명 업체명 기준)
//  · 업체명 ↔ 슬롯 메모로 짝 → [🖼 사진적용] = 짝 맞은 창마다 붙여넣기 (보내기는 사람이: 카톡 미리보기 창 [전송])
//  · 그림은 이 브라우저 안에서만 만들고, 카톡 창으로만 갑니다 (어디에도 올리지 않음)
import { groupByVendor, matchSlot, normName, readOrderSheet, vendorFromFileName } from "../domain/orderSheet.mjs?v=20261105-vendor1";

const MEMO_KEY = "system_v3_cs_vendor_memo";
export const DEFAULT_ORDER_MEMO = "• 전달된 실수량 꼭 필요 부탁드립니다\n• 단가 다를시 꼭 말씀 부탁드립니다\n감사합니다 ☺";
const PASTE_GAP_MS = 1500;
const FONT = "'Pretendard', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif";
const COLS = [
  { key: "no", title: "순번", w: 56 },
  { key: "photo", title: "사진", w: 176 },
  { key: "product", title: "상품명", w: 250 },
  { key: "option", title: "옵션명", w: 230 },
  { key: "qty", title: "발주량", w: 76 },
  { key: "extra", title: "임의필드", w: 210 },
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
        g.font = qty ? `900 26px ${FONT}` : `500 16px ${FONT}`;
        g.fillStyle = qty ? "#b91c1c" : "#111827";
        g.textAlign = col.key === "no" || qty ? "center" : "left";
        const tx = g.textAlign === "center" ? x + col.w / 2 : x + 8;
        const parts = wrap(g, line[col.key], col.w - 16, 5);
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
  const memoEl = $("[data-vo-memo]");
  try { memoEl.value = storage?.getItem(MEMO_KEY) ?? DEFAULT_ORDER_MEMO; } catch { memoEl.value = DEFAULT_ORDER_MEMO; }

  const say = (t, tone = "") => { const el = $("[data-vo-msg]"); if (el) { el.textContent = t; el.className = `vo-msg ${tone}`; } };
  const names = () => Array.from({ length: panel.prefs.count }, (_, i) => panel.prefs.names[i] || "");
  // 11-06: 주문서 순서로 넣은 슬롯이 그대로면 그 슬롯 (메모를 고쳤으면 이름으로 다시 짝)
  const slotOf = (v, nm) => (Number.isInteger(v.slot) && v.slot < nm.length && normName(nm[v.slot]) === normName(v.vendor) ? v.slot : matchSlot(v.vendor, nm));
  // 11-06: 짝 맞은 슬롯 틀에 그 업체 주문 그림을 미리 보여 줌 (카톡 창이 붙으면 그 뒤로 가려짐)
  function showSlotPics(nm, urlOf) {
    panel.root.querySelectorAll(".msn-frame-pic").forEach((el) => el.remove());
    st.vendors.forEach((v, k) => {
      const slot = slotOf(v, nm), url = urlOf.get(k);
      const frame = slot >= 0 && url ? panel.root.querySelector(`[data-msn-frame="${slot}"]`) : null;
      if (!frame) return;
      const img = document.createElement("img");
      img.className = "msn-frame-pic";
      img.src = url;
      img.alt = `${v.vendor} 주문 그림`;
      frame.appendChild(img);
    });
  }

  function renderList() {
    const list = $("[data-vo-list]");
    const nm = names();
    const urls = [];
    const urlOf = new Map();
    list.innerHTML = st.vendors.map((v, k) => {
      const slot = slotOf(v, nm);
      const url = v.blobs[0] ? URL.createObjectURL(v.blobs[0]) : "";
      if (url) { urls.push(url); urlOf.set(k, url); }
      const n = v.lines ? `${v.lines.length}건` : `사진 ${v.blobs.length}장`;
      return `<li class="vo-item${slot < 0 ? " is-nomatch" : ""}${v.off ? " is-off" : ""}" data-vo-k="${k}">
        <label><input type="checkbox" data-vo-pick="${k}"${v.off || slot < 0 ? "" : " checked"}${slot < 0 ? " disabled" : ""}> <b>${esc(v.vendor)}</b> <small>${n}</small></label>
        <span class="vo-slot" data-vo-slot="${k}">${slot >= 0 ? `→ 슬롯 ${slot + 1}${nm[slot] ? ` (${esc(nm[slot])})` : ""}` : "[제외] 짝 맞는 슬롯 메모 없음"}</span>
        <span class="vo-state ${v.tone || ""}" data-vo-state="${k}">${esc(v.state || "")}</span>
        ${url ? `<a class="vo-thumb" href="${url}" target="_blank" rel="noopener" title="눌러서 크게 보기"><img src="${url}" alt="${esc(v.vendor)} 주문 그림"></a>` : ""}
      </li>`;
    }).join("");
    (st.urls || []).forEach((u) => URL.revokeObjectURL?.(u));
    st.urls = urls;
    showSlotPics(nm, urlOf);
    const ready = st.vendors.filter((v) => !v.off && slotOf(v, nm) >= 0).length;
    const apply = $("[data-vo-act=apply]");
    if (apply) { apply.disabled = st.busy || !ready; apply.textContent = st.busy ? "🖼 붙이는 중…" : `🖼 사진적용${ready ? ` (${ready}곳)` : ""}`; }
    $("[data-vo-summary]").textContent = st.vendors.length ? `${st.file} · 업체 ${st.vendors.length}곳 · 짝 맞음 ${st.vendors.filter((v) => slotOf(v, nm) >= 0).length}곳` : "주문서(.xlsx)나 업체 사진(업체명_MMDD.jpg)을 여기로 끌어다 놓으세요";
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
    const todo = st.vendors.map((v, k) => ({ v, k, slot: slotOf(v, nm) })).filter((x) => !x.v.off && x.slot >= 0);
    if (!todo.length) return;
    st.busy = true; renderList();
    const mark = (k, text, tone) => {
      Object.assign(st.vendors[k], { state: text, tone });
      const el = box.querySelector(`[data-vo-state="${k}"]`);
      if (el) { el.textContent = text; el.className = `vo-state ${tone}`; }
    };
    let ok = 0, miss = 0, bad = 0;
    try {
      await panel.syncSlots(true);
      let used = [];
      try { used = await panel.usedSlots(); } catch { /* 아래에서 실패 표시 */ }
      for (const { v, k, slot } of todo) {
        if (!used.includes(slot)) { miss += 1; mark(k, `슬롯 ${slot + 1} 에 붙은 카톡 창 없음 — [📐 일괄 붙이기] 먼저`, "is-bad"); continue; }
        try {
          for (const b of v.blobs) {
            await panel.pasteImage(slot, await toPng(document, b));
            await new Promise((r) => window.setTimeout(r, PASTE_GAP_MS));
          }
          ok += 1; mark(k, `✓ 붙여넣음 (${v.blobs.length}장) — 카톡에서 [전송]`, "is-ok");
        } catch (error) { bad += 1; mark(k, `실패: ${error?.message || error}`, "is-bad"); }
      }
      say(`사진적용: 붙여넣음 ${ok}곳${miss ? ` · 창 없음 ${miss}곳` : ""}${bad ? ` · 실패 ${bad}곳` : ""} — 각 카톡 창 미리보기에서 [전송]을 눌러 주세요.`, ok && !bad ? "is-ok" : "is-bad");
    } finally {
      st.busy = false; renderList();
    }
  }

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
    else if (b.dataset.voAct === "memo-reset") { memoEl.value = DEFAULT_ORDER_MEMO; memoEl.dispatchEvent(new window.Event("input")); }
  });
  box.addEventListener("change", (e) => {
    const p = e.target.closest("[data-vo-pick]");
    if (p) { st.vendors[Number(p.dataset.voPick)].off = !p.checked; renderList(); }
  });
  memoEl.addEventListener("input", () => {
    try { storage?.setItem(MEMO_KEY, memoEl.value); } catch { /* 이번 화면만 */ }
    window.clearTimeout(st.memoTimer);
    st.memoTimer = window.setTimeout(async () => {        // 멘트를 고치면 주문서 그림도 다시
      for (const v of st.vendors) if (v.lines) v.blobs = [await renderVendorTable(document, { vendor: v.vendor, lines: v.lines, memo: memoEl.value, image: v.image })];
      renderList();
    }, 600);
  });
  panel.root.addEventListener("input", (e) => { if (e.target.matches("[data-msn-name]")) renderList(); });   // 메모를 고치면 짝 다시
  panel.root.addEventListener("change", (e) => { if (e.target.matches("[data-msn-count]")) renderList(); });
  renderList();
  return { loadFiles, apply, state: st, renderList };
}
