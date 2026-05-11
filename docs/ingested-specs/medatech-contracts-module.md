---
title: MedaTech Priority ERP Specification — Chapter 3 (Owner/Subcontractor Contracts) — Lihtman (2016)
source_file: c:\Users\user\Desktop\הנהלת חשבונות\איפיון מערכת ניהול.docx
source_pages: 17–22 (chapter 3 in the original DOCX)
source_date: 2016-10-18
vendor: MedaTech (medatech.com, Tirat Carmel)
customer: ל"טמן בע"מ
ingested_at: 2026-05-11
ingested_by: Cascade (Phase C.2 follow-up — preparing linked-entity owners resolver and W2 module)
status: canonical-reference
scope: Engineering-grade summary of MedaTech's contract management spec for Lihtman.
       Drives the design of `pbc_subcontractor_contracts` + `pbc_owner_contracts` and feeds
       the DMS `linked-entity owners` notification resolver.
related: docs/ingested-specs/medatech-priority-project-module.md (chapters 5+6)
---

# MedaTech Priority — Chapter 3: מזמין / קבלן (Contracts)

> **Ingestion note (Cascade):** Chapter 3 in the original DOCX (pages 17-22) was extracted
> via `System.IO.Compression.ZipFile` → `word/document.xml` → regex-stripped to plain text.
> Hebrew OCR-style typos in the original (`חוזר`, `שיט׳`, `מקור`, `ה.ש`) are normalized only
> when paraphrasing; verbatim quotes preserve the source. Screenshot OCR noise from contract
> entry mockups (lines ~658-1028, ~1061-1194 of the raw extract) was discarded.
>
> **Purpose:** This is the canonical reference for any future migration/UI/RPC work on the
> contracts module. Cite this file from migrations and PRs.

---

## §3.1 General — Contract Types and Lifecycle

### Contract types
The spec defines **three pricing methods** for an owner (מזמין) or subcontractor (קבלן) contract:

| Method | Hebrew | Semantics |
|---|---|---|
| **BOQ** | כתב כמויות | Itemized priced bill of quantities. Each line has qty + unit price. |
| **Lump-sum** | פאושלי | Milestone-based payments (`אבני דרך לתשלום`). No qty/price granularity. |
| **COST+** | COST+ | Cost-plus (margin over actuals). Same structure as BOQ but margin-driven. |

**Critical asymmetry:** The owner contract typically aggregates work; the subcontractor contract is **more granular** — i.e., one owner BOQ line can map to multiple subcontractor lines.

### Sides modelled
- **Owner contract** (`חוזה מזמין`) — לקוח (customer) side.
- **Subcontractor contract** (`חוזה קבלן`) — ספק (vendor) side.
- The same engine handles both; differences captured below.

### Storage
- Header table: `חוזים (מזמין)` / `חוזים (קבלן)` — single screen, RTL form.
- Detail tables (child screens): line items, change orders, advances, escalation, retention, offsets, discounts, partial accounts, attachments.
- Status workflow: `טיוטא` (draft) → review → `מאושר` (approved).

### Change-order discipline (critical rule)
> **"במידה ונדרשים לבצע שינוי בחוזה המקורי השינויים … לא יתבצעו על החוזה המקורי עצמו אלא יכנסו תעודות הנקראות הוראת שינוי שיקושרו לחוזה המקורי"**

Translation: **the original contract is immutable**. Changes are recorded as separate `הוראת שינוי` (change order) documents linked back to the original. At any point one can see:
- The **original contract** (frozen).
- The **list of change orders** (each with its own type: new line / qty change / price change).
- The **rolled-up "current contract"** = original + approved change orders.

This is the legal audit-trail principle and is non-negotiable in Israeli construction contracting.

### Per-line tax/discount overrides
For a **new line** added via change order (not a qty/price change), the user can choose whether the new line:
- inherits the contract's discount, escalation, advance, retention, offsets settings; **OR**
- gets its own per-line settings.
- Default: **inherit** from contract header.

---

## §3.2 Workflow — Owner and Subcontractor Process

> The flow is symmetric except: on the **owner side** there are TWO progress certificates per period — `submitted` (what we asked for) and `approved` (what they granted us). On the **subcontractor side** there is only one — what we approve.

### §3.2.1 Setting up a Contract (`הקמת חוזה מזמין/קבלן`)

Step-by-step (verbatim from spec):

1. **Customer/Vendor master data** — open the owner as a `לקוח` (customer) or the subcontractor as a `לקוח` (intentional spec wording — Priority models both as customers in the contracts subdomain).
2. **Project header** — open the project (`פרויקטים` screen). Required.
3. **Contract header** (`חוזים (מזמין)` / `חוזים (קבלן)`) — fields:
   - Project FK.
   - Planned start / planned finish dates.
   - Actual start / actual finish dates.
   - Warranty end date (`ת.סיום אחריות`).
   - Payment terms (e.g. "שוטף + 60").
   - **Default control subchapter** (`תת-פרק`) — links to `erp_proj_control_subchapters` (§5.2.1).
   - **Default control resource** (`משאב`) — links to `erp_proj_control_resources` (§5.2.4). Required for subcontractor contracts; the resource IS the cost-control identity of this subcontractor.
   - **Approval chain code** (`קוד רשימת מאשרים`) — Priority's role-based approval routing.
   - Maximum retention amount cap (`סכום מקסימלי לעכבון`).
   - **Status:** opens in `טיוטא` (draft).
4. **Contract lines** (`חוזים-פירוט`):
   - Line number / hierarchy code (e.g. `00.01.01.0010` — supports up to 5 levels).
   - Description.
   - Quantity, unit of measure, unit price.
   - Subchapter override (per-line, optional — defaults from header).
   - **Lump-sum flag** per line (a single contract may mix BOQ lines with lump-sum lines).
5. **Child screens — financial conditions:**
   - **`מקדמה` (Advance)** — amount received + recovery method (e.g. "deduct equal % from each progress cert until reclaimed").
   - **`הצמדה` (Escalation/Indexation)** — currency, index (CPI / construction inputs / basket of indices), base date.
   - **`עכבון` (Retention)** — fixed % or fixed amount per progress cert. Capped by `סכום מקסימלי לעכבון`.
   - **`קיזוזים` (Offsets/Withholdings)** — insurance, security/site-supervision, etc. Configurable per category.
   - **`הנחות` (Discounts)** — line-level or contract-level.
6. **Attachments** (`קישור מסמכים/נספחים נדרשים לחוזה`) — link spec PDFs, drawings, terms. **This is the integration point for the DMS module** (each contract gets a folder/document under `pbc_subcontractor_contracts.contract_dms_folder_id`).
7. **Approval** (`אישור החוזה`) — runs the configured approval chain; on full approval, status advances and the contract becomes immutable for non-change-order edits.

### §3.2.1.1 BOQ Change Orders (`הוראות שינוי`)

**Triggers:** can be created either:
- From an open partial account screen (most common), OR
- Directly from the contract header (when no open partial account exists).

**Types** (must pick one):
1. **New line** (`שורה חדשה`) — full new BOQ row. Categorized as `חריג` (out-of-scope variation) or `עבודות נוספות` (additional works).
2. **Quantity change** (`שינוי כמות`) — references original line; user enters **the delta** (positive or negative), not the new total.
3. **Price change** (`שינוי מחיר`) — references original line; user enters the price delta.

**Workflow:**
- User fills in the change order rows.
- Runs the program `יצירת הוראות שינוי` (Create Change Orders) — direct invocation from contract header.
- **Validation:** all new lines must have non-zero price (else the program rejects). [Engineering note: this is enforced at the SQL/RPC level in Priority; we should mirror in `pbc_create_change_order` RPC.]
- The change order goes to status `מאושר` (approved) — **no separate approval workflow needed** for change orders (per spec verbatim: "יסומן סטאטוס מאושר מפני שלא נדרש תהליך אישורים להוראת שינוי"). [Engineering note: this is a configurable choice; modern practice would route through approval chain. Make it a system parameter `CONTRACT_CHANGE_ORDER_REQUIRES_APPROVAL` with default `false` for Lihtman parity but `true` for new customers.]
- Once a change order is **linked to a partial account** (chesbon helki), it cannot be modified or cancelled until that partial account is itself reverted/cancelled.

### §3.2.2 Partial Accounts (`חשבון חלקי`) — Progress Certificates

This is **the core financial transaction** of the contracts module.

#### Partial Account Header

- Date (the month being billed for).
- Contract FK.
- Approval chain code.
- **Final flag** (`חשבון סופי`) — when set, system defaults to refund all retention + reclaim outstanding advance (overridable manually).
- Status: opens in `טיוטא` (draft).

#### Auto-population
On creation, the system **automatically loads**:
- All contract lines (current = original + approved change orders).
- All approved change orders not yet billed.
- All financial-condition rows (escalation row, advance recovery row, retention row, offset rows) — values to be calculated when the program below runs.

#### Reporting per line
For each line, user reports ONE of:
- **Quantity executed** (this period).
- **% complete** (cumulative).
- **Lump-sum amount** (for lump-sum lines).

#### Calculation program — `חישוב התייקרות מצטברת לחשבון חלקי`
Direct-run from the partial account screen. Computes:
- Cumulative escalation per line based on contract escalation index settings vs. current month.
- Advance recovery per the contract's recovery method.
- Retention per the contract's % or fixed amount.
- Offsets per the contract's offset settings.
- Updates the relevant rows in the partial account detail.

#### Manual offsets/retention overrides
On the child screen `פרטי עכבונות/קיזוזים לחשבון חלקי`:
- Add **ad-hoc offsets** (e.g., a fine on the subcontractor for late delivery).
- Manually trigger **retention refund** (e.g., for a final partial account).

#### Raw-material offset reporting
- Run `שורות קיזוז ח"ג` (raw material offset rows) — see §3.3 below.

#### Output: Print and Submit
- For subcontractor: print the partial account, send to subcontractor, request VAT invoice for that amount.
- For owner: print as `חשבון מוגש` (submitted progress cert).

### §3.2.2.1 Submitted vs Approved (Owner side only)

The owner often approves only PART of what we submitted. So the system maintains **two parallel ledgers**:
- `חשבון מוגש` — what we submitted to the owner.
- `חשבון מאושר` — what the owner approved.

Stored in two **child screens** of the same partial account:
- `סכומים מוגשים לחשבון חלקי` (submitted amounts).
- `סכומים מאושרים לחשבון חלקי` (approved amounts).

#### Program — `עדכון חשבון חלקי לפי מאושר` (Update Partial Account by Approved)

**Inputs:**
- Project (from project list).
- Contract # (from approved-for-execution contract list).
- Partial account # (from partial accounts list, excluding cancelled).
- **Mode:** `הצבה לסעיפים` (per-line placement) **OR** `הצבה לסה"כ` (total-only placement).

**If "per-line placement"** — second input screen asks:
- **Source:** `מוגש נוכחי` (current submitted) **OR** `מאושר קודם` (previous approved).
- Then opens `פרטי חשבון מאושר` screen with editable columns: % cumulative, cumulative qty, cumulative amount.

**If "total-only placement"** — opens `סה"כ לחשבון מאושר` with editable columns:
- Cumulative amount.
- Cumulative contract amount before escalation (approved).
- Cumulative variations amount before escalation (approved).
- Cumulative escalation amount (approved).
- Cumulative incl. escalation (approved).
- Cumulative grand total (approved).
- Net payable this period (approved).
- After total entry, opens `חלוקת סכום לפני התייקרות על מדדים` to allocate the approved sum across the contract's escalation indices.

**Re-running:** to fix a placement, re-run the program; the editable columns pre-fill with what was previously entered.

### §3.2.2.2 Aggregate-only Submitted (`חשבון מוגש מרוכז`)

For cases where the owner has its own ERP and demands data entry there, leading to dual-entry effort. The PM can enter the submitted partial account in **aggregate form** (just the total) on a child screen `חשבון מוגש מרוכז`.

**Constraint:** if submitted is entered in aggregate form, the **approved partial account cannot be entered in detailed form** — must also be aggregate.

### §3.2.3 Linking Invoice to Partial Account (`חשבונית מרכזת מזמין/קבלן`)

- Vendor invoice (subcontractor side) or customer invoice (owner side) is created **based on** the partial account.
- Basing the invoice on the partial account causes auto-population of the invoice detail from the partial account.
- For owner side, the auto-populate source (submitted vs approved) is configured by a **system constant** (`קבוע מערכת`) — system parameter, candidate name: `CONTRACT_INVOICE_OWNER_BASE_MODE` with values `submitted` | `approved`.

---

## §3.3 Raw Material Offset (`קיזוז חומר גלם`)

### Business case
When a project buys raw materials (rebar, concrete, fittings) **on behalf of a subcontractor** (the subcontractor was supposed to supply them but didn't), the cost must be recovered from the subcontractor's progress payments.

### Design rationale (verbatim, important):
> **"קיזוז זה יתבצע בחשבון החלקי ולא יהיה חלק מהחוזה על מנת שלא להקטין בצורה מלאכותית את היקף החוזה"**

Translation: the offset is done at the **partial account** level, **not** at the contract level — so the contract value (and thus the subcontractor's reported scope/turnover) is **not artificially reduced**. This is critical for both the subcontractor's bonding/credit ratings and for our internal cost-control reporting.

### Implementation stage (configurable)

System constant determines **at which procurement stage** the offset is triggered:
- `purchase_order` — at PO creation.
- `goods_receipt` — at goods receipt (קבלת סחורה מספק).
- `vendor_invoice` — at vendor invoice approval.

→ Candidate system parameter: `RAW_MATERIAL_OFFSET_TRIGGER_STAGE` enum with values above. Default per Lihtman: `vendor_invoice`.

### Process

1. On the **subcontractor contract** (`חוזים (קבלן)`), define **offset commission %** (`אחוז עמלה`). May be 0%. This is the procurement service fee charged to the subcontractor on top of the offset itself.
2. Link the **purchase order** to the subcontractor's contract (FK on PO header to the contract).
3. When the partial account is created for that contract, the system **automatically adds**:
   - One **offset row** per linked PO/invoice/GRN (depending on stage), reducing the partial account total by the procured amount.
   - One **commission row** = `offset_amount * commission_pct`.
4. Detail of which PO/GRN/invoice documents were offset is shown on a child screen of the partial account.

### Recalculation program — `חישוב קיזוז חו"ג בחשבון חלקי`

If a partial account is already created (still in draft) and a new PO is issued for offset against that partial account before the partial account is approved, run this program. It:
- Recomputes offset amounts based on current source documents.
- Updates offset rows.
- Updates commission row.
- Updates the linked source-document list on the child screen `תעודות לקיזוז בחשבון`.

### Edge case — partial allocation

If a PO is for materials **shared between** the subcontractor and the project (only part is for the subcontractor and the PO can't be split), the offset row is **entered manually** on `פרטי עכבונות/קיזוזים לחשבון חלקי` rather than auto-populated.

### Cost-control linkage (interplay with §6)

> **"תת-פרק ומשאב בהזמנה יהיו תת-פרק ומשאב בחשבון חלקי (סכום 0 בסה״כ עבור הרכש - עלות במשאב הקבלן תקטן כי קוזז לו סכום מהחשבון בגין רכש החומר גלם)"**

Translation: the subchapter + resource on the PO must equal the subchapter + resource on the offset row in the partial account. The net cost-control effect:
- Project bears 0 incremental cost from the PO (the subcontractor pays).
- Subcontractor's resource (`משאב הקבלן`) gets a credit equal to the offset amount, reducing the gross subcontractor cost by exactly that amount.

This keeps the §6 (cost control) ledger consistent.

---

## Engineering implementation map (for our codebase)

| Spec section | Our table / RPC / file | Status |
|---|---|---|
| §3.1 contract types | `pbc_subcontractor_contracts.pricing_method` enum (`boq` \| `lump_sum` \| `cost_plus`) | ⚠️ Partially modelled. No `cost_plus` enum value yet. |
| §3.1 owner vs subcontractor | `pbc_owner_contracts` + `pbc_subcontractor_contracts` (separate tables) OR unified `pbc_contracts.party_role` enum | ❌ Owner contracts not modelled. |
| §3.1 change-order immutability | `pbc_contract_amendments` | ⚠️ Schema exists (per memory `64819da6` ref to W2). Need to verify rule that original lines are read-only post-approval. |
| §3.1 per-line discount/escalation overrides | `pbc_contract_boq_lines.{discount_pct, escalation_settings_jsonb}` | ❌ TBD. |
| §3.2.1 contract financial conditions | child tables: `pbc_contract_advances`, `pbc_contract_escalation_settings`, `pbc_contract_retention_settings`, `pbc_contract_offsets`, `pbc_contract_discounts` | ❌ All TBD. |
| §3.2.1 attachment integration → DMS | `pbc_subcontractor_contracts.contract_dms_folder_id` FK to `dms_folders` | ⚠️ Not wired. **This is the unlock for C.2's `linked-entity owners` resolver.** |
| §3.2.1.1 change-order types | `pbc_contract_amendments.amendment_type` enum (`new_line` \| `qty_delta` \| `price_delta`) + `category` enum (`exception` \| `additional_works`) | ❌ TBD. |
| §3.2.1.1 change-order RPC | `pbc_create_change_order(contract_id, lines_jsonb)` with non-zero-price validation | ❌ TBD. |
| §3.2.2 partial account | `pbc_progress_certificates` (header) + `pbc_progress_certificate_lines` (detail) | ⚠️ Schema exists (W2). Need submitted/approved split. |
| §3.2.2 calc program | `pbc_compute_progress_cert_escalation_and_offsets(certificate_id)` RPC | ❌ TBD. Heavy logic. |
| §3.2.2.1 submitted vs approved | `pbc_progress_certificate_lines.{submitted_amount, approved_amount}` + `pbc_update_certificate_by_approved(certificate_id, mode, source)` RPC | ❌ TBD. |
| §3.2.2.2 aggregate-only mode | `pbc_progress_certificates.entry_mode` enum (`detailed` \| `aggregate`) + constraint blocking detailed approved if aggregate submitted | ❌ TBD. |
| §3.2.3 invoice linkage | FK on `erp_vendor_invoices.linked_progress_certificate_id` + system parameter `CONTRACT_INVOICE_OWNER_BASE_MODE` | ❌ TBD. |
| §3.3 raw material offset | `pbc_progress_certificate_offsets` (auto-populated) + system parameter `RAW_MATERIAL_OFFSET_TRIGGER_STAGE` | ❌ TBD. |
| §3.3 commission | `pbc_subcontractor_contracts.raw_material_offset_commission_pct` | ❌ TBD. |
| §3.3 recompute RPC | `pbc_recompute_raw_material_offset(certificate_id)` | ❌ TBD. |
| §3.3 manual offset | `pbc_progress_certificate_offsets.is_manual` flag | ❌ TBD. |

---

## DMS Phase C.2 unlock — `linked-entity owners` resolver

The C.2 notification recipient resolver currently has a `// TODO: linked-entity owners` stub
in `lib/marker-ofek/dms/dms-notifications.ts` (function `resolveLinkedEntityOwners`).

**With this spec, the resolver becomes well-defined:**

```ts
// For a document under folder X linked to contract Y:
// 1. SELECT pm_user_id, project_manager_id, accountable_user_id
//    FROM pbc_subcontractor_contracts WHERE contract_dms_folder_id = X
//    OR pbc_owner_contracts WHERE contract_dms_folder_id = X
// 2. SELECT erp_purchase_orders.created_by, approver_user_id
//    WHERE po.contract_id IN (contracts above)
// 3. dedup with ACL viewers + folder subscribers
```

**Action items unlocked by this ingest:**
1. Add `contract_dms_folder_id` FK to `pbc_subcontractor_contracts` (and the future `pbc_owner_contracts`).
2. Add a thin `lib/marker-ofek/dms/linked-entities-resolver.ts` that scans `dms_folders.linked_entity_type`/`linked_entity_id` (existing fields per `20260815120000_dms_phase_c1_foundations.sql`) and resolves owners per type.
3. In `dms-notifications.ts`, replace the stub with a call to that resolver.

---

## Open questions for the customer (decision needed before W2 implementation)

1. **Owner contracts (חוזה מזמין)** — model as a separate table or unified with subcontractor contracts behind `party_role` enum? Lihtman uses ONE Priority screen with internal switching. Our codebase leans separate-tables for RLS clarity. **Recommendation:** separate tables; share base type via TypeScript union.
2. **Change-order approval** — Lihtman bypasses approval. New customers may want it. **Recommendation:** make it a `CONTRACT_CHANGE_ORDER_REQUIRES_APPROVAL` system parameter (default `false` for parity, `true` for new tenants).
3. **Raw-material offset trigger stage** — three values per spec. **Recommendation:** ship all three, default `vendor_invoice` (Lihtman's choice).
4. **Owner submitted/approved enforcement** — should we **block** invoice creation when submitted is in aggregate mode but no approved exists? Spec is silent; Priority blocks. **Recommendation:** mirror Priority — block, raise UI hint.
5. **Multi-currency contracts** — spec mentions index/currency baskets but not explicitly multi-currency contracts. Israeli construction is mostly ILS, but international projects exist. **Decision deferred to MVP+1.**

---

## References

- Source DOCX: `c:\Users\user\Desktop\הנהלת חשבונות\איפיון מערכת ניהול.docx`, pages 17-22.
- Companion ingested specs: `medatech-priority-project-module.md` (chapters 5+6).
- DMS foundation migration: `supabase/migrations/20260815120000_dms_phase_c1_foundations.sql` (provides `dms_folders.linked_entity_type` / `linked_entity_id` already used here).
- Roadmap context: `docs/product/MARKER_OFEK_ENTERPRISE_PRD_AND_ROADMAP.md` §W2 (Subcontractor Management — Project Execution buy-in).

> **End of chapter 3 ingest. Next ingest target: chapter 8 (כספים) once we get to AR/AP polish.**
