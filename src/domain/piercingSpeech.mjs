// Spoken label for piercing own codes, e.g. "[P] S-11-02 ]" -> "피어싱 S 11 다시 02".
// Rules (requested 2026-10-23): only codes starting with "[P]" are spoken; the "[P]"
// tag is read as "피어싱"; brackets are not read; anything after the closing "]"
// is dropped; the first hyphen is a pause and every later hyphen is read "다시".
const PIERCING_CODE = /^\s*(?:낱\s*)?\[\s*P\s*\]\s*([A-Za-z0-9]+(?:\s*-\s*[A-Za-z0-9]+)*)/i;

export function piercingSpeechText(ownCode) {
  const match = PIERCING_CODE.exec(String(ownCode ?? ""));
  if (!match) return "";
  const parts = match[1].split("-").map((part) => part.trim().toUpperCase()).filter(Boolean);
  if (!parts.length) return "";
  const [first, second, ...rest] = parts;
  return ["피어싱", first, second, ...rest.flatMap((part) => ["다시", part])].filter(Boolean).join(" ");
}
