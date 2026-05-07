# Project DMS — High-Level Design (Phase C Architecture Proposal)

> **Status:** ✅ Approved 2026-05-07. כל ההחלטות D1–D8 סגורות (§ 8). זהו מסמך ה-HLD; ה-DDL המפורט יושב ב-Phase C.1 migration.
>
> **Owner:** Architect-on-call
> **Created:** 2026-05-07
> **Audience:** מנהלי פרויקטים, אנשי שטח, איש רכש, סמנכ"ל כספים, מנכ"ל
> **Sibling docs:**
> - `@c:\Users\user\Desktop\smart-building-os\docs\integrations\pdf-intelligence-engine-plan.md` — מזין DMS דרך uploads מסווגים אוטומטית
> - `@c:\Users\user\Desktop\smart-building-os\docs\architecture\supplier-card-spec.md` — sibling pattern ל-attachments פר ישות

---

## 0. נקודת מוצא ו-non-negotiables

### 0.1 מה כבר קיים (חובה לא להחליף)
| Asset | מצב | מקור |
|---|---|---|
| `public.project_documents` | live | `@c:\Users\user\Desktop\smart-building-os\supabase\migrations\20260416120000_project_execution_sites_media_logs.sql` |
| Versioning שטוח (`version_group_id`/`version_number`/`is_current`) | live | אותה migration |
| Hierarchy (`parent_document_id`/`is_folder`/`vault_folder_key`) | live | `20260418120500_project_documents_vault_folders.sql` |
| RLS company-scoped דרך header `x-company-id` | live | `20260627170100_fix_project_documents_schema.sql` |
| Vault bootstrap (default folders) | live | `@c:\Users\user\Desktop\smart-building-os\lib\marker-ofek\wbs-plan-link-actions.ts` |
| Contract vault UI | live | `/marker-ofek/finance/contract-vault` |

> **חוזה אבולוציה:** ה-DMS *עוטף* את `project_documents`, מוסיף 8 טבלאות סביבה, ומרפא 3 חולשות יסודיות.

### 0.2 חולשות מהותיות שנדרש לרפא
1. **Versioning שטוח** — כל גרסה היא שורה נפרדת ב-`project_documents`. ACL לא יכול להיצמד למסמך לוגי.
2. **RLS חלש** — מבודד חברות אבל לא "סודי בתוך החברה".
3. **אפס audit-trail** — דרישה משפטית של הלקוח.

### 0.3 Out of scope ל-Phase C (deferred)
- E-signature flow → Phase D
- OCR / full-text search על תוכן PDF → דרך **PDF Intelligence Engine** (sibling)
- Watermarking דינמי → Phase D
- Mobile native → נשאר PWA
- Cross-project sharing → Phase D

---

## 1. בעלי עניין ו-Use Cases

| Persona | Top use cases |
|---|---|
| **מנהל פרויקט** | פתיחת תיקיות, העלאת תוכניות → התראה אוטומטית, צפייה ב-audit, סגירת פרויקט עם export ZIP |
| **איש שטח** | צילום תעודת משלוח מהמובייל → upload + linking ל-PO. צפייה בלבד בתוכניות. |
| **סמנכ"ל כספים** | גישה לכל החוזים והחשבוניות (read-all). snapshot סוף-חודש לרו"ח. |
| **מנכ"ל** | גישה מלאה. צפייה ב-audit כראיה משפטית. |
| **קבלן משנה (חיצוני)** | גישה לתת-תיקיה אחת בלבד (read+upload, ללא delete). |
| **AI agents** | קריאה דרך service-role; **כל פעולה נרשמת ב-audit עם `actor_type=AGENT`**. |

---

## 2. סכימת מסד הנתונים (Logical Model)

### 2.1 ERD (טקסט)

```
                       ┌────────────────────┐
                       │ projects (existing)│
                       └─────────┬──────────┘
                                 │ 1:N
                                 ▼
   ┌────────────────────┐   ┌──────────────────────┐    ┌──────────────────────┐
   │ dms_folders        │◀──│ dms_documents        │───▶│ dms_document_versions│
   │  (hierarchy tree)  │   │  (logical doc)       │ 1:N│  (physical files)    │
   └─────────┬──────────┘   └──────────┬───────────┘    └──────────┬───────────┘
             │ N:M                      │ N:M                       │
             │                          │                           │ 1:N
             ▼                          ▼                           ▼
   ┌────────────────────┐   ┌──────────────────────┐    ┌──────────────────────┐
   │ dms_acl_entries    │   │ dms_entity_links     │    │ dms_audit_log        │
   │ (RBAC + ABAC)      │   │ (poly link to ERP)   │    │ (immutable)          │
   └─────────┬──────────┘   └──────────────────────┘    └──────────────────────┘
             │
             ▼
   ┌────────────────────┐   ┌──────────────────────┐
   │ dms_acl_templates  │   │ dms_folder_subs      │
   │ (default ACL bundle│   │ (instant notif list) │
   └────────────────────┘   └──────────────────────┘
```

### 2.2 Tables — מפרט תמציתי

#### 2.2.1 `dms_folders` — עץ תיקיות פרויקט
| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `company_id` | text | tenant scope |
| `project_id` | uuid → `projects.id` | cascade delete |
| `parent_folder_id` | uuid NULL self-FK | NULL = root |
| `name` | text ≤ 200 | |
| `path_cache` | text | denormalized "Plans/Floor 7/Electrical" — מעודכן בטריגר |
| `kind` | enum `STANDARD\|SYSTEM\|EXTERNAL_PARTNER` | SYSTEM = vault default, אסור למחיקה |
| `vault_folder_key` | text NULL | תאימות אחורה |
| `default_acl_template_id` | uuid NULL → `dms_acl_templates` | יורש מהאב אם NULL |
| `deleted_at` | timestamptz NULL | soft-delete |
| audit cols | | |

- Unique `(project_id, parent_folder_id, lower(name))` (where `deleted_at IS NULL`).

#### 2.2.2 `dms_documents` — מסמך לוגי (header)
| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `company_id`, `project_id` | tenant + project | |
| `folder_id` | uuid → `dms_folders` NOT NULL | |
| `title` | text | default = filename של גרסה ראשונה |
| `document_kind` | enum `PLAN\|PERMIT\|CERTIFICATE\|CONTRACT\|INVOICE\|DELIVERY_NOTE\|CORRESPONDENCE\|PHOTO\|OTHER` | |
| `current_version_id` | uuid NULL → `dms_document_versions` | pointer ל-"is_current" — נקי יותר מ-flag פר שורה |
| `confidentiality_level` | enum `PUBLIC\|INTERNAL\|RESTRICTED\|SECRET` | משפיע על default policy + bucket |
| `tags` | text[] | חיפוש |
| `metadata` | jsonb | |
| `legacy_project_documents_id` | uuid NULL | מיפוי דו-כיווני להגירה |
| `deleted_at` | timestamptz NULL | soft-delete |
| audit cols | | |

> **המפתח:** ACL נצמד לכאן. החלפת גרסה לא מאבדת הרשאות. `confidentiality_level` change → audit חובה.

#### 2.2.3 `dms_document_versions` — גרסה פיזית (immutable)
| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `document_id` | uuid → `dms_documents` cascade | |
| `version_number` | int | auto-increment per `document_id` (advisory lock) |
| `storage_bucket` | text | `project-dms` או `project-dms-restricted` |
| `storage_path` | text | unique per bucket |
| `mime_type`, `size_bytes`, `checksum_sha256`, `original_filename` | | |
| `uploaded_by` | uuid → `auth.users` | |
| `uploaded_at` | timestamptz | |
| `change_note` | text NULL | |
| `is_quarantined` | bool | true עד AV scan נקי |
| `archived_at` | timestamptz NULL | retention hook |

- Trigger BEFORE UPDATE שחוסם שינוי על `storage_path`/`checksum_sha256`/`size_bytes`. רק `is_quarantined` ו-`archived_at` ניתנים לעדכון.
- Unique `(document_id, version_number)` + advisory lock על `document_id` בעת INSERT → version_number הבא יציב.

#### 2.2.4 `dms_acl_entries` — RBAC + ABAC (D1: hybrid + templates)
| Field | Type | Notes |
|---|---|---|
| `id`, `company_id` | | |
| `scope_type` | enum `FOLDER\|DOCUMENT` | |
| `scope_id` | uuid | FK פולימורפי |
| `principal_type` | enum `USER\|ROLE\|GROUP\|EXTERNAL_EMAIL` | |
| `principal_id` | text | uuid למשתמש/קבוצה, slug ל-role, email לחיצוני |
| `capabilities` | text[] | תת-קבוצה של: `VIEW_METADATA`, `VIEW_CONTENT`, `DOWNLOAD`, `UPLOAD_VERSION`, `DELETE`, `MANAGE_ACL`, `LINK_ENTITY` |
| `inherits_to_descendants` | bool default true | |
| `expires_at` | timestamptz NULL | חיוני לקבלן משנה |
| `granted_by`, `granted_at` | audit | |

> **D2 — DENY entries:** דחויים ל-Phase C.2. כרגע **deny by default**: בלי entry מתאים → אין capability.

**Effective permission resolution (פונקציה Postgres):**
1. אסוף entries שתופסים את (user, document):
   - direct על document
   - direct על folder של document
   - inherited מהאבות עם `inherits_to_descendants=true`
   - דרך roles/groups שמשתמש שייך אליהם
2. UNION של ה-`capabilities`.
3. סנן entries עם `expires_at <= now()`.
4. ריק → DENY by default.
5. הפונקציה `dms_effective_permissions(document_id, user_id) → text[]` נחשפת ל-RLS, ל-API, ול-Storage policy. **Single source of truth.**

#### 2.2.5 `dms_acl_templates` — תבניות הרשאה (D7: company-level + project override)
| Field | Type | Notes |
|---|---|---|
| `id`, `company_id` | | |
| `name`, `description` | | |
| `scope` | enum `COMPANY\|PROJECT` | |
| `project_id` | uuid NULL | מולא רק כש-`scope=PROJECT` |
| `entries_json` | jsonb | array של (principal, capabilities, inherits) |
| `applies_to_kinds` | text[] | suggest auto-apply ל-`document_kind` תואם |

- חישוב default ACL לתיקייה חדשה: project-level template > company-level template (precedence).

#### 2.2.6 `dms_entity_links` — חיבור פולימורפי ל-ERP
| Field | Type | Notes |
|---|---|---|
| `id`, `company_id` | | |
| `document_id` | uuid → `dms_documents` | |
| `entity_type` | enum `PROJECT\|BOQ_ITEM\|PURCHASE_ORDER\|PO_LINE\|GOODS_RECEIPT\|VENDOR_INVOICE\|SUPPLIER\|CONTRACT\|WBS_TASK` | |
| `entity_id` | text | uuid או business id |
| `link_role` | text NULL | `ATTACHMENT\|SOURCE_OF_TRUTH\|EVIDENCE` |
| `link_confidence` | numeric NULL 0..1 | מ-AI |
| `is_orphan` | bool default false | מקור נמחק → orphan, לא break |
| audit cols | | |

#### 2.2.7 `dms_audit_log` — immutable trail
| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `company_id`, `project_id` (NULL ok) | | |
| `actor_type` | enum `USER\|SERVICE\|AGENT\|EXTERNAL` | |
| `actor_id` | text | uuid למשתמש; "ai-procurement-copilot" לסוכן; email לחיצוני |
| `action` | enum (16 ערכים — ראה DDL) | |
| `target_type` | enum `FOLDER\|DOCUMENT\|VERSION\|ACL_ENTRY\|LINK` | |
| `target_id` | uuid | |
| `result` | enum `SUCCESS\|DENIED\|ERROR\|PENDING_SCAN` | |
| `denied_reason`, `ip_address`, `user_agent`, `request_id` | | |
| `metadata` | jsonb | old/new diffs |
| `occurred_at` | timestamptz | NOT NULL, default now() |

- BEFORE UPDATE/DELETE trigger זורק exception. INSERT-only.
- Retention 7 שנים. Snapshot חודשי ל-`dms-audit-archive` bucket כ-Parquet.

#### 2.2.8 `dms_folder_subscriptions` — רשימת תפוצה להתראות (D5: instant default)
| Field | Type | Notes |
|---|---|---|
| `id`, `company_id` | | |
| `folder_id` | uuid → `dms_folders` | |
| `user_id` | uuid → `auth.users` | |
| `scope` | enum `ROOT\|RECURSIVE` | |
| `created_at` | | |

- Subscription ≠ permission. אם אין VIEW_METADATA → silent skip בשליחת מייל.

### 2.3 שינויים ב-tables קיימות
| Table | שינוי |
|---|---|
| `project_documents` | אין שינוי schema. `legacy_project_documents_id` ב-`dms_documents` משמר מיפוי דו-כיווני להגירה. |
| `projects`, `auth.users` | אין שינוי. |

### 2.4 Migration plan מ-`project_documents` (Phase C.1.b–e)
1. **C.1.a (additive):** create כל 8 הטבלאות. אין מחיקת data.
2. **C.1.b (backfill):** script idempotent. כל row של `is_folder=true` → `dms_folders`. כל row של `is_folder=false` → `dms_documents` + ראשון `dms_document_versions`.
3. **C.1.c (read-through cutover):** API חדש קורא DMS. legacy contract-vault ממשיך מ-`project_documents`.
4. **C.1.d (write cutover):** uploads חדשים כותבים ל-DMS בלבד; trigger מירור על `project_documents` שומר תאימות.
5. **C.1.e (sunset):** `project_documents` ל-read-only; אחרי 30 יום ללא קריאות → deprecated ב-`docs/SYSTEM_INDEX.md`.

---

## 3. אסטרטגיית Storage

### 3.1 Buckets — split by sensitivity
| Bucket | תוכן | Access |
|---|---|---|
| `project-dms` | רוב הקבצים | private, RLS דרך `dms_effective_permissions` |
| `project-dms-restricted` | `confidentiality=SECRET` | private, signed URL בלבד, **MFA חובה** ב-policy |
| `dms-audit-archive` | snapshots חודשיים | service-role only |
| `dms-zip-exports` | תוצרי "ארוז פרויקט" | signed URL TTL 24h, מחיקה אחרי 7 ימים |

מעבר sensitivity → background worker מעביר versions בין buckets אטומית (RPC) + audit `CONFIDENTIALITY_CHANGED`.

### 3.2 Path schema
```
{company_id}/{project_id}/{document_id}/v{version_number}/{filename_normalized}
```
- `company_id` ראשון → policy ב-Storage layer גם אם DB נופל
- `document_id` ולא `folder_id` → תיקיות וירטואליות, מעבר תיקייה לא משבר נתיבים
- `filename_normalized` = transliterated slug. השם המקורי ב-`original_filename`

### 3.3 Limits & validation
- Max 250MB default (configurable ב-`erp_md_company_settings`).
- MIME whitelist (PDF/DOCX/XLSX/JPG/PNG/DWG/DXF/MP4≤100MB).
- Signed POST URL עם conditions (size + content-type) — frontend לא יכול לעקוף.
- `checksum_sha256` client-side. duplicate נדחה לפני upload.
- Integrity job nightly: HEAD על Storage מול checksum ב-DB.

### 3.4 Retention
- גרסאות ישנות נשארות. `archived_at` מסמן ל-UI להסתיר; הקובץ נשאר.
- **D4:** soft-delete בלבד למשתמשים רגילים. **Hard-delete רק לאדמין מערכת אחרי dialog אישור מפורש.** אסטרטגיית 90 יום אוטומטית — נדחית.

---

## 4. אסטרטגיית אבטחה ו-RLS

### 4.1 שלוש שכבות הגנה
```
Layer 1 — API route:    Auth (JWT) + Zod + rate-limit + CSRF + origin
Layer 2 — Postgres RLS: tenant scope + dms_effective_permissions()
Layer 3 — Storage policy: same DB function + signed URLs (TTL 5min view, 60min download)
```
Redundancy מכוונת. עקיפת layer אחד נחסמת בשני.

### 4.2 RLS Policies
**`dms_documents`:**
- SELECT: `'VIEW_METADATA' = ANY(dms_effective_permissions(id, auth.uid()))` — `SECRET` בלי ACL לא יופיע גם ב-list של folder
- INSERT: `'UPLOAD_VERSION'` על folder
- UPDATE: trigger validator לפי עמודה — title/tags = `UPLOAD_VERSION`, confidentiality = `MANAGE_ACL`
- DELETE: `'DELETE'` + `confidentiality_level <> 'SECRET'` (סודי דרך service-role בלבד)

**`dms_document_versions`:** SELECT דרך JOIN ל-documents בלבד (אין policy עצמאית). INSERT דורש `UPLOAD_VERSION`. UPDATE חסום פרט ל-`is_quarantined`/`archived_at`.

**`dms_audit_log`:** SELECT — מנהל פרויקט רואה audit על מסמכים שיש לו ACL; מנכ"ל / `SECURITY_AUDITOR` רואה הכל; אחרים רק `actor_id = auth.uid()`. INSERT — service-role בלבד (`with check (false)` ל-authenticated). UPDATE/DELETE — חסום מוחלט.

**`dms_acl_entries`:** SELECT — entries שאתה ה-principal שלהם או שיש לך `MANAGE_ACL` על scope. INSERT/UPDATE/DELETE — דורש `MANAGE_ACL`.

**`dms_folders`:** SELECT — קיים לפחות document אחד שעליו יש לך `VIEW_METADATA` **או** `'VIEW_METADATA'/'UPLOAD_VERSION'/'MANAGE_ACL'` ישיר על folder.

### 4.3 Storage policies — same source of truth
ב-`project-dms` policy: *"GRANT SELECT אם קיים row ב-`dms_document_versions` עם `storage_path = name` שעובר `'DOWNLOAD' = ANY(dms_effective_permissions(document_id, auth.uid()))`"*.

ב-`project-dms-restricted` policy בנוסף: `auth.jwt() ->> 'mfa' = 'true'`.

### 4.4 Upload pipeline security
- Signed POST URL עם conditions (cliente לא נוגע ב-service-role).
- **Quarantine:** העלאה → staging → AV scan async → אם נקי, copy ל-production + `is_quarantined=false`. אם זוהה — מחיקה + audit DENIED.
- MIME enforcement כפול: Storage `allowed_mime_types` + DB trigger שמשווה mime ל-extension.

### 4.5 קבלן משנה (D8: Magic Link בלבד ב-Phase C)
- Principal `EXTERNAL_EMAIL`, אין user record ב-`auth.users`.
- ACL חובה עם `expires_at`.
- Magic-link דרך Resend עם JWT חתום (`aud=external`, `email`, `acl_entry_id`, `exp`).
- Middleware נפרד מפענח JWT הזה. כל פעולה תחת `actor_type=EXTERNAL` ב-audit.
- אסור list של folder — חייב ACL מפורש לכל doc.

### 4.6 GDPR
מחיקת user → `actor_id` ב-audit הופך ל-`anonymized:<hash>`. שומר את הפעולה, מוחק זיהוי אישי.

---

## 5. תרשים זרימה — העלאת קובץ חדש

```
┌────────┐ ┌─────────┐ ┌────────┐ ┌─────────┐ ┌────────┐ ┌────────┐
│ Browser│ │API route│ │Postgres│ │ Storage │ │AV scan │ │Resend  │
└────┬───┘ └────┬────┘ └───┬────┘ └────┬────┘ └────┬───┘ └────┬───┘
     │          │          │           │           │          │
 1.  │ select file → compute SHA256 client-side
     ├─────────▶│
 2.  │ POST /api/dms/uploads/initiate {folder_id, name, mime, size, sha256}
     │          ├─ auth + Zod + rate-limit
     │          ├─────────▶│ Tx start
     │          │          │ INSERT dms_documents (if new)
     │          │          │ INSERT dms_document_versions (is_quarantined=true)
     │          │          │ RLS check: UPLOAD_VERSION? (DENY → ❌)
     │          │          │ COMMIT
     │          │ create signed POST URL → staging bucket (TTL 5min)
     │          │                       ───────────▶│
 3.  │◀── 200 {versionId, signedUploadUrl, fields, expiresAt}
 4.  │ PUT signed URL with binary ───────────────▶│
     │◀── 200 ─────────────────────────────────────┤
 5.  │ POST /api/dms/uploads/{versionId}/finalize
     │          ├─ HEAD storage → verify size + sha256
     │          ├─ enqueue AV scan job ─────────────────────────▶│
     │          ├─ INSERT audit: UPLOAD_VERSION result=PENDING_SCAN
     │◀── 202 {versionId, status=SCANNING}
 6.  │          │            │                     │ scan ok ──┘
     │          │            │ COPY staging→production
     │          │            │◀────────────────────┤
     │          │ worker: UPDATE versions SET is_quarantined=false
     │          │         UPDATE documents SET current_version_id=...
 7.  │          │ resolve recipients (D5: instant):
     │          │   - users עם VIEW_METADATA on document
     │          │   - subscribers של folder (RECURSIVE/ROOT)
     │          │   - linked-entity owners
     │          ├─ enqueue email batch ────────────────────────▶│ send
     │          ├─ INSERT audit: NOTIFICATIONS_SENT
 8.  │ Realtime push → channel `project:{id}:dms`
     │◀── UI updates timeline + toast
```

### Failure modes (must-be-designed-for)
| Failure | Behavior |
|---|---|
| Browser killed אחרי שלב 2 | Version row `is_quarantined=true`. Job nightly מארכיב לא-finalized תוך 24h. |
| Storage upload נכשל | Finalize HEAD נכשל → API 410, version=ERROR, UI "העלה מחדש". |
| AV positive | `is_quarantined=true` קבוע, audit DENIED `denied_reason=av_positive`, אין מייל. |
| Resend down | Email queue ב-`ai_jobs` עם retry exponential backoff. ה-upload מצליח. |
| Race בין שני uploads | Unique `(document_id, version_number)` + advisory lock. |
| ACL revoke בזמן download | בקשה הבאה → 403 מ-Storage; download שכבר זורם ממשיך. |

---

## 6. פיצ'רים נלווים (high-level)

### 6.1 ZIP packaging (סגירת פרויקט)
- API: `POST /api/dms/projects/{id}/export`. background worker (50GB אפשרי).
- בורר רק `current_version` (אלא אם `include_history=true`).
- מסונן ע"י ACL של ה-requester.
- כתיבה ל-`dms-zip-exports` עם TTL 24h. signed URL במייל.
- audit `EXPORT_ZIP` עם רשימת `version_id`s שנכללו (immutable evidence).

### 6.2 Versioning rollback (D3: revert = new version copy)
- "Revert to v3" → INSERT new version_number = N+1 עם storage_path משוכפל מ-v3 + `change_note='Reverted from v3'`.
- שומר monotonic version_number. audit נקי. ה-storage object של v3 מועתק (לא reference) כדי לשמור על immutability.

### 6.3 Linking flow (BOQ → File)
- מתוך BOQ: "צרף מסמך" → modal עם documents של הפרויקט. INSERT ל-`dms_entity_links`.
- AI agent (PDF Intelligence Engine) יוצר links עם `link_confidence` אוטומטית.

---

## 7. תאימות לארכיטקטורה הקיימת
| Concern | Alignment |
|---|---|
| Tenant model | `company_id text` תואם `erp_*` |
| RLS helper | `user_has_company_access(text)` מנוצל מחדש |
| Updated_at | `public.set_updated_at()` מנוצל מחדש |
| Audit precedent | `erp_ai_audit_log` קיים; DMS דורש schema עשיר → טבלה נפרדת |
| Storage precedent | `site-media` bucket קיים — DMS מוסיף 4 buckets |
| AI agents | service-role + audit חובה עם `actor_type=AGENT` |

---

## 8. החלטות (D1–D8) — APPROVED 2026-05-07
| # | Decision | החלטת לקוח |
|---|---|---|
| **D1** | מודל ACL | ✅ **Hybrid עם templates** |
| **D2** | DENY entries | ✅ **דחוי ל-Phase C.2.** כרגע deny by default בלבד |
| **D3** | Versioning rollback | ✅ **Revert = עותק → גרסה חדשה בראש העץ (monotonic)** |
| **D4** | מחיקה פיזית | ✅ **Soft-delete למשתמשים. Hard-delete רק לאדמין מערכת אחרי אזהרה. אין auto-90d.** |
| **D5** | Email batching | ✅ **Default מיידי (Instant)** |
| **D6** | חתימה דיגיטלית | ✅ **Out of scope ל-Phase C** |
| **D7** | Default ACL templates | ✅ **חברה + override פר פרויקט** |
| **D8** | Subcontractor login | ✅ **Magic Link בלבד ב-Phase C** |

---

## 9. Phasing post-approval

- **C.1 — Foundations (1.5 שבועות):** 8 טבלאות + enums + RLS + buckets + `dms_effective_permissions`. אין UI. Acceptance: RLS tests ירוקים.
- **C.2 — Core UI + Upload (1.5 שבועות):** browse + upload + version pick + Resend + Realtime.
- **C.3 — ACL Management UI (1 שבוע):** templates + per-doc grants + external principal flow.
- **C.4 — Audit Viewer + ZIP Export (1 שבוע):** evidence-grade exports.
- **C.5 — Backfill + Sunset (3-5 ימים):** הגירה מ-`project_documents` + cutover.

---

## נספח A — מילון מונחים
| מונח | הגדרה |
|---|---|
| **Document** | יישות לוגית עם metadata, ACL, ולפחות גרסה אחת |
| **Version** | קובץ פיזי אחד ב-Storage, immutable, שייך ל-document |
| **Folder** | רשומת ניווט; אינה מכילה קבצים פיזית |
| **ACL Entry** | זוג (principal, capabilities) על scope |
| **Capability** | פעולה אטומית: VIEW_METADATA \| VIEW_CONTENT \| DOWNLOAD \| UPLOAD_VERSION \| DELETE \| MANAGE_ACL \| LINK_ENTITY |
| **Confidentiality** | PUBLIC / INTERNAL / RESTRICTED / SECRET |
| **Effective permissions** | תוצר אגרגציה של ACL entries דרך roles + groups + inheritance |
| **Magic link** | JWT חתום עם `aud=external` שמאפשר לקבלן משנה גישה זמנית ללא user record |
