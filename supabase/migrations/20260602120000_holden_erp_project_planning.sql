-- Holden ERP — תכנון פרויקט: WBS / אבני דרך + תקציב BoQ מקושר ל-erp_items

-- ---------------------------------------------------------------------------
-- erp_project_wbs — אבני דרך / שלבי ביצוע (מילSTONE מתכנון Priority)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_project_wbs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  milestone_name varchar(512) not null,
  planned_amount numeric(18, 4) not null default 0
    constraint erp_wbs_planned_nonneg check (planned_amount >= 0),
  progress_pct numeric(6, 2) not null default 0
    constraint erp_wbs_progress_range check (progress_pct >= 0 and progress_pct <= 100),
  target_date date null,
  status varchar(128) not null default '',
  manager_name varchar(256) not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_wbs_milestone_nonempty_chk check (char_length(trim(milestone_name)) > 0)
);

create index if not exists erp_project_wbs_project_id_idx on public.erp_project_wbs (project_id);

create unique index if not exists erp_project_wbs_project_milestone_uq
  on public.erp_project_wbs (project_id, milestone_name);

drop trigger if exists erp_project_wbs_updated_at on public.erp_project_wbs;
create trigger erp_project_wbs_updated_at
  before update on public.erp_project_wbs
  for each row
  execute function public.set_updated_at();

comment on table public.erp_project_wbs is 'אבני דרך ושלבי ביצוע לפי פרויקט (PPM / Priority)';

-- ---------------------------------------------------------------------------
-- erp_project_boq — תקציב פרויקט / תכנון כמויות מול מק״ט קטלוג (erp_items)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_project_boq (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  item_sku varchar(64) not null references public.erp_items (sku) on delete restrict,
  planned_quantity numeric(18, 4) not null default 0
    constraint erp_boq_qty_nonneg check (planned_quantity >= 0),
  uom varchar(64) not null default '',
  estimated_unit_cost numeric(18, 4) not null default 0
    constraint erp_boq_unit_cost_nonneg check (estimated_unit_cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists erp_project_boq_project_id_idx on public.erp_project_boq (project_id);
create index if not exists erp_project_boq_item_sku_idx on public.erp_project_boq (item_sku);

create unique index if not exists erp_project_boq_project_sku_uq
  on public.erp_project_boq (project_id, item_sku);

drop trigger if exists erp_project_boq_updated_at on public.erp_project_boq;
create trigger erp_project_boq_updated_at
  before update on public.erp_project_boq
  for each row
  execute function public.set_updated_at();

comment on table public.erp_project_boq is 'BoQ תכנוני Holden — כמויות ועלות יחידה מול erp_items (נפרד מ-project_boq הישן)';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.erp_project_wbs enable row level security;
alter table public.erp_project_boq enable row level security;

drop policy if exists erp_project_wbs_select_authenticated on public.erp_project_wbs;
create policy erp_project_wbs_select_authenticated on public.erp_project_wbs for select to authenticated using (true);

drop policy if exists erp_project_wbs_write_finance on public.erp_project_wbs;
create policy erp_project_wbs_write_finance on public.erp_project_wbs for all to authenticated using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'admin'::public.user_role or coalesce(p.marker_ofek_full_project_access, false) = true)
  )
) with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'admin'::public.user_role or coalesce(p.marker_ofek_full_project_access, false) = true)
  )
);

drop policy if exists erp_project_boq_select_authenticated on public.erp_project_boq;
create policy erp_project_boq_select_authenticated on public.erp_project_boq for select to authenticated using (true);

drop policy if exists erp_project_boq_write_finance on public.erp_project_boq;
create policy erp_project_boq_write_finance on public.erp_project_boq for all to authenticated using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'admin'::public.user_role or coalesce(p.marker_ofek_full_project_access, false) = true)
  )
) with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'admin'::public.user_role or coalesce(p.marker_ofek_full_project_access, false) = true)
  )
);

grant select on public.erp_project_wbs, public.erp_project_boq to authenticated;
grant select, insert, update, delete on public.erp_project_wbs, public.erp_project_boq to authenticated;
grant all on public.erp_project_wbs, public.erp_project_boq to service_role;
