import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div
      dir="rtl"
      lang="he"
      className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-4 text-center font-sans text-foreground"
    >
      <p className="text-sm font-medium text-muted-foreground">שגיאה 404</p>
      <h1 className="text-2xl font-semibold tracking-tight">
        הדף שביקשתם לא נמצא
      </h1>
      <Button render={<Link href="/" />} variant="secondary" size="lg">
        חזרה ללוח הבקרה
      </Button>
    </div>
  )
}
