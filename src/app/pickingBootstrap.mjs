const gate = document.getElementById("picking-login-gate");
const form = document.getElementById("picking-login-form");
const status = document.getElementById("picking-login-status");
const pinForm = document.getElementById("picking-pin-form");          // 2026-11-04 이 기기 6자리
const pinStatus = document.getElementById("picking-pin-status");
const deviceStorage = (() => { try { return window.localStorage; } catch { return null; } })();
const app = document.getElementById("app");
const logoutButton = document.getElementById("picking-logout");
let expiryTimer;
let started = false;
const auth = window.SystemV3PickingAuth.createSessionClient({
  url: "https://vgxocngpykhlkosiaeew.supabase.co",
  key: "sb_publishable_XVnKGJo66GZiYTq5Ivu8dA_SjBVvX0g",
  fetch: window.fetch.bind(window),
  storage: window.sessionStorage,
  deviceStorage,
  onRequired: lock,
});
window.PickingAuth = {
  client: window.supabase.createClient("https://vgxocngpykhlkosiaeew.supabase.co", "sb_publishable_XVnKGJo66GZiYTq5Ivu8dA_SjBVvX0g", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: auth.fetch },
  }),
};
function lock() {
  document.documentElement.classList.remove("picking-auth-restoring");
  clearTimeout(expiryTimer);
  app.inert = true;
  app.hidden = true;
  gate.hidden = false;
  status.textContent = "로그인이 필요합니다.";
  showForm(auth.hasPin ? "pin" : "login");
  // Once the app has initialized, a new document prevents old state/listeners
  // from running in a new session. No sensitive dataset is shown while locked.
  if (started) form.dataset.reload = "true";
}
async function unlock() {
  expiryTimer = setTimeout(() => { auth.clear(); lock(); }, Math.max(0, Date.parse(auth.expiresAt) - Date.now()));
  if (form.dataset.reload) { location.reload(); return; }
  await import("./pickingApp.mjs?v=20261028-photo-request-name1");
  started = true;
  gate.hidden = true;
  app.hidden = false;
  app.inert = false;
  document.documentElement.classList.remove("picking-auth-restoring");
}
function showForm(which) {
  const pin = which === "pin" && auth.hasPin;
  if (pinForm) pinForm.hidden = !pin;
  form.hidden = pin;
  (pin ? pinForm.elements.pin : form.elements.username)?.focus?.();
}
const setPin = form.elements.setpin, pinNew = form.querySelector("[data-pin-new]");
setPin?.addEventListener("change", () => { if (pinNew) pinNew.hidden = !setPin.checked; });
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector('[type="submit"]');
  const wantPin = !!setPin?.checked;
  const newPin = String(form.elements.newpin?.value || ""), newPin2 = String(form.elements.newpin2?.value || "");
  if (wantPin && !/^[0-9]{6}$/.test(newPin)) { status.textContent = "6자리 숫자로 정해 주세요."; return; }
  if (wantPin && newPin !== newPin2) { status.textContent = "6자리 두 번이 서로 다릅니다."; return; }
  button.disabled = true;
  status.textContent = "로그인 확인 중…";
  const password = form.elements.password.value;
  form.elements.password.value = "";
  if (form.elements.newpin) { form.elements.newpin.value = ""; form.elements.newpin2.value = ""; }
  try {
    await auth.login(form.elements.username.value, password);
    if (wantPin) {
      try { await auth.pinEnroll(newPin); setPin.checked = false; if (pinNew) pinNew.hidden = true; }
      catch (failure) {                       // 로그인은 됐으니 화면은 열되, 6자리 실패는 알려 줌
        status.textContent = `로그인은 됐지만 6자리를 설정하지 못했습니다: ${failure.message}`;
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
    }
    await unlock();
  }
  catch (failure) { auth.clear(); lock(); showForm("login"); status.textContent = failure.message; }
  finally { button.disabled = false; }
});
pinForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = pinForm.querySelector('[type="submit"]');
  const pin = String(pinForm.elements.pin.value || "");
  pinForm.elements.pin.value = "";
  if (!/^[0-9]{6}$/.test(pin)) { pinStatus.textContent = "6자리 숫자를 넣어 주세요."; return; }
  button.disabled = true;
  pinStatus.textContent = "확인 중…";
  try { await auth.pinLogin(pin); pinStatus.textContent = ""; await unlock(); }
  catch (failure) {
    if (failure.code === "PIN_DEVICE_UNKNOWN") { showForm("login"); status.textContent = failure.message; }
    else { pinStatus.textContent = failure.message; pinForm.elements.pin.focus(); }
  }
  finally { button.disabled = false; }
});
pinForm?.querySelector("[data-pin-switch]")?.addEventListener("click", () => { pinStatus.textContent = ""; showForm("login"); status.textContent = "아이디·비밀번호로 로그인합니다."; });
pinForm?.querySelector("[data-pin-forget]")?.addEventListener("click", async () => {
  try { await auth.pinForget(); } catch { /* 이 기기에서는 이미 지움 */ }
  showForm("login");
  status.textContent = "이 기기 6자리를 지웠습니다. 아이디·비밀번호로 로그인해 주세요.";
});
logoutButton.addEventListener("click", async () => {
  lock();
  try { await auth.logout(); location.reload(); }
  catch { status.textContent = "이 브라우저에서는 로그아웃했습니다. 서버 세션 해제에 실패했으니 담당자에게 문의해주세요."; }
});
try { if (await auth.restore()) await unlock(); else lock(); }
catch (failure) { lock(); status.textContent = failure.message; }
