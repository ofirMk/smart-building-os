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

## 🚨 AI Work Protocol
Before generating new features:
1. Check this index and `.cursorrules`.
2. Locate the existing module folder.
3. Apply the `DenseMasterDetailTemplate`.
