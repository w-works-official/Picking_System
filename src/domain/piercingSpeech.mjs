// Spoken label for own codes (picking voice). Rules settled with 대표님 (2026-10-27):
// - category names: [P] / P+글자 → 피어싱, SA → 세트피어싱, CA → 부품, EA~ED → 귀걸이,
//   EE·EF → 은피어싱, HA~HD → 헤어, NA·NB → 목걸이, RA~RC → 반지, BA·BB → 팔찌, GP로 시작 → 14K.
//   The zone letter is read after the name (귀걸이 A, 헤어 B, 14K A) except for 세트피어싱·부품.
//   Any other zone is spelled as written ([CA-..] → "C A ..").
// - text before the first "[" (끝, 낱, ###, XX) and anything after the code are dropped
// - the first hyphen after the zone is a pause, every later hyphen is read "다시"
// - digits are read one by one (11 → 일일, 304 → 삼공사, 0 → 공), "_" is read "언더바"
// - the quantity is read last: ", 2개"
// e.g. "[P] S-11-02 ]" x2  → "피어싱 S 일일 다시 공이, 2개"
//      "[SA-01-03_3]" x2   → "세트피어싱 공일 다시 공삼 언더바 삼, 2개"
//      "[EA-11-01_1]" x1   → "귀걸이 A 일일 다시 공일 언더바 일, 1개"
//      "[GPA-07-15_1]" x1  → "14K A 공칠 다시 일오 언더바 일, 1개"
const CODE_TOKENS = "([A-Za-z0-9_]+(?:\\s*-\\s*[A-Za-z0-9_]+)*)";
// "[P] S-11-02 ]": the zone letter (S) comes after the bracket.
const PIERCING_CODE = new RegExp(`^[^\\[]*\\[\\s*P\\s*\\]\\s*${CODE_TOKENS}`, "i");
// "[EA-11-01_1]", "끝[SA-05-05_1]", "XX[RA-7-01_4]": zone letters inside the bracket.
const ZONE_CODE = new RegExp(`^[^\\[]*\\[\\s*([A-Za-z]{1,4})\\s*-\\s*${CODE_TOKENS}`, "i");
const KO_DIGITS = ["공", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
const GOLD_14K = "십사케이"; // spelled so every device says "십사 케이" for 14K

const ZONE_NAMES = [
  [/^SA$/, () => ["세트피어싱"]],
  [/^CA$/, () => ["부품"]],
  [/^GP([A-Z]*)$/, (m) => [GOLD_14K, ...m[1].split("")]],
  [/^P([A-Z])$/, (m) => ["피어싱", m[1]]],
  [/^E([A-D])$/, (m) => ["귀걸이", m[1]]],
  [/^E([EF])$/, (m) => ["은피어싱", m[1]]],
  [/^H([A-D])$/, (m) => ["헤어", m[1]]],
  [/^N([AB])$/, (m) => ["목걸이", m[1]]],
  [/^R([A-C])$/, (m) => ["반지", m[1]]],
  [/^B([AB])$/, (m) => ["팔찌", m[1]]],
];

function spokenToken(token) {
  return String(token).toUpperCase().replace(/\d/g, (digit) => KO_DIGITS[Number(digit)]);
}

function zoneWords(zone) {
  const upper = String(zone).toUpperCase();
  for (const [pattern, words] of ZONE_NAMES) {
    const match = pattern.exec(upper);
    if (match) return words(match);
  }
  return upper.split(""); // 코드 그대로: "CA" → "C A"
}

function codeTokens(text) {
  return text
    .split("-")
    .map((part) => part.trim().split("_").filter(Boolean))
    .filter((pieces) => pieces.length)
    .map(([main, ...extra]) => [spokenToken(main), ...extra.flatMap((piece) => ["언더바", spokenToken(piece)])]);
}

export function piercingSpeechText(ownCode, { quantity } = {}) {
  const raw = String(ownCode ?? "");
  let head;
  let tokens;
  const piercing = PIERCING_CODE.exec(raw);
  if (piercing) {
    const all = codeTokens(piercing[1]);
    head = ["피어싱", ...(all[0] || [])];
    tokens = all.slice(1);
  } else {
    const zoned = ZONE_CODE.exec(raw);
    if (!zoned) return "";
    head = zoneWords(zoned[1]);
    tokens = codeTokens(zoned[2]);
  }
  if (!tokens.length) return "";
  const [first, ...rest] = tokens;
  const code = [...head, ...first, ...rest.flatMap((pieces) => ["다시", ...pieces])].join(" ");
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
