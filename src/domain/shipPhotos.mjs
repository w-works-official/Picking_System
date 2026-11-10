// 🚚 배송사진 (2026-11-10) — 드라이브 '배송사진' 폴더의 사진·동영상을 송장 사진 기준으로 묶기 (순수 함수)
//  · 파일은 시간 순서(시트가 준 t: yyyyMMddHHmmss)로 · 송장 사진 하나 = 한 묶음의 시작
//  · 송장 사진 뒤의 동영상·사진은 다음 송장 사진 전까지 그 묶음 (첫 송장 전 파일은 '송장 전' 묶음)
const WILD = "*○";
const clean = (v) => String(v ?? "").replace(/\s+/g, "").trim();

export function groupShipFiles(files = []) {
  const groups = [];
  let cur = null;
  for (const f of files) {
    if (f?.kind === "photo" && f.invoice && clean(f.recipient)) {
      cur = { key: f.id, recipient: clean(f.recipient), invoice: f, items: [] };
      groups.push(cur);
      continue;
    }
    if (!cur) { cur = { key: "before", recipient: "", invoice: null, items: [] }; groups.push(cur); }
    cur.items.push(f);
  }
  return groups;
}

// 수신자 이름 찾기: 띄어쓰기 무시 · 가려진 글자(* ○)는 아무 글자 · 이름 일부만 넣어도
export function nameMatches(query, recipient) {
  const q = clean(query), r = clean(recipient);
  if (!q || !r) return false;
  const eq = (a, b) => a === b || WILD.includes(a) || WILD.includes(b);
  const within = (short, long) => {
    for (let i = 0; i + short.length <= long.length; i += 1) {
      let ok = true;
      for (let k = 0; k < short.length; k += 1) if (!eq(short[k], long[i + k])) { ok = false; break; }
      if (ok) return true;
    }
    return false;
  };
  return q.length <= r.length ? within(q, r) : within(r, q);
}

export function searchShipGroups(groups = [], query = "") {
  return groups.filter((g) => g.invoice && nameMatches(query, g.recipient));
}

export const shipThumbUrl = (id, size = 320) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${size}`;
export const shipViewUrl = (id) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
export const shipDownloadUrl = (id) => `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;

// "20261110143012" → "11-10 14:30:12"
export function shipTimeLabel(t) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(t || ""));
  return m ? `${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}` : "";
}

export function shipSizeLabel(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)}GB`;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  if (n >= 1024) return `${Math.round(n / 1024)}KB`;
  return n ? `${n}B` : "";
}
