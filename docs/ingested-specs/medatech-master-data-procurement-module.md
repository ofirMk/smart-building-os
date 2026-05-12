---
title: MedaTech Priority ERP Specification — Chapters 1 & 2 (General + Procurement) — Lihtman (2016)
source_file: c:\Users\user\Desktop\הנהלת חשבונות\איפיון מערכת ניהול.docx
source_pages: 4–16 (chapters 1 + 2 in the original DOCX)
vendor: MedaTech (medatech.com, Tirat Carmel)
customer: ל"טמן בע"מ
ingested_at: 2026-05-12
ingested_by: Cascade (compatibility-audit response)
status: canonical-reference
scope: §1 (general definitions + permissions + UI conventions) and §2 (procurement
       — items, suppliers, price lists, frame POs, RFQs, vendor invoices,
       returns). Companion to `medatech-contracts-module.md` (§3) and
       `medatech-priority-project-module.md` (§5+§6).
related:
  - docs/ingested-specs/medatech-contracts-module.md (§3)
  - docs/ingested-specs/medatech-priority-project-module.md (§5+§6)
---

# MedaTech Priority — Chapters 1 & 2: General + Procurement (ingested)

> **Ingestion note (Cascade):** Chapters 1 and 2 in the original DOCX (pages 4–16)
> were extracted via `System.IO.Compression.ZipFile` → `word/document.xml` →
> regex-stripped to plain text. Hebrew OCR-style typos in the original
> (`פר1יקט`, `מסכ1ה`, `1יקלדו`) are preserved in spirit but cleaned up in the
> structured sections below to keep this doc useful as engineering reference.
> The raw extract is kept at `.tmp-docx-extract/full-text.txt` (gitignored).

---

## Chapter 1 — כללי (General Conventions)

### §1.0 Scope statement (verbatim, paraphrased)
> *"מסמך זה מפרט את תהליכי העבודה בפריוריטי עבור חברת ל״טמן ואינו מהווה מסמך
> אפיון מפורט. המסמך נכתב על סמך הנתונים כפי שהם הוצגו על ידי בעלי התפקידים
> השונים. המסמך אינו מתאר את כל יכולות המערכת אלא מדגיש תהליכים עיקריים
> במערכת הסטנדרטית. חברת ל״טמן עוסקת בתיאום תכנון וביצוע מערכות יועץ חשמל
> בבניה למגורים ומסחר. במערכת תוקם סביבת עבודה אחת."*

**Implications for our system:**
- Single tenant per "environment" in the original Priority deployment → in our
  cloud architecture this maps to a single `company_id` per logical
  organization, but with RLS we support multi-tenant out of the box (additive).
- The customer's domain is **electrical-engineering subcontracting for
  residential + commercial construction**. This sets the expectation for
  default item families, resource taxonomies (§5.2.3-4), and contract types.

### §1.1 UI primitives (terminology used throughout the spec)
| Term (Hebrew)            | English                  | Our equivalent              |
|--------------------------|--------------------------|-----------------------------|
| מסך                      | Screen / form            | React page / dialog         |
| מסך בן                   | Child screen / sub-form  | Detail tab / nested grid    |
| הפעלות ישירות            | Direct actions           | Toolbar action buttons      |
| מסך שאילתה               | Query screen             | Read-only data grid         |
| רשימת בחירה              | Choose-list              | Select / Combobox           |
| הודעת שגיאה (חסימה)      | Error (blocking)         | Validation error / toast    |
| הודעת אזהרה              | Warning (non-blocking)   | Warning toast / banner      |
| דוח                      | Report                   | Print page / PDF export     |

### §1.2 Management tools (`כלי ניהול`)
The spec calls out **3 generic engines** in Priority that we must replicate
functionally (not necessarily as the same code path):

#### §1.2.1 BPM — `ניהול תהליכים עסקיים`
- Define allowed status transitions per document type.
- Trigger conditional notifications on transition (user / group / email).
- **Our equivalent:** Server Action + status enum + Postmark/email infra
  (`lib/infrastructure/email-service.ts`). No central "BPM engine"; each
  workflow is hand-coded but follows the same _shape_ (allowed transitions
  validated server-side, notifications sent on transition).

#### §1.2.2 Business-rule generator — `מחולל חוקים עסקיים`
- Define rules that fire on field/record changes.
- Send notifications, show warnings, restrict field values.
- **Our equivalent:** Zod validators + RLS policies + form-level rules
  (e.g. urgency justification on POs).

#### §1.2.3 Data generator — `מחולל נתונים`
- Auto-fill column values when conditions are met.
- **Our equivalent:** server-side computed columns + Supabase triggers
  (e.g. PO number generation, `vat_pct` resolution).

### §1.3 Permissions (`ניהול הרשאות`)
- Permissions are granted at the **group** level (all members of a group share
  permissions).
- For every system entity (menu, screen, column, program, report) one can set:
  `block`, `read-only`, `hide-column-content`, `full-access`.
- Per-group / per-company configurability.
- **A warning can be promoted to an error** for specific roles.

**Our equivalent:** Supabase Auth + RLS policies + `auth.users` profile +
`company_id` resolution via cookie. We do NOT have a column-level
masking primitive — flagged as gap §1.3-GAP-1 in the audit doc.

---

## Chapter 2 — רכש (Procurement)

### §2.1 General
- **Default flow:** Order → Goods Receipt → Invoice. Exceptions (e.g. petty
  cash, services-only) may start from GR or directly from the invoice.
- **All procurement activity is centralized in the office** (master data,
  contracts, RFQs, POs, GRs). Project managers phone the office to place
  POs which are typed into the system.
- Signed GRs arrive at the office weekly from sites; they are typed into the
  system and the original document can be scanned and attached as a PDF.
- Vendor invoices (regular, credit notes, debit notes) are entered by
  accounting at the office; original is scanned and attached.

### §2.1.1 General-purpose projects for non-direct procurement
> *"יוקמו פרויקטים כלליים עבור רכש שאינו ישיר לפרויקט ביצוע. למשל, הנהלה
> וכלליות, עקיפות."*

→ **Mandatory pattern:** even non-project procurement (overhead, G&A) is
posted to a "general project". This matches §5.1 in the projects spec
("every activity in the company is a project").

### §2.1.2 Supplier-agreement types (one per supplier)
For each supplier, the company decides on **one** agreement type:
- מחירון ספק — **Supplier Price List**
- הזמנת מסגרת — **Frame Purchase Order** (Blanket PO)
- הצעת מחיר — **Quote / RFQ**

The procurement clerk picks the right basis when creating a PO; if no basis
is referenced, the price is pulled from the supplier price list if one exists.

### §2.2 Procurement Process

#### §2.2.1 Setting up procurement infrastructure
The following master-data entities must exist before transactional procurement
can run:
- Items (`פריטים`/`מק"טים`)
- Suppliers (`ספקים`)
- Supplier-specific item numbers (`מק"ט ספק`)
- Supplier price lists (`מחירוני ספקים`)
- Frame POs (`הזמנות מסגרת`)

**Setup sequence:**
1. System initialization → seed master data.
2. Ongoing → procurement clerk adds new items on demand; suppliers, price
   lists, and frame POs are added/updated as needed.

#### §2.2.2 הזמנת רכש (Purchase Order)
Lifecycle states (per spec):
- `טיוטא` (Draft) → `מאושרת` (Approved) → `נשלחה` (Sent, manual) → `סגורה` (Closed, auto on full GR)
- **No second-signature approval** required for Lihtman — the clerk who
  enters the PO also approves it.

Rules:
- A PO line may be **based on a prior document** (Quote / Frame PO) — fields
  auto-populate.
- If no basis, unit price is pulled from supplier price list (if one exists).
- Header text comment + per-line text comment supported.
- A "possible prices for product" sub-screen lists every quoted price for the
  item, across suppliers/contracts.
- Send via email/fax/print directly from the system; clerk must manually
  transition status to `נשלחה` after physical send.
- An approved/sent PO cannot be modified — to edit, transition back to
  `טיוטא`. Editing is allowed even after partial receipt.

#### §2.2.3 קבלת סחורה (Goods Receipt)
- A GR document is created against one or more POs. Lines auto-populate from
  PO lines; user updates `received_quantity`.
- Header fields: receipt date, supplier, supplier delivery doc number,
  `project_id` (warehouse auto-resolves from project), one or more linked POs.
- GR status: `טיוטא` → `סופית` (Final). Only Final GRs may be linked to
  vendor invoices.
- Final GRs cannot be modified once linked to an invoice. A "reopen
  document" program (`ביטול סגירת תעודה`) reverts a Final GR to Draft
  **only** if it is not linked to an invoice yet.

#### §2.2.4 החזרת סחורה לספק (Return-to-Vendor)
- A return doc is based on a GR (or directly on an open PO).
- Linking a GR auto-populates return lines.
- If the GR has not yet been billed, the return is auto-flagged "no credit
  required" and the GR is flagged "do not bill".
- A return doc is credited via either a vendor credit note or a debit invoice
  (`חשבונית לחיוב ספק`).
- Configurable: whether the return decrements the original PO balance or not.

#### §2.2.5 חשבונית ספק מרכזת (Consolidated Vendor Invoice)
- Captured at the office by accounting against one or many GRs.
- If no GR exists, invoice lines are entered manually.
- Auto-populated from linked GRs: **quantity from GR, price from PO**.
- Variances (qty vs GR, price vs PO) are **logged** at the line level and
  rolled to a header field `הפרש מחיר` (price variance).
- Lifecycle: `טיוטא` → `מחכה לאישור` → `מאושרת` → `נסגרה בספרים` (Booked).
  Closure is done by running `סגירת חשבונית`.
- Cancellation: `ביטול התעודה לתאריך` (current-date reversal) or
  `ביטול לתאריך מקור` (full reversal at original posting date).

**Three sanctioned ways to resolve a price variance:**
1. Receive invoice → reject it → ask vendor to reissue → delete provisional invoice.
2. Receive invoice → request a vendor credit note for the variance.
3. Receive invoice → issue a debit invoice (`חשבונית לחיוב ספק`) for the variance.

#### §2.2.6 חשבוניות לחיוב ספק (Debit Invoices to Vendor)
- Created in a dedicated screen when the vendor over-charged.
- Must be linked to the original consolidated invoice for traceability.

#### §2.2.7 הערות (General notes — control discipline)
- The system does **not** block partial flows (e.g. GR without PO, invoice
  without GR). Such flows are governed by **procedure + approval-loop +
  reports** rather than DB constraints.
- **Mandatory on every procurement document line:** `project_id`,
  `control_subchapter_id`, `control_resource_id` (the §6.2.4 dimensions).
- Item-level defaults for subchapter+resource auto-populate document lines.
- When no default exists or the default subchapter is not in the active
  project budget edition, the user must fill manually.
- **Subchapter+resource flow downstream:** PO → GR → Invoice (inheritance).

#### §2.2.8 משפחות מוצר (Item Families)
- Two-level hierarchy: `family_type` → `family`. Every item belongs to a
  family.
- Enables roll-up reporting, attribute inheritance, default subchapter +
  resource (§5.2.5).

#### §2.2.9 פריטים (Items)
Each item carries:
- `מק"ט` (SKU) — primary key.
- `תיאור מוצר` (description).
- `תיאור לועזי` (foreign-language description, optional).
- `משפחת מוצר` (item family — from §2.2.8).
- `סטטוס` enum: active / inactive / sellable / purchasable / …
- `יחידת מידה` (UOM).
- `טיפוס מוצר` (item type — `R` for purchased).
- `מנוהל מלאי` (inventory-managed flag) — if false, item does not appear in
  inventory reports; used for "consumables", services, labor hours.

#### §2.2.10 ספקים (Suppliers)
- Master screen with header (number, name, foreign name, address, fax,
  phone, email).
- Auto-creates a matching GL account in the chart of accounts.
- Child screens:
  - **Items per supplier** — supplier SKU + supplier-specific UOM.
  - **Contacts** — names, phones, roles.
  - **Finance settings** — currency, VAT registration ID, VAT-file ID, VAT
    code default (taxed/exempt), default payment terms, withholding-tax %
    + cert expiry + fallback %, tax-office code, bank-transfer flag.
  - **Bank details** — bank account number (with change log).
  - **Per-supplier alert** — popup shown to user whenever they open any doc
    for that supplier.

**Numbering convention (Lihtman-specific):**
- Regular suppliers: `7XXXXX` range.
- Subcontractors: `8XXXXX` range.
- A `supplier_type` enum distinguishes them.

#### §2.2.11 מוצרים לספק (Items per Supplier)
- Maps internal SKU ↔ supplier SKU.
- Carries supplier-specific UOM override.
- Used for: faster line entry in PO (filtered choose-list), auto-builder for
  supplier price lists.

#### §2.2.12 מחירוני ספקים (Supplier Price Lists)
- Each price list has: code, name, effective date.
- **Tiered pricing supported** — multiple unit prices for different minimum
  quantities.
- Unlimited price lists per supplier.
- Expired price lists are retained for audit/history.
- Programs: `העתקת מחירון` (copy), `הכנת מחירון ספק` (build from items-per-supplier),
  `עדכון מחירון ספק` (bulk update by % or fixed amount).
- The system picks the right price list by order/invoice date.

#### §2.2.13 הזמנות מסגרת לרכש (Frame POs / Blanket POs)
- **Not** a real PO — it is a commitment to buy a quantity of an item over a
  period at agreed prices/terms.
- Realized by issuing regular POs that reference the Frame PO. Each PO
  decrements the Frame PO balance automatically.
- Active until either all items are consumed OR the expiration date passes.
- Header: supplier, date, expiry, project (optional), full/partial flag.
- Detail: item, quantity, unit price.

#### §2.2.14 בקשות להצעת מחיר (RFQs)
- A request sent to suppliers for prices.
- Lifecycle: `טיוטא` → `נשלחה` (on print/send) → `הצעה` (auto, when a
  matching Quote is entered).
- Header: supplier, request date, validity date.
- Detail: items + required delivery dates.
- Free-text field + attachments (specs).
- To send to multiple suppliers: **manual duplication** of the RFQ doc per
  supplier (Priority does not auto-fan-out).

#### §2.2.15 הצעות מחיר מספקים (Vendor Quotes)
- Captured against an RFQ (auto-populates lines) or standalone.
- Tiered pricing supported (different prices per qty bracket → multiple lines
  per item).
- Status: `טיוטא` → `מאושרת`.
- **Report:** quote-comparison report across suppliers — but per §2.2.14 this
  is just a basic comparison report, NOT a true tender-management engine
  (which lives in §7).

---

## Engineering implementation map (for our codebase)

| MedaTech §                       | Concept                                | Our table / route / file                                                                          | Status   |
|----------------------------------|----------------------------------------|----------------------------------------------------------------------------------------------------|:--------:|
| §1.2 BPM / rule engines          | Workflow + notifications               | Server actions + Zod + Postmark (`lib/infrastructure/email-service.ts`)                            | ✅ functionally equivalent |
| §1.3 Group permissions           | Role-based access                      | Supabase Auth + RLS policies                                                                       | ✅ |
| §1.3 Column-masking              | Hide column content per role           | (none)                                                                                             | ⬜ GAP |
| §1.3 Warning → error per role    | Promote validation severity            | Hard-coded; not configurable                                                                       | ⚠️ partial |
| §2.1.1 General-purpose projects  | G&A pseudo-project for overhead PO     | (convention — needs explicit seed / docs)                                                          | ⚠️ partial |
| §2.1.2 Supplier-agreement type   | Price list / Frame PO / Quote          | Implicit via existence of records; no `supplier_agreement_type` enum on suppliers                  | ⬜ GAP |
| §2.2.2 Purchase Order            | PO header + lines + lifecycle          | `app/api/procurement/orders/route.ts` + `erp_purchase_orders` + status enum                        | ✅ |
| §2.2.2 PO `שלחה` manual flag     | Sent-status manual transition          | (auto-derived from print/email actions)                                                            | ⚠️ partial |
| §2.2.2 "Possible prices" subview | All quoted prices per item             | (not implemented as a screen)                                                                      | ⬜ GAP |
| §2.2.3 Goods Receipt             | GR doc, multi-PO linking               | `erp_grn_*` tables + GRN flow                                                                      | ✅ |
| §2.2.3 GR reopen program         | Revert Final GR → Draft                | (not implemented)                                                                                  | ⬜ GAP |
| §2.2.4 Return-to-Vendor          | Credit return based on GR              | (not implemented)                                                                                  | ⬜ GAP |
| §2.2.5 Consolidated invoice      | Vendor invoice w/ variance tracking    | `erp_vendor_invoices` + line variance fields                                                       | ✅ |
| §2.2.5 Closure / `סגירת חשבונית` | Book to GL                             | (Phase 7 — book-keeping not connected)                                                             | ⚠️ partial |
| §2.2.5 Cancellation programs     | `ביטול לתאריך נוכחי` / `מקור`         | (not implemented)                                                                                  | ⬜ GAP |
| §2.2.6 Debit invoices to vendor  | Charge vendor for over-billing         | (not implemented)                                                                                  | ⬜ GAP |
| §2.2.7 Mandatory dimensions      | project + subchapter + resource on line| (column exists on PO, not enforced on invoice/GRN)                                                 | ⚠️ partial |
| §2.2.8 Item families             | family_type → family hierarchy         | `erp_md_item_families` + `erp_md_item_family_types`                                                | ✅ |
| §2.2.9 Items                     | SKU master                             | `erp_md_items` + UI catalog                                                                        | ✅ |
| §2.2.10 Suppliers                | Supplier master + child screens        | `erp_md_suppliers` + supplier card scaffold (`components/marker-ofek/master-data/suppliers/`)      | ✅ |
| §2.2.10 Supplier numbering bands | 7XXXXX / 8XXXXX ranges                 | (not enforced — supplier_num is free text)                                                         | ⚠️ partial |
| §2.2.10 Per-supplier alert popup | Show user a warning on every doc      | (not implemented)                                                                                  | ⬜ GAP |
| §2.2.10 Supplier bank change log | Bank-detail audit trail                | (not implemented)                                                                                  | ⬜ GAP |
| §2.2.11 Items per supplier       | Cross-walk + per-supplier UOM          | `supplier-price-list-tab.tsx` + `supplier-products` (partial)                                      | ⚠️ partial |
| §2.2.12 Supplier price lists     | Tiered pricing, history, copy program  | `erp_md_supplier_price_lists` + `supplier-price-list-tab.tsx`                                      | ✅ |
| §2.2.12 Bulk price-update program| Update by % or fixed amount            | (not implemented)                                                                                  | ⬜ GAP |
| §2.2.13 Frame POs                | Blanket PO with auto-decrement         | `erp_blanket_purchase_orders` + lines (migration `20260627123000`)                                 | ✅ |
| §2.2.14 RFQs                     | Request → Quote lifecycle              | `erp_rfqs` + `erp_rfq_lines` (migration `20260627123000`)                                          | ✅ schema, ⚠️ UI partial |
| §2.2.15 Vendor quotes            | Quote capture + comparison report      | `erp_vendor_quotes` (in same migration) + basic compare view                                      | ⚠️ partial — deeper tender flow is §7 |

---

## Cross-references to companion docs
- **§3 (Owner/Subcontractor):** see `medatech-contracts-module.md`. The
  `vat_pct` and `default_control_subchapter` fields on PO lines (§2.2.7) are
  the input contract on the procurement side for the contract waterfall on
  the receivables side.
- **§5+§6 (Projects + Cost Control):** see `medatech-priority-project-module.md`.
  The mandatory dimensions in §2.2.7 are precisely the `(project_id,
  subchapter_id, resource_id)` triplet from §6.2.4.

---

## Open questions for the customer (flagged for prioritization)
- **Q-1.3:** Do we need column-masking by role (e.g. hiding supplier bank
  details from junior staff), or is the current page-level RLS sufficient?
- **Q-2.1.2:** Should `erp_md_suppliers` get an explicit `agreement_type` enum
  (PRICE_LIST / FRAME_PO / QUOTE / NONE), or stay implicit?
- **Q-2.2.4:** When is the **Return-to-Vendor** module first needed
  operationally? It's currently absent and is a "Tier-1 ERP" feature.
- **Q-2.2.13:** Is **Frame PO (Blanket PO)** support a Tier-1 must-have for
  the upcoming customer demo, or can it be deferred to Sprint W5+?
- **Q-2.2.14:** Tender management (§7) is the bigger module — do we want to
  start there, or close the smaller RFQ → Quote flow inside §2 first?

> **End of chapters 1+2 ingest. Companion: `medatech-contracts-module.md` (§3) +
> `medatech-priority-project-module.md` (§5+§6). Pending: §4 (Inventory), §7
> (Tenders), §8 (Finance), §9 (Open questions).**
