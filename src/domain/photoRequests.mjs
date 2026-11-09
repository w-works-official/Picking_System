// 사진 요청 (2026-10-27 대표님 요청, 2026-10-28 저장 위치 변경)
// 사진이 안 뜨는 상품에서 "사진 요청"을 누르면 대표님 구글드라이브 A_총괄 폴더의
// 구글 시트 "System V3 사진요청"에 한 줄이 추가됩니다(시트에 붙인 Apps Script 웹앱이 받음).
// - 같은 상품을 다시 요청하면 줄이 늘지 않고 요청 시각만 바뀝니다.
// - 요청 취소·사진 등록 시에는 줄을 지우지 않고 "상태" 칸만 취소/완료로 바꿉니다.
// - 사진이 올라오면 앱 목록에서 자동으로 빠집니다(사진 존재 여부로 판단).
// 시트 주소(웹앱 URL)는 대표님이 배포 후 알려주신 값을 아래에 넣습니다. 비어 있으면 기능이 꺼진 상태입니다.
export const PHOTO_REQUEST_ENDPOINT = "https://script.google.com/macros/s/AKfycbzlVfpeKmU9cmS9KF0b3YL1KahUvYz1PKV6ip9p8a8BOB_nzDRU7x09d3cHclhMYxunzQ/exec";

const PRODUCT_PHOTO_SUFFIXES = [".__priority", ".__group", ".__range"];
const CODE_LIMIT = 80;
const TITLE_LIMIT = 300;

function clean(value, limit) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

export function normalizePhotoRequestCode(code) {
  return clean(code, CODE_LIMIT);
}

// The first image URL of an item photo is productImageUrl(code) =
// ".../sellpia/<code>.__priority.jpg?v=..". Recover <code> from it.
export function productCodeFromPhotoUrl(src) {
  const raw = String(src || "").split("?")[0];
  const last = raw.slice(raw.lastIndexOf("/") + 1);
  if (!/\.jpg$/i.test(last)) return "";
  let stem;
  try {
    stem = decodeURIComponent(last.replace(/\.jpg$/i, ""));
  } catch {
    return "";
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of PRODUCT_PHOTO_SUFFIXES) {
      if (stem.endsWith(suffix)) {
        stem = stem.slice(0, -suffix.length);
        changed = true;
      }
    }
  }
  return stem.trim();
}

export function buildPhotoRequestRecord({ code, title = "", productName = "", requestedAt = new Date().toISOString(), source = "" } = {}) {
  const normalizedCode = normalizePhotoRequestCode(code);
  if (!normalizedCode) throw new Error("셀피아코드가 없는 상품은 사진 요청을 할 수 없습니다.");
  return {
    code: normalizedCode,
    title: clean(title, TITLE_LIMIT),
    productName: clean(productName, TITLE_LIMIT),
    requestedAt: String(requestedAt || ""),
    source: clean(source, 40),
  };
}

// 11-09: 구글 시트가 "1588-11" 같은 셀피아코드를 날짜(1588년 11월)로 바꿔 버림 → 앞에 ' 를 붙여 글자로 저장
//  (시트 스크립트는 읽을 때 ' 를 떼고 비교하므로 닫기·채우기는 그대로 맞음)
export const sheetTextCode = (code) => `'${normalizePhotoRequestCode(code).replace(/^'+/, "")}`;

// 이미 날짜로 바뀐 칸 ("Tue Nov 01 1588 16:20:50 GMT+0827 (한국 표준시)") → 원래 코드 후보 ["1588-11", "1588-11-1", "1588-11-01"]
const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
export function sheetDateCodeCandidates(value) {
  const m = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{2}) (\d{1,6}) \d{2}:\d{2}:\d{2} GMT[+-]\d{4}/.exec(String(value || "").trim());
  if (!m) return [];
  const y = Number(m[3]), mo = MONTHS[m[1]], d = Number(m[2]);
  const pad = (n) => String(n).padStart(2, "0");
  const list = d === 1 ? [`${y}-${mo}`, `${y}-${mo}-1`, `${y}-${pad(mo)}`] : [`${y}-${mo}-${d}`, `${y}-${pad(mo)}-${pad(d)}`];
  return [...new Set(list)];
}

// Body sent to the sheet web app. Sent as text/plain so the browser does not need a preflight.
export function photoRequestAddPayload(record) {
  return { action: "add", code: sheetTextCode(record.code), title: record.title, productName: record.productName || "", source: record.source, requestedAt: record.requestedAt };
}

// 상품명이 비어 있는 요청 줄만 채웁니다(2026-10-28, 이미 있는 이름·시각은 그대로).
export function photoRequestFillNamesPayload(entries = []) {
  const seen = new Set();
  const items = [];
  for (const entry of entries || []) {
    const code = normalizePhotoRequestCode(entry?.code);
    const productName = clean(entry?.productName, TITLE_LIMIT);
    if (!code || !productName || seen.has(code)) continue;
    seen.add(code);
    items.push({ code, productName });
    if (items.length >= 50) break;
  }
  return { action: "fill", items };
}

export function photoRequestClosePayload(codes = [], reason = "취소") {
  const list = [...new Set((codes || []).map(normalizePhotoRequestCode).filter(Boolean))];
  return { action: "close", codes: list, reason: reason === "완료" ? "완료" : "취소" };
}

export function parsePhotoRequestResponse(json) {
  if (!json || typeof json !== "object") throw new Error("사진 요청 시트 응답을 읽지 못했습니다.");
  if (json.ok !== true) throw new Error(String(json.error || "사진 요청 시트가 요청을 거절했습니다."));
  const requests = Array.isArray(json.requests) ? json.requests : [];
  const records = [];
  const seen = new Set();
  for (const entry of requests) {
    const sheetCode = normalizePhotoRequestCode(entry?.code);
    if (!sheetCode || seen.has(sheetCode)) continue;
    seen.add(sheetCode);
    const candidates = sheetDateCodeCandidates(sheetCode);
    records.push({
      code: candidates[0] || sheetCode,
      sheetCode,
      candidates,
      title: clean(entry.title, TITLE_LIMIT),
      productName: clean(entry.productName, TITLE_LIMIT),
      requestedAt: String(entry.requestedAt || ""),
      source: clean(entry.source, 40),
    });
  }
  return { records, changed: Number(json.changed) || 0 };
}

export function sortPhotoRequests(records = []) {
  return [...records].sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)) || String(a.code).localeCompare(String(b.code), "en", { numeric: true }));
}
