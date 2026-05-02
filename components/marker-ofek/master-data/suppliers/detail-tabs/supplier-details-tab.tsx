"use client"

/**
 * Suppliers Master/Detail → Detail tab: פרטי ספק.
 *
 * Read-only summary של פרטי הזיהוי, התקשרות והתשלום של הספק. בניגוד
 * ל-tabs האחרים שמציגים *אוסף* רשומות קשורות, ה-tab הזה מציג את
 * **שדות ההד של הספק עצמו** בלבד — שימושי כהצצה מהירה לפני
 * drill-in לכרטיס המלא.
 *
 * מקור נתונים: `/api/master-data/suppliers/[id]?include=contacts,bankAccounts`
 * (כבר קיים — Phase 7).
 */

import * as React from "react"
import { Building2, CreditCard, Receipt, User } from "lucide-react"

import {
  MasterDetailTabEmpty,
  MasterDetailTabError,
  MasterDetailTabLoading,
} from "@/components/infrastructure/master-detail/master-detail-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import type { ErpSupplierMasterDetail } from "@/types/erp"

function formatType(type: string): string {
  if (type === "SUBCONTRACTOR") return "קבלן משנה"
  if (type === "STANDARD") return "ספק רגיל"
  return type
}

export function SupplierDetailsTab({
  supplierId,
}: {
  supplierId: string | null
}) {
  const [data, setData] = React.useState<ErpSupplierMasterDetail | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!supplierId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    masterDataFetch<ErpSupplierMasterDetail>(
      `/api/master-data/suppliers/${encodeURIComponent(supplierId)}?include=contacts,bankAccounts`,
    )
      .then((d) => {
        if (cancelled) return
        setData(d)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "טעינת פרטי הספק נכשלה")
        setData(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [supplierId])

  if (!supplierId) {
    return (
      <MasterDetailTabEmpty>
        בחר ספק במסך האב כדי לראות את פרטיו, אנשי הקשר וחשבונות הבנק שלו.
      </MasterDetailTabEmpty>
    )
  }
  if (loading) return <MasterDetailTabLoading>טוען פרטי ספק…</MasterDetailTabLoading>
  if (error) return <MasterDetailTabError>{error}</MasterDetailTabError>
  if (!data) return null

  const primaryContact =
    (data.contacts ?? []).find((c) => c.isPrimary) ?? data.contacts?.[0] ?? null
  const primaryBank =
    (data.bankAccounts ?? []).find((b) => b.isPrimary) ??
    data.bankAccounts?.[0] ??
    null

  return (
    <div className="grid gap-3 p-1 sm:grid-cols-2">
      <SectionCard icon={Building2} title="זיהוי">
        <Field label="מס' ספק" value={data.supplierNum} mono />
        <Field label="שם" value={data.name} />
        <Field label="סוג" value={formatType(data.type)} />
        <Field label="ח.פ / עוסק מורשה" value={data.taxId ?? "—"} mono />
      </SectionCard>

      <SectionCard icon={Receipt} title="תנאי תשלום">
        <Field label="תנאי תשלום" value={data.paymentTerms ?? "—"} />
      </SectionCard>

      <SectionCard icon={User} title="איש קשר ראשי">
        {primaryContact ? (
          <>
            <Field label="שם" value={primaryContact.name} />
            <Field label="תפקיד" value={primaryContact.role ?? "—"} />
            <Field label="טלפון" value={primaryContact.phone ?? "—"} mono />
            <Field label="אימייל" value={primaryContact.email ?? "—"} />
          </>
        ) : (
          <p className="text-xs text-muted-foreground">לא הוגדר איש קשר ראשי.</p>
        )}
      </SectionCard>

      <SectionCard icon={CreditCard} title="חשבון בנק ראשי">
        {primaryBank ? (
          <>
            <Field label="בנק" value={primaryBank.bankName} />
            <Field label="סניף" value={primaryBank.branchCode ?? "—"} mono />
            <Field
              label="חשבון"
              value={primaryBank.accountNumber ?? "—"}
              mono
            />
            {primaryBank.iban ? (
              <Field label="IBAN" value={primaryBank.iban} mono />
            ) : null}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">לא הוגדר חשבון בנק.</p>
        )}
      </SectionCard>
    </div>
  )
}

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  title: string
  children: React.ReactNode
}) {
  return (
    <Card className="border-border">
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 px-3 pb-1.5 pt-3">
        <Icon className="size-3.5 text-muted-foreground" aria-hidden />
        <CardTitle className="text-xs font-semibold tracking-tight">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 px-3 pb-3 pt-1">{children}</CardContent>
    </Card>
  )
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`text-right text-foreground ${
          mono ? "font-mono tabular-nums" : ""
        }`}
      >
        {value}
      </span>
    </div>
  )
}
