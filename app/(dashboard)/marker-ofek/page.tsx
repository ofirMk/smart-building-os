import { redirect } from "next/navigation"

/** נקודת כניסה היסטורית — מרכז הפיקוד הוא `/marker-ofek/command-center`. */
export default function MarkerOfekHubRedirectPage() {
  redirect("/marker-ofek/command-center")
}
