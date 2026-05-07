-- =============================================================================
-- Project DMS — Phase C.1 Foundations (DDL only, no UI, no backfill)
-- =============================================================================
-- HLD reference: docs/architecture/project-dms-architecture-2026-05-07.md
--
-- מה שלב זה כן עושה:
--   1. 9 enums (folder_kind, document_kind, confidentiality, ACL scope/principal,
--      entity_link_type, audit actor/action/target/result, subscription scope)
--   2. 8 טבלאות: dms_folders, dms_documents, dms_document_versions, dms_acl_entries,
--      dms_acl_templates, dms_entity_links, dms_audit_log, dms_folder_subscriptions
--   3. פונקציית ה-source-of-truth: dms_effective_permissions(document_id, user_id)
--   4. RLS policies על כל הטבלאות
--   5. Triggers: set_updated_at, immutability על versions ועל audit_log,
--      monotonic version_number, path_cache maintenance, FK validator לישויות פולימורפיות,
--      bootstrap audit על שינויי confidentiality
--   6. Indexes לביצועים
--   7. Storage buckets (4): project-dms, project-dms-restricted, dms-audit-archive,
--      dms-zip-exports — idempotent INSERT.
--
-- מה שלב זה *לא* עושה (deferred):
--   ✗ Backfill מ-public.project_documents     → C.1.b (script נפרד, idempotent)
--   ✗ Storage bucket policies מפורטות         → C.1.c (תלוי ב-Supabase storage.objects)
--   ✗ DENY entries                             → C.2 (D2 approved deferred)
--   ✗ AV scan worker                           → C.2 (worker code)
--   ✗ Email queue / Resend integration         → C.2
--   ✗ Hard-delete admin RPC                    → C.4
--   ✗ ZIP export worker                        → C.4
--
-- אישורים שמשולבים (D1–D8 from HLD §8):
--   D1 ACL=Hybrid+Templates    → dms_acl_entries + dms_acl_templates
--   D2 DENY deferred           → אין is_deny column ב-Phase C.1
--   D3 Revert=copy→new version → trigger immutability + helper RPC ב-C.2
--   D4 Soft-delete only        → deleted_at columns; hard-delete service-role RPC
--   D5 Instant emails          → אין batching column
--   D6 e-signature out         → לא נכלל
--   D7 Templates company+proj  → dms_acl_templates.scope ('COMPANY'|'PROJECT')
--   D8 Magic-link only         → principal_type EXTERNAL_EMAIL
-- =============================================================================

set local search_path = public;

-- =============================================================================
-- 1) ENUMS
-- =============================================================================
do $$
begin
  -- Folder taxonomy
  if not exists (select 1 from pg_type where typname = 'dms_folder_kind') then
    create type public.dms_folder_kind as enum (
      'STANDARD',          -- תיקייה רגילה
      'SYSTEM',            -- ברירת מחדל מה-vault, אסור למחיקה
      'EXTERNAL_PARTNER'   -- תיקייה עם ACL מיוחד לקבלן משנה
    );
  end if;

  -- Document taxonomy (HLD §2.2.2)
  if not exists (select 1 from pg_type where typname = 'dms_document_kind') then
    create type public.dms_document_kind as enum (
      'PLAN',
      'PERMIT',
      'CERTIFICATE',
      'CONTRACT',
      'INVOICE',
      'DELIVERY_NOTE',
      'CORRESPONDENCE',
      'PHOTO',
      'OTHER'
    );
  end if;

  -- Confidentiality (HLD §2.2.2 + §3.1)
  if not exists (select 1 from pg_type where typname = 'dms_confidentiality_level') then
    create type public.dms_confidentiality_level as enum (
      'PUBLIC',     -- כל מי שיש לו project access
      'INTERNAL',   -- default
      'RESTRICTED', -- רק ACL מפורש
      'SECRET'      -- bucket נפרד + MFA + לא יופיע ב-list
    );
  end if;

  -- ACL scope (HLD §2.2.4)
  if not exists (select 1 from pg_type where typname = 'dms_acl_scope_type') then
    create type public.dms_acl_scope_type as enum ('FOLDER', 'DOCUMENT');
  end if;

  -- ACL principal (HLD §2.2.4 + D8)
  if not exists (select 1 from pg_type where typname = 'dms_acl_principal_type') then
    create type public.dms_acl_principal_type as enum (
      'USER',
      'ROLE',
      'GROUP',
      'EXTERNAL_EMAIL'  -- magic-link flow ב-Phase C
    );
  end if;

  -- ACL template scope (HLD §2.2.5 + D7)
  if not exists (select 1 from pg_type where typname = 'dms_acl_template_scope') then
    create type public.dms_acl_template_scope as enum ('COMPANY', 'PROJECT');
  end if;

  -- Entity link types (HLD §2.2.6)
  if not exists (select 1 from pg_type where typname = 'dms_entity_link_type') then
    create type public.dms_entity_link_type as enum (
      'PROJECT',
      'BOQ_ITEM',
      'PURCHASE_ORDER',
      'PO_LINE',
      'GOODS_RECEIPT',
      'VENDOR_INVOICE',
      'SUPPLIER',
      'CONTRACT',
      'WBS_TASK'
    );
  end if;

  -- Audit actor (HLD §2.2.7)
  if not exists (select 1 from pg_type where typname = 'dms_audit_actor_type') then
    create type public.dms_audit_actor_type as enum (
      'USER',
      'SERVICE',
      'AGENT',
      'EXTERNAL'
    );
  end if;

  -- Audit action (HLD §2.2.7)
  if not exists (select 1 from pg_type where typname = 'dms_audit_action') then
    create type public.dms_audit_action as enum (
      'VIEW_LIST',
      'VIEW_METADATA',
      'VIEW_CONTENT',
      'DOWNLOAD',
      'UPLOAD_NEW',
      'UPLOAD_VERSION',
      'DELETE_SOFT',
      'DELETE_HARD',
      'MOVE',
      'RENAME',
      'ACL_GRANT',
      'ACL_REVOKE',
      'LINK_ENTITY',
      'UNLINK_ENTITY',
      'EXPORT_ZIP',
      'CONFIDENTIALITY_CHANGED',
      'NOTIFICATIONS_SENT'
    );
  end if;

  -- Audit target
  if not exists (select 1 from pg_type where typname = 'dms_audit_target_type') then
    create type public.dms_audit_target_type as enum (
      'FOLDER',
      'DOCUMENT',
      'VERSION',
      'ACL_ENTRY',
      'LINK'
    );
  end if;

  -- Audit result
  if not exists (select 1 from pg_type where typname = 'dms_audit_result') then
    create type public.dms_audit_result as enum (
      'SUCCESS',
      'DENIED',
      'ERROR',
      'PENDING_SCAN'  -- upload התקבל אבל ממתין ל-AV scan
    );
  end if;

  -- Subscription scope (HLD §2.2.8)
  if not exists (select 1 from pg_type where typname = 'dms_subscription_scope') then
    create type public.dms_subscription_scope as enum ('ROOT', 'RECURSIVE');
  end if;
end$$;

-- Allowed capabilities — text-array, validated by check constraint:
-- VIEW_METADATA, VIEW_CONTENT, DOWNLOAD, UPLOAD_VERSION, DELETE, MANAGE_ACL, LINK_ENTITY
-- מחזיקים text[] במקום enum array כדי לאפשר סט גמיש (לא צריך migration לתוספות).

-- =============================================================================
-- 2) TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 2.1 dms_folders — עץ תיקיות (HLD §2.2.1)
-- -----------------------------------------------------------------------------
create table if not exists public.dms_folders (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  parent_folder_id uuid null references public.dms_folders (id) on delete cascade,
  name text not null,
  /** denormalized "Plans/Floor 7/Electrical" — מתעדכן בטריגר. אסור לערוך ידנית. */
  path_cache text not null default '',
  kind public.dms_folder_kind not null default 'STANDARD',
  /** legacy bridge — מקושר ל-project_documents.vault_folder_key. */
  vault_folder_key text null,
  default_acl_template_id uuid null,  -- FK נוסף אחרי שטבלת templates נוצרת
  created_by uuid null references auth.users (id) on delete set null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dms_folders_name_nonempty check (length(trim(name)) > 0 and length(name) <= 200),
  constraint dms_folders_no_self_parent check (id <> parent_folder_id)
);

-- אחיות לא יכולות לקבל אותו שם (case-insensitive).
create unique index if not exists dms_folders_sibling_name_uq
  on public.dms_folders (project_id, coalesce(parent_folder_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))
  where deleted_at is null;

create index if not exists dms_folders_project_parent_idx
  on public.dms_folders (project_id, parent_folder_id)
  where deleted_at is null;
create index if not exists dms_folders_company_idx
  on public.dms_folders (company_id);
create index if not exists dms_folders_vault_key_idx
  on public.dms_folders (project_id, vault_folder_key)
  where vault_folder_key is not null;

comment on table public.dms_folders is
  'Phase C.1 — DMS folder tree per project. Hierarchy via parent_folder_id; soft-delete only.';
comment on column public.dms_folders.path_cache is
  'Denormalized "Plans/Floor 7/Electrical" maintained by trigger. Do not edit manually.';
comment on column public.dms_folders.kind is
  'STANDARD=user-created, SYSTEM=vault default (uneditable), EXTERNAL_PARTNER=subcontractor.';

-- -----------------------------------------------------------------------------
-- 2.5 dms_acl_templates — תבניות הרשאה (HLD §2.2.5, D7)
-- מוקדמת מ-dms_documents כי dms_folders מתייחסת אליה.
-- -----------------------------------------------------------------------------
create table if not exists public.dms_acl_templates (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete cascade,
  scope public.dms_acl_template_scope not null,
  /** חובה כש-scope=PROJECT, חייב להיות null כש-scope=COMPANY. */
  project_id uuid null references public.projects (id) on delete cascade,
  name text not null,
  description text null,
  /** מערך של {principal_type, principal_id, capabilities[], inherits_to_descendants}.
      ה-API ישלם את ה-validation; ה-DB רק שומר. */
  entries_json jsonb not null default '[]'::jsonb,
  /** auto-apply ל-folder אם document_kind תואם — ה-UI רק מציע. */
  applies_to_kinds public.dms_document_kind[] not null default array[]::public.dms_document_kind[],
  created_by uuid null references auth.users (id) on delete set null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dms_acl_templates_scope_project_consistency check (
    (scope = 'PROJECT' and project_id is not null) or
    (scope = 'COMPANY' and project_id is null)
  ),
  constraint dms_acl_templates_name_nonempty check (length(trim(name)) > 0)
);

-- שם ייחודי per scope (project-level עוקף company-level בעת precedence).
create unique index if not exists dms_acl_templates_company_name_uq
  on public.dms_acl_templates (company_id, lower(name))
  where scope = 'COMPANY' and deleted_at is null;
create unique index if not exists dms_acl_templates_project_name_uq
  on public.dms_acl_templates (project_id, lower(name))
  where scope = 'PROJECT' and deleted_at is null;
create index if not exists dms_acl_templates_company_idx
  on public.dms_acl_templates (company_id);

comment on table public.dms_acl_templates is
  'Phase C.1 — ACL bundles. Project-level overrides company-level. D7 approved.';

-- חיבור FK שדחינו מטבלת folders → templates
alter table public.dms_folders
  drop constraint if exists dms_folders_default_acl_template_fk;
alter table public.dms_folders
  add constraint dms_folders_default_acl_template_fk
  foreign key (default_acl_template_id)
  references public.dms_acl_templates (id) on delete set null;

-- -----------------------------------------------------------------------------
-- 2.2 dms_documents — מסמך לוגי (HLD §2.2.2)
-- -----------------------------------------------------------------------------
create table if not exists public.dms_documents (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  folder_id uuid not null references public.dms_folders (id) on delete restrict,
  title text not null,
  document_kind public.dms_document_kind not null default 'OTHER',
  /** pointer ל-current_version. nullable עד שגרסה ראשונה finalized. */
  current_version_id uuid null,  -- FK נוסף אחרי dms_document_versions
  confidentiality_level public.dms_confidentiality_level not null default 'INTERNAL',
  tags text[] not null default array[]::text[],
  metadata jsonb not null default '{}'::jsonb,
  /** Bridge לטבלה הישנה. ממולא ע"י backfill ב-C.1.b בלבד. */
  legacy_project_documents_id uuid null,
  created_by uuid null references auth.users (id) on delete set null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dms_documents_title_nonempty check (length(trim(title)) > 0)
);

create index if not exists dms_documents_project_folder_idx
  on public.dms_documents (project_id, folder_id)
  where deleted_at is null;
create index if not exists dms_documents_company_kind_idx
  on public.dms_documents (company_id, document_kind);
create index if not exists dms_documents_confidentiality_idx
  on public.dms_documents (confidentiality_level)
  where confidentiality_level in ('RESTRICTED', 'SECRET');
create index if not exists dms_documents_legacy_idx
  on public.dms_documents (legacy_project_documents_id)
  where legacy_project_documents_id is not null;
create index if not exists dms_documents_tags_gin
  on public.dms_documents using gin (tags);
create unique index if not exists dms_documents_legacy_uq
  on public.dms_documents (legacy_project_documents_id)
  where legacy_project_documents_id is not null;

comment on table public.dms_documents is
  'Phase C.1 — Logical DMS document. ACL attaches here; versions are children.';

-- -----------------------------------------------------------------------------
-- 2.3 dms_document_versions — גרסה פיזית, immutable (HLD §2.2.3)
-- -----------------------------------------------------------------------------
create table if not exists public.dms_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.dms_documents (id) on delete cascade,
  version_number int not null,
  /** "project-dms" או "project-dms-restricted". מסונכרן עם confidentiality_level של ה-doc. */
  storage_bucket text not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null,
  /** SHA-256 hex (64 chars). client-computed, server-verified. */
  checksum_sha256 text not null,
  original_filename text not null,
  uploaded_by uuid null references auth.users (id) on delete set null,
  uploaded_at timestamptz not null default now(),
  change_note text null,
  /** true עד ש-AV scan מסיים בהצלחה. כל שאילתה שמחזירה signed URL חייבת לסנן is_quarantined=false. */
  is_quarantined boolean not null default true,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dms_document_versions_size_positive check (size_bytes > 0),
  constraint dms_document_versions_version_positive check (version_number > 0),
  constraint dms_document_versions_checksum_format check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  constraint dms_document_versions_bucket_allowed check (
    storage_bucket in ('project-dms', 'project-dms-restricted')
  ),
  constraint dms_document_versions_path_nonempty check (length(trim(storage_path)) > 0),
  constraint dms_document_versions_filename_nonempty check (length(trim(original_filename)) > 0)
);

create unique index if not exists dms_document_versions_doc_version_uq
  on public.dms_document_versions (document_id, version_number);
create unique index if not exists dms_document_versions_path_uq
  on public.dms_document_versions (storage_bucket, storage_path);
create index if not exists dms_document_versions_doc_idx
  on public.dms_document_versions (document_id, version_number desc);
create index if not exists dms_document_versions_quarantined_idx
  on public.dms_document_versions (uploaded_at)
  where is_quarantined = true;

-- חיבור FK שדחינו מטבלת documents → versions
alter table public.dms_documents
  drop constraint if exists dms_documents_current_version_fk;
alter table public.dms_documents
  add constraint dms_documents_current_version_fk
  foreign key (current_version_id)
  references public.dms_document_versions (id) on delete set null
  deferrable initially deferred;

comment on table public.dms_document_versions is
  'Phase C.1 — Physical file pointer. Immutable after insert (trigger-enforced). D3: revert=new version copy.';

-- -----------------------------------------------------------------------------
-- 2.4 dms_acl_entries — RBAC + ABAC (HLD §2.2.4, D1)
-- -----------------------------------------------------------------------------
create table if not exists public.dms_acl_entries (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete cascade,
  scope_type public.dms_acl_scope_type not null,
  /** FK פולימורפי — נאכף ע"י trigger validator (אין FK פיזי). */
  scope_id uuid not null,
  principal_type public.dms_acl_principal_type not null,
  /** uuid למשתמש/קבוצה (text-cast), slug ל-role, email לחיצוני. */
  principal_id text not null,
  /** תת-קבוצה של:
      VIEW_METADATA, VIEW_CONTENT, DOWNLOAD, UPLOAD_VERSION, DELETE, MANAGE_ACL, LINK_ENTITY */
  capabilities text[] not null,
  inherits_to_descendants boolean not null default true,
  /** EXTERNAL_EMAIL חייב expires_at; שאר ה-types — אופציונלי. */
  expires_at timestamptz null,
  granted_by uuid null references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dms_acl_entries_principal_id_nonempty check (length(trim(principal_id)) > 0),
  constraint dms_acl_entries_capabilities_nonempty check (cardinality(capabilities) > 0),
  constraint dms_acl_entries_capabilities_valid check (
    capabilities <@ array[
      'VIEW_METADATA',
      'VIEW_CONTENT',
      'DOWNLOAD',
      'UPLOAD_VERSION',
      'DELETE',
      'MANAGE_ACL',
      'LINK_ENTITY'
    ]::text[]
  ),
  constraint dms_acl_entries_external_must_expire check (
    principal_type <> 'EXTERNAL_EMAIL' or expires_at is not null
  ),
  constraint dms_acl_entries_external_email_format check (
    principal_type <> 'EXTERNAL_EMAIL' or principal_id ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  )
);

-- אותו (scope, principal) — שורה אחת בלבד. update לעדכן capabilities ולא duplicate.
create unique index if not exists dms_acl_entries_unique_grant
  on public.dms_acl_entries (scope_type, scope_id, principal_type, lower(principal_id));

create index if not exists dms_acl_entries_scope_idx
  on public.dms_acl_entries (scope_type, scope_id);
create index if not exists dms_acl_entries_principal_idx
  on public.dms_acl_entries (principal_type, lower(principal_id));
create index if not exists dms_acl_entries_company_idx
  on public.dms_acl_entries (company_id);
create index if not exists dms_acl_entries_expires_idx
  on public.dms_acl_entries (expires_at)
  where expires_at is not null;

comment on table public.dms_acl_entries is
  'Phase C.1 — ACL grants. D1=Hybrid+Templates. D2 deferred: no DENY entries yet (deny by default).';

-- -----------------------------------------------------------------------------
-- 2.6 dms_entity_links — חיבור פולימורפי ל-ERP (HLD §2.2.6)
-- -----------------------------------------------------------------------------
create table if not exists public.dms_entity_links (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete cascade,
  document_id uuid not null references public.dms_documents (id) on delete cascade,
  entity_type public.dms_entity_link_type not null,
  /** uuid או business id (PO-2026-0184). אין FK פיזי. */
  entity_id text not null,
  link_role text null,
  link_confidence numeric(4, 3) null,
  /** המקור נמחק → orphan, לא ניתוק קשיח. */
  is_orphan boolean not null default false,
  linked_by uuid null references auth.users (id) on delete set null,
  linked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dms_entity_links_entity_id_nonempty check (length(trim(entity_id)) > 0),
  constraint dms_entity_links_confidence_range check (
    link_confidence is null or (link_confidence >= 0 and link_confidence <= 1)
  ),
  constraint dms_entity_links_role_allowed check (
    link_role is null or link_role in ('ATTACHMENT', 'SOURCE_OF_TRUTH', 'EVIDENCE')
  )
);

-- אותו (document, entity) — קישור אחד בלבד פר role.
create unique index if not exists dms_entity_links_unique
  on public.dms_entity_links (document_id, entity_type, lower(entity_id), coalesce(link_role, ''));

create index if not exists dms_entity_links_entity_idx
  on public.dms_entity_links (entity_type, lower(entity_id))
  where is_orphan = false;
create index if not exists dms_entity_links_document_idx
  on public.dms_entity_links (document_id)
  where is_orphan = false;
create index if not exists dms_entity_links_company_idx
  on public.dms_entity_links (company_id);

comment on table public.dms_entity_links is
  'Phase C.1 — Polymorphic links: doc ↔ ERP entity (PO/BOQ/...). Soft FK + is_orphan recovery.';

-- -----------------------------------------------------------------------------
-- 2.7 dms_audit_log — immutable audit (HLD §2.2.7)
-- -----------------------------------------------------------------------------
create table if not exists public.dms_audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete cascade,
  project_id uuid null references public.projects (id) on delete set null,
  actor_type public.dms_audit_actor_type not null,
  /** uuid למשתמש; "ai-procurement-copilot" לסוכן; email לחיצוני; "system" ל-SERVICE. */
  actor_id text not null,
  action public.dms_audit_action not null,
  target_type public.dms_audit_target_type not null,
  target_id uuid not null,
  result public.dms_audit_result not null default 'SUCCESS',
  denied_reason text null,
  ip_address inet null,
  user_agent text null,
  request_id text null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint dms_audit_log_actor_id_nonempty check (length(trim(actor_id)) > 0),
  constraint dms_audit_log_denied_reason_when_denied check (
    (result = 'DENIED' and denied_reason is not null) or
    (result <> 'DENIED')
  )
);

-- Indexes — audit נקרא הרבה ב-forensics. כיסוי ל-(target, time) ו-(actor, time).
create index if not exists dms_audit_log_target_idx
  on public.dms_audit_log (target_type, target_id, occurred_at desc);
create index if not exists dms_audit_log_actor_idx
  on public.dms_audit_log (actor_type, actor_id, occurred_at desc);
create index if not exists dms_audit_log_company_time_idx
  on public.dms_audit_log (company_id, occurred_at desc);
create index if not exists dms_audit_log_project_time_idx
  on public.dms_audit_log (project_id, occurred_at desc)
  where project_id is not null;
create index if not exists dms_audit_log_action_idx
  on public.dms_audit_log (action, occurred_at desc);

comment on table public.dms_audit_log is
  'Phase C.1 — Immutable audit. INSERT-only. UPDATE/DELETE blocked by trigger. 7-year retention.';

-- -----------------------------------------------------------------------------
-- 2.8 dms_folder_subscriptions — מנויי התראות (HLD §2.2.8, D5)
-- -----------------------------------------------------------------------------
create table if not exists public.dms_folder_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete cascade,
  folder_id uuid not null references public.dms_folders (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  scope public.dms_subscription_scope not null default 'RECURSIVE',
  created_at timestamptz not null default now()
);

create unique index if not exists dms_folder_subscriptions_unique
  on public.dms_folder_subscriptions (folder_id, user_id);
create index if not exists dms_folder_subscriptions_user_idx
  on public.dms_folder_subscriptions (user_id);

comment on table public.dms_folder_subscriptions is
  'Phase C.1 — Notification subscribers. Subscription ≠ permission; silent skip if no VIEW.';

-- =============================================================================
-- 3) updated_at TRIGGERS (re-uses public.set_updated_at from initial_schema)
-- =============================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'dms_folders',
    'dms_documents',
    'dms_document_versions',
    'dms_acl_entries',
    'dms_acl_templates',
    'dms_entity_links'
  ]
  loop
    execute format('drop trigger if exists %I_updated_at on public.%I', t, t);
    execute format(
      'create trigger %I_updated_at before update on public.%I '
      'for each row execute function public.set_updated_at()',
      t, t
    );
  end loop;
end$$;

-- =============================================================================
-- 4) IMMUTABILITY TRIGGERS
-- =============================================================================

-- 4.1 Audit log — block UPDATE/DELETE entirely (INSERT-only)
create or replace function public.dms_audit_log_block_mutations()
returns trigger
language plpgsql
as $$
begin
  raise exception 'dms_audit_log is append-only; % is not permitted', tg_op
    using errcode = '42501';
end;
$$;

drop trigger if exists dms_audit_log_no_update on public.dms_audit_log;
create trigger dms_audit_log_no_update
  before update on public.dms_audit_log
  for each row execute function public.dms_audit_log_block_mutations();

drop trigger if exists dms_audit_log_no_delete on public.dms_audit_log;
create trigger dms_audit_log_no_delete
  before delete on public.dms_audit_log
  for each row execute function public.dms_audit_log_block_mutations();

-- 4.2 Document versions — block UPDATE on immutable columns
-- מאפשר עדכון רק של is_quarantined, archived_at, updated_at (ע"י set_updated_at).
create or replace function public.dms_document_versions_enforce_immutability()
returns trigger
language plpgsql
as $$
begin
  if new.document_id <> old.document_id
     or new.version_number <> old.version_number
     or new.storage_bucket <> old.storage_bucket
     or new.storage_path <> old.storage_path
     or new.mime_type <> old.mime_type
     or new.size_bytes <> old.size_bytes
     or new.checksum_sha256 <> old.checksum_sha256
     or new.original_filename <> old.original_filename
     or coalesce(new.uploaded_by::text, '') <> coalesce(old.uploaded_by::text, '')
     or new.uploaded_at <> old.uploaded_at
     or coalesce(new.change_note, '') <> coalesce(old.change_note, '') then
    raise exception 'dms_document_versions is immutable; only is_quarantined/archived_at may change'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists dms_document_versions_immutability on public.dms_document_versions;
create trigger dms_document_versions_immutability
  before update on public.dms_document_versions
  for each row execute function public.dms_document_versions_enforce_immutability();

-- =============================================================================
-- 5) MONOTONIC version_number (advisory lock per document)
-- =============================================================================
create or replace function public.dms_assign_version_number()
returns trigger
language plpgsql
as $$
declare
  next_n int;
begin
  -- Lock the parent document_id slot. אחר uploads מקבילים ימתינו. לא lock על
  -- documents row עצמה כי שם אסור side-effects.
  perform pg_advisory_xact_lock(hashtext('dms_doc_version:' || new.document_id::text));

  if new.version_number is null or new.version_number = 0 then
    select coalesce(max(version_number), 0) + 1
      into next_n
    from public.dms_document_versions
    where document_id = new.document_id;
    new.version_number := next_n;
  else
    -- אם ה-API שלח version_number מפורש (למשל לבדיקות) — נכבד אבל נוודא monotonic.
    if exists (
      select 1 from public.dms_document_versions
      where document_id = new.document_id and version_number >= new.version_number
    ) then
      raise exception 'version_number must be greater than existing versions for document %',
        new.document_id using errcode = '23505';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists dms_document_versions_assign_number on public.dms_document_versions;
create trigger dms_document_versions_assign_number
  before insert on public.dms_document_versions
  for each row execute function public.dms_assign_version_number();

-- =============================================================================
-- 6) FOLDER path_cache MAINTENANCE
-- =============================================================================
create or replace function public.dms_compute_folder_path(p_folder_id uuid)
returns text
language plpgsql
stable
as $$
declare
  result text := '';
  cur_id uuid := p_folder_id;
  cur_name text;
  cur_parent uuid;
  guard int := 0;
begin
  loop
    if cur_id is null then exit; end if;
    select name, parent_folder_id into cur_name, cur_parent
    from public.dms_folders where id = cur_id;
    if cur_name is null then exit; end if;
    result := case when result = '' then cur_name else cur_name || '/' || result end;
    cur_id := cur_parent;
    guard := guard + 1;
    if guard > 64 then
      raise exception 'dms_folders depth exceeds 64 (cycle?) at %', p_folder_id;
    end if;
  end loop;
  return result;
end;
$$;

create or replace function public.dms_folders_maintain_path_cache()
returns trigger
language plpgsql
as $$
begin
  new.path_cache := public.dms_compute_folder_path(new.id);
  return new;
end;
$$;

drop trigger if exists dms_folders_path_on_insert on public.dms_folders;
create trigger dms_folders_path_on_insert
  before insert on public.dms_folders
  for each row execute function public.dms_folders_maintain_path_cache();

-- כשהאב משתנה או השם משתנה → recalc גם של הצאצאים (statement-level).
create or replace function public.dms_folders_propagate_path_cache()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'UPDATE') and
     (new.parent_folder_id is distinct from old.parent_folder_id
      or new.name is distinct from old.name) then
    -- recursive recalc על כל subtree
    with recursive subtree as (
      select id from public.dms_folders where id = new.id
      union all
      select c.id from public.dms_folders c
        join subtree s on c.parent_folder_id = s.id
    )
    update public.dms_folders f
      set path_cache = public.dms_compute_folder_path(f.id)
    from subtree
    where f.id = subtree.id;
  end if;
  return null;
end;
$$;

drop trigger if exists dms_folders_path_on_update on public.dms_folders;
create trigger dms_folders_path_on_update
  after update on public.dms_folders
  for each row execute function public.dms_folders_propagate_path_cache();

-- =============================================================================
-- 7) ACL ENTRY scope_id VALIDATOR (polymorphic FK)
-- =============================================================================
create or replace function public.dms_acl_entries_validate_scope()
returns trigger
language plpgsql
as $$
begin
  if new.scope_type = 'FOLDER' then
    if not exists (select 1 from public.dms_folders where id = new.scope_id) then
      raise exception 'dms_acl_entries.scope_id % does not match any dms_folders', new.scope_id
        using errcode = '23503';
    end if;
  elsif new.scope_type = 'DOCUMENT' then
    if not exists (select 1 from public.dms_documents where id = new.scope_id) then
      raise exception 'dms_acl_entries.scope_id % does not match any dms_documents', new.scope_id
        using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists dms_acl_entries_validate on public.dms_acl_entries;
create trigger dms_acl_entries_validate
  before insert or update on public.dms_acl_entries
  for each row execute function public.dms_acl_entries_validate_scope();

-- =============================================================================
-- 8) CORE FUNCTION — dms_effective_permissions(document_id, user_id) → text[]
-- =============================================================================
-- Single source of truth ל-RLS, ל-API, ול-Storage policy. מחזירה את ה-UNION של
-- ה-capabilities שמשתמש קיבל על מסמך ספציפי, דרך:
--   (a) ACL ישירה על ה-document
--   (b) ACL ישירה על ה-folder של המסמך
--   (c) ACL inherited מהאבות של ה-folder (עם inherits_to_descendants=true)
--   (d) ACL דרך roles/groups שמשתמש שייך אליהם
--
-- ⚠️ Roles/Groups: אין לנו עדיין user_roles / user_groups tables במערכת.
--    Phase C.1 משאיר אותם כ-no-op ב-(d) — ה-resolution עובד רק עם USER ישיר.
--    כשתיווצר טבלת roles, מעדכנים את ה-CTE כאן בלי לגעת ב-RLS.
--
-- SECURITY DEFINER כדי שגם ב-RLS subquery ניתן יהיה לקרוא — אבל הפונקציה
-- *לא* מסתמכת על auth.uid() פנימית; ה-caller מעביר user_id במפורש.
-- =============================================================================
create or replace function public.dms_effective_permissions(
  p_document_id uuid,
  p_user_id uuid
)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
with
  doc as (
    select id, folder_id, confidentiality_level
    from public.dms_documents
    where id = p_document_id and deleted_at is null
  ),
  -- כל ה-ancestors של ה-folder (כולל הוא עצמו)
  folder_ancestors as (
    with recursive walk as (
      select f.id, f.parent_folder_id, 0 as depth
      from public.dms_folders f
      join doc d on d.folder_id = f.id
      where f.deleted_at is null
      union all
      select f.id, f.parent_folder_id, w.depth + 1
      from public.dms_folders f
      join walk w on w.parent_folder_id = f.id
      where f.deleted_at is null
    )
    select id, depth from walk
  ),
  -- entries ישירים על המסמך
  doc_entries as (
    select e.capabilities
    from public.dms_acl_entries e, doc d
    where e.scope_type = 'DOCUMENT'
      and e.scope_id = d.id
      and e.principal_type = 'USER'
      and e.principal_id = p_user_id::text
      and (e.expires_at is null or e.expires_at > now())
  ),
  -- entries על ה-folder המיידי או על ancestors (אם inherits)
  folder_entries as (
    select e.capabilities
    from public.dms_acl_entries e
    join folder_ancestors fa on fa.id = e.scope_id
    where e.scope_type = 'FOLDER'
      and e.principal_type = 'USER'
      and e.principal_id = p_user_id::text
      and (e.expires_at is null or e.expires_at > now())
      and (fa.depth = 0 or e.inherits_to_descendants = true)
  )
select coalesce(
  array(
    select distinct unnest(capabilities) from (
      select capabilities from doc_entries
      union all
      select capabilities from folder_entries
    ) all_entries
  ),
  array[]::text[]
)
$$;

comment on function public.dms_effective_permissions(uuid, uuid) is
  'Phase C.1 — single source of truth for DMS permission resolution. Used by RLS, API, Storage.';

-- Convenience wrapper — שואל על המשתמש המחובר נוכחי (auth.uid()).
create or replace function public.dms_my_effective_permissions(p_document_id uuid)
returns text[]
language sql
stable
as $$
  select public.dms_effective_permissions(p_document_id, auth.uid())
$$;

-- =============================================================================
-- 9) RLS POLICIES
-- =============================================================================
alter table public.dms_folders               enable row level security;
alter table public.dms_documents             enable row level security;
alter table public.dms_document_versions     enable row level security;
alter table public.dms_acl_entries           enable row level security;
alter table public.dms_acl_templates         enable row level security;
alter table public.dms_entity_links          enable row level security;
alter table public.dms_audit_log             enable row level security;
alter table public.dms_folder_subscriptions  enable row level security;

-- ---- 9.1 dms_folders ---------------------------------------------------------
-- SELECT: יש לפחות document בתוך folder עם VIEW_METADATA, או ACL ישיר על ה-folder.
drop policy if exists dms_folders_select on public.dms_folders;
create policy dms_folders_select on public.dms_folders
  for select to authenticated
  using (
    public.user_has_company_access(company_id) and deleted_at is null and (
      -- ACL ישיר על folder
      exists (
        select 1 from public.dms_acl_entries e
        where e.scope_type = 'FOLDER' and e.scope_id = dms_folders.id
          and e.principal_type = 'USER' and e.principal_id = auth.uid()::text
          and (e.expires_at is null or e.expires_at > now())
          and 'VIEW_METADATA' = any(e.capabilities)
      )
      -- או יש document בתיקייה שעובר effective_permissions
      or exists (
        select 1 from public.dms_documents d
        where d.folder_id = dms_folders.id and d.deleted_at is null
          and 'VIEW_METADATA' = any(public.dms_effective_permissions(d.id, auth.uid()))
      )
      -- או יש sub-folder שיש למשתמש גישה אליו (sticky breadcrumbs)
      or exists (
        with recursive sub as (
          select id from public.dms_folders where parent_folder_id = dms_folders.id and deleted_at is null
          union all
          select f.id from public.dms_folders f join sub on f.parent_folder_id = sub.id
          where f.deleted_at is null
        )
        select 1 from sub
        join public.dms_documents d on d.folder_id = sub.id and d.deleted_at is null
        where 'VIEW_METADATA' = any(public.dms_effective_permissions(d.id, auth.uid()))
      )
    )
  );

-- INSERT: דורש UPLOAD_VERSION על folder האב (יצירת sub-folder = פעולה כתיבתית).
-- root folders (parent IS NULL) דורש role=PROJECT_OWNER — לא נאכף ב-RLS, ה-API יבדוק.
drop policy if exists dms_folders_insert on public.dms_folders;
create policy dms_folders_insert on public.dms_folders
  for insert to authenticated
  with check (
    public.user_has_company_access(company_id) and (
      parent_folder_id is null  -- root creation בידי API role-check
      or exists (
        select 1 from public.dms_acl_entries e
        where e.scope_type = 'FOLDER' and e.scope_id = parent_folder_id
          and e.principal_type = 'USER' and e.principal_id = auth.uid()::text
          and (e.expires_at is null or e.expires_at > now())
          and ('UPLOAD_VERSION' = any(e.capabilities) or 'MANAGE_ACL' = any(e.capabilities))
      )
    )
  );

-- UPDATE: דורש MANAGE_ACL על ה-folder, ולא ניתן לשנות company/project_id.
drop policy if exists dms_folders_update on public.dms_folders;
create policy dms_folders_update on public.dms_folders
  for update to authenticated
  using (
    public.user_has_company_access(company_id) and (
      exists (
        select 1 from public.dms_acl_entries e
        where e.scope_type = 'FOLDER' and e.scope_id = dms_folders.id
          and e.principal_type = 'USER' and e.principal_id = auth.uid()::text
          and (e.expires_at is null or e.expires_at > now())
          and 'MANAGE_ACL' = any(e.capabilities)
      )
    )
  )
  with check (public.user_has_company_access(company_id));

-- DELETE: חסום ב-RLS. soft-delete דרך UPDATE deleted_at; hard-delete service-role only.
-- (D4) — אין policy DELETE → DENY by default.

-- ---- 9.2 dms_documents -------------------------------------------------------
drop policy if exists dms_documents_select on public.dms_documents;
create policy dms_documents_select on public.dms_documents
  for select to authenticated
  using (
    public.user_has_company_access(company_id) and deleted_at is null and
    'VIEW_METADATA' = any(public.dms_effective_permissions(id, auth.uid()))
  );

drop policy if exists dms_documents_insert on public.dms_documents;
create policy dms_documents_insert on public.dms_documents
  for insert to authenticated
  with check (
    public.user_has_company_access(company_id) and exists (
      select 1 from public.dms_acl_entries e
      where e.scope_type = 'FOLDER' and e.scope_id = folder_id
        and e.principal_type = 'USER' and e.principal_id = auth.uid()::text
        and (e.expires_at is null or e.expires_at > now())
        and 'UPLOAD_VERSION' = any(e.capabilities)
    )
  );

drop policy if exists dms_documents_update on public.dms_documents;
create policy dms_documents_update on public.dms_documents
  for update to authenticated
  using (
    public.user_has_company_access(company_id) and (
      'MANAGE_ACL' = any(public.dms_effective_permissions(id, auth.uid()))
      or 'UPLOAD_VERSION' = any(public.dms_effective_permissions(id, auth.uid()))
    )
  )
  with check (public.user_has_company_access(company_id));

-- DELETE: דורש DELETE capability + לא SECRET (D4).
drop policy if exists dms_documents_delete on public.dms_documents;
create policy dms_documents_delete on public.dms_documents
  for delete to authenticated
  using (
    public.user_has_company_access(company_id)
    and confidentiality_level <> 'SECRET'
    and 'DELETE' = any(public.dms_effective_permissions(id, auth.uid()))
  );

-- ---- 9.3 dms_document_versions ----------------------------------------------
-- SELECT: דרך JOIN ל-document (אם יש לך VIEW_METADATA על ה-document → רואה גם versions).
drop policy if exists dms_document_versions_select on public.dms_document_versions;
create policy dms_document_versions_select on public.dms_document_versions
  for select to authenticated
  using (
    exists (
      select 1 from public.dms_documents d
      where d.id = dms_document_versions.document_id and d.deleted_at is null
        and public.user_has_company_access(d.company_id)
        and 'VIEW_METADATA' = any(public.dms_effective_permissions(d.id, auth.uid()))
    )
  );

drop policy if exists dms_document_versions_insert on public.dms_document_versions;
create policy dms_document_versions_insert on public.dms_document_versions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.dms_documents d
      where d.id = dms_document_versions.document_id and d.deleted_at is null
        and public.user_has_company_access(d.company_id)
        and 'UPLOAD_VERSION' = any(public.dms_effective_permissions(d.id, auth.uid()))
    )
  );

-- UPDATE: ה-trigger immutability יחסום שינוי על immutable cols.
-- ה-policy מאפשרת רק למי שיש לו UPLOAD_VERSION (לעדכן is_quarantined/archived_at).
drop policy if exists dms_document_versions_update on public.dms_document_versions;
create policy dms_document_versions_update on public.dms_document_versions
  for update to authenticated
  using (
    exists (
      select 1 from public.dms_documents d
      where d.id = dms_document_versions.document_id
        and public.user_has_company_access(d.company_id)
        and 'UPLOAD_VERSION' = any(public.dms_effective_permissions(d.id, auth.uid()))
    )
  )
  with check (true);

-- DELETE: חסום ב-RLS (גרסאות נשמרות לנצח; archived_at הוא ה-soft signal).

-- ---- 9.4 dms_acl_entries -----------------------------------------------------
-- SELECT: principal יכול לראות entries שלו, או מי שיש לו MANAGE_ACL על ה-scope.
drop policy if exists dms_acl_entries_select on public.dms_acl_entries;
create policy dms_acl_entries_select on public.dms_acl_entries
  for select to authenticated
  using (
    public.user_has_company_access(company_id) and (
      -- הוא ה-principal עצמו
      (principal_type = 'USER' and principal_id = auth.uid()::text)
      -- או יש לו MANAGE_ACL על ה-scope
      or (scope_type = 'DOCUMENT' and exists (
        select 1 from public.dms_documents d
        where d.id = scope_id
          and 'MANAGE_ACL' = any(public.dms_effective_permissions(d.id, auth.uid()))
      ))
      or (scope_type = 'FOLDER' and exists (
        select 1 from public.dms_acl_entries e2
        where e2.scope_type = 'FOLDER' and e2.scope_id = dms_acl_entries.scope_id
          and e2.principal_type = 'USER' and e2.principal_id = auth.uid()::text
          and 'MANAGE_ACL' = any(e2.capabilities)
          and (e2.expires_at is null or e2.expires_at > now())
      ))
    )
  );

-- INSERT/UPDATE/DELETE: דורש MANAGE_ACL על ה-scope.
-- (משתמשים ב-policy אחת לכל write פשטות; ה-trigger validator מאמת scope_id.)
drop policy if exists dms_acl_entries_write on public.dms_acl_entries;
create policy dms_acl_entries_write on public.dms_acl_entries
  for all to authenticated
  using (
    public.user_has_company_access(company_id) and (
      (scope_type = 'DOCUMENT' and exists (
        select 1 from public.dms_documents d
        where d.id = scope_id
          and 'MANAGE_ACL' = any(public.dms_effective_permissions(d.id, auth.uid()))
      ))
      or (scope_type = 'FOLDER' and exists (
        select 1 from public.dms_acl_entries e2
        where e2.scope_type = 'FOLDER' and e2.scope_id = dms_acl_entries.scope_id
          and e2.principal_type = 'USER' and e2.principal_id = auth.uid()::text
          and 'MANAGE_ACL' = any(e2.capabilities)
          and (e2.expires_at is null or e2.expires_at > now())
      ))
    )
  )
  with check (public.user_has_company_access(company_id));

-- ---- 9.5 dms_acl_templates ---------------------------------------------------
-- SELECT: כל מי שיש לו גישה לחברה רואה (templates זה nivel ניהולי שקוף).
drop policy if exists dms_acl_templates_select on public.dms_acl_templates;
create policy dms_acl_templates_select on public.dms_acl_templates
  for select to authenticated
  using (public.user_has_company_access(company_id) and deleted_at is null);

-- INSERT/UPDATE/DELETE: ה-API יבדוק role=COMPANY_ADMIN/PROJECT_OWNER.
-- ב-RLS — מספיק company access כדי לא לחסום legitimate uses.
drop policy if exists dms_acl_templates_write on public.dms_acl_templates;
create policy dms_acl_templates_write on public.dms_acl_templates
  for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- ---- 9.6 dms_entity_links ----------------------------------------------------
drop policy if exists dms_entity_links_select on public.dms_entity_links;
create policy dms_entity_links_select on public.dms_entity_links
  for select to authenticated
  using (
    public.user_has_company_access(company_id) and exists (
      select 1 from public.dms_documents d
      where d.id = document_id and d.deleted_at is null
        and 'VIEW_METADATA' = any(public.dms_effective_permissions(d.id, auth.uid()))
    )
  );

drop policy if exists dms_entity_links_write on public.dms_entity_links;
create policy dms_entity_links_write on public.dms_entity_links
  for all to authenticated
  using (
    public.user_has_company_access(company_id) and exists (
      select 1 from public.dms_documents d
      where d.id = document_id
        and 'LINK_ENTITY' = any(public.dms_effective_permissions(d.id, auth.uid()))
    )
  )
  with check (public.user_has_company_access(company_id));

-- ---- 9.7 dms_audit_log -------------------------------------------------------
-- SELECT: actor רואה פעולות של עצמו תמיד; אחרת — דורש VIEW_METADATA על ה-target.
-- (role=SECURITY_AUDITOR ייחשף ב-Phase C.4 עם override בקוד service-role.)
drop policy if exists dms_audit_log_select on public.dms_audit_log;
create policy dms_audit_log_select on public.dms_audit_log
  for select to authenticated
  using (
    public.user_has_company_access(company_id) and (
      -- actor של עצמו
      (actor_type = 'USER' and actor_id = auth.uid()::text)
      -- או יש VIEW_METADATA על ה-target document
      or (target_type = 'DOCUMENT' and exists (
        select 1 from public.dms_documents d
        where d.id = target_id
          and 'VIEW_METADATA' = any(public.dms_effective_permissions(d.id, auth.uid()))
      ))
      -- target version → דרך document שלו
      or (target_type = 'VERSION' and exists (
        select 1 from public.dms_document_versions v
        join public.dms_documents d on d.id = v.document_id
        where v.id = target_id
          and 'VIEW_METADATA' = any(public.dms_effective_permissions(d.id, auth.uid()))
      ))
    )
  );

-- INSERT: רק service-role. authenticated → DENY.
drop policy if exists dms_audit_log_insert_blocked on public.dms_audit_log;
create policy dms_audit_log_insert_blocked on public.dms_audit_log
  for insert to authenticated
  with check (false);

-- ---- 9.8 dms_folder_subscriptions --------------------------------------------
drop policy if exists dms_folder_subscriptions_select on public.dms_folder_subscriptions;
create policy dms_folder_subscriptions_select on public.dms_folder_subscriptions
  for select to authenticated
  using (
    public.user_has_company_access(company_id) and user_id = auth.uid()
  );

drop policy if exists dms_folder_subscriptions_write on public.dms_folder_subscriptions;
create policy dms_folder_subscriptions_write on public.dms_folder_subscriptions
  for all to authenticated
  using (public.user_has_company_access(company_id) and user_id = auth.uid())
  with check (public.user_has_company_access(company_id) and user_id = auth.uid());

-- =============================================================================
-- 10) SERVICE ROLE GRANTS (עוקף RLS ל-workers/agents)
-- =============================================================================
grant select, insert, update, delete on
  public.dms_folders,
  public.dms_documents,
  public.dms_document_versions,
  public.dms_acl_entries,
  public.dms_acl_templates,
  public.dms_entity_links,
  public.dms_folder_subscriptions
to authenticated;

grant select on public.dms_audit_log to authenticated;

grant all on
  public.dms_folders,
  public.dms_documents,
  public.dms_document_versions,
  public.dms_acl_entries,
  public.dms_acl_templates,
  public.dms_entity_links,
  public.dms_audit_log,
  public.dms_folder_subscriptions
to service_role;

grant execute on function public.dms_effective_permissions(uuid, uuid) to authenticated, service_role;
grant execute on function public.dms_my_effective_permissions(uuid) to authenticated;
grant execute on function public.dms_compute_folder_path(uuid) to authenticated, service_role;

-- =============================================================================
-- 11) STORAGE BUCKETS (idempotent inserts)
-- =============================================================================
-- מסומנים כ-private (public=false). policies מפורטות על storage.objects יוקמו ב-C.1.c
-- (תלויים בפונקציה dms_effective_permissions שהוגדרה כאן).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('project-dms', 'project-dms', false, 262144000, null),                  -- 250MB default
  ('project-dms-restricted', 'project-dms-restricted', false, 262144000, null),
  ('dms-audit-archive', 'dms-audit-archive', false, null, null),
  ('dms-zip-exports', 'dms-zip-exports', false, null, null)
on conflict (id) do nothing;

-- =============================================================================
-- End — Phase C.1 Foundations.
-- Next:
--   C.1.b — backfill script: public.project_documents → DMS tables (idempotent)
--   C.1.c — storage.objects RLS policies (read+write per bucket via dms_effective_permissions)
--   C.2   — UI + upload flow + Resend integration
-- =============================================================================
