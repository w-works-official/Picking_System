(function (root) {
  "use strict";
  // Also embedded verbatim into bookmarklets: never add external dependencies here.
  function pickingAuthFactory() {
    const STORAGE_KEY = "system-v3-picking-session-v1";
    const AUTH_RPCS = new Set(["picking_login_v1", "picking_check_session_v1", "picking_logout_v1"]);
    function createSessionClient({ url, key, fetch: rawFetch, storage, onRequired = () => {}, now = () => Date.now() }) {
      const origin = new URL(url).origin;
      let session = null, generation = 0;
      const pending = new Set();
      const valid = (value) => value && /^[0-9a-f]{64}$/.test(value.token) && Date.parse(value.expiresAt) > now();
      const error = () => Object.assign(new Error("피킹시스템 로그인이 필요합니다."), { code: "PICKING_AUTH_REQUIRED" });
      function clear() {
        session = null;
        generation++;
        for (const controller of pending) controller.abort();
        pending.clear();
        try { storage?.removeItem(STORAGE_KEY); } catch {}
      }
      function requireSession() {
        if (!valid(session)) { clear(); onRequired(); throw error(); }
        return session;
      }
      function save(value) {
        if (!valid(value)) throw error();
        clear();
        session = value;
        // Storage failure must not leave a half-authenticated app.
        try { storage?.setItem(STORAGE_KEY, JSON.stringify(value)); }
        catch { clear(); throw new Error("로그인 세션을 저장할 수 없습니다. 브라우저 저장소 설정을 확인해주세요."); }
        return value;
      }
      async function rpc(name, body) {
        if (!AUTH_RPCS.has(name)) throw new Error("허용되지 않은 인증 요청입니다.");
        const response = await rawFetch(origin + "/rest/v1/rpc/" + name, {
          method: "POST",
          headers: { apikey: key, "Content-Type": "application/json" },
          body: JSON.stringify(body), cache: "no-store",
        });
        if (!response.ok) throw new Error("로그인 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
        const result = await response.json();
        return Array.isArray(result) ? result[0] : result;
      }
      async function restore() {
        clearMemory();
        const at = generation;
        let value;
        try { value = JSON.parse(storage?.getItem(STORAGE_KEY) || "null"); } catch {}
        if (!valid(value)) { clear(); return null; }
        try {
          const result = await rpc("picking_check_session_v1", { p_session_token: value.token });
          if (at !== generation) throw error();
          if (!result?.authenticated) { clear(); return null; }
          return save({ token: value.token, expiresAt: result.expires_at });
        } catch (failure) { if (at === generation) clear(); throw failure; }
      }
      function clearMemory() { session = null; generation++; }
      async function login(username, password) {
        clear();
        const at = generation;
        const result = await rpc("picking_login_v1", { p_username: String(username).trim(), p_password: String(password) });
        if (at !== generation) throw error();
        if (!result?.authenticated) {
          const message = result?.error_code === "rate_limited"
            ? "로그인 시도가 많아 잠시 잠겼습니다. 약 15분 후 다시 시도해주세요."
            : "아이디 또는 비밀번호를 확인해주세요.";
          throw new Error(message);
        }
        return save({ token: result.session_token, expiresAt: result.expires_at });
      }
      async function check() {
        const value = requireSession();
        const at = generation;
        const result = await rpc("picking_check_session_v1", { p_session_token: value.token });
        if (at !== generation) throw error();
        if (!result?.authenticated) { clear(); onRequired(); throw error(); }
        return true;
      }
      async function logout() {
        const token = session?.token;
        clear(); // Local requests stop even if the revoke request fails.
        if (token) await rpc("picking_logout_v1", { p_session_token: token });
      }
      async function protectedFetch(input, options = {}) {
        const destination = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
        if (destination.origin !== origin) throw new Error("인증 정보는 다른 서버로 전달할 수 없습니다.");
        const value = requireSession(), at = generation, controller = new AbortController();
        const headers = new Headers(typeof input === "object" && input.headers ? input.headers : undefined);
        new Headers(options.headers).forEach((value, name) => headers.set(name, value));
        headers.set("x-picking-session", value.token);
        const signal = options.signal || (typeof input === "object" ? input.signal : undefined);
        const abort = () => controller.abort();
        if (signal?.aborted) controller.abort();
        else signal?.addEventListener("abort", abort, { once: true });
        pending.add(controller);
        try {
          const response = await rawFetch(input, { ...options, headers, signal: controller.signal });
          if (at !== generation) throw error();
          if (response.status === 401 || response.status === 403) { clear(); onRequired(); throw error(); }
          return response;
        } finally { pending.delete(controller); signal?.removeEventListener("abort", abort); }
      }
      return { login, restore, logout, check, clear, requireSession, fetch: protectedFetch, get expiresAt() { return session?.expiresAt; } };
    }
    async function createToolAuth({ url, key, fetch: rawFetch, storage, document }) {
      const client = createSessionClient({ url, key, fetch: rawFetch, storage });
      const restored = await client.restore();
      if (!restored) {
        await new Promise((resolve, reject) => {
          const panel = document.createElement("div");
          panel.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,.65);z-index:2147483647;display:grid;place-items:center;padding:1rem";
          panel.innerHTML = '<form style="width:24rem;max-width:100%;padding:1.5rem;border-radius:.75rem;background:white;color:#111827;font:14px system-ui"><h2 style="margin:0 0 .75rem">피킹시스템 로그인</h2><p>아이디와 비밀번호는 셀피아 로그인 정보와 동일합니다.</p><label>아이디<input name="username" autocomplete="username" required style="display:block;width:100%;margin:.4rem 0 .8rem;padding:.5rem"></label><label>비밀번호<input name="password" type="password" autocomplete="current-password" required style="display:block;width:100%;margin:.4rem 0 .8rem;padding:.5rem"></label><p role="status" style="color:#b91c1c;min-height:1.5rem"></p><button type="submit">로그인</button> <button type="button" data-cancel>취소</button></form>';
          document.body.append(panel);
          const form = panel.querySelector("form"), status = panel.querySelector('[role="status"]'), submit = form.querySelector('[type="submit"]');
          let cancelled = false;
          panel.querySelector("[data-cancel]").onclick = () => { cancelled = true; client.clear(); panel.remove(); reject(new Error("로그인을 취소했습니다.")); };
          form.onsubmit = async (event) => {
            event.preventDefault(); submit.disabled = true; status.textContent = "로그인 확인 중…";
            const password = form.elements.password.value;
            form.elements.password.value = "";
            try {
              await client.login(form.elements.username.value, password);
              if (cancelled) { await client.logout(); return; }
              panel.remove(); resolve();
            } catch (failure) { if (!cancelled) status.textContent = failure.message; }
            finally { submit.disabled = false; }
          };
          form.elements.username.focus();
        });
      }
      return client;
    }
    return { createSessionClient, createToolAuth, STORAGE_KEY };
  }
  root.SystemV3PickingAuthFactory = pickingAuthFactory;
  root.SystemV3PickingAuth = pickingAuthFactory();
})(globalThis);
