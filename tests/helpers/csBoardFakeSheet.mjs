// docs/cs-board-sheet.gs 를 가짜 구글 시트 위에서 돌리는 시험 도구 (실제 시트·실제 AI 호출 없음)
import { readFile } from "node:fs/promises";
import vm from "node:vm";

export function fakeSheet(name = "시트1") {
  const data = [];
  let sheetName = name;
  const strip = (v) => (typeof v === "string" && v.startsWith("'") ? v.slice(1) : v);
  const sheetObj = {
    data,
    setName(next) { sheetName = next; },
    getName: () => sheetName,
    getLastRow: () => data.length,
    writes: 0,
    getMaxRows() { return Math.max(1000, data.length); },
    insertRowsAfter() {},
    appendRow(row) { data.push(row.map(strip)); },
    setFrozenRows() {},
    getRange(row, col, rows = 1, cols = 1) {
      return {
        getValues: () => data.slice(row - 1, row - 1 + rows).map((r) => Array.from({ length: cols }, (_, i) => r[col - 1 + i] ?? "")),
        getDisplayValues: () => data.slice(row - 1, row - 1 + rows).map((r) => Array.from({ length: cols }, (_, i) => String(r[col - 1 + i] ?? ""))),
        clearContent() { for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (data[row - 1 + r]) data[row - 1 + r][col - 1 + c] = ""; },
        setNumberFormat() {},
        setValues(values) { sheetObj.writes++; values.forEach((vals, r) => { data[row - 1 + r] ||= []; vals.forEach((v, c) => { data[row - 1 + r][col - 1 + c] = strip(v); }); }); },
        getValue: () => data[row - 1]?.[col - 1] ?? "",
        setValue: (v) => { data[row - 1][col - 1] = strip(v); },
      };
    },
  };
  return sheetObj;
}

// claude(payload) → 가짜 AI 응답 문자열(답변 배열 JSON). status 를 바꾸면 오류 응답.
export async function loadCsBoardScript({ props = {}, claude, sheets, drive } = {}) {
  const source = await readFile(new URL("../../docs/cs-board-sheet.gs", import.meta.url), "utf8");
  const book = sheets || [fakeSheet()];
  const properties = { ...props };
  const calls = [];
  const logs = [];
  const fetchAllCalls = [];
  const cache = new Map();
  let timeZone = "America/New_York";
  const ctx = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSpreadsheetTimeZone: () => timeZone,
        setSpreadsheetTimeZone: (tz) => { timeZone = tz; },
        getSheetByName: (n) => book.find((s) => s.getName() === n) || null,
        getSheets: () => book,
        insertSheet: (n) => { const s = fakeSheet(n); book.push(s); return s; },
        deleteSheet: (sh) => { const i = book.indexOf(sh); if (i >= 0) book.splice(i, 1); },
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    // v11 원격 로그인: 임시 보관 (만료는 흉내 안 냄 · 100KB 넘으면 거절 = 실제 CacheService 와 같음)
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cache.has(k) ? cache.get(k) : null),
        getAll: (ks) => Object.fromEntries(ks.filter((k) => cache.has(k)).map((k) => [k, cache.get(k)])),
        put: (k, v) => { if (String(v).length > 100000) throw new Error("Argument too large"); cache.set(k, String(v)); },
        putAll: (o) => { for (const [k, v] of Object.entries(o)) { if (String(v).length > 100000) throw new Error("Argument too large"); cache.set(k, String(v)); } },
        remove: (k) => cache.delete(k),
        removeAll: (ks) => ks.forEach((k) => cache.delete(k)),
      }),
    },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (text) => ({ text, setMimeType() { return this; } }) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (Object.hasOwn(properties, k) ? properties[k] : null),
        setProperty: (k, v) => { properties[k] = String(v); },
        deleteProperty: (k) => { delete properties[k]; },
      }),
    },
    Utilities: {
      // 한국 시간 기준 간단한 날짜 글자 (yyyyMMdd / yyyy-MM-dd / yyMMddHHmmss)
      formatDate: (date, tz, fmt) => {
        const k = new Date(date.getTime() + 9 * 3600 * 1000).toISOString();
        const p = { yyyy: k.slice(0, 4), yy: k.slice(2, 4), MM: k.slice(5, 7), dd: k.slice(8, 10), HH: k.slice(11, 13), mm: k.slice(14, 16), ss: k.slice(17, 19) };
        return fmt.replace(/yyyy|yy|MM|dd|HH|mm|ss/g, (t) => p[t]);
      },
      base64Encode: (bytes) => Buffer.from(bytes).toString("base64"),
      getUuid: () => `${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`,
    },
    Logger: { log: (m) => logs.push(String(m)) },
    // v16 배송사진: drive = { folderId, files: [{ id, name, mime, created: Date, size, folder? }] } — setName 은 files 에 바로 반영
    ScriptApp: { getOAuthToken: () => "oauth-token" },
    DriveApp: {
      getFolderById(id) {
        if (!drive || id !== drive.folderId) throw new Error("폴더 없음 " + id);
        const iter = (list) => { let i = 0; return { hasNext: () => i < list.length, next: () => list[i++] }; };
        const fileObj = (f) => ({ getId: () => f.id, getName: () => f.name, getMimeType: () => f.mime, getSize: () => f.size || 1, getDateCreated: () => f.created || new Date("2026-11-10T00:00:00Z") });
        const subNames = [...new Set(drive.files.filter((f) => f.folder).map((f) => f.folder))];
        return {
          getName: () => "배송사진",
          getFiles: () => iter(drive.files.filter((f) => !f.folder).map(fileObj)),
          getFolders: () => iter(subNames.map((n) => ({ getName: () => n, getFiles: () => iter(drive.files.filter((f) => f.folder === n).map(fileObj)) }))),
        };
      },
      getFileById(id) {
        const f = drive?.files.find((x) => x.id === id);
        if (!f) throw new Error("파일 없음");
        return { setName: (n) => { if (drive.lockRename) throw new Error(drive.lockRename); f.name = n; } };  // drive.lockRename = "이유" → 이름 바꾸기 실패 시험
      },
    },
    UrlFetchApp: {
      fetch(url, options) {
        return reply(url, options);
      },
      fetchAll(requests) {
        fetchAllCalls.push(requests.length);
        return requests.map((r) => reply(r.url, r));
      },
    },
  };
  function reply(url, options) {
    if (!options?.payload) { // v13: 상품 사진 받기 (허브 공개 주소)
      calls.push({ url, image: true });
      const ok = !/missing/.test(url);
      return { getResponseCode: () => (ok ? 200 : 404), getBlob: () => ({ getContentType: () => "image/jpeg", getBytes: () => [1, 2, 3] }) };
    }
    const payload = JSON.parse(options.payload);
    calls.push({ url, headers: options.headers, payload });
    const answer = claude ? claude(payload) : { status: 200, text: JSON.stringify(["답변 하나", "답변 둘"]) };
    return {
      getResponseCode: () => answer.status ?? 200,
      getContentText: () => JSON.stringify({ content: [{ type: "text", text: answer.text }], usage: { input_tokens: 1000, output_tokens: 400 } }),
    };
  }
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).text);
  const get = (parameter = {}) => JSON.parse(ctx.doGet({ parameter }).text);
  return { ctx, post, get, sheets: book, sheet: () => book.find((s) => s.getName() === "CS문의"), jobs: () => book.find((s) => s.getName() === "요청"), properties, calls, logs, fetchAllCalls, timeZone: () => timeZone };
}
