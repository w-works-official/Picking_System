// CS 관리 [설정] 탭 · 🚀 처음 설정 안내 (2026-10-29)
// G1 CS 수집기 [설정] 탭의 "원터치 설정 + 떠 있는 안내창(단계별 ✅/⬜ · 버튼 · 바로가기 링크)"을 웹으로 옮긴 것.
// 바뀐 점: 웹은 수집기 PC 프로그램을 직접 설치·실행할 수 없으므로, 수집기 PC에서 할 일은 Win+R 에 붙여넣을 경로로 안내하고,
//          ✅/⬜ 는 시트(웹 연결)·수집기 PC 연결 프로그램(1.2 이상)이 알려 주는 상태로 자동 체크한다. 모르면 ❔.

export const COLLECTOR_DIR_DEFAULT = "C:\\Users\\M\\내 드라이브\\V_회계\\2_CS_게시판_정리\\G1_CS수집기";
export const SETUP_LINKS = {
  스마트스토어: ["https://sell.smartstore.naver.com/", "네이버 아이디로 로그인 (2단계 인증이면 휴대폰에서 확인)"],
  지그재그: ["https://partners.kakaostyle.com/", "카카오스타일 파트너센터 아이디"],
  메이크샵: ["https://www.makeshop.co.kr/newmakeshop/home/login.html", "같은 계정 동시 로그인 불가 — 다른 PC에서 쓰는 중이면 잠시 뒤에"],
  에이블리: ["https://my.a-bly.com/", "에이블리 판매자 아이디"],
};
export const API_CENTER = "https://apicenter.commerce.naver.com";
export const CLAUDE_KEYS = "https://console.anthropic.com/settings/keys";

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function winPath(dir, file) {
  return `"${String(dir || COLLECTOR_DIR_DEFAULT).replace(/[\\/]+$/, "")}\\${file}"`;
}

// ctx: { connected, token, aiEnabled, collector(collectorStatus 결과 또는 null), live }
export function setupSteps(ctx = {}) {
  const c = ctx.collector || null;
  const su = c?.setup || null;
  const seen = !!c && Number.isFinite(c.ago);
  const dir = su?.dir || COLLECTOR_DIR_DEFAULT;
  const unknown = (v) => (v === true ? true : v === false ? false : null);
  const lastVendors = c?.last?.vendors || [];
  const loginBad = lastVendors.filter((v) => v.state === "로그인 필요").map((v) => v.vendor);
  const loginDone = lastVendors.length ? loginBad.length === 0 : unknown(su?.loginOk);
  const collectorState = !c ? "" : c.state === "on" ? "● 연결됨" : c.state === "late" ? "◐ 늦음" : "○ 꺼짐";
  return [
    {
      key: "web", title: "1. 웹 연결 (이 브라우저)", done: !!ctx.connected,
      desc: "CS 시트 비밀번호(BOARD_TOKEN)를 아래 [웹 연결] 칸에 붙여넣고 [연결].\n· 비밀번호는 시트 Apps Script [처음설정] 실행 로그에 있습니다\n· 이 기기 브라우저에만 저장 — 공용 PC는 다 쓰고 [지우기]",
      detail: ctx.connected ? "연결됨" : ctx.token ? "저장된 비밀번호로 연결 안 됨 — 다시 붙여넣기" : "",
      buttons: [{ label: "비밀번호 칸으로", act: "focus-token", main: !ctx.connected }],
    },
    {
      key: "parts", title: "2. 프로그램 부품 (수집기 PC)", done: unknown(su?.parts),
      desc: "수집기 PC에서 아래 파일을 한 번 실행 → 수집기에 필요한 부품과 수집용 브라우저(크롬이 없을 때만)를 설치합니다.\n이미 수집기를 쓰고 있는 PC면 지나가도 됩니다.",
      copy: [{ label: "Win+R 에 붙여넣기", text: winPath(dir, "▶G1수집기_1_설치(처음한번).bat") }],
    },
    {
      key: "icon", title: "3. 바탕화면 아이콘 (수집기 PC)", done: unknown(su?.icon),
      desc: "수집기 창 [설정] 탭 → [🚀 원터치 설정] 한 번이면 부품 → 바탕화면 [G1 CS 수집기] 아이콘 → 로그인 창까지 자동으로 진행합니다. 다음부터는 이 아이콘만 더블클릭.",
      copy: [{ label: "수집기 켜기 (Win+R)", text: winPath(dir, "▶G1수집기_2_실행.bat") }],
    },
    {
      key: "login", title: "4. 판매자센터 로그인 (수집기 PC · 비밀번호만 입력)", done: loginDone,
      desc: "수집기 창 [🔑 로그인] → 탭 4개가 열림 → 탭마다 아이디·비밀번호 입력 → 로그인.\n'비밀번호 저장?' → [저장] 누르면 다음부터 자동입니다.\n모든 탭이 로그인되면 창이 저절로 닫히고 수집이 시작됩니다.\n· 메이크샵은 같은 계정 동시 로그인 불가 (다른 PC에서 쓰는 중이면 나중에)\n· 스마트스토어는 2단계 인증이면 휴대폰에서 [확인]\n· 로그인은 수집기 PC 브라우저에 저장됩니다 — 아래 링크는 이 기기에서 열리는 확인용",
      detail: lastVendors.length ? `지난 수집: ${lastVendors.map((v) => `${v.vendor} ${v.state === "ok" ? "✓" : v.state}`).join(" · ")}` : "",
      links: Object.entries(SETUP_LINKS).map(([k, v]) => ({ label: `${k} ↗`, url: v[0], title: v[1] })),
    },
    {
      key: "api", title: "5. 스마트스토어 API (관리자에게 ID·시크릿 받기)", done: su ? !!su.api : null,
      desc: "수집기 창 [API] 탭 → [이 PC 공인 IP 확인] → 관리자가 커머스API센터에 IP 추가\n→ Client ID · Client Secret 붙여넣기 → [저장] → [연결 테스트]\n· 웹 [📤 등록]도 이 API로 수집기 PC에서 올립니다 (API 키는 수집기 PC에만 저장)",
      detail: su?.api === "own" ? "수집기에 저장됨" : su?.api === "e1" ? "E_1 스마트스토어 API 설정 사용 중" : "",
      copy: [{ label: "설명서 (Win+R)", text: winPath(dir, "G1수집기_0_스마트스토어API_설정방법.md") }],
      links: [{ label: "커머스API센터 ↗", url: API_CENTER }],
    },
    {
      key: "claude", title: "6. Claude API 키 (웹 AI 추천)", done: ctx.connected ? !!ctx.aiEnabled : null,
      desc: "웹 🤖 AI 추천은 시트 Apps Script → 프로젝트 설정(톱니바퀴) → 스크립트 속성 CLAUDE_KEY 에 키를 넣으면 켜집니다.\n· 수집기 메신저 추천 답변용 키는 따로 — 수집기 창 [설정] 탭 [Claude API 키] (선택)",
      detail: su ? `수집기 메신저 키: ${su.claude ? "저장됨" : "없음 (선택)"}` : "",
      links: [{ label: "Claude 키 발급 페이지 ↗", url: CLAUDE_KEYS }],
    },
    {
      key: "link", title: "7. 웹 연결 프로그램 (수집기 PC · 처음 한 번)", done: ctx.connected ? seen && c.state !== "off" : null,
      desc: "수집기 PC에서 아래 파일 실행 → 웹앱 주소와 수집기 비밀번호(COLLECTOR_TOKEN) 붙여넣기 (그 PC에만 암호화 저장).\n이게 켜져 있어야 웹에서 누른 수집·등록이 수집기 PC에서 실행됩니다.",
      detail: c ? `수집기 PC ${collectorState}${c.pc ? ` · ${c.pc}` : ""}${su?.link ? ` · 연결 ${su.link.split(" ")[0]}` : ""}` : "",
      copy: [{ label: "Win+R 에 붙여넣기", text: winPath(dir, "▶G1수집기_5_웹연결.bat") }],
    },
    {
      key: "auto", title: "8. 컴퓨터와 같이 켜기 (창 없이 · 트레이 아이콘)", done: su ? !!(su.bg && su.autostart) : null,
      desc: "검은 창(웹연결)을 닫고 아래 파일을 한 번 실행 → Windows 로그인 때 창 없이 자동 시작, 멈추면 30초 뒤 다시 켜집니다.\n시계 옆 원격보드 동그라미의 오른쪽 반 = G1 웹연결 (초록 대기 · 파랑 실행 중 · 주황 연결 안 됨 · 회색 꺼짐). 둘 다 정상이면 동그라미 하나.",
      detail: su ? `${su.bg ? "창 없이 도는 중" : "검은 창으로 도는 중"} · 자동시작 ${su.autostart ? "등록됨" : "없음"}` : "",
      copy: [{ label: "Win+R 에 붙여넣기", text: winPath(dir, "G1웹연결_백그라운드_등록.bat") }],
    },
    {
      key: "first", title: "9. 첫 수집", done: ctx.connected ? !!c?.last : null,
      desc: "[▶ 수집 시작] → 수집기 PC가 게시판을 모아 이 화면에 올립니다. 처음이면 [🧪 테스트용] 으로 먼저 확인해도 됩니다.",
      detail: c?.last?.at ? `마지막 수집 ${c.last.at} · ${c.last.count}건` : "",
      buttons: [{ label: "▶ 수집 시작", act: "job:collect", main: true, live: true }, { label: "🧪 테스트용", act: "job:test", live: true }],
    },
  ];
}

export function setupProgress(steps) {
  return { done: steps.filter((s) => s.done === true).length, total: steps.length, next: steps.find((s) => s.done !== true) || null };
}

function mark(done) {
  return done === true ? "✅" : done === false ? "⬜" : `<span class="cs-guide-unknown" title="수집기 PC 연결(연결 1.2 이상) 후 자동 확인">❔</span>`;
}

export function guideStepsHtml(steps, { live = false, focus = "" } = {}) {
  return steps.map((s) => {
    const buttons = (s.buttons || []).map((b) => {
      const off = b.live && !live;
      return `<button type="button" class="cs-btn ${b.main ? "cs-btn-primary" : ""}${off ? " is-pending" : ""}" data-guide-act="${esc(b.act)}"${off ? ` disabled title="시트 연결 후 작동"` : ""}>${esc(b.label)}</button>`;
    }).join("");
    const copies = (s.copy || []).map((x) => `<div class="cs-guide-copy"><span class="cs-small">${esc(x.label)}</span><code>${esc(x.text)}</code><button type="button" class="cs-btn cs-btn-mini" data-guide-copy="${esc(x.text)}">📋 복사</button></div>`).join("");
    const links = (s.links || []).map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener"${l.title ? ` title="${esc(l.title)}"` : ""}>${esc(l.label)}</a>`).join("");
    return `<section class="cs-guide-step${s.done === true ? " is-done" : ""}${focus === s.key ? " is-focus" : ""}" data-guide-step="${esc(s.key)}">
      <div class="cs-guide-head"><span class="cs-guide-mark">${mark(s.done)}</span><strong>${esc(s.title)}</strong></div>
      <p class="cs-guide-desc">${esc(s.desc).replace(/\n/g, "<br>")}</p>
      ${s.detail ? `<p class="cs-guide-detail">${esc(s.detail)}</p>` : ""}
      ${copies}
      ${buttons ? `<div class="cs-guide-buttons">${buttons}</div>` : ""}
      ${links ? `<div class="cs-guide-links">${links}</div>` : ""}
    </section>`;
  }).join("");
}

// [설정] 탭 "수집기 설정" 칸에 보여 줄 값 (수집기 PC 현재 값 — 바꾸기는 수집기 창에서)
export function collectorSettingsView(collector) {
  const su = collector?.setup;
  if (!su) return null;
  return {
    outDir: su.outDir || "",
    days: su.days || "",
    zzSlug: su.zzSlug || "",
    showBrowser: su.showBrowser === true,
    note: `수집기 PC 현재 값${collector.pc ? ` (${collector.pc})` : ""} · 업체 ${su.vendors.join("·") || "없음"} · 자동 수집 ${su.autoStart || "-"} 시작 ${su.interval || "-"}분 간격 · 리뷰 ${su.reviewDays || "-"}일`,
  };
}
