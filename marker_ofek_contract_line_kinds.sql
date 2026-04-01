-- =============================================================================
-- Marker Ofek — סיווג שורות חוזה: מקורי / עבודות נוספות / שינויי דיירים
-- Apply after: marker_ofek_smart_billing.sql (is_change_order on contract_line_items)
-- =============================================================================

alter table public.contract_line_items
  add column if not exists line_kind text not null default 'original';

alter table public.contract_line_items
  add column if not exists apartment_number text;

alter table public.contract_line_items
  add column if not exists tenant_change_status text;

comment on column public.contract_line_items.line_kind is
  'original = סעיפי חוזה חתומים; extra_work = עבודות נוספות/חריגים; tenant_change = שדרוגי דיירים';
comment on column public.contract_line_items.apartment_number is
  'מספר דירה — רלוונטי ל-line_kind = tenant_change';
comment on column public.contract_line_items.tenant_change_status is
  'pending | approved — רלוונטי ל-line_kind = tenant_change';

-- סנכרון עם דגל קיים
update public.contract_line_items
set line_kind = 'extra_work'
where coalesce(is_change_order, false) = true
  and coalesce(line_kind, 'original') = 'original';

update public.contract_line_items
set line_kind = 'original'
where coalesce(is_change_order, false) = false
  and line_kind = 'original';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contract_line_items_line_kind_check'
  ) then
    alter table public.contract_line_items
      add constraint contract_line_items_line_kind_check
      check (
        line_kind in ('original', 'extra_work', 'tenant_change')
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contract_line_items_tenant_status_check'
  ) then
    alter table public.contract_line_items
      add constraint contract_line_items_tenant_status_check
      check (
        tenant_change_status is null
        or tenant_change_status in ('pending', 'approved')
      );
  end if;
end
$$;
