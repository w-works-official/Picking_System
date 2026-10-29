// 수집기 PC 공개키로 잠그기 (2026-10-29) — 로그인 비밀번호·스마트스토어 API 키를 웹에서 넣을 때.
// RSA-OAEP(SHA-256). 풀 수 있는 건 수집기 PC(개인키는 그 PC에 Windows 암호화로 보관)뿐 — 시트에는 잠긴 값만 지나감.
export const LOCK_MAX_BYTES = 190; // RSA-2048 OAEP-SHA256 한 번에 잠글 수 있는 최대 길이

export async function lockForPc(pubKey, text, subtle = globalThis.crypto?.subtle) {
  if (!subtle) throw new Error("이 브라우저에서는 잠금(암호화)을 쓸 수 없습니다 — https 주소로 열어 주세요.");
  if (!/^[A-Za-z0-9_-]{300,800}$/.test(String(pubKey || ""))) throw new Error("수집기 PC 잠금 키가 아직 없습니다 — 수집기 PC 웹연결 1.3 이상이 켜져 있어야 합니다.");
  const bytes = new TextEncoder().encode(String(text ?? ""));
  if (!bytes.length) throw new Error("빈 값은 보낼 수 없습니다.");
  if (bytes.length > LOCK_MAX_BYTES) throw new Error("값이 너무 깁니다.");
  const key = await subtle.importKey("jwk", { kty: "RSA", n: pubKey, e: "AQAB", alg: "RSA-OAEP-256", ext: true }, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  const sealed = new Uint8Array(await subtle.encrypt({ name: "RSA-OAEP" }, key, bytes));
  let bin = "";
  for (const b of sealed) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
