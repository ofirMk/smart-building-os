-- White-label: לוגו ארגון (URL ציבורי או חתום)

alter table public.company_profile
  add column if not exists brand_logo_url text;

comment on column public.company_profile.brand_logo_url is
  'כתובת לוגו לארגון — תצוגה בסרגל ובמרכז הפיקוד';
