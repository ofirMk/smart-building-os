# PROCUREMENT GOLDEN MODULE — ROADMAP & AUDIT REPORT

> **פאנל מומחים:** Senior Enterprise Software Architect + Strict Lead QA Tester
> **תאריך:** 2024-07
> **מטרה:** הפיכת מודול הרכש למודול "זהב" — תקן מסחרי עליון, שווה-ערך ל-SAP/Priority

---

## חלק א — ביקורת זרימת משתמש ו-QA

### 1.1 תהליכי ליבה — מצב נוכחי

#### P0 — שבורים לחלוטין / חוסמי ייצור

| # | תהליך | בעיה | השפעה על משתמש |
|---|--------|------|----------------|
| 1 | **יצירת הזמנת רכש (PO)** | אין ולידציה שמונעת שמירת PO עם 0 שורות | PO ריק נשמר ב-DB — שגיאת ERP קלאסית |
| 2 | **כמויות שליליות** | שדות כמות ומחיר מקבלים ערכים שליליים ו-0 | ניתן ליצור PO עם סכום שלילי — פגיעה חמורה בחשבונאות |
| 3 | **3-Way Match** | אין לוגיקת התאמה משולשת (PO + GR + Invoice) | חשבונית ספק מאושרת ללא קבלת סחורה תואמת |
| 4 | **מעבר סטטוס PO** | ניתן לערוך PO שכבר הונפק (ISSUED) ישירות ב-DB | פגיעה בשרשרת ביקורת (Audit Trail) |
| 5 | **ביטול PO עם GR פתוח** | אין חסימה של ביטול PO כאשר קיימת תעודת משלוח פתוחה | נתונים מנותקים ב-DB |
| 6 | **תעודת משלוח (GR) — כמות חריגה** | ניתן לרשום קבלה בכמות גדולה מהכמות שהוזמנה | Over-receipt ללא אישור מנהל |
| 7 | **מחיקת שורת PO** | שורת PO שכבר קושרה ל-GR ניתנת למחיקה | שבירת FK integrity |

#### P1 — חסרים קריטיים ל-UX מסחרי

| # | תהליך | בעיה |
|---|--------|------|
| 8 | **חיפוש ספק ביצירת PO** | אין Typeahead/Autocomplete — המשתמש חייב לדעת את ה-UUID |
| 9 | **העתקת PO** | אין פונקציית "שכפל הזמנה" — תהליך בסיסי ב-SAP (ME21N Copy) |
| 10 | **אישור רב-שלבי** | אין Approval Workflow — PO מעל סכום מסוים דורש אישור מנהל |
| 11 | **תאריך אספקה נדרש** | שדה delivery_date אינו חובה — PO ללא תאריך אספקה |
| 12 | **מטבע ושער חליפין** | אין ולידציה שמטבע ה-PO תואם למטבע הספק |
| 13 | **הדפסת PO** | PDF הנוצר חסר חתימה דיגיטלית ומספר PO רשמי בטרם הנפקה |
| 14 | **RFQ לPO** | אין המרה אוטומטית מבקשת הצעת מחיר (RFQ) להזמנת רכש |

#### P2 — חוויית משתמש לקויה

| # | תהליך | בעיה |
|---|--------|------|
| 15 | **Empty States** | רשימת PO ריקה מציגה דף ריק ללא הנחיה לפעולה |
| 16 | **Loading States** | אין Skeleton loaders — המסך "קופא" בזמן טעינה |
| 17 | **Error States** | שגיאות API מוצגות כ-console.error בלבד, ללא Toast/Banner למשתמש |
| 18 | **Optimistic Updates** | אין — כל פעולה מחכה לתגובת שרת לפני עדכון UI |
| 19 | **Dirty Form Guard** | אין אזהרה בעת ניווט מחוץ לטופס PO עם שינויים שלא נשמרו |
| 20 | **Keyboard Navigation** | אין תמיכה ב-Tab/Enter לניווט בין שורות PO |

---

### 1.2 מפת זרימת משתמש — פערים קריטיים

---

## חלק ב — Enterprise Mandates (Senior Architect Approval 2026-06-27)

### Phase 12 — PO Versioning & Change Orders

**עיקרון:** PO שהונפק (ISSUED/APPROVED+) הוא מסמך חוקי — לא ניתן לערכו ישירות.
כל שינוי יוצר **גרסה רשמית חדשה** (v2, v3…) המפעילה מחדש את workflow האישור,
תוך שמירת הגרסה הקודמת כ-immutable snapshot ל-audit trail.

#### Schema
- `erp_po_revisions` — snapshot מלא לכל גרסה:
  `(id, po_id, revision_number, snapshot_json, created_by, created_at, change_reason)`
- `erp_purchase_orders.revision_number` — current version counter (default 1)
- Trigger: `erp_po_snapshot_on_reopen` — כשPO עובר ל-REOPENED → INSERT ל-revisions

#### API
- `GET /api/procurement/orders/[id]/history` — revision timeline (build atop revisions table)
- `POST /api/procurement/orders/[id]/change-order` — body: `{ change_reason, fields_changed }` → creates revision + resets to DRAFT + triggers approval restart

#### UI
- טאב "היסטוריה" מציג revision timeline (v1 → v2 → v3)
- Diff viewer: שינויים בין גרסאות (שדות ששונו, highlight)
- Badge "גרסה נוכחית: v3" ב-page header
- "פתח שינוי" CTA → modal עם `change_reason` חובה + preview of what will be re-approved

#### Business Rules
- Revision יכול להיפתח רק ממסטטוסים: `APPROVED`, `SENT_TO_SUPPLIER`, `ON_SHIP`
- `CLOSED` / `CANCELLED` → immutable לחלוטין
- `change_reason` חובה (audit compliance)
- Revision approval — same matrix כמו original; approvers מקבלים email "שינוי בהזמנה שאישרת"

---

### Phase 13 — Landed Costs (Expense Apportionment)

**עיקרון:** עלויות עקיפות (משלוח, מכס, ביטוח, עמלות סוכן) מוקצות על ערך הפריטים שהתקבלו,
כך שעלות מלאי משקפת עלות נחיתה אמיתית (Landed Cost) ולא רק מחיר רכישה.

#### Schema
- `erp_landed_cost_documents` — header:
  `(id, company_id, goods_receipt_id, reference, total_amount, currency, status: DRAFT|POSTED)`
- `erp_landed_cost_lines` — per-cost-type:
  `(id, document_id, cost_type: FREIGHT|CUSTOMS|INSURANCE|AGENT_FEE|OTHER, amount, allocation_method: VALUE|QUANTITY|WEIGHT)`
- `erp_landed_cost_allocations` — allocation result per GR line:
  `(id, document_id, gr_line_id, item_id, allocated_amount, allocation_basis_value)`
- Trigger: `erp_update_item_valuation_on_landed_cost` → updates `erp_md_items.standard_cost`

#### Allocation Methods
- **BY_VALUE** — proportional to line total_price (default)
- **BY_QUANTITY** — proportional to received_qty
- **BY_WEIGHT** — requires `item.weight_kg` field on items table

#### API
- `POST /api/procurement/goods-receipt/[id]/landed-costs` — create landed cost document linked to GR
- `POST /api/procurement/landed-costs/[id]/allocate` — triggers allocation calculation (idempotent RPC)
- `POST /api/procurement/landed-costs/[id]/post` — finalizes + updates item standard_cost (irreversible)

#### UI
- ב-GR detail: button "הוסף עלויות נחיתה"
- Landed cost wizard: בחר סוגי עלות → הזן סכומים → preview allocation table → Post
- Allocation preview: טבלה עם פריט, עלות בסיס, עלות מוקצת, עלות כוללת, % מהסך
- ב-Item card: "עלות נחיתה ממוצעת: X ₪ (כולל משלוח + מכס)"

---

### Phase 14 — Dynamic Approval Matrix

**עיקרון:** Routing חכם המנתב POs לאשרנים שונים לפי תנאים מרובים,
עם תמיכה ב-sequential multi-sign-off, delegation, ו-escalation.

#### Schema
- `erp_approval_matrix_rules` — rules engine:
  ```
  id, company_id, rule_name, priority_order,
  condition_json: {
    amount_min, amount_max,
    cost_center_codes, project_ids, supplier_ids,
    urgency_levels, po_type_codes
  },
  approval_levels_json: [
    { level: 1, role: "DEPT_MANAGER", user_id?: uuid, amount_limit?: number },
    { level: 2, role: "CFO",          condition: "amount > 50000"            },
    { level: 3, role: "CEO",          condition: "amount > 200000"           }
  ],
  is_active boolean
  ```
- `erp_po_approval_instances` — runtime state per PO:
  `(id, po_id, matrix_rule_id, current_level, total_levels, resolved_approvers_json, created_at)`
- `erp_po_approval_decisions` — per-level decision:
  `(id, instance_id, level, approver_user_id, decision: APPROVED|REJECTED|DELEGATED, comment, decided_at, delegated_to_user_id)`

#### Rule Evaluation Engine (`lib/procurement/approval-matrix.ts`)
- `resolveApprovalMatrix(po)` → finds matching rule (first match by priority_order)
- `getNextApprover(instance)` → returns current level's required approver
- `canBypass(user, instance)` → SoD check (creator ≠ approver) + CFO override logic
- Fallback: אם אין rule match → single-level approval by `PROCUREMENT_MANAGER`

#### API
- `POST /api/procurement/orders/[id]/approvals/submit` → resolves matrix, creates instance
- `POST /api/procurement/orders/[id]/approvals/[instanceId]/decide` → approve / reject / delegate
- `GET /api/procurement/approvals/inbox` → all POs pending current user's signature

#### UI
- **Matrix Setup:** `/procurement/setup/approval-matrix` — CRUD for rules with drag-and-drop level ordering
- **Condition Builder:** visual rule editor (amount sliders, cost center multi-select, supplier picker)
- **Approval Track:** ב-PO detail → animated stepper showing all levels, current level pulsing
- **Delegation:** כל level → "האצל לX" button עם picker + expiry date
- **Inbox:** `/procurement/approvals` — queue per user with urgency sorting + approve-in-place

#### Business Rules
- **SoD enforced:** PO creator cannot appear as any level approver
- **Level skip:** CFO/CEO can approve at any level (override flag)
- **Timeout escalation:** אם level לא נענה תוך N שעות → escalate to next level automatically
- **Parallel approval:** Optional — multiple approvers at same level (all must sign / any one)
- **Audit trail:** Every decision immutably logged with timestamp + IP + user agent

---

*Document last updated: 2026-06-27 | Senior Architect approved*

