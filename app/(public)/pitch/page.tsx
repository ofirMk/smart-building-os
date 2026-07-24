import { redirect } from "next/navigation"

/**
 * הדף הוסר מגישה ציבורית.
 * כל ניסיון לגשת ל-/pitch מפנה אל מסך ההתחברות.
 */
export default function PitchPage() {
  redirect("/")
}

