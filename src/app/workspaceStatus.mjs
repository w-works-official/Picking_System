// 상단 오른쪽 연결 상태 (2026-11-02 대표님 요청): CS 관리·상품 관리 화면 같은 자리에 크게
//   러너(원격 실행 — 사무실·집) · 수집기 PC(G1 웹연결) · CS 시트 연결
// 트레이 아이콘을 러너 + G1 웹연결로 합친 것처럼, 화면에서도 두 프로그램 상태를 한 줄에 봅니다.
// CS 관리 화면은 수집기 PC·CS 연결 표시를 CS 화면이 직접 그리므로(같은 칸 id) 여기서는 러너만 채웁니다.
// 토큰은 각 화면이 이 기기에 저장해 둔 값만 읽습니다(코드에 비밀값 없음).
import { REMOTE_BOARD_STORAGE_KEY, REMOTE_BOARD_URL, isRemoteBoardTokenValid, remoteRunnerStates, remoteTokenFromCs } from "../domain/remoteBoard.mjs?v=20261104-pin1";
import { CS_BOARD_ENDPOINT, CS_BOARD_STORAGE_KEY, collectorStatus, isCsBoardTokenValid } from "../domain/csBoard.mjs?v=20261103-loginmemo1";

export const WS_RUNNER_POLL_MS = 30000; // 러너: 30초마다 (켜짐 판정이 60초 기준)
export const WS_SHEET_POLL_MS = 60000;  // CS 시트: 1분마다 (CS 화면 자동 새로고침과 같은 간격)

const DOT = { on: "●", busy: "◐", off: "○" };

function readJson(storage, key) {
  try {
    return JSON.parse(storage?.getItem(key) || "null") || {};
  } catch {
    return {};
  }
}

// 러너 칸: "러너 ● 사무실 · ○ 집" — 하나라도 켜져 있으면 초록, 실행 중이면 파랑, 모두 꺼지면 빨강
export function runnerPill({ hasToken = true, runners = null, queue = [], error = "" } = {}, nowMs = Date.now()) {
  if (!hasToken) return { cls: "is-off", text: "러너 —", title: "원격 실행 토큰이 이 기기에 없습니다 — 상품 관리 > 발주 [토큰]에서 6자리" };
  if (error || !runners) return { cls: error ? "is-error" : "is-off", text: "러너 —", title: error || "러너 상태 확인 중" };
  const list = remoteRunnerStates(runners, queue, nowMs);
  if (!list.length) return { cls: "is-off", text: "러너 —", title: "러너 신호 없음" };
  const cls = list.some((r) => r.state === "busy") ? "is-busy" : list.some((r) => r.state === "on") ? "is-on" : "is-error";
  return {
    cls,
    text: `러너 ${list.map((r) => `${DOT[r.state]} ${r.name}`).join(" · ")}`,
    title: list.map((r) => `${r.name} 러너: ${r.state === "busy" ? "작업 실행 중" : r.state === "on" ? "켜짐" : "꺼짐(1분 넘게 신호 없음)"}`).join("\n"),
  };
}

// 수집기 PC 칸 (CS 화면과 같은 글자): ● 켜짐 / ◐ 늦음 / ○ 꺼짐
export function collectorPill(raw, nowMs = Date.now()) {
  if (!raw) return { cls: "is-off", text: "수집기 PC —", title: "CS 시트 연결 후 보입니다" };
  const c = collectorStatus(raw, nowMs);
  const ago = Number.isFinite(c.ago) ? (c.ago < 60 ? `${c.ago}초 전` : `${Math.round(c.ago / 60)}분 전`) : "기록 없음";
  return {
    cls: c.state === "on" ? "is-on" : c.state === "late" ? "is-sample" : "is-error",
    text: `수집기 PC ${c.state === "on" ? "●" : c.state === "late" ? "◐" : "○"}`,
    title: `${c.pc || "수집기 PC"} · 마지막 신호 ${ago}${c.version ? ` · ${c.version}` : ""}`,
  };
}

export function csPill({ hasToken = true, ok = false, count = 0, error = "" } = {}) {
  if (!hasToken) return { cls: "is-off", text: "비밀번호 필요", title: "CS 관리 > [설정]에서 비밀번호를 한 번 넣으면 이 기기에서 같이 씁니다" };
  if (!ok) return { cls: error ? "is-error" : "is-off", text: error ? "연결 안 됨" : "연결 확인 중", title: error || "" };
  return { cls: "is-on", text: `연결됨 · ${count}건`, title: "CS 시트 연결됨" };
}

function paint(el, pill) {
  if (!el) return;
  el.classList.remove("is-on", "is-off", "is-error", "is-sample", "is-busy");
  el.classList.add(pill.cls);
  el.textContent = pill.text;
  el.title = pill.title || "";
}

export function mountWorkspaceStatus({ document, window, storage, fetchImpl = (...a) => window.fetch(...a), csEndpoint = CS_BOARD_ENDPOINT, remoteUrl = REMOTE_BOARD_URL } = {}) {
  const box = document.querySelector("[data-ws-status]");
  if (!box) return null;
  const page = box.dataset.wsStatus;          // "cs" = 러너만 / "purchase" = 셋 다
  const el = {
    runner: box.querySelector("[data-ws-runner]"),
    collector: page === "cs" ? null : box.querySelector("[data-ws-collector]"),
    cs: page === "cs" ? null : box.querySelector("[data-ws-cs]"),
  };
  const now = () => Date.now();

  let triedCs = false;
  async function runner() {
    let token = String(readJson(storage, REMOTE_BOARD_STORAGE_KEY).token || "").trim();
    if (!isRemoteBoardTokenValid(token) && !triedCs && csEndpoint) {   // 2026-11-04: CS 키가 있으면 시트에서 원격보드 토큰 받아 옴
      triedCs = true;
      token = await remoteTokenFromCs({ storage, fetchImpl, endpoint: csEndpoint, csStorageKey: CS_BOARD_STORAGE_KEY });
    }
    if (!isRemoteBoardTokenValid(token)) { paint(el.runner, runnerPill({ hasToken: false })); return; }
    try {
      const url = new URL(remoteUrl);
      url.searchParams.set("action", "queue");
      url.searchParams.set("n", "20");
      url.searchParams.set("token", token);
      const res = await fetchImpl(url.toString()).then((r) => (r.ok ? r.json() : { ok: false, error: `보드 응답 오류 (${r.status})` }));
      if (!res?.ok) throw new Error(res?.error || "보드 연결 실패");
      paint(el.runner, runnerPill({ runners: res.runners || {}, queue: res.queue || [] }, now()));
    } catch (error) {
      paint(el.runner, runnerPill({ error: `러너 확인 실패: ${error?.message || error}` }));
    }
  }

  async function sheet() {
    if (!el.collector && !el.cs) return;
    const token = String(readJson(storage, CS_BOARD_STORAGE_KEY).token || "").trim();
    if (!csEndpoint || !isCsBoardTokenValid(token)) {
      paint(el.cs, csPill({ hasToken: false }));
      paint(el.collector, collectorPill(null));
      return;
    }
    try {
      const res = await fetchImpl(csEndpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "list", token }) })
        .then((r) => (r.ok ? r.json() : { ok: false, error: `시트 응답 오류 (${r.status})` }));
      if (!res?.ok) throw new Error(res?.error || "시트 연결 실패");
      const open = (Array.isArray(res.rows) ? res.rows : []).filter((row) => row?.closed !== true).length;
      paint(el.cs, csPill({ ok: true, count: open }));
      paint(el.collector, collectorPill(res.collector ? { ...res.collector } : null, now()));
    } catch (error) {
      paint(el.cs, csPill({ error: error?.message || String(error) }));
      paint(el.collector, collectorPill(null));
    }
  }

  const visible = () => document.visibilityState !== "hidden";
  const tick = () => { runner(); sheet(); };
  tick();
  const timers = [
    window.setInterval(() => { if (visible()) runner(); }, WS_RUNNER_POLL_MS),
    window.setInterval(() => { if (visible()) sheet(); }, WS_SHEET_POLL_MS),
  ];
  document.addEventListener?.("visibilitychange", () => { if (visible()) tick(); });
  return { refresh: tick, stop: () => timers.forEach((t) => window.clearInterval(t)) };
}

if (typeof document !== "undefined" && document.querySelector("[data-ws-status]")) {
  mountWorkspaceStatus({ document, window, storage: (() => { try { return window.localStorage; } catch { return null; } })() });
}
