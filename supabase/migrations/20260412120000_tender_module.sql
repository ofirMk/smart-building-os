-- Tenders & estimations: projects, BoQ lines (versioned), vendor quotes vs. target.

-- ---------------------------------------------------------------------------
-- tender_projects: estimator container (risk / overhead % on direct cost)
-- ---------------------------------------------------------------------------
create table if not exists public.tender_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  internal_code text,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'closed')),
  risk_percent numeric(12, 6) not null default 0
    check (risk_percent >= 0 and risk_percent <= 1000),
  overhead_percent numeric(12, 6) not null default 0
    check (overhead_percent >= 0 and overhead_percent <= 1000),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tender_projects_status_idx on public.tender_projects (status);
create index if not exists tender_projects_created_at_idx on public.tender_projects (created_at desc);

comment on table public.tender_projects is 'Marker Ofek — מכרז / הערכה: תמחור, סיכון ועומסים.';
comment on column public.tender_projects.risk_percent is 'אחוז סיכון על עלות ישירה (לפני עומס כללי).';
comment on column public.tender_projects.overhead_percent is 'אחוז עומס כללי על עלות ישירה.';

-- ---------------------------------------------------------------------------
-- tender_boq_items: hierarchical BoQ with versioning (v1, v2, final)
-- ---------------------------------------------------------------------------
create table if not exists public.tender_boq_items (
  id uuid primary key default gen_random_uuid(),
  tender_project_id uuid not null references public.tender_projects (id) on delete cascade,
  parent_id uuid references public.tender_boq_items (id) on delete cascade,
  sort_order int not null default 0,
  wbs_code text,
  description text not null default '',
  unit text,
  quantity numeric(18, 6) not null default 0,
  unit_price numeric(18, 6) not null default 0,
  boq_version text not null default 'v1'
    check (boq_version in ('v1', 'v2', 'final')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Older DBs may already have `tender_boq_items` (e.g. `tender_id` → `public.tenders`) without
-- `tender_project_id` / versioning columns — `CREATE TABLE IF NOT EXISTS` skips, then indexes fail.
alter table public.tender_boq_items add column if not exists tender_project_id uuid;
alter table public.tender_boq_items add column if not exists parent_id uuid;
alter table public.tender_boq_items add column if not exists sort_order int not null default 0;
alter table public.tender_boq_items add column if not exists wbs_code text;
alter table public.tender_boq_items add column if not exists unit_price numeric(18, 6) not null default 0;
alter table public.tender_boq_items add column if not exists boq_version text not null default 'v1';
alter table public.tender_boq_items add column if not exists updated_at timestamptz not null default now();

create index if not exists tender_boq_items_project_idx
  on public.tender_boq_items (tender_project_id);
create index if not exists tender_boq_items_project_version_idx
  on public.tender_boq_items (tender_project_id, boq_version);
create index if not exists tender_boq_items_parent_idx
  on public.tender_boq_items (parent_id);

comment on table public.tender_boq_items is 'כתב כמויות — גרסאות V1/V2/Final וקישור ל-WBS.';
comment on column public.tender_boq_items.boq_version is 'גרסת כתב כמויות: v1 | v2 | final.';

-- ---------------------------------------------------------------------------
-- tender_vendor_quotes: supplier unit prices vs BoQ line (for comparison)
-- ---------------------------------------------------------------------------
create table if not exists public.tender_vendor_quotes (
  id uuid primary key default gen_random_uuid(),
  tender_project_id uuid not null references public.tender_projects (id) on delete cascade,
  tender_boq_item_id uuid references public.tender_boq_items (id) on delete set null,
  vendor_name text not null,
  quoted_unit_price numeric(18, 6) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.tender_vendor_quotes add column if not exists tender_project_id uuid;
alter table public.tender_vendor_quotes add column if not exists tender_boq_item_id uuid;

create index if not exists tender_vendor_quotes_project_idx
  on public.tender_vendor_quotes (tender_project_id);
create index if not exists tender_vendor_quotes_boq_line_idx
  on public.tender_vendor_quotes (tender_boq_item_id);

comment on table public.tender_vendor_quotes is 'הצעות ספקים — השוואה מול מחיר יעד (BoQ).';

-- ---------------------------------------------------------------------------
-- RLS: authenticated users (internal ERP)
-- ---------------------------------------------------------------------------
alter table public.tender_projects enable row level security;
alter table public.tender_boq_items enable row level security;
alter table public.tender_vendor_quotes enable row level security;

create policy "tender_projects_authenticated_all"
  on public.tender_projects for all
  to authenticated
  using (true) with check (true);

create policy "tender_boq_items_authenticated_all"
  on public.tender_boq_items for all
  to authenticated
  using (true) with check (true);

create policy "tender_vendor_quotes_authenticated_all"
  on public.tender_vendor_quotes for all
  to authenticated
  using (true) with check (true);
