// 🔍 사진으로 찾기 (2026-11-07) — AI 서비스 없이 기기 안에서 사진끼리 닮은 정도 비교 (순수 함수)
//  · 특징값 = MobileNetV2(ImageNet) 마지막 1280칸 → 고정 난수 투영 256칸 → 길이 1 → int8 (사진 1장 256바이트)
//  · 색인 글자: 1줄 머리 "v1\t256\t모델" + 사진마다 "파일이름\t수정표시\tbase64(256바이트)"
export const DIM_IN = 1280;
export const DIM = 256;
export const INDEX_HEAD = "v1";
export const MODEL_ID = "mnv2-f16-p256";
const SEED = 20261107;

// 고정 난수 (어느 기기에서 만들어도 같은 투영 행렬)
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let projCache = null;
export function projection() {
  if (projCache) return projCache;
  const rnd = mulberry32(SEED);
  const m = new Float32Array(DIM * DIM_IN);
  for (let i = 0; i < m.length; i += 2) {
    const u = Math.max(rnd(), 1e-12), v = rnd();
    const r = Math.sqrt(-2 * Math.log(u));
    m[i] = r * Math.cos(2 * Math.PI * v);
    if (i + 1 < m.length) m[i + 1] = r * Math.sin(2 * Math.PI * v);
  }
  projCache = m;
  return m;
}

// 1280칸 → 256칸, 평균 빼기 없이 투영 후 길이 1
export function project(feat) {
  const m = projection();
  const out = new Float32Array(DIM);
  let norm = 0;
  for (let i = 0; i < DIM; i++) {
    let s = 0;
    const row = i * DIM_IN;
    for (let j = 0; j < DIM_IN; j++) s += m[row + j] * feat[j];
    out[i] = s; norm += s * s;
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < DIM; i++) out[i] /= norm;
  return out;
}

export function quantize(vec) {
  let max = 0;
  for (const v of vec) max = Math.max(max, Math.abs(v));
  const q = new Int8Array(vec.length);
  const k = max ? 127 / max : 0;
  for (let i = 0; i < vec.length; i++) q[i] = Math.round(vec[i] * k);
  return q;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function bytesToB64(bytes) {
  const u = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let s = "";
  for (let i = 0; i < u.length; i += 3) {
    const n = (u[i] << 16) | ((u[i + 1] ?? 0) << 8) | (u[i + 2] ?? 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < u.length ? B64[(n >> 6) & 63] : "=") + (i + 2 < u.length ? B64[n & 63] : "=");
  }
  return s;
}
export function b64ToInt8(s, len = DIM) {
  const out = new Int8Array(len);
  let o = 0;
  for (let i = 0; i < s.length && o < len; i += 4) {
    const n = (B64.indexOf(s[i]) << 18) | (B64.indexOf(s[i + 1]) << 12) | ((B64.indexOf(s[i + 2]) & 63) << 6) | (B64.indexOf(s[i + 3]) & 63);
    const bytes = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    for (const b of bytes) { if (o < len) out[o++] = b > 127 ? b - 256 : b; }
  }
  return out;
}

// 사진 파일 이름 → 코드 (꼬리표 .__priority .__subN .__group .__range 를 뗌)
export function codeOfPhoto(name) {
  let stem = String(name || "").trim().replace(/\.jpg$/i, "");
  for (let again = true; again;) {
    again = false;
    const m = /^(.+)\.__(priority|sub\d|group|range)$/.exec(stem);
    if (m) { stem = m[1]; again = true; }
  }
  return stem;
}

// 수정 시각 → 짧은 표시 (바뀐 사진만 다시 계산)
export const stampOf = (updatedAt) => {
  const t = Date.parse(updatedAt || "");
  return Number.isFinite(t) ? Math.floor(t / 1000).toString(36) : "";
};

// ---------- 색인 글자 ⇄ 표 ----------
export function encodeIndex(entries = []) {
  const lines = [`${INDEX_HEAD}\t${DIM}\t${MODEL_ID}`];
  for (const e of entries) lines.push(`${e.name}\t${e.stamp || ""}\t${e.b64}`);
  return lines.join("\n");
}

export function decodeIndex(text = "") {
  const lines = String(text || "").split("\n");
  const head = (lines.shift() || "").split("\t");
  if (head[0] !== INDEX_HEAD || Number(head[1]) !== DIM) return { entries: [], names: [], vecs: new Int8Array(0), norms: new Float32Array(0), model: "" };
  const rows = lines.filter((l) => l.includes("\t"));
  const names = [], stamps = [], b64s = [];
  const vecs = new Int8Array(rows.length * DIM);
  const norms = new Float32Array(rows.length);
  rows.forEach((l, i) => {
    const [name, stamp, b64] = l.split("\t");
    names.push(name); stamps.push(stamp); b64s.push(b64);
    const v = b64ToInt8(b64);
    vecs.set(v, i * DIM);
    let n = 0;
    for (let k = 0; k < DIM; k++) n += v[k] * v[k];
    norms[i] = Math.sqrt(n) || 1;
  });
  // 가운데 맞추기: 색인 전체 평균 사진(m)을 빼고 비교 → 상관없는 사진 ≈ 0, 같은 상품 ↑
  const mean = new Float32Array(DIM);
  for (let i = 0; i < rows.length; i++) for (let k = 0; k < DIM; k++) mean[k] += vecs[i * DIM + k] / norms[i];
  for (let k = 0; k < DIM; k++) mean[k] /= rows.length || 1;
  let mm = 0;
  for (let k = 0; k < DIM; k++) mm += mean[k] * mean[k];
  const xm = new Float32Array(rows.length), cnorm = new Float32Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    let d = 0;
    for (let k = 0; k < DIM; k++) d += (vecs[i * DIM + k] / norms[i]) * mean[k];
    xm[i] = d;
    cnorm[i] = Math.sqrt(Math.max(1e-9, 1 - 2 * d + mm));
  }
  return { names, stamps, b64s, vecs, norms, mean, mm, xm, cnorm, model: head[2] || "" };
}

export function chunkText(text, size = 45000) {
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out.length ? out : [""];
}

// ---------- 찾기: 질문 특징값 여러 개(전체 · 가운데) 중 가장 닮은 값 → 코드별 최고 점수 ----------
export function searchIndex(index, queries = [], { limit = 30, center = true } = {}) {
  const n = index.names?.length || 0;
  const best = new Map(); // code → { code, score, name }
  const useC = center && index.mean && n > 1;
  const qInfo = queries.map((q) => {
    if (!useC) return { q, qm: 0, qn: 1 };
    let qm = 0;
    for (let k = 0; k < DIM; k++) qm += q[k] * index.mean[k];
    return { q, qm, qn: Math.sqrt(Math.max(1e-9, 1 - 2 * qm + index.mm)) };
  });
  for (let i = 0; i < n; i++) {
    const base = i * DIM;
    let top = -1;
    for (const { q, qm, qn } of qInfo) {
      let s = 0;
      for (let k = 0; k < DIM; k++) s += q[k] * index.vecs[base + k];
      s /= index.norms[i];
      if (useC) s = (s - qm - index.xm[i] + index.mm) / (qn * index.cnorm[i]);
      if (s > top) top = s;
    }
    const code = codeOfPhoto(index.names[i]);
    const prev = best.get(code);
    if (!prev || top > prev.score) best.set(code, { code, score: top, name: index.names[i] });
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

// ---------- 11-10 상품 단위 찾기: 마스터 + 보조 사진을 한 상품으로 묶어 닮은 순 ----------
//  · 상품 = 셀피아 코드의 옵션 번호를 뗀 것 (8601-2 → 8601, 8601 → 8601)
//  · 상품 점수 = 가장 닮은 사진 80% + 두 번째로 닮은 사진 20% (사진이 1장이면 그 사진 점수)
//    → 마스터·보조 여러 장이 고루 닮은 상품이, 한 장만 우연히 닮은 상품보다 위로
export const productOf = (code) => String(code || "").replace(/-\d+$/, "");
export const FINDER_TOPS = [3, 5, 10];

export function searchProducts(index, queries = [], { limit = 5, photos = 4, center = true } = {}) {
  const n = index.names?.length || 0;
  const useC = center && index.mean && n > 1;
  const qInfo = queries.map((q) => {
    if (!useC) return { q, qm: 0, qn: 1 };
    let qm = 0;
    for (let k = 0; k < DIM; k++) qm += q[k] * index.mean[k];
    return { q, qm, qn: Math.sqrt(Math.max(1e-9, 1 - 2 * qm + index.mm)) };
  });
  const groups = new Map(); // product → [{ name, code, score }]
  for (let i = 0; i < n; i++) {
    const base = i * DIM;
    let top = -1;
    for (const { q, qm, qn } of qInfo) {
      let s = 0;
      for (let k = 0; k < DIM; k++) s += q[k] * index.vecs[base + k];
      s /= index.norms[i];
      if (useC) s = (s - qm - index.xm[i] + index.mm) / (qn * index.cnorm[i]);
      if (s > top) top = s;
    }
    const code = codeOfPhoto(index.names[i]);
    const product = productOf(code);
    if (!groups.has(product)) groups.set(product, []);
    groups.get(product).push({ name: index.names[i], code, score: top });
  }
  const out = [];
  for (const [product, list] of groups) {
    list.sort((a, b) => b.score - a.score);
    const s1 = list[0].score, s2 = list.length > 1 ? list[1].score : s1;
    out.push({ product, score: 0.8 * s1 + 0.2 * s2, best: list[0], photos: list.slice(0, photos), count: list.length, codes: [...new Set(list.map((x) => x.code))] });
  }
  return out.sort((a, b) => b.score - a.score || a.product.localeCompare(b.product, "en", { numeric: true })).slice(0, limit);
}

// 비교 점수(가운데 맞춘 -1~1) → 화면 % (0.1 이하 0%, 0.8 이상 100%)
export const percentOf = (score) => Math.max(0, Math.min(100, Math.round(((score - 0.1) / 0.7) * 100)));

// 색인 갱신 계획: 지금 사진 목록 vs 저장된 색인 → 새로 계산할 것 · 그대로 둘 것
export function refreshPlan(files = [], index = { names: [], stamps: [], b64s: [] }) {
  const had = new Map(index.names.map((n, i) => [n, i]));
  const keep = [], todo = [];
  for (const f of files) {
    const name = String(f?.name || "");
    if (!/\.jpg$/i.test(name) || name.startsWith("__")) continue;
    const stamp = stampOf(f.updated_at || f.created_at);
    const i = had.get(name);
    if (i !== undefined && index.stamps[i] === stamp && index.b64s[i]) keep.push({ name, stamp, b64: index.b64s[i] });
    else todo.push({ name, stamp });
  }
  const now = new Set([...keep, ...todo].map((x) => x.name));
  return { keep, todo, removed: index.names.filter((n) => !now.has(n)).length };
}

// AI 가 준 낱말로 상품명 찾기: 낱말이 많이 맞는 순 (2개 이상 맞은 것만, 낱말이 1~2개면 1개)
export function keywordSearch(catalog = [], keywords = "", limit = 20) {
  const words = String(keywords || "").toLowerCase().split(/\s+/).filter((w) => w.length >= 1);
  if (!words.length) return [];
  const need = words.length <= 2 ? 1 : 2;
  const hits = [];
  for (const it of catalog) {
    const hay = `${it.name} ${it.option}`.toLowerCase();
    const n = words.filter((w) => hay.includes(w)).length;
    if (n >= need) hits.push({ it, n });
  }
  hits.sort((a, b) => b.n - a.n || a.it.sku.localeCompare(b.it.sku, "en", { numeric: true }));
  return hits.slice(0, limit).map((h) => h.it);
}
