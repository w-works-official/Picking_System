-- TARGET: Picking PR_system vgxocngpykhlkosiaeew only. Separate deployment approval.
-- Additive operator-owned slip data; never rewrite source orders, quantities or snapshots.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

create function picking_private.valid_custom_order_slip_v1(p_fields jsonb)
returns boolean language plpgsql immutable security invoker set search_path = ''
as $$
declare field record; amount numeric;
begin
  if p_fields is null then return true; end if;
  if jsonb_typeof(p_fields) <> 'object' then return false; end if;
  for field in select * from jsonb_each(p_fields) loop
    if field.key = 'quantity' then
      if jsonb_typeof(field.value) = 'null' then continue; end if;
      if jsonb_typeof(field.value) <> 'number' then return false; end if;
      amount := (field.value #>> '{}')::numeric;
      if amount < 0 or amount > 1000000 or amount <> trunc(amount) then return false; end if;
    elsif field.key in ('supplierCellRaw','productName','optionName','barLength','supplierCode') then
      if jsonb_typeof(field.value) <> 'string' or char_length(field.value #>> '{}') > 500 then return false; end if;
    else return false;
    end if;
  end loop;
  return true;
end;
$$;
revoke all on function picking_private.valid_custom_order_slip_v1(jsonb) from public;
grant execute on function picking_private.valid_custom_order_slip_v1(jsonb) to anon, authenticated;

alter table public.order_item_operations
  add column slip_overrides jsonb,
  add column slip_sort_order integer,
  add constraint order_item_operations_slip_overrides_check
    check (picking_private.valid_custom_order_slip_v1(slip_overrides)),
  add constraint order_item_operations_slip_sort_order_check
    check (slip_sort_order is null or slip_sort_order >= 0);
comment on column public.order_item_operations.slip_overrides is
  'Operator-edited supplier slip only. Source order identity, quantities and snapshots remain unchanged.';
comment on column public.order_item_operations.slip_sort_order is
  'Operator-defined card position within the assigned supplier; NULL retains automatic order.';
grant update (slip_overrides, slip_sort_order) on public.order_item_operations to anon, authenticated;

create function public.picking_save_custom_order_slips_v1(p_changes jsonb)
returns setof public.order_item_operations
language plpgsql security invoker set search_path = ''
set statement_timeout = '10s' set lock_timeout = '3s'
as $$
declare
  entry jsonb; patch jsonb; id uuid; expected timestamptz;
  ids uuid[] := '{}'; locked_ids uuid[] := '{}'; current_row public.order_item_operations%rowtype;
begin
  -- Preserve the existing shared-login AND RLS boundary, including direct RPC use.
  if not picking_private.has_valid_session() then
    raise exception using errcode = '42501', message = '유효한 피킹 로그인 세션이 필요합니다.';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    raise exception using errcode = '22023', message = '저장 목록 형식이 올바르지 않습니다.';
  end if;
  if jsonb_array_length(p_changes) > 1000 then
    raise exception using errcode = '22023', message = '한 번에 저장할 수 있는 목록 수를 초과했습니다.';
  end if;
  -- Validate every entry before any row is written. Only three mutable fields.
  for entry in select value from jsonb_array_elements(p_changes) loop
    if jsonb_typeof(entry) <> 'object' or not (entry ?& array['operation_id','expected_updated_at','patch'])
      or exists (select 1 from jsonb_object_keys(entry) k where k not in ('operation_id','expected_updated_at','patch'))
      or jsonb_typeof(entry->'operation_id') <> 'string' or jsonb_typeof(entry->'expected_updated_at') <> 'string' then
      raise exception using errcode = '22023', message = '저장 대상 또는 버전 정보가 올바르지 않습니다.';
    end if;
    id := (entry->>'operation_id')::uuid;
    expected := (entry->>'expected_updated_at')::timestamptz;
    if not isfinite(expected) or id = any(ids) then
      raise exception using errcode = '22023', message = '중복된 행 또는 잘못된 버전 정보입니다.';
    end if;
    ids := array_append(ids, id);
    patch := entry->'patch';
    if jsonb_typeof(patch) <> 'object' or patch = '{}'::jsonb then
      raise exception using errcode = '22023', message = '저장 내용이 비어 있거나 형식이 잘못됐습니다.';
    end if;
    if exists (select 1 from jsonb_object_keys(patch) k where k not in ('slip_overrides','slip_sort_order','internal_memo')) then
      raise exception using errcode = '22023', message = '수정할 수 없는 주문서 항목입니다.';
    end if;
    if patch ? 'slip_overrides' and (jsonb_typeof(patch->'slip_overrides') <> 'object'
      or not picking_private.valid_custom_order_slip_v1(patch->'slip_overrides')) then
      raise exception using errcode = '22023', message = '주문서 항목이 올바르지 않습니다.';
    end if;
    if patch ? 'slip_sort_order' then
      if jsonb_typeof(patch->'slip_sort_order') <> 'number' then
        raise exception using errcode = '22023', message = '목록 순서가 올바르지 않습니다.';
      end if;
      if (patch->>'slip_sort_order')::numeric < 0 or (patch->>'slip_sort_order')::numeric > 2147483647
        or (patch->>'slip_sort_order')::numeric <> trunc((patch->>'slip_sort_order')::numeric) then
        raise exception using errcode = '22023', message = '목록 순서가 올바르지 않습니다.';
      end if;
    end if;
    if patch ? 'internal_memo' and (jsonb_typeof(patch->'internal_memo') not in ('string','null')
      or char_length(patch->>'internal_memo') > 500) then
      raise exception using errcode = '22023', message = '내부 메모는 500자까지 입력할 수 있습니다.';
    end if;
  end loop;
  -- Deterministic lock order prevents opposite-direction moves deadlocking.
  for current_row in select o.* from public.order_item_operations o
    where o.operation_id = any(ids) order by o.operation_id for update
  loop
    locked_ids := array_append(locked_ids, current_row.operation_id);
    select (value->>'expected_updated_at')::timestamptz into expected
      from jsonb_array_elements(p_changes) where (value->>'operation_id')::uuid = current_row.operation_id;
    if current_row.updated_at <> expected then
      raise exception using errcode = '40001', message = '다른 작업자가 수정했습니다. 새로고침 후 다시 시도해주세요.';
    end if;
  end loop;
  if cardinality(locked_ids) <> cardinality(ids) then
    raise exception using errcode = '42501', message = '접근할 수 없거나 삭제된 주문제작 행입니다.';
  end if;
  return query
    update public.order_item_operations o set
      slip_overrides = case when c.patch ? 'slip_overrides' then c.patch->'slip_overrides' else o.slip_overrides end,
      slip_sort_order = case when c.patch ? 'slip_sort_order' then (c.patch->>'slip_sort_order')::numeric::integer else o.slip_sort_order end,
      internal_memo = case when c.patch ? 'internal_memo' then nullif(btrim(c.patch->>'internal_memo'),'') else o.internal_memo end
    from (select (value->>'operation_id')::uuid as operation_id, value->'patch' as patch from jsonb_array_elements(p_changes)) c
    where o.operation_id = c.operation_id returning o.*;
end;
$$;
revoke all on function public.picking_save_custom_order_slips_v1(jsonb) from public;
grant execute on function public.picking_save_custom_order_slips_v1(jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
