// 💬 CS 관리 › 상담톡 (2026-11-11) — 위: 스마트스토어 톡톡 · 아래: 카카오 해피톡 (CS 시트 v20 '상담톡' 탭)
//  · 구역마다 [대화 목록 | 2층 슬롯 4/6/8/10 | 고른 슬롯의 보조내용]
//  · 슬롯 아래 << AI >> — AI 한 번에 답변 후보 5개 새로, << >> 로 앞뒤 · 후보는 입력창에 (고쳐 쓸 수 있음)
//  · 보내기는 사람이: 📋 복사 → 매체 창에 붙여넣고 전송 (자동 전송 없음)
//  · 수집기 PC 가 대화를 넣기 전에는 예시 대화로 화면만 보여 줌
//  · 11-11 보조내용에 상담 상품 카드 (사진 · 상품명 · 옵션 · 주문) — 톡톡 오른쪽 상품 정보를 수집기가 읽어 옴 (시트 v21)
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const CHAT_SLOT_CHOICES = [4, 6, 8, 10];
export const CHAT_ZONES = [
  { key: "smart", title: "스마트스토어 톡톡", icon: "N", auxTitle: "스마트요약 · 구매이력" },
  { key: "kakao", title: "카카오 해피톡", icon: "K", auxTitle: "고객정보" },
];
const STORE_KEY = "system_v3_chat_talk";
const REFRESH_MS = 20000;

// 예시 대화 — 이름·내용 모두 지어낸 것 (실제 고객 아님)
export const CHAT_SAMPLE = {
  smart: [
    { id: "ex-s1", name: "예시고객1", tag: "사이즈 문의", time: "오후 3:26", unread: 2, messages: [
      { who: "c", text: "볼사이즈 2mm 있었는데 없어졌나요?", time: "오후 3:26" },
      { who: "c", text: "2mm 로 사고 싶어요", time: "오후 3:26" }],
      aux: { title: "구매이력", items: [{ img: "", name: "14K 미니 골드볼 피어싱", option: "볼 3mm / 골드", price: "16,500원", status: "배송완료", order: "예시-0001" }], lines: ["11-02 14K 미니 골드볼 피어싱 · 1개 · 배송완료", "10-15 써지컬 링 6mm · 2개 · 구매확정"] } },
    { id: "ex-s2", name: "예시고객2", tag: "배송 문의", time: "오후 2:10", unread: 1, messages: [
      { who: "c", text: "어제 주문했는데 언제 출고되나요?", time: "오후 2:10" }],
      aux: { title: "구매이력", items: [{ img: "", name: "실버 체인 귀걸이", option: "5cm", price: "12,900원", status: "발송준비", order: "예시-0002" }], lines: ["11-10 실버 체인 귀걸이 · 1개 · 발송준비"] } },
    { id: "ex-s3", name: "예시고객3", tag: "교환", time: "오전 11:42", unread: 0, messages: [
      { who: "c", text: "링 사이즈가 커서 교환하고 싶습니다", time: "오전 11:40" },
      { who: "s", text: "고객님 안녕하세요, 교환 접수 도와드리겠습니다.", time: "오전 11:41" },
      { who: "c", text: "8mm 로 바꿀 수 있을까요?", time: "오전 11:42" }],
      aux: { title: "구매이력", lines: ["11-05 14K 원터치 링 10mm · 1개 · 배송완료"] } },
    { id: "ex-s4", name: "예시고객4", tag: "재고", time: "오전 10:05", unread: 0, messages: [
      { who: "c", text: "로즈골드 색상 재입고 예정 있나요?", time: "오전 10:05" }], aux: { title: "구매이력", lines: [] } },
  ],
  kakao: [
    { id: "ex-k1", name: "예시카톡1", tag: "주문 확인", time: "오후 4:01", unread: 1, messages: [
      { who: "c", text: "주문번호 확인 부탁드려요. 입금했어요", time: "오후 4:01" }],
      aux: { title: "고객정보", lines: ["상담 3회 · 최근 11-08", "메모: 단골"] } },
    { id: "ex-k2", name: "예시카톡2", tag: "불량", time: "오후 1:22", unread: 0, messages: [
      { who: "c", text: "받았는데 침이 휘어 있어요", time: "오후 1:20" },
      { who: "s", text: "불편을 드려 죄송합니다. 사진 한 장 보내 주시겠어요?", time: "오후 1:21" },
      { who: "c", text: "(사진)", time: "오후 1:22" }],
      aux: { title: "고객정보", lines: ["상담 1회"] } },
    { id: "ex-k3", name: "예시카톡3", tag: "선물 포장", time: "오전 9:48", unread: 0, messages: [
      { who: "c", text: "선물 포장 되나요?", time: "오전 9:48" }], aux: { title: "고객정보", lines: [] } },
  ],
};

const readStore = (window) => { try { return JSON.parse(window?.localStorage?.getItem(STORE_KEY) || "{}") || {}; } catch { return {}; } };
const writeStore = (window, v) => { try { window?.localStorage?.setItem(STORE_KEY, JSON.stringify(v)); } catch { /* 저장 못 해도 화면은 그대로 */ } };

// 슬롯 채우기: 남겨 둔 대화는 그 자리에, 빈 자리는 목록 위(안 읽음 · 최근)부터
export function fillSlots(prev = [], convs = [], count = 4) {
  const ids = new Set(convs.map((c) => c.id));
  const slots = Array.from({ length: count }, (_, i) => (prev[i] && ids.has(prev[i]) ? prev[i] : ""));
  const used = new Set(slots.filter(Boolean));
  const order = [...convs].sort((a, b) => (b.unread > 0) - (a.unread > 0));
  for (let i = 0; i < slots.length; i++) {
    if (slots[i]) continue;
    const next = order.find((c) => !used.has(c.id));
    if (!next) break;
    slots[i] = next.id; used.add(next.id);
  }
  return slots;
}
// 후보 앞뒤 (끝에서 돌아감)
export const stepIndex = (idx, len, d) => (len ? (((idx + d) % len) + len) % len : 0);

export function mountChatTalk({ document, window, root, side, post, isLive = () => true, clipboard } = {}) {
  if (!root) return null;
  const saved = readStore(window);
  const st = {
    data: { smart: [], kakao: [] }, sample: true, loaded: false, loading: false, error: "",
    counts: { smart: CHAT_SLOT_CHOICES.includes(saved.counts?.smart) ? saved.counts.smart : 4, kakao: CHAT_SLOT_CHOICES.includes(saved.counts?.kakao) ? saved.counts.kakao : 4 },
    slots: { smart: saved.slots?.smart || [], kakao: saved.slots?.kakao || [] },
    selected: { smart: "", kakao: "" },
    ai: new Map(),       // `${zone}:${id}` → { list: [], idx, busy, error }
    drafts: new Map(),   // `${zone}:${id}` → 입력창 글
    timer: 0,
  };
  const keyOf = (zone, id) => `${zone}:${id}`;
  const remember = () => writeStore(window, { counts: st.counts, slots: st.slots });

  if (side) side.innerHTML = `
    <fieldset class="cs-box ct-side">
      <legend>💬 상담톡</legend>
      <ol class="cs-note cs-install-steps">
        <li>위는 <b>스마트스토어 톡톡</b>, 아래는 <b>카카오 해피톡</b>. 구역마다 슬롯 수(4·6·8·10)를 고릅니다.</li>
        <li>왼쪽 목록에서 대화를 누르면 고른 슬롯에 열립니다. 슬롯을 누르면 오른쪽에 보조내용이 뜹니다.</li>
        <li><b>AI</b> 를 누를 때마다 답변 후보 5개를 새로 만들고, <b>&lt;&lt; &gt;&gt;</b> 로 앞뒤를 봅니다.</li>
        <li>후보는 입력창에서 고쳐 쓴 뒤 <b>📋 복사</b> → 매체 창에 붙여넣고 직접 전송합니다.</li>
        <li>대화는 수집기 PC 가 읽어 옵니다 (연결 전에는 예시 대화).</li>
      </ol>
    </fieldset>`;

  root.innerHTML = `
    <p class="ct-msg" data-ct-msg></p>
    ${CHAT_ZONES.map((z) => `
    <section class="ct-zone ct-${z.key}" data-ct-zone="${z.key}" aria-label="${esc(z.title)}">
      <aside class="ct-list">
        <header class="ct-list-head"><b class="ct-logo">${z.icon}</b><b>${esc(z.title)}</b><span class="cs-flex"></span><small data-ct-count="${z.key}"></small></header>
        <div class="ct-list-body" data-ct-list="${z.key}"></div>
      </aside>
      <div class="ct-mid">
        <div class="ct-mid-bar">
          <span class="ct-seg" role="group" aria-label="슬롯 수">${CHAT_SLOT_CHOICES.map((n) => `<button type="button" data-ct-n="${n}" data-ct-nzone="${z.key}">${n}</button>`).join("")}</span>
          <small class="ct-hint" data-ct-hint="${z.key}"></small>
          <span class="cs-flex"></span>
          ${z.key === "smart" ? `<button type="button" class="cs-btn ct-reload" data-ct-reload>⟳ 새로고침</button>` : ""}
        </div>
        <div class="ct-slots" data-ct-slots="${z.key}"></div>
      </div>
      <aside class="ct-aux" data-ct-aux="${z.key}"></aside>
    </section>`).join("")}`;
  const $ = (s) => root.querySelector(s);
  const msg = (t, tone = "") => { const el = $("[data-ct-msg]"); el.textContent = t || ""; el.className = `ct-msg ${tone}`; };
  const convOf = (zone, id) => st.data[zone].find((c) => c.id === id);

  async function load() {
    if (st.loading) return;
    if (!isLive()) { useSample(); return; }
    st.loading = true;
    try {
      const js = await post({ action: "chatList" });
      const has = (js.smart?.length || 0) + (js.kakao?.length || 0) > 0;
      if (has) { st.data = { smart: js.smart || [], kakao: js.kakao || [] }; st.sample = false; }
      else useSample(false);
      st.loaded = true; st.error = "";
    } catch (error) {
      st.error = /알 수 없는 요청/.test(error?.message || "") ? "시트가 아직 상담톡(v20) 전입니다 — 예시 대화로 보여 드립니다" : `불러오지 못했습니다: ${error?.message || error}`;
      if (!st.loaded) useSample(false);
    }
    st.loading = false;
    render();
  }
  function useSample(paint = true) {
    st.data = JSON.parse(JSON.stringify(CHAT_SAMPLE)); st.sample = true; st.loaded = true;
    if (paint) render();
  }
  function start() { stop(); st.timer = setInterval(() => { if (!document.hidden && isLive() && root.offsetParent !== null) load(); }, REFRESH_MS); }
  function stop() { clearInterval(st.timer); st.timer = 0; }

  async function suggest(zone, id) {
    const conv = convOf(zone, id);
    if (!conv) return;
    const k = keyOf(zone, id);
    const ai = st.ai.get(k) || { list: [], idx: 0, busy: false, error: "" };
    if (ai.busy) return;
    if (!isLive()) { ai.error = "CS 시트 연결 뒤에 AI 를 쓸 수 있습니다"; st.ai.set(k, ai); paintSlot(zone, id); return; }
    ai.busy = true; ai.error = ""; st.ai.set(k, ai); paintSlot(zone, id);
    try {
      const js = await post({ action: "chatSuggest", platform: zone, name: conv.name, messages: conv.messages, aux: conv.aux, avoid: ai.list, count: 5 });
      const fresh = (js.answers || []).filter((a) => a && !ai.list.includes(a));
      if (fresh.length) { ai.idx = ai.list.length; ai.list.push(...fresh); st.drafts.set(k, ai.list[ai.idx]); }
      else ai.error = "새 후보가 없습니다 — 다시 눌러 주세요";
    } catch (error) { ai.error = /알 수 없는 요청/.test(error?.message || "") ? "시트가 아직 상담톡(v20) 전입니다" : String(error?.message || error); }
    ai.busy = false; paintSlot(zone, id);
  }
  function step(zone, id, d) {
    const k = keyOf(zone, id);
    const ai = st.ai.get(k);
    if (!ai?.list.length) return;
    ai.idx = stepIndex(ai.idx, ai.list.length, d);
    st.drafts.set(k, ai.list[ai.idx]);
    paintSlot(zone, id);
  }
  async function copy(zone, id) {
    const text = st.drafts.get(keyOf(zone, id)) || "";
    if (!text.trim()) { msg("입력창이 비어 있습니다", "is-bad"); return; }
    try { await (clipboard || window.navigator.clipboard).writeText(text); msg("📋 복사했습니다 — 매체 창 입력칸에 붙여넣고 직접 전송하세요", "is-ok"); }
    catch { msg("복사하지 못했습니다 — 입력창 글을 직접 선택해 복사해 주세요", "is-bad"); }
  }
  function openConv(zone, id) {
    const slots = st.slots[zone];
    let at = slots.indexOf(id);
    if (at < 0) {
      at = Math.max(0, slots.indexOf(st.selected[zone]));
      if (!st.selected[zone]) { const empty = slots.indexOf(""); if (empty >= 0) at = empty; }
      slots[at] = id;
    }
    st.selected[zone] = id; remember(); renderZone(zone);
  }

  // ---------- 그리기 ----------
  const safeImg = (u) => (/^https:\/\/[^\s"'<>]+$/.test(String(u || "")) ? String(u) : "");
  const auxItems = (items = []) => (items.length ? `<div class="ct-items">${items.map((it) => `
      <div class="ct-card">
        ${safeImg(it.img) ? `<img src="${esc(safeImg(it.img))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ct-noimg',textContent:'사진 없음'}))">` : `<span class="ct-noimg">사진</span>`}
        <div class="ct-card-main"><b>${esc(it.name || "")}</b>${it.option ? `<small>${esc(it.option)}</small>` : ""}<small>${[it.price, it.status].filter(Boolean).map(esc).join(" · ")}</small>${it.order ? `<small class="ct-order">주문 ${esc(it.order)}</small>` : ""}</div>
      </div>`).join("")}</div>` : "");
  const bubble = (m) => `<div class="ct-b ${m.who === "s" ? "is-me" : "is-cu"}"><p>${esc(m.text)}</p>${m.time ? `<small>${esc(m.time)}</small>` : ""}</div>`;
  function slotHtml(zone, id, i) {
    const conv = convOf(zone, id);
    if (!conv) return `<article class="ct-slot is-empty" data-ct-slot="${i}"><p>빈 슬롯 — 왼쪽 목록에서 대화를 누르세요</p></article>`;
    const k = keyOf(zone, id);
    const ai = st.ai.get(k) || { list: [], idx: 0 };
    const draft = st.drafts.get(k) ?? "";
    return `
      <article class="ct-slot${st.selected[zone] === id ? " is-sel" : ""}" data-ct-slot="${i}" data-ct-id="${esc(id)}">
        <header class="ct-slot-head"><b>${esc(conv.name || "(이름 없음)")}</b>${conv.tag ? `<span class="ct-tag">${esc(conv.tag)}</span>` : ""}<span class="cs-flex"></span><small>${esc(conv.time || "")}</small><button type="button" class="ct-x" data-ct-close title="슬롯 비우기">×</button></header>
        <div class="ct-talk" data-ct-talk>${(conv.messages || []).map(bubble).join("") || `<p class="ct-none">대화 없음</p>`}</div>
        <div class="ct-input">
          <textarea rows="2" data-ct-draft placeholder="AI 를 누르면 답변 후보가 여기에 뜹니다">${esc(draft)}</textarea>
          <button type="button" class="ct-copy" data-ct-copy title="복사 → 매체 창에 붙여넣기">📋</button>
        </div>
        <div class="ct-ai">
          <button type="button" data-ct-prev ${ai.list.length > 1 ? "" : "disabled"} aria-label="앞 후보">&lt;&lt;</button>
          <button type="button" class="ct-ai-go" data-ct-ai ${ai.busy ? "disabled" : ""}>${ai.busy ? "…" : "AI"}</button>
          <button type="button" data-ct-next ${ai.list.length > 1 ? "" : "disabled"} aria-label="뒤 후보">&gt;&gt;</button>
          <small>${ai.error ? `<span class="is-bad">${esc(ai.error)}</span>` : ai.list.length ? `${ai.idx + 1} / ${ai.list.length}` : ""}</small>
        </div>
      </article>`;
  }
  function paintSlot(zone, id) {
    const i = st.slots[zone].indexOf(id);
    const el = root.querySelector(`[data-ct-slots="${zone}"] [data-ct-slot="${i}"]`);
    if (!el) return;
    el.outerHTML = slotHtml(zone, id, i);
    scrollTalks(zone);
  }
  function scrollTalks(zone) { root.querySelectorAll(`[data-ct-slots="${zone}"] [data-ct-talk]`).forEach((t) => { t.scrollTop = t.scrollHeight; }); }
  function renderZone(zone) {
    const z = CHAT_ZONES.find((x) => x.key === zone);
    const convs = st.data[zone] || [];
    const n = st.counts[zone];
    st.slots[zone] = fillSlots(st.slots[zone], convs, n);
    if (st.selected[zone] && !st.slots[zone].includes(st.selected[zone])) st.selected[zone] = "";
    if (!st.selected[zone]) st.selected[zone] = st.slots[zone].find(Boolean) || "";
    root.querySelectorAll(`[data-ct-nzone="${zone}"]`).forEach((b) => b.classList.toggle("is-on", Number(b.dataset.ctN) === n));
    $(`[data-ct-count="${zone}"]`).textContent = `${convs.length}건${convs.some((c) => c.unread) ? ` · 안 읽음 ${convs.filter((c) => c.unread).length}` : ""}`;
    $(`[data-ct-hint="${zone}"]`).textContent = st.sample ? "예시 대화 (수집기 연결 전)" : "";
    $(`[data-ct-list="${zone}"]`).innerHTML = convs.length ? convs.map((c) => `
      <button type="button" class="ct-item${st.slots[zone].includes(c.id) ? " is-open" : ""}${st.selected[zone] === c.id ? " is-sel" : ""}" data-ct-open="${esc(c.id)}">
        <span class="ct-ava">${esc((c.name || "?").slice(0, 1))}</span>
        <span class="ct-item-main"><b>${esc(c.name || "(이름 없음)")}</b><small>${esc(c.preview || c.messages?.[c.messages.length - 1]?.text || "")}</small></span>
        <span class="ct-item-side"><small>${esc(c.time || "")}</small>${c.unread ? `<i>${c.unread}</i>` : ""}</span>
      </button>`).join("") : `<p class="ct-none">대화가 없습니다</p>`;
    const slots = $(`[data-ct-slots="${zone}"]`);
    slots.style.setProperty("--ct-cols", String(n / 2));
    slots.innerHTML = st.slots[zone].map((id, i) => slotHtml(zone, id, i)).join("");
    scrollTalks(zone);
    paintAux(zone);
  }
  function paintAux(zone) {
    const z = CHAT_ZONES.find((x) => x.key === zone);
    const sel = convOf(zone, st.selected[zone]);
    $(`[data-ct-aux="${zone}"]`).innerHTML = `
      <header class="ct-aux-head">${esc(sel?.aux?.title || z.auxTitle)}</header>
      ${sel ? `<p class="ct-aux-name"><b>${esc(sel.name || "")}</b>${sel.tag ? ` · ${esc(sel.tag)}` : ""}</p>
        ${auxItems(sel.aux?.items)}
        ${(sel.aux?.lines || []).length ? `<ul>${sel.aux.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : (sel.aux?.items || []).length ? "" : `<p class="ct-none">보조내용 없음</p>`}`
        : `<p class="ct-none">슬롯을 누르면 여기에 뜹니다</p>`}`;
  }
  function render() {
    msg(st.error, st.error ? "is-bad" : "");
    for (const z of CHAT_ZONES) renderZone(z.key);
  }

  root.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    const zone = e.target.closest("[data-ct-zone]")?.dataset.ctZone;
    if (b?.matches("[data-ct-reload]")) { load(); return; }
    if (!zone) return;
    if (b?.dataset.ctN) { st.counts[zone] = Number(b.dataset.ctN); remember(); renderZone(zone); return; }
    if (b?.dataset.ctOpen) { openConv(zone, b.dataset.ctOpen); return; }
    const slot = e.target.closest("[data-ct-slot]");
    const id = slot?.dataset.ctId;
    if (b?.matches("[data-ct-close]") && slot) { st.slots[zone][Number(slot.dataset.ctSlot)] = ""; if (st.selected[zone] === id) st.selected[zone] = ""; remember(); renderZone(zone); return; }
    if (!id) return;
    if (b?.matches("[data-ct-ai]")) suggest(zone, id);
    else if (b?.matches("[data-ct-prev]")) step(zone, id, -1);
    else if (b?.matches("[data-ct-next]")) step(zone, id, 1);
    else if (b?.matches("[data-ct-copy]")) copy(zone, id);
    if (st.selected[zone] !== id) select(zone, id);
  });
  // 고르기만 — 다시 그리지 않음 (입력창 커서 유지)
  function select(zone, id) {
    st.selected[zone] = id;
    const box = root.querySelector(`[data-ct-zone="${zone}"]`);
    box.querySelectorAll("[data-ct-slot]").forEach((el) => el.classList.toggle("is-sel", el.dataset.ctId === id));
    box.querySelectorAll("[data-ct-open]").forEach((el) => el.classList.toggle("is-sel", el.dataset.ctOpen === id));
    paintAux(zone);
  }
  root.addEventListener("focusin", (e) => {
    const zone = e.target.closest?.("[data-ct-zone]")?.dataset.ctZone;
    const id = e.target.closest?.("[data-ct-slot]")?.dataset.ctId;
    if (zone && id && st.selected[zone] !== id) select(zone, id);
  });
  root.addEventListener("input", (e) => {
    if (!e.target.matches?.("[data-ct-draft]")) return;
    const zone = e.target.closest("[data-ct-zone]")?.dataset.ctZone;
    const id = e.target.closest("[data-ct-slot]")?.dataset.ctId;
    if (zone && id) st.drafts.set(keyOf(zone, id), e.target.value);
  });
  render();
  return { load, start, stop, state: st };
}
