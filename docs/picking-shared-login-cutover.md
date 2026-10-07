# Picking shared-login cutover (not yet activated)

This branch is local-only until the following gates pass. A visible login form
alone is not database protection. Personal Picking is to become a public notice
page; its source backup does not need to stay publicly executable.

## Verified status, 2026-10-07

- Real PostgreSQL 17.11 + pgcrypto isolated on localhost: foundation and activation
  SQL, real bcrypt, SHA256 token storage, expiry/revocation, password-change
  invalidation, restrictive business/Storage RLS and service-role hook passed.
  Run `tests/pickingAuth.realPg.test.mjs` only with `PICKING_QA_PSQL` pointing to a
  local psql and a fresh `picking_auth_fixture` database. Never target production.
- Production foundation migration applied. Treat its file as immutable history.
- Exactly one active shared credential provisioned with user approval by copying
  the Hub bcrypt verifier. No plaintext password, source/file secret or Hub write.
- Production check-session Data API recognizes the RPC and rejects a null token.
- The user signed into the live-backend localhost preview with the shared account;
  the read-only Picking screen loaded successfully with existing orders.
- The activation migration is NOT applied. Existing anonymous access is still
  unchanged, and this is NOT a claim of completed database security.
- Company frontend deployment and personal Picking notice cutover remain gated
  on real-account login verification and replacement-tool readiness.
- Advisor auth-definer findings are intentional for the three narrow login,
  session-validation and logout RPCs. Private-table RLS-with-no-policy findings
  are intentional deny-all. No business table is accessed by these definers.
  Existing mutable-search-path/public-RLS findings are not fixed by foundation;
  the reviewed activation migration handles the public-table session boundary.

## Deployment gates

1. Validate the foundation SQL against real PostgreSQL with pgcrypto. Local
   PGlite tests exercise SQL/RLS with explicit crypto test doubles; they do not
   certify bcrypt, SHA256, random token generation or HTTP request behavior.
2. With separate production approval, apply only the foundation migration and
   provision the shared account in a secure administrator channel. Use the
   agreed Sellpia username/password; never put either into source, migrations,
   browser configuration, logs or command history. This is a separate account,
   not Sellpia SSO or automatic password synchronization. Password changes must
   also update password_changed_at to invalidate existing sessions.
3. Verify real Data API login/check/logout and custom-header forwarding locally
   or in an isolated environment. Verify Storage CORS and RLS separately:
   PostgREST db_pre_request does not protect Storage or Realtime.
4. Replace the distributed scraper and memo-updater bookmarklets with the
   authenticated versions. Old tools intentionally stop working after lockdown.
5. Coordinate a work pause. Deploy the company login frontend and personal
   notice; confirm no anonymous app remains in use. Apply the activation
   migration only with explicit authorization. It requires a provisioned account
   and refuses a conflicting pre-request hook or unreviewed exposed table/view.
6. Verify anonymous direct Data API read/write/RPC denial, login/logout/expiry,
   valid-session business access, shared CSV Storage, and authenticated tools.
   Do not perform real picking or Sellpia writes without separate approval.

## Security boundaries and limitations

- Sessions are tab-scoped sessionStorage. Only the token hash is stored in DB;
  passwords are bcrypt hashes. Credentials and sessions are private-schema only.
- Activation preserves existing business grants/policies and adds a restrictive
  AND gate. It does not grant broad table access or rewrite business data.
- Global failure throttling matches the shared-account model; repeated invalid
  attempts can temporarily lock the account for all operators (15 minutes).
- The receiving CSV bucket system-v3-shared is in Picking and gated separately.
  Product photos are in the Operations Hub project and are NOT protected by this
  Picking token. Their canonical owner/policies are unchanged by this branch.
- Future exposed tables, RPCs, Storage buckets and SECURITY DEFINER functions
  require a new security review. This is not an assertion that every future API
  inherits the correct boundary automatically.
- Service-role/admin automation remains privileged; never embed service keys in
  browser or bookmarklets. No service key is used by this frontend.

## Stop / rollback

Stop on schema, auth, CORS, RLS or existing-workflow failure. Retain backups of
existing policy/grant/hook definitions before production activation. A rollback
of frontend code alone does not roll back RLS or DB hooks. Restoring anonymous
access must be a separately authorized recovery decision, never an automatic
fallback. Do not deploy this branch before provisioning and server QA.

Local-only preview: node scripts/local-login-preview.mjs, http://127.0.0.1:4187/.
It replaces Supabase requests with fixtures; demo / demo is mock-only and is
neither the real shared account nor a production login bypass.
