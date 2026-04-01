import { redirect } from "next/navigation"

/** נקודת כניסה ישנה — העמודה הראשית היא כעת /marker-ofek/projects */
export default function ProjectSetupPillarPage() {
  redirect("/marker-ofek/projects")
}
