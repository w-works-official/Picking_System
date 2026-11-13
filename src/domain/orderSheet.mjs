// 📦 거래처 메신저 — 주문서(PT-LIST .xlsx) 읽기 · 업체별 묶기 · 슬롯 메모와 짝 맞추기 (2026-11-05)
//  · P_1 피어싱 / P_2 액세서리 PT-LIST: 첫 시트(DB) 머리줄 = 순번·사진·옵션명·발주량·임의필드·매입가·상품코드·매입처·상품명 …
//  · 사진은 B열 칸에 얹힌 그림(drawing) 또는 칸 안 그림(richData) → 그 줄에 붙임
//  · 매입처 '0-세븐피어싱 [ 1 ]' → 업체명 '세븐피어싱'
//  · 브라우저·node 공통 (압축 풀기 = DecompressionStream, 추가 부품 없음)

const enc = new TextDecoder("utf-8");

// ---------- zip ----------
export function zipEntries(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i -= 1) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("엑셀(xlsx) 파일이 아닙니다.");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = new Map();
  for (let k = 0; k < count; k += 1) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = enc.decode(u8.subarray(p + 46, p + 46 + nameLen));
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    out.set(name, { method, data: u8.subarray(start, start + size) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function inflate(entry) {
  if (!entry) return null;
  if (entry.method === 0) return entry.data;
  if (entry.method !== 8) throw new Error(`압축 방식 ${entry.method} 은 읽을 수 없습니다.`);
  const stream = new Blob([entry.data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readText(zip, name) {
  const b = await inflate(zip.get(name));
  return b ? enc.decode(b) : "";
}

// ---------- xml (정규식으로 필요한 것만) ----------
const unxml = (s) => String(s ?? "").replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e) => {
  const map = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
  if (map[e.toLowerCase()]) return map[e.toLowerCase()];
  return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
});
const attr = (tag, name) => { const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag); return m ? unxml(m[1]) : ""; };

function rels(xml, base) {
  const out = {};
  for (const m of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id"), target = attr(m[0], "Target");
    if (id && target) out[id] = resolve(base, target);
  }
  return out;
}

function resolve(base, target) {
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

const relsPath = (path) => path.replace(/([^/]+)$/, "_rels/$1.rels");

function colIndex(ref) {
  const letters = /^[A-Z]+/.exec(ref)?.[0] || "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp", webp: "image/webp" };
const mimeOf = (name) => MIME[(/\.([a-z0-9]+)$/i.exec(name)?.[1] || "").toLowerCase()] || "";

// ---------- 칸 색 (11-06: 발주량 칸 노랑 = 급한 상품) ----------
// styles.xml → 노랑으로 칠한 셀 서식 번호(s) 모음. 노랑 = 빨강·초록 높고 파랑 낮음 (FFFF00 · FFFFC000 계열은 아님: 주황 제외)
export function isYellow(argb) {
  const m = /^(?:[0-9a-f]{2})?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(argb || "").trim());
  if (!m) return false;
  const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16));
  return r >= 0xe0 && g >= 0xd8 && b <= 0x90;
}

export function yellowStyles(stylesXml = "") {
  const fillsXml = /<fills\b[^>]*>([\s\S]*?)<\/fills>/.exec(stylesXml)?.[1] || "";
  const yellowFill = [...fillsXml.matchAll(/<fill\b[^>]*>([\s\S]*?)<\/fill>|<fill\b[^>]*\/>/g)].map((m) => {
    const fg = /<fgColor\b[^>]*>/.exec(m[1] || "")?.[0] || "";
    return /patternType="solid"/.test(m[1] || "") && isYellow(attr(fg, "rgb"));
  });
  const xfsXml = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)?.[1] || "";
  const out = new Set();
  [...xfsXml.matchAll(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)].forEach((m, i) => {
    const fid = Number(attr(m[0].replace(/>[\s\S]*$/, ">"), "fillId"));
    if (yellowFill[fid]) out.add(i);
  });
  return out;
}

// ---------- 칸 색 전체 (11-12: 대표님이 칠한 색 그대로 표 그림에 — 금액 변동 빨강 등) ----------
// 엑셀 기본 색표(indexed 0~63)
const INDEXED = ("000000,FFFFFF,FF0000,00FF00,0000FF,FFFF00,FF00FF,00FFFF,000000,FFFFFF,FF0000,00FF00,0000FF,FFFF00,FF00FF,00FFFF," +
  "800000,008000,000080,808000,800080,008080,C0C0C0,808080,9999FF,993366,FFFFCC,CCFFFF,660066,FF8080,0066CC,CCCCFF," +
  "000080,FF00FF,FFFF00,00FFFF,800080,800000,008080,0000FF,00CCFF,CCFFFF,CCFFCC,FFFF99,99CCFF,FF99CC,CC99FF,FFCC99," +
  "3366FF,33CCCC,99CC00,FFCC00,FF9900,FF6600,666699,969696,003366,339966,003300,333300,993300,993366,333399,333333").split(",");

// theme1.xml → 테마 색 10개 (엑셀 순서: lt1·dk1·lt2·dk2·accent1~6 — 파일엔 dk1·lt1·dk2·lt2 순)
export function themeColors(themeXml = "") {
  const scheme = /<a:clrScheme\b[^>]*>([\s\S]*?)<\/a:clrScheme>/.exec(themeXml)?.[1] || "";
  const pick = (name) => {
    const m = new RegExp(`<a:${name}>([\\s\\S]*?)<\\/a:${name}>`).exec(scheme)?.[1] || "";
    return (/srgbClr val="([0-9A-Fa-f]{6})"/.exec(m) || /lastClr="([0-9A-Fa-f]{6})"/.exec(m))?.[1]?.toUpperCase() || "";
  };
  const [dk1, lt1, dk2, lt2] = ["dk1", "lt1", "dk2", "lt2"].map(pick);
  return [lt1 || "FFFFFF", dk1 || "000000", lt2 || "E7E6E6", dk2 || "44546A", ...[1, 2, 3, 4, 5, 6].map((i) => pick(`accent${i}`))];
}

// 밝기 조절(tint): 엑셀 방식 — 0보다 크면 흰색 쪽, 작으면 검정 쪽
function applyTint(hex, tint) {
  if (!tint) return hex;
  return hex.match(/../g).map((h) => {
    const v = parseInt(h, 16);
    const n = tint < 0 ? v * (1 + tint) : v + (255 - v) * tint;
    return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  }).join("").toUpperCase();
}

// <fgColor rgb|theme|indexed tint> → "#RRGGBB" (못 읽으면 "")
export function colorOf(tag = "", theme = []) {
  if (!tag) return "";
  let hex = "";
  const rgb = attr(tag, "rgb"), th = attr(tag, "theme"), ix = attr(tag, "indexed");
  if (/^[0-9a-f]{6,8}$/i.test(rgb)) hex = rgb.slice(-6).toUpperCase();
  else if (th !== "" && theme[Number(th)]) hex = theme[Number(th)];
  else if (ix !== "" && INDEXED[Number(ix)]) hex = INDEXED[Number(ix)];
  if (!hex) return "";
  const tint = Number(attr(tag, "tint") || 0);
  return `#${applyTint(hex, Number.isFinite(tint) ? tint : 0)}`;
}

// styles.xml → 셀 서식 번호(s) → 칠한 색 "#RRGGBB" (흰색·칠 없음은 빼고)
export function fillStyles(stylesXml = "", theme = []) {
  const fillsXml = /<fills\b[^>]*>([\s\S]*?)<\/fills>/.exec(stylesXml)?.[1] || "";
  const fillColor = [...fillsXml.matchAll(/<fill\b[^>]*>([\s\S]*?)<\/fill>|<fill\b[^>]*\/>/g)].map((m) => {
    const body = m[1] || "";
    if (!/patternType="solid"/.test(body)) return "";
    const c = colorOf(/<fgColor\b[^>]*>/.exec(body)?.[0] || "", theme);
    return c && c !== "#FFFFFF" ? c : "";
  });
  const xfsXml = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)?.[1] || "";
  const out = new Map();
  [...xfsXml.matchAll(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)].forEach((m, i) => {
    const fid = Number(attr(m[0].replace(/>[\s\S]*$/, ">"), "fillId"));
    if (fillColor[fid]) out.set(i, fillColor[fid]);
  });
  return out;
}

// ---------- 업체명 ----------
// '0-세븐피어싱 [ 1 ]' → '세븐피어싱'
export function vendorName(raw) {
  return String(raw ?? "").replace(/\[\s*\d+\s*\]\s*$/, "").replace(/^\s*\d+\s*-\s*/, "").trim();
}

export function normName(s) {
  return vendorName(s).replace(/\s+/g, "").toLowerCase();
}

// 업체명 ↔ 슬롯 메모: 메모(2글자 이상)가 업체명에 들어 있거나 업체명이 메모에 들어 있으면 짝 (가장 긴 메모 먼저). 없으면 -1
export function matchSlot(vendor, names = []) {
  const v = normName(vendor);
  if (!v) return -1;
  let best = -1, len = 0;
  names.forEach((n, i) => {
    const k = normName(n);
    if (k.length >= 2 && (v.includes(k) || k.includes(v)) && k.length > len) { best = i; len = k.length; }
  });
  return best;
}

// '세븐피어싱_1105.jpg' · '세븐피어싱_1105_2.jpg' (kakao_order_send 가 만든 사진) → { vendor, n }
export function vendorFromFileName(name) {
  const m = /^(.+?)_(\d{4})(?:_(\d+))?\.(jpe?g|png)$/i.exec(String(name || "").split(/[\\/]/).pop());
  return m ? { vendor: m[1].trim(), n: Number(m[3] || 1) } : null;
}

// ---------- 주문서 읽기 ----------
const HEAD = { no: "순번", photo: "사진", option: "옵션명", qty: "발주량", extra: "임의필드", price: "매입가", code: "상품코드", vendor: "매입처", product: "상품명" };

export async function readOrderSheet(bytes) {
  const zip = zipEntries(bytes);
  const wbPath = "xl/workbook.xml";
  const wb = await readText(zip, wbPath);
  if (!wb) throw new Error("엑셀(xlsx) 파일이 아닙니다.");
  const wbRels = rels(await readText(zip, relsPath(wbPath)), wbPath);
  const first = /<sheet\b[^>]*>/.exec(wb)?.[0] || "";
  const sheetPath = wbRels[attr(first, "r:id")] || "xl/worksheets/sheet1.xml";
  const shared = [];
  const ss = await readText(zip, "xl/sharedStrings.xml");
  for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(unxml([...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  const sheet = await readText(zip, sheetPath);
  const stylesXml = await readText(zip, "xl/styles.xml");
  const yellowXf = yellowStyles(stylesXml);   // 11-06: 노랑 칠한 칸 = 급한 상품
  const colorXf = fillStyles(stylesXml, themeColors(await readText(zip, "xl/theme/theme1.xml")));   // 11-12: 칠한 색 전부
  const fills = new Map();              // "줄,칸" → 노랑이면 true
  const colors = new Map();             // "줄,칸" → "#RRGGBB" (칠한 색)
  const rowColor = new Map();           // 줄 → 줄 전체를 칠한 색 (<row s=… customFormat=1>)
  for (const m of sheet.matchAll(/<row\b([^>]*)>/g)) {
    const r = Number(attr(m[1], "r")), xf = attr(m[1], "s");
    if (r && xf && attr(m[1], "customFormat") === "1" && colorXf.has(Number(xf))) rowColor.set(r, colorXf.get(Number(xf)));
  }
  const grid = new Map();               // 줄(1부터) → { 칸(0부터): 값 }
  const cellImage = new Map();          // "줄,칸" → vm (칸 안 그림)
  for (const m of sheet.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const ref = attr(m[1], "r");
    if (!ref) continue;
    const row = Number(/\d+$/.exec(ref)?.[0]), col = colIndex(ref);
    const t = attr(m[1], "t"), vm = attr(m[1], "vm");
    if (vm) cellImage.set(`${row},${col}`, Number(vm));
    const xf = attr(m[1], "s");
    if (xf && yellowXf.has(Number(xf))) fills.set(`${row},${col}`, true);
    if (xf !== "") colors.set(`${row},${col}`, colorXf.get(Number(xf)) || "");   // 칸에 서식이 있으면 그 색(없으면 "" = 칠 없음)
    const body = m[2] || "";
    let v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
    if (t === "inlineStr") v = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("");
    if (v === undefined) continue;
    v = t === "s" ? shared[Number(v)] ?? "" : unxml(v);
    if (!grid.has(row)) grid.set(row, {});
    grid.get(row)[col] = String(v).trim();
  }
  // 머리줄 (매입처가 있는 첫 줄)
  const rowsSorted = [...grid.keys()].sort((a, b) => a - b);
  const headRow = rowsSorted.find((r) => Object.values(grid.get(r)).includes(HEAD.vendor));
  if (!headRow) throw new Error("머리줄(매입처·옵션명·발주량)을 찾지 못했습니다 — PT-LIST 주문서가 맞는지 확인해 주세요.");
  const cols = {};
  for (const [c, v] of Object.entries(grid.get(headRow))) for (const [k, name] of Object.entries(HEAD)) if (v === name && cols[k] === undefined) cols[k] = Number(c);
  // 그림: 시트에 얹힌 그림(drawing) → 왼쪽 위가 걸친 줄
  const images = new Map();             // 줄 → [{ name, mime, path }]
  const add = (row, path) => { if (!path || !mimeOf(path)) return; if (!images.has(row)) images.set(row, []); images.get(row).push({ path, name: path.split("/").pop(), mime: mimeOf(path) }); };
  const sheetRels = rels(await readText(zip, relsPath(sheetPath)), sheetPath);
  for (const target of Object.values(sheetRels)) {
    if (!/drawings\/drawing\d*\.xml$/.test(target)) continue;
    const dxml = await readText(zip, target);
    const drels = rels(await readText(zip, relsPath(target)), target);
    for (const a of dxml.matchAll(/<xdr:(twoCellAnchor|oneCellAnchor)\b[\s\S]*?<\/xdr:\1>/g)) {
      const from = /<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/.exec(a[0]);
      const embed = /r:embed="([^"]+)"/.exec(a[0]);
      if (from && embed) add(Number(from[1]) + 1, drels[embed[1]]);
    }
  }
  // 칸 안 그림 (Excel '셀에 그림 넣기' = richData)
  if (cellImage.size && zip.has("xl/richData/rdrichvalue.xml")) {
    const rv = [...(await readText(zip, "xl/richData/rdrichvalue.xml")).matchAll(/<rv\b[^>]*>([\s\S]*?)<\/rv>/g)].map((m) => Number(/<v>(\d+)<\/v>/.exec(m[1])?.[1]));
    const relXml = await readText(zip, "xl/richData/richValueRel.xml");
    const relIds = [...relXml.matchAll(/<rel\b[^>]*r:id="([^"]+)"/g)].map((m) => m[1]);
    const relMap = rels(await readText(zip, "xl/richData/_rels/richValueRel.xml.rels"), "xl/richData/richValueRel.xml");
    for (const [key, vm] of cellImage) {
      const idx = rv[vm - 1];
      const path = Number.isFinite(idx) ? relMap[relIds[idx]] : "";
      add(Number(key.split(",")[0]), path);
    }
  }
  // 11-12: 칸마다 칠한 색 { no, photo, option, … } — 칸 서식이 없으면 줄 서식 색
  const cellColors = (r) => {
    const out = {};
    for (const [k, c] of Object.entries(cols)) {
      const key = `${r},${c}`;
      const color = colors.has(key) ? colors.get(key) : rowColor.get(r) || "";
      if (color) out[k] = color;
    }
    return out;
  };
  const lines = [];
  for (const r of rowsSorted) {
    if (r <= headRow) continue;
    const g = grid.get(r);
    const get = (k) => (cols[k] === undefined ? "" : g[cols[k]] || "");
    const vendorRaw = get("vendor");
    if (!vendorRaw && !get("option") && !get("qty")) continue;
    lines.push({ row: r, no: get("no"), option: get("option"), qty: get("qty"), extra: get("extra"), price: get("price"), code: get("code"),
      vendorRaw, vendor: vendorName(vendorRaw), product: get("product"), images: images.get(r) || [],
      urgent: cols.qty !== undefined && fills.has(`${r},${cols.qty}`),
      colors: cellColors(r) });
  }
  return {
    lines,
    columns: Object.keys(cols),
    image: async (img) => { const data = await inflate(zip.get(img.path)); return data ? { data, mime: img.mime } : null; },
  };
}

// 업체별 묶기 (주문서 순서 그대로) — 업체명 없는 줄은 '(매입처 없음)'
export function groupByVendor(lines = []) {
  const out = new Map();
  for (const line of lines) {
    const key = line.vendor || "(매입처 없음)";
    if (!out.has(key)) out.set(key, { vendor: key, raw: line.vendorRaw, lines: [] });
    out.get(key).lines.push(line);
  }
  return [...out.values()];
}
