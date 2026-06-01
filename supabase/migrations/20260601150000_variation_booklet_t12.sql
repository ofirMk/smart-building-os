-- T12 — Variations AI Booklet (PyMuPDF + RAG)
--
-- מטרה: לאפשר ל-ai-worker (Python) לכתוב חזרה את ההצדקה הקבלנית
-- שנוצרה ב-LLM + URL של חוברת ה-PDF הממוזגת, מבלי לשבור את הסכמה
-- של contract_variation_orders שהונחה ב-T11 / ב-20260419130100.
--
-- כללי קוד:
--   * additive בלבד (IF NOT EXISTS).
--   * tenant isolation: company_id text + project_id uuid (R1).
--   * status check מורחב אך נשמר case-insensitive: 'submitted' = 'Submitted'.
--   * אין מחיקה / שינוי שמות עמודות.

-- ---------------------------------------------------------------------------
-- 1) עמודות חדשות ל-contract_variation_orders
-- ---------------------------------------------------------------------------
alter table public.contract_variation_orders
  add column if not exists company_id text;

alter table public.contract_variation_orders
  add column if not exists project_id uuid references public.projects (id) on delete set null;

alter table public.contract_variation_orders
  add column if not exists description text;

alter table public.contract_variation_orders
  add column if not exists ai_justification_text text;

alter table public.contract_variation_orders
  add column if not exists pdf_url text;

alter table public.contract_variation_orders
  add column if not exists booklet_generated_at timestamptz;

comment on column public.contract_variation_orders.company_id is
  'R1 — tenant isolation. text-typed, מצביע על public.erp_companies(id).';
comment on column public.contract_variation_orders.project_id is
  'R1 — scoping ל-RAG ול-RLS. הפרויקט עליו החריג חל.';
comment on column public.contract_variation_orders.description is
  'תיאור החריג מהשטח — input ל-RAG search וגם input ל-LLM.';
comment on column public.contract_variation_orders.ai_justification_text is
  'T12: ההצדקה הקבלנית המנוסחת ע"י ה-LLM ב-ai-worker.';
comment on column public.contract_variation_orders.pdf_url is
  'T12: URL ב-Supabase Storage של חוברת ה-PDF הממוזגת (PyMuPDF).';
comment on column public.contract_variation_orders.booklet_generated_at is
  'T12: timestamp ההפקה האחרונה של החוברת.';

create index if not exists contract_variation_orders_company_idx
  on public.contract_variation_orders (company_id)
  where company_id is not null;

create index if not exists contract_variation_orders_project_idx
  on public.contract_variation_orders (project_id, status)
  where project_id is not null;

-- ---------------------------------------------------------------------------
-- 2) פונקציית audit ייעודית — לעדיף קריאה מפורשת מה-worker (HMAC-protected)
--    על-פני trigger גנרי, כי ה-worker רץ עם service_role והעדכון הוא
--    server-to-server. כך עדיין מקיימים R6 בלי double-write.
-- ---------------------------------------------------------------------------
create or replace function public.log_variation_booklet_event(
  p_variation_id uuid,
  p_project_id uuid,
  p_action text,
  p_old jsonb default null,
  p_new jsonb default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.mo_audit_logs (
    user_id, project_id, action_type, table_name, old_data, new_data
  )
  values (
    null, -- ai-worker רץ ללא user_id (server-to-server)
    p_project_id,
    case
      when upper(p_action) in ('INSERT','UPDATE','DELETE') then upper(p_action)
      else 'UPDATE'
    end,
    'contract_variation_orders',
    coalesce(p_old, jsonb_build_object('variation_id', p_variation_id)),
    coalesce(p_new, jsonb_build_object('variation_id', p_variation_id, 'action', p_action))
  );
$$;

comment on function public.log_variation_booklet_event(uuid, uuid, text, jsonb, jsonb) is
  'T12: כתיבת רשומת audit מפורשת מ-ai-worker אחרי הפקת חוברת — מקיים R6 בלי לדרוש trigger.';

grant execute on function public.log_variation_booklet_event(uuid, uuid, text, jsonb, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3) ודא ש-vector + RPC ה-RAG הקיים זמין (no-op אם כבר רץ ב-20260424120000).
--    אנחנו לא יוצרים טבלה חדשה — re-use של mo_contract_vault_documents +
--    הפונקציה match_contract_vault_documents(project_id, embedding, count).
-- ---------------------------------------------------------------------------
create extension if not exists vector;

-- אם בעתיד נרצה לחפש *סעיפי-חוזה* בנפרד ממסמכים שלמים, נוסיף טבלה
-- mo_contract_clauses באותה צורה. כרגע ה-RAG משתמש ב-vault.
