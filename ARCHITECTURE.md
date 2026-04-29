# Smart Building OS Architecture

## Architectural North Star
Smart Building OS is a **Modular Monolith** designed for B2B multi-tenant SaaS in construction ERP.
The system must behave as one coherent product while preserving strict domain boundaries.

## 1) Modular Monolith (Strict)

### Bounded Contexts
- Master Data
- Projects & Budget Control
- Procurement
- Execution & QA
- Finance
- Contracts
- AI Operations

### Layering Contract (per context)
- **Domain:** entities, invariants, business rules.
- **Application:** use-cases and orchestration.
- **Infrastructure:** Supabase adapters, external APIs, storage.
- **Interface:** App Router pages/components and API handlers.

### Non-Negotiable Rules
- No cross-context direct table coupling from UI.
- No duplicate API families for the same capability.
- Legacy modules are allowed only through explicit adapter boundaries.
- Every production mutation is traceable with audit metadata.

## 2) Multi-Tenant SaaS Data Security (Non-Negotiable)

### Tenant Isolation Rules
- Every business table must include `company_id`.
- Every query/mutation must be scoped by `company_id`.
- Every API context must resolve active company context before data access.
- Every Row-Level Security policy must enforce tenant boundaries.

### RLS Policy Standard
- `SELECT/UPDATE/DELETE` policy must restrict rows to tenant ownership.
- `INSERT` policy must validate tenant ownership on write (`with check`).
- `authenticated` + `using (true)` is forbidden for tenant business tables.

### Access Context Chain
- Session identity via Supabase auth.
- Active company via approved request/cookie context.
- Role-based access checks at API/service layer.
- DB-level RLS as final enforcement layer.

## 3) AI Operations Bus (Core Engine, not Side Feature)

### Mission
AI is a proactive operations engine, not a UI add-on.

### Core Components
- **Event Producers:** emit typed events from ERP actions (PO lifecycle, OCR upload, schedule drift).
- **AI Job Orchestrator:** enqueue, retry, dead-letter, and prioritize jobs.
- **Decision Engine:** produce typed recommendations with confidence/explanations.
- **Human Approval Gates:** required for financial or contract-impacting writes.
- **Audit Trail:** immutable record of input, model, output, approver, and final action.

### Initial AI Pipelines (Target)
- Hebrew BOQ OCR normalization and classification.
- Predictive schedule delay risk from execution + procurement signals.
- Voice-to-daily-log ingestion for field teams.

### AI Safety Contract
- AI outputs cannot directly mutate financial/legal records without policy approval.
- Every AI decision must be reversible and attributed.

## 4) Delivery and Governance

### Build Quality Gates
- `npm run lint`
- `npx tsc --noEmit`
- `npm run test`
- No hidden compile exclusions for active production domains.

### Change Governance
- Canonical data ownership is defined in `docs/architecture/canonical-data-contracts.md`.
- Recovery execution is tracked in `docs/architecture/7-DAY-RECOVERY-SPRINT.md`.
- Architecture deviations require explicit CTO approval and document updates.
