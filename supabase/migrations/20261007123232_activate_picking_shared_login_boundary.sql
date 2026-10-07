-- SEPARATE CUTOVER APPROVAL REQUIRED. Never run as part of a Pages deployment.
-- Login account, company frontend and both replacement bookmarklets must be ready.
begin;
set local lock_timeout = '3s';
do $$
declare target text; was_rls boolean; existing text;
begin
  if not exists (select 1 from picking_private.operator_credentials where is_active) then
    raise exception 'Provision and verify the private shared account before activation';
  end if;
  select setting into existing from pg_db_role_setting s
    cross join lateral unnest(s.setconfig) setting
    where s.setrole = (select oid from pg_roles where rolname = 'authenticator')
      and setting like 'pgrst.db_pre_request=%';
  if existing is not null and existing <> 'pgrst.db_pre_request=picking_private.check_api_request' then
    raise exception 'Existing pre-request hook requires review: %', existing;
  end if;
  -- Explicit inventory from the read-only production audit; no blanket DML grants.
  foreach target in array array[
    'products','orders','order_items','picking','shortage','inspection','sync_log',
    'hold_items','cs_templates','stg_orders','stg_order_items','stg_picking',
    'stg_shortage','stg_inspection','stg_hold_items','stg_sync_log','stg_cs_templates',
    'cs_cases','alimtalk_send_batches','alimtalk_send_items','order_item_operations',
    'workflow_item_events','workflow_invoice_events','shipment_groups',
    'shipment_group_members','shipment_group_events','sellpia_sync_queue','sku_inbound_schedules'
  ] loop
    -- Missing historical staging tables are harmless; newly exposed objects need review.
    if to_regclass(format('public.%I', target)) is null then continue; end if;
    select relrowsecurity into was_rls from pg_class where oid = to_regclass(format('public.%I', target));
    execute format('alter table public.%I enable row level security', target);
    if not was_rls then
      execute format('create policy picking_existing_access on public.%I for all to anon, authenticated using (true) with check (true)', target);
    end if;
    -- Restrictive AND gate: existing permissive policies cannot reopen anonymous access.
    execute format('create policy picking_session_required on public.%I as restrictive for all to anon, authenticated using ((select picking_private.has_valid_session())) with check ((select picking_private.has_valid_session()))', target);
    execute format('revoke truncate, references, trigger on public.%I from anon, authenticated', target);
  end loop;
  -- Fail closed on schema drift instead of silently leaving a new exposed table open.
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p','v','m')
      and (has_table_privilege('anon',c.oid,'SELECT') or has_table_privilege('authenticated',c.oid,'SELECT'))
      and (c.relkind in ('v','m') or not exists (
        select 1 from pg_policy p where p.polrelid=c.oid and p.polname='picking_session_required'))
  ) then raise exception 'Unreviewed exposed public relation: update boundary inventory before cutover'; end if;
end;
$$;
-- Storage does NOT run PostgREST's pre-request hook. Add an independent RLS gate.
create policy picking_shared_storage_session on storage.objects as restrictive for all to anon, authenticated
using (bucket_id <> 'system-v3-shared' or (select picking_private.has_valid_session()))
with check (bucket_id <> 'system-v3-shared' or (select picking_private.has_valid_session()));
alter role authenticator set pgrst.db_pre_request = 'picking_private.check_api_request';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
commit;
