# Procurement AI Agents — Phase 7.10

תיקיה זו תכיל את CrewAI crews של מודול הרכש. הסכמות של ה-jobs מוגדרות ב-
`lib/ai/jobs/schemas.ts` תחת `AI_JOB_TYPE.SEMANTIC_MATCHER`,
`AI_JOB_TYPE.DATA_ENRICHMENT`, `AI_JOB_TYPE.RFQ_AGENT`.

**חשוב**: לא לבנות agents לפני שמפעילים את ה-feature flag המתאים ב-
`erp_md_company_settings.ai_features_enabled`. ברירת המחדל היא `false` לכל
הסוכנים (חוץ מ-`smart_pricing=true` שאינו דורש agent — רץ ב-Postgres RPC).

---

## 7.10.1 — Semantic Matcher Agent (`semantic_matcher_crew.py`)

**מטרה**: לקחת טקסט חופשי של ספק (`supplier_description` + `supplier_sku`)
ולהצמידו ל-`master_item_id` בקטלוג המרכזי.

**Flow**:
1. Embedding של הטקסט עם OpenAI `text-embedding-3-large` (או מודל מ-
   `erp_md_company_settings.preferred_embedding_model`).
2. pgvector similarity search ב-`erp_md_items.description_embedding`
   (עמודת vector שתתווסף ב-7.10.1 migration).
3. LLM re-ranking של top-K candidates עם chain-of-thought reasoning.
4. החזרת `tier`:
   * `A_AUTO` (confidence ≥ 0.90) → auto-insert ב-`erp_md_supplier_item_mapping`
   * `B_REVIEW` (0.70 ≤ c < 0.90) → מוסיף עם `verified_by_user=false`
   * `C_REJECT` (c < 0.70) → לא נשמר; נכתב רק ל-`erp_ai_audit_log`

**Audit**: כל קריאה נרשמת ב-`public.erp_ai_audit_log` עם model, tokens, cost,
reasoning_json (chain-of-thought מלא לצורך explainability רגולטורי).

---

## 7.10.2 — Data Enrichment Agent (`data_enrichment_crew.py`)

**מטרה**: להעשיר `erp_md_items` בתמונות, datasheets, תווי תקן (SII).

**Flow**:
1. מקבל `master_item_id` → טוען `item_number`, `description`, `manufacturer_name`.
2. מפעיל scraping agents עם authority chain:
   * SII (`www.sii.org.il`) — priority 10
   * יצרן מקורי — priority 8
   * מפיץ ראשי — priority 5
3. מכבד `data_enrichment_respect_robots_txt` פר-חברה.
4. שומר ב-`erp_md_item_assets` עם `source_type` ו-`source_priority`.
5. הקובץ עצמו עולה ל-Supabase bucket `master-sku-assets` (signed URLs).

**Governance**: מגבלת `asset_max_file_size_mb` פר-חברה (ברירת מחדל 25MB).

---

## 7.10.3 — RFQ Agent (`rfq_agent_crew.py`)

**מטרה**: שליחת RFQ אוטומטי לספקים חליפיים (Smart Pricing → `BEST_OFFER_CROSS`)
ופענוח תשובות.

**Rate limiting**: `rfq_max_per_supplier_per_month` (ברירת מחדל 4).
**Auto-send**: דורש `rfq_auto_send_enabled=true` (ברירת מחדל false — חובת
aproval אנושי לפני שליחה).

**Urgency bypass**: אם PO עם `urgency_level=HIGH`/`CRITICAL` →
`ai_negotiation_status=BYPASSED_URGENCY` ולא נשלח RFQ.

---

## חוזה ה-Job

כל crew מקבל דרך `/jobs/dispatch` (FastAPI) payload שתואם לסכמה ב-
`lib/ai/jobs/schemas.ts`. התוצאה נשלחת חזרה ל-ERP ב-HMAC signed callback
(`/api/erp/ai/jobs/{id}/result`), וה-ERP שומר אותה ב-`ai_jobs.result` +
רושם audit entry ב-`erp_ai_audit_log`.
