// 📷 상품 사진 파일명 규칙 (11-10, 피킹 대시보드 「상품 사진 관리」와 같은 규칙 — pickingApp.mjs 에서 옮겨 씀)
//  · 8601.jpg = 공용 · 8601-2.jpg = 옵션 하나 · 8601-[1][3].jpg = 묶음(.__group) · 8601-[1-10].jpg = 범위(.__range)
//  · { } 로 감싸면 최우선(.__priority): {8601}.jpg · {8601-[1-10]}.jpg
export const PHOTO_MAX_DIMENSION = 2400;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export function photoFileStem(fileName) {
  const stem = String(fileName || "").trim().replace(/\.[^.]+$/, "").trim();
  if (!stem || stem === "." || stem === ".." || stem.length > 160 || /[\\/]/.test(stem)) return "";
  return stem;
}

export function photoFileRule(fileName) {
  const raw = photoFileStem(fileName);
  const m = raw.match(/^\{(.+)\}$/);
  if (!m) return { stem: raw, priority: false };
  const stem = String(m[1] || "").trim();
  if (!stem || stem.length > 160 || /[\\/{}]/.test(stem)) return { stem: "", priority: true };
  return { stem, priority: true };
}

// 파일명 → 저장할 셀피아 코드들
export function photoTargets(fileName) {
  const { stem } = photoFileRule(fileName);
  if (!stem) return [];
  const grouped = /^(.*)-((?:\[[^\]]+\])+)$/.exec(stem);
  if (!grouped) return [stem];
  const prefix = String(grouped[1] || "").trim();
  const src = grouped[2] || "";
  if (!prefix || prefix.length > 150 || /[\\/]/.test(prefix)) return [];
  const parts = [...src.matchAll(/\[([^\]]+)\]/g)].map((m) => String(m[1] || "").trim());
  if (!parts.length || parts.map((p) => `[${p}]`).join("") !== src) return [];
  const nums = new Set();
  for (const part of parts) {
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const a = Number(range[1]), b = Number(range[2]);
      if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a < 1 || b < a || b - a >= 200) return [];
      for (let v = a; v <= b; v += 1) nums.add(v);
      continue;
    }
    if (!/^\d+$/.test(part)) return [];
    const v = Number(part);
    if (!Number.isSafeInteger(v) || v < 1) return [];
    nums.add(v);
  }
  return [...nums].sort((a, b) => a - b).map((n) => `${prefix}-${n}`);
}

// "direct" | "group" | "range" | "" (형식 오류)
export function photoTier(fileName) {
  const { stem } = photoFileRule(fileName);
  const grouped = stem && /^(.*)-((?:\[[^\]]+\])+)$/.exec(stem);
  if (!grouped) return "direct";
  const parts = [...grouped[2].matchAll(/\[([^\]]+)\]/g)].map((m) => String(m[1] || "").trim());
  if (!parts.length) return "";
  if (parts.every((p) => /^\d+$/.test(p))) return "group";
  if (parts.every((p) => /^\d+\s*-\s*\d+$/.test(p))) return "range";
  return "";
}

export function photoStorageName(sku, tier = "direct", priority = false) {
  const base = tier === "group" ? `${sku}.__group` : tier === "range" ? `${sku}.__range` : String(sku || "").trim();
  return `${priority ? `${base}.__priority` : base}.jpg`;
}

export function photoFileAllowed(file) {
  const type = String(file?.type || "").toLowerCase();
  const name = String(file?.name || "").toLowerCase();
  return ["image/jpeg", "image/png", "image/webp"].includes(type) || /\.(jpe?g|png|webp)$/.test(name);
}

// 파일 하나 → 올릴 계획 { ok, error, names: [저장 파일 이름…], skus }
export function uploadPlan(file) {
  const name = String(file?.name || "");
  const skus = photoTargets(name);
  const tier = photoTier(name);
  const priority = photoFileRule(name).priority && skus.length > 0;
  if (!skus.length || !tier) return { ok: false, error: `${name}: 파일명 형식을 확인할 수 없음 (예: 8601.jpg, 8601-2.jpg, 8601-[1][3].jpg, 8601-[1-10].jpg, {8601}.jpg)`, names: [], skus: [] };
  if (!photoFileAllowed(file)) return { ok: false, error: `${name}: JPG, PNG, WEBP만 가능`, names: [], skus: [] };
  return { ok: true, error: "", skus, names: skus.map((s) => photoStorageName(s, tier, priority)) };
}
