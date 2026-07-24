"use client"

/**
 * DemoDataSeederWidget — Sprint T9a admin tool.
 *
 * One-click "Inject Demo Pitch Data" + "Clear" controls that drive the
 * `seedDemoDataAction` / `clearDemoDataAction` server actions defined in
 * `lib/marker-ofek/admin/t9a-demo-seed-actions.ts`.
 *
 * Mounted inside `/marker-ofek/admin/finance-settings` (a logged-in admin
 * surface). Hidden behind a confirm dialog to prevent accidental wipes.
 */

import * as React from "react"
import { CheckCircle2, Loader2, Rocket, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  clearDemoDataAction,
  seedDemoDataAction,
  type SeedSummary,
} from "@/lib/marker-ofek/admin/t9a-demo-seed-actions"

interface Props {
  companyId: string
}

type LastAction =
  | { kind: "seed"; summary: SeedSummary; alreadySeeded: boolean }
  | { kind: "clear"; deleted: SeedSummary }
  | null

export function DemoDataSeederWidget({ companyId }: Props) {
  const [seeding, setSeeding] = React.useState(false)
  const [clearing, setClearing] = React.useState(false)
  const [last, setLast] = React.useState<LastAction>(null)

  async function handleSeed() {
    if (
      !window.confirm(
        "להזריק נתוני דמו לדשבורד הכספים?\n\nהפעולה אדיטיבית בלבד — לא תפגע בנתוני אמת קיימים.",
      )
    )
      return
    setSeeding(true)
    setLast(null)
    try {
      const res = await seedDemoDataAction({ companyId })
      if (!res.ok) {
        toast.error("הזרקת נתונים נכשלה", { description: res.error })
        return
      }
      if (res.alreadySeeded) {
        toast.info("נתוני דמו כבר קיימים — אין צורך להזריק שוב", {
          description: "השתמש בכפתור 'נקה דמו' כדי לאפס.",
        })
      } else {
        const s = res.summary
        toast.success("נתוני דמו הוזרקו בהצלחה! 🚀", {
          description: `${s.taxInvoices} חשבוניות · ${s.receipts} קבלות · ${s.apPayments} תשלומים · ${s.purchaseOrders} הזמנות פתוחות`,
        })
      }
      setLast({
        kind: "seed",
        summary: res.summary,
        alreadySeeded: res.alreadySeeded,
      })
    } catch (e) {
      toast.error("שגיאה לא צפויה", {
        description: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setSeeding(false)
    }
  }

  async function handleClear() {
    if (
      !window.confirm(
        "לנקות את כל נתוני הדמו (T9A) מהחברה הנוכחית?\n\nרק רשומות עם המרקר [T9A_DEMO_SEED] / DEMO-T9A- יימחקו. נתוני אמת לא ייפגעו.",
      )
    )
      return
    setClearing(true)
    setLast(null)
    try {
      const res = await clearDemoDataAction({ companyId })
      if (!res.ok) {
        toast.error("ניקוי נתוני דמו נכשל", { description: res.error })
        return
      }
      const d = res.deleted
      toast.success("נתוני דמו נמחקו", {
        description: `${d.taxInvoices} חשבוניות · ${d.receipts} קבלות · ${d.apPayments} תשלומים · ${d.purchaseOrders} הזמנות`,
      })
      setLast({ kind: "clear", deleted: d })
    } catch (e) {
      toast.error("שגיאה לא צפויה", {
        description: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setClearing(false)
    }
  }

  const busy = seeding || clearing

  return (
    <Card
      dir="rtl"
      className="space-y-4 border-2 border-dashed border-fuchsia-300/70 bg-gradient-to-br from-fuchsia-50/50 via-indigo-50/30 to-card p-5 lg:col-span-2"
      data-t9a-seeder-widget
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
            <Rocket className="size-5 text-fuchsia-600" aria-hidden />
            Sprint T9a — Executive Demo Data Seeder
          </h2>
          <p className="text-xs text-muted-foreground">
            הזרקה מיידית של 5 לקוחות, 3 פרויקטים, 15 חשבוניות מס, 10 קבלות, 5
            חשבוניות ספק, 5 תשלומים ו-3 הזמנות פתוחות — בלחיצה אחת. כל הרשומות
            מסומנות במרקר{" "}
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px]">
              [T9A_DEMO_SEED]
            </span>{" "}
            כך שניתן לנקות אותן בלי לפגוע בנתוני אמת.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            className="gap-2 bg-fuchsia-600 text-white shadow-md hover:bg-fuchsia-700"
            onClick={handleSeed}
            disabled={busy}
          >
            {seeding ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Rocket className="size-4" aria-hidden />
            )}
            🚀 Inject Demo Pitch Data
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 border-rose-300 text-rose-700 hover:bg-rose-50"
            onClick={handleClear}
            disabled={busy}
          >
            {clearing ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="size-4" aria-hidden />
            )}
            נקה נתוני דמו
          </Button>
        </div>
      </div>

      {last ? (
        <div className="rounded-lg border border-border bg-card/70 p-3 text-xs">
          {last.kind === "seed" ? (
            <div className="space-y-1">
              <p className="flex items-center gap-1.5 font-semibold text-emerald-700">
                <CheckCircle2 className="size-3.5" aria-hidden />
                {last.alreadySeeded
                  ? "נתוני דמו כבר קיימים — לא הוזרק כפילות"
                  : "הזרקה הושלמה"}
              </p>
              <SummaryGrid summary={last.summary} />
            </div>
          ) : (
            <div className="space-y-1">
              <p className="flex items-center gap-1.5 font-semibold text-rose-700">
                <Trash2 className="size-3.5" aria-hidden />
                ניקוי הושלם
              </p>
              <SummaryGrid summary={last.deleted} />
            </div>
          )}
        </div>
      ) : null}

      <p className="text-[10px] text-muted-foreground">
        ⚠️ פעולת אדמין. השתמש לפני דמו משקיעים בלבד. כל הנתונים שמוזרקים הם
        Mock ריאליסטיים מתעשיית הבנייה (מגדל יואל, פרויקט הרכס, בטון מוכן
        הצפון וכו&apos;) — לא משאירים עקבות שלא ניתנים לניקוי.
      </p>
    </Card>
  )
}

function SummaryGrid({ summary }: { summary: SeedSummary }) {
  const items: Array<{ label: string; value: number }> = [
    { label: "לקוחות", value: summary.customers },
    { label: "פרויקטים", value: summary.projects },
    { label: "ספקים", value: summary.suppliers },
    { label: "חוזים", value: summary.contracts },
    { label: "חשבוניות מס", value: summary.taxInvoices },
    { label: "קבלות", value: summary.receipts },
    { label: "חשבוניות ספק", value: summary.vendorInvoices },
    { label: "תשלומים", value: summary.apPayments },
    { label: "הזמנות פתוחות", value: summary.purchaseOrders },
  ]
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-center"
        >
          <p className="font-mono text-base font-bold tabular-nums text-foreground">
            {it.value}
          </p>
          <p className="text-[10px] text-muted-foreground">{it.label}</p>
        </div>
      ))}
    </div>
  )
}
