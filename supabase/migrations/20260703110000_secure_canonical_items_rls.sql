-- Batch 1 (Items domain): strict tenant isolation for canonical master-data items.
-- Scope limited to:
--   - public.erp_md_items
--   - public.erp_md_product_families
-- plus secure membership primitive used by API and RLS.

create table if not exists public.erp_user_company_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id text not null references public.erp_companies (id) on delete cascade,
  role text not null default 'member',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, company_id)
);

create index if not exists erp_user_company_memberships_company_idx
  on public.erp_user_company_memberships (company_id, user_id);
create index if not exists erp_user_company_memberships_user_idx
  on public.erp_user_company_memberships (user_id, company_id);

drop trigger if exists erp_user_company_memberships_updated_at on public.erp_user_company_memberships;
create trigger erp_user_company_memberships_updated_at
  before update on public.erp_user_company_memberships
  for each row
  execute function public.set_updated_at();

alter table public.erp_user_company_memberships enable row level security;

drop policy if exists erp_user_company_memberships_self_select on public.erp_user_company_memberships;
create policy erp_user_company_memberships_self_select
  on public.erp_user_company_memberships
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists erp_user_company_memberships_service_role_all on public.erp_user_company_memberships;
create policy erp_user_company_memberships_service_role_all
  on public.erp_user_company_memberships
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.user_has_company_access(target_company_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  uid uuid;
begin
  if auth.role() = 'service_role' then
    return true;
  end if;

  uid := auth.uid();
  if uid is null then
    return false;
  end if;

  return exists (
    select 1
    from public.erp_user_company_memberships m
    where m.user_id = uid
      and m.company_id = target_company_id
      and m.is_active = true
  );
end;
$$;

revoke all on function public.user_has_company_access(text) from public;
grant execute on function public.user_has_company_access(text) to authenticated, service_role;

-- Replace permissive policies (using/with check true) with strict company checks.
drop policy if exists erp_md_items_all_authenticated on public.erp_md_items;
drop policy if exists erp_md_items_tenant_isolation on public.erp_md_items;
create policy erp_md_items_tenant_isolation
  on public.erp_md_items
  for all
  to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_md_product_families_all_authenticated on public.erp_md_product_families;
drop policy if exists erp_md_product_families_tenant_isolation on public.erp_md_product_families;
create policy erp_md_product_families_tenant_isolation
  on public.erp_md_product_families
  for all
  to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));
