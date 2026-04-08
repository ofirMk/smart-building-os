-- קישור חשבונית מודול כספים ↔ פקודת יומן (אוטו-יומן לאחר הקצאה)

alter table public.finance_invoices
  add column if not exists journal_entry_id uuid null
  references public.mo_journal_entries (id) on delete set null;

create index if not exists finance_invoices_journal_entry_id_idx
  on public.finance_invoices (journal_entry_id)
  where journal_entry_id is not null;

comment on column public.finance_invoices.journal_entry_id is
  'פקודת יומן כפולה שנוצרה אוטומטית בעת אישור חשבונית (מודול כספים).';
