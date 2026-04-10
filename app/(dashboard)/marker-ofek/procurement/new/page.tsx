import { redirect } from "next/navigation"

export default function ProcurementNewRedirectPage() {
  redirect("/marker-ofek/procurement?new=1")
}
