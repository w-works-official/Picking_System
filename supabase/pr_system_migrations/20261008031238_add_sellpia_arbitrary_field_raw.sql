-- Preserve Sellpia's optional arbitrary field as raw supplier product-code text.
-- Additive only: no source/operation backfill, cleanup, permission or auth changes.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.order_items
  add column sellpia_arbitrary_field_raw text;

alter table public.order_item_operations
  add column arbitrary_field_raw_snapshot text;

comment on column public.order_items.sellpia_arbitrary_field_raw is
  'Raw value from the exact Sellpia arbitrary-field column; never own code or location.';
comment on column public.order_item_operations.arbitrary_field_raw_snapshot is
  'Arbitrary-field raw value captured on initial operation creation; no automatic overwrite.';

notify pgrst, 'reload schema';
commit;
