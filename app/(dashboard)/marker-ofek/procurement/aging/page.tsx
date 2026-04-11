"use client"

import Link from "next/link"
import * as React from "react"
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Loader2,
  Scale,
  Truck,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { formatError } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
type EntityEmbed = { name: string }
type ProjectEmbed = { name: string; internal_project_code: string }

type PoRow = {
  id: string
  po_number: string
  status: string
  supplier_id: string
  projects: ProjectEmbed | ProjectEmbed[] | null
  entities: EntityEmbed | EntityEmbed[] | null
  po_line_items:
    | {
        id: string
        quantity: number
        unit_price: number
        created_at: string
      }[]
    | null
}

type InvoiceRow = {
  id: string
  supplier_id: string
  po_id: string
  invoice_number: string | null
  total_amount: number
  status: string
  invoice_date: string
  paid_at: string | null
}

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null
  return Array.isArray(x) ? (x[0] ?? null) : x
}

function embedMany<T>(x: T | T[] | null | undefined): T[] {
  if (x == null) return []
  return Array.isArray(x) ? x : [x]
}

const currencyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const dateFormatter = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "short",
})

function poStatusLabel(s: string): string {
  const map: Record<string, string> = {
    draft: "טיוטה",
    approved: "אושרה",
    pending_ceo_approval: "ממתינה לאישור מנכ״ל",
    sent: "נשלחה לספק",
    partial_receipt: "קבלה חלקית",
    closed: "נסגרה",
  }
  return map[s] ?? s
}

export default function ProcurementAgingPage() {
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [openRows, setOpenRows] = React.useState<
    {
      poId: string
      poNumber: string
      supplierId: string
      supplierName: string
      projectName: string
      receivedValue: number
      paidOnPo: number
      pendingOnPo: number
      balance: number
      status: string
    }[]
  >([])
  const [closedInvoices, setClosedInvoices] = React.useState<
    (InvoiceRow & { supplierName: string; poNumber: string })[]
  >([])
  const [supplierDebt, setSupplierDebt] = React.useState<
    { supplierId: string; name: string; balance: number }[]
  >([])

  React.useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const supabase = createSupabaseBrowserClient()

        const { data: pos, error: poErr } = await supabase
          .from("purchase_orders")
          .select(
            `
            id,
            po_number,
            status,
            supplier_id,
            projects ( name, internal_project_code ),
            entities ( name ),
            po_line_items ( id, quantity, unit_price, created_at )
          `
          )
          .eq("is_deleted", false)
          .neq("status", "draft")
          .order("created_at", { ascending: false })
          .limit(200)

        if (poErr) throw poErr

        const poList = (pos ?? []) as PoRow[]
        const poIds = poList.map((p) => p.id)

        let receiptRows: { id: string; po_id: string }[] = []
        if (poIds.length > 0) {
          const { data: receipts, error: recErr } = await supabase
            .from("goods_receipts")
            .select("id, po_id")
            .in("po_id", poIds)

          if (recErr) throw recErr
          receiptRows = (receipts ?? []) as { id: string; po_id: string }[]
        }
        const receiptIds = receiptRows.map((r) => r.id)

        let griRows: { po_line_item_id: string; quantity_received: number }[] =
          []
        if (receiptIds.length > 0) {
          const { data: gri, error: griErr } = await supabase
            .from("goods_receipt_items")
            .select("po_line_item_id, quantity_received")
            .in("goods_receipt_id", receiptIds)

          if (griErr) throw griErr
          griRows =
            (gri as {
              po_line_item_id: string
              quantity_received: number
            }[]) ?? []
        }

        const qtyByLine: Record<string, number> = {}
        for (const row of griRows) {
          const lid = row.po_line_item_id
          const q = Number(row.quantity_received) || 0
          qtyByLine[lid] = (qtyByLine[lid] ?? 0) + q
        }

        const { data: invData, error: invErr } = await supabase
          .from("supplier_invoices")
          .select(
            "id, supplier_id, po_id, invoice_number, total_amount, status, invoice_date, paid_at"
          )

        if (invErr) {
          if (
            invErr.message?.includes("relation") ||
            invErr.message?.includes("does not exist")
          ) {
            if (!cancelled) {
              setError(
                "הטבלה supplier_invoices לא קיימת — ודאו שהסכמה של חשבונות ספק הורצה ב-Supabase."
              )
            }
            return
          }
          throw invErr
        }

        const invoices = (invData ?? []) as InvoiceRow[]
        const paidByPo: Record<string, number> = {}
        for (const inv of invoices) {
          if (inv.status !== "paid") continue
          paidByPo[inv.po_id] =
            (paidByPo[inv.po_id] ?? 0) + (Number(inv.total_amount) || 0)
        }

        const pendingByPo: Record<string, number> = {}
        for (const inv of invoices) {
          if (inv.status !== "pending" && inv.status !== "pending_match") continue
          pendingByPo[inv.po_id] =
            (pendingByPo[inv.po_id] ?? 0) + (Number(inv.total_amount) || 0)
        }

        const open: typeof openRows = []
        const debtMap: Record<string, { name: string; balance: number }> = {}

        for (const p of poList) {
          const lines = embedMany(p.po_line_items).sort(
            (a, b) =>
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime()
          )
          let receivedValue = 0
          for (const li of lines) {
            const ordered = Number(li.quantity) || 0
            const got = qtyByLine[li.id] ?? 0
            const billQty = Math.min(ordered, got)
            receivedValue += billQty * (Number(li.unit_price) || 0)
          }

          if (receivedValue <= 0.005) continue

          const paid = paidByPo[p.id] ?? 0
          const pendingInv = pendingByPo[p.id] ?? 0
          const balance = Math.max(0, receivedValue - paid)

          const supplier = embedOne(p.entities)
          const project = embedOne(p.projects)
          const supplierName = supplier?.name ?? "—"
          const projectName = project?.name ?? "—"

          if (balance > 0.02) {
            open.push({
              poId: p.id,
              poNumber: p.po_number,
              supplierId: p.supplier_id,
              supplierName,
              projectName,
              receivedValue,
              paidOnPo: paid,
              pendingOnPo: pendingInv,
              balance,
              status: p.status,
            })
            const cur = debtMap[p.supplier_id] ?? {
              name: supplierName,
              balance: 0,
            }
            debtMap[p.supplier_id] = {
              name: cur.name,
              balance: cur.balance + balance,
            }
          }
        }

        const paidInvoices = invoices
          .filter((i) => i.status === "paid")
          .map((inv) => {
            const po = poList.find((x) => x.id === inv.po_id)
            const ent = po ? embedOne(po.entities) : null
            return {
              ...inv,
              supplierName: ent?.name ?? "—",
              poNumber: po?.po_number ?? "—",
            }
          })
          .sort((a, b) => {
            const ta = a.paid_at ? new Date(a.paid_at).getTime() : 0
            const tb = b.paid_at ? new Date(b.paid_at).getTime() : 0
            return tb - ta
          })

        const debtList = Object.entries(debtMap).map(([supplierId, v]) => ({
          supplierId,
          name: v.name,
          balance: v.balance,
        }))
        debtList.sort((a, b) => b.balance - a.balance)

        if (!cancelled) {
          setOpenRows(open)
          setClosedInvoices(paidInvoices)
          setSupplierDebt(debtList)
        }
      } catch (e) {
        if (!cancelled) {
          setError(formatError(e))
          setOpenRows([])
          setClosedInvoices([])
          setSupplierDebt([])
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 pb-12 sm:gap-8">
      <Link
        href="/marker-ofek/procurement"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה לרכש וספקים
      </Link>

      <header className="pharmacy-hero-card p-5 sm:p-8">
        <div
          className="pointer-events-none absolute -start-20 -top-20 size-64 rounded-full bg-amber-500/10 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-700">
              <Scale className="size-5 sm:size-6" aria-hidden />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-amber-700/90">
                מרקר אופק · רכש
              </p>
              <h1 className="text-pretty text-xl font-bold tracking-tight text-[#1e293b] sm:text-3xl">
                גילון ספקים וחוב
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-slate-500">
                חשבונות פתוחים מול סחורה שהתקבלה, היסטוריית תשלומים, וסיכום חוב
                לפי ספק.
              </p>
            </div>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" aria-hidden />
          <span>טוען נתונים…</span>
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden />
          <AlertTitle>לא ניתן לטעון את הגילון</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <>
          <section className="rounded-2xl border border-border/60 bg-card/90 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-3 sm:px-6 sm:py-4">
              <Building2 className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <h2 className="text-base font-semibold sm:text-lg">
                סה״כ חוב לספק (לפי סחורה שהתקבלה פחות תשלומים ששולמו)
              </h2>
            </div>
            {supplierDebt.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground sm:px-6">
                אין יתרות פתוחות לפי הנתונים הנוכחיים.
              </p>
            ) : (
              <>
                <ul className="flex flex-col gap-2 p-3 sm:p-4 md:hidden">
                  {supplierDebt.map((s) => (
                    <li
                      key={s.supplierId}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3"
                    >
                      <span className="min-w-0 truncate font-medium">{s.name}</span>
                      <span className="shrink-0 text-base font-bold tabular-nums text-amber-800">
                        {currencyFormatter.format(s.balance)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="hidden overflow-x-auto md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead className="min-w-[10rem]">ספק</TableHead>
                        <TableHead className="min-w-[8rem] text-end">
                          יתרה לתשלום
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {supplierDebt.map((s) => (
                        <TableRow key={s.supplierId}>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell className="text-end text-base font-bold tabular-nums text-amber-800">
                            {currencyFormatter.format(s.balance)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </section>

          <section className="rounded-2xl border border-border/60 bg-card/90 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-3 sm:px-6 sm:py-4">
              <AlertTriangle className="size-5 shrink-0 text-amber-600" aria-hidden />
              <h2 className="text-base font-semibold sm:text-lg">
                חשבונות פתוחים
              </h2>
            </div>
            <p className="border-b border-border/40 px-3 py-2 text-xs text-muted-foreground sm:px-6">
              הזמנות עם סחורה שהתקבלה שעדיין לא כוסו במלואן בתשלומים שסומנו כשולמו
              ב־<code className="rounded bg-muted px-1">supplier_invoices</code>.
            </p>
            {openRows.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground sm:px-6">
                אין יתרות פתוחות, או שטרם נרשמו קבלות סחורה.
              </p>
            ) : (
              <>
                <ul className="flex flex-col gap-3 p-3 sm:p-4 md:hidden">
                  {openRows.map((r) => (
                    <li
                      key={r.poId}
                      className="rounded-xl border border-border/60 bg-muted/20 p-4 shadow-xs"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <Link
                          href={`/marker-ofek/procurement/${r.poId}`}
                          className="font-mono text-sm font-semibold text-emerald-700 underline-offset-4 hover:underline"
                        >
                          {r.poNumber}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {poStatusLabel(r.status)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-medium">{r.supplierName}</p>
                      <p className="text-xs text-muted-foreground">{r.projectName}</p>
                      <dl className="mt-3 grid grid-cols-2 gap-x-2 gap-y-2 text-xs">
                        <dt className="text-muted-foreground">סחורה התקבלה</dt>
                        <dd className="text-end tabular-nums">
                          {currencyFormatter.format(r.receivedValue)}
                        </dd>
                        <dt className="text-muted-foreground">שולם</dt>
                        <dd className="text-end tabular-nums">
                          {currencyFormatter.format(r.paidOnPo)}
                        </dd>
                        <dt className="text-muted-foreground">בהמתנה</dt>
                        <dd className="text-end tabular-nums text-muted-foreground">
                          {currencyFormatter.format(r.pendingOnPo)}
                        </dd>
                        <dt className="font-semibold text-amber-900">
                          יתרה
                        </dt>
                        <dd className="text-end text-base font-bold tabular-nums text-amber-800">
                          {currencyFormatter.format(r.balance)}
                        </dd>
                      </dl>
                    </li>
                  ))}
                </ul>
                <div className="hidden overflow-x-auto overscroll-x-contain md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="min-w-[7rem]">הזמנה</TableHead>
                      <TableHead className="min-w-[8rem]">ספק</TableHead>
                      <TableHead className="min-w-[8rem]">פרויקט</TableHead>
                      <TableHead className="min-w-[6rem]">סטטוס PO</TableHead>
                      <TableHead className="min-w-[7rem] text-end">
                        סחורה התקבלה
                      </TableHead>
                      <TableHead className="min-w-[7rem] text-end">שולם</TableHead>
                      <TableHead className="min-w-[7rem] text-end">
                        חשבונות בהמתנה
                      </TableHead>
                      <TableHead className="min-w-[7rem] text-end">יתרה</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {openRows.map((r) => (
                      <TableRow key={r.poId}>
                        <TableCell className="font-mono text-sm">
                          <Link
                            href={`/marker-ofek/procurement/${r.poId}`}
                            className="text-emerald-700 underline-offset-4 hover:underline"
                          >
                            {r.poNumber}
                          </Link>
                        </TableCell>
                        <TableCell className="max-w-[140px] truncate sm:max-w-none">
                          {r.supplierName}
                        </TableCell>
                        <TableCell className="max-w-[140px] truncate sm:max-w-none">
                          {r.projectName}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {poStatusLabel(r.status)}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {currencyFormatter.format(r.receivedValue)}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {currencyFormatter.format(r.paidOnPo)}
                        </TableCell>
                        <TableCell className="text-end tabular-nums text-muted-foreground">
                          {currencyFormatter.format(r.pendingOnPo)}
                        </TableCell>
                        <TableCell className="text-end font-semibold tabular-nums text-amber-800">
                          {currencyFormatter.format(r.balance)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              </>
            )}
          </section>

          <section className="rounded-2xl border border-border/60 bg-card/90 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-3 sm:px-6 sm:py-4">
              <CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-hidden />
              <h2 className="text-base font-semibold sm:text-lg">
                חשבונות סגורים (תשלומים ששולמו)
              </h2>
            </div>
            {closedInvoices.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground sm:px-6">
                אין עדיין רשומות בתשלום בטבלת חשבונות הספק.
              </p>
            ) : (
              <>
                <ul className="flex flex-col gap-3 p-3 sm:p-4 md:hidden">
                  {closedInvoices.map((inv) => (
                    <li
                      key={inv.id}
                      className="rounded-xl border border-border/60 bg-muted/15 p-4 shadow-xs"
                    >
                      <p className="font-medium">{inv.supplierName}</p>
                      <p className="mt-1 font-mono text-sm">
                        <Link
                          href={`/marker-ofek/procurement/${inv.po_id}`}
                          className="text-emerald-700 underline-offset-4 hover:underline"
                        >
                          {inv.poNumber}
                        </Link>
                        {" · "}
                        <span className="text-muted-foreground">
                          {inv.invoice_number ?? "—"}
                        </span>
                      </p>
                      <p className="mt-2 text-lg font-bold tabular-nums">
                        {currencyFormatter.format(Number(inv.total_amount) || 0)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        שולם:{" "}
                        {inv.paid_at
                          ? dateFormatter.format(new Date(inv.paid_at))
                          : "—"}
                      </p>
                    </li>
                  ))}
                </ul>
                <div className="hidden overflow-x-auto overscroll-x-contain md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="min-w-[8rem]">ספק</TableHead>
                      <TableHead className="min-w-[7rem]">הזמנה</TableHead>
                      <TableHead className="min-w-[6rem]">מספר חשבון</TableHead>
                      <TableHead className="min-w-[6rem] text-end">סכום</TableHead>
                      <TableHead className="min-w-[6rem]">תאריך חשבון</TableHead>
                      <TableHead className="min-w-[6rem]">שולם בתאריך</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {closedInvoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell>{inv.supplierName}</TableCell>
                        <TableCell className="font-mono text-sm">
                          <Link
                            href={`/marker-ofek/procurement/${inv.po_id}`}
                            className="text-emerald-700 underline-offset-4 hover:underline"
                          >
                            {inv.poNumber}
                          </Link>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {inv.invoice_number ?? "—"}
                        </TableCell>
                        <TableCell className="text-end font-medium tabular-nums">
                          {currencyFormatter.format(Number(inv.total_amount) || 0)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums text-sm">
                          {inv.invoice_date
                            ? dateFormatter.format(new Date(inv.invoice_date))
                            : "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums text-sm">
                          {inv.paid_at
                            ? dateFormatter.format(new Date(inv.paid_at))
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              </>
            )}

            <div className="border-t border-border/50 px-3 py-4 sm:px-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Truck className="size-4 shrink-0" aria-hidden />
                <span>
                  הזמנות שנסגרו (סטטוס &quot;נסגרה&quot;) מופיעות בפרטי ההזמנה; כאן
                  מוצגים תשלומים שדווחו במערכת.
                </span>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
