# Data layer: indexing & query patterns (ORM-ready)

This document maps **Marker Ofek Zod/domain shapes** to suggested **physical indexes** for a relational store (Prisma, Drizzle, or equivalent). It is **not** executed code — it guides migrations when persisting mock-first modules.

## Conventions

- Prefer **composite indexes** that match filter + sort in list screens (`WHERE` + `ORDER BY`).
- Use **unique** constraints where the schema implies one row per business key (e.g. formal document number).
- High-cardinality filters (`projectId`, `billingMonth`) almost always need indexes for ERP-scale row counts.

---

## Projects & tenders (`project-schema.ts`)

| Logical entity | Suggested keys | Indexes (Prisma-style) |
|----------------|----------------|---------------------------|
| `Project` | `id`, `projectCode` (e.g. `PR…`), `status`, `clientName` (search) | `@@index([projectCode])`, `@@index([status])`, `@@index([startDate, endDate])` |
| `Tender` / quote lines | `projectId`, `createdAt` | `@@index([projectId, createdAt])` |

---

## Client billing (`client-billing-schema.ts`)

| Logical entity | Suggested keys | Indexes |
|----------------|----------------|---------|
| `ClientBillingDocument` | `projectId`, `billingMonth` (`yyyy-mm`), `documentStatus`, `formalSerial`, `applicationNumber` | `@@unique([formalSerial])` where non-empty; `@@index([projectId, billingMonth])`; `@@index([documentStatus, billingMonth])` |
| `ClientBillingLine` | `documentId`, line order | `@@index([documentId])` |

**Query pattern:** list applications for a project and month → `(projectId, billingMonth)` composite.

---

## Subcontractor billing (`subcontractor-billing-schema.ts`)

| Logical entity | Suggested keys | Indexes |
|----------------|----------------|---------|
| `SubcontractorBillingDocument` | `projectId`, `subcontractorId`, `billingMonth`, `invoiceNumber` | `@@index([projectId, billingMonth])`, `@@index([subcontractorId, billingMonth])`, `@@unique([subcontractorId, invoiceNumber])` (per business rules) |
| Line items | `documentId` | `@@index([documentId])` |

---

## HR / timesheets (`hr-schema.ts`)

| Logical entity | Suggested keys | Indexes |
|----------------|----------------|---------|
| `MonthlyTimesheet` | `month` (`yyyy-mm`), `orgId` / `siteId` if multi-tenant | `@@index([month])`, `@@unique([month, workerId])` or org-scoped composite |
| `TimesheetLine` | `timesheetId`, `workerName` / `workerId` | `@@index([timesheetId])` |

---

## Executive analytics (`executive-analytics-mock-data.ts`)

Aggregates are computed in **application code** from project snapshots. At DB scale:

- Store **facts** in normalized tables (`ProjectCostActual`, `ProjectRevenueRecognized`, …).
- Prefer **materialized views** or **nightly rollups** for CEO dashboards (`totalRevenueBilled`, `totalCosts` by company) to avoid full scans on every page load.
- Index foreign keys: `@@index([projectId])`, `@@index([periodMonth])` for time-series.

---

## Aggregation complexity (reference)

| Function | Complexity | Notes |
|----------|------------|--------|
| `computeExecutiveCompanyKpis` | O(P) | P = number of projects in the slice |
| `computeBillingDeductions` | O(C) | C = change-order lines |
| `computeMonthlyTotalHours` | O(1) | Per worker row |
| Client billing `transform` | O(L + C) | L = BOQ lines — single pass over lines |
