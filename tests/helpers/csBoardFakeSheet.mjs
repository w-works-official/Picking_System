// docs/cs-board-sheet.gs 를 가짜 구글 시트 위에서 돌리는 시험 도구 (실제 시트·실제 AI 호출 없음)
import { readFile } from "node:fs/promises";
import vm from "node:vm";

export function fakeSheet(name = "시트1") {
  const data = [];
  let sheetName = name;
  const strip = (v) => (typeof v === "string" && v.startsWith("'") ? v.slice(1) : v);
  return {
    data,
    setName(next) { sheetName = next; },
    getName: () => sheetName,
    getLastRow: () => data.length,
    appendRow(row) { data.push(row.map(strip)); },
    setFrozenRows() {},
    getRange(row, col, rows = 1, cols = 1) {
      return {
        getValues: () => data.slice(row - 1, row - 1 + rows).map((r) => Array.from({ length: cols }, (_, i) => r[col - 1 + i] ?? "")),
        setValues: (values) => values.forEach((vals, r) => vals.forEach((v, c) => { data[row - 1 + r][col - 1 + c] = strip(v); })),
        getValue: () => data[row - 1]?.[col - 1] ?? "",
        setValue: (v) => { data[row - 1][col - 1] = strip(v); },
      };
    },
  };
}

// claude(payload) → 가짜 AI 응답 문자열(답변 배열 JSON). status 를 바꾸면 오류 응답.
export async function loadCsBoardScript({ props = {}, claude, sheets } = {}) {
  const source = await readFile(new URL("../../docs/cs-board-sheet.gs", import.meta.url), "utf8");
  const book = sheets || [fakeSheet()];
  const properties = { ...props };
  const calls = [];
  const logs = [];
  const fetchAllCalls = [];
  let timeZone = "America/New_York";
  const ctx = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSpreadsheetTimeZone: () => timeZone,
        setSpreadsheetTimeZone: (tz) => { timeZone = tz; },
        getSheetByName: (n) => book.find((s) => s.getName() === n) || null,
        getSheets: () => book,
        insertSheet: (n) => { const s = fakeSheet(n); book.push(s); return s; },
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (text) => ({ text, setMimeType() { return this; } }) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (Object.hasOwn(properties, k) ? properties[k] : null),
        setProperty: (k, v) => { properties[k] = String(v); },
      }),
    },
    Utilities: {
      // 한국 시간 기준 간단한 날짜 글자 (yyyyMMdd / yyyy-MM-dd / yyMMddHHmmss)
      formatDate: (date, tz, fmt) => {
        const k = new Date(date.getTime() + 9 * 3600 * 1000).toISOString();
        const p = { yyyy: k.slice(0, 4), yy: k.slice(2, 4), MM: k.slice(5, 7), dd: k.slice(8, 10), HH: k.slice(11, 13), mm: k.slice(14, 16), ss: k.slice(17, 19) };
        return fmt.replace(/yyyy|yy|MM|dd|HH|mm|ss/g, (t) => p[t]);
      },
      getUuid: () => `${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`,
    },
    Logger: { log: (m) => logs.push(String(m)) },
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
  const get = () => JSON.parse(ctx.doGet({}).text);
  return { ctx, post, get, sheets: book, sheet: () => book.find((s) => s.getName() === "CS문의"), jobs: () => book.find((s) => s.getName() === "요청"), properties, calls, logs, fetchAllCalls, timeZone: () => timeZone };
}
