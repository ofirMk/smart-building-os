# 🏗️ SYSTEM ARCHITECTURE & INDEX

## 📂 Directory Map
* `/app/(dashboard)/`: Main authenticated application space. This MUST contain its own `layout.tsx` utilizing `<TopNavBar>`.
* `/app/(dashboard)/marker-ofek/...`: Domain-specific business modules (Procurement, Execution, Finance).
* `/components/layout/`: Structural wrappers (e.g., `TopNavBar.tsx`, `DenseMasterDetailTemplate.tsx`).
* `/components/ui/`: Base Shadcn/Radix primitive components.
* `/supabase/migrations/`: Database schema and seed scripts.

## 🛠️ The "Dense Master-Detail" Standard
All business screens must utilize the Master/Detail pattern:
1. **Master Panel (Top):** Key contextual data (Project, Supplier, Entity). Usually 3-4 columns wide, dense height.
2. **Tabs (Middle):** If a screen has multiple modes (e.g., Order Header vs. Order Lines), use `Tabs` to switch contexts without leaving the page.
3. **Detail Panel (Bottom):** Dense data grids (`Table`), highly interactive, full width.

## 🧾 Marker Ofek — הזמנת רכש (PO Workspace)
- **Default create PO (Phase 2.1 engine):** `components/marker-ofek/procurement/purchase-order-engine-form.tsx` — ribbon, dual header cards (supplier/project + mock budget insights), line grid with notes and row actions, footer with subtotal / מע״מ / grand total.
- **Legacy BoQ flow:** `app/(dashboard)/marker-ofek/procurement/purchase-orders/from-boq/page.tsx` — full tender/BoQ integration; server actions remain under `purchase-orders/new/actions.ts`.

## 📇 Marker Ofek — קטלוג פריטים טכני (Master-Detail)
- **Workspace:** `components/marker-ofek/catalog/technical-catalog-workspace.tsx` — פיצול 40%/60% (רשת מאסטר / כרטיס פרטים), בחירת שורה, טאבים: זיהוי, ספקים מקושרים, MRP, תמחיר.
- **Mock data:** `lib/marker-ofek/technical-catalog-workspace-data.ts` — רשימת מאסטר + `getCatalogWorkspaceDetail(sku)` לפרטי ERP דמה.

## 🚨 AI Work Protocol
Before generating new features:
1. Check this index and `.cursorrules`.
2. Locate the existing module folder.
3. Apply the `DenseMasterDetailTemplate`.
