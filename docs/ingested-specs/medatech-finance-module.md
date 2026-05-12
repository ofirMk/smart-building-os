# MedaTech Priority ERP — §8 Finance Module (Ingested)

> **Source:** `C:\Users\user\Desktop\הנהלת חשבונות\איפיון מערכת ניהול.docx`, chapter 8 "כספים" (extracted text lines 2747-2766 of the cleaned document).
> **Sprint:** T6 — close the AR/AP loop on top of existing GL/AP/AR primitives.

## Source Text (Cleaned, Hebrew)

Priority chapter 8 is intentionally high-level — it sets the philosophy of the finance module rather than describing field-by-field flows (those are tightly coupled with the procurement/sales chapters already ingested).

> **8. כספים**
>
> הנהלת החשבונות במערכת Priority הנה מלאה ומקיפה. מערכת הכספים ב-Priority מקושרת עם שאר המודולים (מכירות, רכש וניהול מלאי) באופן כזה שפעולות רלוונטיות המתבצעות במערכת כלשהי באות לידי ביטוי ישיר ומיידי במערכת הכספים.
>
> כך למשל בתת-המודול **כספים → מכירות** בו מנוהלת הפעילות הכספית מול הלקוחות מתבצעים בין היתר הפקת חשבוניות ללקוחות כהמשך ישיר להזמנות לקוח, ומשלוחים אליו תוך עדכון הדדי של יתרות פתוחות. המחירים מובאים אוטומטית מהזמנת לקוח.
>
> באותו אופן בתת-המודול **כספים → רכש** בו מרוכזת הפעילות הכספית מול הספקים, נרשמים חשבונות הספקים תוך השוואה ובקרה (כמותית וכספית) מול קבלת הסחורה למחסן, ובהמשך ניתנים תשלומים בהתאם למחירים ולתנאי הזמנות הרכש המתאימות. פעולות אלו ואחרות ניתנות לרישום מיידי בספרים ללא צורך בהקלדה מיותרת.
>
> קישוריות זו מאפשרת בקרה צמודה ויעילה על הנעשה בחברה ומבטלת למעשה תחומים אפורים שבין תהליכי לוגיסטיקה לתהליכי ניהול הכספים. כך למשל בבדיקת תנועות יומן בכרטיס כלשהו ניתן לעבור בלחיצת מקש לתנועה או לתעודה ממנה נובעת תנועת היומן.
>
> **תת-מודול תמחיר וערך המלאי** — תמחיר מסחרי בפועל ותמחיר לפי תנועות; ערכי מלאי לפי תקן / ממוצע נע / FIFO.
>
> **ניהול תקציב** — מעקב תקציבי משלב ההתחייבויות (דרישה → הזמנה → קבלה), עם "גלגול" התחייבויות משלב לשלב.
>
> **מרכזי רווח ועלות עקיפה** — ריכוז הוצאות/הכנסות בשיוך לגורמים בחברה תוך חלוקת עלויות עקיפות.
>
> **תת-מודול ניהול קופה** — קופות חברה, קבלת המחאות ושוברי אשראי לקופה, וביצוע הפקדות בין קופות.

## Engineering Interpretation

The spec mandates a **bi-directional, real-time link** between transactional modules (sales, purchasing, inventory) and the finance ledger. Concretely this means:

| Spec Requirement | Implementation Anchor |
| --- | --- |
| חשבוניות לקוח כהמשך ישיר להזמנת לקוח | `erp_client_contracts` → `erp_client_progress_bills` (already exists) |
| חשבוניות ספק עם השוואה לקבלת סחורה | `erp_vendor_invoices` ← `erp_invoice_po_line_matches` (3-way match, Phase 8.3) |
| תשלום לספקים לפי תנאים | `erp_ap_payment_runs` + `erp_ap_payments` + מס"ב file (Phase 20260826) |
| קבלת תקבולים מלקוחות | **GAP — T6 builds** `erp_ar_receipts` + `erp_ar_receipt_lines` |
| יתרות פתוחות + Aging | חלקי — `lib/marker-ofek/finance-aging-actions.ts` רץ על `mo_invoices` הישן בלבד; T6 מוסיף וריאנט קנוני על `erp_client_progress_bills` + `erp_vendor_invoices` |
| תנועות יומן כל פעולה כספית | `erp_gl_journal_entries` + lines (Phase 20260824). T6 משלים טריגרים שיוצרים JE אוטומטית מתשלום/תקבול |
| תמחיר וערך מלאי | קיים חלקית במודולים אחרים (לא ב-scope T6) |
| ניהול תקציב | קיים ב-`erp_budget_*` ו-`erp_cost_control` (לא ב-scope T6) |
| מרכזי רווח/עלות עקיפה | קיים חלקית ב-`overhead-registry-actions.ts` + `holding-profit-center-tags.ts` |
| ניהול קופה | לא ב-scope T6 (יידחה ל-T7) |
| **תחזית מזומנים 13-שבועות (rolling)** | **GAP — T6 builds** `erp_get_finance_cashflow_forecast` |

## Current-State Audit (snapshot before T6)

### AR (Accounts Receivable — חייבים)

| Object | State |
| --- | --- |
| `erp_client_contracts` | ✅ exists (Aug-26 W2 foundation) |
| `erp_client_progress_bills` | ✅ exists with full waterfall (T2 sprint) — `amount_to_pay`, `grand_total_amount` populated by `erp_compute_client_bill_waterfall` |
| `erp_ar_receipts` (header) | ❌ **does not exist** — T6 creates |
| `erp_ar_receipt_lines` (allocation per bill) | ❌ **does not exist** — T6 creates |
| `paid_amount` / `payment_status` on `erp_client_progress_bills` | ❌ **does not exist** — T6 adds |
| Auto JE on receipt | ❌ — T6 adds via trigger |

### AP (Accounts Payable — זכאים)

| Object | State |
| --- | --- |
| `erp_vendor_invoices` | ✅ with 3-way match + status flow up to `READY_FOR_PAYMENT` |
| `erp_ap_payment_runs` + `erp_ap_payments` | ✅ exists with MASAV file support |
| `paid_amount` / `payment_status` on `erp_vendor_invoices` | ❌ **does not exist** — T6 adds |
| Auto JE on payment EXECUTED | ❌ — T6 adds via trigger (existing `erp_ap_payments.journal_entry_id` column is empty) |
| `PAID`, `PARTIALLY_PAID` values on `erp_vendor_invoice_status` enum | ❌ — T6 adds |

### Treasury / Cash

| Object | State |
| --- | --- |
| `erp_bank_accounts` + `erp_bank_statements` + lines | ✅ exists |
| Bank reconciliation | ✅ exists (`reconciliation-actions.ts`) |
| 13-week cashflow forecast view/RPC | ❌ **does not exist** — T6 builds |

### GL

| Object | State |
| --- | --- |
| `erp_gl_accounts` (Chart of Accounts) | ✅ exists |
| `erp_gl_journal_entries` + lines with D/C xor constraint | ✅ exists, status lifecycle DRAFT→POSTED→VOIDED |
| Default account mapping (AR/AP/Bank → erp_gl_accounts) | ❌ resolved on-the-fly via `erp_system_parameters` keys (`GL_ACCOUNT_AR`, `GL_ACCOUNT_AP`, `GL_ACCOUNT_BANK_DEFAULT`). T6 reads them defensively — if missing, JE creation is **silently skipped** so the AR/AP balance update still runs (graceful degradation). |

## T6 Sprint Scope (this delivery)

1. **Migration** `20260514120000_t6_finance_ar_ap_closing_loop.sql`:
   - Extend `erp_vendor_invoice_status` enum with `PARTIALLY_PAID`, `PAID`.
   - Add `paid_amount` (numeric), `last_payment_at`, `payment_status` (text, derived) to **both** `erp_vendor_invoices` and `erp_client_progress_bills`.
   - Create `erp_ar_receipt_method` enum (`BANK_TRANSFER`, `CHECK`, `CASH`, `CREDIT_CARD`, `OTHER`).
   - Create `erp_ar_receipt_status` enum (`DRAFT`, `RECEIVED`, `RECONCILED`, `VOIDED`).
   - Create tables `erp_ar_receipts` (header) and `erp_ar_receipt_lines` (allocation to client bills).
   - Triggers:
     - `erp_ap_payments_post_payment_trg` — AFTER INSERT/UPDATE OF status: when `status='EXECUTED'`, aggregate paid amount per `vendor_invoice_id`, update `erp_vendor_invoices.paid_amount` + `payment_status`, and create a JE (DR supplier-AP / CR bank) — best-effort, idempotent.
     - `erp_ar_receipts_post_receipt_trg` — symmetric for AR side.
   - RPC `erp_get_finance_cashflow_forecast(p_company_id text, p_anchor_date date default current_date)` returning 13 weekly buckets with opening/inflow/outflow/closing.

2. **Server Actions** `lib/marker-ofek/finance/t6-ar-ap-actions.ts`:
   - `createClientReceiptAction({ companyId, clientContractId, billAllocations[], method, receiptDate, reference })`.
   - `fetchCashflowForecastAction(companyId, anchorDate?)`.
   - `fetchCanonicalAgingReportAction(companyId, side)` — AR (`erp_client_progress_bills`) / AP (`erp_vendor_invoices`).

3. **UI** (additive — does NOT touch protected routes):
   - `app/(dashboard)/marker-ofek/finance/cashflow/page.tsx` — 13-week dashboard.
   - `app/(dashboard)/marker-ofek/finance/aging/page.tsx` — combined AR + AP aging.
   - `app/(dashboard)/marker-ofek/finance/receipts/page.tsx` — record customer receipts.
   - Components under `components/marker-ofek/finance/*`.

4. **Tests** `tests/finance-loop.spec.ts` (API auth boundary) + extend `tests/critical-routes-protection.spec.ts` with the three new routes.

## Out of T6 Scope (deferred)

- Inventory costing engine (FIFO / weighted average).
- Petty cash management (`ניהול קופה`).
- Profit-center / overhead allocation engine extensions.
- Multi-currency revaluation (`erp_vendor_invoices.currency_code` exists but no GL revaluation runs yet).
- Tax authority filings (Form 856 / Form 102) — partially covered by `vat-readiness-actions.ts`.
