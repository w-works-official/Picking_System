export function isGoldOwnCode(ownCode) {
  const normalized = String(ownCode ?? "").trim().toUpperCase();
  return normalized.includes("GPA") || normalized.includes("GPB");
}

export function isBareGpaOwnCode(ownCode) {
  return String(ownCode ?? "").trim().toUpperCase() === "[GPA]";
}

export function isOrGoldItem(item) {
  const ownCode = item?.ownCode || item?.raw?.prod_code || item?.raw?.own_code || "";
  return isGoldOwnCode(ownCode)
    && String(item?.raw?.sellpia_supplier_cell_raw ?? "").includes("오르");
}
