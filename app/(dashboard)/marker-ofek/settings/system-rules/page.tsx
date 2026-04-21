"use client"

import Link from "next/link"
import * as React from "react"
import { ArrowRight, Loader2, Percent, Save, Shield } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { MasterDetailWorkspace } from "@/components/layout/MasterDetailWorkspace"
import { SettingsMasterNav } from "@/components/marker-ofek/settings/settings-master-nav"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getMoSystemSettings,
  updateMoSystemSettings,
} from "@/lib/marker-ofek/mo-system-settings-actions"
import { isPartnerDashboardSuperAdmin } from "@/lib/marker-ofek/partner-metrics/access"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { formatError } from "@/lib/utils"

export default function MarkerOfekSystemRulesPage() {
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [canEdit, setCanEdit] = React.useState(false)
  const [defaultVat, setDefaultVat] = React.useState("18")
  const [taxMode, setTaxMode] = React.useState<"warning" | "blocking">("warning")
  const [weeklyReport, setWeeklyReport] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!cancelled) setCanEdit(isPartnerDashboardSuperAdmin(user?.email))

        const res = await getMoSystemSettings()
        if (!res.ok || cancelled) {
          if (!res.ok) toast.error(res.error)
          return
        }
        setDefaultVat(String(res.settings.default_vat_rate))
        setTaxMode(res.settings.tax_compliance_mode)
        setWeeklyReport(res.settings.send_weekly_expiry_report)
      } catch (e) {
        if (!cancelled) toast.error(formatError(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!canEdit) {
      toast.error("רק אופיר (מנהל מערכת) רשאי לעדכן כללים אלה")
      return
    }
    const vat = Number.parseFloat(defaultVat.replace(",", "."))
    if (!Number.isFinite(vat)) {
      toast.error("אחוז מע״מ לא תקין")
      return
    }
    setSaving(true)
    try {
      const res = await updateMoSystemSettings({
        defaultVatRate: vat,
        taxComplianceMode: taxMode,
        sendWeeklyExpiryReport: weeklyReport,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("הגדרות המערכת עודכנו")
    } catch (err) {
      toast.error(formatError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <MasterDetailWorkspace
      title="כללי מערכת (מס ותאימות)"
      description="חוקי מערכת גלובליים בתצורת Master-Detail"
      master={<SettingsMasterNav />}
      detail={
        <div dir="rtl" lang="he" className="space-y-6">
      <Link
        href="/marker-ofek/settings"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה להגדרות
      </Link>

      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-violet-500/15 text-violet-700">
          <Shield className="size-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">כללי מערכת (מס ותאימות)</h1>
          <p className="text-sm text-muted-foreground">
            מע״מ ברירת מחדל, אכיפת תעודות ספק (אזהרה מול חסימה), דוחות תפוגה.
          </p>
        </div>
      </div>

      {!canEdit ? (
        <p className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm">
          מסך זה מוגבל לאופיר בלבד. ניתן לצפות בערכים אך לא לעדכן.
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          טוען…
        </div>
      ) : (
        <form onSubmit={(e) => void handleSave(e)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Percent className="size-4" aria-hidden />
                מדיניות מס
              </CardTitle>
              <CardDescription>
                משמשת לבדיקת תאריכי תוקף אצל ספקים בזרימות רכש וחוזים.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="max-w-md space-y-2">
                <Label htmlFor="sys-vat">מע״מ ברירת מחדל (%)</Label>
                <Input
                  id="sys-vat"
                  value={defaultVat}
                  onChange={(e) => setDefaultVat(e.target.value)}
                  disabled={!canEdit || saving}
                  dir="ltr"
                  className="max-w-[140px] font-currency-mono tabular-nums"
                />
              </div>
              <div className="max-w-lg space-y-2">
                <Label>אכיפת תעודות ספק (ניכוי / ניהול ספרים)</Label>
                <Select
                  value={taxMode}
                  disabled={!canEdit || saving}
                  onValueChange={(v) =>
                    setTaxMode(v === "blocking" ? "blocking" : "warning")
                  }
                >
                  <SelectTrigger className="max-w-md w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warning">אזהרה בלבד (באנר כתום)</SelectItem>
                    <SelectItem value="blocking">חסימת שליחה</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="sys-weekly"
                  checked={weeklyReport}
                  disabled={!canEdit || saving}
                  onCheckedChange={(v) => setWeeklyReport(Boolean(v))}
                />
                <Label htmlFor="sys-weekly" className="font-normal">
                  שליחת דוח שבועי לתפוגת תעודות (מוכן לשילוב אימייל)
                </Label>
              </div>
            </CardContent>
          </Card>

          {canEdit ? (
            <Button type="submit" disabled={saving} className="gap-2">
              {saving ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Save className="size-4" aria-hidden />
              )}
              שמירה
            </Button>
          ) : null}
        </form>
      )}
        </div>
      }
    />
  )
}
