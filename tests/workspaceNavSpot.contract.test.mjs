import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const [navCss, csHtml, index, purchase, boot, loginCss, manifest] = await Promise.all([
  read("src/styles/workspaceNavigation.css"), read("cs/index.html"), read("index.html"), read("purchase/index.html"),
  read("src/app/pickingBootstrap.mjs"), read("src/styles/pickingLogin.css"), read("cs/artifact-manifest.json"),
]);

// 2026-10-29: 세 화면 상위 업무 버튼 같은 자리 = 제목 칸 252px + 12px 간격 (721px 이상)
assert.match(navCss, /\.topbar > \.brand,\s*\.purchase-topbar > \.purchase-brand \{\s*flex: 0 0 252px;\s*width: 252px;/);
assert.match(navCss, /\.topbar,\s*\.purchase-topbar \{\s*justify-content: flex-start;\s*column-gap: 12px;/);
assert.match(navCss, /\.app-shell > \.topbar \{\s*contain: inline-size;/, "toolbar never widens the top bar");
const cssName = csHtml.match(/\.\/assets\/(index-[^"]+\.css)/)[1];
const csCss = await read(`cs/assets/${cssName}`);
assert.match(csCss, /\.company-sample \.topbar>\.app-heading\{flex:0 0 252px;width:252px;/);
assert.match(csCss, /\.company-sample \.topbar\{justify-content:flex-start;column-gap:12px;padding-left:12px;padding-right:12px;/);
assert.match(csCss, /company-workspace-nav a\[aria-current=page\]\{background:#be185d;/, "CS 관리 = 진한 핑크 유지");
assert.ok(JSON.parse(manifest).files.some((f) => f.path === `assets/${cssName}`), "manifest points at the served CSS");
// 같은 글꼴
for (const html of [index, csHtml, purchase]) assert.match(html, /pretendard\/1\.3\.9\/static\/pretendard\.css/);
assert.match(index, /workspaceNavigation\.css\?v=20261029-equal-width1/);
assert.match(purchase, /workspaceNavigation\.css\?v=20261029-equal-width1/);
// 세 버튼 같은 폭
assert.match(navCss, /\.workspace-navigation \.workspace-link \{\s*box-sizing: border-box;\s*width: 80px;/);
assert.match(csCss, /\.company-sample \.company-workspace-nav a\{box-sizing:border-box;width:80px;/);

// 로그인 화면 반짝임 방지: 저장된 세션 확인 중에만 숨김, 실패하면 lock() 이 다시 보이게, 8초 안전장치
assert.match(index, /sessionStorage\.getItem\("system-v3-picking-session-v1"\)/);
assert.match(index, /classList\.add\("picking-auth-restoring"\)/);
assert.match(index, /setTimeout\(function \(\) \{ root\.classList\.remove\("picking-auth-restoring"\); \}, 8000\)/);
assert.ok(index.indexOf('classList.add("picking-auth-restoring")') < index.indexOf('<body>'), "runs before the gate is painted");
assert.match(loginCss, /\.picking-auth-restoring #picking-login-gate \{ visibility: hidden; \}/);
assert.match(boot, /function lock\(\) \{\s*document\.documentElement\.classList\.remove\("picking-auth-restoring"\);/);
assert.match(boot, /app\.inert = false;\s*document\.documentElement\.classList\.remove\("picking-auth-restoring"\);/);
assert.match(index, /pickingBootstrap\.mjs\?v=20261029-restore1/);

console.log("workspaceNavSpot.contract.test: OK");
