-- 2026-11-18 오늘 검품 리포트 (사장님 요청)
--   · 컴퓨터별 검품 건수 = 검품 화면에서 송장번호로 조회(스캔·검색)한 송장 수 — 같은 컴퓨터 · 같은 송장 · 같은 날은 1건
--   · 컴퓨터 번호는 1, 2, 3 … 자동으로 매기고 이름은 나중에 CS 관리 ⚙ 설정 › 🖥 마스터 PC 설정에서 넣음
--   · 총 발송건 = 송장번호가 생긴 주문을 10분마다 기록해 두고, 주문 목록에서 빠져나간(=출고) 송장을 마지막으로 본 날의 발송건으로 셈
--   · 검색 누락 = 발송건 중 어느 컴퓨터에서도 조회하지 않은 송장
--   주문 · 피킹 데이터는 읽기만 함. 새 표 3개와 함수만 추가
--   되돌리기: 아래 drop 문 (맨 끝 주석)

create table if not exists public.inspection_pcs (
  pc_no integer primary key,
  name text not null default '',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.inspection_lookups (
  id bigserial primary key,
  day date not null,
  pc_no integer not null,
  invoice_no text not null,
  order_group_no text not null default '',
  created_at timestamptz not null default now(),
  unique (day, pc_no, invoice_no)
);
create index if not exists inspection_lookups_invoice_idx on public.inspection_lookups (invoice_no);

create table if not exists public.inspection_invoices_seen (
  invoice_no text primary key,
  order_group_no text not null default '',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists inspection_invoices_seen_last_idx on public.inspection_invoices_seen (last_seen_at);

alter table public.inspection_pcs enable row level security;
alter table public.inspection_lookups enable row level security;
alter table public.inspection_invoices_seen enable row level security;
-- 표는 함수로만 다룸 (직접 읽기·쓰기 권한 없음)

-- 지금 주문 목록에 있는 송장 기록 (10분마다 + 조회·리포트 때)
create or replace function public.inspection_snapshot_invoices()
returns integer
language sql
security definer
set search_path = ''
as $$
  with cur as (
    select distinct on (regexp_replace(oi.inv_no, '\D', '', 'g'))
      regexp_replace(oi.inv_no, '\D', '', 'g') as invoice_no,
      oi.ord_no
    from public.order_items oi
    where length(regexp_replace(coalesce(oi.inv_no, ''), '\D', '', 'g')) >= 8
    order by regexp_replace(oi.inv_no, '\D', '', 'g'), oi.ord_no
  ), up as (
    insert into public.inspection_invoices_seen as s (invoice_no, order_group_no)
    select invoice_no, ord_no from cur
    on conflict (invoice_no) do update set last_seen_at = now(), order_group_no = excluded.order_group_no
    returning 1
  )
  select count(*)::integer from up;
$$;

-- 이 컴퓨터 번호 받기 (처음 한 번)
create or replace function public.inspection_pc_register()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  lock table public.inspection_pcs in exclusive mode;
  select coalesce(max(pc_no), 0) + 1 into n from public.inspection_pcs;
  insert into public.inspection_pcs (pc_no) values (n);
  return n;
end;
$$;

-- 검품 조회 기록 (같은 날 · 같은 컴퓨터 · 같은 송장은 1건)
create or replace function public.inspection_lookup_log(p_pc integer, p_invoice text, p_order_group text default '')
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare inv text := regexp_replace(coalesce(p_invoice, ''), '\D', '', 'g');
declare added integer;
begin
  if p_pc is null or p_pc < 1 or length(inv) < 8 then return false; end if;
  insert into public.inspection_pcs (pc_no) values (p_pc) on conflict (pc_no) do update set last_seen_at = now();
  insert into public.inspection_lookups (day, pc_no, invoice_no, order_group_no)
  values ((now() at time zone 'Asia/Seoul')::date, p_pc, inv, left(coalesce(p_order_group, ''), 80))
  on conflict (day, pc_no, invoice_no) do nothing;
  get diagnostics added = row_count;
  return added > 0;
end;
$$;

-- 컴퓨터 이름 바꾸기
create or replace function public.inspection_pc_rename(p_pc integer, p_name text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  insert into public.inspection_pcs (pc_no, name) values (p_pc, left(btrim(coalesce(p_name, '')), 20))
  on conflict (pc_no) do update set name = excluded.name
  returning true;
$$;

-- 리포트: 그날 컴퓨터별 조회 건수 · 총 발송건 · 검색 누락 송장
create or replace function public.inspection_report(p_day date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare d date := coalesce(p_day, (now() at time zone 'Asia/Seoul')::date);
declare out jsonb;
begin
  perform public.inspection_snapshot_invoices();
  with pcs as (
    select p.pc_no, p.name,
      (select count(*) from public.inspection_lookups l where l.day = d and l.pc_no = p.pc_no) as cnt
    from public.inspection_pcs p
  ),
  shipped as (
    select s.invoice_no, s.order_group_no, s.last_seen_at
    from public.inspection_invoices_seen s
    where (s.last_seen_at at time zone 'Asia/Seoul')::date = d
      and not exists (
        select 1 from public.order_items oi
        where regexp_replace(coalesce(oi.inv_no, ''), '\D', '', 'g') = s.invoice_no
      )
  ),
  missing as (
    select sh.* from shipped sh
    where not exists (select 1 from public.inspection_lookups l where l.invoice_no = sh.invoice_no)
  )
  select jsonb_build_object(
    'day', d,
    'pcs', coalesce((select jsonb_agg(jsonb_build_object('pc', pc_no, 'name', name, 'count', cnt) order by pc_no) from pcs), '[]'::jsonb),
    'looked', (select count(distinct l.invoice_no) from public.inspection_lookups l where l.day = d),
    'shipped', (select count(*) from shipped),
    'missing', (select count(*) from missing),
    'missingList', coalesce((select jsonb_agg(jsonb_build_object('invoice', m.invoice_no, 'order', m.order_group_no, 'at', m.last_seen_at) order by m.last_seen_at) from (select * from missing order by last_seen_at limit 200) m), '[]'::jsonb),
    'trackingSince', (select min(first_seen_at) from public.inspection_invoices_seen),
    'waiting', (select count(distinct regexp_replace(oi.inv_no, '\D', '', 'g')) from public.order_items oi where length(regexp_replace(coalesce(oi.inv_no, ''), '\D', '', 'g')) >= 8)
  ) into out;
  return out;
end;
$$;

revoke all on function public.inspection_snapshot_invoices() from public, anon, authenticated;
grant execute on function public.inspection_pc_register() to anon, authenticated;
grant execute on function public.inspection_lookup_log(integer, text, text) to anon, authenticated;
grant execute on function public.inspection_pc_rename(integer, text) to anon, authenticated;
grant execute on function public.inspection_report(date) to anon, authenticated;

-- 10분마다 송장 기록 (pg_cron)
select cron.schedule('inspection_snapshot_invoices', '*/10 * * * *', $c$select public.inspection_snapshot_invoices();$c$);
select public.inspection_snapshot_invoices();

-- 되돌리기:
-- select cron.unschedule('inspection_snapshot_invoices');
-- drop function if exists public.inspection_report(date), public.inspection_pc_rename(integer, text),
--   public.inspection_lookup_log(integer, text, text), public.inspection_pc_register(), public.inspection_snapshot_invoices();
-- drop table if exists public.inspection_lookups, public.inspection_invoices_seen, public.inspection_pcs;
