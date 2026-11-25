// 피킹시스템 맨 위 ★ 공지 메모장 붙이기 (2026-11-11)
import { mountNotice } from "./pickingNotice.mjs?v=20261125-roll1";

const store = (name) => { try { return window[name]; } catch { return null; } };
// 11-25: 다른 화면(업무 관리 달력 옆 공지사항)이 같은 공지를 보고 고칠 수 있게 내놓음
window.SystemV3Notice = mountNotice({ document, window, host: document.getElementById("pk-notice"), storages: [store("localStorage"), store("sessionStorage")].filter(Boolean) });
window.dispatchEvent(new Event("system-v3-notice-ready"));
