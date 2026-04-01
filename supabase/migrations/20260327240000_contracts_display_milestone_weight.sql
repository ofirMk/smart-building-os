-- תצוגת חוזה בסלקט + משקל אבן דרך (אחוז מסכום החוזה)
alter table public.contracts
  add column if not exists contract_number text,
  add column if not exists name text;

comment on column public.contracts.contract_number is 'מספר/קוד חוזה לתצוגה (למשל 08.01)';
comment on column public.contracts.name is 'שם תצוגה לחוזה (למשל עבודות חשמל)';

alter table public.contract_milestones
  add column if not exists weight_percentage numeric(12, 6);

comment on column public.contract_milestones.weight_percentage is 'אחוז מסכום כולל של אבני הדרך (לפי amount)';
