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
    Utilities: { formatDate: (date) => date.toISOString().slice(0, 10).replace(/-/g, "") },
    UrlFetchApp: {
      fetch(url, options) {
        const payload = JSON.parse(options.payload);
        calls.push({ url, headers: options.headers, payload });
        const reply = claude ? claude(payload) : { status: 200, text: JSON.stringify(["답변 하나", "답변 둘"]) };
        return {
          getResponseCode: () => reply.status ?? 200,
          getContentText: () => JSON.stringify({ content: [{ type: "text", text: reply.text }] }),
        };
      },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).text);
  const get = () => JSON.parse(ctx.doGet({}).text);
  return { ctx, post, get, sheets: book, sheet: () => book.find((s) => s.getName() === "CS문의"), properties, calls, timeZone: () => timeZone };
}
