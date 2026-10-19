// Supplier order-slip edits are not customer order, inventory or picking edits.
export const SLIP_TEXT_FIELDS = Object.freeze(["supplierCellRaw", "productName", "optionName", "barLength", "supplierCode"]);
export const SLIP_FIELDS = Object.freeze([...SLIP_TEXT_FIELDS, "quantity"]);

export function validateSlipFields(fields) {
  const result = {};
  for (const key of Object.keys(fields || {})) {
    if (!SLIP_FIELDS.includes(key)) throw new Error(`수정할 수 없는 주문서 항목: ${key}`);
    const value = fields[key];
    if (key === "quantity") {
      if (value === null || value === "") result[key] = null;
      else {
        const quantity = Number(value);
        if (!["number", "string"].includes(typeof value) || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > 1000000) throw new Error("수량은 0 이상 1,000,000 이하의 정수로 입력해주세요.");
        result[key] = quantity;
      }
    } else {
      if (typeof value !== "string" || value.length > 500) throw new Error("주문서 텍스트는 항목당 500자까지 입력할 수 있습니다.");
      result[key] = value.trim();
    }
  }
  return result;
}

export function applySlipOverrides(defaults, overrides) {
  // Unknown/stale fields never affect the source identity or operational values.
  const safe = {};
  for (const key of SLIP_FIELDS) {
    if (overrides && Object.hasOwn(overrides, key)) safe[key] = overrides[key];
  }
  return { ...defaults, ...validateSlipFields(safe) };
}

export function moveSlipId(ids, sourceId, targetId, after = false) {
  if (sourceId === targetId || !ids.includes(sourceId) || !ids.includes(targetId)) return [...ids];
  const next = ids.filter((id) => id !== sourceId);
  next.splice(next.indexOf(targetId) + Number(after), 0, sourceId);
  return next;
}

export function mergeVisibleSlipOrder(fullIds, originalVisibleIds, editedVisibleIds) {
  const visible = new Set(originalVisibleIds);
  if (visible.size !== originalVisibleIds.length || new Set(editedVisibleIds).size !== visible.size
    || editedVisibleIds.some((id) => !visible.has(id))
    || originalVisibleIds.some((id) => !fullIds.includes(id))) throw new Error("목록 구성이 달라졌습니다. 새로고침 후 다시 수정해주세요.");
  let index = 0;
  return fullIds.map((id) => visible.has(id) ? editedVisibleIds[index++] : id);
}

export function buildSlipEditChanges(draft) {
  const reordered = draft.ids.some((id, index) => id !== draft.originalIds[index]);
  const fullIds = mergeVisibleSlipOrder(draft.fullIds, draft.originalIds, draft.ids);
  const changes = [];
  for (const [index, id] of fullIds.entries()) {
    const original = draft.originals.get(id);
    if (!original) throw new Error("원본 주문제작 행을 찾을 수 없습니다.");
    const entry = draft.entries.get(id);
    const patch = {};
    if (entry) {
      const fields = validateSlipFields(entry.fields);
      const overrides = {};
      for (const key of SLIP_FIELDS) {
        if (fields[key] !== entry.defaults[key]) overrides[key] = fields[key];
      }
      if (JSON.stringify(overrides) !== JSON.stringify(entry.initialOverrides)) patch.slip_overrides = overrides;
      const memo = String(entry.memo || "").trim();
      if (memo.length > 500) throw new Error("내부 메모는 500자까지 입력할 수 있습니다.");
      if (memo !== String(original.internal_memo || "").trim()) patch.internal_memo = memo || null;
    }
    if ((reordered || draft.forceSort) && original.slip_sort_order !== index) patch.slip_sort_order = index;
    if (Object.keys(patch).length) changes.push({ operation_id: id, expected_updated_at: original.updated_at, patch });
  }
  return { changes, reordered };
}

export async function saveSlipEditBatch(db, changes) {
  if (!changes.length) return [];
  if (changes.length > 1000) throw new Error("한 번에 저장할 수 있는 목록 수를 초과했습니다. 목록 범위를 줄여주세요.");
  const allowed = ["slip_overrides", "slip_sort_order", "internal_memo"];
  if (new Set(changes.map((entry) => entry.operation_id)).size !== changes.length) throw new Error("중복된 주문제작 행입니다.");
  for (const entry of changes) {
    if (!entry.operation_id || !entry.expected_updated_at || !Object.keys(entry.patch).length
      || Object.keys(entry.patch).some((key) => !allowed.includes(key))) throw new Error("저장 대상 또는 버전 정보가 올바르지 않습니다. 새로고침해주세요.");
    if (entry.patch.slip_overrides) validateSlipFields(entry.patch.slip_overrides);
    if (Object.hasOwn(entry.patch, "slip_sort_order") && (!Number.isSafeInteger(entry.patch.slip_sort_order) || entry.patch.slip_sort_order < 0)) throw new Error("목록 순서가 올바르지 않습니다.");
  }
  // Atomic, version-checked batch; preserves existing shared-login and RLS gates.
  // No sequential UPDATE fallback: a failed save must never leave half a layout.
  const { data, error } = await db.rpc("picking_save_custom_order_slips_v1", { p_changes: changes });
  if (error) throw error;
  if (!Array.isArray(data) || data.length !== changes.length
    || new Set(data.map((row) => row.operation_id)).size !== changes.length
    || changes.some((entry) => !data.some((row) => row.operation_id === entry.operation_id))) throw new Error("저장 결과를 확인할 수 없습니다. 새로고침 후 상태를 확인해주세요.");
  return data;
}
