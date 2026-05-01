-- =============================================================================
-- Phase 7.4.0 — AI Platform Foundations
--   תשתית לסוכני ה-AI של מודול הרכש (7.10.x) ולמנוע Smart Pricing (7.5).
--
-- כלולים
--   1) הפעלת pgvector                                (Semantic Matcher, 7.10.1)
--   2) erp_md_company_settings                       (dynamic thresholds + flags)
--   3) הרחבת public.ai_jobs הקיימת                   (priority/attempts/idempotency)
--   4) erp_ai_audit_log                              (LLM call audit + explainability)
--
-- עקרונות / תאימות
--   - לא מוחק ולא משנה schema קיים; הרחבה בלבד.
--   - public.ai_jobs כבר קיימת (20260426200000_ai_jobs_queue.sql) ומחוברת ל-
--     `/api/erp/ai/jobs`. אני מרחיב אותה ולא משכפל.
--   - company_id text → public.erp_companies(id) — standard של כל המודול.
--   - RLS דרך public.user_has_company_access(text).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) pgvector — לצורך Semantic Matcher Agent (7.10.1)
-- -----------------------------------------------------------------------------
create extension if not exists vector;

-- -----------------------------------------------------------------------------
-- 2) erp_md_company_settings — הגדרות דינמיות פר-חברה
-- -----------------------------------------------------------------------------
create table if not exists public.erp_md_company_settings (
  company_id                             text primary key
                                           references public.erp_companies(id) on delete cascade,

  -- 3% Rule thresholds (Phase 7.5)
  max_allowed_line_deviation_pct         numeric(5,2) not null default 3.00
                                           check (max_allowed_line_deviation_pct between 0 and 100),
  max_allowed_po_total_deviation_pct     numeric(5,2) not null default 5.00
                                           check (max_allowed_po_total_deviation_pct between 0 and 100),
  cross_supplier_price_window_days       integer not null default 90
                                           check (cross_supplier_price_window_days between 1 and 3650),

  -- Multi-criteria optimizer weights (sum should approximate 1.0)
  -- JSON: {"price":0.6,"lead_time":0.3,"rating":0.1}
  ai_score_weights                       jsonb not null default
                                           '{"price":0.6,"lead_time":0.3,"rating":0.1}'::jsonb,

  -- AI feature flags (agents + smart pricing)
  ai_features_enabled                    jsonb not null default
                                           '{"semantic_matcher":false,"data_enrichment":false,"rfq_agent":false,"smart_pricing":true}'::jsonb,

  -- RFQ governance (7.10.3)
  rfq_max_per_supplier_per_month         integer not null default 4
                                           check (rfq_max_per_supplier_per_month between 0 and 100),
  rfq_auto_send_enabled                  boolean not null default false,

  -- Urgency governance (7.4)
  urgency_bypass_enabled                 boolean not null default true,
  urgency_audit_threshold_per_user_month integer not null default 5,

  -- Asset / enrichment (7.10.2)
  asset_max_file_size_mb                 integer not null default 25
                                           check (asset_max_file_size_mb between 1 and 500),
  data_enrichment_respect_robots_txt     boolean not null default true,

  -- Model registry override
  preferred_llm_provider                 text
                                           check (preferred_llm_provider is null
                                             or preferred_llm_provider in ('openai','anthropic','gemini','local','azure')),
  preferred_embedding_model              text,

  -- Cost guardrails
  monthly_ai_budget_usd                  numeric(10,2),
  monthly_ai_spend_usd                   numeric(10,2) not null default 0,

  created_at                             timestamptz not null default now(),
  updated_at                             timestamptz not null default now()
);

comment on table public.erp_md_company_settings is
  'הגדרות דינמיות פר-חברה לכל רכיבי ה-AI ו-Smart Pricing. רשומה אחת פר-חברה (PK=company_id). ברירות מחדל שמרניות; הפעלת features דורשת עדכון מפורש.';
comment on column public.erp_md_company_settings.max_allowed_line_deviation_pct is
  'כלל 3% ברמת שורה: חריגה מעבר לסף → requires_escalation=true + דורש justification.';
comment on column public.erp_md_company_settings.max_allowed_po_total_deviation_pct is
  'כלל 5% ברמת PO: חריגה סה"כ → escalation אוטומטי לטייר אישור גבוה יותר.';
comment on column public.erp_md_company_settings.ai_features_enabled is
  '{"semantic_matcher":bool,"data_enrichment":bool,"rfq_agent":bool,"smart_pricing":bool}';
comment on column public.erp_md_company_settings.urgency_audit_threshold_per_user_month is
  'חריגה מסף זה ע"י אותו משתמש מעלה audit flag (מניעת abuse של HIGH).';

alter table public.erp_md_company_settings enable row level security;

drop policy if exists erp_md_company_settings_tenant_isolation on public.erp_md_company_settings;
create policy erp_md_company_settings_tenant_isolation
  on public.erp_md_company_settings
  for all
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop trigger if exists erp_md_company_settings_touch_updated_at_trg on public.erp_md_company_settings;
create trigger erp_md_company_settings_touch_updated_at_trg
  before update on public.erp_md_company_settings
  for each row
  execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 3) הרחבת public.ai_jobs הקיימת (לא יוצר טבלה חדשה!)
--    מוסיף: priority, attempts, max_attempts, idempotency_key, scheduled_at.
--    שומר תאימות מלאה לאחור; אף עמודה לא חובה.
-- -----------------------------------------------------------------------------
alter table public.ai_jobs
  add column if not exists priority         smallint not null default 5
                             check (priority between 1 and 10);

alter table public.ai_jobs
  add column if not exists attempts         integer not null default 0
                             check (attempts >= 0);

alter table public.ai_jobs
  add column if not exists max_attempts     integer not null default 3
                             check (max_attempts >= 1);

alter table public.ai_jobs
  add column if not exists idempotency_key  text;

alter table public.ai_jobs
  add column if not exists scheduled_at     timestamptz not null default now();

-- אינדקס לשליפת worker (pending, עדיפות גבוהה, תאריך קרוב)
create index if not exists ai_jobs_worker_pickup_idx
  on public.ai_jobs (status, priority desc, scheduled_at)
  where status = 'accepted';

-- יחידות של idempotency פר-חברה + type + key
create unique index if not exists ai_jobs_idempotency_uq
  on public.ai_jobs (company_id, type, idempotency_key)
  where idempotency_key is not null;

comment on column public.ai_jobs.priority is
  '1=lowest .. 10=highest. Workers שולפים DESC priority.';
comment on column public.ai_jobs.idempotency_key is
  'מפתח ייחודי פר-(company,type) למניעת כפילויות (enrichment/RFQ).';
comment on column public.ai_jobs.scheduled_at is
  'delay scheduling: ה-job לא מורץ לפני מועד זה.';

-- -----------------------------------------------------------------------------
-- 4) erp_ai_audit_log — LLM call audit (Explainability + Cost Tracking)
--    שונה מ-ai_jobs: זה לוג פר-קריאת-LLM (tokens/cost/reasoning), לא תור משימות.
-- -----------------------------------------------------------------------------
create table if not exists public.erp_ai_audit_log (
  id               uuid primary key default gen_random_uuid(),
  company_id       text not null references public.erp_companies(id) on delete cascade,
  agent_name       text not null,
  job_id           uuid references public.ai_jobs(id) on delete set null,

  entity_type      text,    -- 'po_line','item','supplier_catalog',...
  entity_id        uuid,

  model_provider   text,
  model_name       text,
  model_version    text,
  tokens_in        integer,
  tokens_out       integer,
  cost_usd         numeric(10,6),
  latency_ms       integer,

  input_hash       text,    -- SHA-256 של הקלט (dedup + idempotency)
  output_summary   text,
  reasoning_json   jsonb,   -- chain-of-thought מלא
  confidence       numeric(4,3) check (confidence is null or (confidence between 0 and 1)),

  decision         text,    -- 'AUTO_APPLIED','QUEUED_FOR_REVIEW','REJECTED'
  decision_tier    text check (decision_tier is null or decision_tier in ('A_AUTO','B_REVIEW','C_REJECT')),

  created_at       timestamptz not null default now()
);

create index if not exists erp_ai_audit_log_company_agent_idx
  on public.erp_ai_audit_log (company_id, agent_name, created_at desc);

create index if not exists erp_ai_audit_log_entity_idx
  on public.erp_ai_audit_log (entity_type, entity_id, created_at desc)
  where entity_id is not null;

comment on table public.erp_ai_audit_log is
  'Explainability store. כל קריאת LLM/agent שומרת רשומה: מודל, טוקנים, עלות, reasoning, decision-tier (A/B/C).';

alter table public.erp_ai_audit_log enable row level security;

drop policy if exists erp_ai_audit_log_tenant_isolation on public.erp_ai_audit_log;
create policy erp_ai_audit_log_tenant_isolation
  on public.erp_ai_audit_log
  for all
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- -----------------------------------------------------------------------------
-- 5) Seed: שורת settings לכל חברה קיימת
-- -----------------------------------------------------------------------------
insert into public.erp_md_company_settings (company_id)
select id from public.erp_companies
on conflict (company_id) do nothing;

-- -----------------------------------------------------------------------------
-- 6) Auto-create settings לכל חברה חדשה
-- -----------------------------------------------------------------------------
create or replace function public.erp_md_company_settings_autocreate()
returns trigger
language plpgsql
as $$
begin
  insert into public.erp_md_company_settings (company_id)
  values (new.id)
  on conflict (company_id) do nothing;
  return new;
end;
$$;

drop trigger if exists erp_companies_autocreate_settings_trg on public.erp_companies;
create trigger erp_companies_autocreate_settings_trg
  after insert on public.erp_companies
  for each row
  execute function public.erp_md_company_settings_autocreate();
