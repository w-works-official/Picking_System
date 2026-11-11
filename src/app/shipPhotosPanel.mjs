// 🚚 CS 관리 › 배송사진 (2026-11-10) — 드라이브 '5_배송기록' 폴더 (배송 중 찍은 사진 + 동영상)
//  · [▶ 파일 정리 실행]: 확인 안 한 사진을 시트(v16 shipScan)가 6장씩 AI 로 보고, 송장 사진이면 수신자 이름을 파일명 끝에 붙임
//  · 📋 전체 리스트: 시간 순서 그대로 · 송장 사진 = 묶음 시작 → 그 뒤 동영상·사진은 다음 송장 사진 전까지 같은 묶음
//  · 검색: 수신자 이름(일부 · 가려진 글자 * ○ 무시) · 메모 글자 — 11-11 [🔎 파일 찾기] 버튼은 뺌 (검색창이 늘 보임) · 날짜 · 상품코드 적힌 주문만
//  · 둘 다 체크로 고르고 [⬇ 선택 다운로드] (드라이브에서 바로 받음 — 이 화면은 파일을 저장·전송하지 않음)
//  · 11-11 주문(송장 묶음)별 📝 메모: 이름 + 줄마다 [상품코드 · 수량 · 기타] (＋ 상품 = 아래로 한 줄) → 0.8초 뒤 자동 저장 (시트 v23 '배송기록 메모' 탭)
//    반품 요청 → 그 주문 영상 확인 → 메모. 체크한 묶음의 메모는 [📝 메모 CSV] 로 받음 (엑셀에서 열림)
//  · 11-11 메모 칸: 이름 · 전화번호 · 매입처 / 줄마다 상품명 · 옵션명 · 수량 · 자사코드 · 상품코드 · 기타 (시트 v24)
//    [주문 찾기] (이름 왼쪽 정사각 버튼): 이름칸에 확정된 이름 + 송장에서 보이는 글자(전화·운송장·주소, shipHints) → 피킹 DB 주문(접수일 14일 안)과 일치도 → 후보 5개 → 고르면 채움
//    (피킹 DB 는 피킹 로그인 세션이 있어야 읽힘 — 피킹시스템에서 로그인한 탭에서 CS 관리로)
//  · [👤＋ 슬롯 추가]: 사진·영상 없이 반품 메모만 쓰는 빈 슬롯 (맨 위)
import { groupShipFiles, searchShipGroups, shipDownloadUrl, shipSizeLabel, shipThumbUrl, shipTimeLabel, shipViewUrl } from "../domain/shipPhotos.mjs?v=20261110-ship6";
import { itemsToLines, mergeHints, phoneTail, rankOrders, receiptWindow } from "../domain/shipOrderMatch.mjs?v=20261111-find3";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const FOLDER_URL = (id) => `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;

const UPLOAD_EXT = /\.(jpe?g|png|webp|heic|heif|gif|mp4|mov|avi|mkv|m4v|wmv|3gp)$/i;
const CHUNK = 8 * 1024 * 1024; // 드라이브 이어 올리기: 256KB 의 배수
const kstLabel = (iso) => { const t = Date.parse(iso || ""); if (!Number.isFinite(t)) return ""; const k = new Date(t + 9 * 3600000).toISOString(); return `${k.slice(5, 10)} ${k.slice(11, 16)}`; };
const MEMO_COLS = ["순번", "송장 시각", "수신자", "이름", "전화번호", "매입처", "상품명", "옵션명", "수량", "자사코드", "상품코드", "기타", "주문번호", "수정자", "수정 시각"];
// 상품 줄 칸 (순서 = 화면 · CSV)
export const LINE_FIELDS = [
  { k: "pname", label: "상품명", ph: "" },
  { k: "option", label: "옵션명", ph: "" },
  { k: "qty", label: "수량", ph: "", num: true },
  { k: "own", label: "자사코드", ph: "" },
  { k: "code", label: "상품코드", ph: "셀피아 코드" },
  { k: "etc", label: "기타", ph: "반품 사유 · 영상 확인 결과 …" },
];
const emptyLine = () => Object.fromEntries(LINE_FIELDS.map((f) => [f.k, ""]));
const lineHas = (l = {}) => LINE_FIELDS.some((f) => String(l[f.k] ?? "").trim());
// 메모 슬롯 시각: 시트 '2026-11-11 14:05:00' → 20261111140500
export const memoT = (m = {}) => String(m.t || "").replace(/\D/g, "").slice(0, 14);
const kstNowT = () => new Date(Date.now() + 9 * 3600000).toISOString().replace(/\D/g, "").slice(0, 14);
const PICK_URL = "https://vgxocngpykhlkosiaeew.supabase.co";
const PICK_KEY = "sb_publishable_XVnKGJo66GZiYTq5Ivu8dA_SjBVvX0g";
const PICK_SESSION_KEY = "system-v3-picking-session-v1";

// 메모 CSV — 묶음마다 상품 줄 하나씩 (상품 줄이 없으면 한 줄) · 엑셀이 한글을 읽도록 BOM · 수식으로 안 열리게
const csvCell = (v) => { let t = String(v ?? ""); if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; return `"${t.replace(/"/g, '""')}"`; };
export function shipMemoCsv(groups = [], memos = {}) {
  const rows = [];
  for (const g of groups) {
    if (!g.invoice && !g.memoOnly) continue;
    const m = memos[g.key] || {};
    const lines = (m.lines || []).filter(lineHas);
    for (const l of lines.length ? lines : [{ ...emptyLine(), etc: m.etc || "" }]) {
      rows.push([rows.length + 1, shipTimeLabel(g.invoice ? g.invoice.t : memoT(m)), g.recipient || "", m.name || "", m.phone || "", m.vendor || "",
        ...LINE_FIELDS.map((f) => l[f.k] || ""), m.ordNo || "", m.editor || "", kstLabel(m.updatedAt)]);
    }
  }
  return "\uFEFF" + [MEMO_COLS, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// 목록 거르기 — 검색(수신자·메모 글자) · 날짜(배송 시각) · 상품코드 적힌 주문만
export function filterShipGroups(groups = [], memos = {}, { q = "", from = "", to = "", codeOnly = false } = {}) {
  const words = String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
  const day = (g) => String(g.invoice?.t || (g.memoOnly ? memoT(memos[g.key]) : g.items?.[0]?.t) || "").slice(0, 8);
  const f = String(from || "").replace(/\D/g, ""), t = String(to || "").replace(/\D/g, "");
  const any = words.length || f || t || codeOnly;
  return groups.filter((g) => {
    if (!g.invoice && !g.memoOnly) return !any;   // 송장 전 파일은 거르기 없을 때만
    const m = memos[g.key] || {};
    if (codeOnly && !(m.lines || []).some((l) => String(l.code || "").trim() || String(l.own || "").trim())) return false;
    const d = day(g);
    if (f && (!d || d < f)) return false;
    if (t && (!d || d > t)) return false;
    if (!words.length) return true;
    const text = [m.name, m.phone, m.vendor, m.ordNo, ...(m.lines || []).flatMap((l) => LINE_FIELDS.map((x) => l[x.k]))].join(" ").toLowerCase();
    return words.every((w) => text.includes(w)) || (g.invoice && searchShipGroups([g], q).length > 0);
  });
}

export function mountShipPhotos({ document, window, root, side, post, isLive = () => true, editor = () => "", fetchImpl = (...a) => window.fetch(...a), storages = [] } = {}) {
  if (!root || !side) return null;
  const st = { files: [], groups: [], unchecked: 0, renamePending: 0, folder: "", loaded: false, loading: false, running: false, uploading: false, q: "", from: "", to: "", codeOnly: false, picked: new Set(), pickedMemo: new Set(), error: "", note: "", memos: {}, memoError: "", memoTimers: new Map(), memoChains: new Map(), memoSaving: new Set(), cands: new Map() };

  side.innerHTML = `
    <fieldset class="cs-box sp-side">
      <legend>🚚 배송기록</legend>
      <p class="cs-note">드라이브 <a data-sp-folder target="_blank" rel="noopener">'5_배송기록' 폴더</a>의 배송 중 사진·동영상을 시간 순서로 봅니다.</p>
      <ol class="cs-note cs-install-steps">
        <li><b>[⬆ 사진·동영상 올리기]</b>: 고르거나 목록에 끌어다 놓으면 NAS 로 보낼 칸(5_배송기록\_NAS로)에 올라갑니다 → 평일 09:20 · 18:50 에 NAS [배송기록]으로 → 09:30 · 19:00 에 이 목록에 들어옵니다 (같은 파일은 건너뜀).</li>
        <li><b>[▶ 파일 정리 실행]</b> (오른쪽 위): 아직 확인 안 한 사진을 AI 가 보고 <b>송장 사진</b>이면 받는 분 이름을 <b>파일명 끝</b>에 붙입니다 (예: <code>20261110_143012_홍길동.jpg</code> · 가려진 글자는 ○). 파일은 지우지 않고 순서도 그대로입니다.</li>
        <li><b>묶음</b>: 송장 사진 뒤의 동영상·사진은 다음 송장 사진 전까지 그 수신자 묶음입니다.</li>
        <li><b>검색</b>: 수신자 이름(일부도 됨)이나 메모 글자 · 날짜 · "상품코드 적힌 주문만".</li>
        <li><b>다운로드</b>: 체크로 고르고 [⬇ 선택 다운로드]. 크롬이 "여러 파일 다운로드"를 물으면 [허용].</li>
        <li><b>메모</b>: 송장 묶음마다 이름 · 전화번호 · 매입처, 줄마다 상품명 · 옵션명 · 수량 · 자사코드 · 상품코드 · 기타. 쓰면 자동 저장됩니다 (CS 시트 '배송기록 메모' 탭). 체크한 묶음의 메모는 [📝 메모 CSV] 로 받습니다.</li>
        <li><b>[주문 찾기]</b> (이름 왼쪽): 이름칸에 확정한 이름 + 송장에서 보이는 전화·운송장·주소로 피킹 주문 후보를 찾아 채웁니다 — 피킹시스템에서 로그인한 탭에서 와야 합니다. 매입처는 직접.</li>
        <li><b>[👤＋ 슬롯 추가]</b> (목록 맨 위): 사진·영상 없이 반품 메모만 쓰는 슬롯.</li>
      </ol>
      <p class="cs-note sp-counts" data-sp-counts></p>
    </fieldset>`;
  root.innerHTML = `
    <div class="sp-bar">
      <button type="button" class="cs-btn cs-btn-primary" data-sp-run>▶ 파일 정리 실행</button>
      <label class="cs-btn sp-upbtn" title="송장 사진·동영상 → NAS [배송기록] (평일 09:20 · 18:50 에 보냄 · 목록에 끌어다 놓아도 됨)"><input type="file" accept="image/*,video/*" multiple data-sp-file hidden>⬆ 사진·동영상 올리기</label>
      <button type="button" class="cs-btn sp-allbtn" data-sp-clear title="검색·조건을 지우고 전체">📋 전체 리스트</button>
      <span class="sp-find"><input type="search" class="sp-search" data-sp-q placeholder="수신자 이름 · 메모 글자 (예: 홍길동 · 길동)" aria-label="검색"><button type="button" class="cs-btn cs-btn-primary" data-sp-go>검색</button></span>
      <span class="sp-cond"><label class="sp-cal" title="부터 (날짜 고르기)"><b data-sp-cal="from">📅</b><input type="date" data-sp-from aria-label="부터"></label><span>~</span><label class="sp-cal" title="까지 (날짜 고르기)"><b data-sp-cal="to">📅</b><input type="date" data-sp-to aria-label="까지"></label><label class="sp-codeonly"><input type="checkbox" data-sp-codeonly> 상품코드 적힌 주문만</label></span>
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
  const memoOf = (key) => (st.memos[key] ||= { key, name: "", phone: "", vendor: "", ordNo: "", lines: [], etc: "", version: 0 });
  // 빈 메모 슬롯 (사진 없이) — 키 memo-… · 최근 것 위로
  const memoOnlyGroups = () => Object.entries(st.memos).filter(([k]) => /^memo-/.test(k))
    .map(([k, m]) => ({ key: k, memoOnly: true, invoice: null, items: [], recipient: "", t: memoT(m) }))
    .sort((a, b) => (a.t < b.t ? 1 : a.t > b.t ? -1 : 0));
  const groupByKey = (key) => st.groups.find((x) => x.key === key) || memoOnlyGroups().find((x) => x.key === key);
  const paintMemo = (key, text) => {
    const el = root.querySelector(`[data-sp-memo="${CSS.escape(key)}"] [data-spm-state]`);
    if (el) el.textContent = st.memoSaving.has(key) ? "저장 중…" : text || "";
  };
  function readMemo(box) {
    const m = memoOf(box.dataset.spMemo);
    for (const k of ["name", "phone", "vendor"]) m[k] = box.querySelector(`[data-spm-${k}]`)?.value || "";
    m.lines = [...box.querySelectorAll("[data-spm-i]")].map((el) => Object.fromEntries(LINE_FIELDS.map((f) => [f.k, el.querySelector(`[data-spm-f="${f.k}"]`)?.value || ""])));
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
    const g = groupByKey(key);
    const m = memoOf(key);
    st.memoSaving.add(key); paintMemo(key);
    try {
      const js = await post({ action: "shipMemoSave", key, base: m.version || 0, recipient: g?.recipient || "", t: g?.invoice?.t || memoT(m), name: m.name, phone: m.phone, vendor: m.vendor, ordNo: m.ordNo, lines: m.lines, editor: editor() });
      Object.assign(m, { version: js.memo?.version || m.version, editor: js.memo?.editor, updatedAt: js.memo?.updatedAt });
      st.memoSaving.delete(key); paintMemo(key, "저장됨");
    } catch (error) {
      st.memoSaving.delete(key);
      if (/먼저 고쳤/.test(error?.message || "")) { $("[data-sp-msg]").textContent = "⚠ 다른 사람이 먼저 고친 메모입니다 — 새 내용을 불러옵니다"; await loadMemos(); render(); }
      else paintMemo(key, `⚠ 저장 못 함: ${error?.message || error}`);
    }
  }
  const pickedGroups = () => [...memoOnlyGroups().filter((g) => st.pickedMemo.has(g.key)), ...st.groups.filter((g) => g.invoice && groupFiles(g.key).some((f) => st.picked.has(f.id)))];
  // 👤＋ 슬롯 추가 — 바로 저장해 둠 (다른 PC 에서도 보이게)
  function addSlot() {
    if (!isLive() || st.memoError) { $("[data-sp-msg]").textContent = st.memoError || "CS 시트 연결 뒤에 쓸 수 있습니다"; return; }
    const key = `memo-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const m = memoOf(key);
    m.t = kstNowT(); m.lines = [emptyLine()];
    render();
    root.querySelector(`[data-sp-memo="${CSS.escape(key)}"] [data-spm-name]`)?.focus();
    queueMemo(key);
  }
  // ---------- [주문서 찾기] ----------
  function pickSession() {
    for (const s of storages) {
      try { const v = JSON.parse(s?.getItem(PICK_SESSION_KEY) || "null"); if (v?.token && !(Date.parse(v.expiresAt) <= Date.now())) return v; } catch { /* 다음 */ }
    }
    return null;
  }
  async function pickRows(path, session) {
    const headers = { apikey: PICK_KEY, Authorization: `Bearer ${PICK_KEY}`, "x-picking-session": session.token };
    const rows = [];
    for (let from = 0; from < 20000; from += 1000) {
      const res = await fetchImpl(`${PICK_URL}/rest/v1/${path}`, { headers: { ...headers, "Range-Unit": "items", Range: `${from}-${from + 999}` }, cache: "no-store" });
      if (res.status === 401 || res.status === 403) throw new Error("피킹 로그인이 만료됐습니다 — 피킹시스템에서 다시 로그인한 탭에서 오세요");
      if (!res.ok && res.status !== 206) throw new Error(`피킹 주문을 못 읽음 (${res.status})`);
      const page = await res.json();
      rows.push(...page);
      if (page.length < 1000) break;
    }
    return rows;
  }
  // 피킹 DB 에 쌓인 주문 범위 (첫 · 마지막 접수일 · 전체 건수) — 한 번만 읽음
  async function pickStats(session) {
    if (st.pickStats) return st.pickStats;
    const headers = { apikey: PICK_KEY, Authorization: `Bearer ${PICK_KEY}`, "x-picking-session": session.token };
    const one = async (order) => { const r = await fetchImpl(`${PICK_URL}/rest/v1/orders?select=receipt_date&receipt_date=not.is.null&order=receipt_date.${order}&limit=1`, { headers, cache: "no-store" }); return r.ok ? ((await r.json())[0]?.receipt_date || "") : ""; };
    try {
      const [first, last, cnt] = await Promise.all([one("asc"), one("desc"), fetchImpl(`${PICK_URL}/rest/v1/orders?select=ord_no`, { headers: { ...headers, Prefer: "count=exact", "Range-Unit": "items", Range: "0-0" }, cache: "no-store" })]);
      const total = Number(String(cnt.headers?.get?.("content-range") || "").split("/")[1]) || null;
      st.pickStats = { first, last, total };
    } catch { st.pickStats = { first: "", last: "", total: null }; }
    return st.pickStats;
  }
  const paintCands = (key, html) => { const el = root.querySelector(`[data-sp-memo="${CSS.escape(key)}"] [data-spm-cands]`); if (el) el.innerHTML = html; };
  async function findOrder(key) {
    const box = root.querySelector(`[data-sp-memo="${CSS.escape(key)}"]`);
    const g = groupByKey(key);
    const m = box ? readMemo(box) : memoOf(key);
    const session = pickSession();
    if (!session) { paintCands(key, `<p class="sp-cand-msg is-bad">피킹 로그인이 필요합니다 — 피킹시스템에서 로그인한 그 탭에서 [CS 관리]로 넘어와 주세요.</p>`); return; }
    paintCands(key, `<p class="sp-cand-msg">${g?.invoice ? "송장 글자 읽는 중…" : "주문 찾는 중…"}</p>`);
    let photo = {}, note = "";
    if (g?.invoice) {
      try { photo = (await post({ action: "shipHints", id: g.invoice.id })).hints || {}; }
      catch (error) { note = /알 수 없는 요청/.test(error?.message || "") ? "시트 v24 전이라 송장 글자는 못 읽음" : `송장 글자 못 읽음: ${error?.message || error}`; }
    }
    // 이름 = 이름칸에 확정된 이름 (비어 있으면 칸에 보이는 송장 이름) — AI 가 다시 읽은 이름은 안 씀
    const hints = mergeHints(photo, { name: m.name || g?.recipient || "", phone: m.phone });
    if (!Object.values(hints).some(Boolean)) { paintCands(key, `<p class="sp-cand-msg is-bad">${note ? `${esc(note)} — ` : ""}힌트가 없습니다. 이름이나 전화번호를 적고 다시 눌러 주세요.</p>`); return; }
    const win = g?.invoice ? receiptWindow(g.invoice.t) : (st.from || st.to) ? { from: st.from || receiptWindow(kstNowT(), 60).from, to: st.to || receiptWindow(kstNowT(), 0).to } : receiptWindow(memoT(m) || kstNowT(), 30);
    paintCands(key, `<p class="sp-cand-msg">피킹 주문 읽는 중… (접수일 ${win.from} ~ ${win.to})</p>`);
    try {
      const stats = await pickStats(session);
      const orders = await pickRows(`orders?select=ord_no,inv_no,receiver,receiver_name,receiver_mobile,receiver_tel,receiver_address,seller,receipt_date&receipt_date=gte.${win.from}&receipt_date=lte.${win.to}&order=ord_no.asc`, session);
      const ranked = rankOrders(hints, orders, 5);
      st.cands.set(key, ranked);
      const hintText = [hints.name && `이름 ${hints.name}`, hints.phone && `전화 ${hints.phone}`, hints.invoice && `송장 ${hints.invoice}`, hints.address && `주소 ${hints.address}`].filter(Boolean).join(" · ");
      const dbText = stats.first ? ` · 피킹 DB 주문 ${stats.first} ~ ${stats.last}${stats.total != null ? ` 전체 ${stats.total.toLocaleString()}건` : ""}` : "";
      paintCands(key, `<p class="sp-cand-msg">힌트: ${esc(hintText)}${note ? ` · ${esc(note)}` : ""} — 접수일 ${win.from} ~ ${win.to} 주문 ${orders.length}건 중${esc(dbText)}</p>`
        + (ranked.length ? ranked.map((c, i) => `<div class="sp-cand"><b class="sp-cand-score">${c.score}%</b><span>${esc(c.order.receiver_name || c.order.receiver || "")}</span><small>${esc(phoneTail(c.order))} · ${esc(String(c.order.receiver_address || "").slice(0, 24))} · ${esc(c.order.receipt_date || "")} · ${esc(c.order.seller || "")}</small><button type="button" class="cs-btn cs-btn-mini" data-spm-use="${i}">이 주문으로 채우기</button></div>`).join("")
          : `<p class="sp-cand-msg is-bad">맞는 주문이 없습니다 — 이름·전화를 고쳐 적거나 날짜 조건을 넓혀 다시.</p>`));
    } catch (error) { paintCands(key, `<p class="sp-cand-msg is-bad">${esc(error?.message || error)}</p>`); }
  }
  async function useOrder(key, i) {
    const c = st.cands.get(key)?.[i];
    const session = pickSession();
    if (!c || !session) return;
    paintCands(key, `<p class="sp-cand-msg">주문 상품 불러오는 중…</p>`);
    try {
      const items = await pickRows(`order_items?select=p_name,p_option,o_amount,p_dpcode,p_code&ord_no=eq.${encodeURIComponent(c.order.ord_no)}&order=sort_order.asc`, session);
      const m = memoOf(key);
      const box = root.querySelector(`[data-sp-memo="${CSS.escape(key)}"]`);
      if (box) readMemo(box);
      const old = m.lines || [];
      m.name = String(c.order.receiver_name || c.order.receiver || "");
      m.phone = String(c.order.receiver_mobile || c.order.receiver_tel || "");
      m.ordNo = String(c.order.ord_no || "");
      m.lines = itemsToLines(items).map((l, k) => ({ ...l, etc: old[k]?.etc || "" }));   // 줄마다 쓴 기타는 그대로
      if (!m.lines.length) m.lines = [emptyLine()];
      st.cands.delete(key);
      if (box) box.outerHTML = memoHtml(groupByKey(key));
      queueMemo(key);
    } catch (error) { paintCands(key, `<p class="sp-cand-msg is-bad">${esc(error?.message || error)}</p>`); }
  }
  function downloadCsv() {
    const groups = pickedGroups();
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
    if (g.memoOnly) {
      return `<section class="sp-group is-memo-only">
      <header><input type="checkbox" data-sp-mpick="${esc(g.key)}"${st.pickedMemo.has(g.key) ? " checked" : ""} aria-label="메모 슬롯 선택">
        <b>👤 ${esc(memoOf(g.key).name || "메모 슬롯")}</b><small>${esc(shipTimeLabel(g.t))} · 사진·영상 없음</small></header>
      <div class="sp-body">${memoHtml(g)}</div>
    </section>`;
    }
    const files = [...(g.invoice ? [g.invoice] : []), ...g.items];
    const all = files.length && files.every((f) => st.picked.has(f.id));
    const videos = g.items.filter((f) => f.kind === "video").length, photos = g.items.filter((f) => f.kind === "photo").length;
    return `<section class="sp-group${g.invoice ? "" : " is-before"}">
      <header><input type="checkbox" data-sp-gpick="${esc(g.key)}"${all ? " checked" : ""} aria-label="묶음 전체 선택">
        <b>${g.invoice ? `👤 ${esc(g.recipient)}` : "송장 전 파일"}</b>
        <small>${g.invoice ? esc(shipTimeLabel(g.invoice.t)) + " · " : ""}동영상 ${videos} · 사진 ${photos}</small></header>
      <div class="sp-body"><div class="sp-files">${files.map((f) => tile(f, f === g.invoice)).join("")}</div>${g.invoice ? memoHtml(g) : ""}</div>
    </section>`;
  }
  function memoHtml(g) {
    if (!g) return "";
    const m = st.memos[g.key] || { name: "", lines: [] };
    const lines = m.lines?.length ? m.lines : [{ ...emptyLine(), etc: m.etc || "" }];
    // 첫 줄: 이름(아래 [주문서 찾기]) · 전화번호 · 매입처 / 상품 줄: 상품명 · 옵션명 · 수량 · 자사코드 · 상품코드 · 기타 · × — 항목 이름은 첫 상품 줄에만
    const head = (i, t) => (i === 0 ? `<span>${t}</span>` : "");
    const field = (l, i, f) => `<label class="sp-mf sp-mf-${f.k}">${head(i, f.label)}<input data-spm-f="${f.k}" value="${esc(l[f.k] ?? "")}"${f.ph ? ` placeholder="${esc(f.ph)}"` : ""}${f.num ? ' type="number" min="0" inputmode="numeric"' : ""}></label>`;
    return `<div class="sp-memo" data-sp-memo="${esc(g.key)}">
        <div class="sp-mhead">
          <div class="sp-mname"><button type="button" class="sp-mfind" data-spm-find title="이름칸의 이름(확정) + 송장 글자(전화·운송장·주소)로 피킹 주문 찾기">주문<br>찾기</button>
            <label class="sp-mf sp-mf-name"><span>이름</span><input data-spm-name value="${esc(m.name)}" placeholder="${esc(g.recipient || "이름")}"></label></div>
          <label class="sp-mf sp-mf-phone"><span>전화번호</span><input data-spm-phone value="${esc(m.phone || "")}" inputmode="tel"></label>
          <label class="sp-mf sp-mf-vendor"><span>매입처</span><input data-spm-vendor value="${esc(m.vendor || "")}"></label>
          ${m.ordNo ? `<small class="sp-mord">주문 ${esc(m.ordNo)}</small>` : ""}
          <small class="sp-mstate" data-spm-state>${m.editor ? `${esc(m.editor)} · ${esc(kstLabel(m.updatedAt))}` : ""}</small>
        </div>
        <div class="sp-mcands" data-spm-cands></div>
        <div class="sp-mlines">${lines.map((l, i) => `<div class="sp-ml" data-spm-i="${i}">${LINE_FIELDS.map((f) => field(l, i, f)).join("")}${lines.length > 1 ? `<button type="button" class="sp-mdel" data-spm-del title="이 줄 빼기">×</button>` : ""}</div>`).join("")}<button type="button" class="sp-madd" data-spm-add>＋ 상품</button></div>
      </div>`;
  }
  const visibleGroups = () => filterShipGroups([...memoOnlyGroups(), ...st.groups], st.memos, { q: st.q, from: st.from, to: st.to, codeOnly: st.codeOnly });
  function render() {
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
    const memoGroups = pickedGroups().length;
    $("[data-sp-csv]").disabled = !memoGroups;
    $("[data-sp-csv]").textContent = `📝 메모 CSV${memoGroups ? ` (${memoGroups})` : ""}`;
    const list = $("[data-sp-list]");
    if (st.error) { list.innerHTML = `<p class="sp-empty is-bad">${esc(st.error)}</p>`; return; }
    if (st.loading && !st.loaded) { list.innerHTML = '<p class="sp-empty">불러오는 중…</p>'; return; }
    if (!st.loaded) { list.innerHTML = '<p class="sp-empty">[⟳ 새로고침]을 누르면 폴더를 읽습니다.</p>'; return; }
    const groups = visibleGroups();
    const filtered = st.q || st.from || st.to || st.codeOnly;
    const addRow = `<section class="sp-group sp-addrow"><header><button type="button" class="sp-addslot" data-sp-addslot title="사진·영상 없이 반품 메모만 쓰는 슬롯">👤＋ 슬롯 추가</button><small>사진·영상 없이 반품 메모만</small></header></section>`;
    list.innerHTML = addRow + (groups.length ? groups.map(groupHtml).join("") : `<p class="sp-empty">${filtered ? "조건에 맞는 묶음이 없습니다. [📋 전체 리스트]로 조건을 지웁니다." : "폴더에 사진·동영상이 없습니다."}</p>`);
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
    if (b.matches("[data-sp-clear]")) { st.q = st.from = st.to = ""; st.codeOnly = false; for (const s of ["[data-sp-q]", "[data-sp-from]", "[data-sp-to]"]) $(s).value = ""; $("[data-sp-codeonly]").checked = false; paintCal(); render(); }
    else if (b.matches("[data-sp-go]")) { st.q = $("[data-sp-q]").value.trim(); render(); }
    else if (b.matches("[data-sp-all]")) { for (const g of visibleGroups()) { if (g.memoOnly) st.pickedMemo.add(g.key); for (const f of groupFiles(g.key)) st.picked.add(f.id); } render(); }
    else if (b.matches("[data-sp-none]")) { st.picked.clear(); st.pickedMemo.clear(); render(); }
    else if (b.matches("[data-sp-addslot]")) addSlot();
    else if (b.matches("[data-spm-find]")) findOrder(b.closest("[data-sp-memo]").dataset.spMemo);
    else if (b.dataset.spmUse != null) useOrder(b.closest("[data-sp-memo]").dataset.spMemo, Number(b.dataset.spmUse));
    else if (b.matches("[data-sp-dl]")) download();
    else if (b.matches("[data-sp-csv]")) downloadCsv();
    else if (b.matches("[data-spm-add]") || b.matches("[data-spm-del]")) {
      const box = b.closest("[data-sp-memo]");
      const m = readMemo(box);
      if (b.matches("[data-spm-add]")) { if (!m.lines.length) m.lines.push(emptyLine()); m.lines.push(emptyLine()); }
      else m.lines.splice(Number(b.closest("[data-spm-i]").dataset.spmI), 1);
      box.outerHTML = memoHtml(groupByKey(box.dataset.spMemo));
      queueMemo(box.dataset.spMemo);
      if (b.matches("[data-spm-add]")) [...root.querySelectorAll(`[data-sp-memo="${CSS.escape(box.dataset.spMemo)}"] [data-spm-f="pname"]`)].pop()?.focus();
    }
    else if (b.matches("[data-sp-reload]")) load();
  });
  root.addEventListener("input", (e) => {
    if (e.target.matches?.("[data-sp-from], [data-sp-to], [data-sp-codeonly], [data-sp-q]")) return;
    const box = e.target.closest?.("[data-sp-memo]");
    if (!box) return;
    readMemo(box); queueMemo(box.dataset.spMemo);
    if (e.target.matches("[data-spm-name]")) { const h = box.closest(".is-memo-only")?.querySelector("header b"); if (h) h.textContent = `👤 ${e.target.value || "메모 슬롯"}`; }
  });
  // 날짜 = 달력 아이콘 두 개 (11-11) — 누르면 달력, 고르면 아이콘 옆에 날짜(월-일)
  const paintCal = () => { for (const k of ["from", "to"]) { const v = st[k]; const el = $(`[data-sp-cal="${k}"]`); if (el) el.textContent = v ? `📅 ${v.slice(5)}` : "📅"; } };
  root.addEventListener("click", (e) => { const inp = e.target.closest?.("[data-sp-from], [data-sp-to]"); if (inp) { try { inp.showPicker?.(); } catch { /* 달력 안 열리면 그대로 */ } } });
  root.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("[data-sp-q]")) { st.q = e.target.value.trim(); render(); } });
  root.addEventListener("change", (e) => {
    const t = e.target;
    if (t.matches?.("[data-sp-from]")) { st.from = t.value; paintCal(); render(); }
    else if (t.matches?.("[data-sp-to]")) { st.to = t.value; paintCal(); render(); }
    else if (t.matches?.("[data-sp-codeonly]")) { st.codeOnly = t.checked; render(); }
    else if (t.dataset.spMpick) { if (t.checked) st.pickedMemo.add(t.dataset.spMpick); else st.pickedMemo.delete(t.dataset.spMpick); render(); }
    else if (t.dataset.spPick) { if (t.checked) st.picked.add(t.dataset.spPick); else st.picked.delete(t.dataset.spPick); render(); }
    else if (t.dataset.spGpick) { for (const f of groupFiles(t.dataset.spGpick)) { if (t.checked) st.picked.add(f.id); else st.picked.delete(f.id); } render(); }
  });
  render();
  return { load, run, upload, state: st };
}
