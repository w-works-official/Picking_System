// Spoken label for piercing own codes. Rules settled with 대표님 (2026-10-27):
// - "[P] ..." codes are piercing ("피어싱"), "[SA-...]" codes are set piercing ("세트피어싱")
// - brackets, any text before the first "[" (예: 끝, 낱) and anything after the code are dropped
// - [P]: the first hyphen is a pause, every later hyphen is read "다시"
//   [SA]: "SA" itself is the label, so the hyphen after the first number is read "다시"
// - digits are read one by one: 11 -> 일일, 304 -> 삼공사, 02 -> 공이
// - an underscore is read "언더바": R-26-01_2 -> R 이육 다시 공일 언더바 이
// - the quantity is read last: ", 2개"
// e.g. "[P] S-11-02 ]" x2 -> "피어싱 S 일일 다시 공이, 2개"
//      "[SA-01-03_3]" x2 -> "세트피어싱 공일 다시 공삼 언더바 삼, 2개"
const CODE_TOKENS = "([A-Za-z0-9_]+(?:\\s*-\\s*[A-Za-z0-9_]+)*)";
const PIERCING_CODE = new RegExp(`^[^\\[]*\\[\\s*P\\s*\\]\\s*${CODE_TOKENS}`, "i");
const SET_PIERCING_CODE = new RegExp(`^[^\\[]*\\[\\s*SA\\s*-\\s*${CODE_TOKENS}`, "i");
const KO_DIGITS = ["공", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];

function spokenToken(token) {
  return String(token).toUpperCase().replace(/\d/g, (digit) => KO_DIGITS[Number(digit)]);
}

export function piercingSpeechText(ownCode, { quantity } = {}) {
  const raw = String(ownCode ?? "");
  const piercing = PIERCING_CODE.exec(raw);
  const setPiercing = piercing ? null : SET_PIERCING_CODE.exec(raw);
  const match = piercing || setPiercing;
  if (!match) return "";
  const label = piercing ? "피어싱" : "세트피어싱";
  const tokens = match[1]
    .split("-")
    .map((part) => part.trim().split("_").filter(Boolean))
    .filter((pieces) => pieces.length)
    .map(([main, ...extra]) => [spokenToken(main), ...extra.flatMap((piece) => ["언더바", spokenToken(piece)])]);
  if (!tokens.length) return "";
  // For SA the label stands in for the first token (the "S" of "[P] S-11-02 ]").
  const parts = piercing ? tokens : [[], ...tokens];
  const [first, second = [], ...rest] = parts;
  const code = [label, ...first, ...second, ...rest.flatMap((pieces) => ["다시", ...pieces])].join(" ");
  const qty = Number(quantity);
  return Number.isFinite(qty) && qty > 0 ? `${code}, ${Math.trunc(qty)}개` : code;
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
