// 📥 거래처 탭 — 회신 읽기 (2026-11-17)
//  · 입고 리스트 F_1 PC_LIST · F_2 AC_LIST (.xlsm) 를 주문서와 같이 올림 → 이 화면이 파일 자리(핸들)를 기억해 저장 때 그 파일에 바로 씀
//  · 슬롯 업체명 옆 [읽기] → 붙은 카톡 대화창 그림(+ 붙여넣은 회신 사진) → CS 시트 v33 vendorRead (AI) → 팝업
//  · 팝업: 순번 · 옵션 · 발주량 · 지금 입고 · AI 판독 [− n +] (애매 = 노랑) → [저장] = F 메인 탭 S열 '입고' + 연한 분홍 → 팝업 닫힘
//  · 엑셀에서 F 파일이 열려 있으면 쓰기가 막힘 → 안내 + [⬇ 파일로 받기]
import { readStockMain, matchStockRows, writeStockIn } from "../domain/stockSheet.mjs?v=20261117-read1";
import { mergeReply, saveUpdates, pickStockFile } from "../domain/vendorReply.mjs?v=20261117-read1";

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
  return { data: url.replace(/^data:[^,]*,/, ""), mime: "image/jpeg", url };
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
  function close() { st.pop?.el.remove(); st.pop = null; document.removeEventListener("paste", onPaste); }
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
    p.el.querySelector("[data-vr-imgs]").innerHTML = p.images.map((im, k) => `<figure><img src="${im.url}" alt="회신 그림 ${k + 1}"><figcaption>${k ? "붙여넣은 사진" : "카톡 대화창"}${p.images.length > 1 ? ` <button type="button" data-vr-drop-img="${k}">빼기</button>` : ""}</figcaption></figure>`).join("") || `<p class="vr-wait">대화창 그림이 없습니다 — 회신 사진을 Ctrl+V 로 붙여넣어 주세요.</p>`;
    p.el.querySelector("[data-vr-note]").textContent = [p.note, p.rows.length ? `노랑 ${unsure}줄 = 애매해서 가장 비슷한 값을 넣었습니다 — 확인해 주세요.` : ""].filter(Boolean).join("  ·  ");
    p.el.querySelector("[data-vr-file]").textContent = p.file ? `→ ${p.file.name} 메인 탭 S열 '입고' (${p.matches.filter((m) => m.row).length}/${p.rows.length || p.lines.length}줄 짝)` : "입고 리스트(F 파일)가 없습니다 — 거래처 칸 위에 F_1·F_2 를 같이 올려 주세요";
    p.el.querySelector("[data-vr-save]").disabled = p.busy || !p.rows.length || !p.file;
    p.el.querySelector("[data-vr-reread]").disabled = p.busy;
    p.el.querySelector("[data-vr-save]").textContent = p.busy === "save" ? "저장하는 중…" : "저장";
  }
  function say(t, tone = "") { const el = st.pop?.el.querySelector("[data-vr-msg]"); if (el) { el.textContent = t; el.className = `vr-msg ${tone}`; } }

  async function runAi() {
    const p = st.pop;
    if (!p) return;
    if (!p.images.length) { say("읽을 그림이 없습니다 — 회신 사진을 Ctrl+V 로 붙여넣은 뒤 [🔄 다시 읽기].", "is-bad"); return; }
    p.busy = "ai"; p.wait = "AI 가 회신 사진·메시지를 읽는 중… (10~30초)"; p.rows = p.rows.length ? p.rows : []; render(); say("");
    try {
      const js = await sheetPost({ action: "vendorRead", vendor: p.vendor, lines: p.lines.map((l) => ({ no: l.no, option: l.option, qty: l.qty, code: l.code, extra: l.extra })), images: p.images.map(({ data, mime }) => ({ data, mime })) });
      p.rows = mergeReply(p.lines, js);
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
    st.pop = { el, v, vendor: v.vendor, slot, lines: v.lines || [], rows: [], images: [], note: "", file: best?.file || null, matches: best?.matches || (v.lines || []).map((line) => ({ line, row: 0 })), busy: "ai", wait: "카톡 대화창 그림을 가져오는 중…" };
    document.addEventListener("paste", onPaste);
    el.addEventListener("click", onClick);
    el.addEventListener("input", onInput);
    render();
    try {
      const img = slot >= 0 ? await panel.slotImage?.(slot) : null;
      if (img?.data) {
        const data = String(img.data).replace(/^data:[^,]*,/, "");
        st.pop.images.push({ data, mime: img.mime || "image/png", url: `data:${img.mime || "image/png"};base64,${data}` });
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
    for (const f of files.slice(0, 2)) { if (p.images.length >= 3) p.images.splice(1, 1); p.images.push(await imageData(document, f)); }
    render();
    say("사진을 넣었습니다 — [🔄 다시 읽기] 를 누르면 이 사진까지 같이 읽습니다.", "is-ok");
  }
  function onInput(e) {
    const i = e.target.dataset?.vrQty;
    if (i === undefined || !st.pop) return;
    const r = st.pop.rows[Number(i)];
    r.qty = Math.max(0, Math.round(Number(e.target.value) || 0));
    r.sure = true;                                   // 사람이 확인 = 노랑 풀기
    e.target.closest("tr")?.classList.remove("is-unsure");
  }
  async function onClick(e) {
    const p = st.pop;
    if (!p) return;
    if (e.target.closest("[data-vr-close]")) { if (p.busy !== "save") close(); return; }
    const step = e.target.closest("[data-vr-step]");
    if (step) {
      const r = p.rows[Number(step.dataset.i)];
      r.qty = Math.max(0, r.qty + Number(step.dataset.vrStep)); r.sure = true;
      const tr = step.closest("tr"); tr.classList.remove("is-unsure"); tr.querySelector("input").value = r.qty;
      return;
    }
    const dropImg = e.target.closest("[data-vr-drop-img]");
    if (dropImg) { p.images.splice(Number(dropImg.dataset.vrDropImg), 1); render(); return; }
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
