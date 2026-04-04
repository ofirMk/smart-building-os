import { redirect } from "next/navigation"

/** Procurement module root — canonical entry is the Orders pillar. */
export default function ProcurementIndexPage() {
  redirect("/marker-ofek/procurement/orders")
}
