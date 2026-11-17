// 📥 F_1 PC_LIST · F_2 AC_LIST (.xlsm) — '메인' 탭 S열 "입고" 에 숫자 넣기 (2026-11-17)
//  · 읽기: 메인 탭 A 순번 · B 매입처 · D 상품코드 · Q 발주량 · S 입고 (수식 칸은 엑셀이 저장해 둔 값)
//  · 쓰기: S 칸만 숫자로 바꾸고 연한 분홍으로 칠함 — 나머지(매크로 vbaProject.bin · 다른 시트 · 수식)는 그대로 복사
//  · 브라우저·node 공통 (압축 = CompressionStream / DecompressionStream, 추가 부품 없음)
import { normName, vendorName } from "./orderSheet.mjs?v=20261112-color1";

export const IN_COL = "S";                 // 메인 탭 '입고'
export const IN_FILL = "FFFFC7CE";         // 연한 분홍 (주문서 매입가 0 칸과 같은 색)
const dec = new TextDecoder("utf-8");
const encU = new TextEncoder();

// ---------- zip 읽기 (중앙 목록 그대로 보관 → 다시 쓸 때 안 바뀐 파일은 압축 데이터 그대로) ----------
export function zipRead(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i -= 1) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("엑셀 파일이 아닙니다.");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const list = [];
  for (let k = 0; k < count; k += 1) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("엑셀 파일 목록이 깨져 있습니다.");
    const e = {
      verMade: dv.getUint16(p + 4, true), verNeed: dv.getUint16(p + 6, true), flags: dv.getUint16(p + 8, true), method: dv.getUint16(p + 10, true),
      time: dv.getUint16(p + 12, true), date: dv.getUint16(p + 14, true), crc: dv.getUint32(p + 16, true),
      csize: dv.getUint32(p + 20, true), usize: dv.getUint32(p + 24, true),
      intAttr: dv.getUint16(p + 36, true), extAttr: dv.getUint32(p + 38, true),
    };
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    e.nameBytes = u8.slice(p + 46, p + 46 + nameLen);
    e.name = dec.decode(e.nameBytes);
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    e.data = u8.subarray(start, start + e.csize);
    list.push(e);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return list;
}

async function inflateEntry(e) {
  if (e.method === 0) return e.data;
  if (e.method !== 8) throw new Error(`압축 방식 ${e.method} 은 읽을 수 없습니다.`);
  const s = new Blob([e.data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function deflateRaw(u8) {
  const s = new Blob([u8]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
let CRC_T = null;
export function crc32(u8) {
  if (!CRC_T) { CRC_T = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i += 1) c = CRC_T[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// 바뀐 파일(name → 새 글)만 다시 압축해서 zip 다시 만들기
export async function zipWrite(list, changed = new Map()) {
  const parts = [], central = [];
  let off = 0;
  for (const src of list) {
    const e = { ...src };
    if (changed.has(e.name)) {
      const raw = typeof changed.get(e.name) === "string" ? encU.encode(changed.get(e.name)) : changed.get(e.name);
      e.data = await deflateRaw(raw); e.method = 8; e.crc = crc32(raw); e.usize = raw.length; e.csize = e.data.length;
    }
    e.flags &= ~0x0008;                                  // 크기·CRC 를 머리에 바로 적음 (뒤 설명 없음)
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, e.verNeed, true); lh.setUint16(6, e.flags, true); lh.setUint16(8, e.method, true);
    lh.setUint16(10, e.time, true); lh.setUint16(12, e.date, true); lh.setUint32(14, e.crc, true); lh.setUint32(18, e.csize, true); lh.setUint32(22, e.usize, true);
    lh.setUint16(26, e.nameBytes.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), e.nameBytes, e.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, e.verMade, true); ch.setUint16(6, e.verNeed, true); ch.setUint16(8, e.flags, true); ch.setUint16(10, e.method, true);
    ch.setUint16(12, e.time, true); ch.setUint16(14, e.date, true); ch.setUint32(16, e.crc, true); ch.setUint32(20, e.csize, true); ch.setUint32(24, e.usize, true);
    ch.setUint16(28, e.nameBytes.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true);
    ch.setUint16(36, e.intAttr, true); ch.setUint32(38, e.extAttr, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), e.nameBytes);
    off += 30 + e.nameBytes.length + e.data.length;
  }
  const cdSize = central.reduce((s, b) => s + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, list.length, true); end.setUint16(10, list.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, b) => s + b.length, 0));
  let q = 0;
  for (const b of all) { out.set(b, q); q += b.length; }
  return out;
}

// ---------- xml ----------
const unxml = (s) => String(s ?? "").replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e) => {
  const map = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
  if (map[e.toLowerCase()]) return map[e.toLowerCase()];
  return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
});
const attr = (tag, name) => { const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag); return m ? unxml(m[1]) : ""; };
const colNo = (letters) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const colOf = (ref) => colNo(/^[A-Z]+/.exec(ref)?.[0] || "A");

async function textOf(list, name) {
  const e = list.find((x) => x.name === name);
  return e ? dec.decode(await inflateEntry(e)) : "";
}
function resolvePath(target) {
  const t = String(target || "").replace(/^\/+/, "");
  return t.startsWith("xl/") ? t : `xl/${t.replace(/^\.\//, "")}`;
}

// 메인 탭 시트 파일 경로
export async function mainSheetPath(list, tab = "메인") {
  const wb = await textOf(list, "xl/workbook.xml");
  const sheetTag = [...wb.matchAll(/<sheet\b[^>]*\/?>/g)].map((m) => m[0]).find((t) => attr(t, "name") === tab);
  if (!sheetTag) return "";
  const rid = attr(sheetTag, "r:id");
  const rels = await textOf(list, "xl/_rels/workbook.xml.rels");
  const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((t) => attr(t, "Id") === rid);
  return rel ? resolvePath(attr(rel, "Target")) : "";
}

// 메인 탭 줄 [{ row, no, vendorRaw, vendor, code, order, inQty }]
export async function readStockMain(bytes) {
  const list = zipRead(bytes);
  const path = await mainSheetPath(list);
  if (!path) throw new Error("'메인' 탭이 없습니다 — F_1 PC_LIST · F_2 AC_LIST 파일이 맞는지 확인해 주세요.");
  const shared = [];
  for (const m of (await textOf(list, "xl/sharedStrings.xml")).matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(unxml([...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  const xml = await textOf(list, path);
  const rows = [];
  for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const r = Number(attr(rm[1], "r"));
    if (!r || r < 2) continue;
    const cell = {};
    for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(cm[1], "r"), t = attr(cm[1], "t");
      let v = /<v>([\s\S]*?)<\/v>/.exec(cm[2] || "")?.[1];
      if (t === "inlineStr") v = [...(cm[2] || "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("");
      if (v === undefined) continue;
      cell[colOf(ref)] = String(t === "s" ? shared[Number(v)] ?? "" : unxml(v)).trim();
    }
    const vendorRaw = cell[2] || "";
    if (!vendorRaw) continue;
    rows.push({ row: r, no: cell[1] || "", vendorRaw, vendor: vendorName(vendorRaw), code: cell[4] || "", order: cell[17] || "", inQty: cell[19] || "" });
  }
  return { rows, path };
}

// 주문서(PT-LIST) 업체 줄 ↔ 메인 탭 줄: 순번 + 업체명이 같고, 상품코드가 같으면 확실 (다르면 같은 업체·상품코드 줄로)
export function matchStockRows(lines = [], main = []) {
  const byNo = new Map(main.map((m) => [String(m.no), m]));
  const used = new Set();
  return lines.map((line) => {
    const same = (m) => m && normName(m.vendor) === normName(line.vendor);
    let m = byNo.get(String(line.no));
    let how = "순번";
    if (!same(m) || (line.code && m.code && m.code !== line.code)) {
      m = main.find((x) => !used.has(x.row) && same(x) && line.code && x.code === line.code);
      how = "상품코드";
    }
    if (!m || used.has(m.row)) return { line, row: 0, how: "" };
    used.add(m.row);
    return { line, row: m.row, how, current: m.inQty };
  });
}

// ---------- 쓰기 ----------
// 연한 분홍 칠 서식: 원래 칸 서식(xf)을 복사해 칠만 바꿈 — 같은 원래 서식은 한 번만 만듦
export function addPinkStyles(stylesXml, baseXfs = []) {
  let xml = stylesXml;
  const fillsM = /<fills\b[^>]*count="(\d+)"[^>]*>([\s\S]*?)<\/fills>/.exec(xml);
  if (!fillsM) throw new Error("서식(styles.xml)에 칠 목록이 없습니다.");
  const fillId = Number(fillsM[1]);
  const pink = `<fill><patternFill patternType="solid"><fgColor rgb="${IN_FILL}"/><bgColor indexed="64"/></patternFill></fill>`;
  xml = xml.replace(fillsM[0], fillsM[0].replace(/count="\d+"/, `count="${fillId + 1}"`).replace(/<\/fills>$/, `${pink}</fills>`));
  const xfsM = /<cellXfs\b[^>]*count="(\d+)"[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  if (!xfsM) throw new Error("서식(styles.xml)에 칸 서식 목록이 없습니다.");
  const xfs = [...xfsM[2].matchAll(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g)].map((m) => m[0]);
  const map = new Map();
  let next = Number(xfsM[1]);
  const added = [];
  for (const base of [...new Set(baseXfs.map((n) => Number(n) || 0))]) {
    const src = xfs[base] || xfs[0] || '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';
    let x = /\bfillId="/.test(src) ? src.replace(/\bfillId="\d+"/, `fillId="${fillId}"`) : src.replace(/^<xf\b/, `<xf fillId="${fillId}"`);
    x = /\bapplyFill="/.test(x) ? x.replace(/\bapplyFill="\d"/, 'applyFill="1"') : x.replace(/^<xf\b/, '<xf applyFill="1"');
    added.push(x);
    map.set(base, next);
    next += 1;
  }
  xml = xml.replace(xfsM[0], xfsM[0].replace(/count="\d+"/, `count="${next}"`).replace(/<\/cellXfs>$/, `${added.join("")}</cellXfs>`));
  return { xml, map };
}

// 시트 xml: 줄 r 의 S 칸을 숫자 v + 서식 s 로 (없으면 칸 순서에 맞춰 새로) · 수식이 든 칸은 건드리지 않고 skipped 로
export function setCells(sheetXml, updates = [], styleOf = () => 0) {
  let xml = sheetXml;
  const skipped = [];
  for (const { row, qty } of updates) {
    const ref = `${IN_COL}${row}`;
    const rowRe = new RegExp(`<row\\b[^>]*\\br="${row}"[^>]*?(?:\\/>|>[\\s\\S]*?<\\/row>)`);
    const rm = rowRe.exec(xml);
    if (!rm) { skipped.push({ row, why: "줄 없음" }); continue; }
    let rowXml = rm[0];
    if (!/<\/row>$/.test(rowXml)) rowXml = rowXml.replace(/\/>$/, "></row>");
    const cellRe = new RegExp(`<c\\b[^>]*\\br="${ref}"[^>]*?(?:\\/>|>[\\s\\S]*?<\\/c>)`);
    const cm = cellRe.exec(rowXml);
    if (cm && /<f\b/.test(cm[0])) { skipped.push({ row, why: "수식 칸" }); continue; }
    const base = cm ? Number(attr(cm[0], "s") || 0) : 0;
    const val = Number.isFinite(Number(qty)) ? String(Number(qty)) : "0";
    const cell = `<c r="${ref}" s="${styleOf(base)}"><v>${val}</v></c>`;
    if (cm) rowXml = rowXml.replace(cm[0], cell);
    else {
      const target = colNo(IN_COL);
      const cells = [...rowXml.matchAll(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)];
      const after = cells.find((c) => colOf(attr(c[0], "r")) > target);
      rowXml = after ? rowXml.replace(after[0], cell + after[0]) : rowXml.replace(/<\/row>$/, `${cell}</row>`);
    }
    xml = xml.replace(rm[0], rowXml);
  }
  return { xml, skipped };
}

// 메인 탭 S열에 입고 숫자 넣기 → { bytes, skipped }
export async function writeStockIn(bytes, updates = []) {
  const list = zipRead(bytes);
  const path = await mainSheetPath(list);
  if (!path) throw new Error("'메인' 탭이 없습니다.");
  const sheetXml = await textOf(list, path);
  const bases = updates.map(({ row }) => {
    const m = new RegExp(`<c\\b[^>]*\\br="${IN_COL}${row}"[^>]*>`).exec(sheetXml);
    return m ? Number(attr(m[0], "s") || 0) : 0;
  });
  const styles = addPinkStyles(await textOf(list, "xl/styles.xml"), bases);
  const { xml, skipped } = setCells(sheetXml, updates, (base) => styles.map.get(base));
  return { bytes: await zipWrite(list, new Map([[path, xml], ["xl/styles.xml", styles.xml]])), skipped };
}
