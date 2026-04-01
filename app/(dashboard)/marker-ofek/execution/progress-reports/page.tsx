import { redirect } from "next/navigation"

/** נקודת כניסה לרשימת / יצירת דיווחי התקדמות */
export default function MarkerOfekProgressReportsIndexPage() {
  redirect("/marker-ofek/execution/progress-reports/new")
}
