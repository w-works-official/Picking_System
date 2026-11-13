// 📦 거래처 메신저 — 주문서(PT-LIST xlsx) 읽기·업체 묶기·슬롯 메모 짝 (2026-11-05)
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { colorOf, fillStyles, groupByVendor, isYellow, themeColors, matchSlot, normName, readOrderSheet, vendorFromFileName, vendorName, yellowStyles, zipEntries } from "../src/domain/orderSheet.mjs";

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
<row r="2"><c r="A2"><v>1</v></c>${s(["C2", 9])}<c r="D2" s="2"><v>7</v></c>${s(["H2", 7])}<c r="I2" t="inlineStr"><is><t>큐빅 피어싱</t></is></c></row>
<row r="3"><c r="A3"><v>2</v></c><c r="B3" vm="1"><v>#VALUE!</v></c><c r="D3"><v>2</v></c>${s(["H3", 8])}</row>
<row r="4"><c r="A4"><v>3</v></c></row>
<row r="5"><c r="A5"><v>4</v></c><c r="D5" s="3"><v>1</v></c>${s(["H5", 7])}</row>
</sheetData><drawing r:id="rId9"/></worksheet>`;
// 11-06: 발주량 칸 노랑(급한 상품) — fills[2] = 노랑, fills[3] = 연두(아님) · cellXfs[2]→노랑, [3]→연두
const stylesXml = `<styleSheet><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEBF1DE"/></patternFill></fill></fills><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="2" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf fillId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFill="1"><alignment horizontal="center"/></xf><xf fillId="3" applyFill="1"/></cellXfs></styleSheet>`;
assert.deepEqual([...yellowStyles(stylesXml)], [2], "노랑 칠한 서식만 (cellStyleXfs 는 아님)");
assert.ok(isYellow("FFFFFF00") && isYellow("FFFFF200") && !isYellow("FFEBF1DE") && !isYellow("FFFFC000") && !isYellow("") && !isYellow("theme"));
const png = Buffer.from("89504e470d0a1a0a", "hex");
const x = zip({
  "xl/workbook.xml": [`<workbook><sheets><sheet name="DB" sheetId="1" r:id="rId3"/></sheets></workbook>`, 8],
  "xl/_rels/workbook.xml.rels": [`<Relationships><Relationship Id="rId3" Type="x" Target="worksheets/sheet1.xml"/></Relationships>`, 0],
  "xl/sharedStrings.xml": [`<sst>${strings.map((t) => `<si><t>${t}</t></si>`).join("")}</sst>`, 8],
  "xl/worksheets/sheet1.xml": [sheet, 8],
  "xl/styles.xml": [stylesXml, 8],
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
assert.deepEqual(r.lines.map((l) => l.urgent), [true, false, false], "발주량 칸 노랑 = 급한 상품 (연두는 아님)");
const img = await r.image(r.lines[2].images[0]);
assert.deepEqual([img.mime, Buffer.from(img.data).toString("hex")], ["image/jpeg", "ffd8ffe0"], "deflate 압축 풀기");
assert.deepEqual(groupByVendor(r.lines).map((g) => [g.vendor, g.lines.length]), [["세븐피어싱", 2], ["수진사", 1]], "업체별 (주문서 순서)");
await assert.rejects(readOrderSheet(Buffer.from("not a zip")), /xlsx/);
await assert.rejects(readOrderSheet(zip({ "xl/workbook.xml": [`<workbook><sheets><sheet r:id="rId1"/></sheets></workbook>`, 0], "xl/_rels/workbook.xml.rels": [`<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`, 0], "xl/worksheets/sheet1.xml": [`<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>아무거나</t></is></c></row></sheetData></worksheet>`, 0] })), /머리줄/);

// 11-12: 칠한 색 그대로 — rgb · 테마(+tint) · indexed, 줄 전체 서식(row s), 흰색은 칠 없음
{
  const theme = themeColors(`<a:theme><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6></a:clrScheme></a:themeElements></a:theme>`);
  assert.deepEqual(theme.slice(0, 5), ["FFFFFF", "000000", "E7E6E6", "44546A", "4472C4"], "테마 순서 lt1·dk1·lt2·dk2·accent1");
  assert.equal(colorOf(`<fgColor rgb="FFFF0000"/>`, theme), "#FF0000");
  assert.equal(colorOf(`<fgColor theme="5" tint="0.79998168889431442"/>`, theme), "#FBE5D6", "테마 + 밝게");
  assert.equal(colorOf(`<fgColor indexed="10"/>`), "#FF0000");
  assert.equal(colorOf(`<fgColor auto="1"/>`), "");
  const st = `<styleSheet><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFF0000"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFC7CE"/></patternFill></fill></fills><cellXfs count="5"><xf fillId="0"/><xf fillId="2" applyFill="1"/><xf fillId="3" applyFill="1"/><xf fillId="4" applyFill="1"/><xf fillId="1"/></cellXfs></styleSheet>`;
  assert.deepEqual([...fillStyles(st)], [[1, "#FF0000"], [3, "#FFC7CE"]], "흰색·회색무늬 빼고");
  const sh = `<worksheet><sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>순번</t></is></c><c r="C1" t="inlineStr"><is><t>옵션명</t></is></c><c r="D1" t="inlineStr"><is><t>발주량</t></is></c><c r="H1" t="inlineStr"><is><t>매입처</t></is></c></row>
<row r="2"><c r="A2" s="1"><v>1</v></c><c r="C2" s="1" t="inlineStr"><is><t>금액변동</t></is></c><c r="D2" s="1"><v>3</v></c><c r="H2" s="1" t="inlineStr"><is><t>0-어썸 [ 4 ]</t></is></c></row>
<row r="3" s="3" customFormat="1"><c r="A3"><v>2</v></c><c r="C3" s="2" t="inlineStr"><is><t>흰칸</t></is></c><c r="D3"><v>1</v></c><c r="H3" t="inlineStr"><is><t>0-어썸 [ 4 ]</t></is></c></row>
<row r="4"><c r="A4"><v>3</v></c><c r="D4"><v>5</v></c><c r="H4" t="inlineStr"><is><t>0-어썸 [ 4 ]</t></is></c></row>
</sheetData></worksheet>`;
  const xx = zip({
    "xl/workbook.xml": [`<workbook><sheets><sheet r:id="rId1"/></sheets></workbook>`, 0],
    "xl/_rels/workbook.xml.rels": [`<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`, 0],
    "xl/worksheets/sheet1.xml": [sh, 8],
    "xl/styles.xml": [st, 8],
  });
  const rr = await readOrderSheet(xx);
  assert.deepEqual(rr.lines.map((l) => l.colors), [
    { no: "#FF0000", option: "#FF0000", qty: "#FF0000", vendor: "#FF0000" },
    { no: "#FFC7CE", qty: "#FFC7CE", vendor: "#FFC7CE" },
    {},
  ], "칸 색 · 줄 전체 색(칸 서식 없는 칸) · 흰칸은 칠 없음 · 안 칠한 줄은 빈 값");
}
console.log("orderSheet.mock.test: OK");
