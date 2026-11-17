// 📥 거래처 회신 읽기 (2026-11-17): F 리스트 메인 탭 S열 '입고' 쓰기 · 주문 줄 짝 · AI 판독 합치기
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crc32, zipRead, zipWrite, readStockMain, matchStockRows, writeStockIn, addPinkStyles, setCells, IN_FILL } from "../src/domain/stockSheet.mjs";
import { mergeReply, saveUpdates, pickStockFile } from "../src/domain/vendorReply.mjs";

const te = new TextEncoder(), td = new TextDecoder();
// 저장 방식(압축 없음) zip 만들기 — 시험용 작은 엑셀
function storedZip(files) {
  const parts = [], central = [];
  let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const nb = te.encode(name), data = typeof text === "string" ? te.encode(text) : text, crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(lh.buffer), nb, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), nb);
    off += 30 + nb.length + data.length;
  }
  const cd = central.reduce((s, b) => s + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, Object.keys(files).length, true); end.setUint16(10, Object.keys(files).length, true); end.setUint32(12, cd, true); end.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, b) => s + b.length, 0)); let q = 0;
  for (const b of all) { out.set(b, q); q += b.length; }
  return out;
}
const c = (ref, v, extra = "") => (typeof v === "number" ? `<c r="${ref}"${extra}><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"${extra}><is><t>${v}</t></is></c>`);
const mainXml = `<?xml version="1.0"?><worksheet><sheetData>
<row r="1">${c("A1", "순번")}${c("B1", "매입처")}${c("D1", "상품코드")}${c("Q1", "발주량")}${c("S1", "입고")}</row>
<row r="2">${c("A2", 1)}${c("B2", "0-세븐피어싱 [ 1 ]")}${c("D2", "10058-1")}${c("Q2", 4)}<c r="T2"><f>S2*1</f><v>0</v></c></row>
<row r="3">${c("A3", 2)}${c("B3", "0-세븐피어싱 [ 1 ]")}${c("D3", "1014-2")}${c("Q3", 5)}<c r="S3" s="1"/></row>
<row r="4">${c("A4", 3)}${c("B4", "0-아트피어스 [ 2 ]")}${c("D4", "10550-1")}${c("Q4", 2)}<c r="S4"><f>Q4</f><v>2</v></c></row>
<row r="5"/>
</sheetData></worksheet>`;
const book = {
  "[Content_Types].xml": "<Types/>",
  "xl/workbook.xml": '<workbook><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/><sheet name="메인" sheetId="2" r:id="rId2"/></sheets></workbook>',
  "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
  "xl/worksheets/sheet1.xml": "<worksheet><sheetData/></worksheet>",
  "xl/worksheets/sheet2.xml": mainXml,
  "xl/styles.xml": '<styleSheet><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="3" fontId="1" fillId="0" borderId="2" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>',
  "xl/vbaProject.bin": new Uint8Array([1, 2, 3, 4, 5, 250]),
};
const bytes = storedZip(book);

const { rows } = await readStockMain(bytes);
assert.deepEqual(rows.map((r) => [r.row, r.no, r.vendor, r.code, r.order]), [[2, "1", "세븐피어싱", "10058-1", "4"], [3, "2", "세븐피어싱", "1014-2", "5"], [4, "3", "아트피어스", "10550-1", "2"]]);

// 주문 줄 짝: 순번+업체 → 상품코드가 다르면 같은 업체·상품코드 줄로
const lines = [{ no: "1", vendor: "세븐피어싱", code: "10058-1", qty: "3", option: "숏" }, { no: "9", vendor: "세븐피어싱", code: "1014-2", qty: "5", option: "AB" }, { no: "7", vendor: "세븐피어싱", code: "없는코드", qty: "1" }];
const m = matchStockRows(lines, rows);
assert.deepEqual(m.map((x) => [x.row, x.how]), [[2, "순번"], [3, "상품코드"], [0, ""]]);

// AI 판독 합치기: 표시 없음 = 주문대로 · X = 0 · 애매 = 노랑 · 주문보다 많음 = 노랑 · 회신 못 찾음 = 모두 노랑
const ai = { replyFound: true, items: [{ no: "9", qty: 0, sure: true, mark: "X" }, { no: "7", qty: 3, sure: true, mark: "3" }] };
const mr = mergeReply(lines, ai);
assert.deepEqual(mr.map((r) => [r.no, r.qty, r.sure]), [["1", 3, true], ["9", 0, true], ["7", 3, false]]);
assert.match(mr[0].mark, /표시 없음/);
assert.match(mr[2].mark, /주문보다 많음/);
assert.equal(mergeReply(lines, { replyFound: false, items: [] }).every((r) => !r.sure && r.qty === Number(r.order)), true);
assert.equal(mergeReply([{ no: "1", qty: "2" }], { items: [{ no: "1", qty: null, sure: true }] })[0].sure, false, "숫자를 못 읽으면 노랑");
const pos = mergeReply([{ no: "1", qty: "3" }, { no: "2", qty: "5" }, { no: "3", qty: "1" }], { items: [{ no: "1", qty: 3, sure: true, img: 0, y: 0.081 }, { no: "2", qty: 5, sure: true, img: 1, y: 1.4 }, { no: "3", qty: 0, sure: true, img: null, y: null }] });
assert.deepEqual(pos.map((r) => [r.img, r.y]), [[0, 0.081], [null, null], [null, null]], "사진 속 자리: 0~1 밖이나 없으면 null");
assert.deepEqual(saveUpdates(mr, m), [{ row: 2, qty: 3 }, { row: 3, qty: 0 }], "짝 없는 줄은 저장 안 함");
assert.equal(pickStockFile([{ name: "F_2", main: [] }, { name: "F_1", main: rows }], lines, matchStockRows).file.name, "F_1");

// 쓰기: S 칸 숫자 + 연한 분홍(원래 서식 복사) · 수식 칸은 건너뜀 · 다른 파일(매크로)은 그대로
const { bytes: out, skipped } = await writeStockIn(bytes, [{ row: 2, qty: 3 }, { row: 3, qty: 0 }, { row: 4, qty: 9 }]);
assert.deepEqual(skipped, [{ row: 4, why: "수식 칸" }]);
const list = zipRead(out);
const text = async (n) => { const e = list.find((x) => x.name === n); return td.decode(e.method ? new Uint8Array(await new Response(new Blob([e.data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()) : e.data); };
const sx = await text("xl/worksheets/sheet2.xml");
assert.match(sx, /<row r="2">.*<c r="Q2"><v>4<\/v><\/c><c r="S2" s="2"><v>3<\/v><\/c><c r="T2">/s, "S 칸이 없으면 칸 순서(Q 다음 T 앞)에");
assert.match(sx, /<c r="S3" s="3"><v>0<\/v><\/c>/, "원래 서식 1 → 분홍 복사본 3");
assert.match(sx, /<c r="S4"><f>Q4<\/f><v>2<\/v><\/c>/, "수식 칸은 그대로");
const styles = await text("xl/styles.xml");
assert.match(styles, new RegExp(`<fills count="3">.*<fgColor rgb="${IN_FILL}"/>`, "s"));
assert.match(styles, /<cellXfs count="4">.*<xf applyFill="1" numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0"\/><xf applyFill="1" numFmtId="3" fontId="1" fillId="2" borderId="2" xfId="0" applyNumberFormat="1"\/><\/cellXfs>/s);
const vba = list.find((x) => x.name === "xl/vbaProject.bin");
assert.deepEqual([...vba.data], [1, 2, 3, 4, 5, 250], "매크로는 그대로 복사");
assert.equal(crc32(te.encode("hello")), 0x3610a686);
assert.deepEqual((await readStockMain(out)).rows.map((r) => r.inQty), ["3", "0", "2"], "다시 읽으면 넣은 값");
// 두 번 저장해도 됨 (분홍 서식이 또 생겨도 깨지지 않음)
const again = await writeStockIn(out, [{ row: 2, qty: 1 }]);
assert.deepEqual((await readStockMain(again.bytes)).rows.map((r) => r.inQty), ["1", "0", "2"]);
assert.equal(addPinkStyles(styles, [0, 0, 1]).map.size, 2, "같은 원래 서식은 한 번만");
assert.equal(setCells("<sheetData></sheetData>", [{ row: 9, qty: 1 }]).skipped[0].why, "줄 없음");

// 화면 연결
const vo = readFileSync(new URL("../src/app/vendorOrder.mjs", import.meta.url), "utf8");
assert.match(vo, /data-vo-read|voRead/);
assert.match(vo, /getAsFileSystemHandle/);
assert.match(vo, /showOpenFilePicker/);
const html = readFileSync(new URL("../cs/index.html", import.meta.url), "utf8");
assert.match(html, /accept="\.xlsx,\.xlsm,\.jpg,\.jpeg,\.png"/);
assert.match(html, /data-vo-stock/);
const slots = readFileSync(new URL("../src/app/msnSlots.mjs", import.meta.url), "utf8");
assert.match(slots, /const api = \{ slotImage, sheetAuth,/);
const gs = readFileSync(new URL("../docs/cs-board-sheet.gs", import.meta.url), "utf8");
assert.match(gs.match(/var staff = \[([^\]]+)\]/)[1], /'vendorRead'/);
assert.match(gs, /if \(action === 'vendorRead'\) return vendorRead_\(body\);/);
assert.match(gs, /img = 그 줄이 보이는 그림 번호/, "AI 규칙에 줄 자리 요청");
console.log("vendorRead: OK");
