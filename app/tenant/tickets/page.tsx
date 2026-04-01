import Link from "next/link"
import { Plus } from "lucide-react"

import { TenantTicketStatusBadge } from "@/components/tenant/tenant-ticket-status-badge"
import { buttonVariants } from "@/components/ui/button-variants"
import { Card, CardContent } from "@/components/ui/card"
import { getTenantAuthUser } from "@/lib/auth-tenant"
import { getTenantTicketsListForUser } from "@/lib/tenant-tickets"
import { cn } from "@/lib/utils"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

function formatTicketDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("he-IL", {
      dateStyle: "medium",
      timeStyle: "short",
    })
  } catch {
    return iso
  }
}

export default async function TenantTicketsPage() {
  const auth = await getTenantAuthUser()
  if (!auth) {
    redirect("/login")
  }
  const userId = auth.user.id

  const { data: tickets, error } = await getTenantTicketsListForUser(userId, 10)

  return (
    <div className="flex flex-col gap-4 pb-2 text-start">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">הקריאות שלי</h1>
        <p className="text-sm text-muted-foreground">
          מעקב אחרי קריאות שירות — עדכונים לפי סטטוס ותאריך.
        </p>
      </header>

      <div
        className={cn(
          "sticky top-0 z-20 -mx-4 border-b border-border/50 bg-background/90 px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/75"
        )}
      >
        <Link
          href="/tenant/tickets/new"
          className={cn(
            buttonVariants({ size: "lg" }),
            "h-12 w-full gap-2 text-base shadow-sm"
          )}
        >
          <Plus className="size-5" aria-hidden />
          צור קריאה חדשה
        </Link>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          לא ניתן לטעון קריאות: {error}
        </div>
      ) : tickets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-4 py-10 text-center">
          <p className="text-sm font-medium text-foreground">אין קריאות עדיין</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            לחצו על &quot;צור קריאה חדשה&quot; כדי לפתוח קריאת שירות ראשונה.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {tickets.map((t) => (
            <li key={t.id}>
              <Card className="overflow-hidden border-border/70 bg-card/60 shadow-sm transition-colors hover:border-border">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h2 className="min-w-0 flex-1 text-base font-semibold leading-snug text-foreground">
                        {t.title}
                      </h2>
                      <TenantTicketStatusBadge
                        status={t.status}
                        className="shrink-0"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      נוצר: {formatTicketDate(t.created_at)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
