const gate = document.getElementById("picking-login-gate");
const form = document.getElementById("picking-login-form");
const status = document.getElementById("picking-login-status");
const app = document.getElementById("app");
const logoutButton = document.getElementById("picking-logout");
let expiryTimer;
let started = false;
const auth = window.SystemV3PickingAuth.createSessionClient({
  url: "https://vgxocngpykhlkosiaeew.supabase.co",
  key: "sb_publishable_XVnKGJo66GZiYTq5Ivu8dA_SjBVvX0g",
  fetch: window.fetch.bind(window),
  storage: window.sessionStorage,
  onRequired: lock,
});
window.PickingAuth = {
  client: window.supabase.createClient("https://vgxocngpykhlkosiaeew.supabase.co", "sb_publishable_XVnKGJo66GZiYTq5Ivu8dA_SjBVvX0g", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: auth.fetch },
  }),
};
function lock() {
  clearTimeout(expiryTimer);
  app.inert = true;
  app.hidden = true;
  gate.hidden = false;
  status.textContent = "로그인이 필요합니다.";
  // Once the app has initialized, a new document prevents old state/listeners
  // from running in a new session. No sensitive dataset is shown while locked.
  if (started) form.dataset.reload = "true";
}
async function unlock() {
  expiryTimer = setTimeout(() => { auth.clear(); lock(); }, Math.max(0, Date.parse(auth.expiresAt) - Date.now()));
  if (form.dataset.reload) { location.reload(); return; }
  await import("./pickingApp.mjs?v=20261006-scan-buffer1");
  started = true;
  gate.hidden = true;
  app.hidden = false;
  app.inert = false;
}
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  status.textContent = "로그인 확인 중…";
  const password = form.elements.password.value;
  form.elements.password.value = "";
  try { await auth.login(form.elements.username.value, password); await unlock(); }
  catch (failure) { auth.clear(); lock(); status.textContent = failure.message; }
  finally { button.disabled = false; }
});
logoutButton.addEventListener("click", async () => {
  lock();
  try { await auth.logout(); location.reload(); }
  catch { status.textContent = "이 브라우저에서는 로그아웃했습니다. 서버 세션 해제에 실패했으니 담당자에게 문의해주세요."; }
});
try { if (await auth.restore()) await unlock(); else lock(); }
catch (failure) { lock(); status.textContent = failure.message; }
