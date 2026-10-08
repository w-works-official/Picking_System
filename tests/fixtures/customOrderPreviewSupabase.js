(() => {
  const nativeFetch = window.fetch.bind(window);
  const sessionKey = "system-v3-picking-session-v1";
  const loggedOutKey = "system-v3-local-preview-logged-out";
  const dummySession = { token: "0".repeat(64), expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString() };
  let sessionRevoked = false;
  const localDate = new Date();
  const receiptDate = new Date(localDate.getTime() - localDate.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  window.__LOCAL_CUSTOM_ORDER_PREVIEW__ = true;
  window.__previewNetwork = { authCalls: [], blocked: [] };
  window.__previewSession = Object.freeze(dummySession);
  window.__previewReceiptDate = receiptDate;

  function authResult(name, body = {}) {
    if (name === "picking_login_v1") {
      if (body.p_username !== "local-preview" || body.p_password !== "fixture-only") {
        return { authenticated: false, error_code: "invalid_credentials" };
      }
      sessionRevoked = false;
      try { window.sessionStorage.removeItem(loggedOutKey); } catch {}
      return { authenticated: true, session_token: dummySession.token, expires_at: dummySession.expiresAt };
    }
    if (name === "picking_check_session_v1") {
      const authenticated = !sessionRevoked && body.p_session_token === dummySession.token;
      return { authenticated, expires_at: authenticated ? dummySession.expiresAt : null };
    }
    if (name === "picking_logout_v1") {
      sessionRevoked = true;
      try { window.sessionStorage.setItem(loggedOutKey, "1"); } catch {}
      return { logged_out: true };
    }
    return null;
  }

  // Installed in <head>, before authentication or app scripts execute. No external
  // request is forwarded, including direct Storage fetches outside the SDK stub.
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url, window.location.href);
    if (url.origin === window.location.origin) return nativeFetch(input, options);
    const authName = /^\/rest\/v1\/rpc\/(picking_login_v1|picking_check_session_v1|picking_logout_v1)$/.exec(url.pathname)?.[1];
    if (url.hostname.endsWith(".supabase.co") && authName && options.method === "POST") {
      const body = JSON.parse(options.body || "{}");
      window.__previewNetwork.authCalls.push(authName);
      return new Response(JSON.stringify(authResult(authName, body)), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    window.__previewNetwork.blocked.push({ origin: url.origin, pathname: url.pathname, method: options.method || "GET" });
    throw Object.assign(new Error("Local preview blocked an external request."), { code: "LOCAL_PREVIEW_EXTERNAL_BLOCKED" });
  };
  try {
    // This known dummy token is never a production session. A fresh preview opens
    // directly; previewLogin=1 and logout keep the local login gate available.
    if (new URLSearchParams(window.location.search).get("previewLogin") !== "1" && !window.sessionStorage.getItem(loggedOutKey)) {
      window.sessionStorage.setItem(sessionKey, JSON.stringify(dummySession));
    } else {
      window.sessionStorage.removeItem(sessionKey);
    }
  } catch {}

  const base = {
    custom_required_at: "2026-09-28T03:00:00Z",
    custom_ordered_on: null,
    custom_received_on: null,
    custom_cancelled_at: null,
    inbound_expected_date: null,
    inbound_expected_source: null,
    internal_memo: null,
  };

  const tables = {
    orders: [
      { ord_no: "LOCAL-PICK-1", receipt_date: receiptDate, sort_order: 1, receiver: "로컬테스트", seller: "스마트스토어" },
      { ord_no: "LOCAL-PICK-2", receipt_date: receiptDate, sort_order: 2, receiver: "형제행테스트", seller: "에이블리", sellpia_order_total_amount: 13070 },
    ],
    order_items: [
      { ord_no: "LOCAL-PICK-1", sellpia_order_item_no: "LOCAL-R1", item_no: "1_LOCAL-R1", sort_order: 1, p_code: "LOCAL-SKU-1", p_dpcode: "GPA-3-191", p_name: "피킹에서 주문제작 체크할 상품", p_option: "골드/6mm바[GPA-3-191],바길이 변경(주문제작/취소불가):4mm바", p_location: "A-1", qty: 2 },
      { ord_no: "LOCAL-PICK-2", sellpia_order_item_no: "LOCAL-R2-A", item_no: "1_LOCAL-R2-A", sort_order: 1, p_code: "SAME-SKU", p_dpcode: "GPA-1-101", p_name: "동일 SKU 형제상품 A", p_option: "크리스탈/3mm[GPA-1-101],바길이 변경:4mm바", p_location: "B-2", qty: 5 },
      { ord_no: "LOCAL-PICK-2", sellpia_order_item_no: "LOCAL-R2-B", item_no: "2_LOCAL-R2-B", sort_order: 2, p_code: "SAME-SKU", p_dpcode: "GPA-1-101", p_name: "동일 SKU 형제상품 B", p_option: "크리스탈/3mm[GPA-1-101],바길이 변경:6mm바", p_location: "B-3", qty: 1 },
      { ord_no: "LOCAL-O1", sellpia_order_item_no: "R1", item_no: "9_R1", p_code: "SKU-CURRENT", p_dpcode: "GPA-3-191", p_name: "14K 골드 볼 피어싱", p_option: "골드/6mm바[GPA-3-191],바길이 변경(주문제작/취소불가):4mm바", qty: 2, sellpia_supplier_cell_raw: "0-베니스톤 [ 28 ]", sellpia_arbitrary_field_raw: "001-VENDOR-TEST" },
      { ord_no: "LOCAL-O2", sellpia_order_item_no: "R2", item_no: "1_R2", p_code: "SKU-MANUAL", p_dpcode: "GPA-1-101", p_name: "크리스탈 큐빅 피어싱", p_option: "크리스탈/3mm[GPA-1-101],바길이 변경:4mm바", qty: 5, sellpia_supplier_cell_raw: "0-세븐피어싱 [ 1 ]", sellpia_outbound_confirmed_date: "2026-10-08" },
      { ord_no: "LOCAL-O3", sellpia_order_item_no: "R3", item_no: "1_R3", p_code: "SKU-LEGACY", p_dpcode: "GPA-1-102", p_name: "셀피아 fallback 상품", p_option: "크리스탈/3mm[GPA-1-102],바길이 변경:6mm바", qty: 1, sellpia_supplier_cell_raw: "0-베니스톤 [ 28 ]", sellpia_outbound_confirmed_date: "2026-10-09" },
      { ord_no: "LOCAL-INBOUND", sellpia_order_item_no: "R-INBOUND", item_no: "1_R-INBOUND", p_code: "SKU-INBOUND", p_dpcode: "OWN-INBOUND", p_name: "입고예정일 관리 전용 상품", p_option: "레거시 일정", sellpia_supplier_cell_raw: "0-신규매입처 [ 7 ]", sellpia_outbound_confirmed_date: "2026-10-11" },
    ],
    order_item_operations: [
      { ...base, operation_id: "preview-before", ord_no: "LOCAL-O1", sellpia_order_item_no: "R1", item_no: "1_R1", sellpia_product_code_snapshot: "OLD-SKU", arbitrary_field_raw_snapshot: "OLD-VENDOR-SNAPSHOT", product_name_snapshot: "예전 상품", supplier_cell_raw_snapshot: "예전 매입처" },
      { ...base, operation_id: "preview-missing", ord_no: "LOCAL-MISSING", sellpia_order_item_no: "RM", item_no: "1_RM", custom_ordered_on: "2026-09-29", inbound_expected_date: "2026-10-05", inbound_expected_source: "sku_schedule", internal_memo: "원천행이 없어 snapshot으로 표시", sellpia_product_code_snapshot: "SNAP-SKU", own_code_snapshot: "SNAP-OWN", arbitrary_field_raw_snapshot: "SNAP-VENDOR-TEST", product_name_snapshot: "스냅샷 주문제작 상품", product_option_snapshot: "스냅 옵션", supplier_cell_raw_snapshot: "0-스냅매입처 [ 9 ]" },
      { ...base, operation_id: "preview-manual-clear", ord_no: "LOCAL-O2", sellpia_order_item_no: "R2", item_no: "1_R2", custom_ordered_on: "2026-09-30", inbound_expected_source: "manual", inbound_expected_date: null },
      { ...base, operation_id: "preview-legacy", ord_no: "LOCAL-O3", sellpia_order_item_no: "R3", item_no: "1_R3", custom_ordered_on: "2026-09-30" },
      { ...base, operation_id: "preview-received", ord_no: "LOCAL-DONE", sellpia_order_item_no: "RD", item_no: "1_RD", custom_received_on: "2026-10-01", product_name_snapshot: "완료 필터 확인 상품", supplier_cell_raw_snapshot: "0-완료매입처 [ 3 ]" },
      { ...base, operation_id: "preview-cancelled", ord_no: "LOCAL-CANCEL", sellpia_order_item_no: "RC", item_no: "1_RC", custom_cancelled_at: "2026-10-01T04:00:00Z", product_name_snapshot: "취소 필터 확인 상품", supplier_cell_raw_snapshot: "0-취소매입처 [ 4 ]" },
    ],
    sku_inbound_schedules: [
      { sellpia_sku: "SKU-INBOUND", inbound_expected_date: "2026-10-07", own_code: "OWN-INBOUND", created_at: "2026-10-01T01:00:00Z", updated_at: "2026-10-01T01:00:00Z" },
      { sellpia_sku: "SCHEDULE-ONLY", inbound_expected_date: "2026-10-15", own_code: "OWN-SCHEDULE", created_at: "2026-10-01T01:00:00Z", updated_at: "2026-10-01T01:00:00Z" },
    ],
  };

  window.__previewTables = tables;

  function query(table) {
    const state = { mode: "select", payload: null, filters: [], notNull: "", range: null };
    let proxy;
    proxy = new Proxy({}, {
      get(_target, property) {
        if (property === "then") {
          return (resolve) => {
            let rows = [...(tables[table] || [])];
            for (const [kind, column, value] of state.filters) {
              if (kind === "eq") rows = rows.filter((row) => row[column] === value);
              if (kind === "in") rows = rows.filter((row) => value.includes(row[column]));
            }
            if (state.notNull) rows = rows.filter((row) => row[state.notNull] !== null && row[state.notNull] !== undefined);
            if (state.range) rows = rows.slice(state.range[0], state.range[1] + 1);
            if (state.mode === "update") rows.forEach((row) => Object.assign(row, state.payload));
            if (state.mode === "insert") {
              const inserted = { operation_id: `preview-generated-${Date.now()}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...state.payload };
              (tables[table] ||= []).push(inserted);
              rows = [inserted];
            }
            if (state.mode === "upsert") {
              const payload = Array.isArray(state.payload) ? state.payload : [state.payload];
              rows = payload.map((value) => {
                const existing = (tables[table] ||= []).find((row) => row.sellpia_sku === value.sellpia_sku);
                if (existing) {
                  Object.assign(existing, value, { updated_at: new Date().toISOString() });
                  return existing;
                }
                const inserted = { created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...value };
                tables[table].push(inserted);
                return inserted;
              });
            }
            resolve({ data: structuredClone(rows), error: null });
          };
        }
        return (...args) => {
          if (property === "eq") state.filters.push(["eq", args[0], args[1]]);
          if (property === "in") state.filters.push(["in", args[0], args[1]]);
          if (property === "not" && args[1] === "is" && args[2] === null) state.notNull = args[0];
          if (property === "range") state.range = [args[0], args[1]];
          if (property === "update") { state.mode = "update"; state.payload = args[0]; }
          if (property === "insert") { state.mode = "insert"; state.payload = args[0]; }
          if (property === "upsert") { state.mode = "upsert"; state.payload = structuredClone(args[0]); }
          return proxy;
        };
      },
    });
    return proxy;
  }

  window.supabase = {
    createClient() {
      return {
        from: (table) => query(table),
        rpc: (name, body) => Promise.resolve({ data: authResult(name, body) || [], error: null }),
        storage: {
          from: () => ({
            download: () => Promise.resolve({ data: null, error: new Error("local mock: no shared file") }),
            list: () => Promise.resolve({ data: [], error: null }),
          }),
        },
      };
    },
  };
})();
