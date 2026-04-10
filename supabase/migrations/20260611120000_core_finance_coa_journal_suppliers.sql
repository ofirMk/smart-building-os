-- Core Finance — הרחבות כרטסת, הפניות בכותרת יומן, טבלת ספקים (Priority-style ERP)

-- ---------------------------------------------------------------------------
-- gl_accounts — סוג חשבון (נכס/התחייבות/הון/הכנסה/הוצאה), היררכיה, יתרה רציפה
-- ---------------------------------------------------------------------------
alter table public.gl_accounts
  add column if not exists account_class text
    constraint gl_accounts_account_class_chk check (
      account_class is null
      or account_class in ('asset', 'liability', 'equity', 'income', 'expense')
    ),
  add column if not exists parent_id uuid references public.gl_accounts (id) on delete set null,
  add column if not exists balance numeric(18, 2) not null default 0;

create index if not exists gl_accounts_parent_id_idx
  on public.gl_accounts (parent_id)
  where parent_id is not null;

comment on column public.gl_accounts.account_class is
  'סיווג ליבה: נכס, התחייבות, הון, הכנסה, הוצאה';
comment on column public.gl_accounts.parent_id is 'הורה בכרטסת היררכית';
comment on column public.gl_accounts.balance is 'יתרה נוכחית (ריצה / מאזן — לפי מדיניות המערכת)';

-- ---------------------------------------------------------------------------
-- journal_entries — מספר הפניה חיצוני (אסמכתא מסמך / Priority)
-- ---------------------------------------------------------------------------
alter table public.journal_entries
  add column if not exists reference_number text;

comment on column public.journal_entries.reference_number is
  'מספר הפניה / אסמכתא חיצונית (מקור מסמך)';

-- ---------------------------------------------------------------------------
-- suppliers — ספקים וקבלנים (ליבת מימון)
-- ---------------------------------------------------------------------------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  supplier_type text not null default 'supplier',
  tax_id text,
  bank_details jsonb not null default '{}'::jsonb,
  vat_status text,
  balance numeric(18, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suppliers_name_nonempty check (length(trim(name)) > 0)
);

create index if not exists suppliers_name_idx on public.suppliers (name);
create index if not exists suppliers_tax_id_idx on public.suppliers (tax_id)
  where tax_id is not null;

drop trigger if exists suppliers_updated_at on public.suppliers;
create trigger suppliers_updated_at
  before update on public.suppliers
  for each row
  execute function public.set_updated_at();

comment on table public.suppliers is 'ספקים וקבלנים — יתרה ומע״מ לפי מדיניות';

alter table public.suppliers enable row level security;

grant select, insert, update, delete on public.suppliers to authenticated;
grant all on public.suppliers to service_role;

drop policy if exists suppliers_all_authenticated on public.suppliers;
create policy suppliers_all_authenticated
  on public.suppliers
  for all
  to authenticated
  using (true)
  with check (true);
