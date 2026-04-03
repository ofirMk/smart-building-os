"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { ArrowRight, Loader2, Save, X } from "lucide-react"
import { toast } from "sonner"

import { createProject } from "../actions"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { formatError } from "@/lib/utils"
import type { MarkerOfekTenderRow } from "@/types/marker-ofek"

/** ערך ב-Select ל«ללא מכרז» — לא UUID; מנורמל ל-null בשרת */
const TENDER_NONE_VALUE = "none"
const CREATED_PROJECT_STORAGE_KEY =
  "marker-ofek:projects:newly-created-id"

function tenderLabel(t: MarkerOfekTenderRow): string {
  const name = t.project_name_from_ai?.trim()
  if (name) return name
  const d = t.tender_date_target?.trim()
  if (d) return `מכרז · ${d}`
  return `מכרז ${t.id.slice(0, 8)}…`
}

export default function NewMarkerOfekProjectPage() {
  const router = useRouter()
  const [tenders, setTenders] = React.useState<MarkerOfekTenderRow[]>([])
  const [loadingTenders, setLoadingTenders] = React.useState(true)
  const [tenderId, setTenderId] = React.useState<string>("")
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoadingTenders(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error } = await supabase
          .from("tenders")
          .select("id, project_name_from_ai, tender_date_target, consultant_name_from_ai, created_at, updated_at")
          .order("updated_at", { ascending: false })
        if (error) throw error
        if (!cancelled) setTenders((data ?? []) as MarkerOfekTenderRow[])
      } catch (e) {
        if (!cancelled) toast.error(formatError(e))
      } finally {
        if (!cancelled) setLoadingTenders(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      const target = event.target as HTMLElement | null
      const tagName = (target?.tagName ?? "").toLowerCase()
      const isInteractiveTarget =
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        tagName === "button" ||
        Boolean(target?.closest("[contenteditable='true']")) ||
        Boolean(target?.closest("[role='combobox']"))
      const hasOpenOverlay =
        document.querySelector("[data-slot='select-content']") != null ||
        document.querySelector("[data-slot='dropdown-menu-content']") != null
      if (isInteractiveTarget || hasOpenOverlay) return
      event.preventDefault()
      router.push("/marker-ofek/procurement/invoices/new")
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [router])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const tid = tenderId.trim()
    if (tid && tid !== TENDER_NONE_VALUE) fd.set("tender_id", tid)
    else fd.delete("tender_id")

    setSubmitting(true)
    try {
      const result = await createProject(fd)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("הפרויקט נוצר")
      try {
        localStorage.setItem(CREATED_PROJECT_STORAGE_KEY, result.projectId)
      } catch {
        // ignore storage errors
      }
      router.push("/marker-ofek/procurement/invoices/new")
    } catch (err) {
      toast.error(formatError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 pb-10">
      <Link
        href="/marker-ofek/projects"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה לפרויקטים
      </Link>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/60">
          <CardTitle>הקמת פרויקט חדש</CardTitle>
          <CardDescription>
            שם פרויקט ושם לקוח. שיוך למכרז זוכה אופציונלי (מסלול קליטת מכרזים).
          </CardDescription>
          <p className="text-xs text-muted-foreground">
            לחץ ESC לחזרה למסך החשבונית הקודם.
          </p>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label htmlFor="name">שם הפרויקט</Label>
              <Input
                id="name"
                name="name"
                required
                autoComplete="off"
                placeholder="לדוגמה: מגדלי הרצליה"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client_name">שם הלקוח</Label>
              <Input
                id="client_name"
                name="client_name"
                autoComplete="organization"
                placeholder="כפי שיוצג במרכז הפרויקט"
              />
            </div>
            <div className="space-y-2">
              <Label>מכרז זוכה (אופציונלי)</Label>
              {loadingTenders ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  טוען מכרזים…
                </p>
              ) : tenders.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  אין מכרזים במערכת.{" "}
                  <Link
                    href="/marker-ofek/pre-construction/tender-intake"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    פתחו קליטת מכרז
                  </Link>
                </p>
              ) : (
                <div className="flex items-center gap-1">
                  <Select
                    value={tenderId.trim() ? tenderId : TENDER_NONE_VALUE}
                    onValueChange={(v) =>
                      setTenderId(
                        !v || v === TENDER_NONE_VALUE ? "" : v
                      )
                    }
                  >
                    <SelectTrigger
                      className="min-w-0 flex-1"
                      onKeyDown={(e) => {
                        if (e.key === "Delete" || e.key === "Backspace") {
                          e.preventDefault()
                          setTenderId("")
                        }
                      }}
                    >
                      <SelectValue placeholder="בחרו מכרז או ללא שיוך" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TENDER_NONE_VALUE}>
                        ללא שיוך (פרויקט עצמאי)
                      </SelectItem>
                      {tenders.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {tenderLabel(t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
                    title="ניקוי בחירת מכרז"
                    aria-label="ניקוי בחירת מכרז"
                    onClick={() => setTenderId("")}
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                אפשר להשאיר ריק (פרויקט עצמאי), לנקות ב־Del/Backspace או בלחיצה על X.
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-wrap justify-end gap-2 border-t border-border/60 pt-4">
            <Button
              type="button"
              variant="outline"
              render={<Link href="/marker-ofek/projects" />}
            >
              ביטול
            </Button>
            <Button type="submit" disabled={submitting || loadingTenders}>
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  שומר…
                </>
              ) : (
                <>
                  <Save className="size-4" aria-hidden />
                  צור פרויקט
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
