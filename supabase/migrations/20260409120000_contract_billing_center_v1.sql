-- Contract & Billing Center V1.0: contract_items view + explicit qty/price columns on billing lines

-- ---------------------------------------------------------------------------
-- contract_items: stable name for BoQ rows (alias of contract_line_items)
-- ---------------------------------------------------------------------------
create or replace view public.contract_items as
  select *
  from public.contract_line_items;

comment on view public.contract_items is
  'שורות כתב כמויות / סעיפי חוזה — תצוגה לשם contract_items (מקור: contract_line_items)';

grant select on public.contract_items to authenticated;
grant select on public.contract_items to service_role;

-- ---------------------------------------------------------------------------
-- partial_account_line_items: Previous_Qty, Current_Qty, Total_Price (תקופתי)
-- ---------------------------------------------------------------------------
alter table public.partial_account_line_items
  add column if not exists quantity_previous numeric(18, 4) not null default 0;

alter table public.partial_account_line_items
  add column if not exists quantity_current numeric(18, 4) not null default 0;

alter table public.partial_account_line_items
  add column if not exists line_total_price numeric(18, 2) not null default 0;

comment on column public.partial_account_line_items.quantity_previous is
  'כמות/אחוז מצטבר קודם בתקופה (למשל 0–100 לאחוזי ביצוע לשורה)';
comment on column public.partial_account_line_items.quantity_current is
  'כמות/אחוז מצטבר נוכחי בתקופה';
comment on column public.partial_account_line_items.line_total_price is
  'סכום שורה לתקופה (₪): לרוב (נוכחי−קודם) יחסית לערך בסיס השורה';

-- Backfill from existing approved / cumulative columns
update public.partial_account_line_items li
set
  quantity_previous = 0,
  quantity_current = coalesce(li.approved_percentage, li.execution_percentage, 0),
  line_total_price = coalesce(li.approved_amount, li.cumulative_amount, 0)
where line_total_price = 0
  and coalesce(li.approved_amount, li.cumulative_amount, 0) <> 0;

update public.partial_account_line_items li
set
  quantity_previous = 0,
  quantity_current = coalesce(li.approved_percentage, li.execution_percentage, 0)
where quantity_current = 0
  and quantity_previous = 0
  and coalesce(li.approved_percentage, li.execution_percentage, 0) <> 0;

alter table public.partial_accounts
  add column if not exists current_progress_percent numeric(10, 4);

comment on column public.partial_accounts.current_progress_percent is
  'התקדמות מצטברת בחוזה (0–100) לאחר חישוב חשבון זה';
