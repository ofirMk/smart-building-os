import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { TenantNewTicketForm } from "@/components/tenant/tenant-new-ticket-form"
import { buttonVariants } from "@/components/ui/button-variants"
import { cn } from "@/lib/utils"

export const metadata = {
  title: "קריאה חדשה",
}

export default function TenantNewTicketPage() {
  return (
    <div className="flex flex-col gap-6 pb-4 text-start">
      <div className="flex flex-col gap-3">
        <Link
          href="/tenant"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "-ms-2 h-9 w-fit gap-1 px-2 text-muted-foreground hover:text-foreground"
          )}
        >
          <ChevronRight className="size-4 rotate-180" aria-hidden />
          חזרה לראשי
        </Link>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">פתיחת קריאה</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            תארו את הבעיה או הבקשה — צוות הנכס יעדכן אתכם לפי סטטוס הקריאה.
          </p>
        </div>
      </div>

      <TenantNewTicketForm />
    </div>
  )
}
