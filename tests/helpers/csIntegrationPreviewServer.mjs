import http from "node:http";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const mount = "/Picking_System/";
const contentTypes = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
};
const csp = [
  "default-src 'self'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:", "connect-src 'self'", "font-src 'self' data:",
  "worker-src 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'",
].join("; ");

function localPickingIndex(source) {
  const sdk = '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>';
  if (!source.includes(sdk)) throw new Error("Picking preview SDK anchor changed");
  return source
    .replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<script src="tests/fixtures/customOrderPreviewSupabase.js"></script>')
    .replace(sdk, "<!-- Offline fixture replaces Supabase SDK for this local preview only. -->")
    .replace(/\s*<link\b[^>]*href="https?:\/\/[^>]*>/g, "")
    .replace(/\s*<script\b[^>]*src="https?:\/\/[^>]*><\/script>/g, "")
    .replace('if ("serviceWorker" in navigator)', "if (false /* disabled in isolated integration preview */)")
    .replace("아이디와 비밀번호는 셀피아 로그인 정보와 동일합니다.", "로컬 합성 계정: local-preview / fixture-only · 실제 로그인 정보 입력 불필요")
    .replace('autocomplete="username"', 'autocomplete="off" value="local-preview"')
    .replace('autocomplete="current-password"', 'autocomplete="off" value="fixture-only"')
    .replace('<div id="app" class="app-shell"', '<aside style="position:fixed;bottom:8px;right:8px;z-index:99999;padding:5px 10px;border-radius:999px;background:#6d28d9;color:white;font:700 11px sans-serif;pointer-events:none">로컬 합성 미리보기 · 운영 DB 미접속</aside><div id="app" class="app-shell"');
}

function localFixture(source) {
  // Add scanner fixtures only to the served test copy; no existing source or
  // production data is changed. SDK operations remain in memory.
  return source
    .replace('ord_no: "LOCAL-PICK-1", receipt_date:', 'ord_no: "LOCAL-PICK-1", inv_no: "6890123456789", receipt_date:')
    .replace('ord_no: "LOCAL-PICK-2", receipt_date:', 'ord_no: "LOCAL-PICK-2", inv_no: "6890123456790", receipt_date:');
}

function productPhoto(filename) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" role="img" aria-label="합성 상품 사진"><rect width="400" height="300" rx="24" fill="#f1f5f9"/><circle cx="200" cy="135" r="64" fill="none" stroke="#b1b9c4" stroke-width="14"/><circle cx="244" cy="182" r="18" fill="#c9d1db"/><text x="200" y="266" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#64748b">LOCAL SYNTHETIC PRODUCT ${filename.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 35)}</text></svg>`;
}

export async function startCsIntegrationPreview({ port = 4188, root = repositoryRoot } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid integration preview port");
  const resolvedRoot = await realpath(root);
  const fixturePath = path.join(repositoryRoot, "tests/fixtures/customOrderPreviewSupabase.js");
  const server = http.createServer(async (request, response) => {
    response.setHeader("content-security-policy", csp);
    response.setHeader("cache-control", "no-store");
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("referrer-policy", "no-referrer");
    try {
      if (!["GET", "HEAD"].includes(request.method)) {
        response.writeHead(405, { allow: "GET, HEAD" }); response.end(); return;
      }
      const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
      if (pathname === "/" || pathname === "/Picking_System") {
        response.writeHead(302, { location: mount }); response.end(); return;
      }
      const photo = /^\/storage\/v1\/object\/public\/product-images\/sellpia\/([^/]+)\.jpg$/.exec(pathname);
      if (photo) {
        response.writeHead(200, { "content-type": "image/svg+xml; charset=utf-8" });
        response.end(request.method === "HEAD" ? undefined : productPhoto(photo[1])); return;
      }
      if (!pathname.startsWith(mount)) throw new Error("Outside integration mount");
      let relative = pathname.slice(mount.length);
      if (!relative || relative === "index.html") relative = "index.html";
      if (relative === "cs") {
        response.writeHead(302, { location: `${mount}cs/` }); response.end(); return;
      }
      if (relative.endsWith("/")) relative += "index.html";
      if (relative.includes("\\") || !/^(?:index\.html|manifest\.webmanifest|assets\/.+|src\/.+|cs\/.+|tests\/fixtures\/customOrderPreviewSupabase\.js)$/.test(relative)) throw new Error("Outside preview files");
      let body;
      if (relative === "tests/fixtures/customOrderPreviewSupabase.js") {
        body = Buffer.from(localFixture(await readFile(fixturePath, "utf8")));
      } else {
        const file = await realpath(path.resolve(resolvedRoot, relative));
        const boundary = path.relative(resolvedRoot, file);
        if (boundary.startsWith("..") || path.isAbsolute(boundary)) throw new Error("Outside preview root");
        body = await readFile(file);
        if (relative === "index.html") body = Buffer.from(localPickingIndex(body.toString("utf8")));
        if (relative === "src/app/pickingApp.mjs") {
          const source = body.toString("utf8");
          const anchor = /const IMAGE_SUPABASE_URL = "https:\/\/[^"\s]+";/;
          if (!anchor.test(source)) throw new Error("Picking image origin anchor changed");
          body = Buffer.from(source.replace(anchor, "const IMAGE_SUPABASE_URL = location.origin;"));
        }
      }
      response.writeHead(200, { "content-type": contentTypes[path.extname(relative)] || "application/octet-stream" });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); response.end("not found");
    }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  return {
    server, root: resolvedRoot, url: `http://127.0.0.1:${server.address().port}${mount}`,
    close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const preview = await startCsIntegrationPreview({ port: Number(process.env.CS_INTEGRATION_PREVIEW_PORT || 4188), root: process.env.CS_INTEGRATION_PREVIEW_ROOT || repositoryRoot });
  console.log(`CS_INTEGRATION_PREVIEW_READY ${preview.url}?write=1&events=0`);
  console.log("Local synthetic fixtures only. Production auth/data/Storage are not accessed. No writes leave this process.");
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { await preview.close(); process.exit(); });
}
