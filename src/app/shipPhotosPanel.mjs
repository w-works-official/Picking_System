// 🚚 CS 관리 › 배송사진 (2026-11-10) — 드라이브 '5_배송기록' 폴더 (배송 중 찍은 사진 + 동영상)
//  · [▶ 파일 정리 실행]: 확인 안 한 사진을 시트(v16 shipScan)가 6장씩 AI 로 보고, 송장 사진이면 수신자 이름을 파일명 끝에 붙임
//  · 📋 전체 리스트: 시간 순서 그대로 · 송장 사진 = 묶음 시작 → 그 뒤 동영상·사진은 다음 송장 사진 전까지 같은 묶음
//  · 🔎 파일 찾기: 수신자 이름(일부 · 가려진 글자 * ○ 무시)으로 그 묶음만
//  · 둘 다 체크로 고르고 [⬇ 선택 다운로드] (드라이브에서 바로 받음 — 이 화면은 파일을 저장·전송하지 않음)
//  · 11-11 주문(송장 묶음)별 📝 메모: 이름 · 상품코드 · 수량(여러 줄) · 기타 → 0.8초 뒤 자동 저장 (시트 v22 '배송기록 메모' 탭)
//    반품 요청 → 그 주문 영상 확인 → 메모. 체크한 묶음의 메모는 [📝 메모 CSV] 로 받음 (엑셀에서 열림)
import { groupShipFiles, searchShipGroups, shipDownloadUrl, shipSizeLabel, shipThumbUrl, shipTimeLabel, shipViewUrl } from "../domain/shipPhotos.mjs?v=20261110-ship6";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const FOLDER_URL = (id) => `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;

const UPLOAD_EXT = /\.(jpe?g|png|webp|heic|heif|gif|mp4|mov|avi|mkv|m4v|wmv|3gp)$/i;
const CHUNK = 8 * 1024 * 1024; // 드라이브 이어 올리기: 256KB 의 배수
const kstLabel = (iso) => { const t = Date.parse(iso || ""); if (!Number.isFinite(t)) return ""; const k = new Date(t + 9 * 3600000).toISOString(); return `${k.slice(5, 10)} ${k.slice(11, 16)}`; };
const MEMO_COLS = ["순번", "송장 시각", "수신자", "이름", "상품코드", "수량", "기타", "수정자", "수정 시각"];

// 메모 CSV — 묶음마다 상품 줄 하나씩 (상품 줄이 없으면 한 줄) · 엑셀이 한글을 읽도록 BOM · 수식으로 안 열리게
const csvCell = (v) => { let t = String(v ?? ""); if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; return `"${t.replace(/"/g, '""')}"`; };
export function shipMemoCsv(groups = [], memos = {}) {
  const rows = [];
  for (const g of groups) {
    if (!g.invoice) continue;
    const m = memos[g.key] || {};
    const lines = (m.lines || []).filter((l) => l.code || l.qty);
    for (const l of lines.length ? lines : [{ code: "", qty: "" }]) {
      rows.push([rows.length + 1, shipTimeLabel(g.invoice.t), g.recipient, m.name || "", l.code || "", l.qty || "", m.etc || "", m.editor || "", kstLabel(m.updatedAt)]);
    }
  }
  return "\uFEFF" + [MEMO_COLS, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function mountShipPhotos({ document, window, root, side, post, isLive = () => true, editor = () => "", fetchImpl = (...a) => window.fetch(...a) } = {}) {
  if (!root || !side) return null;
  const st = { files: [], groups: [], unchecked: 0, renamePending: 0, folder: "", loaded: false, loading: false, running: false, uploading: false, mode: "all", q: "", picked: new Set(), error: "", note: "", memos: {}, memoError: "", memoTimers: new Map(), memoChains: new Map(), memoSaving: new Set() };

  side.innerHTML = `
    <fieldset class="cs-box sp-side">
      <legend>🚚 배송기록</legend>
      <p class="cs-note">드라이브 <a data-sp-folder target="_blank" rel="noopener">'5_배송기록' 폴더</a>의 배송 중 사진·동영상을 시간 순서로 봅니다.</p>
      <ol class="cs-note cs-install-steps">
        <li><b>[⬆ 사진·동영상 올리기]</b>: 고르거나 목록에 끌어다 놓으면 NAS 로 보낼 칸(5_배송기록\_NAS로)에 올라갑니다 → 평일 09:20 · 18:50 에 NAS [배송기록]으로 → 09:30 · 19:00 에 이 목록에 들어옵니다 (같은 파일은 건너뜀).</li>
        <li><b>[▶ 파일 정리 실행]</b> (오른쪽 위): 아직 확인 안 한 사진을 AI 가 보고 <b>송장 사진</b>이면 받는 분 이름을 <b>파일명 끝</b>에 붙입니다 (예: <code>20261110_143012_홍길동.jpg</code> · 가려진 글자는 ○). 파일은 지우지 않고 순서도 그대로입니다.</li>
        <li><b>묶음</b>: 송장 사진 뒤의 동영상·사진은 다음 송장 사진 전까지 그 수신자 묶음입니다.</li>
        <li><b>파일 찾기</b>: 오른쪽 [🔎 파일 찾기]에서 수신자 이름(일부도 됨)으로.</li>
        <li><b>다운로드</b>: 체크로 고르고 [⬇ 선택 다운로드]. 크롬이 "여러 파일 다운로드"를 물으면 [허용].</li>
        <li><b>📝 메모</b>: 송장 묶음마다 이름 · 상품코드 · 수량 · 기타. 쓰면 자동 저장됩니다 (CS 시트 '배송기록 메모' 탭). 체크한 묶음의 메모는 [📝 메모 CSV] 로 받습니다.</li>
      </ol>
      <p class="cs-note sp-counts" data-sp-counts></p>
    </fieldset>`;
  root.innerHTML = `
    <div class="sp-bar">
      <button type="button" class="cs-btn cs-btn-primary" data-sp-run>▶ 파일 정리 실행</button>
      <label class="cs-btn sp-upbtn" title="송장 사진·동영상 → NAS [배송기록] (평일 09:20 · 18:50 에 보냄 · 목록에 끌어다 놓아도 됨)"><input type="file" accept="image/*,video/*" multiple data-sp-file hidden>⬆ 사진·동영상 올리기</label>
      <span class="pb-seg sp-seg" role="group" aria-label="보기"><button type="button" data-sp-mode="all" class="is-on">📋 전체 리스트</button><button type="button" data-sp-mode="find">🔎 파일 찾기</button></span>
      <span class="sp-find" data-sp-findbox hidden><input type="search" class="sp-search" data-sp-q placeholder="수신자 이름 (예: 홍길동 · 길동)" aria-label="수신자 이름"><button type="button" class="cs-btn cs-btn-primary" data-sp-go>검색</button></span>
      <span class="cs-flex"></span>
      <button type="button" class="cs-btn" data-sp-all>☑ 보이는 것 전체 선택</button>
      <button type="button" class="cs-btn" data-sp-none>☐ 선택 해제</button>
      <button type="button" class="cs-btn cs-btn-green" data-sp-dl disabled>⬇ 선택 다운로드</button>
      <button type="button" class="cs-btn" data-sp-csv disabled title="체크한 송장 묶음의 메모를 CSV(엑셀)로">📝 메모 CSV</button>
      <button type="button" class="cs-btn" data-sp-reload>⟳ 새로고침</button>
    </div>
    <p class="sp-msg sp-progress" data-sp-progress></p>
    <p class="sp-msg" data-sp-msg></p>
    <div class="sp-list" data-sp-list></div>`;
  const $ = (s) => root.querySelector(s) || side.querySelector(s);

  // ---------- 불러오기 · 정리 ----------
  async function load() {
    if (st.loading) return;
    if (!isLive()) { st.error = ""; render(); return; }
    st.loading = true; st.error = ""; render();
    try {
      const js = await post({ action: "shipList" });
      st.files = Array.isArray(js.files) ? js.files : [];
      st.unchecked = Number(js.unchecked) || 0;
      st.renamePending = Number(js.renamePending) || 0;
      st.folder = js.folder || "";
      st.groups = groupShipFiles(st.files);
      st.loaded = true;
      await loadMemos();
      const ids = new Set(st.files.map((f) => f.id));
      for (const id of [...st.picked]) if (!ids.has(id)) st.picked.delete(id);
    } catch (error) {
      st.error = /알 수 없는 요청/.test(error?.message || "") ? "시트가 아직 배송사진(v16) 전입니다 — 시트 새 버전 배포 뒤 다시." : `불러오지 못했습니다: ${error?.message || error}`;
    }
    st.loading = false; render();
  }
  async function loadMemos() {
    try {
      const js = await post({ action: "shipMemoList" });
      const busy = new Set([...st.memoTimers.keys(), ...st.memoSaving]);
      const next = js.memos || {};
      for (const k of busy) if (st.memos[k]) next[k] = st.memos[k];   // 쓰는 중인 메모는 그대로
      st.memos = next; st.memoError = "";
    } catch (error) {
      st.memoError = /알 수 없는 요청/.test(error?.message || "") ? "메모는 시트 v22 배포 뒤에 쓸 수 있습니다" : `메모를 불러오지 못했습니다: ${error?.message || error}`;
    }
  }
  // ---------- 📝 주문별 메모 (자동 저장 · 한 묶음씩 차례로) ----------
  const memoOf = (key) => (st.memos[key] ||= { name: "", lines: [], etc: "", version: 0 });
  const paintMemo = (key, text) => {
    const el = root.querySelector(`[data-sp-memo="${CSS.escape(key)}"] [data-spm-state]`);
    if (el) el.textContent = st.memoSaving.has(key) ? "저장 중…" : text || "";
  };
  function readMemo(box) {
    const m = memoOf(box.dataset.spMemo);
    m.name = box.querySelector("[data-spm-name]")?.value || "";
    m.etc = box.querySelector("[data-spm-etc]")?.value || "";
    m.lines = [...box.querySelectorAll("[data-spm-i]")].map((el) => ({ code: el.querySelector("[data-spm-code]").value, qty: el.querySelector("[data-spm-qty]").value }));
    return m;
  }
  function queueMemo(key) {
    if (!isLive() || st.memoError) { paintMemo(key, st.memoError || "CS 시트 연결 뒤에 저장됩니다"); return; }
    clearTimeout(st.memoTimers.get(key));
    paintMemo(key, "쓰는 중…");
    st.memoTimers.set(key, window.setTimeout(() => {
      st.memoTimers.delete(key);
      const next = (st.memoChains.get(key) || Promise.resolve()).then(() => saveMemo(key));
      st.memoChains.set(key, next.catch(() => {}));
    }, 800));
  }
  async function saveMemo(key) {
    const g = st.groups.find((x) => x.key === key);
    const m = memoOf(key);
    st.memoSaving.add(key); paintMemo(key);
    try {
      const js = await post({ action: "shipMemoSave", key, base: m.version || 0, recipient: g?.recipient || "", t: g?.invoice?.t || "", name: m.name, lines: m.lines, etc: m.etc, editor: editor() });
      Object.assign(m, { version: js.memo?.version || m.version, editor: js.memo?.editor, updatedAt: js.memo?.updatedAt });
      st.memoSaving.delete(key); paintMemo(key, "저장됨");
    } catch (error) {
      st.memoSaving.delete(key);
      if (/먼저 고쳤/.test(error?.message || "")) { $("[data-sp-msg]").textContent = "⚠ 다른 사람이 먼저 고친 메모입니다 — 새 내용을 불러옵니다"; await loadMemos(); render(); }
      else paintMemo(key, `⚠ 저장 못 함: ${error?.message || error}`);
    }
  }
  function downloadCsv() {
    const groups = st.groups.filter((g) => g.invoice && groupFiles(g.key).some((f) => st.picked.has(f.id)));
    if (!groups.length) return;
    const blob = new window.Blob([shipMemoCsv(groups, st.memos)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    const k = new Date(Date.now() + 9 * 3600000).toISOString();
    a.href = window.URL.createObjectURL(blob);
    a.download = `배송기록_메모_${k.slice(2, 4)}${k.slice(5, 7)}${k.slice(8, 10)}_${k.slice(11, 13)}${k.slice(14, 16)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(a.href), 60000);
    $("[data-sp-msg]").textContent = `📝 메모 CSV — 송장 묶음 ${groups.length}개 · 브라우저 다운로드 폴더에 ${a.download}`;
  }
  // ---------- 올리기: 시트가 드라이브 이어 올리기 주소를 만들고(shipUpload) → 여기서 8MB 씩 직접 ----------
  async function putFile(url, file, onSent) {
    for (let start = 0; start < file.size; start += CHUNK) {
      const end = Math.min(file.size, start + CHUNK);
      let res = null;
      for (let tries = 0; tries < 3 && !res; tries += 1) {
        try { res = await fetchImpl(url, { method: "PUT", headers: { "Content-Range": `bytes ${start}-${end - 1}/${file.size}` }, body: file.slice(start, end) }); }
        catch (error) { if (tries === 2) throw error; await new Promise((ok) => window.setTimeout(ok, 1500 * (tries + 1))); }
      }
      if (res.status === 200 || res.status === 201) { onSent(file.size); return; }
      if (res.status !== 308) throw new Error(`드라이브 응답 ${res.status}`);
      onSent(end);
    }
    throw new Error("드라이브가 끝 응답을 주지 않았습니다");
  }
  async function upload(fileList) {
    const files = [...(fileList || [])].filter((f) => /^(image|video)\//.test(f.type || "") || UPLOAD_EXT.test(f.name || ""));
    if (!files.length || st.uploading) { if (fileList?.length && !files.length) { st.note = "사진·동영상 파일만 올릴 수 있습니다"; render(); } return; }
    if (!isLive()) { st.note = "CS 시트 연결 뒤에 올릴 수 있습니다"; render(); return; }
    st.uploading = true;
    const total = files.reduce((n, f) => n + f.size, 0);
    let doneBytes = 0, ok = 0, skipped = 0;
    const errors = [];
    const mb = (n) => `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)}MB`;
    for (const [i, f] of files.entries()) {
      const show = (sent) => { st.note = `⬆ 올리는 중 ${i + 1}/${files.length} · ${f.name} · ${Math.round(((doneBytes + sent) / Math.max(1, total)) * 100)}% (${mb(doneBytes + sent)} / ${mb(total)})`; render(); };
      show(0);
      try {
        const js = await post({ action: "shipUpload", name: f.name, mime: f.type || "", size: f.size, origin: window.location.origin });
        if (js.skip) skipped += 1;
        else { await putFile(js.url, f, show); ok += 1; }
      } catch (error) {
        errors.push(`${f.name}: ${error?.message || error}`);
      }
      doneBytes += f.size;
    }
    st.uploading = false;
    st.note = `⬆ 올리기 끝 — ${ok}개 올림${skipped ? ` · 이미 있어서 건너뜀 ${skipped}개` : ""}${errors.length ? ` · ⚠ 실패 ${errors.length}개: ${errors[0]}` : ""}${ok ? " · 평일 09:20 · 18:50 에 NAS [배송기록]으로 보내고, 09:30 · 19:00 에 이 목록에 들어옵니다" : ""}`;
    const input = $("[data-sp-file]");
    if (input) input.value = "";
    await load();
  }

  async function run() {
    if (st.running || !isLive()) return;
    st.running = true; render();
    let done = 0, invoices = 0, renamed = 0;
    const errors = [];
    try {
      for (let guard = 0; guard < 500; guard += 1) {
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
      st.note = `정리 끝 — 확인 ${done}장 · 송장 ${invoices}장 · 이름 붙임 ${renamed}장`;
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
      ${g.invoice ? memoHtml(g) : ""}
    </section>`;
  }
  function memoHtml(g) {
    const m = st.memos[g.key] || { name: "", lines: [], etc: "" };
    const lines = m.lines?.length ? m.lines : [{ code: "", qty: "" }];
    return `<div class="sp-memo" data-sp-memo="${esc(g.key)}">
        <b class="sp-memo-t">📝 메모</b>
        <label class="sp-mf sp-mf-name"><span>이름</span><input data-spm-name value="${esc(m.name)}" placeholder="${esc(g.recipient || "이름")}"></label>
        <span class="sp-mlines">${lines.map((l, i) => `<span class="sp-ml" data-spm-i="${i}"><label class="sp-mf"><span>상품코드</span><input data-spm-code value="${esc(l.code)}" placeholder="셀피아 코드"></label><label class="sp-mf sp-mf-qty"><span>수량</span><input data-spm-qty type="number" min="0" inputmode="numeric" value="${esc(l.qty)}"></label>${lines.length > 1 ? `<button type="button" class="sp-mdel" data-spm-del title="이 줄 빼기">×</button>` : ""}</span>`).join("")}<button type="button" class="sp-madd" data-spm-add>＋ 상품</button></span>
        <label class="sp-mf sp-mf-etc"><span>기타</span><input data-spm-etc value="${esc(m.etc)}" placeholder="반품 사유 · 영상 확인 결과 …"></label>
        <small class="sp-mstate" data-spm-state>${m.editor ? `${esc(m.editor)} · ${esc(kstLabel(m.updatedAt))}` : ""}</small>
      </div>`;
  }
  const visibleGroups = () => (st.mode === "find" ? (st.q ? searchShipGroups(st.groups, st.q) : []) : st.groups);
  function render() {
    root.querySelectorAll("[data-sp-mode]").forEach((b) => b.classList.toggle("is-on", b.dataset.spMode === st.mode));
    $("[data-sp-findbox]").hidden = st.mode !== "find";
    const live = isLive();
    $("[data-sp-run]").disabled = st.running || st.uploading || !live;
    $(".sp-upbtn")?.classList.toggle("is-busy", st.uploading || !live);
    $("[data-sp-run]").textContent = st.running ? "정리 중…" : "▶ 파일 정리 실행";
    $("[data-sp-progress]").textContent = st.note;
    const folder = $("[data-sp-folder]");
    if (st.folder) folder.href = FOLDER_URL(st.folder); else folder.removeAttribute("href");
    const inv = st.groups.filter((g) => g.invoice).length;
    $("[data-sp-counts]").textContent = st.loaded ? `전체 ${st.files.length}개 · 송장 묶음 ${inv}개 · 동영상 ${st.files.filter((f) => f.kind === "video").length}개 · 확인 안 한 사진 ${st.unchecked}장${st.renamePending ? ` · ⚠ 이름 못 붙인 송장 ${st.renamePending}장 ([▶ 파일 정리 실행]으로 다시)` : ""}` : "";
    $("[data-sp-dl]").disabled = !st.picked.size;
    $("[data-sp-dl]").textContent = `⬇ 선택 다운로드${st.picked.size ? ` (${st.picked.size})` : ""}`;
    const memoGroups = st.groups.filter((g) => g.invoice && groupFiles(g.key).some((f) => st.picked.has(f.id))).length;
    $("[data-sp-csv]").disabled = !memoGroups;
    $("[data-sp-csv]").textContent = `📝 메모 CSV${memoGroups ? ` (${memoGroups})` : ""}`;
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
  });
  root.addEventListener("change", (e) => { if (e.target.matches?.("[data-sp-file]")) upload(e.target.files); });
  const drop = root;
  drop.addEventListener("dragover", (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { e.preventDefault(); drop.classList.add("is-drag"); } });
  drop.addEventListener("dragleave", (e) => { if (e.target === drop) drop.classList.remove("is-drag"); });
  drop.addEventListener("drop", (e) => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); drop.classList.remove("is-drag"); upload(e.dataTransfer.files); });
  root.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    if (b.dataset.spMode) { st.mode = b.dataset.spMode; render(); if (st.mode === "find") $("[data-sp-q]")?.focus(); }
    else if (b.matches("[data-sp-go]")) { st.q = $("[data-sp-q]").value.trim(); render(); }
    else if (b.matches("[data-sp-all]")) { for (const g of visibleGroups()) for (const f of groupFiles(g.key)) st.picked.add(f.id); render(); }
    else if (b.matches("[data-sp-none]")) { st.picked.clear(); render(); }
    else if (b.matches("[data-sp-dl]")) download();
    else if (b.matches("[data-sp-csv]")) downloadCsv();
    else if (b.matches("[data-spm-add]") || b.matches("[data-spm-del]")) {
      const box = b.closest("[data-sp-memo]");
      const m = readMemo(box);
      if (b.matches("[data-spm-add]")) { if (!m.lines.length) m.lines.push({ code: "", qty: "" }); m.lines.push({ code: "", qty: "" }); }
      else m.lines.splice(Number(b.closest("[data-spm-i]").dataset.spmI), 1);
      box.outerHTML = memoHtml(st.groups.find((g) => g.key === box.dataset.spMemo));
      queueMemo(box.dataset.spMemo);
      if (b.matches("[data-spm-add]")) [...root.querySelectorAll(`[data-sp-memo="${CSS.escape(box.dataset.spMemo)}"] [data-spm-code]`)].pop()?.focus();
    }
    else if (b.matches("[data-sp-reload]")) load();
  });
  root.addEventListener("input", (e) => {
    const box = e.target.closest?.("[data-sp-memo]");
    if (!box) return;
    readMemo(box); queueMemo(box.dataset.spMemo);
  });
  root.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("[data-sp-q]")) { st.q = e.target.value.trim(); render(); } });
  root.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.spPick) { if (t.checked) st.picked.add(t.dataset.spPick); else st.picked.delete(t.dataset.spPick); render(); }
    else if (t.dataset.spGpick) { for (const f of groupFiles(t.dataset.spGpick)) { if (t.checked) st.picked.add(f.id); else st.picked.delete(f.id); } render(); }
  });
  render();
  return { load, run, upload, state: st };
}
