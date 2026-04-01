-- מודל תמחיר: כתב כמויות / פאושלי + אחוז בדיקות + קוד סעיף באבני דרך
alter table public.contracts
  add column if not exists pricing_model text not null default 'boq';

alter table public.contracts
  drop constraint if exists contracts_pricing_model_chk;

alter table public.contracts
  add constraint contracts_pricing_model_chk
  check (pricing_model in ('boq', 'paushal'));

comment on column public.contracts.pricing_model is 'boq = כתב כמויות, paushal = פאושלי (אבני דרך לפי משקל)';

alter table public.contracts
  add column if not exists testing_pct numeric(8, 4) not null default 0;

comment on column public.contracts.testing_pct is 'אחוז בדיקות (מסחרי)';

alter table public.contract_milestones
  add column if not exists section_code text;

comment on column public.contract_milestones.section_code is 'קוד סעיף (תצוגה) בחוזה פאושלי';
