"use client"

import Link from "next/link"
import * as React from "react"
import { ArrowRight, Building2, Loader2, Save } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  getCompanyMdmProfile,
  updateCompanyMdmProfile,
} from "@/lib/marker-ofek/erp-company-mdm-actions"
import { companyMdmFormSchema } from "@/lib/marker-ofek/erp-validation-schemas"
import { isPartnerDashboardSuperAdmin } from "@/lib/marker-ofek/partner-metrics/access"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { cn, formatError } from "@/lib/utils"

export default function MarkerOfekCompanyMdmPage() {
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [canEdit, setCanEdit] = React.useState(false)
  const [companyName, setCompanyName] = React.useState("")
  const [legalId, setLegalId] = React.useState("")
  const [vatRegistrationNumber, setVatRegistrationNumber] = React.useState("")
  const [bankName, setBankName] = React.useState("")
  const [bankBranch, setBankBranch] = React.useState("")
  const [bankAccountNumber, setBankAccountNumber] = React.useState("")
  const [address, setAddress] = React.useState("")
  const [phone, setPhone] = React.useState("")
  const [email, setEmail] = React.useState("")

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!cancelled) {
          setCanEdit(isPartnerDashboardSuperAdmin(user?.email))
        }
        const res = await getCompanyMdmProfile()
        if (!res.ok || cancelled) {
          if (!res.ok) toast.error(res.error)
          return
        }
        const row = res.row
        if (row) {
          setCompanyName(row.company_name ?? "")
          setLegalId(row.legal_id ?? "")
          setVatRegistrationNumber(row.vat_registration_number ?? "")
          setBankName(row.bank_name ?? "")
          setBankBranch(row.bank_branch ?? "")
          setBankAccountNumber(row.bank_account_number ?? "")
          setAddress(row.address ?? "")
          setPhone(row.phone ?? "")
          setEmail(row.email ?? "")
        }
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

  const companyMdmValid = React.useMemo(() => {
    return companyMdmFormSchema.safeParse({
      legalId: legalId.trim(),
      vatRegistrationNumber: vatRegistrationNumber.trim(),
      bankName: bankName.trim(),
      bankBranch: bankBranch.trim(),
      bankAccountNumber: bankAccountNumber.trim(),
    })
  }, [
    legalId,
    vatRegistrationNumber,
    bankName,
    bankBranch,
    bankAccountNumber,
  ])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!canEdit) {
      toast.error("עדכון מיועד לאופיר (מנהל מערכת)")
      return
    }
    setSaving(true)
    try {
      const res = await updateCompanyMdmProfile({
        legalId: legalId.trim() || null,
        vatRegistrationNumber: vatRegistrationNumber.trim() || null,
        bankName: bankName.trim() || null,
        bankBranch: bankBranch.trim() || null,
        bankAccountNumber: bankAccountNumber.trim() || null,
        address: address.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("פרטי החברה עודכנו")
    } catch (err) {
      toast.error(formatError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <MasterDetailWorkspace
      title="פרופיל חברה (MDM)"
      description="ניהול נתוני חברה, מס ובנק בתצורת Master-Detail"
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
        <span className="flex size-11 items-center justify-center rounded-xl bg-sky-500/15 text-sky-700">
          <Building2 className="size-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">פרופיל חברה (MDM)</h1>
          <p className="text-sm text-muted-foreground">
            ח.פ, מע״מ, ופרטי בנק לתצוגה במסמכים ורישום עסקי.
          </p>
        </div>
      </div>

      {!canEdit ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-950">
          צפייה בלבד. עריכת שדות מס ובנק מיועדת לאופיר (מנהל מערכת).
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
              <CardTitle>זיהוי ומס</CardTitle>
              <CardDescription>שם החברה מוצג מ־company_profile (קריאה בלבד כאן).</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="max-w-lg space-y-2 sm:col-span-2">
                <Label>שם חברה</Label>
                <Input value={companyName} disabled className="bg-muted/50" dir="rtl" />
              </div>
              <div className="max-w-md space-y-2">
                <Label htmlFor="co-legal">ח.פ / ע.מ</Label>
                <Input
                  id="co-legal"
                  value={legalId}
                  onChange={(e) => setLegalId(e.target.value)}
                  disabled={!canEdit || saving}
                  dir="ltr"
                  className={cn(
                    "font-mono",
                    canEdit &&
                      !companyMdmValid.success &&
                      !legalId.trim() &&
                      "border-destructive ring-2 ring-destructive/25"
                  )}
                />
              </div>
              <div className="max-w-md space-y-2">
                <Label htmlFor="co-vat">מספר עוסק / מע״מ</Label>
                <Input
                  id="co-vat"
                  value={vatRegistrationNumber}
                  onChange={(e) => setVatRegistrationNumber(e.target.value)}
                  disabled={!canEdit || saving}
                  dir="ltr"
                  className={cn(
                    "font-mono",
                    canEdit &&
                      !companyMdmValid.success &&
                      !vatRegistrationNumber.trim() &&
                      "border-destructive ring-2 ring-destructive/25"
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>בנק</CardTitle>
              <CardDescription>חשבון הבנק של החברה לתשלומים.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="max-w-lg space-y-2 sm:col-span-2">
                <Label htmlFor="co-bank">שם בנק</Label>
                <Input
                  id="co-bank"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  disabled={!canEdit || saving}
                  dir="rtl"
                  className={cn(
                    canEdit &&
                      !companyMdmValid.success &&
                      !bankName.trim() &&
                      "border-destructive ring-2 ring-destructive/25"
                  )}
                />
              </div>
              <div className="max-w-md space-y-2">
                <Label htmlFor="co-branch">סניף</Label>
                <Input
                  id="co-branch"
                  value={bankBranch}
                  onChange={(e) => setBankBranch(e.target.value)}
                  disabled={!canEdit || saving}
                  dir="ltr"
                  className={cn(
                    "font-mono",
                    canEdit &&
                      !companyMdmValid.success &&
                      !bankBranch.trim() &&
                      "border-destructive ring-2 ring-destructive/25"
                  )}
                />
              </div>
              <div className="max-w-md space-y-2">
                <Label htmlFor="co-account">מספר חשבון</Label>
                <Input
                  id="co-account"
                  value={bankAccountNumber}
                  onChange={(e) => setBankAccountNumber(e.target.value)}
                  disabled={!canEdit || saving}
                  dir="ltr"
                  className={cn(
                    "font-mono",
                    canEdit &&
                      !companyMdmValid.success &&
                      !bankAccountNumber.trim() &&
                      "border-destructive ring-2 ring-destructive/25"
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>יצירת קשר</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="max-w-lg space-y-2">
                <Label htmlFor="co-addr">כתובת</Label>
                <Input
                  id="co-addr"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  disabled={!canEdit || saving}
                  dir="rtl"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="max-w-md space-y-2">
                  <Label htmlFor="co-phone">טלפון</Label>
                  <Input
                    id="co-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={!canEdit || saving}
                    dir="ltr"
                    className="font-mono"
                  />
                </div>
                <div className="max-w-md space-y-2">
                  <Label htmlFor="co-mail">דוא״ל</Label>
                  <Input
                    id="co-mail"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={!canEdit || saving}
                    dir="ltr"
                    className="font-mono"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {canEdit && !companyMdmValid.success ? (
            <ul className="list-inside list-disc text-sm text-destructive">
              {companyMdmValid.error.issues.map((issue, i) => (
                <li key={i}>{issue.message}</li>
              ))}
            </ul>
          ) : null}

          {canEdit ? (
            <Button
              type="submit"
              disabled={saving || !companyMdmValid.success}
              className="gap-2"
            >
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
