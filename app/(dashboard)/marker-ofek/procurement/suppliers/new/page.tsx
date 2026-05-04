/**
 * Phase A — `/marker-ofek/procurement/suppliers/new`
 *
 * דף יצירת ספק חדש בעקבות Priority SOP LB22000321 (ראה
 * `docs/architecture/supplier-card-spec.md`).
 *
 * Server Component thin wrapper סביב הטופס client.
 */

import { NewSupplierForm } from "@/components/marker-ofek/master-data/suppliers/new-supplier-form"

export const dynamic = "force-dynamic"

export default function NewSupplierPage() {
  return <NewSupplierForm />
}
