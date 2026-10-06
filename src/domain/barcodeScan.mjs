export const BARCODE_SCAN_SETTLE_MS = 220;
export const BARCODE_SCAN_DUPLICATE_MS = 900;

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export function canonicalInvoiceScan(value, invoiceNumbers = [], minimumLength = 13) {
  const raw = digits(value);
  if (raw.length < minimumLength) return "";
  const candidates = [...new Set(invoiceNumbers.map(digits).filter((code) => code.length >= minimumLength))]
    .sort((left, right) => right.length - left.length);

  for (const code of candidates) {
    if (raw === code) return code;
    if (raw.length <= code.length || raw.length % code.length !== 0) continue;
    if (code.repeat(raw.length / code.length) === raw) return code;
  }
  return "";
}

export function isDuplicateInvoiceScan({
  code,
  lastCode = "",
  lastProcessedAt = 0,
  now = Date.now(),
  cooldownMs = BARCODE_SCAN_DUPLICATE_MS,
} = {}) {
  const normalizedCode = digits(code);
  return Boolean(
    normalizedCode
    && normalizedCode === digits(lastCode)
    && Number(now) - Number(lastProcessedAt) >= 0
    && Number(now) - Number(lastProcessedAt) < Number(cooldownMs),
  );
}
