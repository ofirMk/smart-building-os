-- Diamond Finance: תרשים חשבונות, יומן כפול, קבלות, הקצאות — מרקר אופק V1

-- ---------------------------------------------------------------------------
-- תרשים חשבונות
-- ---------------------------------------------------------------------------
create table if not exists public.mo_chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  account_type text not null
    constraint mo_coa_type_chk check (
      account_type in ('asset', 'liability', 'equity', 'income', 'expense')
    ),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint mo_chart_of_accounts_code_key unique (code)
);

create index if not exists mo_chart_of_accounts_type_idx
  on public.mo_chart_of_accounts (account_type);

comment on table public.mo_chart_of_accounts is
  'תרשים חשבונות — קוד ייחודי לשימוש במנוע היומן';

-- ---------------------------------------------------------------------------
-- פקודות יומן
-- ---------------------------------------------------------------------------
create table if not exists public.mo_journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  reference text not null,
  description text,
  source_type text,
  source_id uuid,
  project_id uuid null references public.projects (id) on delete set null,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists mo_journal_entries_project_id_idx
  on public.mo_journal_entries (project_id)
  where project_id is not null;

create index if not exists mo_journal_entries_source_idx
  on public.mo_journal_entries (source_type, source_id);

comment on table public.mo_journal_entries is
  'כותרת פקודת יומן — כפל קלט כפול';

-- ---------------------------------------------------------------------------
-- שורות יומן
-- ---------------------------------------------------------------------------
create table if not exists public.mo_journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.mo_journal_entries (id) on delete cascade,
  account_id uuid not null references public.mo_chart_of_accounts (id) on delete restrict,
  debit numeric(18, 2) not null default 0
    constraint mo_jl_debit_nonneg check (debit >= 0),
  credit numeric(18, 2) not null default 0
    constraint mo_jl_credit_nonneg check (credit >= 0),
  memo text,
  constraint mo_jl_one_side_chk check (
    (debit > 0 and credit = 0)
    or (credit > 0 and debit = 0)
  )
);

create index if not exists mo_journal_lines_entry_id_idx
  on public.mo_journal_lines (journal_entry_id);

create index if not exists mo_journal_lines_account_id_idx
  on public.mo_journal_lines (account_id);

-- ---------------------------------------------------------------------------
-- קבלות (תשלום נכנס)
-- ---------------------------------------------------------------------------
create table if not exists public.mo_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_date date not null,
  payment_method text not null
    constraint mo_receipts_pay_method_chk check (
      payment_method in (
        'bank_transfer',
        'check',
        'cash',
        'credit_card',
        'other'
      )
    ),
  reference text,
  amount numeric(18, 2) not null
    constraint mo_receipts_amount_pos check (amount > 0),
  entity_id uuid not null references public.entities (id) on delete restrict,
  project_id uuid null references public.projects (id) on delete set null,
  journal_entry_id uuid null references public.mo_journal_entries (id) on delete set null,
  notes text,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists mo_receipts_entity_id_idx
  on public.mo_receipts (entity_id);

create index if not exists mo_receipts_receipt_date_idx
  on public.mo_receipts (receipt_date desc);

-- ---------------------------------------------------------------------------
-- הקצאת קבלה לחשבוניות (גבייה)
-- ---------------------------------------------------------------------------
create table if not exists public.mo_receipt_allocations (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.mo_receipts (id) on delete cascade,
  invoice_id uuid not null references public.mo_invoices (id) on delete restrict,
  amount numeric(18, 2) not null
    constraint mo_receipt_alloc_amt_pos check (amount > 0),
  created_at timestamptz not null default now(),
  constraint mo_receipt_alloc_unique unique (receipt_id, invoice_id)
);

create index if not exists mo_receipt_allocations_invoice_id_idx
  on public.mo_receipt_allocations (invoice_id);

-- ---------------------------------------------------------------------------
-- ישות לקוח: תנאי תשלום וכתובת חיוב (CRM פיננסי)
-- ---------------------------------------------------------------------------
alter table public.entities
  add column if not exists payment_terms_days int not null default 30
    constraint entities_payment_terms_days_chk check (
      payment_terms_days >= 0 and payment_terms_days <= 365
    );

alter table public.entities
  add column if not exists billing_address text null;

comment on column public.entities.payment_terms_days is
  'ימים לפירעון — לחישוב גילוי חובות';

comment on column public.entities.billing_address is
  'כתובת חיוב ללקוח (CRM)';

-- ---------------------------------------------------------------------------
-- קישור חשבונית ↔ יומן (מעקב)
-- ---------------------------------------------------------------------------
alter table public.mo_invoices
  add column if not exists journal_entry_id uuid null references public.mo_journal_entries (id) on delete set null;

create index if not exists mo_invoices_journal_entry_id_idx
  on public.mo_invoices (journal_entry_id)
  where journal_entry_id is not null;

-- ---------------------------------------------------------------------------
-- זרע תרשים חשבונות סטנדרטי
-- ---------------------------------------------------------------------------
insert into public.mo_chart_of_accounts (code, name, account_type)
values
  ('1000', 'בנק / מזומן', 'asset'),
  ('1200', 'לקוחות (חוב)', 'asset'),
  ('2200', 'מע״מ לתשלום', 'liability'),
  ('4000', 'הכנסות ממכירות', 'income')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- טריגר: חשבונית מאושרת → פקודת יומן מאוזנת (Dr לקוחות, Cr הכנסות, Cr מע״מ)
-- BEFORE UPDATE — מונע רקורסיה וממלא journal_entry_id ב-NEW
-- ---------------------------------------------------------------------------
create or replace function public.mo_invoices_post_double_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ar uuid;
  v_rev uuid;
  v_vat uuid;
  v_je uuid;
  v_exists int;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;
  if not coalesce(new.is_finalized, false) then
    return new;
  end if;
  if coalesce(old.is_finalized, false) then
    return new;
  end if;
  if new.journal_entry_id is not null then
    return new;
  end if;

  select count(*) into v_exists
  from public.mo_journal_entries
  where source_type = 'mo_invoice'
    and source_id = new.id;
  if v_exists > 0 then
    return new;
  end if;

  select id into v_ar from public.mo_chart_of_accounts where code = '1200' limit 1;
  select id into v_rev from public.mo_chart_of_accounts where code = '4000' limit 1;
  select id into v_vat from public.mo_chart_of_accounts where code = '2200' limit 1;
  if v_ar is null or v_rev is null or v_vat is null then
    raise exception 'mo_coa_missing'
      using errcode = 'P0001',
      message = 'תרשים חשבונות חסר — הריצו מיגרציה';
  end if;

  if round(coalesce(new.subtotal, 0)::numeric + coalesce(new.vat_amount, 0)::numeric, 2)
     <> round(coalesce(new.grand_total, 0)::numeric, 2) then
    raise exception 'mo_invoice_amounts_mismatch'
      using errcode = 'P0001',
      message = 'סכומי חשבונית לא תואמים לפני רישום יומן';
  end if;

  insert into public.mo_journal_entries (
    entry_date,
    reference,
    description,
    source_type,
    source_id,
    project_id,
    created_by
  ) values (
    coalesce(new.issue_date, current_date),
    'INV-' || coalesce(new.invoice_number::text, new.id::text),
    'חשבונית מס',
    'mo_invoice',
    new.id,
    new.project_id,
    auth.uid()
  )
  returning id into v_je;

  insert into public.mo_journal_lines (journal_entry_id, account_id, debit, credit, memo)
  values
    (v_je, v_ar, coalesce(new.grand_total, 0), 0, 'חוב לקוח'),
    (v_je, v_rev, 0, coalesce(new.subtotal, 0), 'הכנסה'),
    (v_je, v_vat, 0, coalesce(new.vat_amount, 0), 'מע״מ');

  new.journal_entry_id := v_je;
  return new;
end;
$$;

drop trigger if exists mo_invoices_double_entry_trg on public.mo_invoices;
create trigger mo_invoices_double_entry_trg
  before update of is_finalized, subtotal, vat_amount, grand_total, issue_date, invoice_number
  on public.mo_invoices
  for each row
  execute function public.mo_invoices_post_double_entry();

comment on function public.mo_invoices_post_double_entry() is
  'לאחר אימות חשבונית — רישום כפל קלט: חוב לקוח / זכות הכנסות / זכות מע״מ';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.mo_chart_of_accounts enable row level security;
alter table public.mo_journal_entries enable row level security;
alter table public.mo_journal_lines enable row level security;
alter table public.mo_receipts enable row level security;
alter table public.mo_receipt_allocations enable row level security;

drop policy if exists mo_coa_select on public.mo_chart_of_accounts;
create policy mo_coa_select
  on public.mo_chart_of_accounts
  for select
  to authenticated
  using (true);

drop policy if exists mo_journal_entries_select on public.mo_journal_entries;
create policy mo_journal_entries_select
  on public.mo_journal_entries
  for select
  to authenticated
  using (
    (
      project_id is not null
      and public.mo_user_can_access_project(project_id)
    )
    or (
      project_id is null
      and public.mo_user_can_standalone_mo_invoice()
    )
  );

drop policy if exists mo_journal_entries_insert on public.mo_journal_entries;
create policy mo_journal_entries_insert
  on public.mo_journal_entries
  for insert
  to authenticated
  with check (
    (
      project_id is not null
      and public.mo_user_can_edit_project_financials(project_id)
    )
    or (
      project_id is null
      and public.mo_user_can_standalone_mo_invoice()
    )
  );

drop policy if exists mo_journal_lines_select on public.mo_journal_lines;
create policy mo_journal_lines_select
  on public.mo_journal_lines
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.mo_journal_entries je
      where je.id = mo_journal_lines.journal_entry_id
        and (
          (
            je.project_id is not null
            and public.mo_user_can_access_project(je.project_id)
          )
          or (
            je.project_id is null
            and public.mo_user_can_standalone_mo_invoice()
          )
        )
    )
  );

drop policy if exists mo_journal_lines_insert on public.mo_journal_lines;
create policy mo_journal_lines_insert
  on public.mo_journal_lines
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.mo_journal_entries je
      where je.id = mo_journal_lines.journal_entry_id
        and (
          (
            je.project_id is not null
            and public.mo_user_can_edit_project_financials(je.project_id)
          )
          or (
            je.project_id is null
            and public.mo_user_can_standalone_mo_invoice()
          )
        )
    )
  );

drop policy if exists mo_receipts_select on public.mo_receipts;
create policy mo_receipts_select
  on public.mo_receipts
  for select
  to authenticated
  using (
    (
      project_id is not null
      and public.mo_user_can_access_project(project_id)
    )
    or (
      project_id is null
      and public.mo_user_can_standalone_mo_invoice()
    )
  );

drop policy if exists mo_receipts_insert on public.mo_receipts;
create policy mo_receipts_insert
  on public.mo_receipts
  for insert
  to authenticated
  with check (
    (
      project_id is not null
      and public.mo_user_can_edit_project_financials(project_id)
    )
    or (
      project_id is null
      and public.mo_user_can_standalone_mo_invoice()
    )
  );

drop policy if exists mo_receipts_update on public.mo_receipts;
create policy mo_receipts_update
  on public.mo_receipts
  for update
  to authenticated
  using (
    (
      project_id is not null
      and public.mo_user_can_edit_project_financials(project_id)
    )
    or (
      project_id is null
      and public.mo_user_can_standalone_mo_invoice()
    )
  )
  with check (
    (
      project_id is not null
      and public.mo_user_can_edit_project_financials(project_id)
    )
    or (
      project_id is null
      and public.mo_user_can_standalone_mo_invoice()
    )
  );

drop policy if exists mo_receipt_alloc_select on public.mo_receipt_allocations;
create policy mo_receipt_alloc_select
  on public.mo_receipt_allocations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.mo_invoices inv
      where inv.id = mo_receipt_allocations.invoice_id
        and (
          (
            inv.project_id is not null
            and public.mo_user_can_access_project(inv.project_id)
          )
          or (
            inv.project_id is null
            and public.mo_user_can_standalone_mo_invoice()
          )
        )
    )
  );

drop policy if exists mo_receipt_alloc_insert on public.mo_receipt_allocations;
create policy mo_receipt_alloc_insert
  on public.mo_receipt_allocations
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.mo_invoices inv
      where inv.id = mo_receipt_allocations.invoice_id
        and (
          (
            inv.project_id is not null
            and public.mo_user_can_edit_project_financials(inv.project_id)
          )
          or (
            inv.project_id is null
            and public.mo_user_can_standalone_mo_invoice()
          )
        )
    )
  );

grant select on public.mo_chart_of_accounts to authenticated;
grant select, insert on public.mo_journal_entries to authenticated;
grant select, insert on public.mo_journal_lines to authenticated;
grant select, insert, update on public.mo_receipts to authenticated;
grant select, insert on public.mo_receipt_allocations to authenticated;
grant all on public.mo_chart_of_accounts to service_role;
grant all on public.mo_journal_entries to service_role;
grant all on public.mo_journal_lines to service_role;
grant all on public.mo_receipts to service_role;
grant all on public.mo_receipt_allocations to service_role;
