-- ERP backbone: legal_id על entities, קישור מכרז→פרויקט, אכיפת project + ח.פ בהזמנת רכש

-- ---------------------------------------------------------------------------
-- entities.legal_id — ח.פ / ע.מ (מקור אמת; תיקון שגיאות PostgREST / ספקים)
-- ---------------------------------------------------------------------------
alter table public.entities
  add column if not exists legal_id text null;

comment on column public.entities.legal_id is
  'מספר חברה / עוסק מורשה — חובה לספק לפני יצירת הזמנת רכש (אכיפה בטריגר + אפליקציה)';

create index if not exists entities_legal_id_idx
  on public.entities (legal_id)
  where legal_id is not null and trim(legal_id) <> '';

-- ---------------------------------------------------------------------------
-- tenders.project_id — קישור מכרז לפרויקט (לזרימת PO עם FK פרויקט)
-- ---------------------------------------------------------------------------
alter table public.tenders
  add column if not exists project_id uuid null references public.projects (id) on delete set null;

create index if not exists tenders_project_id_idx
  on public.tenders (project_id)
  where project_id is not null;

comment on column public.tenders.project_id is
  'פרויקט מקושר — מאפשר אכיפת project_id בהזמנת רכש ממכרז';

-- ---------------------------------------------------------------------------
-- purchase_orders: INSERT חייב project_id + ספק עם legal_id
-- ---------------------------------------------------------------------------
create or replace function public.purchase_orders_require_project_supplier_legal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lid text;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;
  if new.is_deleted = true then
    return new;
  end if;
  if new.project_id is null then
    raise exception 'purchase_orders: נדרש פרויקט (project_id)';
  end if;
  select nullif(trim(coalesce(e.legal_id, '')), '') into lid
  from public.entities e
  where e.id = new.supplier_id
    and e.type = 'supplier'
    and coalesce(e.is_deleted, false) = false;
  if lid is null then
    raise exception 'purchase_orders: לספק חייב ח.פ/ע.מ (legal_id) מאומת';
  end if;
  return new;
end;
$$;

drop trigger if exists purchase_orders_require_project_supplier_legal_trg on public.purchase_orders;
create trigger purchase_orders_require_project_supplier_legal_trg
  before insert on public.purchase_orders
  for each row
  execute function public.purchase_orders_require_project_supplier_legal();

comment on function public.purchase_orders_require_project_supplier_legal() is
  'אכיפת עסקית: הזמנת רכש חייבת project_id וספק עם legal_id';
