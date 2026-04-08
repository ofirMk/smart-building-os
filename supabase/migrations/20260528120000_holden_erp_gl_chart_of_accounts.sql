-- Holden ERP — כרטסת ראשית (COA) + פקודות יומן כפולות (GL landing zone)
-- Balancing: sum(debit) = sum(credit) enforced in application code (lib/holden-erp/gl-actions.ts).

-- ---------------------------------------------------------------------------
-- gl_accounts — תרשים חשבונות (קוד ניסוי, קבוצות מאזן, סיווג דוחות)
-- ---------------------------------------------------------------------------
create table if not exists public.gl_accounts (
  id uuid primary key default gen_random_uuid(),
  account_code varchar(32) not null,
  account_name_he varchar(256) not null,
  account_name_en varchar(256) not null default '',
  trial_balance_group varchar(64) not null default '',
  financial_statement_category varchar(128) not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gl_accounts_account_code_key unique (account_code),
  constraint gl_accounts_code_nonempty_chk check (length(trim(account_code)) > 0)
);

create index if not exists gl_accounts_trial_balance_group_idx
  on public.gl_accounts (trial_balance_group)
  where is_active = true;

create index if not exists gl_accounts_fs_category_idx
  on public.gl_accounts (financial_statement_category)
  where is_active = true;

comment on table public.gl_accounts is
  'Holden GL — כרטסת ראשית; קוד ייחודי, קבוצת מאזן ניסוי, סיווג דוח כספי';

comment on column public.gl_accounts.trial_balance_group is
  'למשל 1**, 40* — קיבוץ לדוח מאזן ניסוי';

comment on column public.gl_accounts.financial_statement_category is
  'למשל רכוש שוטף, הכנסות, הוצאות — סיווג דוחות';

drop trigger if exists gl_accounts_updated_at on public.gl_accounts;
create trigger gl_accounts_updated_at
  before update on public.gl_accounts
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- gl_journal_entries — כותרת פקודת יומן
-- ---------------------------------------------------------------------------
create table if not exists public.gl_journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default (timezone('utc', now()))::date,
  reference_document_type varchar(64) not null,
  reference_document_id uuid not null,
  description text,
  project_id uuid null references public.projects (id) on delete set null,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gl_journal_entries_ref_doc_chk check (length(trim(reference_document_type)) > 0)
);

create index if not exists gl_journal_entries_entry_date_idx
  on public.gl_journal_entries (entry_date desc);

create index if not exists gl_journal_entries_reference_idx
  on public.gl_journal_entries (reference_document_type, reference_document_id);

create index if not exists gl_journal_entries_project_id_idx
  on public.gl_journal_entries (project_id)
  where project_id is not null;

comment on table public.gl_journal_entries is
  'Holden GL — פקודת יומן; מקושרת למסמך מקור (חשבון חלקי, חשבונית, וכו׳)';

comment on column public.gl_journal_entries.reference_document_type is
  'סוג מסמך לוגי — למשל partial_account, invoice, receipt';

-- ---------------------------------------------------------------------------
-- gl_journal_lines — שורות חובה/זכות
-- ---------------------------------------------------------------------------
create table if not exists public.gl_journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.gl_journal_entries (id) on delete cascade,
  account_id uuid not null references public.gl_accounts (id) on delete restrict,
  debit_amount numeric(18, 2) not null default 0
    constraint gl_jl_debit_nonneg check (debit_amount >= 0),
  credit_amount numeric(18, 2) not null default 0
    constraint gl_jl_credit_nonneg check (credit_amount >= 0),
  line_memo text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint gl_jl_one_side_chk check (
    (debit_amount > 0 and credit_amount = 0)
    or (credit_amount > 0 and debit_amount = 0)
  )
);

create index if not exists gl_journal_lines_entry_id_idx
  on public.gl_journal_lines (journal_entry_id, sort_order);

create index if not exists gl_journal_lines_account_id_idx
  on public.gl_journal_lines (account_id);

comment on table public.gl_journal_lines is
  'שורות יומן — חובה או זכות לכל חשבון; איזון בכותרת נבדק באפליקציה';

drop trigger if exists gl_journal_entries_updated_at on public.gl_journal_entries;
create trigger gl_journal_entries_updated_at
  before update on public.gl_journal_entries
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.gl_accounts enable row level security;
alter table public.gl_journal_entries enable row level security;
alter table public.gl_journal_lines enable row level security;

drop policy if exists gl_accounts_select_authenticated on public.gl_accounts;
create policy gl_accounts_select_authenticated
  on public.gl_accounts
  for select
  to authenticated
  using (true);

drop policy if exists gl_accounts_write_finance on public.gl_accounts;
create policy gl_accounts_write_finance
  on public.gl_accounts
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (
          p.role = 'admin'::public.user_role
          or coalesce(p.marker_ofek_full_project_access, false) = true
        )
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (
          p.role = 'admin'::public.user_role
          or coalesce(p.marker_ofek_full_project_access, false) = true
        )
    )
  );

drop policy if exists gl_journal_entries_select_scope on public.gl_journal_entries;
create policy gl_journal_entries_select_scope
  on public.gl_journal_entries
  for select
  to authenticated
  using (
    (
      project_id is not null
      and public.mo_user_can_access_project(project_id)
    )
    or (
      project_id is null
      and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and (
            p.role = 'admin'::public.user_role
            or coalesce(p.marker_ofek_full_project_access, false) = true
          )
      )
    )
  );

drop policy if exists gl_journal_entries_insert_scope on public.gl_journal_entries;
create policy gl_journal_entries_insert_scope
  on public.gl_journal_entries
  for insert
  to authenticated
  with check (
    (
      project_id is not null
      and public.mo_user_can_edit_project_financials(project_id)
    )
    or (
      project_id is null
      and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and (
            p.role = 'admin'::public.user_role
            or coalesce(p.marker_ofek_full_project_access, false) = true
          )
      )
    )
  );

drop policy if exists gl_journal_entries_update_scope on public.gl_journal_entries;
create policy gl_journal_entries_update_scope
  on public.gl_journal_entries
  for update
  to authenticated
  using (
    (
      project_id is not null
      and public.mo_user_can_edit_project_financials(project_id)
    )
    or (
      project_id is null
      and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and (
            p.role = 'admin'::public.user_role
            or coalesce(p.marker_ofek_full_project_access, false) = true
          )
      )
    )
  )
  with check (
    (
      project_id is not null
      and public.mo_user_can_edit_project_financials(project_id)
    )
    or (
      project_id is null
      and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and (
            p.role = 'admin'::public.user_role
            or coalesce(p.marker_ofek_full_project_access, false) = true
          )
      )
    )
  );

drop policy if exists gl_journal_lines_select_scope on public.gl_journal_lines;
create policy gl_journal_lines_select_scope
  on public.gl_journal_lines
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.gl_journal_entries je
      where je.id = gl_journal_lines.journal_entry_id
        and (
          (
            je.project_id is not null
            and public.mo_user_can_access_project(je.project_id)
          )
          or (
            je.project_id is null
            and exists (
              select 1
              from public.profiles p
              where p.id = auth.uid()
                and (
                  p.role = 'admin'::public.user_role
                  or coalesce(p.marker_ofek_full_project_access, false) = true
                )
            )
          )
        )
    )
  );

drop policy if exists gl_journal_lines_insert_scope on public.gl_journal_lines;
create policy gl_journal_lines_insert_scope
  on public.gl_journal_lines
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.gl_journal_entries je
      where je.id = gl_journal_lines.journal_entry_id
        and (
          (
            je.project_id is not null
            and public.mo_user_can_edit_project_financials(je.project_id)
          )
          or (
            je.project_id is null
            and exists (
              select 1
              from public.profiles p
              where p.id = auth.uid()
                and (
                  p.role = 'admin'::public.user_role
                  or coalesce(p.marker_ofek_full_project_access, false) = true
                )
            )
          )
        )
    )
  );

drop policy if exists gl_journal_lines_update_scope on public.gl_journal_lines;
create policy gl_journal_lines_update_scope
  on public.gl_journal_lines
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.gl_journal_entries je
      where je.id = gl_journal_lines.journal_entry_id
        and (
          (
            je.project_id is not null
            and public.mo_user_can_edit_project_financials(je.project_id)
          )
          or (
            je.project_id is null
            and exists (
              select 1
              from public.profiles p
              where p.id = auth.uid()
                and (
                  p.role = 'admin'::public.user_role
                  or coalesce(p.marker_ofek_full_project_access, false) = true
                )
            )
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.gl_journal_entries je
      where je.id = gl_journal_lines.journal_entry_id
        and (
          (
            je.project_id is not null
            and public.mo_user_can_edit_project_financials(je.project_id)
          )
          or (
            je.project_id is null
            and exists (
              select 1
              from public.profiles p
              where p.id = auth.uid()
                and (
                  p.role = 'admin'::public.user_role
                  or coalesce(p.marker_ofek_full_project_access, false) = true
                )
            )
          )
        )
    )
  );

drop policy if exists gl_journal_lines_delete_scope on public.gl_journal_lines;
create policy gl_journal_lines_delete_scope
  on public.gl_journal_lines
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.gl_journal_entries je
      where je.id = gl_journal_lines.journal_entry_id
        and (
          (
            je.project_id is not null
            and public.mo_user_can_edit_project_financials(je.project_id)
          )
          or (
            je.project_id is null
            and exists (
              select 1
              from public.profiles p
              where p.id = auth.uid()
                and (
                  p.role = 'admin'::public.user_role
                  or coalesce(p.marker_ofek_full_project_access, false) = true
                )
            )
          )
        )
    )
  );

grant select, insert, update, delete on public.gl_accounts to authenticated;
grant select, insert, update, delete on public.gl_journal_entries to authenticated;
grant select, insert, update, delete on public.gl_journal_lines to authenticated;

grant all on public.gl_accounts to service_role;
grant all on public.gl_journal_entries to service_role;
grant all on public.gl_journal_lines to service_role;
