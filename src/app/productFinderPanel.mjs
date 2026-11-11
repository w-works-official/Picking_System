// 🔎 상품찾기 (2026-11-07) — 상품 관리 사이드 메뉴 [상품명 요청] 밑
//  ① 사진으로 찾기: 사진 선택 · 끌어다 놓기 · 붙여넣기 · 📷 카메라 → 기기 안에서 닮은 사진 찾기(AI 없음) → 🤖 AI 추천(CS 시트 Claude)
//     · 색인(사진 2만여 장의 특징값)은 PC 에서 [🔄 색인 갱신]으로 만들어 CS 시트 '사진색인' 탭에 저장 → 각 기기는 받아서 기기에 보관
//  ② 사진 등록: 셀피아 코드 · 자사코드 · 상품명으로 검색 → 선택 → 사진 선택 · 끌어다 놓기 · 📷 카메라 → 칸 3개 → [등록]
//     · 저장 = 허브 product-images/sellpia/코드.__sub1~3.jpg (보조사진) — 마스터 사진은 그대로, ☆ 로 맞바꾸기
import { CS_BOARD_ENDPOINT, CS_BOARD_STORAGE_KEY, isCsBoardTokenValid } from "../domain/csBoard.mjs?v=20261111-msqa1";
import { buildCatalog, initialSlots, searchCatalog } from "../domain/productFinder.mjs?v=20261107-finder1";
import { DIM, FINDER_TOPS, MODEL_ID, chunkText, decodeIndex, encodeIndex, keywordSearch, percentOf, refreshPlan, searchIndex, searchProducts } from "../domain/photoSearch.mjs?v=20261110-finder3";
import { BUCKET, FOLDER, HUB_KEY, HUB_URL, SUB_SLOTS, listSubs, masterCandidates, nextEmpty, publicUrl, putPhoto, registerPlan, removePhoto, subName, swapMaster, toJpeg } from "../domain/subPhotos.mjs?v=20261107-finder1";
import { embed, encodeVec, loadEmbedder, toTensorData } from "./photoEmbedder.mjs?v=20261110-finder3";

const PAGE = 1000;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => Number(n || 0).toLocaleString("ko-KR");

// 마스터 사진 <img> — 시스템과 같은 순서로 다음 후보를 엶 (마지막까지 없으면 "사진 없음")
export function masterImg(sku, cls = "pf-master-img") {
  const urls = masterCandidates(sku).map((n) => publicUrl(n));
  if (!urls.length) return `<span class="${cls} is-none">사진 없음</span>`;
  const [first, ...rest] = urls;
  return `<img class="${cls}" src="${esc(first)}" alt="" data-pf-fallbacks="${esc(JSON.stringify(rest))}" onerror="var f=JSON.parse(this.dataset.pfFallbacks||'[]');if(f.length){this.src=f.shift();this.dataset.pfFallbacks=JSON.stringify(f);}else{this.replaceWith(Object.assign(document.createElement('span'),{className:this.className+' is-none',textContent:'사진 없음'}));}">`;
}

// ---------- 기기 보관 (IndexedDB) — 색인 · 만들다 만 색인 ----------
function idb(window) {
  return new Promise((ok, bad) => {
    try {
      const req = window.indexedDB.open("system-v3-photo-search", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("kv");
      req.onsuccess = () => ok(req.result);
      req.onerror = () => bad(req.error);
    } catch (error) { bad(error); }
  });
}
async function idbGet(window, key) {
  try { const db = await idb(window); return await new Promise((ok) => { const r = db.transaction("kv").objectStore("kv").get(key); r.onsuccess = () => ok(r.result ?? null); r.onerror = () => ok(null); }); }
  catch { return null; }
}
async function idbSet(window, key, value) {
  try { const db = await idb(window); await new Promise((ok) => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(value, key); t.oncomplete = ok; t.onerror = ok; }); }
  catch { /* 보관 못 해도 이번 화면에서는 씀 */ }
}

export function mountProductFinder({ document, window, fetchImpl = (...a) => window.fetch(...a), navigator = window.navigator, storages = [], modelUrl } = {}) {
  const root = document.querySelector("[data-product-finder]");
  if (!root) return null;
  const st = {
    mode: "search", catalog: [],
    idx: null, idxMeta: null, idxNote: "", idxLoading: null, query: null, hits: [], products: [], lastQs: null, topN: 5, searching: false, searchNote: "",
    ai: null, build: null, loading: false, loaded: false, q: "", results: [],
    item: null, saved: [], slots: initialSlots([], SUB_SLOTS), busy: false, cam: null, facing: "environment",
  };
  const TOP_KEY = "system_v3_finder_top";
  for (const store of [...storages].reverse()) { try { const v = Number(store?.getItem?.(TOP_KEY)); if (FINDER_TOPS.includes(v)) { st.topN = v; break; } } catch { /* 저장소 없음 */ } }
  const saveTop = () => { for (const store of storages) { try { store?.setItem?.(TOP_KEY, String(st.topN)); } catch { /* 저장 안 됨 */ } } };
  root.innerHTML = `
    <div class="pf-modes" role="tablist">
      <button type="button" data-pf-mode="search" class="is-on">🔍 사진으로 찾기</button>
      <button type="button" data-pf-mode="register">📷 사진 등록</button>
    </div>
    <section class="pf-sec" data-pf-sec="search">
      <div class="pf-swork" data-pf-swork>
        <div class="pf-inputs">
          <label class="pf-btn"><input type="file" accept="image/*" data-pf-sfile hidden>🖼 사진 선택</label>
          <button type="button" class="pf-btn" data-pf-scam>📷 카메라로 찾기</button>
          <span class="pf-drop-hint">PC: 사진을 끌어다 놓거나 Ctrl+V 로 붙여넣기</span>
        </div>
        <div class="pf-cam" data-pf-scambox hidden>
          <video playsinline muted autoplay data-pf-svideo></video>
          <div class="pf-cam-bar">
            <button type="button" class="pf-shot" data-pf-sshot aria-label="찍어서 찾기">● 찾기</button>
            <button type="button" class="pf-btn" data-pf-sflip>⟲ 앞/뒤</button>
            <button type="button" class="pf-btn" data-pf-scamoff>카메라 끄기</button>
          </div>
        </div>
      </div>
      <div class="pf-query" data-pf-query hidden></div>
      <div class="pf-ai" data-pf-ai hidden></div>
      <div class="pf-shits" data-pf-shits></div>
      <div class="pf-index" data-pf-index></div>
    </section>
    <section class="pf-sec" data-pf-sec="register" hidden>
      <div class="pf-find">
        <input type="search" class="pf-q" data-pf-q placeholder="셀피아 코드 · 자사코드 · 상품명 · 옵션명 (띄어쓰기로 여러 낱말)" aria-label="상품 검색" autocomplete="off">
        <div class="pf-results" data-pf-results></div>
      </div>
      <div class="pf-picked" data-pf-picked hidden></div>
      <div class="pf-work" data-pf-work hidden>
        <div class="pf-inputs">
          <label class="pf-btn"><input type="file" accept="image/*" multiple data-pf-file hidden>🖼 사진 선택</label>
          <button type="button" class="pf-btn" data-pf-cam>📷 카메라 연결</button>
          <span class="pf-drop-hint">PC: 사진 파일을 이 칸에 끌어다 놓아도 됩니다</span>
        </div>
        <div class="pf-cam" data-pf-cambox hidden>
          <video playsinline muted autoplay data-pf-video></video>
          <div class="pf-cam-bar">
            <button type="button" class="pf-shot" data-pf-shot aria-label="촬영">● 촬영</button>
            <button type="button" class="pf-btn" data-pf-flip>⟲ 앞/뒤</button>
            <button type="button" class="pf-btn" data-pf-camoff>카메라 끄기</button>
          </div>
        </div>
        <div class="pf-slots" data-pf-slots></div>
        <div class="pf-actions">
          <button type="button" class="pf-btn pf-btn-main" data-pf-save>등록</button>
          <span class="pf-msg" data-pf-msg></span>
        </div>
      </div>
    </section>`;
  const $ = (s) => root.querySelector(s);

  const msg = (text, tone = "") => { const el = $("[data-pf-msg]"); el.textContent = text || ""; el.className = `pf-msg ${tone}`; };
  const newCount = () => st.slots.filter((s) => s.kind === "new").length;
  const changed = () => registerPlan(st.slots, st.saved).length;

  function renderResults() {
    const box = $("[data-pf-results]");
    if (st.item) { box.innerHTML = ""; return; }
    if (!st.q) { box.innerHTML = st.loading ? `<p class="pf-note">상품 목록 불러오는 중…</p>` : ""; return; }
    if (!st.results.length) { box.innerHTML = `<p class="pf-note">${st.loading ? "상품 목록 불러오는 중…" : "찾는 상품이 없습니다"}</p>`; return; }
    box.innerHTML = st.results.map((it) => `
      <button type="button" class="pf-hit" data-pf-pick="${esc(it.sku)}">
        ${masterImg(it.sku, "pf-hit-img")}
        <span class="pf-hit-txt"><b>${esc(it.sku)}</b>${it.own ? ` <small>${esc(it.own)}</small>` : ""}<em>${esc(it.name)}${it.option ? ` · ${esc(it.option)}` : ""}</em></span>
        <span class="pf-hit-stock">재고 ${fmt(it.stock)}</span>
      </button>`).join("");
  }

  function renderPicked() {
    const box = $("[data-pf-picked]"), work = $("[data-pf-work]");
    box.hidden = work.hidden = !st.item;
    if (!st.item) { box.innerHTML = ""; return; }
    const it = st.item;
    box.innerHTML = `
      <div class="pf-card">
        <div class="pf-master">${masterImg(it.sku)}<span class="pf-star is-on" title="마스터 사진">★</span></div>
        <div class="pf-card-txt">
          <b>${esc(it.sku)}${it.own ? ` · ${esc(it.own)}` : ""}</b>
          <span>${esc(it.name)}</span>
          <span>${esc(it.option || "(옵션 없음)")} · 재고 ${fmt(it.stock)}</span>
          <small>★ 마스터 사진 = 시스템 전체 대표 사진 · 아래 칸 = 보조사진(최대 ${SUB_SLOTS}장)</small>
        </div>
        <button type="button" class="pf-btn" data-pf-unpick>다른 상품</button>
      </div>`;
  }

  function renderSlots() {
    const box = $("[data-pf-slots]");
    if (!box) return;
    box.innerHTML = st.slots.map((s) => {
      if (s.kind === "empty") return `<div class="pf-slot is-empty" data-slot="${s.slot}"><span>${s.slot}</span><small>빈 칸</small></div>`;
      const tag = s.kind === "new" ? `<em class="pf-tag is-new">새 사진</em>` : `<em class="pf-tag">등록됨</em>`;
      const star = s.kind === "saved" ? `<button type="button" class="pf-star" data-pf-star="${s.slot}" title="이 사진을 마스터로 (맞바꾸기)">☆</button>` : "";
      return `<div class="pf-slot is-${s.kind}" data-slot="${s.slot}"><img src="${esc(s.url)}" alt="">${tag}${star}<button type="button" class="pf-x" data-pf-x="${s.slot}" aria-label="${s.slot}번 칸 비우기">✕</button></div>`;
    }).join("");
    const n = changed();
    const save = $("[data-pf-save]");
    save.disabled = !n || st.busy;
    save.textContent = st.busy ? "등록 중…" : n ? `등록 (${newCount() ? `새 사진 ${newCount()}장` : ""}${newCount() && n > newCount() ? " · " : ""}${n > newCount() ? `지우기 ${n - newCount()}장` : ""})` : "등록";
    const shot = $("[data-pf-shot]");
    if (shot) shot.disabled = !nextEmpty(st.slots) || st.busy;
  }

  function render() {
    root.querySelectorAll("[data-pf-mode]").forEach((b) => b.classList.toggle("is-on", b.dataset.pfMode === st.mode));
    root.querySelectorAll("[data-pf-sec]").forEach((s) => { s.hidden = s.dataset.pfSec !== st.mode; });
    renderResults(); renderPicked(); renderSlots(); renderSearch(); renderIndex();
  }

  // ================= 🔍 사진으로 찾기 =================
  const csToken = () => {
    for (const store of storages) {
      try { const raw = JSON.parse(store?.getItem(CS_BOARD_STORAGE_KEY) || "null"); if (raw && isCsBoardTokenValid(raw.token)) return { token: String(raw.token).trim(), editor: String(raw.editor || "").slice(0, 20) }; } catch { /* 다음 */ }
    }
    return null;
  };
  async function csPost(body) {
    const t = csToken();
    if (!t) throw new Error("CS 관리에서 시트에 연결한 브라우저에서 됩니다");
    const res = await fetchImpl(CS_BOARD_ENDPOINT, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ ...body, token: t.token, editor: t.editor }) });
    if (!res.ok) throw new Error(`시트 응답 오류 (${res.status})`);
    const js = await res.json();
    if (!js.ok) throw new Error(js.error || "시트 오류");
    return js;
  }
  async function csGet(params) {
    const res = await fetchImpl(`${CS_BOARD_ENDPOINT}?${new URLSearchParams(params)}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`시트 응답 오류 (${res.status})`);
    return await res.json();
  }
  const itemOf = (code) => st.catalog.find((x) => x.sku === code) || st.catalog.find((x) => x.product === code) || null;

  function renderIndex() {
    const box = $("[data-pf-index]");
    if (!box) return;
    const m = st.idxMeta;
    const b = st.build;
    const when = m?.updatedAt ? new Date(new Date(m.updatedAt).getTime() + 9 * 3600000).toISOString().slice(0, 16).replace("T", " ") : "";
    const head = m ? `색인 ${fmt(m.count)}장 · ${when} 갱신${m.editor ? ` · ${esc(m.editor)}` : ""}` : (st.idxNote || "색인 확인 중…");
    const canBuild = !!csToken();
    box.innerHTML = `
      <div class="pf-index-row">
        <span>🗂 ${head}${st.idxNote && m ? ` · ${esc(st.idxNote)}` : ""}</span>
        ${b?.running
          ? `<button type="button" class="pf-btn" data-pf-bstop>멈춤</button>`
          : `<button type="button" class="pf-btn" data-pf-build ${canBuild ? "" : "disabled"} title="${canBuild ? "바뀐 사진만 다시 계산해 색인을 올립니다 (PC 권장)" : "CS 관리에서 시트에 연결한 브라우저에서 됩니다"}">🔄 색인 갱신</button>`}
      </div>
      ${b ? `<div class="pf-index-prog"><div style="width:${b.total ? Math.round((b.done / b.total) * 100) : 0}%"></div></div><small class="pf-index-note">${esc(b.note || "")}</small>` : ""}
      <small class="pf-index-note">자체 찾기는 등록된 사진(마스터 · 보조)과 비교합니다 — 새로 등록한 사진은 [🔄 색인 갱신] 뒤에 반영됩니다.</small>`;
  }

  function renderSearch() {
    const q = $("[data-pf-query]"), aiBox = $("[data-pf-ai]"), list = $("[data-pf-shits]");
    if (!q) return;
    q.hidden = !st.query;
    if (st.query) {
      const canAi = !!csToken() && st.hits.length && !st.searching && !st.ai?.busy;
      q.innerHTML = `
        <img src="${esc(st.query.url)}" alt="찾는 사진">
        <div class="pf-query-txt">
          <b>찾는 사진</b>
          <span class="pf-msg ${st.searchNote.startsWith("⚠") ? "is-bad" : ""}">${esc(st.searchNote)}</span>
          <span class="pf-tops" role="group" aria-label="보여줄 상품 수">비슷한 상품 ${FINDER_TOPS.map((n) => `<button type="button" data-pf-top="${n}" class="${n === st.topN ? "is-on" : ""}">${n}개</button>`).join("")}</span>
          <button type="button" class="pf-btn pf-btn-ai" data-pf-ai-go ${canAi ? "" : "disabled"} title="${csToken() ? "자체 찾기 상위 후보를 AI 가 다시 골라 줍니다" : "CS 관리에서 시트에 연결한 브라우저에서 됩니다"}">${st.ai?.busy ? "🤖 AI 보는 중…" : "🤖 AI 추천"}</button>
        </div>`;
    }
    const ai = st.ai;
    aiBox.hidden = !ai || ai.busy;
    if (ai && !ai.busy) {
      if (ai.error) aiBox.innerHTML = `<p class="pf-msg is-bad">🤖 ${esc(ai.error)}</p>`;
      else {
        const picks = ai.picks.map((p, i) => `<li><b>${i + 1}순위 ${esc(p.code)}</b> · ${p.score}점${p.why ? ` — ${esc(p.why)}` : ""}</li>`).join("");
        const kw = ai.kwHits?.length ? `<p class="pf-note">🤖 AI 가 본 특징 “${esc(ai.keywords)}” — 상품명으로 찾은 결과 ${ai.kwHits.length}개 (아래 목록 뒤쪽)</p>` : ai.keywords ? `<p class="pf-note">🤖 AI 가 본 특징 “${esc(ai.keywords)}”</p>` : "";
        aiBox.innerHTML = `<div class="pf-ai-box"><b>🤖 AI 추천</b>${picks ? `<ul>${picks}</ul>` : `<p class="pf-note">후보 ${ai.compared}개 중 같은 상품이 없다고 봤습니다</p>`}${kw}</div>`;
      }
    }
    const aiCodes = new Map((ai?.picks || []).map((p, i) => [p.code, i + 1]));
    const rankOf = (p) => Math.min(99, ...p.codes.map((c) => aiCodes.get(c) || 99));
    const rows = [...st.products].sort((a, b) => rankOf(a) - rankOf(b));
    const productCard = (p, i) => {
      const code = p.best.code;
      const it = itemOf(code);
      const rank = rankOf(p) < 99 ? rankOf(p) : 0;
      const thumbs = p.photos.slice(1).map((x) => `<a href="${esc(publicUrl(x.name))}" target="_blank" rel="noopener" title="${esc(x.code)} · ${percentOf(x.score)}%"><img src="${esc(publicUrl(x.name))}" alt="" loading="lazy" onerror="this.parentNode.remove()"></a>`).join("");
      return `<div class="pf-shit pf-prod${rank ? " is-ai" : ""}">
        <span class="pf-prod-no">${i + 1}</span>
        <img src="${esc(publicUrl(p.best.name))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
        <span class="pf-hit-txt"><b>${esc(p.product)}${it?.own ? ` <small>${esc(it.own)}</small>` : ""}</b><em>${esc(it ? it.name : "(상품 목록에 없음)")}</em>
          <em class="pf-prod-sub">가장 닮은 사진 ${esc(code)}${it && it.sku === code && it.option ? ` · ${esc(it.option)}` : ""} · 이 상품 사진 ${p.count}장 비교</em>
          ${thumbs ? `<span class="pf-prod-thumbs">${thumbs}</span>` : ""}</span>
        <span class="pf-shit-side">${rank ? `<em class="pf-ai-tag">🤖 ${rank}순위</em>` : ""}<b class="pf-pct">${percentOf(p.score)}%</b>${it && it.sku === code ? `<button type="button" class="pf-btn pf-btn-mini" data-pf-toreg="${esc(code)}">사진 등록</button>` : ""}</span>
      </div>`;
    };
    const card = (code, photoUrl, extra = "") => {
      const it = itemOf(code);
      return `<div class="pf-shit">
        <img src="${esc(photoUrl)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
        <span class="pf-hit-txt"><b>${esc(code)}${it?.own && it.sku === code ? ` <small>${esc(it.own)}</small>` : ""}</b><em>${esc(it ? `${it.name}${it.sku === code && it.option ? ` · ${it.option}` : ""}` : "(상품 목록에 없음)")}</em>${it && it.sku === code ? `<em>재고 ${fmt(it.stock)}</em>` : ""}</span>
        <span class="pf-shit-side">${extra}${it && it.sku === code ? `<button type="button" class="pf-btn pf-btn-mini" data-pf-toreg="${esc(code)}">사진 등록</button>` : ""}</span>
      </div>`;
    };
    const shownCodes = new Set(st.products.flatMap((p) => p.codes));
    const kwRows = (ai?.kwHits || []).filter((it) => !shownCodes.has(it.sku)).map((it) => card(it.sku, publicUrl(masterCandidates(it.sku)[4] || ""), `<em class="pf-ai-tag is-kw">AI 낱말</em>`));
    list.innerHTML = rows.map(productCard).join("") + kwRows.join("");
  }

  async function loadIndex({ force = false } = {}) {
    if (st.idxLoading && !force) return st.idxLoading;
    st.idxLoading = (async () => {
      try {
        const meta = (await csGet({ action: "photoIndexMeta" })).meta;
        st.idxMeta = meta;
        if (!meta) { st.idx = null; st.idxNote = "아직 색인이 없습니다 — PC 에서 [🔄 색인 갱신]을 한 번 눌러 주세요"; renderIndex(); return null; }
        const cached = await idbGet(window, "index");
        let text = cached?.version === meta.version ? cached.text : "";
        if (!text) {
          const parts = new Array(meta.chunks);
          const steps = [];
          for (let from = 0; from < meta.chunks; from += 12) steps.push(from);
          let got = 0;
          const worker = async () => {
            while (steps.length) {
              const from = steps.shift();
              const js = await csGet({ action: "photoIndexGet", from, to: Math.min(meta.chunks, from + 12) });
              if (!js.ok || js.version !== meta.version) throw new Error(js.error || "색인이 바뀌는 중 — 다시 시도해 주세요");
              js.chunks.forEach((c, i) => { parts[from + i] = c; });
              got += js.chunks.length;
              st.idxNote = `색인 받는 중 ${Math.round((got / meta.chunks) * 100)}%`; renderIndex();
            }
          };
          await Promise.all([worker(), worker(), worker(), worker()]);
          text = parts.join("");
          await idbSet(window, "index", { version: meta.version, text });
        }
        st.idx = decodeIndex(text);
        st.idxNote = "";
        renderIndex();
        return st.idx;
      } catch (error) {
        st.idxNote = `색인을 받지 못했습니다 (${error.message})`;
        renderIndex();
        return null;
      } finally {
        st.idxLoading = null;
      }
    })();
    return st.idxLoading;
  }

  // 찾는 사진 → 전체 + 가운데(70%) 두 가지로 비교
  async function searchBy(blobOrBitmap) {
    if (st.searching) return;
    if (st.query?.url) window.URL?.revokeObjectURL?.(st.query.url);
    const blob = blobOrBitmap instanceof Blob ? blobOrBitmap : await toJpeg(blobOrBitmap, { document, max: 1024 });
    st.query = { blob, url: window.URL.createObjectURL(blob) };
    st.hits = []; st.products = []; st.lastQs = null; st.ai = null; st.searching = true;
    st.searchNote = "준비 중… (처음 한 번은 계산 도구 · 색인을 받느라 조금 걸립니다)";
    renderSearch();
    try {
      const [idx, engine] = await Promise.all([st.idx || loadIndex(), loadEmbedder({ window, document, modelUrl }), loadCatalog()]);
      if (!idx || !idx.names.length) throw new Error(st.idxNote || "색인이 없습니다");
      st.searchNote = "찾는 중…"; renderSearch();
      const bmp = await createImageBitmap(blob);
      const qs = await embed(engine, [toTensorData(bmp, { document }), toTensorData(bmp, { document, crop: 0.7 })]);
      const t0 = Date.now();
      st.hits = searchIndex(idx, qs, { limit: 30 });   // 🤖 AI 추천 후보 (옵션 코드 단위)
      st.lastQs = qs;
      st.products = searchProducts(idx, qs, { limit: st.topN });
      st.searchNote = `사진 ${fmt(idx.names.length)}장(마스터 + 보조)과 비교 · 닮은 상품 ${st.products.length}개 · ${Date.now() - t0}ms — 맞는 상품이 없으면 [🤖 AI 추천]`;
    } catch (error) {
      st.searchNote = `⚠ ${error.message}`;
    } finally {
      st.searching = false;
      renderSearch();
    }
  }

  async function aiRecommend() {
    if (!st.query || !st.hits.length || st.ai?.busy) return;
    st.ai = { busy: true }; renderSearch();
    try {
      const small = await toJpeg(await createImageBitmap(st.query.blob), { document, max: 640, quality: 0.8 });
      const image = await new Promise((ok, bad) => { const r = new window.FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = () => bad(new Error("사진 읽기 실패")); r.readAsDataURL(small); });
      const candidates = st.hits.slice(0, 10).map((h) => { const it = itemOf(h.code); return { code: h.code, url: publicUrl(h.name), label: it ? `${it.name}${it.sku === h.code && it.option ? ` ${it.option}` : ""}` : "" }; });
      const js = await csPost({ action: "photoAi", image, candidates });
      const kwHits = !js.picks.length && js.keywords ? keywordSearch(st.catalog, js.keywords, 20) : [];
      st.ai = { busy: false, picks: js.picks || [], keywords: js.keywords || "", compared: js.compared || 0, kwHits };
    } catch (error) {
      st.ai = { busy: false, error: `AI 추천 실패: ${error.message}` };
    }
    renderSearch();
  }

  // ---------- 🔄 색인 갱신 (PC 권장): 사진 목록 → 바뀐 사진만 계산 → 시트에 올림 ----------
  async function listAllPhotos() {
    const out = [];
    for (let offset = 0; ; offset += 1000) {
      const res = await fetchImpl(`${HUB_URL}/storage/v1/object/list/${BUCKET}`, {
        method: "POST", headers: { apikey: HUB_KEY, Authorization: `Bearer ${HUB_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: FOLDER, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
      });
      if (!res.ok) throw new Error(`사진 목록 읽기 실패 (${res.status})`);
      const page = await res.json();
      out.push(...page.filter((f) => f?.id || f?.updated_at));
      st.build.note = `사진 목록 읽는 중 ${fmt(out.length)}장`; renderIndex();
      if (page.length < 1000) break;
    }
    return out;
  }

  async function buildIndex() {
    if (st.build?.running) return;
    if (!csToken()) { st.idxNote = "CS 관리에서 시트에 연결한 브라우저에서 됩니다"; renderIndex(); return; }
    st.build = { running: true, stop: false, done: 0, total: 0, note: "준비 중…" }; renderIndex();
    const b = st.build;
    try {
      const [engine, current] = await Promise.all([loadEmbedder({ window, document, modelUrl }), st.idx ? Promise.resolve(st.idx) : loadIndex()]);
      const files = await listAllPhotos();
      const saved = (await idbGet(window, "build")) || { entries: [] };   // 지난번 멈춘 데까지
      const base = current || { names: [], stamps: [], b64s: [] };
      const extra = new Map(saved.entries.map((e) => [e.name, e]));
      const merged = { names: [...base.names], stamps: [...base.stamps], b64s: [...base.b64s] };
      for (const [name, e] of extra) { merged.names.push(name); merged.stamps.push(e.stamp); merged.b64s.push(e.b64); }
      const plan = refreshPlan(files, merged);
      b.total = plan.todo.length; b.done = 0;
      const made = [];
      const t0 = Date.now();
      const queue = [...plan.todo];
      const fetchOne = async (t) => {
        const res = await fetchImpl(`${publicUrl(t.name)}?v=${t.stamp}`, { cache: "no-store" });
        if (!res.ok) return null;
        try { return await createImageBitmap(await res.blob()); } catch { return null; }
      };
      while (queue.length && !b.stop) {
        const batch = queue.splice(0, 8);
        const bmps = await Promise.all(batch.map(fetchOne));
        const ok = batch.map((t, i) => ({ t, bmp: bmps[i] })).filter((x) => x.bmp);
        const vecs = await embed(engine, ok.map((x) => toTensorData(x.bmp, { document })));
        ok.forEach((x, i) => { made.push({ name: x.t.name, stamp: x.t.stamp, b64: encodeVec(vecs[i]) }); x.bmp.close?.(); });
        b.done += batch.length;
        const per = (Date.now() - t0) / b.done;
        b.note = `새 사진 계산 ${fmt(b.done)} / ${fmt(b.total)}장 · 남은 시간 약 ${Math.ceil((per * (b.total - b.done)) / 60000)}분 (멈춰도 다음에 이어서)`;
        if (made.length % 400 < 8) await idbSet(window, "build", { entries: [...saved.entries, ...made] });
        renderIndex();
      }
      await idbSet(window, "build", { entries: [...saved.entries, ...made] });
      if (b.stop) { b.note = `멈춤 — ${fmt(b.done)}장까지 기기에 보관했습니다. 다시 누르면 이어서 계산합니다`; return; }
      const entries = [...plan.keep, ...made].sort((x, y) => (x.name < y.name ? -1 : 1));
      const text = encodeIndex(entries);
      const chunks = chunkText(text, 45000);
      b.note = `시트에 올리는 중 0 / ${chunks.length}`; renderIndex();
      const begin = await csPost({ action: "photoIndexBegin", chunks: chunks.length });
      for (let i = 0; i < chunks.length; i += 8) {
        await csPost({ action: "photoIndexPut", stage: begin.stage, from: i, chunks: chunks.slice(i, i + 8) });
        b.note = `시트에 올리는 중 ${Math.min(chunks.length, i + 8)} / ${chunks.length}`; renderIndex();
      }
      const done = await csPost({ action: "photoIndexCommit", stage: begin.stage, count: entries.length, dim: DIM, model: MODEL_ID });
      await idbSet(window, "index", { version: done.meta.version, text });
      await idbSet(window, "build", { entries: [] });
      st.idxMeta = done.meta;
      st.idx = decodeIndex(text);
      st.idxNote = "";
      b.note = `✓ 색인 ${fmt(entries.length)}장 (새로 계산 ${fmt(made.length)} · 빠진 사진 ${fmt(plan.removed)})`;
    } catch (error) {
      b.note = `⚠ 색인 갱신 실패: ${error.message}`;
    } finally {
      b.running = false;
      renderIndex();
    }
  }

  let catalogPromise = null;
  function loadCatalog() {
    if (st.loaded) return Promise.resolve(st.catalog);
    if (!catalogPromise) catalogPromise = loadCatalogOnce().finally(() => { catalogPromise = null; });
    return catalogPromise;
  }
  async function loadCatalogOnce() {
    if (st.loaded) return;
    st.loading = true; renderResults();
    try {
      const rows = [];
      for (let from = 0; ; from += PAGE) {
        const res = await fetchImpl(`${HUB_URL}/rest/v1/sellpia_stock_latest?select=sellpia_sku_code,sellpia_product_code,sellpia_product_name,sellpia_option_name,own_sku,stock,available_stock&order=sellpia_sku_code.asc`, {
          headers: { apikey: HUB_KEY, Authorization: `Bearer ${HUB_KEY}`, "Range-Unit": "items", Range: `${from}-${from + PAGE - 1}` }, cache: "no-store",
        });
        if (!res.ok && res.status !== 206) throw new Error(`상품 목록 읽기 실패 (${res.status})`);
        const page = await res.json();
        rows.push(...page);
        if (page.length < PAGE) break;
      }
      st.catalog = buildCatalog(rows);
      st.loaded = true;
      if (st.hits.length) renderSearch();
    } catch (error) {
      msg(error.message, "is-bad");
    } finally {
      st.loading = false;
      if (st.q) st.results = searchCatalog(st.catalog, st.q);
      renderResults();
    }
  }

  async function loadSaved() {
    if (!st.item) return;
    try { st.saved = await listSubs(fetchImpl, st.item.sku); }
    catch (error) { st.saved = []; msg(error.message, "is-bad"); }
    st.slots = initialSlots(st.saved, SUB_SLOTS);
    renderSlots();
  }

  function dropNew() { for (const s of st.slots) if (s.kind === "new" && s.url) window.URL?.revokeObjectURL?.(s.url); }

  async function pick(sku) {
    const it = st.catalog.find((x) => x.sku === sku);
    if (!it) return;
    if (newCount() && !window.confirm(`등록하지 않은 새 사진 ${newCount()}장이 있습니다. 버리고 다른 상품으로 갈까요?`)) return;
    dropNew();
    st.item = it; st.saved = []; st.slots = initialSlots([], SUB_SLOTS);
    msg("");
    render();
    await loadSaved();
  }

  function unpick() {
    if (newCount() && !window.confirm(`등록하지 않은 새 사진 ${newCount()}장이 있습니다. 버릴까요?`)) return;
    dropNew();
    camOff();
    st.item = null; st.saved = []; st.slots = initialSlots([], SUB_SLOTS);
    msg(""); render();
    $("[data-pf-q]").focus?.();
  }

  // 새 사진 → 다음 빈 칸 (꽉 차면 알림)
  async function addBlob(blob) {
    const slot = nextEmpty(st.slots);
    if (!slot) { msg(`칸 ${SUB_SLOTS}개가 꽉 찼습니다 — ✕ 로 비우고 다시 채워 주세요`, "is-bad"); return false; }
    const s = st.slots.find((x) => x.slot === slot);
    Object.assign(s, { kind: "new", blob, url: window.URL.createObjectURL(blob) });
    renderSlots();
    return true;
  }

  async function addFiles(files) {
    if (!st.item) { msg("먼저 상품을 검색해서 골라 주세요", "is-bad"); return; }
    for (const f of [...(files || [])].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name))) {
      try { if (!(await addBlob(await toJpeg(f, { document })))) break; }
      catch (error) { msg(`${f.name}: ${error.message}`, "is-bad"); }
    }
  }

  // ---------- 카메라: 촬영 버튼 = 다음 빈 칸에 바로 채움 (카메라는 계속 켜 둠) ----------
  // kind: "reg" = 사진 등록 · "search" = 사진으로 찾기 (카메라는 한 번에 하나)
  const CAM = {
    reg: { box: "[data-pf-cambox]", video: "[data-pf-video]", btn: "[data-pf-cam]", on: "📷 카메라 연결됨", off: "📷 카메라 연결" },
    search: { box: "[data-pf-scambox]", video: "[data-pf-svideo]", btn: "[data-pf-scam]", on: "📷 카메라 연결됨", off: "📷 카메라로 찾기" },
  };
  async function camOn(kind = "reg") {
    const say = (t) => (kind === "reg" ? msg(t, "is-bad") : (st.searchNote = `⚠ ${t}`, st.query ? renderSearch() : window.alert?.(t)));
    if (!navigator.mediaDevices?.getUserMedia) { say("이 브라우저는 카메라 연결을 지원하지 않습니다 — [🖼 사진 선택]을 써 주세요"); return; }
    camOff();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: st.facing }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
      st.cam = stream; st.camKind = kind;
      const c = CAM[kind];
      const v = $(c.video);
      v.srcObject = stream;
      await v.play?.().catch(() => {});
      $(c.box).hidden = false;
      $(c.btn).textContent = c.on;
      if (kind === "reg") msg("");
    } catch (error) {
      say(`카메라를 열지 못했습니다 (${error.name === "NotAllowedError" ? "카메라 권한을 허용해 주세요" : error.message})`);
    }
    renderSlots();
  }
  function camOff() {
    if (st.cam) st.cam.getTracks().forEach((t) => t.stop());
    st.cam = null; st.camKind = "";
    for (const c of Object.values(CAM)) {
      const box = $(c.box); if (box) box.hidden = true;
      const b = $(c.btn); if (b) b.textContent = c.off;
    }
  }
  async function searchShot() {
    const v = $("[data-pf-svideo]");
    if (!st.cam || !v?.videoWidth) return;
    const box = $("[data-pf-scambox]");
    box.classList.remove("is-flash"); void box.offsetWidth; box.classList.add("is-flash");
    await searchBy(await toJpeg(v, { document, max: 1024 }));
  }
  async function shoot() {
    const v = $("[data-pf-video]");
    if (!st.cam || !v?.videoWidth) { msg("카메라 화면이 아직 준비되지 않았습니다", "is-bad"); return; }
    try {
      const blob = await toJpeg(v, { document });
      if (await addBlob(blob)) {
        const box = $("[data-pf-cambox]");
        box.classList.remove("is-flash"); void box.offsetWidth; box.classList.add("is-flash");
        msg(nextEmpty(st.slots) ? `${SUB_SLOTS - st.slots.filter((s) => s.kind === "empty").length}/${SUB_SLOTS} 칸 — 계속 찍거나 [등록]` : "칸이 다 찼습니다 — ✕ 로 바꾸거나 [등록]", "is-ok");
      }
    } catch (error) { msg(error.message, "is-bad"); }
  }

  async function save() {
    const plan = registerPlan(st.slots, st.saved);
    if (!plan.length || st.busy || !st.item) return;
    st.busy = true; renderSlots(); msg("등록 중…");
    const sku = st.item.sku;
    let done = 0;
    try {
      for (const p of plan) {
        const name = subName(sku, p.slot);
        if (p.op === "put") await putPhoto(fetchImpl, name, st.slots.find((s) => s.slot === p.slot).blob);
        else await removePhoto(fetchImpl, name);
        done += 1;
      }
      dropNew();
      msg(`✓ ${sku} 보조사진 ${done}건 등록 완료`, "is-ok");
    } catch (error) {
      msg(`등록 ${done}/${plan.length}건 뒤 실패: ${error.message}`, "is-bad");
    } finally {
      st.busy = false;
      await loadSaved();
    }
  }

  async function star(slot) {
    if (!st.item || st.busy) return;
    if (newCount()) { msg("새 사진을 먼저 [등록]한 뒤 마스터를 바꿔 주세요", "is-bad"); return; }
    if (!window.confirm(`${slot}번 보조사진을 ${st.item.sku} 의 마스터 사진으로 바꿀까요?\n· 시스템 전체 대표 사진이 바뀝니다\n· 원래 마스터 사진은 ${slot}번 칸으로 옮겨집니다 (맞바꾸기)`)) return;
    st.busy = true; renderSlots(); msg("마스터 사진 바꾸는 중…");
    try {
      const img = $(".pf-master img");
      const masterUrl = img && img.complete && img.naturalWidth ? img.currentSrc || img.src : "";
      const r = await swapMaster(fetchImpl, { sku: st.item.sku, slot, masterUrl });
      msg(`★ 마스터 사진을 바꿨습니다${r.swapped ? ` — 원래 사진은 ${slot}번 칸` : ""} · 피킹·검품 화면은 새로고침하면 바뀝니다`, "is-ok");
    } catch (error) { msg(`마스터 바꾸기 실패: ${error.message}`, "is-bad"); }
    st.busy = false;
    renderPicked();
    const img = $(".pf-master img");
    if (img) img.src = `${img.src.split("?")[0]}?t=${Date.now()}`;
    await loadSaved();
  }

  // ---------- 이벤트 ----------
  let timer = 0;
  root.addEventListener("input", (e) => {
    if (!e.target.matches("[data-pf-q]")) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      st.q = e.target.value.trim();
      st.results = searchCatalog(st.catalog, st.q);
      if (st.item && st.q) { st.item = null; render(); }
      renderResults();
      if (!st.loaded) loadCatalog();
    }, 180);
  });
  root.addEventListener("change", (e) => {
    if (e.target.matches("[data-pf-file]")) { addFiles(e.target.files).finally(() => { e.target.value = ""; }); }
    if (e.target.matches("[data-pf-sfile]")) { const f = e.target.files?.[0]; if (f) searchBy(f).finally(() => { e.target.value = ""; }); }
  });
  // PC: Ctrl+V 붙여넣기 → 찾기 화면이면 찾기, 등록 화면이면 칸 채우기
  document.addEventListener("paste", (e) => {
    const panel = root.closest("[data-purchase-panel]");
    if (panel?.hidden) return;
    const f = [...(e.clipboardData?.files || [])].find((x) => /^image\//.test(x.type));
    if (!f) return;
    e.preventDefault();
    if (st.mode === "search") searchBy(f); else addFiles([f]);
  });
  root.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.pfMode) { st.mode = b.dataset.pfMode; camOff(); render(); if (st.mode === "search" && !st.idx) loadIndex(); }
    else if (b.matches("[data-pf-scam]")) camOn("search");
    else if (b.matches("[data-pf-scamoff]")) camOff();
    else if (b.matches("[data-pf-sflip]")) { st.facing = st.facing === "environment" ? "user" : "environment"; camOn("search"); }
    else if (b.matches("[data-pf-sshot]")) searchShot();
    else if (b.dataset.pfTop) {
      st.topN = Number(b.dataset.pfTop) || 5; saveTop();
      if (st.idx && st.lastQs) st.products = searchProducts(st.idx, st.lastQs, { limit: st.topN });
      renderSearch();
    }
    else if (b.matches("[data-pf-ai-go]")) aiRecommend();
    else if (b.matches("[data-pf-build]")) buildIndex();
    else if (b.matches("[data-pf-bstop]")) { if (st.build) st.build.stop = true; }
    else if (b.dataset.pfToreg) { st.mode = "register"; camOff(); render(); loadCatalog().then(() => pick(b.dataset.pfToreg)); }
    else if (b.dataset.pfPick) pick(b.dataset.pfPick);
    else if (b.matches("[data-pf-unpick]")) unpick();
    else if (b.matches("[data-pf-cam]")) camOn("reg");
    else if (b.matches("[data-pf-camoff]")) camOff();
    else if (b.matches("[data-pf-flip]")) { st.facing = st.facing === "environment" ? "user" : "environment"; camOn("reg"); }
    else if (b.matches("[data-pf-shot]")) shoot();
    else if (b.matches("[data-pf-save]")) save();
    else if (b.dataset.pfStar) star(Number(b.dataset.pfStar));
    else if (b.dataset.pfX) {
      const s = st.slots.find((x) => x.slot === Number(b.dataset.pfX));
      if (!s) return;
      if (s.kind === "new") window.URL?.revokeObjectURL?.(s.url);
      Object.assign(s, { kind: "empty", blob: null, url: "" });
      renderSlots();
      if (st.saved.some((x) => x.slot === s.slot)) msg(`${s.slot}번 등록 사진은 [등록]을 누르면 지워집니다 (새 사진으로 채워도 됨)`);
    }
  });
  const swork = $("[data-pf-swork]");
  swork.addEventListener("dragover", (e) => { e.preventDefault(); swork.classList.add("is-drag"); });
  swork.addEventListener("dragleave", () => swork.classList.remove("is-drag"));
  swork.addEventListener("drop", (e) => { e.preventDefault(); swork.classList.remove("is-drag"); const f = [...(e.dataTransfer?.files || [])].find((x) => /^image\//.test(x.type)); if (f) searchBy(f); });
  const work = $("[data-pf-work]");
  work.addEventListener("dragover", (e) => { e.preventDefault(); work.classList.add("is-drag"); });
  work.addEventListener("dragleave", () => work.classList.remove("is-drag"));
  work.addEventListener("drop", (e) => { e.preventDefault(); work.classList.remove("is-drag"); addFiles(e.dataTransfer?.files); });

  render();
  // 탭을 처음 열 때만 상품 목록을 읽음 · 탭을 떠나면 카메라 끔
  const panel = root.closest("[data-purchase-panel]");
  const onPanel = () => { if (panel && !panel.hidden) { loadCatalog(); if (st.mode === "search" && !st.idx && !st.idxLoading) loadIndex(); } else camOff(); };
  onPanel();
  if (panel && window.MutationObserver) new window.MutationObserver(onPanel).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener?.("visibilitychange", () => { if (document.hidden) camOff(); });
  return { state: st, loadCatalog, pick, addFiles, save, star, shoot, camOn, camOff, searchBy, aiRecommend, buildIndex, loadIndex };
}

if (typeof document !== "undefined" && document.querySelector("[data-product-finder]")) {
  const safe = (k) => { try { return window[k]; } catch { return null; } };
  mountProductFinder({ document, window, storages: [safe("sessionStorage"), safe("localStorage")] });
}
