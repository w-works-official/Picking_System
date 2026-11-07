// 📷 보조사진 · 마스터 사진 (2026-11-07) — 상품 관리 [상품찾기] · 피킹 사진창 ★ 이 같이 씀
//  · 저장 위치: 허브 Storage product-images/sellpia (로그인 없이 쓸 수 있는 유일한 폴더 — 11-07 확인)
//  · 마스터 사진 = 지금까지처럼 시스템 전체가 먼저 여는 사진 (코드.__priority.jpg → 코드.jpg → 묶음 → 범위 → 상품코드)
//  · 보조사진   = 코드.__sub1.jpg ~ 코드.__sub3.jpg (옵션 코드당 최대 3장) — 사진창·상품찾기에서만 불러옴
//  · ★ 마스터 바꾸기 = 맞바꾸기: 고른 보조사진 → 코드.__priority.jpg, 원래 마스터 → 그 보조사진 칸 (사진이 사라지지 않음)
export const HUB_URL = "https://bpgvqmtsjgegnrdzmpep.supabase.co";
export const HUB_KEY = "sb_publishable__NVp6Ra227_e1TQqQE40oA_O2PVwv5C";
export const BUCKET = "product-images";
export const FOLDER = "sellpia";
export const SUB_SLOTS = 3;
const PRIORITY = ".__priority";

const clean = (v) => String(v ?? "").trim();
const okCode = (v) => /^[0-9A-Za-z][0-9A-Za-z_.-]{0,59}$/.test(v) && !/\.__/.test(v);

export const subName = (sku, slot) => `${clean(sku)}.__sub${slot}.jpg`;
export const masterName = (sku) => `${clean(sku)}${PRIORITY}.jpg`;
export const isSubFile = (name) => /\.__sub[1-9]\.jpg$/i.test(clean(name));
export function parseSub(name) {
  const m = /^(.+)\.__sub([1-9])\.jpg$/i.exec(clean(name));
  return m ? { sku: m[1], slot: Number(m[2]) } : null;
}
export const publicUrl = (name, version = "") =>
  `${HUB_URL}/storage/v1/object/public/${BUCKET}/${FOLDER}/${encodeURIComponent(name)}${version ? `?v=${encodeURIComponent(version)}` : ""}`;
const objectUrl = (name) => `${HUB_URL}/storage/v1/object/${BUCKET}/${FOLDER}/${encodeURIComponent(name)}`;
const auth = { apikey: HUB_KEY, Authorization: `Bearer ${HUB_KEY}` };

// 마스터 사진 찾는 순서 — pickingApp 의 productImageUrl + productImageFallbackUrls 와 같은 순서
export function masterCandidates(sku) {
  const code = clean(sku);
  if (!code) return [];
  const m = /^(.+)-(\d+)$/.exec(code);
  const stems = m ? [code, `${code}.__group`, `${code}.__range`, m[1]] : [code];
  return [...stems.map((s) => `${s}${PRIORITY}.jpg`), ...stems.map((s) => `${s}.jpg`)];
}

// 보조사진 목록 (한 번 요청) → [{ slot, name, url }] 칸 번호 순
export async function listSubs(fetchImpl, sku) {
  const code = clean(sku);
  if (!okCode(code)) return [];
  const res = await fetchImpl(`${HUB_URL}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: FOLDER, search: `${code}.__sub`, limit: 20, offset: 0 }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`보조사진 목록 읽기 실패 (${res.status})`);
  const rows = await res.json();
  return subsFromList(code, rows);
}

export function subsFromList(sku, rows = []) {
  const out = [];
  for (const f of rows || []) {
    const p = parseSub(f?.name);
    if (!p || p.sku !== sku || p.slot > SUB_SLOTS) continue;
    out.push({ slot: p.slot, name: f.name, url: publicUrl(f.name, f.updated_at || f.created_at || "") });
  }
  return out.sort((a, b) => a.slot - b.slot);
}

export async function putPhoto(fetchImpl, name, blob) {
  const res = await fetchImpl(objectUrl(name), {
    method: "POST",
    headers: { ...auth, "Content-Type": "image/jpeg", "x-upsert": "true", "cache-control": "max-age=0" },
    body: blob,
  });
  if (!res.ok) throw new Error(`사진 저장 실패 (${res.status}) ${(await res.text().catch(() => "")).slice(0, 80)}`);
  return true;
}

export async function removePhoto(fetchImpl, name) {
  const res = await fetchImpl(objectUrl(name), { method: "DELETE", headers: auth });
  if (!res.ok && res.status !== 404 && res.status !== 400) throw new Error(`사진 지우기 실패 (${res.status})`);
  return true;
}

async function fetchBlob(fetchImpl, url) {
  const res = await fetchImpl(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) return null;
  const blob = await res.blob();
  return blob.size ? blob : null;
}

// 지금 마스터 사진 주소 (없으면 "") — 후보 순서대로 HEAD 로 확인
export async function findMaster(fetchImpl, sku) {
  for (const name of masterCandidates(sku)) {
    try {
      const res = await fetchImpl(`${publicUrl(name)}?t=${Date.now()}`, { method: "HEAD", cache: "no-store" });
      if (res.ok) return { name, url: publicUrl(name) };
    } catch { /* 다음 후보 */ }
  }
  return { name: "", url: "" };
}

// ★ 맞바꾸기: 보조사진 slot → 마스터(코드.__priority.jpg), 원래 마스터 → 보조사진 slot
//  · 두 사진을 먼저 다 받아 둔 뒤 쓰기 → 중간에 끊겨도 사진이 사라지지 않음 (최악이면 같은 사진이 두 칸)
export async function swapMaster(fetchImpl, { sku, slot, masterUrl = "" }) {
  const code = clean(sku);
  if (!okCode(code)) throw new Error("코드가 올바르지 않습니다");
  const subBlob = await fetchBlob(fetchImpl, publicUrl(subName(code, slot)));
  if (!subBlob) throw new Error("보조사진을 읽지 못했습니다");
  const oldMaster = masterUrl ? await fetchBlob(fetchImpl, masterUrl) : null;
  if (oldMaster) await putPhoto(fetchImpl, subName(code, slot), oldMaster);
  await putPhoto(fetchImpl, masterName(code), subBlob);
  if (!oldMaster) await removePhoto(fetchImpl, subName(code, slot)).catch(() => {});
  return { swapped: !!oldMaster };
}

// 사진 → JPEG (긴 변 최대 max px) — 브라우저 전용
export async function toJpeg(src, { max = 1600, quality = 0.85, document = globalThis.document } = {}) {
  let bmp;
  if (src instanceof Blob) bmp = await createImageBitmap(src, { imageOrientation: "from-image" }).catch(() => createImageBitmap(src));
  else bmp = src; // video / canvas / ImageBitmap
  const w0 = bmp.videoWidth || bmp.width, h0 = bmp.videoHeight || bmp.height;
  if (!w0 || !h0) throw new Error("사진 크기를 읽지 못했습니다");
  const k = Math.min(1, max / Math.max(w0, h0));
  const c = document.createElement("canvas");
  c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error("사진 변환 실패"))), "image/jpeg", quality));
}

// 등록 계획: 칸별 [저장 | 지우기] — slots = [{ slot, kind: "saved"|"new"|"empty", removed?, blob? }]
export function registerPlan(slots = [], saved = []) {
  const had = new Set(saved.map((s) => s.slot));
  const plan = [];
  for (const s of slots) {
    if (s.kind === "new" && s.blob) plan.push({ op: "put", slot: s.slot });
    else if (s.kind === "empty" && had.has(s.slot)) plan.push({ op: "remove", slot: s.slot });
  }
  return plan;
}

// 다음 빈 칸 (없으면 0)
export const nextEmpty = (slots = []) => (slots.find((s) => s.kind === "empty")?.slot || 0);
