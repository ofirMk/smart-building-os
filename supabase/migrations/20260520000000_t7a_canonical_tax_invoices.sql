-- Sprint T7a — Canonical Tax-Invoice Entity (MedaTech §8 + ITA compliance + Priority parity)
--
-- Ingested reference specs (see docs/ingested-specs/tax-invoice-reverse-engineering.md):
--   • Sales Invoice Script-H.pdf — Priority's workflow
--   • SI186000071 (Lightman, single-line)      — base visual reference
--   • Z3417500450 (ארכה, 43-line consolidated) — consolidation + §A 17 extra fields
--
-- Scope of T7a:
--   1. Master-data extensions on erp_companies (vendor branding + legal IDs + signatories)
--   2. New master table erp_md_customers (multi-tenant)
--   3. Tax-invoice enums (status, kind)
--   4. erp_tax_invoices  (header)
--   5. erp_tax_invoice_lines
--   6. erp_tax_invoice_print_events (original/copy audit trail)
--   7. Close + no-alter-after-close triggers
--   8. RLS + grants
--
-- T7b (next): visual-parity PDF renderer.   T7c: allocation threshold gate.   T7d: PCN874/INI856/BKMVDATA.
-- Everything in this migration is additive + guarded with `if not exists` / `do $$` blocks.

-- ============================================================================
-- 1. erp_companies — extend with branding + legal + signatories
-- ============================================================================

alter table public.erp_companies
  add column if not exists legal_id text null,                       -- ח.פ. / ע.מ. (issuer)
  add column if not exists vat_registration_number text null,        -- מס׳ עוסק מורשה
  add column if not exists withholding_id text null,                 -- מס׳ ניכוי במקור
  add column if not exists mod_supplier_number text null,            -- ספק משהב"ט (Z3417500450)
  add column if not exists address text null,
  add column if not exists phone text null,
  add column if not exists fax text null,
  add column if not exists email text null,
  add column if not exists website text null,
  add column if not exists bank_name text null,
  add column if not exists bank_branch text null,
  add column if not exists bank_account_number text null,
  add column if not exists brand_logo_url text null,
  add column if not exists payee_check_name text null,               -- "שיקים נא לרשום ל..."
  add column if not exists retention_of_title_clause text null,      -- "הסחורה תישאר בבעלות..."
  add column if not exists active_manager_name text null,            -- מנהל פעיל
  add column if not exists legal_disclaimer text not null default 'ט.ל.ח',
  add column if not exists signatories jsonb not null default '[]'::jsonb;
                                   -- signatories shape (Z3417500450 sign-off):
                                   -- [{ "name": "...", "email": "...", "phone": "...",
                                   --    "role": "...", "branch": "..." }]

comment on column public.erp_companies.legal_id
  is 'ח.פ. / ע.מ. של המנפיק — מופיע כ"מס׳ עוסק" בראש החשבונית.';
comment on column public.erp_companies.vat_registration_number
  is 'מספר עוסק מורשה שמדווח לרשות המסים.';
comment on column public.erp_companies.withholding_id
  is 'מספר תיק ניכויים במקור — מודפס כאשר קיים.';
comment on column public.erp_companies.mod_supplier_number
  is 'ספק משרד הביטחון — מספר ספק פנימי של משהב״ט (מופיע בכותרת חשבונית מרכזת ל-MoD).';
comment on column public.erp_companies.payee_check_name
  is 'שם הנהנה לשיקים (יכול להיות שונה מ-name_he במקרה של group).';
comment on column public.erp_companies.retention_of_title_clause
  is 'סעיף שימור בעלות — "הסחורה תישאר בבעלות החברה עד לתשלום המלא".';
comment on column public.erp_companies.active_manager_name
  is 'מנהל פעיל — שדה accountability שמודפס בתחתית.';
comment on column public.erp_companies.legal_disclaimer
  is 'ברירת מחדל: ט.ל.ח (טעות לעולם חוזרת).';
comment on column public.erp_companies.signatories
  is 'רשימת חותמים מוסמכים — [{name,email,phone,role,branch}]. מופיעים בבלוק "בברכה".';

-- ============================================================================
-- 2. erp_md_customers — multi-tenant customer master
-- ============================================================================

create table if not exists public.erp_md_customers (
  id                      uuid primary key default gen_random_uuid(),
  company_id              text not null references public.erp_companies (id) on delete restrict,
  customer_number         varchar(64) not null,                       -- external / vendor-side code
  customer_internal_code  text null,                                  -- "מס. לקוח: 5300371" (Z3417500450)
  name                    text not null,
  legal_id                text null,                                  -- ח.פ. / ע.מ. / ת.ז.
  vat_id                  text null,                                  -- מס׳ עוסק לקוח
  file_number             text null,                                  -- "תיק: 557877842" (Lightman)
  address                 text null,
  phone                   text null,
  fax                     text null,
  email                   text null,
  attention_to            text null,                                  -- "לידי:" default contact
  payment_terms_days      int not null default 30
    constraint erp_md_customers_payment_terms_nonneg check (payment_terms_days >= 0),
  default_vat_rate_pct    numeric(5,2) not null default 17.00
    constraint erp_md_customers_vat_rate_chk check (default_vat_rate_pct >= 0 and default_vat_rate_pct <= 100),
  notes                   text null,
  is_archived             boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint erp_md_customers_uq unique (company_id, customer_number),
  constraint erp_md_customers_name_nonempty check (length(trim(name)) > 0)
);

create unique index if not exists erp_md_customers_company_id_uq
  on public.erp_md_customers (company_id, id);

create index if not exists erp_md_customers_name_idx
  on public.erp_md_customers (company_id, name) where not is_archived;

drop trigger if exists erp_md_customers_updated_at on public.erp_md_customers;
create trigger erp_md_customers_updated_at
  before update on public.erp_md_customers
  for each row execute function public.set_updated_at();

comment on table public.erp_md_customers is
  'מאגר לקוחות מולטי-טננטי. מקור אמת יחיד לבלוק "לכבוד" בחשבוניות מס.';

-- ============================================================================
-- 3. Enums — tax invoice kind + status
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'erp_tax_invoice_kind') then
    create type public.erp_tax_invoice_kind as enum (
      'TAX_INVOICE',           -- חשבונית מס (default)
      'TAX_RECEIPT',           -- חשבונית מס/קבלה
      'CREDIT_MEMO',           -- חשבונית זיכוי
      'CONSOLIDATED_INVOICE'   -- חשבונית מס מרכזת (Z3417500450 reference)
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'erp_tax_invoice_status') then
    create type public.erp_tax_invoice_status as enum (
      'DRAFT',
      'PENDING_ALLOCATION',    -- waiting for חשבוניות ישראל allocation number
      'CLOSED',                -- final number assigned, JE posted, material fields locked
      'PRINTED_ORIGINAL',      -- first print → "מקור"
      'REPRINTED',             -- subsequent prints → "העתק"
      'CANCELLED'              -- replaced by credit memo
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'erp_tax_invoice_source_doc_kind') then
    create type public.erp_tax_invoice_source_doc_kind as enum (
      'DELIVERY_NOTE',         -- K-prefix in Z3417500450
      'SALES_ORDER',           -- Z-prefix
      'PROGRESS_BILL',         -- erp_client_progress_bills
      'CONTRACT_LINE',         -- erp_client_contract_lines
      'MANUAL'
    );
  end if;
end $$;

-- ============================================================================
-- 4. erp_tax_invoices — header
-- ============================================================================

create table if not exists public.erp_tax_invoices (
  id                          uuid primary key default gen_random_uuid(),
  company_id                  text not null references public.erp_companies (id) on delete restrict,

  -- Numbering (two-stage: draft_number immediate, invoice_number on CLOSE)
  draft_number                uuid not null default gen_random_uuid() unique,
  invoice_number              bigint null,
  invoice_number_label        text null,                                -- "SI186000071" / "Z3417500450"
  series_code                 varchar(8) not null default 'TI',         -- TI / MR / CR / RC / DN

  kind                        public.erp_tax_invoice_kind not null default 'TAX_INVOICE',
  status                      public.erp_tax_invoice_status not null default 'DRAFT',

  -- Customer linkage + denormalized identity at issue (printed even if master row changes later)
  customer_id                 uuid not null references public.erp_md_customers (id) on delete restrict,
  customer_name_at_issue      text not null,
  customer_legal_id_at_issue  text null,
  customer_vat_id_at_issue    text null,
  customer_file_number_at_issue text null,
  customer_internal_code_at_issue text null,
  customer_address_at_issue   text null,
  attention_to                text null,                                -- "לידי"
  ship_to_address             text null,                                -- "כתובת למשלוח"

  -- Upstream references (any or none; determines how lines were populated)
  client_contract_id          uuid null references public.erp_client_contracts (id) on delete set null,
  client_progress_bill_id     uuid null references public.erp_client_progress_bills (id) on delete set null,
  sales_order_id              uuid null,
  cancels_invoice_id          uuid null references public.erp_tax_invoices (id) on delete restrict,
                              -- set when kind='CREDIT_MEMO' to link the cancelled invoice

  -- Dates (§A.6: three distinct timestamps)
  issue_date                  date not null default current_date,
  issue_time                  time not null default current_time,
  value_date                  date null,                                -- "תאריך" #2 in sample
  due_date                    date null,
  print_date                  date null,                                -- set on first print
  print_time                  time null,

  -- Agent (§A.10) — denormalized name snapshot so the print is stable
  agent_id                    uuid null,
  agent_name_at_issue         text null,

  -- Amounts
  currency                    varchar(3) not null default 'ILS',
  vat_rate_pct                numeric(5,2) not null default 17.00,
  subtotal_amount             numeric(18,2) not null default 0,         -- sum of line_total_excl BEFORE global discount
  global_discount_pct         numeric(5,2) not null default 0
    constraint erp_tax_invoices_global_discount_pct_chk
      check (global_discount_pct >= 0 and global_discount_pct <= 100),
  global_discount_amount      numeric(18,2) not null default 0,
  subtotal_after_discount     numeric(18,2) not null default 0,
  vat_amount                  numeric(18,2) not null default 0,
  grand_total                 numeric(18,2) not null default 0,
  paid_amount                 numeric(18,2) not null default 0
    constraint erp_tax_invoices_paid_nonneg check (paid_amount >= 0),
  payment_status              text not null default 'UNPAID'
    constraint erp_tax_invoices_payment_status_chk
      check (payment_status in ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'VOID')),

  -- Israel Tax Authority (חשבוניות ישראל)
  allocation_number           text null,
  allocation_requested_at     timestamptz null,
  allocation_received_at      timestamptz null,
  tax_authority_ref           text null,
  digital_signature_sha256    text null,

  -- Print audit (counters mirror erp_tax_invoice_print_events aggregates)
  print_count                 int not null default 0
    constraint erp_tax_invoices_print_count_nonneg check (print_count >= 0),
  printed_at_first            timestamptz null,

  -- Lifecycle timestamps
  closed_at                   timestamptz null,
  cancelled_at                timestamptz null,
  notes                       text null,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  created_by                  uuid null,

  constraint erp_tax_invoices_invoice_number_uq
    unique (company_id, series_code, invoice_number),
  constraint erp_tax_invoices_invoice_number_label_uq
    unique (company_id, invoice_number_label),
  constraint erp_tax_invoices_grand_total_nonneg
    check (kind = 'CREDIT_MEMO' or grand_total >= 0),
  -- series code is 2-8 uppercase letters (matches TI, MR, CR, RC, DN, SI, Z, etc.)
  constraint erp_tax_invoices_series_code_chk
    check (series_code ~ '^[A-Z]{1,8}$'),
  -- value_date >= issue_date when set
  constraint erp_tax_invoices_value_date_chk
    check (value_date is null or value_date >= issue_date)
);

create unique index if not exists erp_tax_invoices_company_id_uq
  on public.erp_tax_invoices (company_id, id);

create index if not exists erp_tax_invoices_company_customer_idx
  on public.erp_tax_invoices (company_id, customer_id, issue_date desc);

create index if not exists erp_tax_invoices_company_status_idx
  on public.erp_tax_invoices (company_id, status);

create index if not exists erp_tax_invoices_company_progress_bill_idx
  on public.erp_tax_invoices (company_id, client_progress_bill_id) where client_progress_bill_id is not null;

drop trigger if exists erp_tax_invoices_updated_at on public.erp_tax_invoices;
create trigger erp_tax_invoices_updated_at
  before update on public.erp_tax_invoices
  for each row execute function public.set_updated_at();

comment on table public.erp_tax_invoices is
  'חשבוניות מס — טבלה קנונית של Sprint T7. מחליפה את finance_invoices עבור ERP המלא.';

-- ============================================================================
-- 5. erp_tax_invoice_lines
-- ============================================================================

create table if not exists public.erp_tax_invoice_lines (
  id                  uuid primary key default gen_random_uuid(),
  company_id          text not null references public.erp_companies (id) on delete restrict,
  invoice_id          uuid not null references public.erp_tax_invoices (id) on delete cascade,
  line_no             int not null,

  -- Source-document reference (§A.2 — the spine of consolidation)
  source_doc_number   text null,                                        -- "K5117600303" / "Z5117500313"
  source_doc_kind     public.erp_tax_invoice_source_doc_kind null,
  source_so_line_id   uuid null,
  source_pb_line_id   uuid null,
  source_contract_line_id uuid null,

  -- Item
  item_id             uuid null references public.erp_md_items (id) on delete set null,
  item_code           text null,
  barcode             text null,
  description         text not null,
  unit_label          text null,                                        -- "יח'" / "מטר" / "שח"

  -- Quantities — signed to support returns (§A.14)
  quantity            numeric(18,3) not null default 1,
  remaining_qty       numeric(18,3) not null default 0,

  -- Prices
  unit_price_excl     numeric(18,4) not null default 0,
  unit_price_incl     numeric(18,4) not null default 0,
  discount_pct        numeric(5,2) not null default 0
    constraint erp_tax_invoice_lines_discount_pct_chk
      check (discount_pct >= 0 and discount_pct <= 100),
  discount_amount     numeric(18,2) not null default 0,
  line_total_excl     numeric(18,2) not null default 0,
  line_total_incl     numeric(18,2) not null default 0,

  warehouse_code      text null,
  price_source        text null
    constraint erp_tax_invoice_lines_price_source_chk
      check (price_source is null or price_source in ('SO', 'PB', 'PRICE_LIST', 'MANUAL', 'LAST_SALE')),
  free_text           text null,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint erp_tax_invoice_lines_line_no_uq unique (invoice_id, line_no),
  constraint erp_tax_invoice_lines_line_no_positive check (line_no > 0),
  constraint erp_tax_invoice_lines_company_invoice_fk
    foreign key (company_id, invoice_id)
    references public.erp_tax_invoices (company_id, id) on delete cascade
);

create unique index if not exists erp_tax_invoice_lines_company_id_uq
  on public.erp_tax_invoice_lines (company_id, id);

create index if not exists erp_tax_invoice_lines_company_invoice_idx
  on public.erp_tax_invoice_lines (company_id, invoice_id, line_no);

create index if not exists erp_tax_invoice_lines_source_doc_idx
  on public.erp_tax_invoice_lines (company_id, source_doc_number) where source_doc_number is not null;

drop trigger if exists erp_tax_invoice_lines_updated_at on public.erp_tax_invoice_lines;
create trigger erp_tax_invoice_lines_updated_at
  before update on public.erp_tax_invoice_lines
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 6. erp_tax_invoice_print_events — original/copy audit trail (R9)
-- ============================================================================

create table if not exists public.erp_tax_invoice_print_events (
  id              uuid primary key default gen_random_uuid(),
  company_id      text not null references public.erp_companies (id) on delete restrict,
  invoice_id      uuid not null references public.erp_tax_invoices (id) on delete cascade,
  printed_at      timestamptz not null default now(),
  copy_label      text not null
    constraint erp_tax_invoice_print_events_copy_label_chk
      check (copy_label in ('מקור', 'העתק')),
  rendered_by     uuid null,
  user_agent      text null,
  sha256_snapshot text null,
  constraint erp_tax_invoice_print_events_company_invoice_fk
    foreign key (company_id, invoice_id)
    references public.erp_tax_invoices (company_id, id) on delete cascade
);

create index if not exists erp_tax_invoice_print_events_invoice_idx
  on public.erp_tax_invoice_print_events (invoice_id, printed_at desc);

-- ============================================================================
-- 7. Sequences for invoice numbering
-- ============================================================================
-- Strategy: one sequence per (company × series × year). Created lazily in the
-- assign function below. Pattern: erp_tax_invoice_seq__<company>__<series>__<yy>
-- The label is formatted as: {series}{yy}{NNNNNNN} — e.g. TI260000001.

-- ============================================================================
-- 8. Functions — serial assignment + close + post JE
-- ============================================================================

-- Normalizes a company id for use in a Postgres sequence name.
create or replace function public.erp_tax_invoice_sanitize_seq_part(p text)
returns text language sql immutable as $$
  select lower(regexp_replace(p, '[^a-zA-Z0-9]', '_', 'g'))
$$;

-- Allocate the next numeric serial for (company, series, year) — lazily creates
-- the sequence if it does not exist. Returns the bigint serial.
create or replace function public.erp_tax_invoice_next_serial(
  p_company_id text,
  p_series_code text,
  p_year int
) returns bigint
language plpgsql security definer as $$
declare
  v_seq_name text;
  v_serial bigint;
begin
  v_seq_name := format(
    'erp_tax_invoice_seq__%s__%s__%s',
    public.erp_tax_invoice_sanitize_seq_part(p_company_id),
    public.erp_tax_invoice_sanitize_seq_part(p_series_code),
    p_year
  );

  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'S' and n.nspname = 'public' and c.relname = v_seq_name
  ) then
    execute format(
      'create sequence public.%I start with 1 minvalue 1 increment by 1',
      v_seq_name
    );
    execute format('grant usage, select on sequence public.%I to authenticated', v_seq_name);
    execute format('grant all on sequence public.%I to service_role', v_seq_name);
  end if;

  execute format('select nextval(''public.%I'')', v_seq_name) into v_serial;
  return v_serial;
end;
$$;

-- Close an invoice: assigns invoice_number + label, seals material fields,
-- snapshots agent name, creates JE if GL parameters are configured.
-- Idempotent: returns the already-assigned label if invoice is already CLOSED.
create or replace function public.erp_close_tax_invoice(
  p_invoice_id uuid
) returns text
language plpgsql security definer as $$
declare
  v_inv public.erp_tax_invoices;
  v_year int;
  v_serial bigint;
  v_label text;
  v_account_ar uuid;
  v_account_revenue uuid;
  v_account_vat uuid;
  v_je_id uuid;
  v_idempotency text;
begin
  select * into v_inv from public.erp_tax_invoices where id = p_invoice_id for update;

  if not found then
    raise exception 'Invoice % not found', p_invoice_id;
  end if;

  if v_inv.status in ('CLOSED', 'PRINTED_ORIGINAL', 'REPRINTED', 'CANCELLED') then
    return v_inv.invoice_number_label;
  end if;

  if v_inv.status = 'PENDING_ALLOCATION' then
    -- Allocation must be resolved by server action before close.
    raise exception 'Invoice % still PENDING_ALLOCATION — obtain allocation_number first', p_invoice_id;
  end if;

  v_year := extract(year from v_inv.issue_date)::int;
  v_serial := public.erp_tax_invoice_next_serial(v_inv.company_id, v_inv.series_code, v_year);
  v_label := format(
    '%s%s%s',
    v_inv.series_code,
    to_char(v_inv.issue_date, 'YY'),
    lpad(v_serial::text, 7, '0')
  );

  update public.erp_tax_invoices
  set
    invoice_number       = v_serial,
    invoice_number_label = v_label,
    status               = 'CLOSED',
    closed_at            = now()
  where id = p_invoice_id;

  -- Create GL JE (DR Customer AR / CR Revenue + CR VAT-Output) when accounts
  -- are configured. Silently skip if GL is not wired (offline-first posture).
  if v_inv.kind in ('TAX_INVOICE', 'TAX_RECEIPT', 'CONSOLIDATED_INVOICE') and v_inv.grand_total > 0 then
    select public.erp_resolve_gl_account_by_param(v_inv.company_id, 'GL_ACCOUNT_AR') into v_account_ar;
    select public.erp_resolve_gl_account_by_param(v_inv.company_id, 'GL_ACCOUNT_REVENUE_DEFAULT') into v_account_revenue;
    select public.erp_resolve_gl_account_by_param(v_inv.company_id, 'GL_ACCOUNT_VAT_OUTPUT') into v_account_vat;

    if v_account_ar is not null and v_account_revenue is not null then
      -- Deterministic entry_number → natural idempotency via the UNIQUE
      -- constraint on (company_id, entry_number) in erp_gl_journal_entries.
      v_idempotency := 'TI-' || p_invoice_id::text;

      begin
        select id into v_je_id from public.erp_gl_journal_entries
          where company_id = v_inv.company_id and entry_number = v_idempotency
          limit 1;

        if v_je_id is null then
          insert into public.erp_gl_journal_entries (
            company_id, entry_number, entry_date, description,
            source_type, source_ref, status, posted_at
          ) values (
            v_inv.company_id, v_idempotency, v_inv.issue_date,
            format('חשבונית מס %s → %s', v_label, v_inv.customer_name_at_issue),
            'invoice', p_invoice_id::text, 'POSTED', now()
          ) returning id into v_je_id;

          -- DR: Customer AR
          insert into public.erp_gl_journal_lines (
            company_id, journal_entry_id, line_no, account_id,
            debit_amount, credit_amount, description
          ) values (
            v_inv.company_id, v_je_id, 1, v_account_ar,
            v_inv.grand_total, 0, format('AR — %s', v_label)
          );

          -- CR: Revenue (subtotal_after_discount or subtotal_amount when no discount)
          insert into public.erp_gl_journal_lines (
            company_id, journal_entry_id, line_no, account_id,
            debit_amount, credit_amount, description
          ) values (
            v_inv.company_id, v_je_id, 2, v_account_revenue,
            0,
            case when v_inv.subtotal_after_discount > 0
                 then v_inv.subtotal_after_discount
                 else v_inv.subtotal_amount end,
            format('הכנסות — %s', v_label)
          );

          -- CR: VAT Output (if account configured and VAT > 0)
          if v_account_vat is not null and v_inv.vat_amount > 0 then
            insert into public.erp_gl_journal_lines (
              company_id, journal_entry_id, line_no, account_id,
              debit_amount, credit_amount, description
            ) values (
              v_inv.company_id, v_je_id, 3, v_account_vat,
              0, v_inv.vat_amount, format('מע״מ עסקאות — %s', v_label)
            );
          end if;
        end if;
      exception
        when undefined_table then
          -- GL tables not present in this deployment — skip silently.
          null;
        when others then
          -- GL posting is best-effort; never block the close on a GL failure.
          null;
      end;
    end if;
  end if;

  return v_label;
end;
$$;

grant execute on function public.erp_close_tax_invoice(uuid) to authenticated;
grant execute on function public.erp_tax_invoice_next_serial(text, text, int) to authenticated;

-- ============================================================================
-- 9. No-alter-after-close triggers (R13 — compliance)
-- ============================================================================

create or replace function public.erp_tax_invoices_guard_after_close()
returns trigger language plpgsql as $$
declare
  v_whitelist text[] := array[
    'print_count', 'printed_at_first', 'print_date', 'print_time',
    'status', 'notes', 'payment_status', 'paid_amount',
    'updated_at', 'tax_authority_ref', 'allocation_number'
  ];
  v_col text;
begin
  -- Only guard transitions from a closed state. DRAFT / PENDING_ALLOCATION are free.
  if old.status not in ('CLOSED', 'PRINTED_ORIGINAL', 'REPRINTED') then
    return new;
  end if;

  -- Reject changes to material columns.
  if new.invoice_number is distinct from old.invoice_number
    or new.invoice_number_label is distinct from old.invoice_number_label
    or new.series_code is distinct from old.series_code
    or new.customer_id is distinct from old.customer_id
    or new.customer_name_at_issue is distinct from old.customer_name_at_issue
    or new.issue_date is distinct from old.issue_date
    or new.vat_rate_pct is distinct from old.vat_rate_pct
    or new.subtotal_amount is distinct from old.subtotal_amount
    or new.global_discount_pct is distinct from old.global_discount_pct
    or new.global_discount_amount is distinct from old.global_discount_amount
    or new.subtotal_after_discount is distinct from old.subtotal_after_discount
    or new.vat_amount is distinct from old.vat_amount
    or new.grand_total is distinct from old.grand_total
    or new.kind is distinct from old.kind
    or new.closed_at is distinct from old.closed_at
  then
    raise exception 'Invoice % is closed — material fields are immutable (R13). Cancel via credit memo.',
      old.invoice_number_label;
  end if;

  return new;
end;
$$;

drop trigger if exists erp_tax_invoices_guard_after_close_trg on public.erp_tax_invoices;
create trigger erp_tax_invoices_guard_after_close_trg
  before update on public.erp_tax_invoices
  for each row execute function public.erp_tax_invoices_guard_after_close();

create or replace function public.erp_tax_invoice_lines_guard_after_close()
returns trigger language plpgsql as $$
declare
  v_parent_status public.erp_tax_invoice_status;
begin
  select status into v_parent_status from public.erp_tax_invoices
    where id = coalesce(new.invoice_id, old.invoice_id);

  if v_parent_status in ('CLOSED', 'PRINTED_ORIGINAL', 'REPRINTED') then
    raise exception 'Parent invoice is closed — lines are immutable (R13).';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists erp_tax_invoice_lines_guard_ins_upd on public.erp_tax_invoice_lines;
create trigger erp_tax_invoice_lines_guard_ins_upd
  before insert or update or delete on public.erp_tax_invoice_lines
  for each row execute function public.erp_tax_invoice_lines_guard_after_close();

-- ============================================================================
-- 10. RLS + grants
-- ============================================================================

alter table public.erp_md_customers enable row level security;
alter table public.erp_tax_invoices enable row level security;
alter table public.erp_tax_invoice_lines enable row level security;
alter table public.erp_tax_invoice_print_events enable row level security;

drop policy if exists erp_md_customers_all_authenticated on public.erp_md_customers;
create policy erp_md_customers_all_authenticated
  on public.erp_md_customers for all to authenticated
  using (true) with check (true);

drop policy if exists erp_tax_invoices_all_authenticated on public.erp_tax_invoices;
create policy erp_tax_invoices_all_authenticated
  on public.erp_tax_invoices for all to authenticated
  using (true) with check (true);

drop policy if exists erp_tax_invoice_lines_all_authenticated on public.erp_tax_invoice_lines;
create policy erp_tax_invoice_lines_all_authenticated
  on public.erp_tax_invoice_lines for all to authenticated
  using (true) with check (true);

-- Print events are append-only for authenticated; no UPDATE/DELETE.
drop policy if exists erp_tax_invoice_print_events_select_authenticated on public.erp_tax_invoice_print_events;
create policy erp_tax_invoice_print_events_select_authenticated
  on public.erp_tax_invoice_print_events for select to authenticated using (true);

drop policy if exists erp_tax_invoice_print_events_insert_authenticated on public.erp_tax_invoice_print_events;
create policy erp_tax_invoice_print_events_insert_authenticated
  on public.erp_tax_invoice_print_events for insert to authenticated with check (true);

grant select, insert, update, delete on public.erp_md_customers to authenticated;
grant select, insert, update, delete on public.erp_tax_invoices to authenticated;
grant select, insert, update, delete on public.erp_tax_invoice_lines to authenticated;
grant select, insert on public.erp_tax_invoice_print_events to authenticated;

grant all on public.erp_md_customers to service_role;
grant all on public.erp_tax_invoices to service_role;
grant all on public.erp_tax_invoice_lines to service_role;
grant all on public.erp_tax_invoice_print_events to service_role;
