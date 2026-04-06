"use client"

import Link from "next/link"
import * as React from "react"
import { ArrowRight, ClipboardList, Loader2, ScrollText } from "lucide-react"
import { toast } from "sonner"

import {
  saveDailyLog,
  type DailyLogWeather,
} from "../actions"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
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
import { Textarea } from "@/components/ui/textarea"
import {
  DIAMOND_TENDER_INTAKE_HREF,
  useDiamondNavigation,
} from "@/hooks/use-diamond-navigation"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { formatError } from "@/lib/utils"

type TenderOption = {
  id: string
  project_name_from_ai: string | null
  created_at: string
}

const WEATHER_OPTIONS: { value: DailyLogWeather; label: string }[] = [
  { value: "sunny", label: "☀️ שמש" },
  { value: "cloudy", label: "☁️ מעונן" },
  { value: "rain", label: "🌧️ גשם" },
  { value: "heat_wind", label: "🌬️ שרב/רוחות" },
]

function todayIsoDateLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export default function NewDailyLogPage() {
  useDiamondNavigation(undefined, { f2Href: DIAMOND_TENDER_INTAKE_HREF })
  const [tenders, setTenders] = React.useState<TenderOption[]>([])
  const [loadingTenders, setLoadingTenders] = React.useState(true)
  const [tenderId, setTenderId] = React.useState("")
  const [logDate, setLogDate] = React.useState(todayIsoDateLocal)
  const [weather, setWeather] = React.useState<DailyLogWeather>("sunny")
  const [workers, setWorkers] = React.useState("")
  const [workDescription, setWorkDescription] = React.useState("")
  const [safetyNotes, setSafetyNotes] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoadingTenders(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error } = await supabase
          .from("tenders")
          .select("id, project_name_from_ai, created_at")
          .order("created_at", { ascending: false })
        if (error) throw error
        if (!cancelled) setTenders((data ?? []) as TenderOption[])
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

  function resetForm() {
    setTenderId("")
    setLogDate(todayIsoDateLocal())
    setWeather("sunny")
    setWorkers("")
    setWorkDescription("")
    setSafetyNotes("")
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await saveDailyLog({
        tenderId,
        logDate,
        weather,
        workersOnSite: workers === "" ? 0 : Number(workers),
        workDescription,
        safetyQualityNotes: safetyNotes,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("היומן נשמר בהצלחה")
      resetForm()
    } catch (err) {
      toast.error(formatError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      dir="rtl"
      lang="he"
      className="mx-auto flex w-full max-w-lg flex-col gap-6 px-1 pb-16 pt-2 sm:max-w-xl sm:px-0"
    >
      <Link
        href="/marker-ofek/projects"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה לפרויקטים
      </Link>

      <header className="space-y-2 text-start">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-900 dark:text-amber-200">
            <ScrollText className="size-6" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              מודול 3.1 · פרויקטים
            </p>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              יומן עבודה יומי
            </h1>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          רישום מהיר לפיקח — מותאם לנייד (RTL).
        </p>
      </header>

      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-5">
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="text-start pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardList className="size-5 text-muted-foreground" aria-hidden />
              פרטי היום
            </CardTitle>
            <CardDescription>פרויקט, תאריך ומזג אוויר</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {tenders.length === 0 && !loadingTenders ? (
              <p className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                אין מכרזים במערכת. הוסיפו מכרז בקליטת חומרים לפני רישום יומן.
              </p>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="daily-tender">פרויקט (מכרז)</Label>
              <Select
                value={tenderId || undefined}
                onValueChange={(v) => setTenderId(v ?? "")}
                disabled={loadingTenders || tenders.length === 0}
              >
                <SelectTrigger id="daily-tender" className="w-full min-h-11">
                  <SelectValue placeholder="בחרו פרויקט…" />
                </SelectTrigger>
                <SelectContent diamondHref={DIAMOND_TENDER_INTAKE_HREF}>
                  {tenders.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {(t.project_name_from_ai ?? "ללא שם").trim() || "פרויקט"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="daily-date">תאריך יומן</Label>
              <Input
                id="daily-date"
                type="date"
                className="min-h-11"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="daily-weather">מזג אוויר</Label>
              <Select
                value={weather}
                onValueChange={(v) => setWeather(v as DailyLogWeather)}
              >
                <SelectTrigger id="daily-weather" className="w-full min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEATHER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader className="text-start pb-2">
            <CardTitle className="text-lg">כוח אדם ועבודה</CardTitle>
            <CardDescription>עובדים בשטח ותיאור ביצוע</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="daily-workers">מספר עובדים בביצוע</Label>
              <Input
                id="daily-workers"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                className="min-h-11"
                placeholder="0"
                value={workers}
                onChange={(e) => setWorkers(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="daily-work">תיאור עבודה / משימות שבוצעו</Label>
              <Textarea
                id="daily-work"
                className="min-h-[7rem] resize-y text-base sm:text-sm"
                rows={5}
                placeholder="לדוגמה: יריעות בגג כניסה, בדיקת יריעות הידרו…"
                value={workDescription}
                onChange={(e) => setWorkDescription(e.target.value)}
                required
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader className="text-start pb-2">
            <CardTitle className="text-lg">בטיחות ואיכות</CardTitle>
            <CardDescription>אופציונלי — חריגים, הערות פיקוח</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              id="daily-safety"
              className="min-h-[5rem] resize-y text-base sm:text-sm"
              rows={4}
              placeholder="תקלות, חוסרי ציוד, הערות איכות…"
              value={safetyNotes}
              onChange={(e) => setSafetyNotes(e.target.value)}
            />
          </CardContent>
        </Card>

        <Button
          type="submit"
          size="lg"
          className="min-h-12 w-full gap-2 text-base"
          disabled={submitting || loadingTenders || tenders.length === 0}
        >
          {submitting ? (
            <>
              <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden />
              שומר…
            </>
          ) : (
            "שמור יומן עבודה"
          )}
        </Button>
      </form>
    </div>
  )
}
