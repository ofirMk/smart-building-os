-- Seed REOPENED in erp_po_status_types
-- Migration 20260829130000 already added the ENUM value; this seeds the metadata row.

insert into public.erp_po_status_types
  (status, name_he, name_en, color,
   allow_changes, allows_gr, is_approved, is_closed,
   is_status_on_close, is_status_on_reopen, sends_email,
   is_post_approval, is_status_on_approval_cancel, is_cancelled,
   exclude_from_reports, matrix_skip, external_update, included_in_tasks,
   is_legacy_alias)
values
  ('REOPENED', 'פתיחה חוזרת', 'Reopened', '#f59e0b',
    true,  true,  false, false,   false, true, false,  false, false, false,  false, false, false, true,  false)
on conflict (status) do update set
  name_he                       = excluded.name_he,
  name_en                       = excluded.name_en,
  color                         = excluded.color,
  allow_changes                 = excluded.allow_changes,
  allows_gr                     = excluded.allows_gr,
  is_approved                   = excluded.is_approved,
  is_closed                     = excluded.is_closed,
  is_status_on_close            = excluded.is_status_on_close,
  is_status_on_reopen           = excluded.is_status_on_reopen,
  sends_email                   = excluded.sends_email,
  is_post_approval              = excluded.is_post_approval,
  is_status_on_approval_cancel  = excluded.is_status_on_approval_cancel,
  is_cancelled                  = excluded.is_cancelled,
  exclude_from_reports          = excluded.exclude_from_reports,
  matrix_skip                   = excluded.matrix_skip,
  external_update               = excluded.external_update,
  included_in_tasks             = excluded.included_in_tasks,
  is_legacy_alias               = excluded.is_legacy_alias,
  updated_at                    = now();
