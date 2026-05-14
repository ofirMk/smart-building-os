/**
 * Tax Invoices — index page (Sprint T7b).
 *
 * Renders the list of tax invoices for the active company with filter tabs
 * by status + kind, status badges, grand_total, and ITA allocation badge.
 * Each row links to the show page; closed rows also surface a
 * `ContextualPrintButton` pointed at `/print/tax-invoices/[id]`.
 */

import Link from "next/link"
import { cookies } from "next/headers"
import { FileText, Plus, Printer, ReceiptText, Settings } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ContextualPrintButton } from "@/components/marker-ofek/print/contextual-print-button"
import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { listTaxInvoicesAction } from "@/lib/marker-ofek/finance/t7-tax-invoice-actions"
import type {
  TaxInvoiceKind,
  TaxInvoiceListRow,
  TaxInvoiceStatus,
} from "@/lib/marker-ofek/finance/t7-tax-invoice-actions"

export const dynamic = "force-dynamic"

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 2,
})

const dateFmt = new Intl.DateTimeFormat("he-IL", { dateStyle: "short" })

const KIND_LABEL: Record<TaxInvoiceKind, string> = {
  TAX_INVOICE: "חשבונית מס",
  TAX_RECEIPT: "חשבונית מס/קבלה",
  CREDIT_MEMO: "זיכוי",
  CONSOLIDATED_INVOICE: "מרכזת",
}

const KIND_TONE: Record<TaxInvoiceKind, string> = {
  TAX_INVOICE: "border-slate-300 bg-slate-50 text-slate-800",
  TAX_RECEIPT: "border-emerald-300 bg-emerald-50 text-emerald-800",
  CREDIT_MEMO: "border-rose-300 bg-rose-50 text-rose-800",
  CONSOLIDATED_INVOICE: "border-indigo-300 bg-indigo-50 text-indigo-800",
}

function statusBadge(status: TaxInvoiceStatus) {
  switch (status) {
    case "DRAFT":
      return { label: "טיוטה", cls: "bg-slate-100 text-slate-700 border-slate-200" }
    case "PENDING_ALLOCATION":
      return { label: "ממתין להקצאה", cls: "bg-amber-50 text-amber-800 border-amber-200" }
    case "CLOSED":
      return { label: "סגור", cls: "bg-sky-50 text-sky-800 border-sky-200" }
    case "PRINTED_ORIGINAL":
      return { label: "הודפס (מקור)", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" }
    case "REPRINTED":
      return { label: "הודפס (העתק)", cls: "bg-emerald-50/70 text-emerald-800 border-emerald-200" }
    case "CANCELLED":
      return { label: "בוטל", cls: "bg-red-50 text-red-800 border-red-200" }
  }
}

function paymentBadge(status: string) {
  switch (status) {
    case "PAID":
      return { label: "שולם", cls: "border-emerald-300 bg-emerald-50 text-emerald-800" }
    case "PARTIALLY_PAID":
      return { label: "שולם חלקית", cls: "border-amber-300 bg-amber-50 text-amber-800" }
    case "VOID":
      return { label: "בטל", cls: "border-slate-300 bg-slate-50 text-slate-700" }
    default:
      return { label: "לא שולם", cls: "border-rose-300 bg-rose-50 text-rose-800" }
  }
}

export default async function TaxInvoicesIndexPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; kind?: string; q?: string }>
}) {
  const cookieStore = await cookies()
  const companyId = resolveCompanyContext(cookieStore.get(COMPANY_COOKIE_KEY)?.value)
  const params = (await searchParams) ?? {}
  const statusFilter = (params.status ?? "ALL").toUpperCase()
  const kindFilter = (params.kind ?? "ALL").toUpperCase()
  const queryText = params.q?.trim().toLowerCase() ?? ""

  if (!companyId) {
    return (
      <div dir="rtl" className="p-6 text-sm text-slate-700">
        לא נמצא הקשר חברה פעיל.
      </div>
    )
  }

  const result = await listTaxInvoicesAction(companyId, 500)
  const rows: TaxInvoiceListRow[] = result.ok ? result.rows : []
  const error = result.ok ? null : result.error

  const filtered = rows.filter((r) => {
    if (statusFilter !== "ALL" && r.status !== statusFilter) return false
    if (kindFilter !== "ALL" && r.kind !== kindFilter) return false
    if (queryText) {
      const hay =
        `${r.invoiceNumberLabel ?? ""} ${r.customerName}`.toLowerCase()
      if (!hay.includes(queryText)) return false
    }
    return true
  })

  const grandTotal = filtered.reduce((s, r) => s + Number(r.grandTotal || 0), 0)
  const openCount = filtered.filter((r) => r.paymentStatus !== "PAID" && r.status !== "CANCELLED").length

  return (
    <div dir="rtl" className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700">
            <ReceiptText className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              חשבוניות מס
            </h1>
            <p className="text-xs text-muted-foreground">
              Sprint T7b · הפקה, סגירה, הדפסה ודיווח לרשות המסים
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ContextualPrintButton
            kind="tax-invoices"
            label="פתח חשבונית אחרונה"
            className="border-indigo-300 bg-white text-indigo-800 hover:bg-indigo-50"
          />
          {/* T7c — Admin shortcut to finance settings (threshold / signatories / logo). */}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-2"
            render={<Link href="/marker-ofek/admin/finance-settings" />}
          >
            <Settings className="size-4" aria-hidden />
            הגדרות כספים
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-2"
            render={<Link href="/marker-ofek/finance/tax-invoices/new" />}
          >
            <Plus className="size-4" aria-hidden />
            חשבונית חדשה
          </Button>
        </div>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3">
          <p className="text-[11px] font-medium uppercase text-muted-foreground">
            סה״כ מסמכים
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{filtered.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] font-medium uppercase text-muted-foreground">
            ממתינים לגבייה
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{openCount}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] font-medium uppercase text-muted-foreground">
            סה״כ הסתכמות
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {ILS.format(grandTotal)}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] font-medium uppercase text-muted-foreground">
            סטטוס פעיל
          </p>
          <p className="mt-1 text-sm font-semibold">
            סינון: {statusFilter === "ALL" ? "כל המסמכים" : statusFilter}
          </p>
        </Card>
      </div>

      {/* Filter row — stateless query-string filters */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3"
      >
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          סוג
          <select
            name="kind"
            defaultValue={kindFilter}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
          >
            <option value="ALL">הכל</option>
            <option value="TAX_INVOICE">{KIND_LABEL.TAX_INVOICE}</option>
            <option value="CONSOLIDATED_INVOICE">{KIND_LABEL.CONSOLIDATED_INVOICE}</option>
            <option value="TAX_RECEIPT">{KIND_LABEL.TAX_RECEIPT}</option>
            <option value="CREDIT_MEMO">{KIND_LABEL.CREDIT_MEMO}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          סטטוס
          <select
            name="status"
            defaultValue={statusFilter}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
          >
            <option value="ALL">הכל</option>
            <option value="DRAFT">טיוטה</option>
            <option value="PENDING_ALLOCATION">ממתין להקצאה</option>
            <option value="CLOSED">סגור</option>
            <option value="PRINTED_ORIGINAL">הודפס (מקור)</option>
            <option value="REPRINTED">הודפס (העתק)</option>
            <option value="CANCELLED">בוטל</option>
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-[11px] text-muted-foreground">
          חיפוש (מספר / לקוח)
          <input
            type="search"
            name="q"
            defaultValue={queryText}
            placeholder="TI260000001 / שם לקוח"
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
          />
        </label>
        <Button type="submit" size="sm" variant="outline">
          סנן
        </Button>
      </form>

      {error ? (
        <Card className="border-red-300 bg-red-50 p-3 text-sm text-red-800">
          שגיאה בטעינת הרשימה: {error}
        </Card>
      ) : null}

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
          <FileText className="size-8 opacity-50" aria-hidden />
          <p className="font-semibold text-foreground">אין חשבוניות להצגה</p>
          <p>
            {rows.length === 0
              ? "עדיין לא נפתחה חשבונית. התחל ב״חשבונית חדשה״ כדי לייצר את הטיוטה הראשונה."
              : "לא נמצאו רשומות התואמות לסינון הנוכחי."}
          </p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2 text-start">מספר</th>
                <th className="px-3 py-2 text-start">סוג</th>
                <th className="px-3 py-2 text-start">לקוח</th>
                <th className="px-3 py-2 text-center">תאריך</th>
                <th className="px-3 py-2 text-end">סה״כ</th>
                <th className="px-3 py-2 text-center">סטטוס</th>
                <th className="px-3 py-2 text-center">תשלום</th>
                <th className="px-3 py-2 text-center">הקצאה</th>
                {/* T7c — print-count column for the audit trail. */}
                <th className="px-3 py-2 text-center" title="מספר הדפסות">
                  הדפסות
                </th>
                <th className="px-3 py-2 text-center">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const sb = statusBadge(r.status)
                const pb = paymentBadge(r.paymentStatus)
                const canPrint = r.status !== "DRAFT" && r.status !== "PENDING_ALLOCATION"
                return (
                  <tr
                    key={r.id}
                    className="border-t border-border hover:bg-slate-50/50"
                  >
                    <td className="px-3 py-2 font-mono text-[12px]">
                      <Link
                        href={`/marker-ofek/finance/tax-invoices/${r.id}`}
                        className="font-semibold text-indigo-700 hover:underline"
                      >
                        {r.invoiceNumberLabel ?? "טיוטה"}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded border px-2 py-0.5 text-[10px] font-bold ${KIND_TONE[r.kind]}`}
                      >
                        {KIND_LABEL[r.kind]}
                      </span>
                    </td>
                    <td className="px-3 py-2">{r.customerName}</td>
                    <td className="px-3 py-2 text-center font-mono text-[11px]">
                      {dateFmt.format(new Date(r.issueDate))}
                    </td>
                    <td className="px-3 py-2 text-end font-mono tabular-nums font-semibold">
                      {ILS.format(Number(r.grandTotal) || 0)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Badge
                        variant="outline"
                        className={`border ${sb.cls} text-[10px]`}
                      >
                        {sb.label}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Badge
                        variant="outline"
                        className={`border ${pb.cls} text-[10px]`}
                      >
                        {pb.label}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-[10px] text-slate-700">
                      {r.allocationNumber ?? "—"}
                    </td>
                    {/* T7c — Print-count cell: shows count + a small "מקור/העתק"
                        hint so the audit trail is visible at a glance. */}
                    <td className="px-3 py-2 text-center font-mono text-[10px]">
                      {r.printCount > 0 ? (
                        <span
                          className="inline-flex items-center gap-1"
                          title={
                            r.printCount === 1
                              ? "הודפס פעם אחת כמקור"
                              : `הודפס ${r.printCount} פעמים (מקור + ${r.printCount - 1} העתקים)`
                          }
                        >
                          <Printer className="size-3 text-emerald-700" aria-hidden />
                          <span className="font-bold tabular-nums text-emerald-800">
                            {r.printCount}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
                        {canPrint ? (
                          // T7c — Button label flips to "הדפס מחדש" once the
                          // invoice has been printed at least once. The print
                          // page itself records the event on load and stamps
                          // the document as "העתק" automatically.
                          <ContextualPrintButton
                            kind="tax-invoices"
                            id={r.id}
                            label={r.printCount > 0 ? "הדפס מחדש" : "PDF"}
                            size="sm"
                            className={
                              r.printCount > 0
                                ? "h-7 gap-1 border-emerald-300 bg-emerald-50 px-2 text-[10px] text-emerald-800 hover:bg-emerald-100"
                                : "h-7 px-2 text-[10px]"
                            }
                            icon={
                              r.printCount > 0 ? (
                                <Printer className="size-3" aria-hidden />
                              ) : undefined
                            }
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
