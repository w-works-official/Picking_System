# Test baseline and production boundaries

`npm ci`, `npm run check`, `npm test`, and `npm run test:browser` are the clean-clone CI gates. Browser tests use synthetic local fixtures and block production Supabase API/Storage requests. Production database/Edge deployments are not CI steps.

## Known historical failure (preserved, not hidden)

`tests/scraperReceiptTime.test.mjs` checks the retired literal title `0812-접수일 재동기화 오류 수정`. It already fails against the unchanged scraper in source commit `5e074e47f9c191c12411524fd3fbbc84c955400b`, corresponding to personal production `491e251ac427954a457e67dc680d9442788e995e`. Its source is retained but is not in the curated CI gate. The current receipt-date safety and existing-order receipt-baseline behavior remain covered by `scraperKoreanSafetyCopy`, `scraperOriginalReceiptBaseline`, `scraperManagementMemoSource`, and `sellpiaOrderDatetimeEnricher` mock tests. No scraper runtime was changed to satisfy an obsolete title.

The older DB tests require isolated local test database packages/setup. Other historical UI tests may reference machine-local runtimes. Do not point them at production to make them pass.

The copied product-image frontend checks remain here; image-policy SQL checks are in Operation_Hub's `tests/productImagePolicy.contract.test.mjs`, with policies stored only in that canonical owner.
