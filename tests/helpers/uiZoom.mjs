// 11-09: PC 화면 기본 90%(html zoom) — 크기·자리를 px 로 재는 브라우저 시험은 100% 로 되돌려서 잼 (90% 자체는 workspaceNavSpot 계약 시험이 확인)
export async function noUiZoom(context) {
  await context.addInitScript(() => {
    const add = () => { const s = document.createElement("style"); s.textContent = ":root{zoom:1!important;--uiz:1!important}"; (document.head || document.documentElement).appendChild(s); };
    if (document.documentElement) add(); else document.addEventListener("readystatechange", add, { once: true });
  });
}
