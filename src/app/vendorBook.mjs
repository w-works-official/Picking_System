// 📦 거래처 등록 (2026-11-26 — CS 관리 › 거래처 왼쪽 · 시트 v43 vendorBook · vendorUse · vendorEdit)
//  · 최근 30일 많이 쓴 순 → 같으면 가나다 · 주문서를 올리면 그 업체들을 사용 기록 + 없는 업체는 자동 추가
//  · 지우기는 [삭제] 두 번 누름으로만 · [추가]로 직접 추가
//  · 방 칸 4개 = 직원마다 쓰는 카톡방 이름, 위쪽 사용자 이름 4개 · [저장]은 고친 칸만 보냄
export const VENDOR_SLOTS = 4;
export const VENDOR_USED_EVENT = "system-v3-vendor-used";
export const VENDOR_ME_KEY = "system_v3_cs_vendor_me";      // 이 PC 사용자 칸 (0~3, 없으면 -1)

// 이 PC 사용자 칸의 카톡방 이름 (없으면 "")
export function roomFor(book, me, name) {
  if (!(me >= 0 && me < VENDOR_SLOTS)) return "";
  const v = (book?.vendors || []).find((x) => vendorKey(x.name) === vendorKey(name));
  return String(v?.rooms?.[me] || "").trim();
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export const vendorKey = (s) => String(s ?? "").replace(/\s+/g, "").toLowerCase();

export function sortVendors(list) {
  return [...(list || [])].sort((a, b) => (b.uses || 0) - (a.uses || 0) || String(a.name).localeCompare(String(b.name), "ko"));
}

export function vendorBookHtml(book, { dirty = new Map(), pendingDel = "", me = -1 } = {}) {
  const users = Array.from({ length: VENDOR_SLOTS }, (_, i) => (dirty.has(`u${i}`) ? dirty.get(`u${i}`) : book.users?.[i] || ""));
  const head = users.map((u, i) => `<input class="vb-user${i === me ? " is-me" : ""}" data-vb-user="${i}" value="${esc(u)}" placeholder="사용자 ${i + 1}" maxlength="20">`).join("");
  const mine = `<label class="vb-me">이 PC <select data-vb-me><option value="-1">선택</option>${users.map((u, i) => `<option value="${i}"${i === me ? " selected" : ""}>${esc(u || `사용자 ${i + 1}`)}</option>`).join("")}</select></label>`;
  const rows = sortVendors(book.vendors).map((v) => {
    const k = vendorKey(v.name);
    const rooms = Array.from({ length: VENDOR_SLOTS }, (_, i) => {
      const id = `r${i}:${k}`;
      const val = dirty.has(id) ? dirty.get(id) : v.rooms?.[i] || "";
      return `<input class="vb-room${dirty.has(id) ? " is-dirty" : ""}${i === me ? " is-me" : ""}" data-vb-room="${i}" data-vb-name="${esc(v.name)}" value="${esc(val)}" maxlength="60" aria-label="${esc(`${v.name} 카톡방 ${i + 1}`)}">`;
    }).join("");
    const del = pendingDel === k;
    return `<div class="vb-item" data-vb-key="${esc(k)}">
      <div class="vb-line"><b class="vb-name">${esc(v.name)}</b><span class="vb-uses">${v.uses || 0}회</span>
        <button type="button" class="vb-del${del ? " is-armed" : ""}" data-vb-del="${esc(v.name)}">${del ? "삭제 확인" : "삭제"}</button></div>
      <div class="vb-rooms">${rooms}</div>
    </div>`;
  }).join("");
  return `${mine}<div class="vb-head"><div class="vb-users">${head}</div>
      <button type="button" class="cs-btn cs-btn-primary vb-save" data-vb-act="save"${dirty.size ? "" : " disabled"}>저장</button></div>
    <div class="vb-add"><input data-vb-new placeholder="업체명" maxlength="40"><button type="button" class="cs-btn" data-vb-act="add">추가</button></div>
    <div class="vb-list">${rows || '<p class="cs-note">등록된 업체 없음</p>'}</div>`;
}

export function mountVendorBook({ document, window, root, post, isLive = () => true, storage = null }) {
  if (!root) return null;
  const readMe = () => { try { const v = storage?.getItem(VENDOR_ME_KEY); if (v == null || v === "") return -1; const n = Number(v); return Number.isInteger(n) && n >= 0 && n < VENDOR_SLOTS ? n : -1; } catch { return -1; } };
  const st = { book: { users: [], vendors: [] }, dirty: new Map(), pendingDel: "", loaded: false, busy: false, timer: 0, retry: 0, msg: "", me: readMe() };
  window.SystemV3VendorRoom = (name) => roomFor(st.book, st.me, name);   // msnSlots 일괄 붙이기가 씀
  const box = document.createElement("div");
  const say = document.createElement("p");
  say.className = "cs-note vb-say";
  root.replaceChildren(box, say);
  const note = (t, tone = "") => { say.textContent = t || ""; say.dataset.tone = tone; };

  function render() {
    const focus = document.activeElement;
    const keep = focus && box.contains(focus) ? { sel: focus.dataset.vbRoom != null ? `[data-vb-room="${focus.dataset.vbRoom}"][data-vb-name="${CSS.escape(focus.dataset.vbName)}"]` : focus.dataset.vbUser != null ? `[data-vb-user="${focus.dataset.vbUser}"]` : focus.hasAttribute("data-vb-new") ? "[data-vb-new]" : "", pos: focus.selectionStart, val: focus.value } : null;
    const draft = box.querySelector("[data-vb-new]")?.value || "";
    box.innerHTML = vendorBookHtml(st.book, { dirty: st.dirty, pendingDel: st.pendingDel, me: st.me });
    box.querySelector("[data-vb-new]").value = draft;
    if (keep?.sel) { const el = box.querySelector(keep.sel); if (el) { if (keep.sel === "[data-vb-new]") el.value = keep.val; el.focus(); try { el.setSelectionRange(keep.pos, keep.pos); } catch { /* */ } } }
  }
  function apply(res) {
    if (res && Array.isArray(res.vendors)) st.book = { users: res.users || [], vendors: res.vendors };
    st.loaded = true;
    render();
  }
  async function call(body, okMsg) {
    if (!isLive()) { note("시트 연결 후", "bad"); return null; }
    st.busy = true;
    try {
      const res = await post(body);
      apply(res);
      note(res.errors?.length ? res.errors.join(" · ") : okMsg || "", res.errors?.length ? "bad" : "ok");
      return res;
    } catch (error) {
      note(String(error?.message || error), "bad");
      return null;
    } finally { st.busy = false; }
  }
  async function load() {
    if (!isLive()) {
      if (st.retry++ < 40) { window.clearTimeout(st.timer); st.timer = window.setTimeout(load, 3000); }
      return;
    }
    st.retry = 0;
    await call({ action: "vendorBook" });
  }
  async function save() {
    if (!st.dirty.size) return;
    const ops = [];
    const users = Array.from({ length: VENDOR_SLOTS }, (_, i) => (st.dirty.has(`u${i}`) ? st.dirty.get(`u${i}`) : st.book.users?.[i] || ""));
    if ([...st.dirty.keys()].some((k) => k.startsWith("u"))) ops.push({ op: "users", users });
    for (const [k, room] of st.dirty) {
      if (!k.startsWith("r")) continue;
      const i = Number(k.slice(1, k.indexOf(":")));
      const v = st.book.vendors.find((x) => vendorKey(x.name) === k.slice(k.indexOf(":") + 1));
      if (v) ops.push({ op: "room", name: v.name, i, room });
    }
    const sent = new Map(st.dirty);
    const res = await call({ action: "vendorEdit", ops }, "저장됨");
    if (res) { for (const [k, v] of sent) if (st.dirty.get(k) === v) st.dirty.delete(k); render(); }
  }

  box.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.vbUser != null) st.dirty.set(`u${t.dataset.vbUser}`, t.value);
    else if (t.dataset.vbRoom != null) { st.dirty.set(`r${t.dataset.vbRoom}:${vendorKey(t.dataset.vbName)}`, t.value); t.classList.add("is-dirty"); }
    else return;
    const b = box.querySelector('[data-vb-act="save"]');
    if (b) b.disabled = false;
  });
  box.addEventListener("change", (e) => {
    if (!e.target.hasAttribute("data-vb-me")) return;
    st.me = Number(e.target.value);
    try { if (st.me >= 0) storage?.setItem(VENDOR_ME_KEY, String(st.me)); else storage?.removeItem(VENDOR_ME_KEY); } catch { /* 이번 화면만 */ }
    render();
  });
  box.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    if (e.target.hasAttribute("data-vb-new")) { e.preventDefault(); box.querySelector('[data-vb-act="add"]')?.click(); }
    else if (e.target.dataset.vbRoom != null || e.target.dataset.vbUser != null) { e.preventDefault(); save(); }
  });
  box.addEventListener("click", async (e) => {
    const act = e.target.closest("[data-vb-act]")?.dataset.vbAct;
    const delName = e.target.closest("[data-vb-del]")?.dataset.vbDel;
    if (st.busy) return;
    if (act === "save") { await save(); return; }
    if (act === "add") {
      const inp = box.querySelector("[data-vb-new]");
      const name = String(inp?.value || "").replace(/\s+/g, " ").trim();
      if (!name) { inp?.focus(); return; }
      if (st.book.vendors.some((v) => vendorKey(v.name) === vendorKey(name))) { note(`${name}: 이미 있음`, "bad"); return; }
      const res = await call({ action: "vendorEdit", ops: [{ op: "add", name }] }, `${name} 추가됨`);
      if (res) { const fresh = box.querySelector("[data-vb-new]"); if (fresh) fresh.value = ""; }
      return;
    }
    if (delName) {
      const k = vendorKey(delName);
      if (st.pendingDel !== k) {
        st.pendingDel = k; render();
        window.clearTimeout(st.delTimer);
        st.delTimer = window.setTimeout(() => { if (st.pendingDel === k) { st.pendingDel = ""; render(); } }, 3000);
        return;
      }
      st.pendingDel = "";
      for (const key of [...st.dirty.keys()]) if (key.endsWith(`:${k}`)) st.dirty.delete(key);
      await call({ action: "vendorEdit", ops: [{ op: "del", name: delName }] }, `${delName} 삭제됨`);
    }
  });
  // 주문서를 올리면 (vendorOrder) 그 업체들 사용 기록 · 새 업체 자동 추가
  window.addEventListener(VENDOR_USED_EVENT, (e) => {
    const names = (e.detail?.names || []).filter(Boolean);
    if (names.length && isLive()) call({ action: "vendorUse", names });
  });
  render();
  return { load, state: st };
}
