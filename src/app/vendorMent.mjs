// 📦 거래처 › 전체 멘트 (2026-11-11)
//  · 기본 멘트를 적고 [전체 적용] → 모든 슬롯의 '보낼 답변' 칸에 붙음 (보내지는 않음 — 슬롯 [↵ 보내기] 를 누를 때 같이 감)
//  · 다시 적용하면 앞서 붙인 멘트만 새 멘트로 바뀜 (칸에 직접 쓴 글은 그대로)
//  · 상황별 멘트 저장 슬롯 3개 (💾 저장 · 누르면 불러오기) · 최근 적용한 멘트 5개 · 입력란은 다음에 열어도 그대로
//  · 이 PC 브라우저에만 저장 (시트로 보내지 않음)
//  · 11-11 위 버튼 줄(슬롯 설정 포함) · 주문서 올리기 + 전체 멘트 줄은 카톡 슬롯들 오른쪽 끝보다 길어지지 않음 (더 넓히면 오른쪽 여백만)
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const KEY = "system_v3_cs_vendor_ment";
export const MENT_SAVED = 3;
export const MENT_RECENT = 5;

// 칸 글 + 앞서 붙인 멘트(prev) → 새 멘트(next)
export function mergeMent(current = "", prev = "", next = "") {
  const cur = String(current || "");
  const nx = String(next || "").trim();
  if (prev && cur.includes(prev)) return cur.replace(prev, nx).replace(/\n{3,}/g, "\n\n").replace(/^\n+|\n+$/g, "");
  if (!nx) return cur;
  const body = cur.replace(/\s+$/, "");
  return body ? `${body}\n${nx}` : nx;
}
export function pushRecent(list = [], text = "") {
  const t = String(text || "").trim();
  if (!t) return list.slice(0, MENT_RECENT);
  return [t, ...list.filter((x) => x !== t)].slice(0, MENT_RECENT);
}
const preview = (t, n = 12) => { const s = String(t || "").replace(/\s+/g, " ").trim(); return s.length > n ? `${s.slice(0, n)}…` : s; };

export function mountVendorMent({ document, window, storage, root, slotsRoot } = {}) {
  if (!root) return null;
  let saved = {};
  try { saved = JSON.parse(storage?.getItem(KEY) || "{}") || {}; } catch { saved = {}; }
  const st = {
    text: typeof saved.text === "string" ? saved.text : "",
    slots: Array.from({ length: MENT_SAVED }, (_, i) => String(saved.slots?.[i] || "")),
    recent: Array.isArray(saved.recent) ? saved.recent.filter((x) => typeof x === "string").slice(0, MENT_RECENT) : [],
  };
  const keep = () => { try { storage?.setItem(KEY, JSON.stringify({ text: st.text, slots: st.slots, recent: st.recent })); } catch { /* 이번 화면만 */ } };
  root.innerHTML = `
    <div class="vm-head">
      <b>💬 전체 멘트</b>
      <span class="vm-slots" data-vm-slots></span>
      <select class="vm-recent" data-vm-recent aria-label="최근 적용한 멘트"></select>
    </div>
    <div class="vm-body">
      <textarea data-vm-text rows="3" placeholder="기본 멘트를 적고 [전체 적용] — 모든 슬롯 '보낼 답변' 칸에 붙습니다 (↵ 보내기 때 같이 감)"></textarea>
      <button type="button" class="cs-btn cs-btn-primary vm-apply" data-vm-act="apply">전체 적용</button>
    </div>
    <small class="vm-msg" data-vm-msg></small>`;
  const $ = (s) => root.querySelector(s);
  const ta = $("[data-vm-text]");
  ta.value = st.text;
  const msg = (t, tone = "") => { const el = $("[data-vm-msg]"); el.textContent = t; el.className = `vm-msg ${tone}`; };

  function paint() {
    $("[data-vm-slots]").innerHTML = st.slots.map((t, i) => `<span class="vm-slot${t ? "" : " is-empty"}"><button type="button" data-vm-load="${i}" title="${esc(t || "비어 있음 — 💾 로 지금 입력란 멘트를 저장")}">${i + 1}${t ? ` ${esc(preview(t))}` : " (빈칸)"}</button><button type="button" class="vm-save" data-vm-save="${i}" title="지금 입력란 멘트를 ${i + 1}번에 저장">💾</button></span>`).join("");
    $("[data-vm-recent]").innerHTML = `<option value="">최근 적용 ${st.recent.length ? `(${st.recent.length})` : "— 없음"}</option>` + st.recent.map((t, i) => `<option value="${i}">${esc(preview(t, 30))}</option>`).join("");
  }
  function apply() {
    const next = ta.value.trim();
    const boxes = [...(slotsRoot || document).querySelectorAll("[data-msn-text]")];
    if (!boxes.length) { msg("슬롯이 없습니다", "is-bad"); return; }
    for (const box of boxes) {
      box.value = mergeMent(box.value, box.dataset.vmApplied || "", next);
      if (next) box.dataset.vmApplied = next; else delete box.dataset.vmApplied;
    }
    if (next) { st.recent = pushRecent(st.recent, next); }
    st.text = ta.value; keep(); paint();
    msg(next ? `슬롯 ${boxes.length}개 '보낼 답변' 칸에 붙였습니다 — 슬롯 [↵ 보내기] 때 같이 갑니다` : `슬롯 ${boxes.length}개에서 붙였던 멘트를 뺐습니다`, "is-ok");
  }
  root.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.vmAct === "apply") apply();
    else if (b.dataset.vmLoad != null) {
      const t = st.slots[Number(b.dataset.vmLoad)];
      if (!t) { msg(`${Number(b.dataset.vmLoad) + 1}번은 비어 있습니다 — 입력란에 쓰고 💾 로 저장`, "is-bad"); return; }
      ta.value = t; st.text = t; keep(); msg(`${Number(b.dataset.vmLoad) + 1}번 멘트를 불러왔습니다 — [전체 적용]으로 붙이기`);
    } else if (b.dataset.vmSave != null) {
      const i = Number(b.dataset.vmSave);
      st.slots[i] = ta.value.trim(); keep(); paint();
      msg(st.slots[i] ? `${i + 1}번에 저장했습니다` : `${i + 1}번을 비웠습니다`, "is-ok");
    }
  });
  $("[data-vm-recent]").addEventListener("change", (e) => {
    const t = st.recent[Number(e.target.value)];
    if (t != null && e.target.value !== "") { ta.value = t; st.text = t; keep(); msg("최근 멘트를 불러왔습니다 — [전체 적용]으로 붙이기"); }
    e.target.value = "";
  });
  ta.addEventListener("input", () => { st.text = ta.value; keep(); });
  paint();

  // 줄 폭 = 슬롯들 오른쪽 끝까지 (슬롯 칸은 배율 보정이 따로 있어 화면에서 재서 맞춤)
  const row = root.closest(".vo-row");
  const bars = [slotsRoot?.querySelector(".cs-answer-top"), row].filter(Boolean);
  const slotsBox = slotsRoot?.querySelector("[data-msn-slots]");
  function fit() {
    if (!row || !slotsBox) return;
    const slots = [...slotsBox.querySelectorAll(".msn-slot")];
    if (!slots.length || !row.getBoundingClientRect().width) return;            // 탭이 숨어 있으면 다음에
    const box = slotsBox.getBoundingClientRect();
    const right = Math.min(box.right, Math.max(...slots.map((s) => s.getBoundingClientRect().right)));
    for (const el of bars) {
      el.style.maxWidth = "";
      const r = el.getBoundingClientRect();
      const z = r.width / (el.offsetWidth || r.width);   // 이 줄의 화면 배율
      el.style.maxWidth = `${Math.max(320, Math.round((right - r.left) / z))}px`;
      const over = Math.max(0, ...[...el.querySelectorAll("*")].filter((c) => c.offsetParent !== null).map((c) => c.getBoundingClientRect().right)) - right;   // 안쪽 여백만큼 더 나간 것
      if (over > 1) el.style.maxWidth = `${Math.max(320, Math.round((right - r.left - over) / z))}px`;
    }
  }
  if (row && slotsBox) {
    const RO = window.ResizeObserver, MO = window.MutationObserver;
    if (RO) new RO(() => fit()).observe(slotsBox);
    if (MO) new MO(() => fit()).observe(slotsBox, { childList: true, attributes: true, attributeFilter: ["style"] });
    window.addEventListener("resize", fit);
    fit();
  }
  return { apply, fit, state: st };
}
