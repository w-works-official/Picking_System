// 📥 거래처 탭 — 회신 읽기 (2026-11-17)
//  · 입고 리스트 F_1 PC_LIST · F_2 AC_LIST (.xlsm) 를 주문서와 같이 올림 → 이 화면이 파일 자리(핸들)를 기억해 저장 때 그 파일에 바로 씀
//  · 슬롯 업체명 옆 [읽기] → 붙은 카톡 대화창 그림(+ 붙여넣은 회신 사진) → CS 시트 v33 vendorRead (AI) → 팝업
//  · 팝업: 순번 · 옵션 · 발주량 · 지금 입고 · AI 판독 [− n +] (애매 = 노랑) → [저장] = F 메인 탭 S열 '입고' + 연한 분홍 → 팝업 닫힘
//  · 엑셀에서 F 파일이 열려 있으면 쓰기가 막힘 → 안내 + [⬇ 파일로 받기]
//  · (read2) 회신 사진을 크게 띄우고 순번 줄 바로 오른쪽에 판독 숫자를 붙여 보여줌 (AI 가 준 img · y 자리) — 숫자칸에서 바로 고침, 표와 같이 움직임
import { readStockMain, matchStockRows, writeStockIn } from "../domain/stockSheet.mjs?v=20261117-read2";
import { mergeReply, saveUpdates, pickStockFile } from "../domain/vendorReply.mjs?v=20261117-read2";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const isStockFile = (name) => /\.xlsm$/i.test(String(name || ""));

// 그림(파일·붙여넣기) → JPEG base64 (긴 변 1800px 까지)
async function imageData(document, blob) {
  const bmp = await createImageBitmap(blob);
  const s = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/jpeg", 0.88);
  return { id: `p${Date.now()}${Math.random().toString(36).slice(2, 6)}`, data: url.replace(/^data:[^,]*,/, ""), mime: "image/jpeg", url };
}

// 사진 둘레 빈 여백(흰 바탕)을 잘라낸 보기용 그림 + 자른 자리 (AI 에는 원본을 보냄)
async function trimmed(document, url) {
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight;
    const s = Math.min(1, 900 / Math.max(W, H));
    const w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, w, h);
    const px = g.getImageData(0, 0, w, h).data;
    const dark = (x, y) => { const k = (y * w + x) * 4; return px[k + 3] > 0 && px[k] + px[k + 1] + px[k + 2] < 690; };
    const rowHit = (y) => { let n = 0; for (let x = 0; x < w; x += 1) if (dark(x, y)) n += 1; return n > w * 0.004; };
    const colHit = (x) => { let n = 0; for (let y = 0; y < h; y += 1) if (dark(x, y)) n += 1; return n > h * 0.004; };
    let t = 0, b = h - 1, l = 0, r = w - 1;
    while (t < b && !rowHit(t)) t += 1;
    while (b > t && !rowHit(b)) b -= 1;
    while (l < r && !colHit(l)) l += 1;
    while (r > l && !colHit(r)) r -= 1;
    const pad = 6;
    const box = { x: Math.max(0, l - pad) / w, y: Math.max(0, t - pad) / h, w: (Math.min(w - 1, r + pad) - Math.max(0, l - pad) + 1) / w, h: (Math.min(h - 1, b + pad) - Math.max(0, t - pad) + 1) / h };
    if (box.w > 0.97 && box.h > 0.97) return { url, box: { x: 0, y: 0, w: 1, h: 1 } };
    const o = document.createElement("canvas");
    o.width = Math.round(W * box.w); o.height = Math.round(H * box.h);
    o.getContext("2d").drawImage(img, W * box.x, H * box.y, o.width, o.height, 0, 0, o.width, o.height);
    return { url: o.toDataURL("image/jpeg", 0.9), box };
  } catch { return { url, box: { x: 0, y: 0, w: 1, h: 1 } }; }
}

export function mountVendorRead({ document, window, panel, onChange = () => {} }) {
  const st = { files: [], pop: null };   // files: [{ name, bytes, handle, main, saved }]

  async function addStockFiles(files = [], handles = []) {
    const out = [];
    for (let i = 0; i < files.length; i += 1) {
      const f = files[i];
      const bytes = new Uint8Array(await f.arrayBuffer());
      const { rows } = await readStockMain(bytes);
      const rec = { name: f.name, bytes, original: bytes, handle: handles[i] || null, main: rows, saved: 0 };
      st.files = st.files.filter((x) => x.name !== f.name).concat(rec);
      out.push(rec);
    }
    onChange();
    return out;
  }
  const statusText = () => (st.files.length
    ? `입고 리스트: ${st.files.map((f) => `${f.name.replace(/\.xlsm$/i, "")}${f.handle ? "" : " (받기로 저장)"}${f.saved ? ` · ${f.saved}곳 저장` : ""}`).join(" / ")}`
    : "입고 리스트(F_1·F_2 .xlsm)도 같이 올리면 [읽기]로 회신을 입고에 넣습니다");

  async function sheetPost(body) {
    const { endpoint, token } = panel.sheetAuth?.() || {};
    if (!endpoint || !token) throw new Error("CS 시트에 연결된 뒤 쓸 수 있습니다 ([🏠 메인보드] 맨 위 웹 연결 비밀번호).");
    const res = await window.fetch(endpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ ...body, token }) });
    const js = await res.json().catch(() => ({}));
    if (!res.ok || !js.ok) throw new Error(/알 수 없는 요청/.test(js.error || "") ? "시트가 아직 회신 읽기(v33) 전입니다 — 시트 새 버전 배포 필요" : js.error || `시트 응답 오류 (${res.status})`);
    return js;
  }

  // ---------- 팝업 ----------
  function close() { st.pop?.el.remove(); st.pop = null; document.removeEventListener("paste", onPaste); window.removeEventListener("resize", placePins); }
  function rowHtml(r, i, cur) {
    return `<tr class="${r.sure ? "" : "is-unsure"}" data-vr-row="${i}">
      <td class="vr-no">${esc(r.no)}</td>
      <td class="vr-opt">${esc(r.option)}<small>${esc(r.code)}</small></td>
      <td class="vr-ord">${r.order}</td>
      <td class="vr-cur">${esc(cur ?? "")}</td>
      <td class="vr-qty"><button type="button" data-vr-step="-1" data-i="${i}">−</button><input type="number" min="0" step="1" value="${r.qty}" data-vr-qty="${i}"><button type="button" data-vr-step="1" data-i="${i}">+</button></td>
      <td class="vr-mark">${esc(r.mark)}</td></tr>`;
  }
  function render() {
    const p = st.pop;
    if (!p) return;
    const curOf = new Map(p.matches.map((m) => [String(m.line.no), m.current]));
    const unsure = p.rows.filter((r) => !r.sure).length;
    p.el.querySelector("[data-vr-body]").innerHTML = p.rows.length
      ? `<table class="vr-table"><thead><tr><th>순번</th><th>옵션명 · 상품코드</th><th>발주</th><th>지금 입고</th><th>입고 (AI 판독 · 고칠 수 있음)</th><th>본 표시</th></tr></thead><tbody>${p.rows.map((r, i) => rowHtml(r, i, curOf.get(r.no))).join("")}</tbody></table>`
      : `<p class="vr-wait">${esc(p.wait || "")}</p>`;
    renderShot();
    p.el.querySelector("[data-vr-note]").textContent = [p.note, p.rows.length ? `노랑 ${unsure}줄 = 애매해서 가장 비슷한 값을 넣었습니다 — 확인해 주세요.` : ""].filter(Boolean).join("  ·  ");
    p.el.querySelector("[data-vr-file]").textContent = p.file ? `→ ${p.file.name} 메인 탭 S열 '입고' (${p.matches.filter((m) => m.row).length}/${p.rows.length || p.lines.length}줄 짝)` : "입고 리스트(F 파일)가 없습니다 — 거래처 칸 위에 F_1·F_2 를 같이 올려 주세요";
    p.el.querySelector("[data-vr-save]").disabled = p.busy || !p.rows.length || !p.file;
    p.el.querySelector("[data-vr-reread]").disabled = p.busy;
    p.el.querySelector("[data-vr-save]").textContent = p.busy === "save" ? "저장하는 중…" : "저장";
  }
  // 회신 사진 + 오른쪽 숫자 줄 (그림 한 장씩, 위 탭으로 바꿈)
  function renderShot() {
    const p = st.pop;
    const box = p.el.querySelector("[data-vr-imgs]");
    if (!p.images.length) { box.innerHTML = `<p class="vr-wait">대화창 그림이 없습니다 — 회신 사진을 Ctrl+V 로 붙여넣어 주세요.</p>`; return; }
    if (!p.images.some((im) => im.id === p.cur)) p.cur = p.images[0].id;
    const k = p.images.findIndex((im) => im.id === p.cur);
    const im = p.images[k];
    if (!im.view) { im.view = { url: im.url, box: { x: 0, y: 0, w: 1, h: 1 }, wait: true }; trimmed(document, im.url).then((v) => { im.view = v; if (st.pop === p && p.cur === im.id) renderShot(); }); }
    const vb = im.view.box;
    const placed = p.rows.map((r, i) => ({ r, i, y: r.y === null ? null : (r.y - vb.y) / vb.h })).filter(({ r, y }) => r.imgId === im.id && y !== null && y >= -0.02 && y <= 1.02);
    const tabs = p.images.map((x, j) => {
      const n = p.rows.filter((r) => r.imgId === x.id && r.y !== null).length;
      return `<button type="button" class="vr-tab ${x.id === p.cur ? "is-on" : ""}" data-vr-tab="${esc(x.id)}">${j ? `사진 ${j}` : x.slot ? "카톡 대화창" : "사진 1"}${n ? ` · ${n}줄` : ""}</button>${p.images.length > 1 ? `<button type="button" class="vr-tab-x" data-vr-drop-img="${j}" title="이 그림 빼기">✕</button>` : ""}`;
    }).join("");
    box.innerHTML = `<div class="vr-tabs">${tabs}<span class="cs-flex"></span><button type="button" class="vr-zoom" data-vr-zoom="-1" title="작게">－</button><b class="vr-zoom-n">${p.zoom}%</b><button type="button" class="vr-zoom" data-vr-zoom="1" title="크게">＋</button></div>
      <div class="vr-stage"><div class="vr-shot" style="width:${p.zoom}%"><img src="${im.view.url}" alt="회신 그림" data-vr-shot-img><div class="vr-gutter" data-vr-gutter>${placed.map(({ r, i, y }) => `<div class="vr-pin ${r.sure ? "" : "is-unsure"}" data-vr-pin="${i}" data-y="${Math.min(1, Math.max(0, y))}" title="${esc(`${r.no}번 ${r.option} · 발주 ${r.order}${r.mark ? ` · ${r.mark}` : ""}`)}"><button type="button" data-vr-step="-1" data-i="${i}">−</button><input type="number" min="0" step="1" value="${r.qty}" data-vr-qty="${i}"><button type="button" data-vr-step="1" data-i="${i}">+</button></div>`).join("")}</div></div></div>
      ${p.rows.length && !placed.length ? `<p class="vr-wait vr-nopos">이 그림에서 줄 자리를 못 찾았습니다 — 오른쪽 표에서 확인해 주세요.</p>` : ""}`;
    const img = box.querySelector("[data-vr-shot-img]");
    if (img.complete) placePins(); else img.addEventListener("load", placePins, { once: true });
  }
  // 숫자 칸을 줄 높이에 맞추되 서로 겹치지 않게 아래로 밀기
  function placePins() {
    const g = st.pop?.el.querySelector("[data-vr-gutter]");
    if (!g) return;
    const h = g.clientHeight;
    const pins = [...g.querySelectorAll("[data-vr-pin]")].sort((a, b) => a.dataset.y - b.dataset.y);
    // 칸 높이 = 줄 사이 간격 (사진 줄 높이에 맞춤, 18~40px)
    const gaps = pins.slice(1).map((el, j) => (el.dataset.y - pins[j].dataset.y) * h).filter((d) => d > 4).sort((a, b) => a - b);
    const gap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 36;
    const ph = Math.round(Math.min(40, Math.max(18, gap - 3)));
    g.style.setProperty("--pin-h", `${ph}px`);
    let last = -Infinity;
    for (const el of pins) {
      const top = Math.max(Number(el.dataset.y) * h - ph / 2, last + 1, 0);
      el.style.top = `${Math.round(top)}px`;
      last = top + ph;
    }
  }
  // 같은 줄의 숫자칸(사진 옆 · 표)을 함께 맞춤
  function syncRow(i) {
    const r = st.pop.rows[i];
    st.pop.el.querySelectorAll(`[data-vr-qty="${i}"]`).forEach((inp) => { if (Number(inp.value) !== r.qty) inp.value = r.qty; });
    st.pop.el.querySelectorAll(`[data-vr-row="${i}"], [data-vr-pin="${i}"]`).forEach((el) => el.classList.toggle("is-unsure", !r.sure));
  }
  function hot(i) {
    st.pop?.el.querySelectorAll(".is-hot").forEach((el) => el.classList.remove("is-hot"));
    if (i === null || i === undefined) return;
    st.pop.el.querySelectorAll(`[data-vr-row="${i}"], [data-vr-pin="${i}"]`).forEach((el) => el.classList.add("is-hot"));
  }

  function say(t, tone = "") { const el = st.pop?.el.querySelector("[data-vr-msg]"); if (el) { el.textContent = t; el.className = `vr-msg ${tone}`; } }

  async function runAi() {
    const p = st.pop;
    if (!p) return;
    if (!p.images.length) { say("읽을 그림이 없습니다 — 회신 사진을 Ctrl+V 로 붙여넣은 뒤 [🔄 다시 읽기].", "is-bad"); return; }
    p.busy = "ai"; p.wait = "AI 가 회신 사진·메시지를 읽는 중… (10~30초)"; p.rows = p.rows.length ? p.rows : []; render(); say("");
    try {
      const sent = p.images.slice();
      const js = await sheetPost({ action: "vendorRead", vendor: p.vendor, lines: p.lines.map((l) => ({ no: l.no, option: l.option, qty: l.qty, code: l.code, extra: l.extra })), images: sent.map(({ data, mime }) => ({ data, mime })) });
      p.rows = mergeReply(p.lines, js).map((r) => ({ ...r, imgId: r.img !== null && sent[r.img] ? sent[r.img].id : null }));
      const most = sent.map((im) => [im.id, p.rows.filter((r) => r.imgId === im.id).length]).sort((a, b) => b[1] - a[1])[0];
      if (most && most[1]) p.cur = most[0];
      p.note = `${js.replyFound ? "" : "⚠ 회신 표시를 찾지 못했습니다 (모두 노랑) · "}${js.note || ""}`;
      say("");
    } catch (error) {
      p.wait = `읽지 못했습니다: ${error?.message || error}`;
      say(p.wait, "is-bad");
    } finally { p.busy = false; render(); }
  }

  async function open(v, slot) {
    close();
    const best = pickStockFile(st.files, v.lines || [], matchStockRows);
    const el = document.createElement("div");
    el.className = "vr-pop";
    el.innerHTML = `<div class="vr-card" role="dialog" aria-label="${esc(v.vendor)} 회신 읽기">
      <header><b>📥 ${esc(v.vendor)} 회신 읽기</b><span class="vr-file" data-vr-file></span><button type="button" class="vr-x" data-vr-close title="닫기">✕</button></header>
      <div class="vr-main"><div class="vr-imgs" data-vr-imgs></div><div class="vr-body" data-vr-body></div></div>
      <p class="vr-note" data-vr-note></p>
      <p class="vr-msg" data-vr-msg></p>
      <footer><span class="vr-hint">회신 사진은 Ctrl+V 로 더 붙여넣을 수 있습니다 (카톡에서 사진 열고 복사)</span><span class="cs-flex"></span>
        <button type="button" class="cs-btn" data-vr-reread>🔄 다시 읽기</button>
        <button type="button" class="cs-btn" data-vr-close>닫기</button>
        <button type="button" class="cs-btn cs-btn-primary" data-vr-save>저장</button></footer></div>`;
    document.body.appendChild(el);
    st.pop = { el, v, vendor: v.vendor, slot, lines: v.lines || [], rows: [], images: [], note: "", file: best?.file || null, matches: best?.matches || (v.lines || []).map((line) => ({ line, row: 0 })), busy: "ai", wait: "카톡 대화창 그림을 가져오는 중…", zoom: 100, cur: "" };
    document.addEventListener("paste", onPaste);
    el.addEventListener("click", onClick);
    el.addEventListener("input", onInput);
    el.addEventListener("mouseover", (e) => { const t = e.target.closest("[data-vr-row], [data-vr-pin]"); hot(t ? Number(t.dataset.vrRow ?? t.dataset.vrPin) : null); });
    el.addEventListener("focusin", (e) => { const t = e.target.closest("[data-vr-row], [data-vr-pin]"); if (t) hot(Number(t.dataset.vrRow ?? t.dataset.vrPin)); });
    window.addEventListener("resize", placePins);
    render();
    try {
      const img = slot >= 0 ? await panel.slotImage?.(slot) : null;
      if (img?.data) {
        const data = String(img.data).replace(/^data:[^,]*,/, "");
        st.pop.images.push({ id: "slot", slot: true, data, mime: img.mime || "image/png", url: `data:${img.mime || "image/png"};base64,${data}` });
      }
    } catch { /* 붙여넣기로 */ }
    st.pop.busy = false;
    if (st.pop.images.length) await runAi();
    else { st.pop.wait = "대화창 그림을 가져오지 못했습니다 — 카톡 대화창을 슬롯에 붙이거나(창 도우미), 회신 사진을 Ctrl+V 로 붙여넣은 뒤 [🔄 다시 읽기]."; render(); }
  }

  async function onPaste(e) {
    const p = st.pop;
    if (!p) return;
    const files = [...(e.clipboardData?.items || [])].filter((it) => it.kind === "file" && /^image\//.test(it.type)).map((it) => it.getAsFile()).filter(Boolean);
    if (!files.length) return;
    e.preventDefault();
    for (const f of files.slice(0, 2)) { if (p.images.length >= 3) p.images.splice(1, 1); const im = await imageData(document, f); p.images.push(im); p.cur = im.id; }
    render();
    say("사진을 넣었습니다 — [🔄 다시 읽기] 를 누르면 이 사진까지 같이 읽습니다.", "is-ok");
  }
  function onInput(e) {
    const i = e.target.dataset?.vrQty;
    if (i === undefined || !st.pop) return;
    const r = st.pop.rows[Number(i)];
    r.qty = Math.max(0, Math.round(Number(e.target.value) || 0));
    r.sure = true;                                   // 사람이 확인 = 노랑 풀기
    syncRow(Number(i));
  }
  async function onClick(e) {
    const p = st.pop;
    if (!p) return;
    if (e.target.closest("[data-vr-close]")) { if (p.busy !== "save") close(); return; }
    const step = e.target.closest("[data-vr-step]");
    if (step) {
      const r = p.rows[Number(step.dataset.i)];
      r.qty = Math.max(0, r.qty + Number(step.dataset.vrStep)); r.sure = true;
      syncRow(Number(step.dataset.i));
      return;
    }
    const dropImg = e.target.closest("[data-vr-drop-img]");
    if (dropImg) { p.images.splice(Number(dropImg.dataset.vrDropImg), 1); render(); return; }
    const tab = e.target.closest("[data-vr-tab]");
    if (tab) { p.cur = tab.dataset.vrTab; renderShot(); return; }
    const zoom = e.target.closest("[data-vr-zoom]");
    if (zoom) { p.zoom = Math.min(200, Math.max(50, p.zoom + 25 * Number(zoom.dataset.vrZoom))); renderShot(); return; }
    const row = e.target.closest("[data-vr-row]");
    if (row && !e.target.closest("input, button")) {          // 표 줄을 누르면 사진에서 그 줄로
      const r = p.rows[Number(row.dataset.vrRow)];
      if (r?.imgId && r.imgId !== p.cur) { p.cur = r.imgId; renderShot(); }
      const pin = p.el.querySelector(`[data-vr-pin="${row.dataset.vrRow}"]`);
      pin?.scrollIntoView({ block: "center", behavior: "smooth" }); hot(Number(row.dataset.vrRow));
      return;
    }
    if (e.target.closest("[data-vr-reread]")) { runAi(); return; }
    if (e.target.closest("[data-vr-save]")) save();
    if (e.target.closest("[data-vr-download]")) download(p.file, p.pending);
  }

  function download(file, bytes) {
    if (!file || !bytes) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.ms-excel.sheet.macroEnabled.12" }));
    a.download = file.name; a.hidden = true;
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }

  async function save() {
    const p = st.pop;
    if (!p || p.busy || !p.file) return;
    const updates = saveUpdates(p.rows, p.matches);
    if (!updates.length) { say("F 파일에서 짝이 맞는 줄이 없습니다.", "is-bad"); return; }
    p.busy = "save"; render();
    try {
      const { bytes, skipped } = await writeStockIn(p.file.bytes, updates);
      p.pending = bytes;
      if (p.file.handle) {
        if ((await p.file.handle.requestPermission?.({ mode: "readwrite" })) === "denied") throw new Error("파일에 쓸 권한을 받지 못했습니다");
        const w = await p.file.handle.createWritable();
        await w.write(bytes); await w.close();
      } else download(p.file, bytes);
      p.file.bytes = bytes;
      p.file.main = (await readStockMain(bytes)).rows;
      p.file.saved += 1;
      p.v.state = `📥 입고 ${updates.length - skipped.length}줄 저장`; p.v.tone = "is-ok";
      close();
      onChange(skipped.length ? `${p.vendor}: 수식이 든 입고 칸 ${skipped.length}줄은 건너뜀` : "");
    } catch (error) {
      const m = String(error?.message || error);
      say(/NoModification|InvalidState|locked|being used|사용 중|NotReadable/i.test(m) || error?.name === "NoModificationAllowedError"
        ? "F 파일에 쓰지 못했습니다 — 엑셀에서 그 파일이 열려 있으면 닫고 다시 [저장] 해 주세요."
        : `저장하지 못했습니다: ${m}`, "is-bad");
      const msg = st.pop?.el.querySelector("[data-vr-msg]");
      if (msg && p.pending) msg.insertAdjacentHTML("beforeend", ' <button type="button" class="cs-btn cs-btn-mini" data-vr-download>⬇ 파일로 받기</button>');
      if (st.pop) { st.pop.busy = false; render(); }
    }
  }

  // ↩ 처음 올린 그대로 되돌리기 (이 화면에서 저장한 것을 모두 취소)
  async function restore() {
    for (const f of st.files.filter((x) => x.saved && x.handle)) {
      const w = await f.handle.createWritable(); await w.write(f.original); await w.close();
      f.bytes = f.original; f.main = (await readStockMain(f.original)).rows; f.saved = 0;
    }
    onChange();
  }

  return { addStockFiles, statusText, open, close, restore, state: st };
}
