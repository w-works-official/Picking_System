-- 2026-11-18 재고반영(피킹·미송서랍) 수량 — 미송 주문의 피킹 수량 누락 보완 (사장님 요청)
--   그대로: '피킹 완료' 된 주문 줄의 수량 (예전과 같은 조건 · 같은 계산)
--   추가:   피킹 완료가 안 된 줄 중 미송 수량이 있는 줄 → (주문 수량 − 미송 수량) 을 피킹 수량으로 같이 셈
--           피킹행이 아직 없는 주문(체크를 한 번도 안 한 주문)도 주문서 줄(order_items)에서 바로 셈 (옵션코드 = p_code)
--           예) 15개 주문 · 재고 14개 → 미송 1 표시, 피킹완료 못 함 → 예전 0개 → 지금 14개
--   미송 수량 = 관리메모2(o_shop_memo2, 화면의 '미송 N' 과 같은 규칙: 'shortage N' / '부족 N' / 첫 숫자)
--               → 메모가 비었으면 마지막 미송 이벤트(미송피킹완료면 0) → 예전 피킹행 값
--   추가분에서 취소된 줄 · 취소된 주문(송장)은 뺌
--   미송서랍(진행 중 미송이 있는 서랍)에 둔 줄은 예전처럼 '미송서랍 보관 수량' 칸으로
--   되돌리기: 20260914100000_optimize_inventory_count_export_rpc.sql 의 함수 본문을 다시 실행

-- create or replace: 반환 모양이 같아 권한(anon · authenticated 실행)이 그대로 유지됨
create or replace function public.get_inventory_survey_live_counts()
returns table (
  sellpia_sku_code text,
  own_code text,
  picked_qty bigint,
  shortage_drawer_qty bigint,
  calculated_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  with live_order_items as (
    select ord_no, item_no, qty, prod_code, p_code, o_shop_memo2
    from public.order_items
    where sellpia_outbound_confirmed_date is null
  ),
  latest_picking as (
    select distinct on (p.ord_no, p.item_no)
      p.*,
      oi.qty as order_qty,
      oi.prod_code as order_own_code
    from live_order_items oi
    join public.picking p
      on p.ord_no = oi.ord_no
     and p.item_no = oi.item_no
    order by p.ord_no, p.item_no, p.id desc
  ),
  active_shortage_drawers as (
    select distinct nullif(btrim(s.drawer_no), '') as drawer_no
    from public.shortage s
    where coalesce(s.short_qty, 0) > 0
      and nullif(btrim(s.drawer_no), '') is not null
  ),
  last_shortage_event as (
    select distinct on (e.sellpia_item_no)
      e.sellpia_item_no,
      e.event_type,
      e.quantity
    from public.workflow_item_events e
    join live_order_items oi
      on oi.item_no = e.sellpia_item_no
    where e.event_type in ('shortage_created', 'shortage_qty_changed', 'shortage_repick_completed')
    order by e.sellpia_item_no, e.event_at desc, e.id desc
  ),
  last_item_cancel as (
    select distinct on (e.sellpia_item_no)
      e.sellpia_item_no,
      e.event_type
    from public.workflow_item_events e
    join live_order_items oi
      on oi.item_no = e.sellpia_item_no
    where e.event_type in ('cancelled', 'cancel_reopened')
    order by e.sellpia_item_no, e.event_at desc, e.id desc
  ),
  last_invoice_cancel as (
    select distinct on (ie.order_group_no)
      ie.order_group_no,
      ie.event_type
    from public.workflow_invoice_events ie
    where ie.event_type in ('cancelled', 'cancel_reopened')
      and ie.order_group_no in (select oi.ord_no from live_order_items oi)
    order by ie.order_group_no, ie.event_at desc, ie.id desc
  ),
  current_pick_state as (
    select distinct on (e.sellpia_item_no)
      e.sellpia_item_no,
      e.event_type
    from public.workflow_item_events e
    join latest_picking lp
      on lp.item_no = e.sellpia_item_no
    where e.event_type in (
      'picked',
      'pick_unchecked',
      'shortage_created',
      'shortage_qty_changed',
      'shortage_repick_completed'
    )
    order by e.sellpia_item_no, e.event_at desc, e.id desc
  ),
  -- 예전과 같은 조건: 피킹 완료(또는 미송피킹 완료) · 미송 0
  picked_rows as (
    select
      lp.item_no,
      lp.sellpia_p_code as sku,
      coalesce(nullif(btrim(lp.p_code), ''), nullif(btrim(lp.order_own_code), '')) as own_code,
      coalesce(lp.order_qty, lp.qty, 1) as item_qty,
      nullif(btrim(lp.drawer_no), '') as drawer_no
    from latest_picking lp
    join current_pick_state state
      on state.sellpia_item_no = lp.item_no
     and state.event_type in ('picked', 'shortage_repick_completed')
    where coalesce(lp.shortage_qty, lp.short_qty, 0) = 0
      and nullif(btrim(lp.sellpia_p_code), '') is not null
  ),
  -- 추가: 위에 안 들어간 줄(피킹행이 아직 없는 주문 포함) 중 미송 수량이 있는 줄 → 주문 수량 − 미송 수량
  shortage_rows as (
    select
      oi.item_no,
      coalesce(nullif(btrim(lp.sellpia_p_code), ''), nullif(btrim(oi.p_code), '')) as sku,
      coalesce(nullif(btrim(lp.p_code), ''), nullif(btrim(oi.prod_code), '')) as own_code,
      greatest(coalesce(oi.qty, lp.qty, 1), 0) as order_qty,
      nullif(btrim(lp.drawer_no), '') as drawer_no,
      coalesce(
        case
          when nullif(btrim(oi.o_shop_memo2), '') is null then null
          else coalesce(
            (regexp_match(oi.o_shop_memo2, 'shortage\s*(\d+)', 'i'))[1],
            (regexp_match(oi.o_shop_memo2, '부족\s*(\d+)'))[1],
            (regexp_match(oi.o_shop_memo2, '(\d+)'))[1]
          )::numeric
        end,
        case
          when se.event_type = 'shortage_repick_completed' then 0
          when se.event_type is not null then coalesce(se.quantity, 0)
        end,
        lp.shortage_qty,
        lp.short_qty,
        0
      ) as shortage_qty
    from live_order_items oi
    left join latest_picking lp on lp.ord_no = oi.ord_no and lp.item_no = oi.item_no
    left join last_shortage_event se on se.sellpia_item_no = oi.item_no
    left join last_item_cancel ic on ic.sellpia_item_no = oi.item_no
    left join last_invoice_cancel vc on vc.order_group_no = oi.ord_no
    where coalesce(ic.event_type, '') <> 'cancelled'
      and coalesce(vc.event_type, '') <> 'cancelled'
      and not exists (select 1 from picked_rows pr where pr.item_no = oi.item_no)
  ),
  eligible as (
    select pr.sku, pr.own_code, pr.item_qty, pr.drawer_no
    from picked_rows pr
    union all
    select
      sr.sku,
      sr.own_code,
      sr.order_qty - least(sr.shortage_qty, sr.order_qty) as item_qty,
      sr.drawer_no
    from shortage_rows sr
    where sr.shortage_qty > 0
      and sr.order_qty > sr.shortage_qty
      and sr.sku is not null
  ),
  normal_picked as (
    select
      e.sku,
      string_agg(distinct e.own_code, ' / ' order by e.own_code) filter (where e.own_code is not null) as own_code,
      sum(e.item_qty)::bigint as qty
    from eligible e
    where not exists (
      select 1
      from active_shortage_drawers d
      where d.drawer_no = e.drawer_no
    )
    group by e.sku
  ),
  shortage_drawer_picked as (
    select
      e.sku,
      string_agg(distinct e.own_code, ' / ' order by e.own_code) filter (where e.own_code is not null) as own_code,
      sum(e.item_qty)::bigint as qty
    from eligible e
    where exists (
      select 1
      from active_shortage_drawers d
      where d.drawer_no = e.drawer_no
    )
    group by e.sku
  )
  select
    coalesce(n.sku, s.sku) as sellpia_sku_code,
    coalesce(n.own_code, s.own_code) as own_code,
    coalesce(n.qty, 0)::bigint as picked_qty,
    coalesce(s.qty, 0)::bigint as shortage_drawer_qty,
    now() as calculated_at
  from normal_picked n
  full join shortage_drawer_picked s using (sku)
  order by sellpia_sku_code;
$$;
