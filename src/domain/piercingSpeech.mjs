// Spoken label for piercing own codes, e.g. "[P] S-11-02 ]" -> "피어싱 S 11 다시 02".
// Rules (requested 2026-10-23, settled 2026-10-27): only codes starting with "[P]" are
// spoken; "[P]" is read as "피어싱"; brackets and anything after the closing "]" are
// dropped; the first hyphen is a pause and every later hyphen is read "다시"; an
// underscore is also read "다시" ("R-26-01_2" -> "R 26 다시 01 다시 2"). Numbers are
// left as written, so the voice reads "11" as 십일.
const PIERCING_CODE = /^\s*(?:낱\s*)?\[\s*P\s*\]\s*([A-Za-z0-9_]+(?:\s*-\s*[A-Za-z0-9_]+)*)/i;

export function piercingSpeechText(ownCode) {
  const match = PIERCING_CODE.exec(String(ownCode ?? ""));
  if (!match) return "";
  const parts = match[1]
    .split("-")
    .map((part) => part.trim().toUpperCase().split("_").filter(Boolean))
    .filter((pieces) => pieces.length)
    .map(([main, ...extra]) => [main, ...extra.flatMap((piece) => ["다시", piece])]);
  if (!parts.length) return "";
  const [first, second = [], ...rest] = parts;
  return ["피어싱", ...first, ...second, ...rest.flatMap((pieces) => ["다시", ...pieces])].join(" ");
}

// Female Korean voice when the device has one (requested 2026-10-27). Names cover
// Windows (Heami, SunHi, …), Chrome ("Google 한국의"), iOS/macOS (Yuna, Sora).
const FEMALE_VOICE = /heami|sunhi|jimin|seohyeon|soonbok|yujin|yuna|sora|google\s*한국|female|여성|여자/i;
const MALE_VOICE = /injoon|hyunsu|bongjin|gookmin|minsu|\bmale\b|남성|남자/i;

export function pickKoreanVoice(voices = []) {
  const korean = [...voices].filter((voice) => /^ko/i.test(String(voice?.lang || "")));
  return (
    korean.find((voice) => FEMALE_VOICE.test(voice.name || "")) ||
    korean.find((voice) => !MALE_VOICE.test(voice.name || "")) ||
    korean[0] ||
    null
  );
}
