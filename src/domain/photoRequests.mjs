// 사진 요청 (2026-10-27 대표님 요청, 2026-10-28 저장 위치 변경)
// 사진이 안 뜨는 상품에서 "사진 요청"을 누르면 대표님 구글드라이브 A_총괄 폴더의
// 구글 시트 "System V3 사진요청"에 한 줄이 추가됩니다(시트에 붙인 Apps Script 웹앱이 받음).
// - 같은 상품을 다시 요청하면 줄이 늘지 않고 요청 시각만 바뀝니다.
// - 요청 취소·사진 등록 시에는 줄을 지우지 않고 "상태" 칸만 취소/완료로 바꿉니다.
// - 사진이 올라오면 앱 목록에서 자동으로 빠집니다(사진 존재 여부로 판단).
// 시트 주소(웹앱 URL)는 대표님이 배포 후 알려주신 값을 아래에 넣습니다. 비어 있으면 기능이 꺼진 상태입니다.
export const PHOTO_REQUEST_ENDPOINT = "";

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

export function buildPhotoRequestRecord({ code, title = "", requestedAt = new Date().toISOString(), source = "" } = {}) {
  const normalizedCode = normalizePhotoRequestCode(code);
  if (!normalizedCode) throw new Error("셀피아코드가 없는 상품은 사진 요청을 할 수 없습니다.");
  return {
    code: normalizedCode,
    title: clean(title, TITLE_LIMIT),
    requestedAt: String(requestedAt || ""),
    source: clean(source, 40),
  };
}

// Body sent to the sheet web app. Sent as text/plain so the browser does not need a preflight.
export function photoRequestAddPayload(record) {
  return { action: "add", code: record.code, title: record.title, source: record.source, requestedAt: record.requestedAt };
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
    const code = normalizePhotoRequestCode(entry?.code);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    records.push({
      code,
      title: clean(entry.title, TITLE_LIMIT),
      requestedAt: String(entry.requestedAt || ""),
      source: clean(entry.source, 40),
    });
  }
  return { records, changed: Number(json.changed) || 0 };
}

export function sortPhotoRequests(records = []) {
  return [...records].sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)) || String(a.code).localeCompare(String(b.code), "en", { numeric: true }));
}
