// ↩ CS 관리 › 반품기록 (2026-11-10) — 반품·교환 메모 카드 (CS 시트 v19 '반품기록' 탭)
//  · [＋ 새 반품] → 카드 한 장 · 칸에 쓰면 0.8초 뒤 자동 저장 · 처리 단계는 버튼으로
//  · 다른 사람이 먼저 고친 카드는 덮어쓰지 않고 새 내용을 보여 줌 (버전) · 삭제는 표시만 (시트 줄은 남음)
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const FIELDS = [
  { k: "who", label: "고객 · 주문번호", multi: false, ph: "예) 홍길동 / 2026111012345678" },
  { k: "item", label: "상품", multi: false, ph: "상품명 · 옵션 · 셀피아 코드" },
  { k: "reason", label: "사유", multi: true, ph: "단순 변심 · 사이즈 · 불량 …" },
  { k: "memo", label: "메모", multi: true, ph: "회수 송장 · 환불 금액 · 처리 내용 …" },
];
const DEFAULT_STATUS = ["접수", "회수 중", "도착·검수", "환불 완료", "교환 발송", "끝"];
const when = (iso) => { const t = Date.parse(iso || ""); if (!Number.isFinite(t)) return ""; const k = new Date(t + 9 * 3600000).toISOString(); return `${k.slice(5, 10)} ${k.slice(11, 16)}`; };

export function filterReturns(items = [], { q = "", status = "" } = {}) {
  const words = String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((it) => (!status || (status === "열림" ? it.status !== "끝" : it.status === status))
    && words.every((w) => `${it.who} ${it.item} ${it.reason} ${it.memo} ${it.status} ${it.by}`.toLowerCase().includes(w)));
}

export function mountReturns({ document, window, root, side, post, isLive = () => true, editor = () => "" } = {}) {
  if (!root) return null;
  const st = { items: [], statuses: DEFAULT_STATUS, loaded: false, loading: false, error: "", q: "", status: "열림", note: "", timers: new Map(), saving: new Set(), drafts: new Map() };
  if (side) side.innerHTML = `
    <fieldset class="cs-box rt-side">
      <legend>↩ 반품기록</legend>
      <ol class="cs-note cs-install-steps">
        <li><b>[＋ 새 반품]</b> 으로 카드를 만들고 칸에 적으면 자동 저장됩니다 (CS 시트 '반품기록' 탭).</li>
        <li>처리 단계는 카드 아래 버튼으로: ${DEFAULT_STATUS.join(" → ")}.</li>
        <li>다른 사람이 먼저 고친 카드는 덮어쓰지 않고 새 내용을 보여 줍니다.</li>
        <li>🗑 은 목록에서만 빼고, 시트 줄은 남깁니다.</li>
      </ol>
    </fieldset>`;
  root.innerHTML = `
    <div class="rt-bar">
      <button type="button" class="cs-btn cs-btn-primary" data-rt-add>＋ 새 반품</button>
      <input type="search" class="rt-q" data-rt-q placeholder="찾기 — 고객 · 주문번호 · 상품 · 사유 · 메모" aria-label="찾기">
      <span class="rt-seg" data-rt-filter role="group" aria-label="처리 단계"></span>
      <span class="cs-flex"></span>
      <button type="button" class="cs-btn" data-rt-reload>⟳ 새로고침</button>
    </div>
    <p class="rt-msg" data-rt-msg></p>
    <div class="rt-list" data-rt-list></div>`;
  const $ = (s) => root.querySelector(s);
  const msg = (t, tone = "") => { const el = $("[data-rt-msg]"); el.textContent = t || ""; el.className = `rt-msg ${tone}`; };

  async function load() {
    if (st.loading) return;
    if (!isLive()) { st.error = ""; render(); return; }
    st.loading = true; render();
    try {
      const js = await post({ action: "retList" });
      st.items = js.items || []; st.statuses = js.statuses?.length ? js.statuses : DEFAULT_STATUS; st.loaded = true; st.error = "";
    } catch (error) {
      st.error = /알 수 없는 요청/.test(error?.message || "") ? "시트가 아직 반품기록(v19) 전입니다 — 시트 새 버전 배포 뒤 다시" : `불러오지 못했습니다: ${error?.message || error}`;
    }
    st.loading = false; render();
  }

  // 한 카드의 저장은 차례로 (버전이 꼬이지 않게)
  const chains = new Map();
  function save(id, patch) {
    const next = (chains.get(id) || Promise.resolve()).then(() => saveNow(id, patch));
    chains.set(id, next.catch(() => {}));
    return next;
  }
  async function saveNow(id, patch) {
    const it = st.items.find((x) => x.id === id);
    if (!it) return;
    st.saving.add(id); paintState(id);
    try {
      const js = await post({ action: "retSave", id, base: it.version, editor: editor(), ...patch });
      Object.assign(it, js.item || {});
      st.saving.delete(id);
      if (patch.remove) { st.items = st.items.filter((x) => x.id !== id); msg("목록에서 뺐습니다 (시트 줄은 남음)", "is-ok"); render(); }
      else { for (const k of Object.keys(patch)) st.drafts.delete(`${id}:${k}`); paintState(id, "저장됨"); }
    } catch (error) {
      if (/먼저 고쳤/.test(error?.message || "")) { msg("⚠ 다른 사람이 먼저 고친 카드입니다 — 새 내용을 불러옵니다", "is-bad"); await load(); }
      else { st.saving.delete(id); msg(`⚠ 저장 못 함: ${error?.message || error}`, "is-bad"); paintState(id, "저장 못 함"); }
    }
    st.saving.delete(id);
  }
  function queue(id, k, value) {
    st.drafts.set(`${id}:${k}`, value);
    const key = `${id}:${k}`;
    clearTimeout(st.timers.get(key));
    paintState(id, "쓰는 중…");
    st.timers.set(key, setTimeout(() => { st.timers.delete(key); save(id, { [k]: value }); }, 800));
  }
  async function add() {
    if (!isLive()) { msg("CS 시트 연결 뒤에 쓸 수 있습니다", "is-bad"); return; }
    try {
      const js = await post({ action: "retSave", status: st.statuses[0], editor: editor() });
      st.items.unshift(js.item);
      st.q = ""; $("[data-rt-q]").value = ""; if (st.status !== "열림" && st.status !== st.statuses[0]) st.status = "열림";
      render();
      root.querySelector(`[data-rt-card="${CSS.escape(js.item.id)}"] [data-rt-k="who"]`)?.focus();
    } catch (error) { msg(`⚠ ${error?.message || error}`, "is-bad"); }
  }

  const paintState = (id, text) => {
    const el = root.querySelector(`[data-rt-card="${CSS.escape(id)}"] [data-rt-state]`);
    if (el) el.textContent = st.saving.has(id) ? "저장 중…" : text || "";
  };
  const cardHtml = (it) => `
    <article class="rt-card${it.status === "끝" ? " is-done" : ""}" data-rt-card="${esc(it.id)}">
      <header class="rt-head"><b class="rt-status">${esc(it.status)}</b><small>${esc(when(it.createdAt))} · ${esc(it.by || "-")}${it.editor && it.editor !== it.by ? ` · 고침 ${esc(it.editor)} ${esc(when(it.updatedAt))}` : ""}</small><span class="cs-flex"></span><small class="rt-state" data-rt-state></small><button type="button" class="rt-del" data-rt-del="${esc(it.id)}" title="목록에서 빼기 (시트 줄은 남음)">🗑</button></header>
      <div class="rt-grid">${FIELDS.map((f) => {
        const v = st.drafts.get(`${it.id}:${f.k}`) ?? it[f.k] ?? "";
        return `<label class="rt-f${f.multi ? " is-multi" : ""}"><span>${esc(f.label)}</span>${f.multi
          ? `<textarea rows="${Math.min(8, Math.max(2, String(v).split("\n").length))}" data-rt-k="${f.k}" placeholder="${esc(f.ph)}">${esc(v)}</textarea>`
          : `<input data-rt-k="${f.k}" value="${esc(v)}" placeholder="${esc(f.ph)}">`}</label>`;
      }).join("")}</div>
      <div class="rt-steps">${st.statuses.map((s) => `<button type="button" class="${s === it.status ? "is-on" : ""}" data-rt-status="${esc(s)}">${esc(s)}</button>`).join("")}</div>
    </article>`;
  function render() {
    const filters = ["열림", ...st.statuses, "전체"];
    $("[data-rt-filter]").innerHTML = filters.map((f) => `<button type="button" data-rt-f="${esc(f)}" class="${(st.status || "전체") === f ? "is-on" : ""}">${esc(f)}</button>`).join("");
    const list = $("[data-rt-list]");
    if (st.error) { list.innerHTML = `<p class="rt-empty is-bad">${esc(st.error)}</p>`; return; }
    if (!st.loaded) { list.innerHTML = `<p class="rt-empty">${st.loading ? "불러오는 중…" : ""}</p>`; return; }
    const shown = filterReturns(st.items, { q: st.q, status: st.status === "전체" ? "" : st.status });
    list.innerHTML = `<p class="rt-count">반품기록 ${st.items.length}건 · 진행 중 ${st.items.filter((x) => x.status !== "끝").length}${shown.length !== st.items.length ? ` · 보이는 것 ${shown.length}` : ""}</p>`
      + (shown.length ? shown.map(cardHtml).join("") : `<p class="rt-empty">${st.items.length ? "맞는 카드가 없습니다." : "아직 반품기록이 없습니다 — [＋ 새 반품]"}</p>`);
  }

  root.addEventListener("input", (e) => {
    const el = e.target;
    if (el.matches?.("[data-rt-q]")) { st.q = el.value; render(); return; }
    const k = el.dataset?.rtK;
    const card = el.closest?.("[data-rt-card]");
    if (k && card) queue(card.dataset.rtCard, k, el.value);
  });
  root.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.matches("[data-rt-add]")) add();
    else if (b.matches("[data-rt-reload]")) load();
    else if (b.dataset.rtF) { st.status = b.dataset.rtF; render(); }
    else if (b.dataset.rtStatus) {
      const id = b.closest("[data-rt-card]")?.dataset.rtCard;
      const it = st.items.find((x) => x.id === id);
      if (it && it.status !== b.dataset.rtStatus) { it.status = b.dataset.rtStatus; render(); save(id, { status: it.status }); }
    } else if (b.dataset.rtDel) save(b.dataset.rtDel, { remove: true });
  });
  render();
  return { load, add, state: st };
}
