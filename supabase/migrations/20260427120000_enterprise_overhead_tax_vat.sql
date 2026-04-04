-- Diamond ERP V1: רישום עקיפות, מדיניות העמסה, ניכוי במקור ב-PO/ספק, תשומות למע״מ.

-- ---------------------------------------------------------------------------
-- קטגוריות עקיפות (מנהלי / תפעולי / שיווק)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'mo_overhead_category') then
    create type public.mo_overhead_category as enum (
      'administrative',
      'operational',
      'marketing'
    );
  end if;
end
$$;

create table if not exists public.mo_overhead_registry (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  category public.mo_overhead_category not null,
  monthly_amount_nis numeric(18, 2) not null default 0,
  effective_from date not null default (current_date),
  effective_to date null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mo_overhead_registry_monthly_chk check (monthly_amount_nis >= 0),
  constraint mo_overhead_registry_dates_chk check (
    effective_to is null or effective_to >= effective_from
  )
);

create index if not exists mo_overhead_registry_active_idx
  on public.mo_overhead_registry (is_active, effective_from desc);

comment on table public.mo_overhead_registry is
  'רישום עלויות קבועות חודשיות (שכירות, רכב, ביטוח וכו׳) להעמסה על פרויקטים.';

alter table public.mo_overhead_registry enable row level security;

drop policy if exists mo_overhead_registry_select_authenticated on public.mo_overhead_registry;
create policy mo_overhead_registry_select_authenticated
  on public.mo_overhead_registry
  for select
  to authenticated
  using (true);

drop policy if exists mo_overhead_registry_insert_admin on public.mo_overhead_registry;
create policy mo_overhead_registry_insert_admin
  on public.mo_overhead_registry
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );

drop policy if exists mo_overhead_registry_update_admin on public.mo_overhead_registry;
create policy mo_overhead_registry_update_admin
  on public.mo_overhead_registry
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );

drop policy if exists mo_overhead_registry_delete_admin on public.mo_overhead_registry;
create policy mo_overhead_registry_delete_admin
  on public.mo_overhead_registry
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );

grant select on public.mo_overhead_registry to authenticated;
grant insert, update, delete on public.mo_overhead_registry to authenticated;

-- ---------------------------------------------------------------------------
-- company_profile: מדיניות העמסת עקיפות (אופיר / הנהלה)
-- ---------------------------------------------------------------------------
alter table public.company_profile
  add column if not exists overhead_allocation_method text not null default 'revenue_pct';

alter table public.company_profile
  drop constraint if exists company_profile_overhead_allocation_method_chk;

alter table public.company_profile
  add constraint company_profile_overhead_allocation_method_chk
  check (overhead_allocation_method in ('revenue_pct', 'labor_hours'));

comment on column public.company_profile.overhead_allocation_method is
  'העמסת רישום עקיפות: אחוז מהכנסה מוכרת או ימי עבודה (גאנט).';

-- ---------------------------------------------------------------------------
-- ספקים: ניכוי במקור ברירת מחדל (%)
-- ---------------------------------------------------------------------------
alter table public.entities
  add column if not exists default_withholding_tax_percent numeric(5, 2) not null default 0;

alter table public.entities
  drop constraint if exists entities_default_withholding_tax_chk;

alter table public.entities
  add constraint entities_default_withholding_tax_chk
  check (
    default_withholding_tax_percent >= 0
    and default_withholding_tax_percent <= 100
  );

comment on column public.entities.default_withholding_tax_percent is
  'ניכוי במקור ברירת מחדל לספק (%) — מוזן ל-PO בעת יצירה/עדכון.';

-- ---------------------------------------------------------------------------
-- PO: ניכוי במקור + קטגוריית עלות ישירה (רכש → דוחות)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'mo_po_direct_cost_category') then
    create type public.mo_po_direct_cost_category as enum (
      'materials',
      'subcontract',
      'equipment',
      'general',
      'marketing_overhead'
    );
  end if;
end
$$;

alter table public.purchase_orders
  add column if not exists withholding_tax_percent numeric(5, 2) not null default 0;

alter table public.purchase_orders
  add column if not exists direct_cost_category public.mo_po_direct_cost_category not null default 'materials';

alter table public.purchase_orders
  drop constraint if exists purchase_orders_withholding_tax_chk;

alter table public.purchase_orders
  add constraint purchase_orders_withholding_tax_chk
  check (
    withholding_tax_percent >= 0
    and withholding_tax_percent <= 100
  );

comment on column public.purchase_orders.withholding_tax_percent is
  'ניכוי במקור על הזמנה (%) — לרוב מספק או ידני.';

comment on column public.purchase_orders.direct_cost_category is
  'סיווג עלות לדוחות P&L ורכש (חומרים / קבלנות / ציוד / כללי / שיווק-עקיפות).';

-- ---------------------------------------------------------------------------
-- חשבוניות ספק: סכום מע״מ (תשומות) — אופציונלי; אחרת הערכה מהאפליקציה
-- ---------------------------------------------------------------------------
alter table public.supplier_invoices
  add column if not exists vat_amount numeric(18, 2) null;

comment on column public.supplier_invoices.vat_amount is
  'מע״מ תשומות (₪) — למוכנות דיווח חודשי; אופציונלי.';

drop trigger if exists mo_overhead_registry_updated_at on public.mo_overhead_registry;
create trigger mo_overhead_registry_updated_at
  before update on public.mo_overhead_registry
  for each row
  execute function public.set_updated_at ();

notify pgrst, 'reload schema';
