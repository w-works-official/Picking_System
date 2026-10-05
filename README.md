# Picking System

GitHub Pages: <https://w-works-official.github.io/Picking_System/>

## Sellpia tools

- Scraper: <https://w-works-official.github.io/Picking_System/tools/sellpia_scraper.html>
- Memo updater: <https://w-works-official.github.io/Picking_System/tools/sellpia_memo_updater_0707_stockmatch.html>

The Picking app reads and writes its existing Picking Supabase project. Database
source ownership and migrations are documented in [database ledger](docs/db-ledger.md); publishing
this repository does not deploy or change the database or API.

Product photos use the separate Operations Hub Supabase Storage project. The
consumer contract is documented in
[`docs/product-images-consumer-contract.md`](docs/product-images-consumer-contract.md).

The app is served from the repository subpath. Manifest, icon, and service
worker URLs are relative to that path. The service worker is network-only so
installed clients do not reuse stale operational data or assets.

The existing personal repository and its URL are unchanged by this repository
split.

## Local checks and frontend deployment

Use Node.js 22 or later:

```powershell
npm ci
npm run check
npm test
npx playwright install chromium
npm run test:browser
npm run build
```

The curated 54 offline regression files are the CI gate. The browser test uses synthetic fixtures and blocks all production API/Storage requests. See [test baseline](docs/test-baseline.md) for historical tests outside this gate. `_site/` contains frontend runtime only; SQL, baseline archives, tests and dependencies are not deployed to Pages. Pages workflows never deploy Supabase resources.

The source preserves migration provenance, not an automatically replayable database baseline. Do not apply SQL or deploy backend functions as part of a frontend release.
