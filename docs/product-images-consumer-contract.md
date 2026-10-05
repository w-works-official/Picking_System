# Product image consumer contract

Picking consumes the existing public product-photo objects from the separate
Operations Hub Supabase Storage project. Storage remains owned and administered
by the Operations Hub/database owner; this repository does not create or change
the project, bucket, objects, or access policies.

- Project: existing Operations Hub Supabase project (`bpgvqmtsjgegnrdzmpep`)
- Bucket: `product-images`
- Object prefix: `sellpia/`
- Object names: SKU-based `.jpg` files, with existing group, range, and priority
  suffix conventions handled by the Picking app
- Consumer: `src/app/pickingApp.mjs` reads public object URLs and uses the
  Supabase Storage client for the existing photo upload, rename, delete, and
  library-listing UI

The Picking Pages deployment only publishes static application files. It does
not deploy Storage policies or make database/API changes. Policy definitions
and authorization remain with the Storage project owner; this document records
the consumer boundary, not a copy of those policies.
