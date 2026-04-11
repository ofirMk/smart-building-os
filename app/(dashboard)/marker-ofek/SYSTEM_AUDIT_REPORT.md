# Marker Ofek — System Audit & Gap Analysis

**Scope:** `app/(dashboard)/marker-ofek/**` (all `page.tsx` routes)  
**Reference standards:** Tier-1 ERP patterns (SAP S/4, Priority / similar), internal **Jimmy Standard** (premium white UI, high density, RTL, `framer-motion` where appropriate, avoid nested scroll traps and gratuitous `dark:`).  
**Method:** Static review of route inventory, representative component scans (`dark:`, `overflow-y-auto` / `overflow-auto`), navigation overlap, and module naming. No runtime QA or accessibility tooling in this pass.

---

## Executive summary

| Finding | Severity |
|--------|----------|
| **Route surface area is very large** (~137 `page.tsx` files) with overlapping concepts (multiple “home”/dashboard variants, parallel finance hubs, duplicate supplier/customer entry paths). | High — consolidation risk |
| **Jimmy Standard adherence is inconsistent**: many screens correctly use `bg-white` / `border-slate-200`; several routes or shared clients still reference `dark:` overrides or scrollable inner regions. | Medium |
| **SAP/Priority parity**: core flows (PO, invoices, projects, Gantt, subcontractor billing) are represented with rich UI in places; others are thin shells, demos, or navigational stubs. | Mixed |
| **Dense Master-Detail** (`ARCHITECTURE_INDEX.md`) is not uniformly applied — many pages are standalone or experimental. | Medium |

**Legend — Status**

- **PASS:** Fits stated purpose; architecture broadly aligned; no critical duplication or blocking UX issue identified from static review.
- **PARTIAL:** Usable but gaps vs SAP/Priority depth, Jimmy inconsistencies, or known friction.
- **FAIL:** Placeholder, superseded duplicate, or material architectural/UX violation for Tier-1 bar.

---

## Cross-cutting gates (module-wide)

| Gate | Assessment |
|------|----------------|
| **1. Purpose & completeness** | Varies by route; finance/procurement/project hubs tend to be deeper; roadmap, nav-preview, system-map are meta/dev-oriented. |
| **2. Duplication** | Multiple dashboard-like and finance entry points — see **Duplication register** below. |
| **3. Architectural standard** | Workspace layout (`MarkerOfekWorkspaceLayout`) enforces RTL chrome; individual pages vary. `dark:` appears in multiple app and client files under `marker-ofek` (grep-based). Nested `overflow-y-auto` appears in several heavy clients (dialogs, long forms) — acceptable if isolated; problematic when the whole hub scrolls inside a scroll. |
| **4. Professional parity** | Strong interactive prototypes in places; full SAP-grade master data governance, audit trails, and role-based field-level control are not evidenced uniformly. |
| **5. Frictionless ERP UX** | Keyboard paths and command palette are improving; density and Hebrew RTL are generally good; screen count increases cognitive load without a single canonical IA. |

### Duplication register (candidates for merge / deprecation review)

| Area | Routes / pattern | Note |
|------|------------------|------|
| Landing / overview | `/marker-ofek`, `/dashboard`, `/command-center`, `/executive`, `/field-execution`, `/financial-control` | Overlapping “control tower” metaphors — pick canonical home per persona. |
| Finance entry | `/finance`, `/finance/centralized`, `/billing`, `/finance/billing`, `/finance/contracts-billing` | Multiple billing/finance entry surfaces — align with single finance hub + deep links. |
| Customers / entities | `/entities`, `/entities/suppliers`, `/finance/customers`, `/customers/new`, `/contracts/create-client` | Overlapping CRM / master-data creation — clarify entity vs finance customer. |
| Suppliers | `/supply-chain/suppliers`, `/procurement/suppliers`, `/finance/suppliers` | Three supplier list concepts — consolidate or rename scopes. |
| Invoices | `/invoices/new`, `/finance/invoices/new`, `/procurement/invoices/new` | Intentional module split possible — document; else confusing. |
| Projects | `/projects/setup`, `/project-setup`, `/projects/new` | Similar naming — merge or differentiate clearly. |

---

## Route audit by area

Routes are listed as URL paths under `/marker-ofek` (omit prefix in table for brevity).

### Core & navigation

| Route | Status | Purpose (short) | Gap analysis / fixes |
|-------|--------|-----------------|------------------------|
| `/` (page.tsx) | PARTIAL | Marker Ofek entry / redirect hub | Clarify vs command-center; ensure single primary landing. |
| `/dashboard` | PARTIAL | Dashboard shell | Overlaps `/executive`, `/command-center` — consolidate KPI ownership. |
| `/command-center` | PASS | Module grid / command surface | Strong “premium” candidate; keep as canonical ops home if agreed. |
| `/nav-preview` | PARTIAL | Nav preview (dev/demo) | Mark internal-only or remove from prod nav. |
| `/roadmap` | PARTIAL | Product roadmap | Not Tier-1 ERP; fine as internal — hide from operators. |
| `/schedule` | PARTIAL | Schedule view | Validate vs execution Gantt; avoid duplicate planning truth. |
| `/master-data` | PARTIAL | Master data hub | Ensure links match `/entities`, `/items`, `/catalog`. |

### Procurement & supply chain

| Route | Status | Purpose | Gap analysis / fixes |
|-------|--------|---------|------------------------|
| `/procurement` | PASS | Procurement hub | Continue aligning with PO/receive/catalog subroutes. |
| `/procurement/page` (hub) | — | (same) | — |
| `/procurement/[id]` | PARTIAL | PO / document detail | Standard SAP: status, lines, approvals, goods movement — verify completeness. |
| `/procurement/new` | PARTIAL | New procurement flow | Align with `/purchase-orders/new` IA. |
| `/procurement/orders` | PASS | Orders list | — |
| `/procurement/purchase-orders/new` | PARTIAL | PO creation (large client) | Tier-1: approval matrix, budget check, attachment policy — extend. |
| `/procurement/purchase-order-delivery-flow` | PASS | Delivery flow demo | Document as workflow lab or merge into receive. |
| `/procurement/receive` | PASS | Goods receipt | Parity: three-way match UI explicitly. |
| `/procurement/receipt/[id]` | PARTIAL | Receipt detail | — |
| `/procurement/catalog` | PASS | Catalog | Link to items master consistency. |
| `/procurement/inventory` | PARTIAL | Inventory | Warehouse depth vs SAP IM — gap if only list. |
| `/procurement/suppliers` | PARTIAL | **Duplicates** supply-chain suppliers | **Merge or scope** (approved vs all). |
| `/procurement/aging` | PARTIAL | Aging | Clarify AP vs procurement aging vs finance aging report. |
| `/procurement/reconciliation` | PARTIAL | Reconciliation | — |
| `/procurement/reconciliation/inventory-progress` | PARTIAL | Sub-recon | — |
| `/procurement/ai-import` | PARTIAL | AI import | Governance: validation queue — SAP MDG-lite. |
| `/procurement/ai-import/pending-allocation` | PARTIAL | Pending allocation | — |
| `/procurement/assets` | PARTIAL | Assets | Fixed asset link to finance FA? |
| `/procurement/categories-setup` | PARTIAL | Categories | Master-data governance. |
| `/procurement/delivery-notes/new` | PARTIAL | Delivery notes | Integration with receive/PO. |
| `/procurement/invoices/new` | PARTIAL | Procurement-side invoice | Overlap with `/finance/invoices/new` — document. |
| `/procurement/warehouse-outgoing` | PARTIAL | Outgoing | WMS parity limited without bins/batches. |
| `/supply-chain/suppliers` | PARTIAL | Supplier list | **Duplicate naming** with procurement/finance — consolidate. |
| `/suppliers/new` | PARTIAL | New supplier | Overlap with `/entities/new` — single wizard preferred. |

### Finance

| Route | Status | Purpose | Gap analysis / fixes |
|-------|--------|---------|------------------------|
| `/finance` | PASS | Finance hub | Good anchor; reduce parallel “centralized” confusion. |
| `/finance/centralized` | PARTIAL | Alternate finance surface | **Duplicate hub risk** — merge into `/finance` tabs. |
| `/finance/billing` | PASS | Billing workspace | — |
| `/finance/billing/new` | PARTIAL | New billing | Tie to contract/partial account model. |
| `/finance/contracts/[id]` | PARTIAL | Contract finance | SAP: milestones, retention, tax — verify all on one screen. |
| `/finance/contracts/billing/[partialId]` | PARTIAL | Partial billing | Core ERP strength — test edge cases. |
| `/finance/contracts-billing` | PARTIAL | Listing | Overlap with billing routes — naming. |
| `/finance/customers` | PARTIAL | Customers | Overlap `/entities` + `/finance/customers/new`. |
| `/finance/customers/new` | PARTIAL | New customer | Single master-data entry preferred. |
| `/finance/customers/[id]` | PARTIAL | Customer 360 | Strong direction; nested scroll in client — review Jimmy gate. |
| `/finance/invoices` | PASS | Invoices list | — |
| `/finance/invoices/new` | PARTIAL | New invoice | Tax authority / numbering — ensure legal completeness. |
| `/finance/invoices/[id]/print` | PASS | Print | — |
| `/finance/journal-entries/new` | PARTIAL | JE posting | SAP: posting period, reversal, approval. |
| `/finance/gl-accounts` | PARTIAL | Chart of accounts | COA versioning and segment reporting. |
| `/finance/payments` | PARTIAL | Payments | Bank file, approval — Priority-grade payment run. |
| `/finance/payments/masav` | PARTIAL | MASAV | Israeli-specific — compliance checklist. |
| `/finance/reconciliations` | PARTIAL | Reconciliation | — |
| `/finance/reports/aging` | PASS | AR/AP aging | Clarify procurement aging overlap. |
| `/finance/bank-statements/new` | PARTIAL | Bank import | — |
| `/finance/receipts/new` | PARTIAL | Receipts | — |
| `/finance/vat-report` | PARTIAL | VAT | Legal reporting completeness. |
| `/finance/vat-readiness` | PARTIAL | Readiness | — |
| `/finance/indexation` | PARTIAL | Indexation | Contract indexation rules. |
| `/finance/partials` | PARTIAL | Partials list | — |
| `/finance/retention` | PARTIAL | Retention | — |
| `/finance/variations` | PARTIAL | Variations | CO / VO process vs SAP. |
| `/finance/overhead` | PARTIAL | Overhead | Cost centers — CO parity. |
| `/finance/pnl` | PARTIAL | P&L | Drill-down to JE. |
| `/finance/clearance` | PARTIAL | Clearance | Terminology vs banking clearance. |
| `/finance/contract-vault` | PARTIAL | Vault | — |
| `/finance/subcontractor-accounts` | PASS | Subcontractor billing hub | Key differentiator — keep investing. |
| `/finance/suppliers` | PARTIAL | Finance suppliers | **Triplicate** with procurement/supply-chain — unify or scope. |
| `/billing` | PARTIAL | Billing (top-level) | **Overlap** `/finance/billing` — merge routes. |
| `/financial-control` | PARTIAL | Financial control tower | Overlaps `/finance` and `/executive`. |
| `/partner-finance` | PARTIAL | Partner finance | — |
| `/partner-finance/[projectId]` | PARTIAL | Project partner view | Access control critical. |

### Projects & execution

| Route | Status | Purpose | Gap analysis / fixes |
|-------|--------|---------|------------------------|
| `/projects` | PASS | Project list | — |
| `/projects/new` | PARTIAL | New project | SAP: WBS template, org, plant. |
| `/projects/setup` | PARTIAL | Setup wizard | Overlap `/project-setup`. |
| `/project-setup` | PARTIAL | Setup | **Duplicate naming** — merge. |
| `/projects/[id]` | PASS | Project 360 hub | Recent master hub — extend live data. |
| `/projects/[id]/daily-log` | PARTIAL | Daily log | Mobile + offline story. |
| `/projects/[id]/contract-ai` | PARTIAL | Contract AI | Governance of AI outputs. |
| `/projects/[id]/gantt-editor` | PARTIAL | Gantt editor | vs `/execution/gantt/[id]` — single editor truth. |
| `/projects/contracts/billing/[partialId]` | PARTIAL | Billing from project | Cross-link to finance partial billing. |
| `/execution/gantt` | PASS | Planning Gantt (mock) | Wire to `/execution/gantt/[id]` for real data. |
| `/execution/gantt/[id]` | PASS | Project Gantt | Core execution. |
| `/execution/gantt/[id]/field` | PARTIAL | Field view | — |
| `/execution/gantt/[id]/subcontractor` | PARTIAL | Sub view | — |
| `/execution/daily-logs` | PASS | Daily logs | — |
| `/execution/daily-logs/new` | PARTIAL | New log | Photos, weather, manpower — field completeness. |
| `/execution/progress-reports` | PARTIAL | Progress reports | — |
| `/execution/progress-reports/new` | PARTIAL | New report | — |
| `/execution/resources` | PARTIAL | Resources | SAP PPM / capacity — shallow unless extended. |
| `/execution/plans` | PARTIAL | Plans | — |
| `/execution/wbs/node/[nodeId]` | PARTIAL | WBS node | — |
| `/execution/wbs/task/[taskId]` | PARTIAL | Task | — |
| `/execution/field/floor-handover/[projectId]` | PARTIAL | Handover | QA signoff matrix. |
| `/execution/field/snags/[projectId]` | PARTIAL | Snags | — |
| `/execution/diamond-workspace/[projectId]` | PARTIAL | Diamond workspace | Specialist UX — document audience. |
| `/field-execution` | PARTIAL | Field execution | Overlap `/execution/*` — consolidate nav. |
| `/handover` | PARTIAL | Handover | vs floor-handover — merge naming. |

### Pre-construction & tenders

| Route | Status | Purpose | Gap analysis / fixes |
|-------|--------|---------|------------------------|
| `/pre-construction` | PARTIAL | Pre-construction hub | — |
| `/pre-construction/tender-intake` | PARTIAL | Tender intake | — |
| `/pre-construction/tender-pricing` | PARTIAL | Tender pricing | — |
| `/tenders` | PARTIAL | Tenders | — |
| `/tenders/boq` | PARTIAL | BOQ | — |
| `/tenders/pricing` | PARTIAL | Pricing | — |
| `/tenders/wbs` | PARTIAL | WBS | — |
| `/tenders/comparison` | PARTIAL | Comparison | — |

### Contracts, entities, catalog, items

| Route | Status | Purpose | Gap analysis / fixes |
|-------|--------|---------|------------------------|
| `/contracts` | PARTIAL | Contracts list | — |
| `/contracts/new` | PARTIAL | New contract | — |
| `/contracts/select-type` | PARTIAL | Type picker | — |
| `/contracts/create-client` | PARTIAL | Create client | Overlap `customers/new`. |
| `/contracts/create-subcontractor` | PARTIAL | Create sub | Overlap `entities/new`. |
| `/contracts/[id]` | PARTIAL | Contract detail | — |
| `/contracts/[id]/edit` | PARTIAL | Edit | Versioning — SAP CLM lite. |
| `/entities` | PASS | Entities | Master data backbone. |
| `/entities/new` | PARTIAL | New entity | Tax IDs, bank — full SAP BP fields. |
| `/entities/[id]` | PARTIAL | Entity detail | — |
| `/entities/suppliers` | PARTIAL | Suppliers under entities | Overlap procurement lists. |
| `/customers/new` | PARTIAL | New customer | **Duplicate** entity/customer creation paths. |
| `/catalog/items` | PARTIAL | Catalog items | Align with `/items` and procurement catalog. |
| `/items` | PASS | Items master | — |
| `/items/new` | PARTIAL | New item | Material type, valuation class — SAP MM fields. |
| `/items/[id]` | PARTIAL | Item detail | — |
| `/sales-orders/new` | PARTIAL | Sales order | SD parity if used in construction context. |

### Settings, system, onboarding

| Route | Status | Purpose | Gap analysis / fixes |
|-------|--------|---------|------------------------|
| `/settings` | PASS | Settings | — |
| `/settings/company` | PARTIAL | Company | — |
| `/settings/modules` | PARTIAL | Modules | — |
| `/settings/smart` | PARTIAL | Smart settings | Naming clarity. |
| `/settings/system-rules` | PARTIAL | Rules | — |
| `/settings/user-permissions` | PARTIAL | Permissions | SAP: role vs permission matrix — depth TBD. |
| `/settings/users/ai-setup` | PARTIAL | AI setup | Admin-only — hide from operators. |
| `/system/health` | PARTIAL | Health | Ops — OK internal. |
| `/system-map` | PARTIAL | System map | Dev diagram — not ERP operator screen. |
| `/onboarding/sandbox` | PARTIAL | Sandbox | Training — label clearly. |

### Budget, executive, invoices (root), Holden bridge

| Route | Status | Purpose | Gap analysis / fixes |
|-------|--------|---------|------------------------|
| `/budget` | PASS | Budget | WBS / project budget control — strengthen vs SAP PS. |
| `/executive` | PARTIAL | Executive dashboard | **Overlap** command-center/dashboard. |
| `/invoices/new` | PARTIAL | Invoice generator (root) | **Overlap** `finance/invoices/new` — dangerous duplication. |
| `/holden-erp` | PARTIAL | Holden ERP bridge | Intentional secondary shell — style may diverge. |
| `/holden-erp/contracts/[id]` | PARTIAL | Holden contract | — |
| `/holden-erp/partial-accounts/[id]` | PARTIAL | Partial account | — |

---

## Jimmy Standard checklist (sampled)

| Criterion | Observation |
|-----------|-------------|
| `bg-white` / light surfaces | Common; workspace chrome is white-first. |
| `border-slate-200` | Widely used; some `border-slate-100` variants — acceptable. |
| RTL | Layout and `dir="rtl"` enforced in key shells; verify every leaf page. |
| `dark:` usage | Present in multiple `marker-ofek` TSX files — **FAIL gate 3** where product mandates strict light-only (remove or isolate). |
| Nested scroll | Several clients use `overflow-y-auto` for panels — **review case-by-case**; fail if main canvas scrolls inside scroll. |
| `framer-motion` | Used in TopNavBar, command-center, project hub — not universal; optional enhancement backlog. |

---

## Recommended next steps (prioritized)

1. **IA consolidation:** One operator home (`/command-center` or `/finance` + role), retire or hide redundant dashboards (`/dashboard`, `/executive`, `/financial-control` overlap).  
2. **Master data:** Single path for Business Partner creation (customer/supplier/subcontractor) with tax, bank, payment terms — SAP BP-style.  
3. **Remove `dark:`** from Marker Ofek surfaces where `.cursorrules` requires light-only, or document explicit exceptions.  
4. **Scroll audit:** For each FAIL on nested scroll, convert to single-page flow or sticky master with one scroll container.  
5. **SAP parity backlog:** Approval workflows, audit log, posting periods, and document attachments on financial and procurement objects.

---

**Report generated:** static analysis — re-run after major refactors.  
**Owner:** Engineering + Product (Ophir / Project Lead).
