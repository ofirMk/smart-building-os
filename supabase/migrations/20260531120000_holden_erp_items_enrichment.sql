-- Holden ERP — MDM: הרחבת master פריטים (Priority / מילון נתונים)

alter table public.erp_items
  add column if not exists status_he varchar(64),
  add column if not exists part_type varchar(1),
  add column if not exists is_inventory_managed boolean,
  add column if not exists abc_classification varchar(1),
  add column if not exists primary_supplier_sku varchar(128),
  add column if not exists standard_cost_ils numeric(18, 4),
  add column if not exists lead_time_days integer,
  add column if not exists default_warehouse varchar(64);

comment on column public.erp_items.status_he is 'סטטוס תצוגה (למשל פעיל)';
comment on column public.erp_items.part_type is 'P רכש, R חומר גלם, O ייצור/הרכבה';
comment on column public.erp_items.is_inventory_managed is 'ניהול מלאי — ממופה מ-Y/N בייבוא';
comment on column public.erp_items.abc_classification is 'סיווג ABC';
comment on column public.erp_items.primary_supplier_sku is 'מק״ט אצל ספק ברירת מחדל';
comment on column public.erp_items.standard_cost_ils is 'עלות תקן בשקלים';
comment on column public.erp_items.lead_time_days is 'זמן אספקה רכש (ימים)';
comment on column public.erp_items.default_warehouse is 'מחסן ברירת מחדל';

create index if not exists erp_items_part_type_idx on public.erp_items (part_type)
  where part_type is not null;
create index if not exists erp_items_abc_idx on public.erp_items (abc_classification)
  where abc_classification is not null;
