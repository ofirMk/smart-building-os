import { redirect } from "next/navigation"

/** נקודת כניסה מרכזית — הלוגיקה נשארת במסלול הביצוע הקיים. */
export default function FinancePartialsEntryPage() {
  redirect("/marker-ofek/execution/progress-reports")
}
