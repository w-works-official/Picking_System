# Database source ownership and live ledger

Captured 2026-10-05 using read-only Supabase connector calls. Project: `vgxocngpykhlkosiaeew`. No database, Storage, API, cron or function deployment write occurred.

## Ownership

This repository owns picking, orders, CS, shipment, shortages, inventory activity and inbound schedules. Twenty historical files belong here: eleven from the mixed legacy supabase/migrations directory and all nine supabase/pr_system_migrations files. Hub price rules, matching, originals, image policies, exports and retention do not belong here.

## Baseline is an archive, not a deployment queue

- Live migration count: 27.
- Company-owned SQL count at split: 20. Hub retention-source recovery belongs only to Operation_Hub.
- Exact version matches at split: 4. Name matches at split: 20.
- Live-only by name at split: 7; repo-only by name: 0.
- Version-only differences: live 23, repo 16. Local timestamps often differ from live applied timestamps.
- Read-only schema_migrations columns verified: version, statements, name, created_by, idempotency_key, rollback. Only version, name, statements and derived statement counts/hashes were retrieved; user/idempotency metadata was not copied.

`supabase/baseline/live-ledger-20261005.json` records every live version/name, statement count, live body SHA-256, company source-by-name, candidate historical sources and explicit equivalence limitations. The SHA is computed over UTF-8 `array_to_string(statements, LF)`; it is not the hash of an archive JSON file. Source filename/name matches do not prove body equivalence.

Live-only statement bodies were recovered from migration history using SELECT, not from application row tables. 5 non-runnable `*.statements.json` archives preserve retained statement texts with original array indexes. Literal JWT, service secret, private key and long literal authorization credentials were scanned before saving. Top-level data-write statements were withheld conservatively; omitted indexes remain in the ledger. These files are outside `supabase/migrations` and must never be auto-applied, treated as a clean replay baseline, or used to repair production ledger versions.

Seven live-only migration histories are represented in the ledger. Five have statement archives. Two complete statement bodies were withheld because their single stored statement includes a top-level data write; their live hashes and names remain recorded for review.

## Review requirements

- NEEDS_REVIEW: `20260625031740_use_item_no_for_picking_shortage_identity`: 1 original statement(s) withheld; retained 0/1.
- NEEDS_REVIEW: `20260727044134_create_shared_receiving_label_storage`: 1 original statement(s) withheld; retained 0/1.
- Two withheld histories need a separate schema-versus-data review before claiming full source recovery.
- Applied timestamps differ for16 of20 source-name matches; never rename files or replay them solely to match timestamps.
- Do not copy Hub policy migrations here.

## Edge Functions

No live Edge Functions were listed. See baseline/edge-functions-20261005.json.

Historical archive code may contain operational functions that write when executed. Its preservation is provenance only, not authorization or a recommendation to execute it.

Verification: all5 complete Picking statement archives recomputed SHA-256 equal to the live ledger hashes (zero failures). Two entirely withheld bodies remain NEEDS_REVIEW and have no statement archive.
