"use client"

/**
 * Suppliers Master/Detail → Detail tab: פרטי ספק.
 *
 * Priority-parity layout (v2):
 *   כרטיס 1 — זיהוי + דגלים
 *   כרטיס 2 — כתובת וטלפון
 *   כרטיס 3 — פרטים פיננסיים
 *   כרטיס 4 — פרטים נוספים (Priority parity)
 *   כרטיס 5 — איש קשר ראשי
 *   כרטיס 6 — חשבון בנק ראשי
 */

import * as React from "react"
import { AlertTriangle, Building2, CreditCard, Globe, Mail, Phone, Receipt, ShieldAlert, User } from "lucide-react"

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

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "פעיל",
  INACTIVE: "לא פעיל",
  BLOCKED: "חסום",
  PENDING: "ממתין לאישור",
}

const STATUS_TONES: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  INACTIVE: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  BLOCKED: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
}

const FILE_TYPE_LABELS: Record<number, string> = {
  1: "עצמאי / ת.ז",
  2: "חברה",
  3: "עוסק מורשה",
  5: "חברה בינלאומית",
  9: "תושב חוץ",
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
        בחר ספק במסך האב כדי לראות את פרטיו.
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

  const statusLabel = STATUS_LABELS[data.status ?? "ACTIVE"] ?? data.status
  const statusCls = STATUS_TONES[data.status ?? "ACTIVE"] ?? STATUS_TONES.ACTIVE

  const addrLines = [data.address, data.addressLine2, data.addressLine3].filter(Boolean)
  const cityLine = [data.city, data.zipCode, data.countryCode].filter(Boolean).join("  ")

  const hasAdditional =
    data.authorizationLevel != null || !!data.defaultOrderType || !!data.supplierTypeCode ||
    !!data.subcontractorWh || !!data.consignmentWh || data.isForeignSupplier ||
    data.hasAttachments || data.marketgeysDisplay > 0

  return (
    <div className="grid gap-3 p-1 sm:grid-cols-2" dir="rtl">

      {data.entryNote && (
        <div className="col-span-full flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{data.entryNote}</span>
        </div>
      )}

      <SectionCard icon={Building2} title="זיהוי">
        <Field label="מס' ספק" value={data.supplierNum} mono />
        <Field label="שם ספק" value={data.name} />
        {data.foreignName && <Field label="שם לועזי" value={data.foreignName} />}
        <Field label="סוג" value={formatType(data.type)} />
        <Field label="ח.פ / עוסק מורשה" value={data.taxId ?? "—"} mono />
        <div className="flex items-center justify-between gap-3 text-[11px]">
          <span className="text-muted-foreground">סטטוס</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusCls}`}>
            {statusLabel}
          </span>
        </div>
        {data.forAttention && (
          <div className="mt-1 flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            <AlertTriangle className="size-3" aria-hidden />
            *** לטיפול
          </div>
        )}
        {data.responsiblePerson && (
          <Field label="*** לטיפול" value={data.responsiblePerson} />
        )}
        {data.openingDate && (
          <Field label="תאריך פתיחה" value={new Date(data.openingDate).toLocaleDateString("he-IL")} />
        )}
      </SectionCard>

      <SectionCard icon={Globe} title="כתובת וטלפון">
        {addrLines.length > 0 ? (
          <div className="space-y-0.5">
            {addrLines.map((line, i) => (
              <p key={i} className="text-right text-[11px] text-foreground">{line}</p>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">לא הוזנה כתובת.</p>
        )}
        {cityLine && (
          <p className="text-right text-[11px] text-muted-foreground">{cityLine}</p>
        )}
        <div className="mt-2 space-y-0.5 border-t border-border pt-2">
          {data.phone && (
            <div className="flex items-center gap-1.5 text-[11px]">
              <Phone className="size-3 shrink-0 text-muted-foreground" aria-hidden />
              <span className="font-mono" dir="ltr">{data.phone}</span>
            </div>
          )}
          {data.fax && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="shrink-0 text-[9px] font-bold">FAX</span>
              <span className="font-mono" dir="ltr">{data.fax}</span>
            </div>
          )}
          {data.email && (
            <div className="flex items-center gap-1.5 text-[11px]">
              <Mail className="size-3 shrink-0 text-muted-foreground" aria-hidden />
              <span dir="ltr">{data.email}</span>
            </div>
          )}
          {data.website && (
            <div className="flex items-center gap-1.5 text-[11px]">
              <Globe className="size-3 shrink-0 text-muted-foreground" aria-hidden />
              <a
                href={data.website.startsWith("http") ? data.website : `https://${data.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-2 hover:underline"
                dir="ltr"
              >
                {data.website}
              </a>
            </div>
          )}
          {!data.phone && !data.fax && !data.email && !data.website && (
            <p className="text-[11px] text-muted-foreground">אין פרטי תקשורת.</p>
          )}
        </div>
      </SectionCard>

      <SectionCard icon={Receipt} title="פרטים פיננסיים">
        <Field label="תנאי תשלום" value={data.paymentTerms ?? "—"} />
        {data.currencyCode && <Field label="מטבע" value={data.currencyCode} mono />}
        {data.coaAccountCode && <Field label="חשבון AP" value={data.coaAccountCode} mono />}
        {data.industry && <Field label="תחום עיסוק" value={data.industry} />}
        {data.branchCode && <Field label="סניף" value={data.branchCode} mono />}
        {data.foundingYear != null && (
          <Field label="שנת הקמה" value={String(data.foundingYear)} />
        )}
        {data.employeeCount != null && (
          <Field label="מס עובדים" value={data.employeeCount.toLocaleString("he-IL")} />
        )}
        <div className="mt-1 flex flex-wrap gap-1">
          {data.printsInEnglish && <FlagBadge label="הדפסות באנגלית" />}
          {data.isConfidential && <FlagBadge label="ספק חסוי" tone="warning" />}
          {data.isCasual && <FlagBadge label="ספק מזדמן" />}
        </div>
      </SectionCard>

      {hasAdditional && (
        <SectionCard icon={Receipt} title="פרטים נוספים">
          {data.supplierTypeCode && <Field label="סוג ספק" value={data.supplierTypeCode} />}
          {data.authorizationLevel != null && (
            <Field label="דרגת הרשאה" value={String(data.authorizationLevel)} mono />
          )}
          {data.defaultOrderType && <Field label="סוג הזמנה" value={data.defaultOrderType} />}
          {data.subcontractorWh && (
            <Field label="מחסן קבלן משנה" value={data.subcontractorWh} mono />
          )}
          {data.consignmentWh && (
            <Field label="מחסן קונסיגנציה" value={data.consignmentWh} mono />
          )}
          {data.marketgeysDisplay > 0 && (
            <Field label="הצגה במרקטגייס" value={String(data.marketgeysDisplay)} mono />
          )}
          <div className="mt-1 flex flex-wrap gap-1">
            {data.isForeignSupplier && <FlagBadge label={'ספק חו"ל'} />}
            {data.hasAttachments && <FlagBadge label="נספחים נדרשים" />}
          </div>
        </SectionCard>
      )}

      <SectionCard icon={User} title="איש קשר ראשי">
        {primaryContact ? (
          <>
            <Field label="שם" value={primaryContact.name} />
            <Field label="תפקיד" value={primaryContact.role ?? "—"} />
            {primaryContact.phone && (
              <div className="flex items-center gap-1.5 text-[11px]">
                <Phone className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                <span className="font-mono" dir="ltr">{primaryContact.phone}</span>
              </div>
            )}
            {primaryContact.email && (
              <div className="flex items-center gap-1.5 text-[11px]">
                <Mail className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                <span dir="ltr">{primaryContact.email}</span>
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">לא הוגדר איש קשר ראשי.</p>
        )}
        {(data.contacts ?? []).length > 1 && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            + {(data.contacts ?? []).length - 1} אנשי קשר נוספים
          </p>
        )}
      </SectionCard>

      <SectionCard icon={CreditCard} title="חשבון בנק ראשי">
        {primaryBank ? (
          <>
            <Field label="בנק" value={[primaryBank.bankCode, primaryBank.bankName].filter(Boolean).join(" — ")} />
            <Field label="סניף" value={[primaryBank.branchCode, primaryBank.branchName].filter(Boolean).join(" — ") || "—"} mono />
            <Field label="חשבון" value={primaryBank.accountNumber} mono />
            {primaryBank.iban && <Field label="IBAN" value={primaryBank.iban} mono />}
            {primaryBank.swift && <Field label="SWIFT" value={primaryBank.swift} mono />}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">לא הוגדר חשבון בנק.</p>
        )}
      </SectionCard>

      {(data.vatFileNumber || data.paysByBankTransfer || data.roundInvoicePrice ||
        data.payToOrderOf || data.ledgerAccountCode || data.purchasesAccountCode ||
        data.costCenterCode || data.invoiceTxnType || data.creditTxnType) && (
        <SectionCard icon={Receipt} title="הגדרות כספים">
          {data.vatFileNumber && <Field label={"מס' תיק מע\"מ"} value={data.vatFileNumber} mono />}
          {data.ledgerAccountCode && <Field label="חשבון לדיגי" value={data.ledgerAccountCode} mono />}
          {data.purchasesAccountCode && <Field label="חשבון קנות" value={data.purchasesAccountCode} mono />}
          {data.costCenterCode && <Field label="פרכז רוח/עלות" value={data.costCenterCode} mono />}
          {data.invoiceTxnType && <Field label="סוג תנועה - חשב." value={data.invoiceTxnType} />}
          {data.creditTxnType && <Field label="סוג תנועה - זיכוי" value={data.creditTxnType} />}
          {data.payToOrderOf && <Field label="שלמו לפקודת" value={data.payToOrderOf} />}
          <div className="mt-1 flex flex-wrap gap-1">
            {data.paysByBankTransfer && <FlagBadge label="העברה בנקאית" />}
            {data.roundInvoicePrice && <FlagBadge label="עיגול מחיר" />}
          </div>
        </SectionCard>
      )}

      {(data.incomeTaxFileNumber || data.withholdingPct != null || data.withholdingValidUntil ||
        data.maxWithholdingPct != null || data.bookkeeepingCertValidUntil ||
        data.withholdsFromSupplier || data.incomeTaxClassification || data.taxOfficerCode ||
        data.vatCode || data.isInternalSupplier || data.generalDiscountPct != null ||
        data.isRequiredToFile || data.withholdingFromDate || data.withholdingToDate ||
        data.maxWithholdingCode || data.withholdingToleranceShekel || data.withholdingFileCode) && (
        <SectionCard icon={ShieldAlert} title="ניכוי מס במקור">
          {data.vatCode && <Field label='קוד מע"מ' value={data.vatCode} mono />}
          {data.incomeTaxFileNumber && (
            <Field
              label="מס.זהות/תיק מס הכנסה"
              value={[
                data.incomeTaxFileNumber,
                data.incomeTaxFileType != null
                  ? FILE_TYPE_LABELS[data.incomeTaxFileType] ?? String(data.incomeTaxFileType)
                  : null,
              ]
                .filter(Boolean)
                .join(" | ")}
              mono
            />
          )}
          {data.withholdingPct != null && (
            <Field label="% ניכוי מס" value={`${data.withholdingPct}%`} mono />
          )}
          {data.withholdingValidUntil && (
            <Field
              label="בתוקף עד"
              value={new Date(data.withholdingValidUntil).toLocaleDateString("he-IL")}
            />
          )}
          {data.maxWithholdingPct != null && (
            <Field label="% ניכוי מקסימלי" value={`${data.maxWithholdingPct}%`} mono />
          )}
          {data.bookkeeepingCertValidUntil && (
            <Field
              label="אישור ספרים עד"
              value={new Date(data.bookkeeepingCertValidUntil).toLocaleDateString("he-IL")}
            />
          )}
          {data.withholdingDiscount != null && data.withholdingDiscount !== 0 && (
            <Field label="הנחה על ניכוי" value={`${data.withholdingDiscount}%`} mono />
          )}
          {data.withholdingDiscountUntil && (
            <Field
              label="הנחה בתוקף עד"
              value={new Date(data.withholdingDiscountUntil).toLocaleDateString("he-IL")}
            />
          )}
          {data.incomeTaxClassification && (
            <Field label="דיווח למס הכנסה" value={data.incomeTaxClassification} mono />
          )}
          {data.taxOfficerCode && (
            <Field label="קוד פקיד שומה" value={data.taxOfficerCode} mono />
          )}
          {(data.withholdingFromDate || data.withholdingToDate) && (
            <Field
              label="תקופת ניכוי"
              value={[
                data.withholdingFromDate
                  ? new Date(data.withholdingFromDate).toLocaleDateString("he-IL")
                  : "—",
                data.withholdingToDate
                  ? new Date(data.withholdingToDate).toLocaleDateString("he-IL")
                  : "—",
              ].join(" – ")}
            />
          )}
          {data.maxWithholdingCode && (
            <Field label="קוד ניכוי מקסימלי" value={data.maxWithholdingCode} mono />
          )}
          {data.withholdingFileCode && (
            <Field label="סוג ניכוי בקובץ" value={data.withholdingFileCode} mono />
          )}
          {(data.withholdingCode2 || data.withholdingCode3) && (
            <Field
              label="קוד ניכוי 2/3"
              value={[data.withholdingCode2, data.withholdingCode3].filter(Boolean).join(" / ")}
              mono
            />
          )}
          {data.generalDiscountPct != null && (
            <Field label="הנחה כללית %" value={`${data.generalDiscountPct}%`} mono />
          )}
          <div className="mt-1 flex flex-wrap gap-1">
            {data.withholdsFromSupplier && <FlagBadge label="ניכוי מס ממספקים" tone="warning" />}
            {data.isRequiredToFile && <FlagBadge label='ח"ב בדווח' tone="warning" />}
            {data.withholdingToleranceShekel && <FlagBadge label="סבלות בשקל" />}
            {data.isInternalSupplier && <FlagBadge label="ספק פנימי" />}
          </div>
        </SectionCard>
      )}

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
        <CardTitle className="text-xs font-semibold tracking-tight">{title}</CardTitle>
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
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={`truncate text-right text-foreground ${mono ? "font-mono tabular-nums" : ""}`}>
        {value}
      </span>
    </div>
  )
}

function FlagBadge({
  label,
  tone = "neutral",
}: {
  label: string
  tone?: "neutral" | "warning"
}) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
        tone === "warning"
          ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
      }`}
    >
      {label}
    </span>
  )
}
