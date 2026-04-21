-- Seed historical execution baseline for Gindi Yehud contract 0163.
-- Idempotent: can run multiple times safely.

alter table public.erp_client_contract_lines
  add column if not exists last_approved_pct numeric(8,4) default 0,
  add column if not exists last_approved_qty numeric(18,3) default 0,
  add column if not exists last_approved_amount numeric(18,2) default 0;

with gindi_seed(code, pct) as (
  values
    ('08.01.01', 100::numeric),
    ('08.01.02', 100::numeric),
    ('08.01.03', 95::numeric),
    ('08.01.04', 90::numeric),
    ('08.01.05', 95::numeric),
    ('08.01.06', 100::numeric),
    ('08.01.07', 100::numeric),
    ('08.01.08', 65::numeric),
    ('08.01.09', 95::numeric),
    ('08.01.10', 95::numeric),
    ('08.01.11', 95::numeric),
    ('08.01.12', 15::numeric),
    ('08.01.13', 80::numeric),
    ('08.01.14', 10::numeric),
    ('08.01.15', 50::numeric)
),
target_contract as (
  select c.id, c.company_id
  from public.erp_client_contracts c
  where trim(c.contract_number) = '0163'
),
calc as (
  select
    l.id,
    l.company_id,
    s.pct as seed_pct,
    round((coalesce(l.quantity, 0) * s.pct) / 100.0, 3) as seed_qty,
    round(
      round((coalesce(l.quantity, 0) * s.pct) / 100.0, 3) * coalesce(l.unit_price, 0),
      2
    ) as seed_amount
  from public.erp_client_contract_lines l
  inner join target_contract tc
    on tc.id = l.client_contract_id
   and tc.company_id = l.company_id
  inner join gindi_seed s
    on s.code = trim(coalesce(l.boq_ref, ''))
)
update public.erp_client_contract_lines l
set
  last_approved_pct = calc.seed_pct,
  last_approved_qty = calc.seed_qty,
  last_approved_amount = calc.seed_amount
from calc
where l.id = calc.id
  and l.company_id = calc.company_id;
