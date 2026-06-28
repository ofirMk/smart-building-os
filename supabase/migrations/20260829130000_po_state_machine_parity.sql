-- Priority Parity: PO State Machine — REOPENED status + next_signer + Approver Lists
--
-- 1. הרחבת ENUM erp_purchase_order_status ב-REOPENED (פתיחה חוזרת)
-- 2. erp_purchase_orders — next_signer_name (החותם הבא)
-- 3. erp_md_po_approver_lists — "רשימות מאשרי הזמנות רכש" master data
-- 4. erp_md_po_approver_list_items — שורות מאשרים

-- ─── 1. ENUM ─────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_type where typname = 'erp_purchase_order_status') then
    alter type public.erp_purchase_order_status add value if not exists 'REOPENED';
  end if;
end$$;

-- ─── 2. erp_purchase_orders — next_signer_name ───────────────────────────────
alter table public.erp_purchase_orders
  add column if not exists next_signer_name varchar(100) null;

comment on column public.erp_purchase_orders.next_signer_name is
  'החותם הבא — שם המאשר הבא בתהליך האישור (Priority: NEXTSIGNER). מתעדכן אוטומטית ע"י מנגנון האישורים.';

-- ─── 3. erp_md_po_approver_lists — "רשימות מאשרי הזמנות רכש" ─────────────────
create table if not exists public.erp_md_po_approver_lists (
  id            uuid        not null default gen_random_uuid() primary key,
  company_id    text        not null,
  code          varchar(20) not null,
  description   text        not null,
  currency_code varchar(3)  null default 'ILS',
  -- הזל מסכום — סכום מינימלי להפעלת הרשימה (Priority: MINSUM)
  min_amount    numeric(18, 2) null,
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint erp_md_po_approver_lists_uq unique (company_id, code)
);

create index if not exists erp_md_po_approver_lists_company_idx
  on public.erp_md_po_approver_lists (company_id);

alter table public.erp_md_po_approver_lists enable row level security;

drop policy if exists tenant_isolation_po_approver_lists on public.erp_md_po_approver_lists;
create policy tenant_isolation_po_approver_lists on public.erp_md_po_approver_lists
  using (company_id = current_setting('app.active_company_id', true));

comment on table  public.erp_md_po_approver_lists             is 'רשימות מאשרי הזמנות רכש (Priority: PORDAPPLIST)';
comment on column public.erp_md_po_approver_lists.code        is 'קוד הרשימה (Priority: CODE)';
comment on column public.erp_md_po_approver_lists.description is 'תאור הרשימה (Priority: DES)';
comment on column public.erp_md_po_approver_lists.min_amount  is 'הזל מסכום — סכום מינימלי להפעלת הרשימה (Priority: MINSUM)';

-- ─── 4. erp_md_po_approver_list_items — מאשרים בתוך הרשימה ──────────────────
create table if not exists public.erp_md_po_approver_list_items (
  id                  uuid        not null default gen_random_uuid() primary key,
  company_id          text        not null,
  list_id             uuid        not null references public.erp_md_po_approver_lists(id) on delete cascade,
  -- *שם מאשר (Priority: APPROVERNAME)
  approver_name       varchar(100) not null,
  -- מאשר חלופי (Priority: ALTAPPROVERNAME)
  alt_approver_name   varchar(100) null,
  -- סכום מקסימלי לאישור (Priority: MAXSUM / הזל מסכום per approver)
  approval_amount     numeric(18, 2) null,
  currency_code       varchar(3)   null,
  sort_order          smallint     not null default 0,
  created_at          timestamptz  not null default now(),
  updated_at          timestamptz  not null default now()
);

create index if not exists erp_md_po_approver_list_items_list_idx
  on public.erp_md_po_approver_list_items (list_id, sort_order);

alter table public.erp_md_po_approver_list_items enable row level security;

drop policy if exists tenant_isolation_po_approver_list_items on public.erp_md_po_approver_list_items;
create policy tenant_isolation_po_approver_list_items on public.erp_md_po_approver_list_items
  using (company_id = current_setting('app.active_company_id', true));

comment on table  public.erp_md_po_approver_list_items                   is 'מאשרי הזמנות רכש — שורות רשימת מאשרים (Priority: PORDAPPROVERS)';
comment on column public.erp_md_po_approver_list_items.approver_name     is 'שם מאשר (Priority: APPROVERNAME)';
comment on column public.erp_md_po_approver_list_items.alt_approver_name is 'מאשר חלופי (Priority: ALTAPPROVERNAME)';
comment on column public.erp_md_po_approver_list_items.approval_amount   is 'הזל מסכום לאישור — סכום מקסימלי שמאשר זה מאשר';

-- ─── 5. erp_po_status_types — seed REOPENED ──────────────────────────────────
insert into public.erp_po_status_types
  (status, name_he, name_en, color,
   allow_changes, allows_gr, is_approved, is_closed,
   is_status_on_close, is_status_on_reopen, sends_email,
   is_post_approval, is_status_on_approval_cancel, is_cancelled,
   exclude_from_reports, matrix_skip, external_update, included_in_tasks,
   is_legacy_alias)
values
  -- REOPENED (פתיחה חוזרת) — Priority: is_status_on_reopen=true, allow_changes=true
  ('REOPENED', 'פתיחה חוזרת', 'Reopened', '#f59e0b',
    true,  true,  false, false,   false, true, false,  false, false, false,  false, false, false, true,  false)
on conflict (status) do update set
  name_he                       = excluded.name_he,
  name_en                       = excluded.name_en,
  color                         = excluded.color,
  allow_changes                 = excluded.allow_changes,
  allows_gr                     = excluded.allows_gr,
  is_approved                   = excluded.is_approved,
  is_closed                     = excluded.is_closed,
  is_status_on_close            = excluded.is_status_on_close,
  is_status_on_reopen           = excluded.is_status_on_reopen,
  sends_email                   = excluded.sends_email,
  is_post_approval              = excluded.is_post_approval,
  is_status_on_approval_cancel  = excluded.is_status_on_approval_cancel,
  is_cancelled                  = excluded.is_cancelled,
  exclude_from_reports          = excluded.exclude_from_reports,
  matrix_skip                   = excluded.matrix_skip,
  external_update               = excluded.external_update,
  included_in_tasks             = excluded.included_in_tasks,
  is_legacy_alias               = excluded.is_legacy_alias,
  updated_at                    = now();
