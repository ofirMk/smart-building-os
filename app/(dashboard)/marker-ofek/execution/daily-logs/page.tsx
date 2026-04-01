import { redirect } from "next/navigation"

/** נקודת כניסה ליומני עבודה */
export default function MarkerOfekDailyLogsIndexPage() {
  redirect("/marker-ofek/execution/daily-logs/new")
}
