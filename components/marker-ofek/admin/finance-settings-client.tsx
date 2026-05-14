"use client"

/**
 * FinanceSettingsClient — interactive editor for tenant-level finance knobs.
 *
 * v1 persistence: LocalStorage keyed by `t7c:finance-settings:<companyId>`.
 * The shape (`FinanceSettings`) is intentionally small + stable so a future
 * server-side persistence layer (e.g. `erp_companies.finance_settings_json`)
 * can adopt it without UI changes.
 */

import * as React from "react"
import { CheckCircle2, Loader2, Plus, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

export interface FinanceSettings {
  itaAllocationThresholdNis: number
  brandLogoUrl: string
  signatories: string[]
  retentionOfTitleClause: string
}

function storageKey(companyId: string) {
  return `t7c:finance-settings:${companyId}`
}

function defaultSettings(defaultThresholdNis: number): FinanceSettings {
  return {
    itaAllocationThresholdNis: defaultThresholdNis,
    brandLogoUrl: "",
    signatories: ["", "", ""],
    retentionOfTitleClause:
      "כל הסחורות המסופקות נשארות בבעלות החברה עד למילוי מלוא התשלום.",
  }
}

export function FinanceSettingsClient({
  companyId,
  defaultThresholdNis,
}: {
  companyId: string
  defaultThresholdNis: number
}) {
  const [settings, setSettings] = React.useState<FinanceSettings>(() =>
    defaultSettings(defaultThresholdNis),
  )
  const [loaded, setLoaded] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [lastSaved, setLastSaved] = React.useState<string | null>(null)

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey(companyId))
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<FinanceSettings>
        setSettings({
          ...defaultSettings(defaultThresholdNis),
          ...parsed,
          // Always coerce arrays to length 3 for the form.
          signatories: [
            parsed.signatories?.[0] ?? "",
            parsed.signatories?.[1] ?? "",
            parsed.signatories?.[2] ?? "",
          ],
        })
      }
    } catch {
      // Corrupted entry — fall back to defaults silently.
    }
    setLoaded(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  function handleSave() {
    setSaving(true)
    try {
      window.localStorage.setItem(
        storageKey(companyId),
        JSON.stringify({
          ...settings,
          signatories: settings.signatories.map((s) => s.trim()).filter(Boolean),
        }),
      )
      const ts = new Date().toLocaleTimeString("he-IL")
      setLastSaved(ts)
      toast.success(`הגדרות נשמרו (${ts})`)
    } catch (e) {
      toast.error("שמירה ל-LocalStorage נכשלה", {
        description: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    if (!window.confirm("לאפס את כל ההגדרות לערכי ברירת מחדל?")) return
    window.localStorage.removeItem(storageKey(companyId))
    setSettings(defaultSettings(defaultThresholdNis))
    setLastSaved(null)
    toast.success("ההגדרות אופסו לברירת מחדל")
  }

  function updateSignatory(idx: number, value: string) {
    setSettings((prev) => ({
      ...prev,
      signatories: prev.signatories.map((s, i) => (i === idx ? value : s)),
    }))
  }

  function addSignatory() {
    if (settings.signatories.length >= 5) return
    setSettings((prev) => ({
      ...prev,
      signatories: [...prev.signatories, ""],
    }))
  }

  function removeSignatory(idx: number) {
    if (settings.signatories.length <= 1) return
    setSettings((prev) => ({
      ...prev,
      signatories: prev.signatories.filter((_, i) => i !== idx),
    }))
  }

  if (!loaded) {
    return (
      <Card className="p-5 text-center text-sm text-muted-foreground">
        <Loader2 className="me-2 inline size-4 animate-spin" aria-hidden />
        טוען הגדרות…
      </Card>
    )
  }

  return (
    <div dir="rtl" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* ITA threshold */}
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-bold text-foreground">
          סף הקצאת רשות המסים
        </h2>
        <p className="text-xs text-muted-foreground">
          חשבוניות עם <span className="font-mono">grand_total</span> מעל הסף
          נכנסות לסטטוס <span className="font-mono">PENDING_ALLOCATION</span> ולא
          ניתן לסגור אותן עד שיוזן מספר הקצאה ITA.
        </p>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-muted-foreground">
            רף ב-ש״ח (ברירת מחדל: {ILS.format(defaultThresholdNis)})
          </span>
          <input
            type="number"
            min={0}
            step={100}
            value={settings.itaAllocationThresholdNis}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                itaAllocationThresholdNis: Number(e.target.value) || 0,
              }))
            }
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono tabular-nums"
          />
        </label>
        <p className="text-[10px] text-muted-foreground">
          ערך נוכחי שמירה ב-DB: {ILS.format(defaultThresholdNis)} (קבוע env). הערך
          לעיל יכנס לתוקף מולטי-משתמשי לאחר הוספת מיגרציית{" "}
          <span className="font-mono">erp_companies.finance_settings_json</span>.
        </p>
      </Card>

      {/* Brand logo */}
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-bold text-foreground">לוגו החברה</h2>
        <p className="text-xs text-muted-foreground">
          URL מלא לקובץ הלוגו שיופיע בראש כל חשבונית PDF.
        </p>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-muted-foreground">
            URL הלוגו
          </span>
          <input
            type="url"
            placeholder="https://example.com/logo.png"
            value={settings.brandLogoUrl}
            onChange={(e) =>
              setSettings((prev) => ({ ...prev, brandLogoUrl: e.target.value }))
            }
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono"
            dir="ltr"
          />
        </label>
        {settings.brandLogoUrl ? (
          <div className="rounded-md border border-dashed border-border bg-slate-50 p-3">
            <p className="mb-1 text-[10px] uppercase text-muted-foreground">
              תצוגה מקדימה
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={settings.brandLogoUrl}
              alt="לוגו"
              className="max-h-16 object-contain"
              onError={(e) => {
                e.currentTarget.style.display = "none"
              }}
            />
          </div>
        ) : null}
      </Card>

      {/* Signatories */}
      <Card className="space-y-3 p-4 lg:col-span-1">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">חתימות מורשות</h2>
          {settings.signatories.length < 5 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={addSignatory}
            >
              <Plus className="size-3.5" aria-hidden />
              הוסף
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          עד 5 חתימות. שמות אלה מופיעים בתחתית כל חשבונית מס באזור החתימות.
        </p>
        <div className="space-y-2">
          {settings.signatories.map((name, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="w-5 text-[10px] font-mono text-muted-foreground">
                {idx + 1}.
              </span>
              <input
                value={name}
                onChange={(e) => updateSignatory(idx, e.target.value)}
                placeholder={`חתימה ${idx + 1}`}
                className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
              {settings.signatories.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeSignatory(idx)}
                  className="rounded p-1.5 text-rose-600 hover:bg-rose-50"
                  aria-label="הסר חתימה"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </Card>

      {/* Retention clause */}
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-bold text-foreground">
          סעיף שמירת בעלות (Retention of Title)
        </h2>
        <p className="text-xs text-muted-foreground">
          טקסט משפטי המופיע בתחתית כל חשבונית מס. ניתן לערוך לפי דרישות יועץ
          משפטי.
        </p>
        <textarea
          value={settings.retentionOfTitleClause}
          onChange={(e) =>
            setSettings((prev) => ({
              ...prev,
              retentionOfTitleClause: e.target.value,
            }))
          }
          rows={5}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        />
      </Card>

      {/* Save bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-2">
        <p className="text-xs text-muted-foreground">
          {lastSaved ? (
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <CheckCircle2 className="size-3.5" aria-hidden />
              נשמר ב-{lastSaved}
            </span>
          ) : (
            "ההגדרות נשמרות באופן מקומי בדפדפן עד שתשלים מיגרציית DB."
          )}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={saving}
          >
            איפוס לברירת מחדל
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-2"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Save className="size-4" aria-hidden />
            )}
            שמור הגדרות
          </Button>
        </div>
      </div>
    </div>
  )
}
