// 🚚 CS 관리 › 배송사진 (2026-11-10) — 드라이브 '5_배송기록' 폴더 (배송 중 찍은 사진 + 동영상)
//  · [▶ 파일 정리 실행]: 확인 안 한 사진을 시트(v16 shipScan)가 6장씩 AI 로 보고, 송장 사진이면 수신자 이름을 파일명 끝에 붙임
//  · 📋 전체 리스트: 시간 순서 그대로 · 송장 사진 = 묶음 시작 → 그 뒤 동영상·사진은 다음 송장 사진 전까지 같은 묶음
//  · 🔎 파일 찾기: 수신자 이름(일부 · 가려진 글자 * ○ 무시)으로 그 묶음만
//  · 둘 다 체크로 고르고 [⬇ 선택 다운로드] (드라이브에서 바로 받음 — 이 화면은 파일을 저장·전송하지 않음)
import { groupShipFiles, searchShipGroups, shipDownloadUrl, shipSizeLabel, shipThumbUrl, shipTimeLabel, shipViewUrl } from "../domain/shipPhotos.mjs?v=20261110-ship4";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const FOLDER_URL = (id) => `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;

export function mountShipPhotos({ document, window, root, side, post, isLive = () => true } = {}) {
  if (!root || !side) return null;
  const st = { files: [], groups: [], unchecked: 0, renamePending: 0, folder: "", loaded: false, loading: false, running: false, stop: false, mode: "all", q: "", picked: new Set(), error: "", note: "" };

  side.innerHTML = `
    <fieldset class="cs-box sp-side">
      <legend>🚚 배송기록</legend>
      <p class="cs-note">드라이브 <a data-sp-folder target="_blank" rel="noopener">'5_배송기록' 폴더</a>의 배송 중 사진·동영상을 시간 순서로 봅니다.</p>
      <div class="cs-row"><button type="button" class="cs-btn cs-btn-primary" data-sp-run>▶ 파일 정리 실행</button><button type="button" class="cs-btn" data-sp-stop hidden>멈춤</button></div>
      <p class="cs-note sp-progress" data-sp-progress></p>
      <ol class="cs-note cs-install-steps">
        <li><b>파일 정리</b>: 아직 확인 안 한 사진을 AI 가 보고 <b>송장 사진</b>이면 받는 분 이름을 <b>파일명 끝</b>에 붙입니다 (예: <code>20261110_143012_홍길동.jpg</code> · 가려진 글자는 ○). 파일은 지우지 않고 순서도 그대로입니다.</li>
        <li><b>묶음</b>: 송장 사진 뒤의 동영상·사진은 다음 송장 사진 전까지 그 수신자 묶음입니다.</li>
        <li><b>파일 찾기</b>: 오른쪽 [🔎 파일 찾기]에서 수신자 이름(일부도 됨)으로.</li>
        <li><b>다운로드</b>: 체크로 고르고 [⬇ 선택 다운로드]. 크롬이 "여러 파일 다운로드"를 물으면 [허용].</li>
      </ol>
      <p class="cs-note sp-counts" data-sp-counts></p>
    </fieldset>`;
  root.innerHTML = `
    <div class="sp-bar">
      <span class="pb-seg sp-seg" role="group" aria-label="보기"><button type="button" data-sp-mode="all" class="is-on">📋 전체 리스트</button><button type="button" data-sp-mode="find">🔎 파일 찾기</button></span>
      <span class="sp-find" data-sp-findbox hidden><input type="search" class="sp-search" data-sp-q placeholder="수신자 이름 (예: 홍길동 · 길동)" aria-label="수신자 이름"><button type="button" class="cs-btn cs-btn-primary" data-sp-go>검색</button></span>
      <span class="cs-flex"></span>
      <button type="button" class="cs-btn" data-sp-all>☑ 보이는 것 전체 선택</button>
      <button type="button" class="cs-btn" data-sp-none>☐ 선택 해제</button>
      <button type="button" class="cs-btn cs-btn-green" data-sp-dl disabled>⬇ 선택 다운로드</button>
      <button type="button" class="cs-btn" data-sp-reload>⟳ 새로고침</button>
    </div>
    <p class="sp-msg" data-sp-msg></p>
    <div class="sp-list" data-sp-list></div>`;
  const $ = (s) => root.querySelector(s) || side.querySelector(s);

  // ---------- 불러오기 · 정리 ----------
  async function load() {
    if (st.loading) return;
    if (!isLive()) { st.error = "CS 시트에 연결하면 보입니다 (🏠 메인보드 맨 위 웹 연결)."; render(); return; }
    st.loading = true; st.error = ""; render();
    try {
      const js = await post({ action: "shipList" });
      st.files = Array.isArray(js.files) ? js.files : [];
      st.unchecked = Number(js.unchecked) || 0;
      st.renamePending = Number(js.renamePending) || 0;
      st.folder = js.folder || "";
      st.groups = groupShipFiles(st.files);
      st.loaded = true;
      const ids = new Set(st.files.map((f) => f.id));
      for (const id of [...st.picked]) if (!ids.has(id)) st.picked.delete(id);
    } catch (error) {
      st.error = /알 수 없는 요청/.test(error?.message || "") ? "시트가 아직 배송사진(v16) 전입니다 — 시트 새 버전 배포 뒤 다시." : `불러오지 못했습니다: ${error?.message || error}`;
    }
    st.loading = false; render();
  }
  async function run() {
    if (st.running || !isLive()) return;
    st.running = true; st.stop = false; render();
    let done = 0, invoices = 0, renamed = 0;
    const errors = [];
    try {
      for (let guard = 0; guard < 500 && !st.stop; guard += 1) {
        const js = await post({ action: "shipScan" });
        done += Number(js.done) || 0;
        const ok = (js.results || []).filter((r) => r.invoice && r.recipient);
        invoices += ok.length;
        renamed += ok.filter((r) => !r.renameError).length + (Number(js.renamed) || 0);
        errors.push(...(js.renameErrors || []));
        st.note = `확인 ${done}장 · 송장 ${invoices}장 · 남은 사진 ${js.remaining ?? 0}장`;
        render();
        if (!js.done || !js.remaining) break;
      }
      st.note = `${st.stop ? "멈춤" : "정리 끝"} — 확인 ${done}장 · 송장 ${invoices}장 · 이름 붙임 ${renamed}장`;
      if (errors.length) st.note += ` · ⚠ 이름 못 바꿈 ${errors.length}장: ${errors[0].error}`;
    } catch (error) {
      st.note = `정리 중 멈춤: ${error?.message || error}`;
    }
    st.running = false;
    await load();
  }

  // ---------- 다운로드 (드라이브에서 바로 · 숨은 창으로 하나씩) ----------
  async function download() {
    const ids = st.files.filter((f) => st.picked.has(f.id)).map((f) => f.id);
    if (!ids.length) return;
    $("[data-sp-dl]").disabled = true;
    for (let i = 0; i < ids.length; i += 1) {
      $("[data-sp-msg]").textContent = `다운로드 ${i + 1} / ${ids.length} …`;
      const frame = document.createElement("iframe");
      frame.hidden = true; frame.src = shipDownloadUrl(ids[i]);
      document.body.appendChild(frame);
      window.setTimeout(() => frame.remove(), 120000);
      await new Promise((ok) => window.setTimeout(ok, 900));
    }
    $("[data-sp-msg]").textContent = `다운로드 ${ids.length}개 요청 — 브라우저 다운로드 폴더를 확인하세요. 안 받아진 파일은 [열기] → 드라이브에서 받기 (100MB 넘는 동영상 등).`;
    $("[data-sp-dl]").disabled = false;
  }

  // ---------- 그리기 ----------
  const tile = (f, isInvoice = false) => `
    <label class="sp-file${isInvoice ? " is-invoice" : ""}${st.picked.has(f.id) ? " is-picked" : ""}">
      <input type="checkbox" data-sp-pick="${esc(f.id)}"${st.picked.has(f.id) ? " checked" : ""} aria-label="${esc(f.name)} 선택">
      <a class="sp-thumb" href="${esc(shipViewUrl(f.id))}" target="_blank" rel="noopener" title="드라이브에서 열기"><img src="${esc(shipThumbUrl(f.id))}" alt="" loading="lazy" referrerpolicy="no-referrer">${f.kind === "video" ? '<span class="sp-play">▶</span>' : ""}${isInvoice ? '<span class="sp-badge">송장</span>' : ""}</a>
      <small class="sp-name" title="${esc(f.name)}">${esc(f.name)}</small>
      <small class="sp-meta">${esc(shipTimeLabel(f.t))}${f.size ? ` · ${esc(shipSizeLabel(f.size))}` : ""}${f.kind === "photo" && !f.checked ? " · 미확인" : ""}</small>
    </label>`;
  function groupHtml(g) {
    const files = [...(g.invoice ? [g.invoice] : []), ...g.items];
    const all = files.length && files.every((f) => st.picked.has(f.id));
    const videos = g.items.filter((f) => f.kind === "video").length, photos = g.items.filter((f) => f.kind === "photo").length;
    return `<section class="sp-group${g.invoice ? "" : " is-before"}">
      <header><input type="checkbox" data-sp-gpick="${esc(g.key)}"${all ? " checked" : ""} aria-label="묶음 전체 선택">
        <b>${g.invoice ? `👤 ${esc(g.recipient)}` : "송장 전 파일"}</b>
        <small>${g.invoice ? esc(shipTimeLabel(g.invoice.t)) + " · " : ""}동영상 ${videos} · 사진 ${photos}</small></header>
      <div class="sp-files">${files.map((f) => tile(f, f === g.invoice)).join("")}</div>
    </section>`;
  }
  const visibleGroups = () => (st.mode === "find" ? (st.q ? searchShipGroups(st.groups, st.q) : []) : st.groups);
  function render() {
    root.querySelectorAll("[data-sp-mode]").forEach((b) => b.classList.toggle("is-on", b.dataset.spMode === st.mode));
    $("[data-sp-findbox]").hidden = st.mode !== "find";
    const live = isLive();
    $("[data-sp-run]").disabled = st.running || !live;
    $("[data-sp-run]").textContent = st.running ? "정리 중…" : "▶ 파일 정리 실행";
    $("[data-sp-stop]").hidden = !st.running;
    $("[data-sp-progress]").textContent = st.note;
    const folder = $("[data-sp-folder]");
    if (st.folder) folder.href = FOLDER_URL(st.folder); else folder.removeAttribute("href");
    const inv = st.groups.filter((g) => g.invoice).length;
    $("[data-sp-counts]").textContent = st.loaded ? `전체 ${st.files.length}개 · 송장 묶음 ${inv}개 · 동영상 ${st.files.filter((f) => f.kind === "video").length}개 · 확인 안 한 사진 ${st.unchecked}장${st.renamePending ? ` · ⚠ 이름 못 붙인 송장 ${st.renamePending}장 ([▶ 파일 정리 실행]으로 다시)` : ""}` : "";
    $("[data-sp-dl]").disabled = !st.picked.size;
    $("[data-sp-dl]").textContent = `⬇ 선택 다운로드${st.picked.size ? ` (${st.picked.size})` : ""}`;
    const list = $("[data-sp-list]");
    if (st.error) { list.innerHTML = `<p class="sp-empty is-bad">${esc(st.error)}</p>`; return; }
    if (st.loading && !st.loaded) { list.innerHTML = '<p class="sp-empty">불러오는 중…</p>'; return; }
    if (!st.loaded) { list.innerHTML = '<p class="sp-empty">[⟳ 새로고침]을 누르면 폴더를 읽습니다.</p>'; return; }
    const groups = visibleGroups();
    if (st.mode === "find" && !st.q) { list.innerHTML = '<p class="sp-empty">수신자 이름을 넣고 [검색] — 송장 사진과 그 뒤 동영상(다음 송장 사진 전까지)이 나옵니다.</p>'; return; }
    list.innerHTML = groups.length ? groups.map(groupHtml).join("") : `<p class="sp-empty">${st.mode === "find" ? `'${esc(st.q)}' 수신자 송장 사진이 없습니다. [▶ 파일 정리 실행]을 먼저 했는지 확인하세요.` : "폴더에 사진·동영상이 없습니다."}</p>`;
  }

  // ---------- 이벤트 ----------
  const groupFiles = (key) => { const g = st.groups.find((x) => x.key === key); return g ? [...(g.invoice ? [g.invoice] : []), ...g.items] : []; };
  side.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    if (b.matches("[data-sp-run]")) run();
    else if (b.matches("[data-sp-stop]")) { st.stop = true; st.note = "이번 묶음까지 하고 멈춥니다…"; render(); }
  });
  root.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    if (b.dataset.spMode) { st.mode = b.dataset.spMode; render(); if (st.mode === "find") $("[data-sp-q]")?.focus(); }
    else if (b.matches("[data-sp-go]")) { st.q = $("[data-sp-q]").value.trim(); render(); }
    else if (b.matches("[data-sp-all]")) { for (const g of visibleGroups()) for (const f of groupFiles(g.key)) st.picked.add(f.id); render(); }
    else if (b.matches("[data-sp-none]")) { st.picked.clear(); render(); }
    else if (b.matches("[data-sp-dl]")) download();
    else if (b.matches("[data-sp-reload]")) load();
  });
  root.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("[data-sp-q]")) { st.q = e.target.value.trim(); render(); } });
  root.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.spPick) { if (t.checked) st.picked.add(t.dataset.spPick); else st.picked.delete(t.dataset.spPick); render(); }
    else if (t.dataset.spGpick) { for (const f of groupFiles(t.dataset.spGpick)) { if (t.checked) st.picked.add(f.id); else st.picked.delete(f.id); } render(); }
  });
  render();
  return { load, run, state: st };
}
