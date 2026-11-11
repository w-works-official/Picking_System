// 피킹시스템 맨 위 ★ 공지 메모장 붙이기 (2026-11-11)
import { mountNotice } from "./pickingNotice.mjs?v=20261111-notice1";

const store = (name) => { try { return window[name]; } catch { return null; } };
mountNotice({ document, window, host: document.getElementById("pk-notice"), storages: [store("localStorage"), store("sessionStorage")].filter(Boolean) });
