-- =============================================================================
-- Marker Ofek — שלמות נתונים, מחיקה רכה, רצפים ומספור אוטומטי
-- Apply after: marker_ofek_contracts_schema.sql, marker_ofek_procurement.sql,
--              marker_ofek_partial_accounts_schema.sql (ואופציונלי: logistics_aging)
-- =============================================================================
--
-- הערות ארכיטקטורה:
-- - מחיקה רכה: is_deleted + deleted_at — רשומות נשארות לצורכי ביקורת.
-- - רצפים ב-PostgreSQL: מספור כרונולוגי ומונוטוני; אין "אפס פערים" אמיתי אם מתבצע rollback
--   או כשל אחרי nextval — לכן לא מובטח "gapless" ב-100%, אלא מספור מסודר וייחודי.
-- - ייחוד קודים (מספר הזמנה, קוד פרויקט וכו׳) לרשומות פעילות בלבד (אינדקס חלקי).
-- - שנת 2 ספרות: to_char(now(), 'YY') לפי שעון שרת ה-DB (ב-Supabase בדרך כלל UTC).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) מחיקה רכה — עמודות
-- ---------------------------------------------------------------------------

alter table public.projects
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz;

alter table public.entities
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz;

alter table public.contracts
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz;

alter table public.purchase_orders
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz;

alter table public.partial_accounts
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz;

comment on column public.projects.is_deleted is 'מחיקה רכה — מוסתר מממשקים כשהערך true';
comment on column public.entities.is_deleted is 'מחיקה רכה — מוסתר מממשקים כשהערך true';
comment on column public.contracts.is_deleted is 'מחיקה רכה — מוסתר מממשקים כשהערך true';
comment on column public.purchase_orders.is_deleted is 'מחיקה רכה — מוסתר מממשקים כשהערך true';
comment on column public.partial_accounts.is_deleted is 'מחיקה רכה — מוסתר מממשקים כשהערך true';

-- אינדקסים לשאילתות "רק פעילים"
create index if not exists projects_active_idx
  on public.projects (is_deleted)
  where not is_deleted;
create index if not exists entities_active_idx
  on public.entities (is_deleted)
  where not is_deleted;
create index if not exists contracts_active_idx
  on public.contracts (is_deleted)
  where not is_deleted;
create index if not exists purchase_orders_active_idx
  on public.purchase_orders (is_deleted)
  where not is_deleted;
create index if not exists partial_accounts_active_idx
  on public.partial_accounts (is_deleted)
  where not is_deleted;

-- ---------------------------------------------------------------------------
-- 2) ייחוד חלקי (רק רשומות שלא נמחקו ברכות)
-- ---------------------------------------------------------------------------

alter table public.projects
  drop constraint if exists projects_internal_project_code_key;

create unique index if not exists projects_internal_project_code_active_uidx
  on public.projects (internal_project_code)
  where not is_deleted;

alter table public.purchase_orders
  drop constraint if exists purchase_orders_po_number_key;

create unique index if not exists purchase_orders_po_number_active_uidx
  on public.purchase_orders (po_number)
  where not is_deleted;

-- ---------------------------------------------------------------------------
-- 3) קוד ישות מרצף (ספק / קבלן משנה) — עמודה + ייחוד חלקי
-- mo_entity_type: subcontractor במסד = "קבלן" לצורכי contractor_seq
-- ---------------------------------------------------------------------------

alter table public.entities
  add column if not exists mo_entity_code text;

create unique index if not exists entities_mo_entity_code_active_uidx
  on public.entities (mo_entity_code)
  where mo_entity_code is not null and not is_deleted;

comment on column public.entities.mo_entity_code is
  'מספר סידורי ארגוני: מ-supplier_seq או contractor_seq לפי סוג הישות';

-- ---------------------------------------------------------------------------
-- 4) רצפים (Sequences)
-- ---------------------------------------------------------------------------

create sequence if not exists public.supplier_seq
  as bigint
  increment by 1
  minvalue 1
  start with 700001
  cache 1;

create sequence if not exists public.contractor_seq
  as bigint
  increment by 1
  minvalue 1
  start with 800001
  cache 1;

create sequence if not exists public.project_seq
  as bigint
  increment by 1
  minvalue 1
  start with 1
  cache 1;

create sequence if not exists public.po_seq
  as bigint
  increment by 1
  minvalue 1
  start with 1
  cache 1;

create sequence if not exists public.invoice_seq
  as bigint
  increment by 1
  minvalue 1
  start with 10001
  cache 1;

comment on sequence public.supplier_seq is 'מספור ישויות מסוג supplier (מתחיל ב-700001)';
comment on sequence public.contractor_seq is 'מספור ישויות מסוג subcontractor (מתחיל ב-800001)';
comment on sequence public.project_seq is 'מספור קוד פרויקט פנימי PR-YY-NNNN';
comment on sequence public.po_seq is 'מספור הזמנות רכש PO-YY-NNNN';
comment on sequence public.invoice_seq is 'מספור מספר שלם ל-mo_invoices (הרץ marker_ofek_finance.sql)';

grant usage, select on sequence public.supplier_seq to authenticated;
grant usage, select on sequence public.contractor_seq to authenticated;
grant usage, select on sequence public.project_seq to authenticated;
grant usage, select on sequence public.po_seq to authenticated;
grant usage, select on sequence public.invoice_seq to authenticated;

grant usage, select on sequence public.supplier_seq to service_role;
grant usage, select on sequence public.contractor_seq to service_role;
grant usage, select on sequence public.project_seq to service_role;
grant usage, select on sequence public.po_seq to service_role;
grant usage, select on sequence public.invoice_seq to service_role;

-- ---------------------------------------------------------------------------
-- 5) פונקציות וטריגרים — מספור לפני INSERT
-- ---------------------------------------------------------------------------

-- פרויקטים: PR-YY-NNNN (שנת 2 ספרות, מספר 4 ספרות מהרצף)
create or replace function public.assign_project_internal_code()
returns trigger
language plpgsql
as $$
begin
  if new.internal_project_code is null or btrim(new.internal_project_code) = '' then
    new.internal_project_code :=
      'PR-'
      || to_char(now(), 'YY')
      || '-'
      || lpad(nextval('public.project_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists projects_assign_internal_code on public.projects;

create trigger projects_assign_internal_code
  before insert on public.projects
  for each row
  execute function public.assign_project_internal_code();

-- הזמנות רכש: PO-YY-NNNN (מספר 4 ספרות מ-po_seq)
create or replace function public.assign_purchase_order_number()
returns trigger
language plpgsql
as $$
begin
  if new.po_number is null or btrim(new.po_number) = '' then
    new.po_number :=
      'PO-'
      || to_char(now(), 'YY')
      || '-'
      || lpad(nextval('public.po_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists purchase_orders_assign_number on public.purchase_orders;

create trigger purchase_orders_assign_number
  before insert on public.purchase_orders
  for each row
  execute function public.assign_purchase_order_number();

-- ישויות: supplier → supplier_seq; subcontractor (קבלן/קבלן משנה בדומיין) → contractor_seq
-- הערה: ב-mo_entity_type אין ערך 'contractor' — רק 'subcontractor'.
create or replace function public.assign_entity_sequence_code()
returns trigger
language plpgsql
as $$
begin
  if new.mo_entity_code is null or btrim(new.mo_entity_code) = '' then
    if new.type = 'supplier'::public.mo_entity_type then
      new.mo_entity_code := lpad(nextval('public.supplier_seq')::text, 6, '0');
    elsif new.type = 'subcontractor'::public.mo_entity_type then
      new.mo_entity_code := lpad(nextval('public.contractor_seq')::text, 6, '0');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists entities_assign_sequence_code on public.entities;

create trigger entities_assign_sequence_code
  before insert on public.entities
  for each row
  execute function public.assign_entity_sequence_code();

-- מספור חשבוניות מס: marker_ofek_finance.sql (mo_invoices + invoice_seq)

-- ---------------------------------------------------------------------------
-- 6) מספור חשבון חלקי — התעלמות מרשומות שנמחקו ברכות
-- ---------------------------------------------------------------------------

create or replace function public.assign_partial_account_number()
returns trigger
language plpgsql
as $$
begin
  if new.account_number is null then
    select coalesce(max(p.account_number), 0) + 1
    into new.account_number
    from public.partial_accounts p
    where p.contract_id = new.contract_id
      and not p.is_deleted;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) הערה: רצף mo_po_number_seq (ישן) נשאר ב-DB לצורכי היסטוריה; מספור PO חדש משתמש ב-po_seq בלבד.
-- ---------------------------------------------------------------------------
