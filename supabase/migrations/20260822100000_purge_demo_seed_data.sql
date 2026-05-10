-- ============================================================================
-- Sprint 0 / Day 2 — Demo seed cleanup (opt-in)
-- ----------------------------------------------------------------------------
-- מטרה: למחוק את כל נתוני הדמו שהוזנו בשלבים 1-3 של מצגת המשקיעים
--   (חוזה קבלן משנה / חשבון חלקי / הזמנת רכש דמו) לפני העלאה לפרודקשן
--   ללקוח משלם (לייטמן / מרקר אופק).
--
-- אבטחה / Idempotency:
--   • המחיקה מותנית ב-GUC `app.purge_demo_data = 'on'` — לא רצה אוטומטית
--     בכל `supabase db push`. אופרטור חייב להריץ ידנית פעם אחת:
--
--       psql $SUPABASE_DB_URL -c "set app.purge_demo_data = 'on';" \
--                              -f supabase/migrations/20260822100000_purge_demo_seed_data.sql
--
--     או דרך Supabase SQL Editor:
--       set local app.purge_demo_data = 'on';
--       <paste the body of this migration>
--
--   • המחיקה ידועה אך לא הרסנית: היא נוגעת רק ב-UUIDs קשיחים שתועדו
--     ב-`types/erp.ts` (DEMO_SUBCONTRACTOR_CONTRACT_ID,
--     DEMO_SUBCONTRACTOR_BILL_ID, DEMO_PURCHASE_ORDER_ID) ובפרויקט הדמו
--     "גיאה גן יבנה" (project_number = 'GN-YAVNE-001').
--
--   • שימו לב: הפרויקט עצמו (`erp_proj_projects` row) **לא** נמחק כברירת
--     מחדל — רק הילדים שלו (חוזה/חשבון/PO/budget lines). כך שאם לייטמן
--     רוצים להמשיך עם פרויקט הדמו כפרויקט-הדגמה פנימי, אפשר.
--
--   • בנוסף, ה-bridge row ב-public.projects (אם הוזן עתידית ע"י Phase 4)
--     נמחק גם — אך אם המיגרציה הזו לא רצה ב-Phase 4 בסופו של דבר, היא
--     no-op.
-- ============================================================================

set search_path = public;

do $$
declare
  v_purge boolean;
  v_demo_company_id   text := 'marker_ofek';
  v_demo_contract_id  uuid := 'c0700000-0000-4000-8000-cccccccccccc'::uuid;
  v_demo_bill_id      uuid := 'b1110000-0000-4000-8000-555555555555'::uuid;
  v_demo_po_id        uuid := 'd0000000-0000-4000-8000-777777777777'::uuid;
  v_demo_project_id   uuid := 'c0700000-0000-4000-8000-aaaaaaaaaaaa'::uuid;
begin
  v_purge := coalesce(current_setting('app.purge_demo_data', true), 'off') = 'on';

  if not v_purge then
    raise notice
      'Skipping demo data purge — set `app.purge_demo_data = ''on''` to enable.';
    return;
  end if;

  -- Disable triggers during purge: same rationale as the seed migrations
  -- (postgres role lacks JWT/service-role context for security-definer guards).
  set local session_replication_role = replica;

  -- 1) Purchase order + lines (lines cascade via FK ON DELETE CASCADE)
  delete from public.erp_purchase_orders where id = v_demo_po_id;

  -- 2) Subcontractor partial bill + lines
  delete from public.erp_subcontractor_bills where id = v_demo_bill_id;

  -- 3) Subcontractor contract (BOQ lines + general terms cascade)
  delete from public.erp_subcontractor_contracts where id = v_demo_contract_id;

  -- 4) Budget lines created for the demo PO (only the seeded combos)
  delete from public.erp_project_budget_lines
   where company_id = v_demo_company_id
     and project_id = v_demo_project_id
     and (
       (budget_sub_chapter = '01.08.10' and resource_id = 'ELEC-METER-400A') or
       (budget_sub_chapter = '01.08.20' and resource_id = 'ELEC-POINT-STD')
     );

  -- 5) Bridge row in legacy public.projects (Phase 4 candidate; no-op if not seeded)
  delete from public.projects where id = v_demo_project_id;

  -- 6) Demo project itself — KEEP by default. Uncomment if Lihtman wants
  --    a fully clean DB:
  -- delete from public.erp_proj_projects where id = v_demo_project_id;

  raise notice 'Demo seed data purged (contract %, bill %, PO %).',
    v_demo_contract_id, v_demo_bill_id, v_demo_po_id;
end
$$;

-- ============================================================================
-- End of migration: 20260822100000_purge_demo_seed_data.sql
-- ============================================================================
