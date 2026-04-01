"use client"

import Link from "next/link"
import * as React from "react"
import { ArrowRight, Building2, Loader2, Save } from "lucide-react"
import { toast } from "sonner"

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
import { Textarea } from "@/components/ui/textarea"
import { COMPANY_PROFILE_COLUMNS } from "@/lib/marker-ofek/supabase-fields"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { formatError } from "@/lib/utils"
import type { CompanyProfile } from "@/types/marker-ofek"

export default function MarkerOfekSettingsPage() {
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [rowId, setRowId] = React.useState<string | null>(null)
  const [companyName, setCompanyName] = React.useState("")
  const [legalId, setLegalId] = React.useState("")
  const [address, setAddress] = React.useState("")
  const [phone, setPhone] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [deductionsFile, setDeductionsFile] = React.useState("")

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error } = await supabase
          .from("company_profile")
          .select(COMPANY_PROFILE_COLUMNS)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle()

        if (error) throw error
        if (cancelled) return

        if (data) {
          const p = data as CompanyProfile
          setRowId(p.id)
          setCompanyName(p.company_name ?? "")
          setLegalId(p.legal_id ?? "")
          setAddress(p.address ?? "")
          setPhone(p.phone ?? "")
          setEmail(p.email ?? "")
          setDeductionsFile(p.deductions_file_number ?? "")
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(
            e instanceof Error ? e.message : "טעינת פרטי החברה נכשלה"
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!rowId) {
      toast.error("לא נמצא רשומת פרופיל — הריצו את סקריפט ה-SQL ב-Supabase")
      return
    }

    setSaving(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const { error } = await supabase
        .from("company_profile")
        .update({
          company_name: companyName.trim() || "Marker Ofek",
          legal_id: legalId.trim() || null,
          address: address.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          deductions_file_number: deductionsFile.trim() || null,
        })
        .eq("id", rowId)

      if (error) throw error
      toast.success("פרטי החברה עודכנו")
    } catch (e) {
      toast.error(formatError(e) || "השמירה נכשלה")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col gap-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/marker-ofek/contracts"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowRight className="size-4 rotate-180" aria-hidden />
          חזרה לחוזים
        </Link>
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
          הגדרות מרקר אופק — פרטים רשמיים למס
        </h1>
        <p className="text-sm text-muted-foreground">
          פרטים אלה מופיעים במסמכי חשבון חלקי והדפסות לפי דרישות רשות המסים
          בישראל.
        </p>
      </div>

      {loading ? (
        <div className="flex min-h-[30vh] flex-col items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="size-8 animate-spin" aria-hidden />
          <p className="text-sm">טוען…</p>
        </div>
      ) : !rowId ? (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader>
            <CardTitle>חסרה טבלת company_profile</CardTitle>
            <CardDescription>
              הריצו ב-Supabase את הקובץ{" "}
              <code className="rounded bg-muted px-1 text-xs">
                marker_ofek_tax_compliance.sql
              </code>{" "}
              ואז רעננו את העמוד.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <form onSubmit={(e) => void handleSave(e)} className="space-y-6">
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="border-b border-border/60 pb-4">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">
                  <Building2 className="size-5" aria-hidden />
                </div>
                <div className="space-y-1">
                  <CardTitle>פרטי מנפיק (עוסק מורשה)</CardTitle>
                  <CardDescription>
                    שם חברה, ח.פ, כתובת, יצירת קשר ותיק ניכויים.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-5 pt-6">
              <div className="space-y-2">
                <Label htmlFor="co-name">שם חברה</Label>
                <Input
                  id="co-name"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  dir="rtl"
                  disabled={saving}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="co-legal">ח.פ / ע.מ</Label>
                <Input
                  id="co-legal"
                  value={legalId}
                  onChange={(e) => setLegalId(e.target.value)}
                  placeholder="למשל: 512345678"
                  dir="ltr"
                  className="font-mono"
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="co-address">כתובת</Label>
                <Textarea
                  id="co-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={3}
                  dir="rtl"
                  disabled={saving}
                  className="resize-y"
                />
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="co-phone">טלפון</Label>
                  <Input
                    id="co-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    dir="ltr"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="co-email">דוא&quot;ל</Label>
                  <Input
                    id="co-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    dir="ltr"
                    disabled={saving}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="co-deductions">מס&apos; תיק ניכויים</Label>
                <Input
                  id="co-deductions"
                  value={deductionsFile}
                  onChange={(e) => setDeductionsFile(e.target.value)}
                  dir="ltr"
                  className="font-mono"
                  disabled={saving}
                />
              </div>
              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  size="lg"
                  disabled={saving}
                  className="gap-2 bg-cyan-600 text-white hover:bg-cyan-500"
                >
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Save className="size-4" aria-hidden />
                  )}
                  {saving ? "שומרים…" : "שמירה"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      )}
    </div>
  )
}
