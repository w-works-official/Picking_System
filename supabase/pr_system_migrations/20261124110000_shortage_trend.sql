-- 2026-11-24 피킹시스템 › 데이터 › 미송 추이 (사장님 요청)
--   날짜별(한국 시각) 미송 처리 · 미송 수량 · 수량 고침 · 미송피킹 완료 · 피킹 완료 기록 수
--   피킹 화면이 남기는 기록(workflow_item_events)을 읽기만 함
--   되돌리기: drop function if exists public.picking_shortage_trend(date, date);

create or replace function public.picking_shortage_trend(p_from date, p_to date)
returns table (
  day date,
  shortage_created bigint,
  shortage_qty bigint,
  shortage_changed bigint,
  shortage_repicked bigint,
  picked bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (e.event_at at time zone 'Asia/Seoul')::date as day,
    count(*) filter (where e.event_type = 'shortage_created') as shortage_created,
    coalesce(sum(e.quantity) filter (where e.event_type = 'shortage_created'), 0)::bigint as shortage_qty,
    count(*) filter (where e.event_type = 'shortage_qty_changed') as shortage_changed,
    count(*) filter (where e.event_type = 'shortage_repick_completed') as shortage_repicked,
    count(*) filter (where e.event_type = 'picked') as picked
  from public.workflow_item_events e
  where e.event_at >= (p_from::timestamp at time zone 'Asia/Seoul')
    and e.event_at < ((least(p_to, p_from + 366) + 1)::timestamp at time zone 'Asia/Seoul')
    and e.event_type in ('shortage_created', 'shortage_qty_changed', 'shortage_repick_completed', 'picked')
  group by 1
  order by 1;
$$;

grant execute on function public.picking_shortage_trend(date, date) to anon, authenticated;
