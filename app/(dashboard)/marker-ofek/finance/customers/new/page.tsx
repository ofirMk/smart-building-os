import { redirect } from "next/navigation"

/** יהלום F2 — מפנה לטופס לקוח קיים */
export default function FinanceCustomersNewRedirectPage() {
  redirect("/marker-ofek/customers/new")
}
