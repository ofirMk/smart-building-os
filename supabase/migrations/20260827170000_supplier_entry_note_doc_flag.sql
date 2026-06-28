-- Priority Parity #6: מסמכים לספק + הודעת כניסה
-- צילום #6: "סימת" flag על מסמכים + "הודעה בהקלדת ספק" על כרטיס הספק

-- 1. סימת (marked/flagged) על מסמכי ספק
alter table public.erp_supplier_attachments
  add column if not exists is_flagged boolean not null default false;

comment on column public.erp_supplier_attachments.is_flagged is
  'סימת — מסמך מסומן/מודגש לתשומת לב';

-- 2. הודעה בהקלדת ספק — מוצגת כ-alert בפתיחת כרטיס הספק
alter table public.erp_md_suppliers
  add column if not exists entry_note text null;

comment on column public.erp_md_suppliers.entry_note is
  'הודעה בהקלדת ספק — תוצג למשתמש בפתיחת כרטיס הספק (Priority: "הודעה בהקלדת ספק")';

-- אינדקס partial לשאילתות "ספקים עם הודעת כניסה"
create index if not exists erp_md_suppliers_entry_note_idx
  on public.erp_md_suppliers(id)
  where entry_note is not null and length(trim(entry_note)) > 0;
