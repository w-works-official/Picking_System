// 📷 상품 현황 › 상품 사진 관리 (2026-11-10) — 피킹 대시보드 「상품 사진 관리」와 같은 규칙으로 사진 올리기 + 사진요청보기
//  · 사진: 파일명 = 셀피아 코드 규칙(8601.jpg · 8601-2.jpg · 8601-[1][3].jpg · 8601-[1-10].jpg · {…}=최우선) → 허브 sellpia/ 에 JPG 로 저장
//    같은 이름 사진이 있으면 새 사진으로 바뀝니다 (대시보드와 같음)
//  · 사진요청보기: 구글 시트 "System V3 사진요청" — 목록 · 요청 취소 · [새로고침]=사진이 올라온 요청은 완료로 빼기
import { HUB_URL, HUB_KEY, BUCKET, FOLDER, masterCandidates, publicUrl } from "../domain/subPhotos.mjs?v=20261107-finder1";
import { PHOTO_MAX_BYTES, PHOTO_MAX_DIMENSION, uploadPlan } from "../domain/photoUpload.mjs?v=20261110-pbox1";
import { PHOTO_REQUEST_ENDPOINT, normalizePhotoRequestCode, parsePhotoRequestResponse, photoRequestClosePayload, sortPhotoRequests } from "../domain/photoRequests.mjs?v=20261109-photoreq1";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const auth = { apikey: HUB_KEY, Authorization: `Bearer ${HUB_KEY}` };
const isChange = (r) => /^변경/.test(String(r?.source || ""));

export function mountProductPhotoBox({ document, window, root, fetchImpl = (...a) => window.fetch(...a), onUploaded = () => {} } = {}) {
  if (!root) return null;
  const st = { busy: false, req: { records: [], loaded: false, open: false, loading: false, names: new Map(), error: "" } };
  root.innerHTML = `
    <div class="pp-head"><b>상품 사진 관리</b><button type="button" class="pp-req-btn" data-pp-req>사진요청보기 <span class="pp-badge" data-pp-count hidden>0</span></button></div>
    <p class="pp-help">파일명은 셀피아 SKU입니다. 공용은 <code>8601.jpg</code>, 지정 옵션은 <code>8601-[1][3].jpg</code>, 연속 옵션은 <code>8601-[1-10].jpg</code>입니다. 전체를 <code>{ }</code>로 감싼 <code>{8601}.jpg</code> 또는 <code>{8601-[1-10]}.jpg</code>는 일반 사진보다 먼저 적용됩니다.</p>
    <div class="pp-row">
      <div class="pp-drop" data-pp-drop tabindex="0" role="button" aria-label="상품 사진 드래그 또는 선택"><b>여기에 상품 사진 여러 장을 드래그</b><small>JPG · PNG · WEBP / 정확 SKU · 공용 prefix · 옵션 범위 지원</small></div>
      <div class="pp-pick"><button type="button" class="pp-pick-btn" data-pp-pick>사진 여러 장 선택</button><small>개별 옵션 사진이 공용 prefix 사진보다 우선합니다.</small></div>
    </div>
    <input type="file" multiple accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" data-pp-file hidden>
    <div class="pp-status" data-pp-status></div>
    <div class="pp-req" data-pp-reqbox hidden></div>`;
  const $ = (s) => root.querySelector(s);
  const status = (msg, tone = "", details = []) => {
    const el = $("[data-pp-status]");
    el.className = `pp-status ${tone}`;
    el.innerHTML = msg ? `<strong>${esc(msg)}</strong>${details.length ? `<ul>${details.slice(0, 30).map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}` : "";
  };

  // ---------- 사진 올리기 ----------
  async function toJpeg(file) {
    const bmp = await window.createImageBitmap(file);
    try {
      const k = Math.min(1, PHOTO_MAX_DIMENSION / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
      const g = c.getContext("2d", { alpha: false });
      g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(bmp, 0, 0, c.width, c.height);
      for (const q of [0.9, 0.82, 0.72]) {
        const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", q));
        if (blob && blob.size <= PHOTO_MAX_BYTES) return blob;
      }
      throw new Error("변환 후에도 사진이 5MB를 넘습니다.");
    } finally { bmp.close?.(); }
  }
  async function upload(list) {
    const files = [...(list || [])];
    if (!files.length || st.busy) return;
    st.busy = true; paintBusy();
    const ok = [], bad = [];
    try {
      for (let i = 0; i < files.length; i += 1) {
        const f = files[i];
        const plan = uploadPlan(f);
        status(`사진 저장 중 ${i + 1}/${files.length}: ${plan.skus.join(", ") || f.name}`);
        if (!plan.ok) { bad.push(plan.error); continue; }
        try {
          const jpg = await toJpeg(f);
          for (let k = 0; k < plan.names.length; k += 1) {
            const res = await fetchImpl(`${HUB_URL}/storage/v1/object/${BUCKET}/${FOLDER}/${encodeURIComponent(plan.names[k])}`, {
              method: "POST", headers: { ...auth, "Content-Type": "image/jpeg", "x-upsert": "true", "cache-control": "0" }, body: jpg,
            });
            if (res.ok) ok.push(plan.skus[k]); else bad.push(`${f.name} → ${plan.skus[k]}: 저장 실패 (${res.status})`);
          }
        } catch (error) { bad.push(`${f.name}: ${error?.message || error}`); }
      }
    } finally {
      st.busy = false; paintBusy();
      $("[data-pp-file]").value = "";
    }
    const msg = bad.length ? `사진 저장 완료 ${ok.length}개 · 실패 ${bad.length}개` : `사진 ${ok.length}개 저장 완료`;
    status(msg, bad.length ? "is-warn" : "is-ok", [...(ok.length ? [`저장 SKU: ${ok.join(", ")}`] : []), ...bad]);
    if (ok.length) { onUploaded(ok); if (st.req.loaded) refreshRequests(true, true).catch(() => {}); }
  }
  function paintBusy() {
    $("[data-pp-pick]").disabled = st.busy;
    $("[data-pp-pick]").textContent = st.busy ? "사진 저장 중..." : "사진 여러 장 선택";
    $("[data-pp-drop]").classList.toggle("is-busy", st.busy);
  }

  // ---------- 사진요청보기 ----------
  async function sheet(payload) {
    const res = payload
      ? await fetchImpl(PHOTO_REQUEST_ENDPOINT, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload), cache: "no-store" })
      : await fetchImpl(`${PHOTO_REQUEST_ENDPOINT}?action=list&t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`사진 요청 시트 응답 오류 (${res.status})`);
    return parsePhotoRequestResponse(await res.json());
  }
  async function names(records) {
    const want = new Set();
    for (const r of records) for (const c of r.candidates?.length ? r.candidates : [r.code]) if (!st.req.names.has(c)) want.add(c);
    const list = [...want];
    for (let i = 0; i < list.length; i += 100) {
      const q = list.slice(i, i + 100).map((c) => `"${c.replace(/"/g, "")}"`).join(",");
      const res = await fetchImpl(`${HUB_URL}/rest/v1/sellpia_stock_latest?select=sellpia_sku_code,sellpia_product_name,sellpia_option_name&sellpia_sku_code=in.(${encodeURIComponent(q)})`, { headers: auth });
      if (!res.ok) continue;
      for (const row of await res.json()) st.req.names.set(String(row.sellpia_sku_code), { name: row.sellpia_product_name || "", option: row.sellpia_option_name || "" });
    }
    for (const r of records) if (r.candidates?.length) r.code = r.candidates.find((c) => st.req.names.has(c)) || r.candidates[0];
  }
  // 사진이 있으면 true (변경 요청은 요청 시각 뒤에 올라온 사진만)
  async function photoReady(r) {
    const since = isChange(r) ? Date.parse(r.requestedAt) || Date.now() : 0;
    for (const n of masterCandidates(r.code)) {
      try {
        const res = await fetchImpl(publicUrl(n, String(Date.now())), { method: "HEAD", cache: "no-store" });
        if (!res.ok) continue;
        return since ? Date.parse(res.headers.get("last-modified") || "") > since : true;
      } catch { /* 다음 후보 */ }
    }
    return false;
  }
  async function refreshRequests(settle = false, quiet = false) {
    if (st.req.loading) return;
    st.req.loading = true; st.req.error = ""; renderReq();
    try {
      let { records } = await sheet();
      await names(records);
      if (settle && records.length) {
        const done = [];
        for (let i = 0; i < records.length; i += 8) {
          const chunk = records.slice(i, i + 8);
          const got = await Promise.all(chunk.map(photoReady));
          chunk.forEach((r, k) => { if (got[k]) done.push(r); });
        }
        if (done.length) {
          ({ records } = await sheet(photoRequestClosePayload(done.map((r) => r.sheetCode || r.code), "완료")));
          await names(records);
          if (!quiet) status(`사진이 올라온 요청 ${done.length}건을 완료로 뺐습니다.`, "is-ok");
        } else if (!quiet) status("사진이 새로 올라온 요청은 없습니다.");
      }
      st.req.records = sortPhotoRequests(records);
      st.req.loaded = true;
    } catch (error) { st.req.error = error?.message || String(error); }
    st.req.loading = false; renderReq();
  }
  function renderReq() {
    const n = st.req.records.length;
    const badge = $("[data-pp-count]");
    badge.hidden = !st.req.loaded || !n; badge.textContent = String(n);
    const box = $("[data-pp-reqbox]");
    box.hidden = !st.req.open;
    if (!st.req.open) return;
    const rows = st.req.records.map((r) => {
      const info = st.req.names.get(r.code);
      const name = info?.name || r.productName || "", sub = info ? info.option : r.title;
      return `<tr><td class="pp-code">${esc(r.code)}${isChange(r) ? '<br><span class="pp-change">변경 요청</span>' : ""}</td><td>${name ? `<b>${esc(name)}</b>` : ""}${name && sub ? "<br>" : ""}${sub ? `<small>${esc(sub)}</small>` : ""}</td><td><button type="button" class="pb-btn pb-btn-mini" data-pp-cancel="${esc(r.sheetCode || r.code)}">요청 취소</button></td></tr>`;
    }).join("");
    box.innerHTML = `<div class="pp-req-head"><b>사진 요청</b><span>${st.req.loading ? "불러오는 중…" : st.req.error ? `불러오지 못했습니다: ${esc(st.req.error)}` : `${n}건 · 사진이 올라오면(변경 요청은 새 사진이 올라오면) [새로고침]으로 한꺼번에 빠집니다.`}</span><button type="button" class="pb-btn pb-btn-mini" data-pp-settle${st.req.loading ? " disabled" : ""}>⟳ 새로고침</button></div>
      ${n ? `<div class="pp-req-scroll"><table><thead><tr><th>셀피아코드</th><th>상품</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : st.req.loading ? "" : '<p class="pp-empty">열린 사진 요청이 없습니다.</p>'}`;
  }

  // ---------- 이벤트 ----------
  $("[data-pp-pick]").addEventListener("click", () => $("[data-pp-file]").click());
  $("[data-pp-file]").addEventListener("change", (e) => upload(e.target.files));
  const drop = $("[data-pp-drop]");
  drop.addEventListener("click", () => { if (!st.busy) $("[data-pp-file]").click(); });
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!st.busy) $("[data-pp-file]").click(); } });
  for (const ev of ["dragenter", "dragover"]) drop.addEventListener(ev, (e) => { e.preventDefault(); if (!st.busy) drop.classList.add("is-drag"); });
  for (const ev of ["dragleave", "dragend", "drop"]) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("is-drag"); });
  drop.addEventListener("drop", (e) => upload(e.dataTransfer?.files));
  root.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    if (b.matches("[data-pp-req]")) { st.req.open = !st.req.open; renderReq(); if (st.req.open && !st.req.loaded) refreshRequests(false); }
    else if (b.matches("[data-pp-settle]")) refreshRequests(true);
    else if (b.dataset.ppCancel) {
      b.disabled = true;
      sheet(photoRequestClosePayload([normalizePhotoRequestCode(b.dataset.ppCancel)], "취소"))
        .then(async ({ records }) => { await names(records); st.req.records = sortPhotoRequests(records); renderReq(); status("사진 요청을 취소했습니다.", "is-ok"); })
        .catch((error) => { b.disabled = false; status(`요청 취소 실패: ${error?.message || error}`, "is-bad"); });
    }
  });
  refreshRequests(false).catch(() => {});   // 숫자(배지)만 먼저
  return { upload, refreshRequests };
}
