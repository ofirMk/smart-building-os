-- מודול כספים: לקוחות חיוב (מאגר) + מטא־דאטה לחשבונית (תאריך יעד, צילום שורות, קישור ללקוח במאגר)
-- הערה: חשבוניות עצמן נשמרות ב־mo_invoices + mo_invoice_line_items (לא ב־public.invoices של דיירים).

-- ---------------------------------------------------------------------------
-- mo_finance_clients — לקוחות לחיוב והפקת מסמכים (הולדן / מרקר אופק)
-- ---------------------------------------------------------------------------
create table if not exists public.mo_finance_clients (
  id uuid primary key default gen_random_uuid(),
  company_profile_id uuid null references public.company_profile (id) on delete set null,
  name text not null,
  address text null,
  email text null,
  payment_terms text null,
  entity_id uuid null references public.entities (id) on delete set null,
  created_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  constraint mo_finance_clients_name_nonempty check (length(trim(name)) > 0)
);

comment on table public.mo_finance_clients is
  'לקוחות חיוב — פרטי דוא״ל, כתובת ותנאי תשלום; אופציונלי: קישור לישות מסוג לקוח ב־entities';

create unique index if not exists mo_finance_clients_entity_id_uidx
  on public.mo_finance_clients (entity_id)
  where entity_id is not null and not is_deleted;

create index if not exists mo_finance_clients_company_idx
  on public.mo_finance_clients (company_profile_id)
  where not is_deleted;

alter table public.mo_finance_clients enable row level security;

grant select, insert, update, delete on public.mo_finance_clients to authenticated;
grant all on public.mo_finance_clients to service_role;

drop policy if exists mo_finance_clients_all_authenticated on public.mo_finance_clients;
create policy mo_finance_clients_all_authenticated
  on public.mo_finance_clients
  for all
  to authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- mo_invoices — שדות נוספים (תואם Diamond / חשבונאות)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.mo_invoices') is not null then
    alter table public.mo_invoices
      add column if not exists due_date date null;
    alter table public.mo_invoices
      add column if not exists items_snapshot jsonb null;
    alter table public.mo_invoices
      add column if not exists finance_client_id uuid null references public.mo_finance_clients (id) on delete set null;
  end if;
end
$$;

comment on column public.mo_invoices.due_date is 'תאריך יעד לתשלום (פירעון)';
comment on column public.mo_invoices.items_snapshot is 'צילום JSON של שורות לדוחות / AI — מקור האמת נשאר ב־mo_invoice_line_items';
comment on column public.mo_invoices.finance_client_id is 'קישור אופציונלי לרשומת לקוח במאגר mo_finance_clients';

create index if not exists mo_invoices_finance_client_id_idx
  on public.mo_invoices (finance_client_id)
  where finance_client_id is not null;

-- ---------------------------------------------------------------------------
-- אטימות — כלול עמודות חדשות
-- ---------------------------------------------------------------------------
create or replace function public.mo_invoices_enforce_immutability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if not coalesce(old.is_finalized, false) and coalesce(new.is_finalized, false) then
      if new.subtotal is distinct from old.subtotal
        or new.vat_amount is distinct from old.vat_amount
        or new.grand_total is distinct from old.grand_total
        or new.entity_id is distinct from old.entity_id
        or new.project_id is distinct from old.project_id
        or new.contract_id is distinct from old.contract_id
        or new.issue_date is distinct from old.issue_date
        or new.document_type is distinct from old.document_type
        or new.invoice_number is distinct from old.invoice_number
        or new.status is distinct from old.status
        or new.linked_partial_account_id is distinct from old.linked_partial_account_id
        or new.due_date is distinct from old.due_date
        or new.items_snapshot is distinct from old.items_snapshot
        or new.finance_client_id is distinct from old.finance_client_id
      then
        raise exception 'mo_invoices_final_lock'
          using errcode = 'P0001',
          message = 'אי אפשר לשנות נתונים כספיים בעת אימות החשבונית';
      end if;
      return new;
    end if;

    if coalesce(old.is_finalized, false) then
      if
        new.id is not distinct from old.id
        and new.invoice_number is not distinct from old.invoice_number
        and new.project_id is not distinct from old.project_id
        and new.entity_id is not distinct from old.entity_id
        and new.contract_id is not distinct from old.contract_id
        and new.linked_partial_account_id is not distinct from old.linked_partial_account_id
        and new.issue_date is not distinct from old.issue_date
        and new.document_type is not distinct from old.document_type
        and new.subtotal is not distinct from old.subtotal
        and new.vat_amount is not distinct from old.vat_amount
        and new.grand_total is not distinct from old.grand_total
        and new.status is not distinct from old.status
        and new.digital_signature_sha256 is not distinct from old.digital_signature_sha256
        and new.is_finalized is not distinct from old.is_finalized
        and new.created_at is not distinct from old.created_at
        and new.is_printed_original is distinct from old.is_printed_original
        and new.due_date is not distinct from old.due_date
        and new.items_snapshot is not distinct from old.items_snapshot
        and new.finance_client_id is not distinct from old.finance_client_id
      then
        return new;
      end if;
      raise exception 'mo_invoices_locked'
        using errcode = 'P0001',
        message = 'חשבונית מאושרת אינה ניתנת לשינוי; השתמשו בחשבונית זיכוי.';
    end if;
  end if;
  return new;
end;
$$;
