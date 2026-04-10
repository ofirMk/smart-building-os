import { redirect } from "next/navigation"

export default function FinanceSuppliersPage() {
  redirect("/marker-ofek/master-data?tab=suppliers")
}
