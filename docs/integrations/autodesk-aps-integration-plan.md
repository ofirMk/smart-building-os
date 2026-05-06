# Autodesk APS — Integration Blueprint (Future Roadmap)

> **Status:** Planning only — no code, no migrations have been written for this integration. The document is the source of truth for *what we will build* once the business prerequisites (developer account, billing, DPA) are completed.
>
> **Owner:** מהנדס רכש אוטונומי (Phase E+)
> **Created:** 2026-05-07
> **Linked discussion:** chat session re: DWG/DXF/IFC support and Holy-Grail engineering precision.

---

## 0. Strategic context

The autonomous procurement copilot today consumes **PDF → PNG via pdfjs-dist** and uses **gpt-4o vision** to *estimate* lengths from rasterised drawings. That gives ±7% accuracy and requires the user to provide scale (1:50, 1:100, …).

**Autodesk Platform Services (APS, formerly Forge)** would let us consume the original CAD/BIM artefact (DWG, RVT, IFC) and extract:

- **Layer-scoped geometry** (`SUM(LINE.length) WHERE layer="EL_TRAY_100"`) — millimetre precision, no ML guessing.
- **Block instances** (sockets, panels, brackets) with attribute payload.
- **BIM property database** (RVT/IFC) — manufacturer, model, material, volumes — already structured.
- **Versioning** through BIM 360 / Autodesk Construction Cloud, so revision changes flow back to us automatically.

This document is the implementation plan once we are cleared to start.

---

## 1. Business prerequisites (BLOCKER — done outside engineering)

| # | Item | Owner | ETA |
|---|------|-------|-----|
| 0.1 | **Path decision**: DXF-only (free) vs APS Standard (~$200/m) vs APS Enterprise (~$2k/m) | Product / CTO | 1–2h workshop |
| 0.2 | **Annual cloud-credits budget** (each DWG translation ≈ \$0.10–2) | Finance | 1 day |
| 0.3 | **Pricing model to customer** — premium add-on? per-drawing? bundled? | Product | 1 week |
| 0.4 | **Privacy / DPA** — drawings ship to Autodesk EU/US servers; ToS clause + DPA addendum | Legal | 3–5 days |

> Until rows 0.1 and 0.4 are signed off, **no engineering work begins**.

---

## 2. Account & credentials (Step 1 — 1 day)

1. Open Autodesk Developer Account → <https://aps.autodesk.com>.
2. Create app in Console:
   - Name: `Smart Building OS — Procurement`
   - APIs enabled: **Data Management API**, **Model Derivative API**, **Authentication API** (3-legged OAuth recommended for per-user document scope).
3. Capture **Client ID** and **Client Secret**.
4. Configure callback URL:
   `https://app.markerofek.co.il/api/autodesk/callback`
5. Vercel env vars (production + preview):
   ```
   AUTODESK_CLIENT_ID=
   AUTODESK_CLIENT_SECRET=
   AUTODESK_BUCKET_KEY=marker-ofek-drawings
   AUTODESK_CALLBACK_URL=https://app.markerofek.co.il/api/autodesk/callback
   ```
6. Mirror env vars to Supabase Edge Functions runtime if any APS calls run server-less.

---

## 3. Database schema (Step 2 — 1–2 days)

> **Important:** the SQL below is **planning only** — it lives in this document and **must not be migrated yet**. When ready, copy into a new file `supabase/migrations/<timestamp>_autodesk_drawings_schema.sql`.

### 3.1 Convention compliance

- `company_id` is `text` (mirror of `erp_companies.id`).
- All tables enable RLS with `public.user_has_company_access(company_id)`.
- All tables have `created_at` / `updated_at`. `updated_at` is maintained by `public.set_updated_at()` trigger (canonical since 2025-03-22).

### 3.2 `erp_drawings` — uploaded artefact registry

```sql
create table if not exists public.erp_drawings (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  project_id uuid null,
  storage_provider text not null
    check (storage_provider in ('supabase','autodesk_oss')),
  storage_url text not null,                -- supabase storage path OR APS objectId/urn
  original_filename text not null,
  file_format text not null
    check (file_format in ('dwg','dxf','rvt','ifc','pdf','dgn','nwd')),
  file_size_bytes bigint not null check (file_size_bytes > 0),
  uploaded_by uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_drawings_filename_nonempty
    check (length(trim(original_filename)) > 0),
  constraint erp_drawings_company_project_fk
    foreign key (company_id, project_id)
    references public.erp_proj_projects (company_id, id)
    on delete set null
);

create index if not exists erp_drawings_company_project_idx
  on public.erp_drawings (company_id, project_id);
create index if not exists erp_drawings_company_created_idx
  on public.erp_drawings (company_id, created_at desc);
```

### 3.3 `erp_drawing_translations` — APS Model Derivative job tracking

```sql
create type public.erp_drawing_translation_status as enum (
  'PENDING','INPROGRESS','SUCCESS','FAILED','TIMEOUT'
);

create table if not exists public.erp_drawing_translations (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  drawing_id uuid not null references public.erp_drawings (id) on delete cascade,
  aps_urn text not null,                          -- base64-encoded APS urn
  status public.erp_drawing_translation_status not null default 'PENDING',
  output_format text not null check (output_format in ('svf2','obj','stl','dwg','dxf')),
  manifest_json jsonb not null default '{}'::jsonb,
  cost_credits numeric(12,4) null,
  error_code text null,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null
);

create index if not exists erp_drawing_translations_drawing_idx
  on public.erp_drawing_translations (drawing_id, status);
create index if not exists erp_drawing_translations_company_status_idx
  on public.erp_drawing_translations (company_id, status, created_at desc);
```

### 3.4 `erp_drawing_quantities` — Quantity Take-off (QTO) outputs

```sql
create type public.erp_drawing_entity_type as enum (
  'LINE','POLYLINE','ARC','CIRCLE','BLOCK','MESH','SOLID','OTHER'
);

create table if not exists public.erp_drawing_quantities (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  drawing_id uuid not null references public.erp_drawings (id) on delete cascade,
  layer_name text not null,
  entity_type public.erp_drawing_entity_type not null,
  total_length_m numeric(14,4) null check (total_length_m is null or total_length_m >= 0),
  total_area_sqm numeric(14,4) null check (total_area_sqm is null or total_area_sqm >= 0),
  count integer not null default 0 check (count >= 0),
  raw_properties jsonb not null default '{}'::jsonb,
  matched_assembly_id uuid null
    references public.erp_md_product_assemblies (id) on delete set null,
  matched_confidence numeric(4,3)
    check (matched_confidence is null or (matched_confidence >= 0 and matched_confidence <= 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists erp_drawing_quantities_drawing_layer_idx
  on public.erp_drawing_quantities (drawing_id, layer_name);
create index if not exists erp_drawing_quantities_assembly_idx
  on public.erp_drawing_quantities (matched_assembly_id)
  where matched_assembly_id is not null;
```

### 3.5 `erp_drawing_layer_mappings` — per-company learning store

```sql
create table if not exists public.erp_drawing_layer_mappings (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  layer_pattern text not null,           -- regex or glob
  assembly_id uuid not null
    references public.erp_md_product_assemblies (id) on delete cascade,
  default_supplier_id uuid null
    references public.erp_md_suppliers (id) on delete set null,
  confidence_threshold numeric(4,3) not null default 0.85,
  is_active boolean not null default true,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_drawing_layer_mappings_pattern_nonempty
    check (length(trim(layer_pattern)) > 0)
);

create unique index if not exists erp_drawing_layer_mappings_uq
  on public.erp_drawing_layer_mappings (company_id, layer_pattern, assembly_id);
```

### 3.6 RLS + triggers (apply to all four tables)

```sql
alter table public.erp_drawings              enable row level security;
alter table public.erp_drawing_translations  enable row level security;
alter table public.erp_drawing_quantities    enable row level security;
alter table public.erp_drawing_layer_mappings enable row level security;

create policy erp_drawings_tenant on public.erp_drawings
  for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));
-- (repeat for translations, quantities, layer_mappings)

create trigger erp_drawings_updated_at
  before update on public.erp_drawings
  for each row execute function public.set_updated_at();
-- (repeat for translations, quantities, layer_mappings)
```

---

## 4. APS OAuth flow (Step 3 — 2–3 days)

```
4.1  Route: /api/autodesk/auth/start
        → 302 to https://developer.api.autodesk.com/authentication/v2/authorize
          ?client_id=…&response_type=code&scope=data:read data:write data:create

4.2  Route: /api/autodesk/callback
        → exchange code for access_token + refresh_token
        → encrypted-at-rest store in erp_integrations (encrypted column / KMS)

4.3  Helper: lib/autodesk/aps-client.ts
        - getAccessToken(companyId): caches in memory + refreshes via refresh_token
        - uploadFile(buffer, filename) → urn
        - translateModel(urn, outputFormat) → translation job id
        - pollManifest(urn) → status JSON
        - downloadDerivative(urn, derivativeUrl) → SVG | properties JSON

4.4  UI: Settings → Integrations → "Connect Autodesk"
        - Connect button → /api/autodesk/auth/start
        - Status pill: "Connected as <user>" / "Not connected"
        - Disconnect button → revokes tokens + nulls erp_integrations row
```

---

## 5. Drawing upload flow (Step 4 — 2–3 days)

```
5.1  Route: POST /api/procurement/drawings/upload (multipart/form-data)
        - Accepts: dwg, dxf, rvt, ifc
        - Stage 1: Supabase Storage put (durable backup + RLS)
        - Stage 2: stream to APS bucket (uploadFile)
        - Stage 3: kick off translateModel (svf2 + properties)
        - Returns: { drawingId, translationId } → UI starts polling

5.2  Route: GET /api/procurement/drawings/:id/status
        - Reads cached manifest; if stale, polls APS
        - Returns: { status, progress, derivatives?[], error? }

5.3  Route: GET /api/procurement/drawings/:id/quantities
        - Once status=SUCCESS:
          - downloads metadata-tree
          - groups entities by (layer, entity_type)
          - sums total_length / total_area / count
          - persists to erp_drawing_quantities
        - Returns aggregated rows

5.4  UI: app/(dashboard)/marker-ofek/procurement/drawings/page.tsx
        - List of drawings (filter by project)
        - Click → side-by-side: APS Viewer iframe + quantities table
        - Per-row: assembly autocomplete + supplier picker + "Add to PO"
```

---

## 6. Auto-mapping engine (Step 5 — 3–4 days)

For each unique `layer_name` in a drawing:

1. Look up matching pattern in `erp_drawing_layer_mappings` (regex match on `layer_pattern`).
2. If no match: ask LLM (cheap model — `gpt-4o-mini`) "given layer name `<X>` and the assembly catalog `<list>`, which is the best match? Return JSON `{ assembly_id, confidence }`".
3. If `confidence ≥ threshold`: auto-write to `erp_drawing_quantities.matched_assembly_id`. Else flag `null` for manual review.
4. UI offers a "Save mapping for next drawing" checkbox that persists the chosen mapping.

---

## 7. AI Copilot integration (Step 6 — 1–2 days)

Add a new tool to `app/api/procurement/autonomous-po/chat/route.ts`:

```ts
analyze_uploaded_drawing: tool({
  description: "מנתח שרטוט שכבר הועלה דרך עמוד Drawings ומחזיר QTO אוטומטי",
  inputSchema: z.object({ drawingId: z.string().uuid() }),
  execute: async ({ drawingId }) => {
    const { data } = await supabase
      .from("erp_drawing_quantities")
      .select("*, matched_assembly:erp_md_product_assemblies(*)")
      .eq("drawing_id", drawingId)
    return { layers: data ?? [] }
  },
})
```

System prompt addition:

> "If the user references a drawing by ID or filename (`'תוכנית הקומה -1'`), look up `erp_drawings` first and call `analyze_uploaded_drawing` instead of the vision flow. The vision flow is the fallback for raster-only inputs."

---

## 8. Testing & pilot (Step 7 — 1–2 weeks)

| Metric | Target |
|--------|--------|
| Time from upload → PO draft | < 5 minutes |
| Auto-mapping accuracy (no manual fix) | > 80% |
| Manual line corrections by procurement person | < 10% of lines |
| Translation success rate (APS) | > 95% |
| End-to-end E2E test coverage | DWG-fixture → upload → translate → QTO → match → draft PO |

---

## 9. Production rollout (Step 8 — ongoing)

- Soft launch to **Premium tier** customers only.
- Hebrew documentation + 3-minute video tutorial.
- Monitoring: translation failure rate, credit spend per company, P95 upload-to-PO latency.
- Pricing options on the table:
  - **Flat add-on**: ₪500 / company / month
  - **Pay-per-drawing**: ₪10 / drawing translation
  - **Volume tiers**: 50 / 200 / 1000 drawings per month

---

## 10. Schedule summary

| Step | Effort | Depends on |
|------|--------|-----------|
| 0 — Decisions | 1–2 weeks | — |
| 1 — Account | 1 day | Step 0 |
| 2 — Schema | 1–2 days | — |
| 3 — OAuth | 2–3 days | Step 1 |
| 4 — Upload | 2–3 days | Step 3 |
| 5 — Auto-mapping | 3–4 days | Step 4 |
| 6 — AI tool | 1–2 days | Step 5 |
| 7 — Pilot | 1–2 weeks | Step 6 |
| 8 — Launch | ongoing | Step 7 |

**Total engineering: ~3–4 person-weeks full-time, or 6–8 weeks alongside other work.**

---

## 11. Critical first action (non-engineering)

A 15-minute call with **Autodesk Sales** unlocks:

- Exact pricing quote per expected volume.
- 90-day free Sandbox tenant (pilot without billing).
- Onboarding engineer who walks through OAuth + sample DWG translation.

> **Recommendation:** schedule that call before any engineering kickoff. Steps 1 and 4 cannot complete without it.

---

## Appendix A — Open-source fallback strategy

If APS budget is not approved, the **DXF + IFC** path covers ~95% of the Israeli market without recurring cost:

- **DXF** via `dxf-parser` (npm, MIT) — covers AutoCAD users.
- **IFC** via `web-ifc` (MIT, WASM, runs in browser) — covers Revit/BIM users.
- **PDF** flow stays as last-resort raster fallback (already implemented).

That stack is documented separately under `docs/integrations/cad-bim-open-source-strategy.md` (TBD).
