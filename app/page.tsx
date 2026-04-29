import { redirect } from "next/navigation"

export default function RootPage() {
  // Security hard-stop: force all entry login flows through real Supabase auth routes.
  redirect("/auth/marker-ofek/login")
}