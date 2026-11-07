// 🔎 상품찾기 (2026-11-07) — 상품 관리 사이드 메뉴 [상품명 요청] 밑
//  ① 사진으로 찾기 (3단계에서 붙임)
//  ② 사진 등록: 셀피아 코드 · 자사코드 · 상품명으로 검색 → 선택 → 사진 선택 · 끌어다 놓기 · 📷 카메라 → 칸 3개 → [등록]
//     · 저장 = 허브 product-images/sellpia/코드.__sub1~3.jpg (보조사진) — 마스터 사진은 그대로, ☆ 로 맞바꾸기
import { buildCatalog, initialSlots, searchCatalog } from "../domain/productFinder.mjs?v=20261107-finder1";
import { HUB_KEY, HUB_URL, SUB_SLOTS, listSubs, masterCandidates, nextEmpty, publicUrl, putPhoto, registerPlan, removePhoto, subName, swapMaster, toJpeg } from "../domain/subPhotos.mjs?v=20261107-finder1";

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

export function mountProductFinder({ document, window, fetchImpl = (...a) => window.fetch(...a), navigator = window.navigator } = {}) {
  const root = document.querySelector("[data-product-finder]");
  if (!root) return null;
  const st = {
    mode: "register", catalog: [], loading: false, loaded: false, q: "", results: [],
    item: null, saved: [], slots: initialSlots([], SUB_SLOTS), busy: false, cam: null, facing: "environment",
  };
  root.innerHTML = `
    <div class="pf-modes" role="tablist">
      <button type="button" data-pf-mode="search">🔍 사진으로 찾기</button>
      <button type="button" data-pf-mode="register" class="is-on">📷 사진 등록</button>
    </div>
    <section class="pf-sec" data-pf-sec="search" hidden>
      <p class="pf-soon">사진으로 찾기는 다음 단계에서 붙습니다 — 먼저 [📷 사진 등록]으로 옵션 사진을 모아 두면 찾기 정확도가 올라갑니다.</p>
    </section>
    <section class="pf-sec" data-pf-sec="register">
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
    renderResults(); renderPicked(); renderSlots();
  }

  async function loadCatalog() {
    if (st.loaded || st.loading) return;
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
  async function camOn() {
    if (!navigator.mediaDevices?.getUserMedia) { msg("이 브라우저는 카메라 연결을 지원하지 않습니다 — [🖼 사진 선택]을 써 주세요", "is-bad"); return; }
    camOff();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: st.facing }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
      st.cam = stream;
      const v = $("[data-pf-video]");
      v.srcObject = stream;
      await v.play?.().catch(() => {});
      $("[data-pf-cambox]").hidden = false;
      $("[data-pf-cam]").textContent = "📷 카메라 연결됨";
      msg("");
    } catch (error) {
      msg(`카메라를 열지 못했습니다 (${error.name === "NotAllowedError" ? "카메라 권한을 허용해 주세요" : error.message})`, "is-bad");
    }
    renderSlots();
  }
  function camOff() {
    if (st.cam) st.cam.getTracks().forEach((t) => t.stop());
    st.cam = null;
    const box = $("[data-pf-cambox]");
    if (box) box.hidden = true;
    const b = $("[data-pf-cam]");
    if (b) b.textContent = "📷 카메라 연결";
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
  });
  root.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.pfMode) { st.mode = b.dataset.pfMode; if (st.mode !== "register") camOff(); render(); }
    else if (b.dataset.pfPick) pick(b.dataset.pfPick);
    else if (b.matches("[data-pf-unpick]")) unpick();
    else if (b.matches("[data-pf-cam]")) camOn();
    else if (b.matches("[data-pf-camoff]")) camOff();
    else if (b.matches("[data-pf-flip]")) { st.facing = st.facing === "environment" ? "user" : "environment"; camOn(); }
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
  const work = $("[data-pf-work]");
  work.addEventListener("dragover", (e) => { e.preventDefault(); work.classList.add("is-drag"); });
  work.addEventListener("dragleave", () => work.classList.remove("is-drag"));
  work.addEventListener("drop", (e) => { e.preventDefault(); work.classList.remove("is-drag"); addFiles(e.dataTransfer?.files); });

  render();
  // 탭을 처음 열 때만 상품 목록을 읽음 · 탭을 떠나면 카메라 끔
  const panel = root.closest("[data-purchase-panel]");
  const onPanel = () => { if (panel && !panel.hidden) loadCatalog(); else camOff(); };
  onPanel();
  if (panel && window.MutationObserver) new window.MutationObserver(onPanel).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener?.("visibilitychange", () => { if (document.hidden) camOff(); });
  return { state: st, loadCatalog, pick, addFiles, save, star, shoot, camOn, camOff };
}

if (typeof document !== "undefined" && document.querySelector("[data-product-finder]")) {
  mountProductFinder({ document, window });
}
