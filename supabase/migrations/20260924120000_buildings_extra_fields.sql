-- =============================================================================
-- Add building-profile columns needed by the New Building Wizard UI.
-- All three are optional integers — no data-loss risk.
-- =============================================================================

alter table public.buildings
  add column if not exists total_floors   integer null;

alter table public.buildings
  add column if not exists planned_units  integer null;

alter table public.buildings
  add column if not exists year_built     integer null;

comment on column public.buildings.total_floors  is 'מספר קומות בבניין (כולל קומת קרקע)';
comment on column public.buildings.planned_units is 'מספר יחידות דיור מתוכנן';
comment on column public.buildings.year_built    is 'שנת בניה / קבלת טופס 4';

notify pgrst, 'reload schema';
