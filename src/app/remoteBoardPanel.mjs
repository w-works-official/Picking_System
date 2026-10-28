// 사입 관리 > 발주·입고 의 "원격 실행" 버튼 (2026-10-28)
// 원격 실행 보드와 같은 Apps Script 큐에 작업을 넣고, 사무실 PC 러너가 실행합니다.
// 디자인은 보드와 같은 검정·회색. 카메라·사진이 필요한 버튼은 보드 화면으로 엽니다.
import {
  REMOTE_BOARD_PAGE,
  REMOTE_BOARD_STORAGE_KEY,
  REMOTE_BOARD_TOPICS,
  REMOTE_BOARD_URL,
  isRemoteBoardTokenValid,
  isRemoteSubJob,
  remoteBoardSections,
  remoteChip,
  remoteJobKind,
  remoteQueueByCode,
  remoteRunnerStates,
} from "../domain/remoteBoard.mjs?v=20261028-remote-board1";

const POLL_MS = 10000;

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function readToken(storage) {
  try {
    const saved = JSON.parse(storage.getItem(REMOTE_BOARD_STORAGE_KEY) || "null");
    return isRemoteBoardTokenValid(saved?.token) ? String(saved.token).trim() : "";
  } catch {
    return "";
  }
}

function writeToken(storage, token) {
  try {
    if (token) storage.setItem(REMOTE_BOARD_STORAGE_KEY, JSON.stringify({ token }));
    else storage.removeItem(REMOTE_BOARD_STORAGE_KEY);
  } catch {
    // Private mode: works for this page view only.
  }
}

export function createRemoteBoard({ document, window, fetchImpl = window.fetch.bind(window), storage = window.localStorage } = {}) {
  const state = {
    token: readToken(storage),
    jobs: [],
    queue: [],
    runners: {},
    user: "",
    loaded: false,
    loading: false,
    error: "",
    refreshedAt: "",
    setup: false,
    hidden: new Map(),
    busyCodes: new Set(),
  };
  const containers = () => [...document.querySelectorAll("[data-remote-board]")];
  let timer = 0;

  async function api(params = {}, body = null) {
    const url = new URL(REMOTE_BOARD_URL);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    url.searchParams.set("token", state.token);
    const options = body
      ? { method: "POST", body: JSON.stringify({ token: state.token, ...body }), headers: { "Content-Type": "text/plain;charset=utf-8" } }
      : {};
    const response = await fetchImpl(url.toString(), options);
    if (!response.ok) throw new Error(`보드 응답 오류 (${response.status})`);
    return response.json();
  }

  function toast(message) {
    const el = document.getElementById("purchase-toast");
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => { el.hidden = true; }, 2600);
  }

  function isHidden(id) {
    const until = state.hidden.get(id);
    if (!until) return false;
    if (Date.now() > until) { state.hidden.delete(id); return false; }
    return true;
  }

  function chipsHtml(list = []) {
    return list.map((row) => {
      const chip = remoteChip(row);
      const xTitle = chip.status === "대기" ? "대기 취소" : chip.running ? "실행 중지" : "표시 지우기";
      const files = chip.files.map((file) => (file.href
        ? `<a href="${esc(file.href)}" target="_blank" rel="noopener" title="${esc(file.name)}">${esc(file.label)}</a>`
        : `<span title="${esc(file.name)} (드라이브 동기화 중)">${esc(file.label)}</span>`)).join("");
      return `<span class="rb-chip"><span class="rb-chip-b"><span class="rb-st rb-st-${esc(chip.status)}">${esc(chip.status)}</span><button type="button" class="rb-x" data-remote-cancel="${esc(chip.id)}" data-remote-status="${esc(chip.status)}" title="${xTitle}">×</button><span class="rb-t">${esc(chip.time)}</span></span>${files ? `<span class="rb-files">${files}</span>` : ""}</span>`;
    }).join("");
  }

  function jobButton(job) {
    const kind = remoteJobKind(job);
    const code = esc(job["작업코드"]);
    const busy = state.busyCodes.has(job["작업코드"]) ? "disabled" : "";
    if (kind === "title") return "";
    if (kind === "board") return `<a class="rb-btn" href="${REMOTE_BOARD_PAGE}" target="_blank" rel="noopener" title="카메라·사진이 필요한 작업이라 원격 실행 보드에서 엽니다">보드에서</a>`;
    if (kind === "mock") return `<button type="button" class="rb-btn" data-remote-mock="${code}">적용</button>`;
    return `<button type="button" class="rb-btn" data-remote-run="${code}" ${busy}>적용</button>`;
  }

  function boardHtml(tab) {
    const runners = remoteRunnerStates(state.runners, state.queue)
      .map((runner) => `<span class="rb-runner rb-runner-${runner.state}" title="${esc(runner.name)} 러너 ${runner.state === "busy" ? "작업 실행 중" : runner.state === "on" ? "켜짐" : "꺼짐"}">${runner.state === "busy" ? "◐" : runner.state === "on" ? "●" : "○"} ${esc(runner.name)}</span>`)
      .join("");
    const head = `<div class="rb-head">
        <h3>원격 실행</h3>
        <span class="rb-runners">${runners}</span>
        <span class="rb-refreshed">${state.refreshedAt ? `${esc(state.refreshedAt)} 갱신` : ""}</span>
        <button type="button" class="rb-head-btn" data-remote-refresh ${state.loading ? "disabled" : ""}>새로고침</button>
        <button type="button" class="rb-head-btn" data-remote-setup>토큰</button>
      </div>`;
    if (!state.token || state.setup) {
      return `${head}<form class="rb-setup" data-remote-setup-form>
          <label>원격 실행 보드 토큰<input type="password" name="token" inputmode="numeric" autocomplete="off" maxlength="64" placeholder="보드에서 쓰는 숫자 토큰" required></label>
          <button type="submit" class="rb-btn rb-btn-dark">저장</button>
          ${state.token ? '<button type="button" class="rb-btn" data-remote-setup-cancel>닫기</button>' : ""}
          ${state.error ? `<p class="rb-error" role="alert">${esc(state.error)}</p>` : ""}
          <small>보드와 같은 토큰입니다. 확인되면 이 기기에만 저장됩니다.</small>
        </form>`;
    }
    if (state.error) return `${head}<div class="rb-empty">${esc(state.error)}</div>`;
    if (!state.loaded) return `${head}<div class="rb-empty">버튼 목록을 불러오는 중입니다.</div>`;
    const byCode = remoteQueueByCode(state.queue, isHidden);
    const sections = remoteBoardSections(state.jobs, REMOTE_BOARD_TOPICS[tab] || []);
    if (!sections.length) return `${head}<div class="rb-empty">보드에 이 메뉴의 버튼이 없습니다.</div>`;
    const body = sections.map((section) => {
      const headJob = section.headJob;
      const rows = section.rows.map((job) => {
        const kind = remoteJobKind(job);
        const desc = job["설명"] ? `<span class="rb-desc">${esc(job["설명"])}</span>` : "";
        return `<div class="rb-row${isRemoteSubJob(job) ? " rb-sub" : ""}${kind === "title" ? " rb-title" : ""}">
            <div class="rb-job"><span class="rb-name" title="${esc(job["설명"] || job["버튼이름"])}">${esc(job["버튼이름"])}${desc}</span>${jobButton(job)}</div>
            <div class="rb-stat">${kind === "title" ? "" : chipsHtml(byCode[job["작업코드"]])}</div>
          </div>`;
      }).join("");
      return `<section class="rb-group">
          <div class="rb-row rb-group-head">
            <div class="rb-job"><h4>${esc(section.topic)}</h4>${headJob ? `<button type="button" class="rb-btn rb-btn-dark" data-remote-run="${esc(headJob["작업코드"])}" title="${esc(headJob["설명"] || "")}">${esc(headJob["버튼이름"])}</button>` : ""}</div>
            <div class="rb-stat">${headJob ? chipsHtml(byCode[headJob["작업코드"]]) : ""}</div>
          </div>
          ${rows}
        </section>`;
    }).join("");
    return `${head}<div class="rb-body">${body}</div>`;
  }

  function render() {
    containers().forEach((container) => {
      container.innerHTML = boardHtml(container.dataset.remoteBoard);
    });
  }

  async function refreshQueue() {
    if (!state.token || !state.loaded) return;
    try {
      const res = await api({ action: "queue", n: 50 });
      if (!res.ok) return;
      state.queue = Array.isArray(res.queue) ? res.queue : [];
      state.runners = res.runners || state.runners;
      state.refreshedAt = new Date().toLocaleTimeString("ko-KR");
      render();
    } catch {
      // Keep the last view; the next poll retries.
    }
  }

  async function load() {
    if (!state.token) { render(); return; }
    state.loading = true;
    state.error = "";
    render();
    try {
      const res = await api({ action: "jobs" });
      if (!res.ok) {
        state.error = `보드 연결 실패: ${res.error || "토큰을 확인하세요"}`;
        state.setup = /토큰/.test(String(res.error || ""));
        return;
      }
      writeToken(storage, state.token);
      state.jobs = Array.isArray(res.jobs) ? res.jobs : [];
      state.runners = res.runners || {};
      state.user = res.user || "";
      state.loaded = true;
      await refreshQueue();
    } catch (error) {
      state.error = `보드 연결 실패: ${error?.message || error}`;
    } finally {
      state.loading = false;
      render();
    }
  }

  async function run(code) {
    const job = state.jobs.find((entry) => entry["작업코드"] === code);
    if (!job) return;
    if (!window.confirm(`'${job["버튼이름"]}' 을(를) 실행할까요?\n(사무실 PC 에서 실행됩니다)`)) return;
    state.busyCodes.add(code);
    render();
    try {
      const res = await api({}, { action: "enqueue", code, params: {} });
      toast(res.ok ? "요청 등록 — PC 러너가 곧 실행합니다" : `실패: ${res.error}`);
    } catch (error) {
      toast(`요청 실패: ${error?.message || error}`);
    } finally {
      state.busyCodes.delete(code);
      await refreshQueue();
      render();
    }
  }

  async function cancel(id, status) {
    const running = status === "실행중" || status === "중지요청";
    if (running && !window.confirm("실행 중인 작업을 중지할까요?\n(PC 에서 돌고 있는 프로그램을 강제로 끝냅니다)")) return;
    if (!running) { state.hidden.set(id, Date.now() + 60000); render(); }
    try {
      const res = await api({}, { action: "cancel", id });
      if (!res.ok) { state.hidden.delete(id); toast(`실패: ${res.error}`); }
      else if (running) toast(res.result === "중지요청" ? "중지 요청 — PC 러너가 곧 끊습니다" : "강제 종료 처리됨");
    } catch (error) {
      state.hidden.delete(id);
      toast(`요청 실패: ${error?.message || error}`);
    }
    await refreshQueue();
  }

  function onClick(event) {
    const target = event.target;
    const runBtn = target.closest("[data-remote-run]");
    if (runBtn) { if (!runBtn.disabled) void run(runBtn.dataset.remoteRun); return; }
    const cancelBtn = target.closest("[data-remote-cancel]");
    if (cancelBtn) { void cancel(cancelBtn.dataset.remoteCancel, cancelBtn.dataset.remoteStatus); return; }
    if (target.closest("[data-remote-mock]")) { toast("아직 사람이 하는 작업입니다 (버튼만 준비, 연결 예정)"); return; }
    if (target.closest("[data-remote-refresh]")) { void load(); return; }
    if (target.closest("[data-remote-setup]")) { state.setup = true; render(); return; }
    if (target.closest("[data-remote-setup-cancel]")) { state.setup = false; render(); }
  }

  function onSubmit(event) {
    const form = event.target.closest("[data-remote-setup-form]");
    if (!form) return;
    event.preventDefault();
    const token = String(form.elements.token.value || "").trim();
    if (!isRemoteBoardTokenValid(token)) { toast("토큰 형식이 맞지 않습니다."); return; }
    state.token = token;
    state.setup = false;
    state.loaded = false;
    void load();
  }

  function start() {
    containers().forEach((container) => {
      container.addEventListener("click", onClick);
      container.addEventListener("submit", onSubmit);
    });
    void load();
    timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshQueue();
    }, POLL_MS);
  }

  return { start, state, render, load, stop: () => window.clearInterval(timer) };
}

if (typeof document !== "undefined" && document.querySelector("[data-remote-board]")) {
  createRemoteBoard({ document, window }).start();
}
