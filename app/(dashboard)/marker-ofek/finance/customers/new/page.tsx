import { redirect } from "next/navigation"

/** נתיב יחיד לשותפים עסקיים — ישות מסוג לקוח */
export default function FinanceCustomersNewRedirectPage() {
  redirect("/marker-ofek/entities/new?kind=client&lock=1")
}
