-- Financial clearance on warehouse receipts, MASAV queue, idempotency, sync logs, delivery proof

do $$
begin
  if not exists (select 1 from pg_type where typname = 'financial_approval_status') then
    create type public.financial_approval_status as enum (
      'pending',
      'authorized',
      'rejected'
    )
  end if
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'system_sync_status') then
    create type public.system_sync_status as enum (
      'pending',
      'synced',
      'failed'
    )
  end if
end
$$;

alter table public.warehouse_receipts
  add column if not exists financial_approval_status public.financial_approval_status not null default 'pending',
  add column if not exists authorized_by uuid null,
  add column if not exists authorized_at timestamptz null,
  add column if not exists delivery_note_image_url text null,
  add column if not exists verification_notes text null,
  add column if not exists idempotency_key text null;

create unique index if not exists warehouse_receipts_idempotency_key_uidx
  on public.warehouse_receipts (idempotency_key)
  where idempotency_key is not null and length(trim(idempotency_key)) > 0;

comment on column public.warehouse_receipts.financial_approval_status is 'בקרת תשלומים — לפני הוספה לתור מס״ב';
comment on column public.warehouse_receipts.idempotency_key is 'מניעת כפילות קבלה (רשת)';

alter table public.supplier_parts
  add column if not exists material_risk text not null default 'standard'
    constraint supplier_parts_material_risk_chk check (material_risk in ('standard', 'high_value'));

comment on column public.supplier_parts.material_risk is 'ברזל/בטון וכו׳ — דורש צילום תעודת משלוח לפני קבלה';

alter table public.journal_entries
  add column if not exists idempotency_key text null;

create unique index if not exists journal_entries_idempotency_key_uidx
  on public.journal_entries (idempotency_key)
  where idempotency_key is not null and length(trim(idempotency_key)) > 0;

create table if not exists public.masav_queue_items (
  id uuid primary key default gen_random_uuid(),
  warehouse_receipt_id uuid not null unique references public.warehouse_receipts (id) on delete restrict,
  amount_ils numeric(18, 2) not null default 0,
  payee_label text not null default '',
  reference_label text not null default '',
  status text not null default 'draft' check (status in ('draft', 'ready', 'exported')),
  created_at timestamptz not null default now()
);

create index if not exists masav_queue_items_status_idx on public.masav_queue_items (status);

comment on table public.masav_queue_items is 'תשלומי רכש מאושרים — טיוטה לקובץ מס״ב';

create table if not exists public.system_sync_logs (
  id uuid primary key default gen_random_uuid(),
  source_module text not null,
  target_module text not null,
  payload_json jsonb not null default '{}'::jsonb,
  status public.system_sync_status not null default 'pending',
  error_message text null,
  retry_count int not null default 0,
  idempotency_key text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists system_sync_logs_idempotency_uidx
  on public.system_sync_logs (idempotency_key)
  where idempotency_key is not null and length(trim(idempotency_key)) > 0;

create index if not exists system_sync_logs_status_idx on public.system_sync_logs (status);

drop trigger if exists system_sync_logs_updated_at on public.system_sync_logs;
create trigger system_sync_logs_updated_at
  before update on public.system_sync_logs
  for each row
  execute function public.set_updated_at();

alter table public.masav_queue_items enable row level security;
alter table public.system_sync_logs enable row level security;

grant select, insert, update, delete on public.masav_queue_items to authenticated;
grant select, insert, update, delete on public.system_sync_logs to authenticated;
grant all on public.masav_queue_items to service_role;
grant all on public.system_sync_logs to service_role;

drop policy if exists masav_queue_items_all_auth on public.masav_queue_items;
create policy masav_queue_items_all_auth
  on public.masav_queue_items
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists system_sync_logs_all_auth on public.system_sync_logs;
create policy system_sync_logs_all_auth
  on public.system_sync_logs
  for all
  to authenticated
  using (true)
  with check (true);

insert into storage.buckets (id, name, public)
values ('delivery-notes', 'delivery-notes', false)
on conflict (id) do nothing;
