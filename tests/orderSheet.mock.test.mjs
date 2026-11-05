// 📦 거래처 메신저 — 주문서(PT-LIST xlsx) 읽기·업체 묶기·슬롯 메모 짝 (2026-11-05)
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { groupByVendor, matchSlot, normName, readOrderSheet, vendorFromFileName, vendorName, zipEntries } from "../src/domain/orderSheet.mjs";

assert.equal(vendorName("0-세븐피어싱 [ 1 ]"), "세븐피어싱");
assert.equal(vendorName("0-스콜피온 (마그마) [ 12 ]"), "스콜피온 (마그마)");
assert.equal(normName(" 0-아트피어스14K [ 5 ] "), "아트피어스14k");
assert.equal(matchSlot("세븐피어싱", ["", "헤세드", "세븐피어싱"]), 2);
assert.equal(matchSlot("헤세드", ["0-헤세드 >아트"]), 0, "카톡방 이름 그대로 적어도 짝");
assert.equal(matchSlot("아트피어스", ["아트", "아트피어스"]), 1, "긴 메모 먼저");
assert.equal(matchSlot("수진사", ["", "가"]), -1, "한 글자 메모는 짝 안 함");
assert.deepEqual(vendorFromFileName("세븐피어싱_1105.jpg"), { vendor: "세븐피어싱", n: 1 });
assert.deepEqual(vendorFromFileName("C:\\x\\아트피어스_1105_2.JPG"), { vendor: "아트피어스", n: 2 });
assert.equal(vendorFromFileName("메모.jpg"), null);

// 가짜 xlsx (zip: 압축 안 함 + deflate 섞어서)
function zip(files) {
  const parts = [], central = [];
  let off = 0;
  for (const [name, [raw, method]] of Object.entries(files)) {
    const nb = Buffer.from(name), src = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    const data = method === 8 ? deflateRawSync(src) : src;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(method, 8); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(src.length, 22); lh.writeUInt16LE(nb.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(method, 10); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(src.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
    parts.push(lh, nb, data); central.push(ch, nb); off += 30 + nb.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}
const s = (i) => `<c r="${i[0]}" t="s"><v>${i[1]}</v></c>`;
const strings = ["순번", "사진", "옵션명", "발주량", "임의필드", "매입처", "상품명", "0-세븐피어싱 [ 1 ]", "0-수진사 [ 34 ]", "크리스탈 &amp; AB"];
const sheet = `<worksheet><sheetData>
<row r="1">${[["A1", 0], ["B1", 1], ["C1", 2], ["D1", 3], ["E1", 4], ["H1", 5], ["I1", 6]].map(s).join("")}</row>
<row r="2"><c r="A2"><v>1</v></c>${s(["C2", 9])}<c r="D2"><v>7</v></c>${s(["H2", 7])}<c r="I2" t="inlineStr"><is><t>큐빅 피어싱</t></is></c></row>
<row r="3"><c r="A3"><v>2</v></c><c r="B3" vm="1"><v>#VALUE!</v></c><c r="D3"><v>2</v></c>${s(["H3", 8])}</row>
<row r="4"><c r="A4"><v>3</v></c></row>
<row r="5"><c r="A5"><v>4</v></c><c r="D5"><v>1</v></c>${s(["H5", 7])}</row>
</sheetData><drawing r:id="rId9"/></worksheet>`;
const png = Buffer.from("89504e470d0a1a0a", "hex");
const x = zip({
  "xl/workbook.xml": [`<workbook><sheets><sheet name="DB" sheetId="1" r:id="rId3"/></sheets></workbook>`, 8],
  "xl/_rels/workbook.xml.rels": [`<Relationships><Relationship Id="rId3" Type="x" Target="worksheets/sheet1.xml"/></Relationships>`, 0],
  "xl/sharedStrings.xml": [`<sst>${strings.map((t) => `<si><t>${t}</t></si>`).join("")}</sst>`, 8],
  "xl/worksheets/sheet1.xml": [sheet, 8],
  "xl/worksheets/_rels/sheet1.xml.rels": [`<Relationships><Relationship Id="rId9" Target="../drawings/drawing1.xml"/></Relationships>`, 0],
  "xl/drawings/drawing1.xml": [`<xdr:wsDr><xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>1</xdr:col><xdr:colOff>5</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>9</xdr:rowOff></xdr:from><xdr:pic><a:blip r:embed="rId1"/></xdr:pic></xdr:twoCellAnchor><xdr:twoCellAnchor><xdr:from><xdr:col>1</xdr:col><xdr:row>4</xdr:row></xdr:from><xdr:pic><a:blip r:embed="rId2"/></xdr:pic></xdr:twoCellAnchor></xdr:wsDr>`, 8],
  "xl/drawings/_rels/drawing1.xml.rels": [`<Relationships><Relationship Id="rId1" Target="../media/image1.png"/><Relationship Id="rId2" Target="../media/image2.jpeg"/></Relationships>`, 0],
  "xl/media/image1.png": [png, 0],
  "xl/media/image2.jpeg": [Buffer.from("ffd8ffe0", "hex"), 8],
  "xl/richData/rdrichvalue.xml": [`<rvData><rv s="0"><v>0</v><v>5</v></rv></rvData>`, 0],
  "xl/richData/richValueRel.xml": [`<richValueRels><rel r:id="rId1"/></richValueRels>`, 0],
  "xl/richData/_rels/richValueRel.xml.rels": [`<Relationships><Relationship Id="rId1" Target="../media/image1.png"/></Relationships>`, 0],
});
assert.ok(zipEntries(x).has("xl/media/image1.png"));
const r = await readOrderSheet(x);
assert.deepEqual(r.lines.map((l) => [l.row, l.no, l.vendor, l.option, l.qty, l.product, l.images.map((i) => i.name).join("+")]), [
  [2, "1", "세븐피어싱", "크리스탈 & AB", "7", "큐빅 피어싱", "image1.png"],
  [3, "2", "수진사", "", "2", "", "image1.png"],
  [5, "4", "세븐피어싱", "", "1", "", "image2.jpeg"],
], "빈 줄(4) 빼고 · 그림은 걸친 줄에 · 칸 안 그림(richData)도");
const img = await r.image(r.lines[2].images[0]);
assert.deepEqual([img.mime, Buffer.from(img.data).toString("hex")], ["image/jpeg", "ffd8ffe0"], "deflate 압축 풀기");
assert.deepEqual(groupByVendor(r.lines).map((g) => [g.vendor, g.lines.length]), [["세븐피어싱", 2], ["수진사", 1]], "업체별 (주문서 순서)");
await assert.rejects(readOrderSheet(Buffer.from("not a zip")), /xlsx/);
await assert.rejects(readOrderSheet(zip({ "xl/workbook.xml": [`<workbook><sheets><sheet r:id="rId1"/></sheets></workbook>`, 0], "xl/_rels/workbook.xml.rels": [`<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`, 0], "xl/worksheets/sheet1.xml": [`<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>아무거나</t></is></c></row></sheetData></worksheet>`, 0] })), /머리줄/);
console.log("orderSheet.mock.test: OK");
