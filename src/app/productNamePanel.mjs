// 상품 관리 · 상품명 요청 화면 (2026-10-29) — [상품명 요청하기] → CS 시트 name → 후보 목록(복사 버튼).
// 비밀번호는 CS 관리 화면과 같은 칸(이 브라우저에 한 번 넣으면 같이 씀). 형태만 — 규칙은 나중에 셋팅.
import { CS_BOARD_ENDPOINT, CS_BOARD_STORAGE_KEY, isCsBoardTokenValid } from "../domain/csBoard.mjs?v=20261029-cs-update1";
import { NAME_COUNTS, NAME_DEFAULT_COUNT, nameRequestPayload, parseNameResponse } from "../domain/productNames.mjs?v=20261029-names1";

function readStored(storage) {
  try {
    const raw = JSON.parse(storage?.getItem(CS_BOARD_STORAGE_KEY) || "{}");
    return { token: isCsBoardTokenValid(raw.token) ? String(raw.token).trim() : "", editor: String(raw.editor || "").slice(0, 20), raw };
  } catch {
    return { token: "", editor: "", raw: {} };
  }
}

function writeToken(storage, token) {
  try {
    const raw = JSON.parse(storage?.getItem(CS_BOARD_STORAGE_KEY) || "{}");
    storage?.setItem(CS_BOARD_STORAGE_KEY, JSON.stringify({ ...raw, token }));
  } catch {
    // 저장 못 해도 이번 화면에서는 그대로 씀
  }
}

export function createProductNamePanel({ document, window, storage, fetch: doFetch = window.fetch.bind(window), endpoint = CS_BOARD_ENDPOINT }) {
  const root = document.querySelector("[data-product-names]");
  if (!root) return null;
  const stored = readStored(storage);
  const state = { token: stored.token, editor: stored.editor, busy: false, names: [] };

  root.innerHTML = `
    <form class="pn-form" novalidate>
      <label class="pn-label" for="pn-keywords">키워드 · 메모</label>
      <textarea id="pn-keywords" class="pn-keywords" rows="5" maxlength="2000" placeholder="예) 써지컬 스틸 링 피어싱, 볼 장식, 16G 8mm, 연골·귓바퀴"></textarea>
      <div class="pn-row">
        <label class="pn-count-label" for="pn-count">후보 개수</label>
        <select id="pn-count" class="pn-count">${NAME_COUNTS.map((n) => `<option value="${n}"${n === NAME_DEFAULT_COUNT ? " selected" : ""}>${n}개</option>`).join("")}</select>
        <span class="pn-token-wrap" hidden>
          <label class="pn-count-label" for="pn-token">CS 관리 비밀번호</label>
          <input id="pn-token" class="pn-token" type="password" autocomplete="off" spellcheck="false">
        </span>
        <button id="pn-submit" class="pn-submit" type="submit">상품명 요청하기</button>
      </div>
      <p class="pn-state" role="status" aria-live="polite"></p>
    </form>
    <ol class="pn-results" hidden></ol>
    <p class="pn-note">규칙은 CS 시트 [상품명 규칙] 탭 A1 에서 바꿉니다 (지금은 기본 규칙 — 나중에 셋팅). 요청·결과는 [상품명 요청] 탭에 남습니다.</p>`;

  const $ = (sel) => root.querySelector(sel);
  const form = $(".pn-form");
  const tokenWrap = $(".pn-token-wrap");
  const stateLine = $(".pn-state");
  const results = $(".pn-results");
  const submit = $("#pn-submit");

  function showToken(on) { tokenWrap.hidden = !on; }
  function say(text, tone = "") {
    stateLine.textContent = text;
    stateLine.dataset.tone = tone;
  }

  function renderNames() {
    results.hidden = !state.names.length;
    results.replaceChildren(...state.names.map((name) => {
      const li = document.createElement("li");
      li.className = "pn-item";
      const text = document.createElement("span");
      text.className = "pn-name";
      text.textContent = name;
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "pn-copy";
      copy.textContent = "복사";
      copy.dataset.name = name;
      li.append(text, copy);
      return li;
    }));
  }

  async function copyText(value) {
    try {
      await window.navigator.clipboard.writeText(value);
      return true;
    } catch {
      const area = document.createElement("textarea");
      area.value = value;
      document.body.append(area);
      area.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      area.remove();
      return ok;
    }
  }

  results.addEventListener("click", async (event) => {
    const button = event.target.closest(".pn-copy");
    if (!button) return;
    const ok = await copyText(button.dataset.name);
    button.textContent = ok ? "복사됨" : "복사 실패";
    window.setTimeout(() => { button.textContent = "복사"; }, 1500);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.busy) return;
    let payload;
    try {
      payload = nameRequestPayload({ keywords: $("#pn-keywords").value, count: $("#pn-count").value, editor: state.editor });
    } catch (error) {
      say(error.message, "bad");
      return;
    }
    const typed = $("#pn-token").value.trim();
    const token = state.token || typed;
    if (!isCsBoardTokenValid(token)) {
      showToken(true);
      say("CS 관리 비밀번호를 한 번 넣어 주세요 (CS 관리 화면과 같은 비밀번호).", "bad");
      $("#pn-token").focus();
      return;
    }
    state.busy = true;
    submit.disabled = true;
    say("상품명 만드는 중… (10~30초)", "run");
    try {
      const response = await doFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" }, // 사전 요청(preflight) 없이
        body: JSON.stringify({ ...payload, token }),
      });
      if (!response.ok) throw new Error(`시트 응답 오류 (${response.status})`);
      state.names = parseNameResponse(await response.json());
      if (!state.token) { state.token = token; writeToken(storage, token); } // 맞는 비밀번호일 때만 저장
      showToken(false);
      $("#pn-token").value = "";
      renderNames();
      say(`후보 ${state.names.length}개 — 마음에 드는 이름 옆 [복사]`, "ok");
    } catch (error) {
      if (error.denied) { state.token = ""; showToken(true); }
      say(error.message || "요청하지 못했습니다.", "bad");
    } finally {
      state.busy = false;
      submit.disabled = false;
    }
  });

  showToken(!state.token);
  return { state, root };
}

if (typeof document !== "undefined" && document.querySelector("[data-product-names]")) {
  createProductNamePanel({ document, window, storage: (() => { try { return window.localStorage; } catch { return null; } })() });
}
