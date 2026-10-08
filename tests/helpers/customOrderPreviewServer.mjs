import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const port = Number(process.env.CUSTOM_ORDER_PREVIEW_PORT ?? 4192);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid CUSTOM_ORDER_PREVIEW_PORT");
const previewCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "font-src 'self' data:",
  "worker-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

function previewIndex(source) {
  const fixture = '<script src="tests/fixtures/customOrderPreviewSupabase.js"></script>';
  if (!source.includes('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>')) {
    throw new Error("Preview Supabase injection anchor changed");
  }
  return source
    .replace('<meta charset="utf-8">', `<meta charset="utf-8">\n    ${fixture}`)
    .replace(
      '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>',
      "<!-- Local fixture replaces the external Supabase SDK. -->",
    )
    .replace(/\s*<link\b[^>]*href="https?:\/\/[^>]*>/g, "")
    .replace(/\s*<script\b[^>]*src="https?:\/\/[^>]*><\/script>/g, "")
    .replace('if ("serviceWorker" in navigator)', "if (false /* disabled in local preview */)")
    .replace("아이디와 비밀번호는 셀피아 로그인 정보와 동일합니다.", "로컬 샘플 계정: local-preview / fixture-only (실제 로그인 정보 입력 불필요)")
    .replace('autocomplete="username"', 'autocomplete="off" value="local-preview"')
    .replace('autocomplete="current-password"', 'autocomplete="off" value="fixture-only"')
    .replace(
      '<div id="app" class="app-shell"',
      '<div style="position:fixed;z-index:99999;right:12px;top:8px;padding:6px 10px;border-radius:999px;background:#7c3aed;color:white;font:800 12px sans-serif;box-shadow:0 4px 14px #0003">LOCAL MOCK · production 미접속 · 샘플 사진</div><div id="app" class="app-shell"',
    );
}

function previewApp(source) {
  // Change the served copy only. Production image helpers and source stay intact.
  const imageOrigin = /const IMAGE_SUPABASE_URL = "https:\/\/[^"\s]+";/;
  if (!imageOrigin.test(source)) throw new Error("Preview image origin anchor changed");
  return source.replace(imageOrigin, "const IMAGE_SUPABASE_URL = location.origin;");
}

function sampleProductPhoto(filename) {
  const gold = /SKU-CURRENT|LOCAL-SKU-1|191/.test(filename);
  const metal = gold ? "#cba54e" : "#aebac5";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320" role="img" aria-label="로컬 미리보기 피어싱 샘플">
    <defs><radialGradient id="background"><stop stop-color="#fff"/><stop offset="1" stop-color="#eef1f5"/></radialGradient><linearGradient id="metal" x2="1" y2="1"><stop stop-color="#fff"/><stop offset=".4" stop-color="${metal}"/><stop offset=".7" stop-color="#fff"/><stop offset="1" stop-color="${metal}"/></linearGradient></defs>
    <rect width="320" height="320" rx="24" fill="url(#background)"/>
    <ellipse cx="158" cy="230" rx="81" ry="13" fill="#d7dce4" opacity=".45"/>
    <g transform="rotate(-34 160 160)"><rect x="87" y="153" width="147" height="18" rx="9" fill="url(#metal)" stroke="${metal}"/><circle cx="91" cy="162" r="25" fill="url(#metal)" stroke="${metal}"/>
    ${gold ? `<circle cx="228" cy="162" r="32" fill="url(#metal)" stroke="${metal}"/><circle cx="218" cy="151" r="8" fill="#fff" opacity=".7"/>` : `<circle cx="228" cy="162" r="35" fill="url(#metal)" stroke="${metal}"/><path d="M228 133 253 147 253 176 228 191 203 176 203 147Z" fill="#eefaff" stroke="#adcadb"/><path d="m228 133-13 29 13 29 13-29Z" fill="#fff"/><path d="m203 147 12 15-12 14m50-29-12 15 12 14" fill="none" stroke="#c3dceb"/>`}</g>
    <text x="160" y="289" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#64748b">LOCAL SAMPLE</text>
  </svg>`;
}

const server = http.createServer(async (request, response) => {
  response.setHeader("content-security-policy", previewCsp);
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const requested = pathname === "/" ? "/index.html" : pathname;
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { allow: "GET, HEAD", "content-type": "text/plain; charset=utf-8" });
      response.end("local preview serves files only");
      return;
    }
    const photo = /^\/storage\/v1\/object\/public\/product-images\/sellpia\/([^/]+)\.jpg$/.exec(pathname);
    if (photo) {
      response.writeHead(200, { "content-type": "image/svg+xml; charset=utf-8" });
      response.end(request.method === "HEAD" ? undefined : sampleProductPhoto(photo[1]));
      return;
    }
    if (!/^(?:\/index\.html|\/manifest\.webmanifest|\/assets\/[^\\]+|\/src\/[^\\]+|\/tests\/fixtures\/customOrderPreviewSupabase\.js)$/.test(requested)) {
      throw new Error("outside preview files");
    }
    const file = path.resolve(root, `.${requested}`);
    const relative = path.relative(root, file);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("outside preview root");
    let body = await readFile(file);
    if (requested === "/index.html") body = Buffer.from(previewIndex(body.toString("utf8")));
    if (requested === "/src/app/pickingApp.mjs") body = Buffer.from(previewApp(body.toString("utf8")));
    response.writeHead(200, {
      "content-type": contentTypes[path.extname(file)] || "application/octet-stream",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`CUSTOM_ORDER_PREVIEW_READY http://127.0.0.1:${server.address().port}/?write=1`);
  console.log("Local fixture only: Supabase auth/data mocked, external requests blocked by CSP/fetch, product photos generated as local SVG, service worker disabled.");
});
