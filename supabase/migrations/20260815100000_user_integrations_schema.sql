-- =============================================================================
-- Phase 9 Step 1 — Personal Productivity & Microsoft Graph Integration
-- =============================================================================
-- Reference: chat session 2026-05-07 — Strategic Expansion: Daily Operating System
--            (My Day dashboard + Microsoft Graph foundations)
--
-- מטרה:
--   להפוך את ה-ERP מ"כלי פאסיבי" ל"מערכת הפעלה יומית" שמושכת מיילים ופגישות
--   מ-Microsoft 365 (Outlook + Calendar) דרך Microsoft Graph API, ומחברת אותם
--   לישויות העסקיות (פרויקטים, הזמנות רכש, ספקים) באמצעות סוכני AI.
--
-- שכבות חדשות במערכת (Step 1 — DB foundations only):
--   1. erp_user_integrations       — אחסון בטוח של OAuth tokens פר משתמש פר provider
--   2. erp_communications_cache    — מטמון low-latency של emails + meetings
--                                     מסונכרנים עבור קריאה מהירה של סוכני ה-AI
--
-- חוזה אבטחה (CRITICAL — הנתונים הם **per-user**, לא per-company):
--   • RLS מחמיר: auth.uid() = user_id בלבד. אסור multi-tenant sharing —
--     טוקנים של משתמש א' אסור שייחשפו אפילו לאדמין של החברה.
--   • access_token / refresh_token יישמרו מוצפנים (pgcrypto pgsodium) בעתיד;
--     בשלב הזה הם text כדי לא לבלום את ה-Step 1; כל שורה תעבור encryption-at-rest
--     ב-Step 2 כשנוסיף את עטיפת `pgsodium.crypto_aead_*` סביב access_token.
--   • policies for ALL מחייבת גם at-read וגם at-write לעבור את הבדיקה.
--   • טריגר `set_updated_at` (קיים מ-`20250322000000_initial_schema.sql`).
--
-- מה *לא* בשלב הזה:
--   ✗ Azure App Registration / Entra ID OAuth flow      → Step 2
--   ✗ /api/integrations/microsoft/callback              → Step 2
--   ✗ Token refresh background job                      → Step 2
--   ✗ Graph delta-sync worker (ms.outlook → cache)      → Step 3
--   ✗ AI agent linking (email → project/PO/supplier)    → Step 3
--   ✗ Encrypted-at-rest tokens (pgsodium wrapper)       → Step 2
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Provider enum — מאפשר הרחבה עתידית ל-Google Workspace / Slack / וכו׳
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'erp_user_integration_provider') then
    create type public.erp_user_integration_provider as enum (
      'MICROSOFT_GRAPH',  -- Microsoft 365 (Outlook + Calendar) — Phase 9 primary target
      'GOOGLE_WORKSPACE', -- Gmail + Google Calendar — future
      'SLACK'             -- Slack DM/channel sync — future
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'erp_user_integration_sync_status') then
    create type public.erp_user_integration_sync_status as enum (
      'PENDING',     -- חיבור נוצר, sync ראשון טרם החל
      'SYNCING',     -- worker פעיל מסנכרן delta
      'ACTIVE',      -- sync מצליח, נתונים עדכניים
      'STALE',       -- token תקף אבל sync אחרון > 24h (worker down?)
      'EXPIRED',     -- access_token פג, ממתין ל-refresh
      'REVOKED',     -- המשתמש ניתק את החיבור (או provider revoked)
      'ERROR'        -- שגיאת sync חוזרת — דורשת התערבות
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'erp_communication_type') then
    create type public.erp_communication_type as enum (
      'EMAIL',       -- מייל בודד מהתיבה (sent/received)
      'MEETING',     -- אירוע יומן (calendar event)
      'CHAT'         -- Teams chat — future
    );
  end if;
end$$;

-- -----------------------------------------------------------------------------
-- 2) erp_user_integrations — OAuth token vault, אחד לפר user × provider
-- -----------------------------------------------------------------------------
-- כל שורה היא חיבור פעיל אחד של משתמש ל-provider חיצוני. unique(user_id, provider)
-- מבטיח שלא יווצרו כפילויות בעת re-authentication — ה-callback פשוט יבצע upsert
-- ויעדכן את הטוקנים החדשים על אותה שורה.
create table if not exists public.erp_user_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider public.erp_user_integration_provider not null,
  /** OAuth access token — short-lived (typically 1h ב-Microsoft Graph). */
  access_token text not null,
  /** Refresh token — long-lived (90d default). פג כשהמשתמש משנה סיסמה. */
  refresh_token text null,
  expires_at timestamptz not null,
  /** הכתובת המקושרת — UI מציג ל-CEO מאיזה אאוטלוק קוראים. */
  email_address text not null,
  /** Tenant id (Azure AD) או workspace id (Google) — לעתיד, לרבי-tenant SSO. */
  external_tenant_id text null,
  sync_status public.erp_user_integration_sync_status not null default 'PENDING',
  last_sync_at timestamptz null,
  last_sync_error text null,
  /** OAuth scopes שאושרו ע״י המשתמש (Mail.Read, Calendars.Read וכו׳). */
  scopes text[] not null default array[]::text[],
  /** מטא-דאטה גמישה לעתיד (delta cursors, throttle headers, וכו׳). */
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_user_integrations_email_nonempty
    check (length(trim(email_address)) > 0),
  constraint erp_user_integrations_access_token_nonempty
    check (length(trim(access_token)) > 0),
  constraint erp_user_integrations_user_provider_uq
    unique (user_id, provider)
);

create index if not exists erp_user_integrations_user_idx
  on public.erp_user_integrations (user_id);
create index if not exists erp_user_integrations_status_idx
  on public.erp_user_integrations (sync_status, last_sync_at desc);
create index if not exists erp_user_integrations_expires_idx
  on public.erp_user_integrations (expires_at)
  where sync_status in ('ACTIVE', 'STALE');

drop trigger if exists erp_user_integrations_updated_at on public.erp_user_integrations;
create trigger erp_user_integrations_updated_at
  before update on public.erp_user_integrations
  for each row execute function public.set_updated_at();

comment on table public.erp_user_integrations is
  'Phase 9 — OAuth token vault per user × external provider (Microsoft Graph et al). RLS: auth.uid() = user_id.';
comment on column public.erp_user_integrations.access_token is
  'Short-lived OAuth bearer token. Step 2: יוחלף ב-pgsodium encrypted-at-rest column.';
comment on column public.erp_user_integrations.refresh_token is
  'Long-lived refresh token. Step 2: יוחלף ב-pgsodium encrypted-at-rest column.';

-- -----------------------------------------------------------------------------
-- 3) erp_communications_cache — Low-latency cache של emails + meetings
-- -----------------------------------------------------------------------------
-- מטרה: לא לפנות ל-Microsoft Graph בכל קריאה. ה-worker מסנכרן delta כל ~5 דקות
-- ושומר עותק קל פה, וסוכני ה-AI ("עוזר ההקשר") קוראים ישירות מ-Postgres עם
-- vector-search על subject+body_preview בעתיד.
--
-- (user_id, external_id) הוא unique — מסנכרן אותה ההודעה פעמיים מ-Graph לא
-- ייצור duplicates, אלא יבצע upsert.
create table if not exists public.erp_communications_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  /** Pointer חזרה ל-integration שיצר את השורה — מאפשר cleanup של תיבה אחת בלבד. */
  integration_id uuid null
    references public.erp_user_integrations (id) on delete cascade,
  /** ה-id החיצוני (Microsoft Graph message id / event id). אופק לעתיד אם המשתמש
      מחבר כמה תיבות — נוסיף provider לפיצוח unique. */
  external_id text not null,
  type public.erp_communication_type not null,
  /** שולח מנורמל: { name, address, isInternal } — JSON גמיש לעתיד (שולחים מרובים). */
  sender_json jsonb not null,
  /** נמענים — רק להצגה, לא ל-search index. */
  recipients_json jsonb not null default '[]'::jsonb,
  subject text not null,
  /** תקציר טקסטואלי קצר (~280 תווים) של הגוף — לכרטיסי inbox + AI prompts. */
  body_preview text null,
  /** Body מלא נשמר ב-Graph; כאן רק החלקים הדרושים לקריאה מהירה.
      future: vector embedding column ב-Step 3. */
  is_read boolean not null default false,
  is_flagged boolean not null default false,
  has_attachments boolean not null default false,
  /** UTC timestamp של קבלת/שליחת המייל / תחילת הפגישה. */
  received_at timestamptz not null,
  /** Meeting only — סוף הפגישה. NULL ל-EMAIL. */
  ends_at timestamptz null,
  /** Meeting only — מיקום (חדר, כתובת או "Online"). NULL ל-EMAIL. */
  location text null,
  /** קישור חזרה לישות עסקית — נחשב ע״י סוכן ההקשר ב-Step 3. nullable כי לא
      כל מייל קשור לפרויקט/PO. ה-FK לא מוגדר כי project_id יכול להיות לכל
      טבלה (projects/erp_purchase_orders/erp_md_suppliers) — נשמר כ-text + type. */
  linked_entity_type text null
    check (linked_entity_type is null or
           linked_entity_type in ('PROJECT', 'PURCHASE_ORDER', 'SUPPLIER', 'INVOICE')),
  linked_entity_id text null,
  /** Confidence של ה-AI להצמדה (0..1). UI מציג רק >= 0.6. */
  link_confidence numeric(4,3) null
    check (link_confidence is null or (link_confidence >= 0 and link_confidence <= 1)),
  /** raw payload מ-Graph — לאיתור באגים, בעתיד ל-re-process עם מודל משופר. */
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_communications_cache_external_id_nonempty
    check (length(trim(external_id)) > 0),
  constraint erp_communications_cache_subject_nonempty
    check (length(trim(subject)) > 0),
  constraint erp_communications_cache_user_external_uq
    unique (user_id, external_id),
  constraint erp_communications_cache_meeting_consistency
    check (
      (type = 'MEETING' and ends_at is not null) or
      (type <> 'MEETING')
    ),
  constraint erp_communications_cache_link_consistency
    check (
      (linked_entity_type is null and linked_entity_id is null) or
      (linked_entity_type is not null and linked_entity_id is not null
        and length(trim(linked_entity_id)) > 0)
    )
);

create index if not exists erp_communications_cache_user_received_idx
  on public.erp_communications_cache (user_id, received_at desc);
create index if not exists erp_communications_cache_user_type_idx
  on public.erp_communications_cache (user_id, type, received_at desc);
create index if not exists erp_communications_cache_user_unread_idx
  on public.erp_communications_cache (user_id, is_read, received_at desc)
  where is_read = false;
create index if not exists erp_communications_cache_linked_entity_idx
  on public.erp_communications_cache (linked_entity_type, linked_entity_id)
  where linked_entity_type is not null;
create index if not exists erp_communications_cache_integration_idx
  on public.erp_communications_cache (integration_id)
  where integration_id is not null;

drop trigger if exists erp_communications_cache_updated_at on public.erp_communications_cache;
create trigger erp_communications_cache_updated_at
  before update on public.erp_communications_cache
  for each row execute function public.set_updated_at();

comment on table public.erp_communications_cache is
  'Phase 9 — Low-latency mirror של Outlook/Graph emails + meetings פר משתמש. RLS: auth.uid() = user_id.';
comment on column public.erp_communications_cache.linked_entity_type is
  'Step 3 — סוכן ההקשר ימלא לפי תוכן המייל. Allowed: PROJECT|PURCHASE_ORDER|SUPPLIER|INVOICE.';
comment on column public.erp_communications_cache.link_confidence is
  '0..1 — UI מציג רק linked_entity כשה-confidence ≥ 0.6.';

-- -----------------------------------------------------------------------------
-- 4) RLS — per-user isolation (CRITICAL: לא per-company!)
-- -----------------------------------------------------------------------------
-- שלא כמו שאר ה-erp_* טבלאות, הנתונים פה הם **אישיים** ולא של החברה. גם
-- אדמין של החברה לא יכול לראות את המיילים של עובד אחר. RLS מחייבת
-- auth.uid() = user_id בלבד.
alter table public.erp_user_integrations    enable row level security;
alter table public.erp_communications_cache enable row level security;

drop policy if exists erp_user_integrations_owner_only
  on public.erp_user_integrations;
create policy erp_user_integrations_owner_only
  on public.erp_user_integrations for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists erp_communications_cache_owner_only
  on public.erp_communications_cache;
create policy erp_communications_cache_owner_only
  on public.erp_communications_cache for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =============================================================================
-- End — Phase 9 Step 1 (DB scaffolding only).
-- Step 2 will add:
--   • OAuth callback route & token refresh worker
--   • pgsodium encrypted-at-rest wrapper around access_token / refresh_token
-- Step 3 will add:
--   • Microsoft Graph delta-sync worker → erp_communications_cache
--   • AI context-linking agent → fills linked_entity_{type,id} + confidence
-- =============================================================================
