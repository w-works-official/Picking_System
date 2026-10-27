// 사진 요청 (2026-10-27 대표님 요청)
// 사진이 안 뜨는 상품에서 "사진 요청"을 누르면 공유 저장소에 요청 파일 1개가 생깁니다.
// 기기마다 같은 목록을 보도록 피킹 프로젝트의 공유 버킷(system-v3-shared)의
// photo-requests/ 폴더를 씁니다. 상품 1개 = 파일 1개라서 동시에 눌러도 서로 덮어쓰지 않습니다.
// 사진이 올라오면 목록에서 자동으로 빠집니다(사진 존재 여부로 판단).
// 이 버킷은 CSV(text/csv)만 받으므로 요청 파일도 CSV 한 줄로 저장합니다(2026-10-27 수정).
// 삭제 권한이 없을 수 있어, 정리된 요청은 짧은 "closed" 파일로 덮어써서 표시합니다.
export const PHOTO_REQUEST_FOLDER = "photo-requests";
export const PHOTO_REQUEST_CONTENT_TYPE = "text/csv";
const PHOTO_REQUEST_COLUMNS = ["code", "title", "requestedAt", "source"];
// A real request always has the header line (34 bytes+); the closed marker is 7 bytes.
export const PHOTO_REQUEST_CLOSED_TEXT = "closed\n";
const PHOTO_REQUEST_MIN_OPEN_SIZE = 16;

const PRODUCT_PHOTO_SUFFIXES = [".__priority", ".__group", ".__range"];

// Storage object names allow only a limited character set; Sellpia codes are
// normally like "1000-1". Anything else becomes "_" (the real code is stored inside).
export function photoRequestFileName(code) {
  const safe = String(code || "").trim().replace(/[^A-Za-z0-9._-]/g, "_");
  return safe ? `${safe}.csv` : "";
}

export function photoRequestPath(code) {
  const name = photoRequestFileName(code);
  return name ? `${PHOTO_REQUEST_FOLDER}/${name}` : "";
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
  const normalizedCode = String(code || "").trim();
  if (!normalizedCode) throw new Error("셀피아코드가 없는 상품은 사진 요청을 할 수 없습니다.");
  return {
    code: normalizedCode,
    title: String(title || "").trim().slice(0, 300),
    requestedAt,
    source: String(source || "").slice(0, 40),
  };
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = String(text || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export function serializePhotoRequestRecord(record) {
  return `${PHOTO_REQUEST_COLUMNS.join(",")}\n${PHOTO_REQUEST_COLUMNS.map((key) => csvCell(record?.[key])).join(",")}\n`;
}

// Listing entries: a tiny "closed" file is a settled/cancelled request.
export function isOpenPhotoRequestEntry(entry) {
  const name = String(entry?.name || "");
  if (!/\.csv$/i.test(name)) return false;
  const size = Number(entry?.metadata?.size);
  return !(Number.isFinite(size) && size < PHOTO_REQUEST_MIN_OPEN_SIZE);
}

export function parsePhotoRequestRecord(text, fileName = "") {
  const rows = parseCsvRows(text).filter((cells) => cells.some((cell) => cell !== ""));
  if (rows.length < 2) return null;
  const header = rows[0].map((cell) => cell.trim());
  const values = Object.fromEntries(header.map((key, index) => [key, rows[1][index] ?? ""]));
  const code = String(values.code || "").trim();
  if (!code) return null;
  return {
    code,
    title: String(values.title || ""),
    requestedAt: String(values.requestedAt || ""),
    source: String(values.source || ""),
    fileName: String(fileName || ""),
  };
}

export function sortPhotoRequests(records = []) {
  return [...records].sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)) || String(a.code).localeCompare(String(b.code), "en", { numeric: true }));
}
