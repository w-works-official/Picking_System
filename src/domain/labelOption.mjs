export function normalizeLabelOptionName(optionName) {
  let value = String(optionName || "").trim();
  if (value.includes(",")) value = value.split(",")[0];
  if (value.includes(":")) value = value.split(":").pop();
  if (value.includes("[")) value = value.split("[")[0];
  return value.trim();
}
