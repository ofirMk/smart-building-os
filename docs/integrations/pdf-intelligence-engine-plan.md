# PDF Intelligence Engine — Unified Document-to-ERP Pipeline

> **Status:** Planning (no code committed under this banner yet) — *the* source of truth for unifying the four PDF flows that already exist scattered across the codebase, plus the new field-ops flows the customer just asked for.
>
> **Owner:** מהנדס רכש אוטונומי (Phase E+) + Field Ops squad
> **Created:** 2026-05-07
> **Sibling docs:**
> - `@c:\Users\user\Desktop\smart-building-os\docs\integrations\autodesk-aps-integration-plan.md` — the long-term replacement for PDF reverse-engineering of drawings (still blocked on commercial/legal).
> - `@c:\Users\user\Desktop\smart-building-os\docs\procurement\po-module-spec.md` §7 — PO + 3-Way Match contract that this engine feeds.

---

## 0. Strategic context

עד שגישת Autodesk APS תוסדר (Business prerequisites 0.1–0.4 ב-`autodesk-aps-integration-plan.md`), אנחנו ממשיכים בשיטת **Reverse-Engineering מ-PDF**. אבל היום ה-pipeline הזה קיים ב-4 מקומות **שונים** במערכת, כל אחד עם מודל נתונים שונה ופרומפט שונה:

| Existing pipeline | Where | Doc type | Status |
|---|---|---|---|
| `prepare_vision_po_draft` tool | `@c:\Users\user\Desktop\smart-building-os\app\api\procurement\autonomous-po\chat\route.ts` | תוכניות חשמל/ברזל | Live (Phase D) |
| `tender-intake` AI actions | `@c:\Users\user\Desktop\smart-building-os\app\(dashboard)\marker-ofek\pre-construction\tender-intake\actions\tender-ai-actions.ts` | חומרי מכרז | Live |
| `app/api/ocr-invoice` | OCR route | חשבונית ספק | Live (legacy) |
| `import-supplier-catalog` (Phase E) | `@c:\Users\user\Desktop\smart-building-os\app\api\erp\holden\import-supplier-catalog` + migration `20260813100000` | מחירוני ספק | DB ✅, agent pending |

**התובנה של הלקוח (2026-05-07):** המנגנון אחד הוא — *"PDF נכנס → ישות עסקית במערכת יוצאת"*. אם נבנה אותו פעם אחת נכון, אותו engine יסגור גם את הזמנות הרכש מהשטח (תעודת משלוח), גם את ה-AP (חשבונית ספק), גם את הקמת ספק חדש, גם עדכון מוצרי ספק, וגם reverse-engineering של תוכניות עד שה-APS יוסדר.

---

## 1. Unified mental model

```
                     ┌─────────────────────────────────────┐
   PDF / Image  ───▶ │  Doc Ingestion Pipeline (universal) │
   (drag-drop,       └──────────────┬──────────────────────┘
    upload, mobile                  │
    camera, email)                  ▼
                     ┌─────────────────────────────────────┐
                     │  1. Storage          (Supabase)     │
                     │  2. Pre-processing   (pdfjs → png)  │
                     │  3. Doc-type router  (LLM classifier)│
                     │  4. Strategy invoke  (per doc-type) │
                     │  5. Confidence gate  (≥ X auto)     │
                     │  6. Reviewer queue   (human-in-loop)│
                     │  7. Promote-to-ERP   (writes facts) │
                     └──────────────┬──────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
  PO line items              GR / 3-Way Match           Supplier master
  (drawings, BOQ)            (delivery note,             (catalog, price-list,
                              vendor invoice)             new-supplier docs)
```

**עיקרון אחד:** כל doc-type הוא **strategy** מתחת ל-Engine. ה-Engine אחראי על storage / OCR / classification / queueing / RLS / audit. ה-strategy אחראי רק על schema של החילוץ + על mapping לישות עסקית.

---

## 2. Doc-type strategies (the matrix)

| # | Doc-type | Triggered from | Output entity | Confidence floor (auto-promote) | Reviewer surface |
|---|----------|----------------|---------------|--------------------------------|------------------|
| **2.1** | **Construction drawing** (תוכנית חשמל / ברזל / אינסטלציה) | מהנדס רכש AI chat / Project hub | `erp_purchase_order_lines` (draft) | 0.0 — תמיד manual review (גיאומטריה לא מדויקת מ-PDF) | autonomous-po reviewer pane |
| **2.2** | **Delivery note (תעודת משלוח)** | Mobile camera / GR screen / email | `erp_goods_receipts` + `_lines` (PO match) | 0.85 — אוטומטי אם 100% של השורות נמצאו ב-PO פתוח | קבלת סחורה (`/marker-ofek/procurement/goods-receipt/new`) |
| **2.3** | **Vendor invoice (חשבונית ספק)** | AP inbox / email forward / drag-drop | `erp_vendor_invoices` + `_lines` → 3-Way Match | 0.90 — אוטומטי אם header (סכומים/מע"מ/PO ref) תואם 100% | התאמת חשבוניות (`/marker-ofek/finance/reconciliation`) |
| **2.4** | **Supplier price list / catalog** | Procurement chat / supplier portal | `erp_supplier_catalog_import_lines` → `erp_md_supplier_prices` | 0.85 — שורה אחר שורה | מחירוני ספקים (`/marker-ofek/procurement/catalog`) |
| **2.5** | **New-supplier docs** (אישור ניהול ספרים, ניכוי מס, IBAN, ת"ז עוסק) | Supplier intake form | `erp_md_suppliers` + `erp_md_supplier_bank_accounts` + attachments | 0.0 — תמיד manual (compliance) | טופס פתיחת ספק |
| **2.6** | **Supplier product update** (מסמך עדכון מק"ט / החלפת UOM / מק"ט שהושבת) | Supplier portal / procurement chat | `erp_md_supplier_item_mapping` UPDATE/INSERT | 0.80 | כרטיס ספק → מוצרים |
| **2.7** | **Tender materials** (כתב כמויות + מפרט) | Pre-construction tender intake | `erp_tender_*` (already live) | (existing) | (existing) |

> **חוקי זהב:**
> 1. אף שורה לא מתקבעת ב-master ללא **promote** מפורש (אוטומטי או ידני) — ה-cache תמיד נפרד.
> 2. כל שורה שומרת `raw_payload jsonb` + `confidence_score` + `reviewer_id` + `reviewed_at`.
> 3. ה-`linked_entity_type` (PROJECT|PO|SUPPLIER|INVOICE|GR) הוא standard cross-doc — מאפשר חיפוש "כל המסמכים של PO-2026-0184".

---

## 3. Why this is the right move *now*

עוד לפני Autodesk, ה-engine הזה פותר 3 כאבים שקיימים היום:

1. **סגירת PO מהשטח** (use-case 2.2) — היום מנהל עבודה מצלם תעודת משלוח, שולח ב-WhatsApp, ומישהו במשרד מקליד ב-GR ידנית. ה-engine ייתן endpoint לצילום מהמובייל → match אוטומטי ל-PO פתוח של הספק → 1-tap אישור. **ROI: 5–10 דקות לכל קבלה × 30 קבלות ביום.**
2. **3-Way Match אוטומטי** (use-case 2.3) — היום ה-`/marker-ofek/finance/reconciliation` קיים אבל ה-input ידני. עם ה-engine, חשבונית שמגיעה למייל → נדחפת ל-`erp_vendor_invoices` עם linked PO → אם חריגה אפסית, האישור 1-click.
3. **Supplier onboarding בלי דאטה-אנטרי** (use-case 2.5–2.6) — היום פתיחת ספק חדש זה 15 דקות של הקלדה מתוך אישור ניהול ספרים + ת"ז עוסק. עם ה-engine, גרירת 2–3 PDFs יוצרת draft של `erp_md_suppliers` שאיש רכש רק מאשר.

ובמקביל — **2.1 Drawings** ממשיך לעבוד כפי שהוא היום (Phase D), **בלי שינוי ל-UX של מהנדס הרכש**, אבל עובר תחת ה-engine ליציבות + audit-trail אחיד.

---

## 4. Phased rollout

### Phase E.1 — Foundations (1 week, no UI changes)

> **DB-only.** מאחד את ה-cache תחת schema אחד; לא נוגע ב-pipelines הקיימים — הם ממשיכים לכתוב ל-tables הישנים.

**Migration `<ts>_pdf_intelligence_engine_schema.sql`:**
- `erp_doc_ingestions` (header) — `id`, `company_id`, `project_id`, `file_url`, `mime_type`, `file_size_bytes`, `doc_type` enum (`DRAWING`|`DELIVERY_NOTE`|`VENDOR_INVOICE`|`SUPPLIER_CATALOG`|`SUPPLIER_INTAKE`|`SUPPLIER_PRODUCT_UPDATE`|`TENDER_MATERIALS`), `source` enum (`CHAT`|`EMAIL`|`MOBILE_CAMERA`|`PORTAL_UPLOAD`|`API`), `status` enum (`PENDING`|`CLASSIFYING`|`EXTRACTING`|`READY_FOR_REVIEW`|`PROMOTED`|`REJECTED`|`ERROR`), `classifier_confidence`, `linked_entity_type`/`linked_entity_id`, `metadata jsonb`, `uploaded_by`, audit columns.
- `erp_doc_extractions` (lines) — `id`, `ingestion_id`, `line_number`, `payload jsonb` (schema-by-doc-type), `confidence_score`, `reviewer_status` (`PENDING`|`APPROVED`|`REJECTED`|`AUTO_APPROVED`), `promoted_to_table` + `promoted_to_id` (polymorphic pointer), `reviewer_notes`, `reviewed_by/at`.
- RLS: `user_has_company_access(company_id)` (company-scoped, **לא** per-user — אלו דאטה עסקי).
- Triggers: `set_updated_at`.
- Indexes: `(company_id, status, created_at desc)`, `(doc_type, status)`, `(linked_entity_type, linked_entity_id)`.

**TS types:** `types/erp.ts` — `ErpDocIngestion`, `ErpDocExtraction`, enums.

**Acceptance:** `tsc --noEmit` clean + `supabase db push` clean. אין UI עדיין.

### Phase E.2 — Engine API (1 week)

- `POST /api/pdf-engine/ingest` — multipart upload, returns `ingestionId`, queues async classify+extract job (`ai_jobs` table — קיים).
- `GET /api/pdf-engine/ingest/[id]` — status polling + cached extraction lines.
- `POST /api/pdf-engine/ingest/[id]/promote` — body `{ approvals: [{ extractionId, override? }...] }` — מבצע upsert ל-target table של ה-strategy + מסמן `promoted_to_*`.
- Strategy registry: `lib/pdf-engine/strategies/{drawing,delivery-note,vendor-invoice,supplier-catalog,...}.ts` — כל אחד export-עושה `{ classify, extract, promote }`.
- ה-strategy של `drawing` עוטף בלבד את הקוד הקיים מ-`prepare_vision_po_draft` — אפס regression.
- ה-strategy של `supplier-catalog` עוטף את הקוד החלקי מ-`import-supplier-catalog` — מסיים אותו תוך כדי.

### Phase E.3 — Mobile delivery-note flow (3–5 days, **the headline demo**)

- Endpoint חדש `POST /api/pdf-engine/ingest` עם `source=MOBILE_CAMERA`, `doc_type=DELIVERY_NOTE`.
- UI עמוד `/marker-ofek/procurement/goods-receipt/from-photo` — large camera button (mobile-first), אחרי לכידה רואים live preview של ה-match ל-PO פתוח (כל השורות, כל הכמויות), 1-tap "אשר קבלה".
- אם confidence ≥ 0.85 + 100% match → auto-promote ל-`erp_goods_receipts`. אחרת — drop למסך GR הרגיל עם השדות ממולאים.
- חיבור ל-Phase 9 "My Day": כל GR שאוטו-promoted מופיע ב-Smart Inbox כ-feed item ("פגז: קבלת סחורה PO-2026-0184 נסגרה אוטומטית, 47 פריטים").

### Phase E.4 — Vendor invoice → 3-Way Match (1 week)

- Email-forward endpoint: `invoices@{tenant}.markerofek.co.il` → ingest כ-`VENDOR_INVOICE`.
- Strategy עם schema header (סכומים/מע"מ/IBAN/PO ref) + lines.
- אם header.po_ref קיים ויש match כספי 100% → auto-promote ל-`erp_vendor_invoices` ועובר ישר ל-`/finance/reconciliation`.
- אחרת — stays ב-reviewer queue, סמנכ"ל כספים רואה ב-`/finance/reconciliation` כתור Pending Review.

### Phase E.5 — Supplier onboarding & product updates (1 week)

- Intake form (`/marker-ofek/entities/suppliers/new`) — drop-zone ל-2–3 PDFs (אישור ניהול ספרים, IBAN, ת"ז עוסק).
- Strategy `supplier-intake` שמחלץ: `tax_id`, `name`, `bank_account`, `payment_terms` defaults.
- Reviewer מאשר → upsert ל-`erp_md_suppliers` + `erp_md_supplier_bank_accounts`.
- Strategy נוסף `supplier-product-update` — סוכן ההקשר של Phase 9 מזהה מייל "עדכון מק"טים מספק X" → קורא ל-engine → מעדכן `erp_md_supplier_item_mapping` (active/inactive/uom changes).

### Phase E.6 — Drawings strategy hardening (parallel; 3–5 days)

- ה-strategy `drawing` כבר חי תחת ה-engine מ-Phase E.2.
- כאן: confidence calibration לפי skala (1:50 vs 1:100), versioning של drawings (multiple revisions של אותה תוכנית → diff על השורות), הצמדה ל-`erp_purchase_order_revisions` (קיים).
- **Sunset path:** כשה-Autodesk APS יוסדר, ניצור strategy `cad-native` שיחליף את `drawing` בלי לגעת ב-engine ובלי לגעת ב-API.

---

## 5. Cross-cutting concerns

### 5.1 Storage
Supabase Storage bucket `pdf-ingestions` עם RLS path `<company_id>/<ingestion_id>/<filename>`. retention 18 חודש (audit).

### 5.2 Cost ceiling
LLM calls עוברים דרך `lib/ai/jobs` שכבר מוגבל ב-`erp_md_company_settings.ai_monthly_token_budget`. classifier זול (4o-mini) → extractor יקר (4o vision) רק אם classifier-confidence ≥ 0.6.

### 5.3 Idempotency
`(company_id, file_sha256)` unique → אותו PDF שמועלה פעמיים מזהה את ה-ingestion הקודם ומחזיר אותו. מונע double-promote.

### 5.4 Audit
`erp_ai_audit_log` (קיים מ-7.4.0) מקבל row פר ingestion + פר promote. כולל את ה-prompt, ה-response, ה-tokens, וה-strategy version.

### 5.5 Multi-tenancy
RLS company-scoped בכל ה-tables החדשים. doc_type=`SUPPLIER_INTAKE` ו-`SUPPLIER_PRODUCT_UPDATE` לא נחשפים ל-supplier portal users (גם אם בעתיד נפתח portal) — `policy ... using (jwt.role <> 'supplier')`.

---

## 6. Migration plan from existing pipelines

| Existing | New home | Cutover risk | Plan |
|---|---|---|---|
| `prepare_vision_po_draft` | `strategies/drawing.ts` | Low — internal tool, no public API | Phase E.2 — feature-flag, gradual cutover |
| `app/api/ocr-invoice` | `strategies/vendor-invoice.ts` | Medium — used by AP | Phase E.4 — keep old endpoint behind 410 redirect for 2 weeks |
| `app/api/erp/holden/import-supplier-catalog` | `strategies/supplier-catalog.ts` | Low — partial impl, rewriting anyway | Phase E.2 — done as part of strategy |
| `tender-intake/actions` | `strategies/tender-materials.ts` | High — busy live flow | **DEFER** to Phase E.7+ — wrap-only, no rewrite |

---

## 7. Open decisions (need product/CTO input before E.1 starts)

- **D1.** Doc-type classifier: גישה אחת (`gpt-4o-mini` zero-shot עם system-prompt) או n-classifiers נפרדים? (גישה אחת קלה יותר; n קלים יותר ל-fine-tune.) **Recommendation: aחת.**
- **D2.** Mobile UX לתעודות משלוח — PWA או native app? **Recommendation: PWA** (אין צורך ב-app store אישור; משתמש את `getUserMedia` API).
- **D3.** Auto-promote thresholds (טבלה ב-§2) — נשאיר תצורה ב-`erp_md_company_settings` כדי שכל לקוח יחליט סף משלו.
- **D4.** Email-ingest domain (Phase E.4) — לעבוד עם SendGrid Inbound Parse או עם Microsoft Graph (אחרי Phase 9.2)? **Recommendation: Graph** — ממילא נחבר את התיבה.

---

## 8. Acceptance criteria (definition of done לכל phase)

- `tsc --noEmit` exit 0
- `npm run lint` exit 0
- Migration נטענת על remote (`supabase db push` נקי)
- ב-`docs/SYSTEM_INDEX.md` נוסף row חדש לכל מודול
- Phase E.3 חייב להציג demo: צילום תעודת משלוח אמיתית → GR auto-promoted (≤ 30 שניות end-to-end)
- Phase E.4 חייב להציג demo: חשבונית ספק במייל → 3-Way Match green (≤ 60 שניות)

---

## 9. What this is *not*

- **לא** מחליף את `autodesk-aps-integration-plan.md`. כשה-APS יוסדר, `strategies/cad-native.ts` תחליף את `strategies/drawing.ts` — שאר ה-engine נשאר כמו שהוא ומשרת את 5 ה-doc-types האחרים לנצח.
- **לא** מחליף את `tender-intake` בטווח הקרוב (deferred ל-E.7).
- **לא** עושה parsing דטרמיניסטי של PDF (לא pdfminer / tabula). LLM-vision בלבד, כי המסמכים בעולם שלנו חתומים ביד / סרוקים / מצולמים מסטיק.
- **לא** מחליף קבלת AP ידנית — תמיד יישאר fallback.

---

## 10. Next concrete step (when approved)

1. Open D1–D4 (§7) decisions — 1-hour workshop.
2. Create Phase E.1 migration (`<ts>_pdf_intelligence_engine_schema.sql`) + types in `types/erp.ts`. **Pure DB; no UI risk.**
3. Sanity check: classify 20 real PDFs from existing customer (5 drawings, 5 delivery notes, 5 invoices, 5 catalogs) with `gpt-4o-mini` zero-shot — measure classifier accuracy. **Go/No-go gate.**
4. If ≥ 90% classifier accuracy → proceed with Phase E.2. Otherwise — n-classifiers fallback.
