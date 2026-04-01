import Link from "next/link"
import { Zap } from "lucide-react"

import { buttonVariants } from "@/components/ui/button-variants"
import { cn } from "@/lib/utils"

export default function TenantEvPage() {
  return (
    <div className="flex flex-col gap-6 text-start">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">חיוב טעינה</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          צפייה בסשנים ובחיובים חודשיים לרכב החשמלי.
        </p>
      </div>
      <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border/80 bg-muted/20 p-6 text-center">
        <Zap className="mx-auto size-10 text-muted-foreground/70" aria-hidden />
        <p className="text-sm text-muted-foreground">
          סיכומי קוט״ש וחשבוניות — במסך ניהול הטעינה
        </p>
        <Link
          href="/ev-management"
          className={cn(buttonVariants({ variant: "secondary" }), "mt-2 justify-center")}
        >
          מעבר לניהול טעינה
        </Link>
      </div>
    </div>
  )
}
