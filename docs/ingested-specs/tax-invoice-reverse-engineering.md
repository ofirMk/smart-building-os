# Tax Invoice — Reverse Engineering, Benchmarks, and Compliance Roadmap

> **Sources ingested (May 2026):**
>
> - `Sales Invoice Script-H.pdf` — Priority's official Hebrew tutorial script for sales-invoice creation (2 pages, ~5,500 chars).
> - `SI186000071 - הדפסת חשבונית מרכזת.pdf` — actual printed Priority tax invoice (Lightman Ltd., 13/08/2018, NIS 123,142.50). Used as the **target visual reference** for our printed invoice.
>
> **Goal:** reverse-engineer the Priority workflow + the printed layout, benchmark against SAP S/4HANA SD-Billing, audit our current state, map every Israeli Tax Authority (רשות המסים) requirement to a concrete gap, and ship a phased delivery plan.

---

## 1. Reverse-Engineering — Priority Sales-Invoice Script

The script breaks the workflow into **5 tightly chained sections**. Every screen is named (master / sub / grand-child) so the hierarchy maps cleanly to a relational schema.

### 1.1 Screen hierarchy (verbatim from the tutorial)

```
חשבונית מס (master)
├── הגדרות לחשבונית (header settings tab)
│   ├── סוכן מכירות           — auto-filled from customer; editable
│   ├── אתר                   — customer's delivery site → auto-fills כתובת למשלוח sub-form
│   └── הזמנתכם               — buyer's PO number (free text)
├── תנאים כספיים (financial-terms tab)
│   ├── קוד מע״מ              — auto from customer; per-invoice override
│   ├── חשבונית – פרטים נוספים   (sub) — ad-hoc payment terms
│   └── תנאי תשלום לחשבונית      (sub) — instalment plan with non-equal amounts
├── משלוח (shipping tab)
│   └── מחסן שולח             — default warehouse; per-line override allowed
├── טקסט לחשבונית (sub)         — free text from system defaults; appears on print
├── פירוט החשבונית (lines sub-form)
│   ├── auto-pull from sales-order lines
│   ├── יתרה למשלוח           — remaining-to-deliver qty from origin SO
│   ├── מחיר ליחידה            — pulled by price hierarchy (F1 → explanation)
│   ├── מקור מחיר              — provenance of the price
│   ├── סכום כולל מע״מ         — VAT-inclusive entry mode (system back-solves unit price)
│   ├── יתרה במחסן             — current inventory at sending warehouse
│   ├── דגל "אשר"              — auto-fill ship-qty = MIN(remaining, on-hand)
│   ├── ברקוד                  — auto from item master; barcode-scanner integration
│   ├── מכירות אחרונות (grandchild) — last sales of this item to this customer
│   └── טקסט חופשי לשורה (grandchild) — appears next to the line on print
├── מחירים (totals tab)         — financial summary of the invoice
└── (after close) עדכוני פרטים  — limited post-close edits (agent, contact only)
```

### 1.2 Status lifecycle (from the script)

```
DRAFT
  │  fill header + sub-forms + line details
  ▼
CLOSED  ←─ "סגירת חשבונית" direct activation (or batch program)
  │      ① assigns final invoice number per yearly template
  │      ② posts journal entry (DR customer / CR revenue + VAT)
  │      ③ locks all material fields
  ▼
PRINTED (first run)
  │      • print = "מקור" (original)
  │      • הודפסה flag set
  ▼
REPRINTED (subsequent)
         • print = "העתק" (copy)
```

Tracking surface: סיכום מכירות, גיול חובות, דו״חות בקרה.

### 1.3 Key design takeaways

| Pattern | Implication for our schema |
| --- | --- |
| Auto-pull from sales order with editable per-line override | `tax_invoice_lines.source_so_line_id` (nullable FK) + always allow line-level edits before close. |
| Price hierarchy with provenance | Persist `price_source` per line (`SO`, `PRICE_LIST`, `MANUAL`, `LAST_SALE`). |
| VAT-inclusive entry mode | UI affordance — DB stores both `unit_price_excl_vat` and `unit_price_incl_vat`; one is computed. |
| Two-step number assignment (working number → final on close) | `draft_number` (uuid) + `invoice_number` (bigint, assigned on `CLOSE`). |
| Original/Copy flag with audit trail | `printed_at_first` + `print_count` + emit a `tax_invoice_print_events` audit row on every render. |
| Limited post-close mutations | DB trigger that allows updating only a whitelist of columns when `status='CLOSED'`. |

---

## 2. Reverse-Engineering — Printed Invoice Layout (`SI186000071`)

OCR-extracted layout, mapped to logical zones.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [VENDOR ZONE — top-left]            │ [DOCUMENT META — top-right]           │
│ web site: www.lightman.co.il        │ תאריך  13/08/18                       │
│ e-mail:   office@lightman.co.il     │ תאריך  03/09/18 (value/due date)      │
│ לייטמן                              │ שעה    14:35                          │
│ בודנהיימר 7                         │ מספר   SI186000071                    │
│ תל אביב 6200811                     │                                       │
│ טל 03-6950801, פקס 03-6810801       │ [TITLE]                               │
│ עוסק 514638055                      │ חשבונית - SI186000071                 │
│ מס׳ עוסק 514638055                  │                                       │
│ מס׳ ניכוי 935992800                 │ [BUYER ZONE — לכבוד]                  │
│                                     │ פורמה                                 │
│                                     │ יוני 1                                │
│                                     │ אור 60250                             │
│                                     │ טל 03-5383838, פקס 03-6340340         │
│                                     │ מס׳ עוסק 513403964                    │
│                                     │ תיק 557877842                         │
└─────────────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────────────┐
│ [LINE TABLE — RTL, 8 columns]                                               │
│ סה"כ │ מחיר (כולל מע״מ) │ מחיר (לא כולל) │ יתרה │ כמות │ תאור │ ברקוד │ מק״ט │
│ 105,250.00 │ 123,142.50 │ 105,250.00 │ 0.00 │ 1.00 │ מוצר** │ — │ 000 1   │
└─────────────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────────────┐
│ [TOTALS — bottom-right]                                                     │
│ מחיר      105,250.00                                                        │
│ מע״מ 17%  17,892.50                                                         │
│ סה"כ      123,142.50                                                        │
│                                                                             │
│ [BARCODE — Code-39]   *SI186000071*                                         │
└─────────────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────────────┐
│ [PAYMENT BLOCK]                                                             │
│ לתשלום 13/08/18                                                             │
│ מס׳    3038                  ← פנימי / מס' חוזה                             │
│ מס׳    513403964             ← עוסק לקוח                                    │
│ תיק    557877842             ← מס' תיק במשרדי החברה                         │
│ יתרה   263,765.29            ← יתרת חוב מצטברת אחרי החשבונית הזו            │
│                                                                             │
│ [SIGN-OFF]                                                                  │
│ בברכה,                                                                      │
│ שני                                                                         │
│ מרינה                                                                       │
│ חשבון                                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Field-level extraction

| Zone | Field | Type | Source / Notes |
| --- | --- | --- | --- |
| Vendor | `name`, `address`, `phone`, `fax`, `email`, `website` | text | `erp_companies` master |
| Vendor | `tax_id` (עוסק) | text(9) | mandatory ITA field |
| Vendor | `vat_id` (מס׳ עוסק) | text(9) | usually = tax_id |
| Vendor | `withholding_id` (מס׳ ניכוי) | text(9) | for ניכוי במקור |
| Doc meta | `issue_date`, `value_date`, `issue_time`, `invoice_number` | date/time/serial | sequential per series |
| Title | "חשבונית" / "חשבונית מס" / "חשבונית מס/קבלה" | enum | depends on doc type |
| Buyer | `name`, `address` (street + city + zip), `phone`, `fax` | text | `erp_md_customers` |
| Buyer | `tax_id` (מס׳ עוסק) | text(9) | mandatory for B2B |
| Buyer | `client_file_number` (תיק) | text | internal client folio |
| Lines | `item_code`, `barcode`, `description`, `qty`, `balance`, `unit_price_excl`, `unit_price_incl`, `line_total` | mixed | per item; balance = remaining-to-deliver from SO |
| Totals | `subtotal`, `vat_rate`, `vat_amount`, `grand_total` | numeric | always show VAT % explicitly |
| Barcode | `*<invoice_number>*` Code-39 | image/SVG | scan in warehouse / payment-receipt |
| Payment | `due_date`, `internal_doc_no`, `customer_vat`, `customer_file`, `running_balance` | mixed | running_balance = sum of all open AR for this client AFTER posting this doc |
| Sign-off | signatories list with role | text | configurable per company |

> 🟡 **Hidden requirement spotted:** the line table has **two unit-price columns** — מחיר (excl VAT) and מחיר כולל מע״מ — followed by סה"כ. Many Israeli invoices print only one; Priority deliberately shows both because `סכום כולל מע״מ` entry mode is supported. We should **match this** for visual parity with Lightman's invoice.

---

## 3. Benchmark — Priority vs SAP S/4HANA vs Marker (current)

### 3.1 Workflow (creation → close → print)

| Aspect | Priority (script) | SAP S/4HANA SD-Billing | Marker (current) | Verdict |
| --- | --- | --- | --- | --- |
| Source document | Sales order → invoice | Sales order → delivery → billing doc (F2) | Approved progress bill / SO mock | ⚠️ partial — no formal SO→TI link |
| Auto-pull lines | Yes, with overrides | Yes (copy control rules) | Manual (`mo-invoice-create-action.ts`) | ⚠️ |
| Price provenance | Source-of-price column | Pricing procedure log | Single price field | ❌ |
| VAT-inclusive entry | Yes, alt entry mode | Yes (condition `MWST` inverse) | No | ❌ |
| Two-stage numbering | Working → final on close | Internal then official on `VF02` save | Allocated on `finalize_invoice` action | ✓ |
| Sequential numbering, no gaps | Yes (`finance_invoice_number_seq`) | Number range object (T-code `VN01`) | `finance_invoice_number_seq` (Postgres seq) | ✓ |
| Auto JE on close | Yes | Yes (FI integration) | Yes (T6 trigger) | ✓ |
| Original / Copy flag | `הודפסה` flag | Output type repeat-print | `copyLabel` prop (manual) | ⚠️ — no auto-tracking yet |
| Israeli localization (allocation) | Plug-in `Mivzak` from 2024 | SAP Note 3433300 + ITA OAuth | `lib/finance/israel-tax-api.ts` (we built) | ✓ |
| Batch close | Yes (`סגירת חשבוניות מס` program) | `VF06` collective billing | Per-invoice only | ❌ |
| Batch print | Yes | `VF31` mass print | Per-invoice only | ❌ |
| Aging report | Built-in | FBL5N | T6: `fetchCanonicalAgingReportAction` | ✓ |

### 3.2 Printed-invoice layout

| Visual feature | Priority sample | SAP standard form (RVINVOICE01) | Marker (`mo-tax-invoice-pdf.tsx`) | Verdict |
| --- | --- | --- | --- | --- |
| Vendor header with full registration IDs | ✓ | ✓ | ✓ | ✓ |
| Withholding ID printed | ✓ | configurable | ❌ | gap |
| Issue time `שעה` | ✓ | optional | ❌ | minor gap |
| Buyer block with `תיק` (client folio) | ✓ | optional | ❌ | gap |
| Line table with TWO price columns (excl + incl VAT) | ✓ | ✓ (via condition print) | ❌ — single price col | gap |
| `יתרה למשלוח` per line | ✓ | optional | ❌ | gap |
| Code-39 barcode of doc number | ✓ | configurable | ❌ | gap |
| Allocation number block | new | new (Note 3433300) | ✓ | ✓ |
| Original / Copy badge | ✓ | ✓ | ✓ | ✓ |
| Running balance after this doc | ✓ | optional (FI) | ❌ | gap |
| Sign-off / signatories | ✓ | configurable | ❌ | gap |
| SHA-256 audit footer | partial (some plug-ins) | new | ✓ | ✓ ahead of SAP std |

### 3.3 Architectural note — why we already lead in two areas

1. **Allocation number** — we built `lib/finance/israel-tax-api.ts` with OAuth2 + offline `PENDING_ALLOCATION` fallback before SAP shipped Note 3433300 broadly. Priority delivered it via the *Mivzak* plug-in in 2024.
2. **SHA-256 audit footer** — a printed digest of the canonical invoice payload is a **proactive** anti-tampering control that pre-empts the next likely ITA reform (signed payload + QR). Priority does not ship this by default.

---

## 4. Israeli Tax Authority compliance matrix

Mapping the **mandatory** + **upcoming** requirements to our state.

| # | Requirement | Source of authority | Marker state | Gap |
| --- | --- | --- | --- | --- |
| R1 | Document title "חשבונית מס" / variant clearly visible | תקנות מע״מ (ניהול פנקסי חשבונות) §9א | ✓ — `copyLabel` + title | none |
| R2 | Issuer's full name + address | §9א | ✓ via `companyName` + `companyAddress` | none |
| R3 | Issuer's `מס׳ עוסק` | §9א | ✓ `companyVatNumber` | none |
| R4 | Issue date | §9א | ✓ | none |
| R5 | Sequential serial, monotonically increasing, year-prefixed allowed | §9א + ITA circular 2/2018 | ✓ Postgres sequence | year-prefix template missing → **R5a gap** |
| R6 | Buyer's name + (B2B) `מס׳ עוסק` | §9א | ✓ | none |
| R7 | Per-line: description, qty, unit price, line total | §9א | ✓ | none |
| R8 | VAT rate, VAT amount, total incl VAT shown explicitly | §9א | ✓ | none |
| R9 | First print = "מקור", subsequent = "העתק" | §9א + ITA circular 1/2018 | ⚠️ — prop only, no DB-side enforcement | **R9 gap** |
| R10 | Allocation number from חשבוניות ישראל when invoice ≥ threshold | חוק התכנית הכלכלית 2023, Reg. effective 05/05/2024 (NIS 25,000), step-down: 2025 = 20k, 2026 = 10k, 2027 = 5k | ✓ flow + UI; **threshold check + buyer-deductibility warning missing** | **R10 gap** |
| R11 | Audit file (PCN874 / INI856 / BKMVDATA — open format) | תקנות מס הכנסה (ניהול פנקסי חשבונות) §36 + ITA spec 1.31 | ⚠️ — `vat-readiness-actions.ts` partial | **R11 gap** |
| R12 | Mandatory archive of original PDF + signature for ≥7 years | תקנות מע״מ §22 | ❌ | **R12 gap** |
| R13 | No alteration of material fields after issuance | §9א | ⚠️ — relies on app code, no DB trigger | **R13 gap** |
| R14 | Cancellation = credit-memo (not delete) | §23א | ⚠️ — `CREDIT` enum exists; UI flow missing | **R14 gap** |
| R15 | Hebrew language, ILS currency by default | §9א | ✓ | none |
| R16 | Withholding-tax ID printed when applicable | §9א + ITA circular 16/2017 | ❌ | **R16 gap** |
| R17 | Customer copy delivery proof (B2B) | best practice | ❌ | nice-to-have |

---

## 5. Implementation roadmap — Sprint **T7: Tax-Invoice Compliance Pack**

Phased, each phase deployable independently. Every phase ends with `tsc --noEmit` clean + Playwright tripwire green + `supabase db push --include-all` clean.

### 5.1 Phase **T7a — Canonical Tax-Invoice Entity** (foundation)

**Why first:** the existing `finance_invoices` table works but isn't linked to ERP entities (`erp_md_customers`, `erp_companies`, `erp_client_progress_bills`). We need a single canonical row that the closing-loop and aging reports can reference.

**Migration:** `20260520000000_t7a_canonical_tax_invoices.sql`

```sql
-- New status enum reflecting the script's lifecycle:
create type erp_tax_invoice_status as enum (
  'DRAFT',
  'PENDING_ALLOCATION',
  'CLOSED',
  'PRINTED_ORIGINAL',
  'REPRINTED',
  'CANCELLED'
);

create type erp_tax_invoice_kind as enum (
  'TAX_INVOICE',          -- חשבונית מס
  'TAX_RECEIPT',          -- חשבונית מס/קבלה
  'CREDIT_MEMO',          -- חשבונית זיכוי
  'CONSOLIDATED_INVOICE'  -- חשבונית מרכזת (matches the sample!)
);

create table erp_tax_invoices (
  id                       uuid primary key default gen_random_uuid(),
  company_id               text not null references erp_companies(id),
  draft_number             uuid not null default gen_random_uuid() unique,
  invoice_number           bigint null,            -- assigned on CLOSE
  invoice_number_label     text null,              -- "SI186000071" etc.
  series_code              text not null default 'SI',  -- year-prefix template
  kind                     erp_tax_invoice_kind not null default 'TAX_INVOICE',
  status                   erp_tax_invoice_status not null default 'DRAFT',
  customer_id              uuid not null references erp_md_customers(id),
  client_progress_bill_id  uuid null references erp_client_progress_bills(id),
  sales_order_id           uuid null,
  issue_date               date not null default current_date,
  issue_time               time not null default current_time,
  value_date               date null,              -- "תאריך" #2 in sample
  due_date                 date null,
  vat_rate_pct             numeric(5,2) not null default 17.00,
  subtotal_amount          numeric(18,2) not null default 0,
  vat_amount               numeric(18,2) not null default 0,
  grand_total              numeric(18,2) not null default 0,
  paid_amount              numeric(18,2) not null default 0,
  payment_status           text not null default 'UNPAID',
  allocation_number        text null,
  tax_authority_ref        text null,
  digital_signature_sha256 text null,
  internal_doc_number      text null,              -- "מס׳ 3038" in sample
  print_count              integer not null default 0,
  printed_at_first         timestamptz null,
  closed_at                timestamptz null,
  cancelled_at             timestamptz null,
  cancelled_by_invoice_id  uuid null references erp_tax_invoices(id),
  notes                    text null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table erp_tax_invoice_lines (
  id                  uuid primary key default gen_random_uuid(),
  company_id          text not null references erp_companies(id),
  invoice_id          uuid not null references erp_tax_invoices(id) on delete cascade,
  line_no             integer not null,
  source_so_line_id   uuid null,
  item_code           text null,
  barcode             text null,
  description         text not null,
  quantity            numeric(18,3) not null default 1,
  unit                text null,
  remaining_qty       numeric(18,3) not null default 0,
  unit_price_excl     numeric(18,4) not null default 0,
  unit_price_incl     numeric(18,4) not null default 0,
  line_total_excl     numeric(18,2) not null default 0,
  line_total_incl     numeric(18,2) not null default 0,
  warehouse_code      text null,
  price_source        text null,        -- 'SO' | 'PRICE_LIST' | 'MANUAL' | 'LAST_SALE'
  free_text           text null,
  unique (invoice_id, line_no)
);

create table erp_tax_invoice_print_events (
  id              uuid primary key default gen_random_uuid(),
  company_id      text not null,
  invoice_id      uuid not null references erp_tax_invoices(id) on delete cascade,
  printed_at      timestamptz not null default now(),
  copy_label      text not null check (copy_label in ('מקור','העתק')),
  rendered_by     uuid null,
  user_agent      text null
);
```

**Triggers:**
- `erp_tax_invoices_close_trg` — on `status` transitioning to `CLOSED`: assign `invoice_number` from `nextval('erp_tax_invoice_seq_<company>_<series>_<year>')`, format `invoice_number_label` (e.g. `SI260000123`), seal `closed_at`, post GL JE.
- `erp_tax_invoices_no_alter_after_close_trg` — block updates of material columns when `status` ∈ (`CLOSED`, `PRINTED_ORIGINAL`, `REPRINTED`). Whitelist: `notes`, `print_count`, `printed_at_first`.
- `erp_tax_invoice_lines_no_alter_after_close_trg` — same, all-cols, no whitelist.

**Server actions:** `lib/marker-ofek/finance/t7-tax-invoice-actions.ts`
- `createTaxInvoiceDraftAction({ customerId, sourceSoId? | progressBillId? })` — auto-pulls lines.
- `closeTaxInvoiceAction(id)` — calls allocation API if applicable, sets status, returns `invoice_number`.
- `cancelTaxInvoiceAction(id, reason)` — issues credit memo, links via `cancelled_by_invoice_id`.
- `recordPrintEventAction(id)` — increments `print_count`, sets first-print timestamp, returns the right copy label.

**Closes:** R1, R3–R8, R13. Foundation for R5a, R9, R10, R14.

---

### 5.2 Phase **T7b — Visual-Parity PDF Renderer**

**Goal:** the printed PDF must look like the Lightman sample, side-by-side.

**File:** `components/marker-ofek/invoices/erp-tax-invoice-pdf.tsx` (new — coexists with legacy `mo-tax-invoice-pdf.tsx`).

**Concrete additions vs current renderer:**
1. Two unit-price columns: `מחיר` (excl) + `מחיר` (incl VAT) — using `unit_price_excl` and `unit_price_incl`.
2. `יתרה` (remaining-to-deliver) column populated from `remaining_qty`.
3. `מק"ט` + `ברקוד` columns.
4. **Code-39 barcode** of `invoice_number_label` rendered via SVG (no external libs — implement minimal Code-39 ourselves; ~80 LOC).
5. Vendor block extension: `withholding_id`, optional `website` + `email`.
6. Buyer block extension: `client_file_number` (תיק), phone, fax.
7. Header meta: `issue_time` (HH:mm), `value_date` separately from `issue_date`.
8. Payment block (bottom-left): `לתשלום | מס׳ פנימי | מס׳ עוסק לקוח | תיק | יתרה אחרי המסמך`.
9. Sign-off block (bottom-right): configurable signatories list from `erp_companies.signatories` JSONB.
10. SHA-256 footer (already present) — keep.
11. Original/Copy ribbon driven from `print_count = 0` (server-resolved) — UI gets `copyLabel` from `recordPrintEventAction` so it can never show wrong label.

**Closes:** R9, R16. Visual parity with Priority sample.

---

### 5.3 Phase **T7c — חשבוניות ישראל threshold + buyer-deductibility**

The existing `israel-tax-api.ts` works at the API level but lacks **threshold awareness** and **buyer-side warnings**.

**Adds:**
- Table `erp_tax_thresholds` keyed by year (5,000 / 10,000 / 20,000 / 25,000 ILS configurable). Seed:
  ```
  2024 → 25000
  2025 → 20000
  2026 → 10000
  2027 → 5000
  ```
- Helper `requiresAllocationNumber(invoice)` — boolean, year-aware.
- UI gate: when threshold met and `allocation_number is null`, the **CLOSE** button is disabled with tooltip "חשבוניות ישראל — נדרש מספר הקצאה".
- Vendor-side received-invoice flag in `erp_vendor_invoices`: when present and `allocation_number is null` while threshold applies → render "אזהרה: לא ניתן לדרוש מע״מ תשומות" badge.

**Closes:** R10.

---

### 5.4 Phase **T7d — PCN874 / INI856 / BKMVDATA Open Format**

We have `vat-readiness-actions.ts` partial. Promote to full ITA Spec 1.31 export under `/marker-ofek/finance/audit-export`.

**New module:** `lib/finance/israel-open-format/`
- `pcn874.ts` — periodic VAT report (revenue + input lines).
- `ini856.ts` — annual income statement schedule.
- `bkmvdata.ts` — full open-format ZIP with `INI`, `BKMVDATA.TXT`, `INDEX.XML` per spec 1.31.

UI: a single page that lets accountants pick a period and download the validated archive.

**Closes:** R11.

---

### 5.5 Phase **T7e — Long-term archive + immutability**

- **Archive:** every `recordPrintEventAction` call also pushes the rendered PDF bytes to `erp_tax_invoice_archives` (Supabase Storage bucket `tax-invoices/<company>/<yyyy>/<invoice_number_label>.pdf`) with a SHA-256 stored alongside.
- **Retention:** retention policy via `erp_tax_invoice_archives.retain_until = issue_date + interval '7 years 6 months'`.
- **Immutability:** RLS policy permits `SELECT` only, no `UPDATE`/`DELETE` for `authenticated` (only `service_role` for compliance officer break-glass).

**Closes:** R12, R17.

---

### 5.6 Phase **T7f — Batch programs (Priority parity)**

- Server action `closeTaxInvoicesBatchAction({ filter })` mirroring Priority's `סגירת חשבוניות מס` program.
- Server action `printTaxInvoicesBatchAction({ ids })` returning a single combined PDF or a ZIP.
- UI page `/marker-ofek/finance/tax-invoices/batch`.

**Closes:** Priority workflow parity (no compliance gap).

---

## 6. Sprint sizing & sequencing

| Phase | DDL | Server actions | UI surface | LOC budget | Dependencies | Suggested order |
| --- | --- | --- | --- | --- | --- | --- |
| T7a | 1 migration (~250 LOC) | 4 actions | none new | ~600 | — | **first** |
| T7b | none | 1 print recorder | 1 PDF component | ~700 | T7a | **second** |
| T7c | 1 migration (~50) | threshold helper | gate in close button | ~250 | T7a | parallel with T7b |
| T7d | 1 migration (1 archive table) | 3 exporters | 1 page | ~900 | T7a | after T7b |
| T7e | 1 migration (storage bucket setup) | archive hook | none | ~200 | T7b | after T7b |
| T7f | none | 2 batch actions | 1 page | ~500 | T7a, T7b | last |

Total estimated effort: **~3,200 LOC** across **5 migrations** + 12 server actions + 4 UI surfaces. With our current cadence, **~3 sprints** (T7 split into T7-α / T7-β / T7-γ).

---

## 7. Open questions for you (need a decision before T7a starts)

1. **Series prefix policy** — the sample uses `SI` + 6-digit serial. Do we want a single global prefix per company, or per-kind (`TI` for חשבונית מס, `CR` for זיכוי, …) per Priority's template approach?
2. **`internal_doc_number` semantics** — in the sample (`מס׳ 3038`) it looks like a contract / customer-deal reference. Should we wire it to `erp_client_contracts.contract_number`?
3. **Signatories JSON shape** — confirm the structure for `erp_companies.signatories` (`[{name, role, order}]`). Lightman's sample shows three: `שני / מרינה / חשבון`.
4. **Threshold table seed** — confirm the 2024–2027 progression matches the latest ITA notice, or override per legal counsel.
5. **Storage retention** — 7 years (VAT §22) or 10 (Income Tax §130)? Default I'd use is **10 years + 6 months** to satisfy both.

> When you give the green light I'll start with **T7a** (DDL + status triggers + server actions) — that one is the longest single piece of work and unblocks every other phase.
