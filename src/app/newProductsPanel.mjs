// 🆕 상품 관리 › 신상품 등록 (2026-11-10) — 구글시트 '업데이트 list' › '업데이트 순서' 탭과 동기화
//  · 시트는 정보만 (CS 시트 v17 newList · newSave · newAdd) — 화면 모양은 여기서
//  · 칸 값을 누르면 고치기 → [저장] (Ctrl+Enter) · [취소] (Esc). 시트에서 먼저 바뀐 칸이면 쓰지 않고 새 값을 보여 줌
//  · 🤖 Claude: 그 줄 정보를 복사하고 Claude 대화를 엶 (주소는 ⚙ 에서 바꿈 — 이 기기에만 저장)
//  · 비밀번호는 CS 관리 화면과 같은 것 (이 브라우저에 한 번 넣으면 같이 씀)
import { CS_BOARD_ENDPOINT, CS_BOARD_STORAGE_KEY, isCsBoardTokenValid } from "../domain/csBoard.mjs?v=20261105-point1";
import { ADD_FIELDS, CLAUDE_URL_DEFAULT, COL, MAIN_FIELDS, MULTILINE, STEPS, claudeLink, claudePrompt, colName, filterRows, isHtml, labelOf, preview, stepsOf } from "../domain/newProducts.mjs?v=20261110-new1";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const URL_KEY = "system_v3_new_claude_url";

export function mountNewProducts({ document, window, root, storages = [], fetchImpl = (...a) => window.fetch(...a), navigator = window.navigator } = {}) {
  if (!root) return null;
  const st = { rows: [], labels: [], sheetUrl: "", loaded: false, loading: false, error: "", q: "", todo: false, open: new Set(), edit: null, saving: false, adding: false, note: "", claudeUrl: "" };
  for (const s of storages) { try { const v = s?.getItem?.(URL_KEY); if (v) { st.claudeUrl = v; break; } } catch { /* 없음 */ } }

  const token = () => {
    for (const s of storages) {
      try { const raw = JSON.parse(s?.getItem?.(CS_BOARD_STORAGE_KEY) || "null"); if (raw && isCsBoardTokenValid(raw.token)) return { token: String(raw.token).trim(), editor: String(raw.editor || "").slice(0, 20) }; } catch { /* 다음 */ }
    }
    return null;
  };
  async function post(body) {
    const t = token();
    if (!t) throw new Error("이 브라우저가 CS 시트에 연결되어 있지 않습니다 — CS 관리에서 한 번 연결해 주세요");
    const res = await fetchImpl(CS_BOARD_ENDPOINT, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ ...body, token: t.token, editor: t.editor }) });
    if (!res.ok) throw new Error(`시트 응답 오류 (${res.status})`);
    const js = await res.json();
    if (js?.denied) throw new Error("비밀번호가 맞지 않습니다");
    return js;
  }

  root.innerHTML = `
    <div class="np-bar">
      <input type="search" class="np-q" data-np-q placeholder="찾기 — 제품폴더 · 제품명 · 매입처 · 코드 · 메모 (띄어쓰기로 여러 낱말)" aria-label="찾기">
      <span class="np-seg" role="group" aria-label="보기"><button type="button" data-np-todo="0" class="is-on">전체</button><button type="button" data-np-todo="1">등록 안 끝남</button></span>
      <span class="np-flex"></span>
      <button type="button" class="np-btn np-btn-main" data-np-add>＋ 새 상품</button>
      <button type="button" class="np-btn" data-np-reload>⟳ 새로고침</button>
      <a class="np-btn" data-np-sheet target="_blank" rel="noopener">시트 열기 ↗</a>
      <button type="button" class="np-btn np-btn-ghost" data-np-cfg title="🤖 Claude 연결 주소">⚙</button>
    </div>
    <div class="np-cfg" data-np-cfgbox hidden>
      <label>🤖 Claude 연결 주소 <input type="url" data-np-url placeholder="${CLAUDE_URL_DEFAULT}" spellcheck="false"></label>
      <small>비워 두면 새 대화를 열고 그 줄 정보를 미리 넣습니다. 쓰던 대화·프로젝트 주소를 넣으면 그 주소를 열고 정보는 복사만 합니다 (붙여넣기). 이 기기에만 저장.</small>
      <button type="button" class="np-btn" data-np-urlsave>저장</button>
    </div>
    <p class="np-msg" data-np-msg></p>
    <div class="np-addbox" data-np-addbox hidden></div>
    <div class="np-list" data-np-list></div>`;
  const $ = (s) => root.querySelector(s);
  const msg = (t, tone = "") => { const el = $("[data-np-msg]"); el.textContent = t || ""; el.className = `np-msg ${tone}`; };

  async function load() {
    if (st.loading) return;
    st.loading = true; st.error = ""; render();
    try {
      const js = await post({ action: "newList" });
      if (!js.ok) throw new Error(/알 수 없는 요청/.test(js.error || "") ? "CS 시트가 아직 신상품 등록(v17) 전입니다 — 시트 새 버전 배포 뒤 다시" : js.error || "시트 오류");
      st.rows = js.rows || []; st.labels = js.labels || []; st.sheetUrl = js.sheetUrl || ""; st.loaded = true;
    } catch (error) {
      st.error = error?.message || String(error);
    }
    st.loading = false; render();
  }

  // ---------- 고치기 ----------
  async function saveEdit() {
    const e = st.edit;
    if (!e || st.saving) return;
    const box = root.querySelector("[data-np-editval]");
    const value = box ? box.value : e.value;
    const row = st.rows.find((x) => x.r === e.r);
    if (!row) { st.edit = null; render(); return; }
    if (value === row.cells[e.c]) { st.edit = null; render(); return; }
    st.saving = true; render();
    try {
      const js = await post({ action: "newSave", r: e.r, c: e.c, expect: row.cells[e.c], value });
      if (js.ok) { row.cells[e.c] = js.value; st.edit = null; msg(`${colName(e.c)}${e.r} 저장했습니다`, "is-ok"); }
      else if (js.conflict) { row.cells[e.c] = js.current; st.edit = { ...e, value }; msg(`⚠ ${colName(e.c)}${e.r} — 시트에서 먼저 바뀌었습니다. 시트 값을 보여 드립니다 (내가 쓴 글은 입력 칸에 그대로 · 다시 [저장]하면 덮어씀)`, "is-bad"); }
      else msg(`⚠ ${js.error || "저장 못 함"}`, "is-bad");
    } catch (error) {
      msg(`⚠ ${error?.message || error}`, "is-bad");
    }
    st.saving = false; render();
    if (st.edit) root.querySelector("[data-np-editval]")?.focus();
  }

  async function addRow() {
    if (st.adding) return;
    const cells = {};
    root.querySelectorAll("[data-np-new]").forEach((el) => { if (el.value.trim()) cells[el.dataset.npNew] = el.value; });
    if (!Object.keys(cells).length) { msg("⚠ 넣을 내용이 없습니다", "is-bad"); return; }
    st.adding = true; render();
    try {
      const js = await post({ action: "newAdd", cells });
      if (!js.ok) throw new Error(js.error || "추가 못 함");
      msg(`시트 ${js.r}줄에 새 상품을 넣었습니다`, "is-ok");
      $("[data-np-addbox]").hidden = true;
      st.adding = false;
      await load();
      st.open.add(js.r); render();
      return;
    } catch (error) {
      msg(`⚠ ${error?.message || error}`, "is-bad");
    }
    st.adding = false; render();
  }

  async function toClaude(r) {
    const row = st.rows.find((x) => x.r === r);
    if (!row) return;
    const prompt = claudePrompt(row, st.labels);
    try { await navigator.clipboard?.writeText(prompt); } catch { /* 복사 못 해도 엶 */ }
    window.open(claudeLink(st.claudeUrl, prompt), "_blank", "noopener");
    msg(`🤖 ${r}줄 정보를 복사하고 Claude 를 열었습니다${st.claudeUrl ? " — 대화 칸에 붙여넣기(Ctrl+V)" : ""}`, "is-ok");
  }

  // ---------- 그리기 ----------
  const fieldHtml = (row, c) => {
    const v = String(row.cells[c] ?? "");
    const label = labelOf(st.labels, c);
    const formula = (row.formulas || []).includes(c);
    const editing = st.edit && st.edit.r === row.r && st.edit.c === c;
    if (editing) {
      const multi = MULTILINE.has(c) || v.includes("\n") || v.length > 60;
      const val = st.edit.value ?? v;
      return `<div class="np-f is-edit"><span class="np-k">${esc(label)} <small>${colName(c)}</small></span>
        ${multi ? `<textarea class="np-in" data-np-editval rows="${Math.min(12, Math.max(3, val.split("\n").length + 1))}">${esc(val)}</textarea>` : `<input class="np-in" data-np-editval value="${esc(val)}">`}
        <span class="np-editbtns"><button type="button" class="np-btn np-btn-main" data-np-save ${st.saving ? "disabled" : ""}>${st.saving ? "저장 중…" : "저장"}</button><button type="button" class="np-btn" data-np-cancel>취소</button></span></div>`;
    }
    const shown = v.trim() ? esc(preview(v, MULTILINE.has(c) ? 400 : 160)) : '<i class="np-empty">비어 있음</i>';
    return `<div class="np-f${MULTILINE.has(c) ? " is-multi" : ""}"><span class="np-k">${esc(label)} <small>${colName(c)}</small></span>
      ${formula ? `<span class="np-v is-formula" title="수식 칸 — 시트에서 직접">${shown}</span>` : `<button type="button" class="np-v" data-np-edit="${row.r}:${c}" title="눌러서 고치기">${shown}</button>`}</div>`;
  };
  const cardHtml = (row) => {
    const c = row.cells;
    const steps = stepsOf(c);
    const open = st.open.has(row.r);
    const rest = c.map((_, i) => i).filter((i) => i >= 1 && !MAIN_FIELDS.includes(i) && ![COL.folder, COL.vendor, COL.sellpia, COL.own].includes(i) && !STEPS.some((s) => s.c === i));
    const codes = [[COL.sellpia, "셀피아"], [COL.own, "자사"]].filter(([i]) => String(c[i] || "").trim() && !isHtml(c[i])).map(([i, k]) => `<span class="np-chip">${k} ${esc(c[i])}</span>`).join("");
    return `<article class="np-card${steps.every((s) => s.done) ? " is-done" : ""}">
      <header class="np-head">
        <span class="np-row">${row.r}줄</span>
        <button type="button" class="np-folder" data-np-edit="${row.r}:${COL.folder}" title="제품폴더 고치기">${esc(String(c[COL.folder] || "").trim() || "(제품폴더 없음)")}</button>
        ${String(c[COL.vendor] || "").trim() ? `<span class="np-chip is-vendor">${esc(c[COL.vendor])}</span>` : ""}${codes}
        <span class="np-flex"></span>
        <span class="np-steps">${steps.map((s) => `<span class="np-step${s.done ? " is-done" : ""}" title="${esc(s.label)} ${s.done ? "끝" : "아직"}">${s.done ? "✓" : "·"} ${esc(s.label)}</span>`).join("")}</span>
        <button type="button" class="np-btn np-btn-ai" data-np-claude="${row.r}" title="이 줄 정보를 복사하고 Claude 대화를 엶">🤖 Claude</button>
      </header>
      ${st.edit && st.edit.r === row.r && st.edit.c === COL.folder ? `<div class="np-grid">${fieldHtml(row, COL.folder)}</div>` : ""}
      <div class="np-grid">${MAIN_FIELDS.map((i) => fieldHtml(row, i)).join("")}</div>
      <button type="button" class="np-more" data-np-open="${row.r}">${open ? "▴ 나머지 칸 접기" : `▾ 나머지 칸 ${rest.length + STEPS.length}개`}</button>
      ${open ? `<div class="np-grid is-rest">${[...rest, ...STEPS.map((s) => s.c)].map((i) => fieldHtml(row, i)).join("")}</div>` : ""}
    </article>`;
  };
  function render() {
    root.querySelectorAll("[data-np-todo]").forEach((b) => b.classList.toggle("is-on", (b.dataset.npTodo === "1") === st.todo));
    const sheet = $("[data-np-sheet]");
    if (st.sheetUrl) sheet.href = st.sheetUrl; else sheet.removeAttribute("href");
    $("[data-np-reload]").disabled = st.loading;
    $("[data-np-add]").disabled = !st.loaded;
    const list = $("[data-np-list]");
    if (st.error) { list.innerHTML = `<p class="np-empty-msg is-bad">${esc(st.error)}</p>`; return; }
    if (!st.loaded) { list.innerHTML = `<p class="np-empty-msg">${st.loading ? "시트 읽는 중…" : "[⟳ 새로고침]을 누르면 시트를 읽습니다."}</p>`; return; }
    const rows = filterRows(st.rows, { q: st.q, todo: st.todo });
    const done = st.rows.filter((r) => stepsOf(r.cells).every((s) => s.done)).length;
    list.innerHTML = `<p class="np-count">업데이트 순서 ${st.rows.length}줄 · 등록 끝 ${done} · 안 끝남 ${st.rows.length - done}${rows.length !== st.rows.length ? ` · 찾은 것 ${rows.length}` : ""}${st.loading ? " · 다시 읽는 중…" : ""}</p>`
      + (rows.length ? rows.map(cardHtml).join("") : '<p class="np-empty-msg">맞는 줄이 없습니다.</p>');
  }
  function renderAdd() {
    const box = $("[data-np-addbox]");
    box.innerHTML = `<b>＋ 새 상품</b> <small>시트 맨 아래 빈 줄에 넣습니다 (다른 칸은 시트에서)</small>
      <div class="np-grid">${ADD_FIELDS.map((c) => `<label class="np-f"><span class="np-k">${esc(labelOf(st.labels, c))} <small>${colName(c)}</small></span>${MULTILINE.has(c) ? `<textarea class="np-in" rows="3" data-np-new="${c}"></textarea>` : `<input class="np-in" data-np-new="${c}">`}</label>`).join("")}</div>
      <span class="np-editbtns"><button type="button" class="np-btn np-btn-main" data-np-addgo>시트에 넣기</button><button type="button" class="np-btn" data-np-addcancel>취소</button></span>`;
  }

  // ---------- 누르기 ----------
  root.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.npEdit) {
      const [r, c] = b.dataset.npEdit.split(":").map(Number);
      const row = st.rows.find((x) => x.r === r);
      st.edit = { r, c, value: row ? row.cells[c] : "" }; render();
      const box = root.querySelector("[data-np-editval]"); box?.focus(); box?.setSelectionRange?.(box.value.length, box.value.length);
    } else if (b.matches("[data-np-save]")) saveEdit();
    else if (b.matches("[data-np-cancel]")) { st.edit = null; render(); }
    else if (b.dataset.npOpen) { const r = Number(b.dataset.npOpen); if (st.open.has(r)) st.open.delete(r); else st.open.add(r); render(); }
    else if (b.dataset.npClaude) toClaude(Number(b.dataset.npClaude));
    else if (b.dataset.npTodo) { st.todo = b.dataset.npTodo === "1"; render(); }
    else if (b.matches("[data-np-reload]")) load();
    else if (b.matches("[data-np-add]")) { renderAdd(); $("[data-np-addbox]").hidden = false; root.querySelector("[data-np-new]")?.focus(); }
    else if (b.matches("[data-np-addgo]")) addRow();
    else if (b.matches("[data-np-addcancel]")) $("[data-np-addbox]").hidden = true;
    else if (b.matches("[data-np-cfg]")) { const box = $("[data-np-cfgbox]"); box.hidden = !box.hidden; $("[data-np-url]").value = st.claudeUrl; }
    else if (b.matches("[data-np-urlsave]")) {
      const v = $("[data-np-url]").value.trim();
      st.claudeUrl = /^https:\/\//.test(v) ? v : "";
      for (const s of storages) { try { if (st.claudeUrl) s?.setItem?.(URL_KEY, st.claudeUrl); else s?.removeItem?.(URL_KEY); } catch { /* 이번만 */ } }
      $("[data-np-cfgbox]").hidden = true;
      msg(st.claudeUrl ? "🤖 Claude 주소를 저장했습니다" : "🤖 새 대화로 엽니다", "is-ok");
    }
  });
  root.addEventListener("keydown", (e) => {
    if (e.target.matches?.("[data-np-editval]")) {
      if (e.key === "Escape") { st.edit = null; render(); }
      else if (e.key === "Enter" && (e.ctrlKey || e.metaKey || e.target.tagName === "INPUT")) { e.preventDefault(); saveEdit(); }
    }
  });
  root.addEventListener("input", (e) => {
    if (e.target.matches?.("[data-np-q]")) { st.q = e.target.value; render(); }
    else if (e.target.matches?.("[data-np-editval]") && st.edit) st.edit.value = e.target.value;
  });

  render();
  // 탭을 처음 열 때 읽음
  const panel = root.closest("[data-purchase-panel]");
  const onPanel = () => { if (panel && !panel.hidden && !st.loaded && !st.loading && !st.error) load(); };
  onPanel();
  if (panel && window.MutationObserver) new window.MutationObserver(onPanel).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  return { state: st, load, saveEdit, addRow, toClaude };
}

if (typeof document !== "undefined" && document.querySelector("[data-new-products]")) {
  const safe = (k) => { try { return window[k]; } catch { return null; } };
  mountNewProducts({ document, window, root: document.querySelector("[data-new-products]"), storages: [safe("localStorage"), safe("sessionStorage")] });
}
