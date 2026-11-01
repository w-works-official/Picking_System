// 아이폰·아이패드 (2026-11-01): 홈 화면 아이콘(PNG) · 태블릿 폭에서 제목/필터 겹침·상단 버튼 잘림 방지
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const read = (f) => readFile(new URL(`../${f}`, import.meta.url), "utf8");
for (const [file, prefix] of [["index.html", ""], ["cs/index.html", "../"], ["purchase/index.html", "../"]]) {
  const html = await read(file);
  assert.match(html, new RegExp(`<link rel="apple-touch-icon" sizes="180x180" href="${prefix.replace(/\./g, "\\.")}assets/system-v3-icon-180\\.png">`), `${file} PNG 홈 화면 아이콘`);
  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes">/, `${file} 앱처럼 열기`);
  assert.match(html, /<meta name="apple-mobile-web-app-title" content="System V3">/);
  assert.doesNotMatch(html, /apple-touch-icon"[^>]*\.svg/, "iOS 는 SVG 아이콘을 못 씀");
}
for (const f of ["assets/system-v3-icon-180.png", "assets/system-v3-icon-512.png"]) assert.ok(existsSync(new URL(`../${f}`, import.meta.url)), f);
const manifest = JSON.parse(await read("manifest.webmanifest"));
assert.ok(manifest.icons.some((i) => i.type === "image/png" && i.sizes === "512x512"));

const picking = await read("src/styles/picking.css");
const tablet = picking.slice(picking.indexOf("/* 태블릿(아이패드) 화면 겹침"));
assert.match(tablet, /@media \(max-width: 1280px\) \{[\s\S]*\.toolbar \{\s*flex-wrap: wrap;\s*overflow-x: visible;/, "상단 버튼 잘림 대신 줄바꿈");
assert.match(tablet, /\.panel-head > div:first-child \{\s*flex: 0 0 auto;/, "제목 칸은 줄어들어 필터 밑으로 깔리지 않음");
const cs = await read("src/styles/csBoard.css");
assert.match(cs, /@media \(max-width: 1100px\) \{\s*\.cs-topbar \{\s*flex-wrap: wrap;/);
console.log("tabletIos.contract.test: OK");
