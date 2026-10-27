// 사진 요청 (2026-10-27 대표님 요청)
// 사진이 안 뜨는 상품에서 "사진 요청"을 누르면 공유 저장소에 요청 파일 1개가 생깁니다.
// 기기마다 같은 목록을 보도록 피킹 프로젝트의 공유 버킷(system-v3-shared)의
// photo-requests/ 폴더를 씁니다. 상품 1개 = 파일 1개라서 동시에 눌러도 서로 덮어쓰지 않습니다.
// 사진이 올라오면 목록에서 자동으로 빠집니다(사진 존재 여부로 판단).
export const PHOTO_REQUEST_FOLDER = "photo-requests";

const PRODUCT_PHOTO_SUFFIXES = [".__priority", ".__group", ".__range"];

// Storage object names allow only a limited character set; Sellpia codes are
// normally like "1000-1". Anything else becomes "_" (the real code is stored inside).
export function photoRequestFileName(code) {
  const safe = String(code || "").trim().replace(/[^A-Za-z0-9._-]/g, "_");
  return safe ? `${safe}.json` : "";
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

export function parsePhotoRequestRecord(text, fileName = "") {
  try {
    const value = JSON.parse(String(text || ""));
    const code = String(value?.code || "").trim();
    if (!code) return null;
    return {
      code,
      title: String(value.title || ""),
      requestedAt: String(value.requestedAt || ""),
      source: String(value.source || ""),
      fileName: String(fileName || ""),
    };
  } catch {
    return null;
  }
}

export function sortPhotoRequests(records = []) {
  return [...records].sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)) || String(a.code).localeCompare(String(b.code), "en", { numeric: true }));
}
