/**
 * Phase 9.1 — Suppliers Master/Detail (Priority-style).
 *
 * עוטף thin את `SuppliersListScaffold` שמחליף את הגירסה הקודמת מבוססת
 * ה-Sheet/Dialog (`SuppliersMasterDetailClient`). ראה
 * `docs/priority-suppliers-reference.md` להחלטות התכנון.
 */

import { SuppliersListScaffold } from "@/components/marker-ofek/master-data/suppliers/suppliers-list-scaffold"

export default function ProcurementSuppliersPage() {
  return <SuppliersListScaffold />
}
