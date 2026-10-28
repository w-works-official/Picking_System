// 주문제작 업체별 발주 이미지 (2026-10-28 대표님 요청)
// 주문제작 관리 화면의 업체 묶음을 업체에 그대로 보낼 수 있도록 업체별 PNG 한 장(또는 여러 장)으로 만듭니다.
// 이 파일은 화면·저장소에 손대지 않는 순수 계산만 담당합니다(그리기는 pickingApp.mjs).

export const SUPPLIER_SHEET_UNKNOWN = "매입처 미확인";
// 한 장에 너무 많이 넣으면 브라우저 이미지 크기 한도를 넘으므로 나눠서 저장합니다.
export const SUPPLIER_SHEET_ITEMS_PER_IMAGE = 30;

const FILE_NAME_FORBIDDEN = /[\\/:*?"<>|\u0000-\u001f]/g;

// Windows·휴대폰 모두에서 저장되는 파일 이름. 업체 이름은 최대한 그대로 둡니다.
export function supplierSheetBaseName(supplier) {
  const cleaned = String(supplier ?? "")
    .replace(FILE_NAME_FORBIDDEN, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "")
    .slice(0, 120);
  return cleaned || SUPPLIER_SHEET_UNKNOWN;
}

export function supplierSheetFileNames(supplier, pageCount = 1) {
  const base = supplierSheetBaseName(supplier);
  const count = Math.max(1, Math.trunc(Number(pageCount) || 1));
  if (count === 1) return [`${base}.png`];
  return Array.from({ length: count }, (_, index) => `${base}_${index + 1}.png`);
}

export function chunkSupplierSheetItems(items = [], size = SUPPLIER_SHEET_ITEMS_PER_IMAGE) {
  const step = Math.max(1, Math.trunc(Number(size) || SUPPLIER_SHEET_ITEMS_PER_IMAGE));
  const pages = [];
  for (let index = 0; index < items.length; index += step) pages.push(items.slice(index, index + step));
  return pages.length ? pages : [[]];
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

// One line of the sheet per field, in the same order as the 주문제작 card.
export function supplierSheetItem(slip = {}, extra = {}) {
  const quantity = slip.quantity === null || slip.quantity === undefined || slip.quantity === ""
    ? null
    : Number(slip.quantity);
  return {
    photoCode: cleanText(extra.photoCode),
    fields: [
      { label: "옵션", value: cleanText(slip.optionName) || "-" },
      { label: "바길이", value: cleanText(slip.barLength) || "-" },
      { label: "업체상품코드", value: cleanText(slip.supplierCode) || "-" },
      { label: "수량", value: Number.isFinite(quantity) ? `${quantity}개` : "확인 필요", emphasis: true },
      { label: "상품명", value: cleanText(slip.productName) || "-" },
    ],
    quantity: Number.isFinite(quantity) ? quantity : null,
  };
}

export function supplierSheetSummary(items = [], date = "") {
  const known = items.filter((item) => item.quantity !== null);
  const parts = [
    date ? `발주일 ${date}` : "",
    `${items.length}건`,
    known.length ? `총 ${known.reduce((sum, item) => sum + item.quantity, 0)}개` : "",
    items.length > known.length ? `수량 확인 필요 ${items.length - known.length}건` : "",
  ];
  return parts.filter(Boolean).join(" · ");
}

// Word wrap that never loses characters. measure(text) returns a width.
// Breaks at spaces when possible, otherwise between characters (Korean/코드).
export function wrapSheetText(text, maxWidth, measure) {
  const source = cleanText(text);
  if (!source) return [""];
  const lines = [];
  let line = "";
  const pushLongWord = (word) => {
    let part = "";
    for (const char of word) {
      if (part && measure(part + char) > maxWidth) {
        lines.push(part);
        part = char;
      } else {
        part += char;
      }
    }
    return part;
  };
  for (const word of source.split(" ")) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = measure(word) <= maxWidth ? word : pushLongWord(word);
  }
  if (line) lines.push(line);
  return lines;
}
