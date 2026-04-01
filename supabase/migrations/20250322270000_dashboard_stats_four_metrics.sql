-- dashboard_stats: ארבעת מדדי הדשבורד הראשיים (JSON)
-- total_tenants, open_tickets, pending_maintenance, unpaid_invoices

create or replace function public.dashboard_stats ()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'total_tenants',
    (
      select count(*)::int
      from public.profiles
      where role = 'tenant'
        and coalesce(is_active, true) = true
    ),
    'open_tickets',
    (
      select count(*)::int
      from public.tickets
      where status = 'open'
    ),
    'pending_maintenance',
    (
      select count(*)::int
      from public.preventive_tasks
      where
        status = 'pending'
        and next_due_date <= (current_date + interval '30 days')
    ),
    'unpaid_invoices',
    coalesce(
      (
        select sum(amount)
        from public.invoices
        where status = 'pending'
      ),
      0
    )::numeric
  );
$$;
