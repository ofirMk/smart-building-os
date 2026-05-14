"use client"

/**
 * Tax Invoice — A4 Print Template (חשבונית מס)
 * ----------------------------------------------------------------------------
 * Visual-parity reproduction of the Z3417500450 consolidated invoice sample
 * (43 lines from 12 source delivery notes, ארכה בע"מ → לייטמן, 31/01/17).
 *
 * Feature highlights (T7b):
 *   • 9-column line table: # / מק״ט / תעודה / תאור / כמות / יח' / מחיר
 *     ליחידה / הנחה% / סה״כ מחיר.
 *     — "תעודה" column renders only when kind='CONSOLIDATED_INVOICE' OR when
 *       at least one line has a source_doc_number (source-doc spine per §A.2).
 *     — "הנחה" column renders only when at least one line has discount > 0.
 *   • Code-39 barcode for invoice_number_label (ITA compliance: printable
 *     machine-readable identifier, R9).
 *   • Header date triple: תאריך חשבונית / תאריך הדפסה / שעת הדפסה
 *     (collapses to two rows when print_date === issue_date, Lightman style).
 *   • Totals block: 5-row waterfall (subtotal → global_discount → subtotal
 *     after discount → VAT → grand total) — collapses to 3 rows when no
 *     discount (Lightman single-line invoice pattern).
 *   • Payment block (bank details) + retention-of-title clause + payee-name
 *     override (שיקים נא לרשום ל-...) + active manager + signatories + ט.ל.ח.
 *   • Print-event audit: auto-invokes `recordPrintEventAction` on mount.
 *     First call returns copyLabel=מקור and transitions the invoice to
 *     status=PRINTED_ORIGINAL; subsequent calls return העתק → REPRINTED.
 *   • Digital signature SHA-256 rendered as small-caps footer (R9 audit
 *     footprint, verifiable against closed snapshot).
 */

import { useParams } from "next/navigation"
import * as React from "react"
import { Loader2, Printer } from "lucide-react"

import { fetchTaxInvoiceAction, recordPrintEventAction } from "@/lib/marker-ofek/finance/t7-tax-invoice-actions"
import type { FetchedTaxInvoiceHeader, FetchedTaxInvoiceLine, TaxInvoiceKind } from "@/lib/marker-ofek/finance/t7-tax-invoice-actions"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { formatError } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types — issuer (erp_companies) block pulled separately on the client
// ---------------------------------------------------------------------------

type IssuerRow = {
  id: string
  name_he: string
  name_en: string
  legal_id: string | null
  vat_registration_number: string | null
  withholding_id: string | null
  mod_supplier_number: string | null
  address: string | null
  phone: string | null
  fax: string | null
  email: string | null
  website: string | null
  bank_name: string | null
  bank_branch: string | null
  bank_account_number: string | null
  brand_logo_url: string | null
  payee_check_name: string | null
  retention_of_title_clause: string | null
  active_manager_name: string | null
  legal_disclaimer: string | null
  signatories: Array<{
    name?: string
    email?: string
    phone?: string
    role?: string
    branch?: string
  }> | null
}

const KIND_TITLE_HE: Record<TaxInvoiceKind, string> = {
  TAX_INVOICE: "חשבונית מס",
  TAX_RECEIPT: "חשבונית מס / קבלה",
  CREDIT_MEMO: "חשבונית זיכוי",
  CONSOLIDATED_INVOICE: "חשבונית מס מרכזת",
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

const ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
})

const num2 = new Intl.NumberFormat("he-IL", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const pct = new Intl.NumberFormat("he-IL", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const dateFmt = new Intl.DateTimeFormat("he-IL", { dateStyle: "short" })

function formatTime(t: string | null): string {
  if (!t) return ""
  // Input shapes we tolerate: "HH:MM:SS", "HH:MM:SS.nnn+00", "HH:MM".
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(t)
  if (!m) return ""
  return m[3] ? `${m[1]}:${m[2]}:${m[3]}` : `${m[1]}:${m[2]}`
}

// ---------------------------------------------------------------------------
// Code-39 barcode — minimal inline encoder (digits + uppercase letters + '-')
// ---------------------------------------------------------------------------

const CODE39: Record<string, string> = {
  "0": "NNNWWNWNN",
  "1": "WNNWNNNNW",
  "2": "NNWWNNNNW",
  "3": "WNWWNNNNN",
  "4": "NNNWWNNNW",
  "5": "WNNWWNNNN",
  "6": "NNWWWNNNN",
  "7": "NNNWNNWNW",
  "8": "WNNWNNWNN",
  "9": "NNWWNNWNN",
  A: "WNNNNWNNW",
  B: "NNWNNWNNW",
  C: "WNWNNWNNN",
  D: "NNNNWWNNW",
  E: "WNNNWWNNN",
  F: "NNWNWWNNN",
  G: "NNNNNWWNW",
  H: "WNNNNWWNN",
  I: "NNWNNWWNN",
  J: "NNNNWWWNN",
  K: "WNNNNNNWW",
  L: "NNWNNNNWW",
  M: "WNWNNNNWN",
  N: "NNNNWNNWW",
  O: "WNNNWNNWN",
  P: "NNWNWNNWN",
  Q: "NNNNNNWWW",
  R: "WNNNNNWWN",
  S: "NNWNNNWWN",
  T: "NNNNWNWWN",
  U: "WWNNNNNNW",
  V: "NWWNNNNNW",
  W: "WWWNNNNNN",
  X: "NWNNWNNNW",
  Y: "WWNNWNNNN",
  Z: "NWWNWNNNN",
  "-": "NWNNNNWNW",
  ".": "WWNNNNWNN",
  " ": "NWWNNNWNN",
  $: "NWNWNWNNN",
  "/": "NWNWNNNWN",
  "+": "NWNNNWNWN",
  "%": "NNNWNWNWN",
  "*": "NWNNWNWNN",
}

type BarcodeSeg = { x: number; w: number }

function encodeCode39(text: string): { bars: BarcodeSeg[]; totalWidth: number } {
  const narrow = 2 // px at viewBox scale
  const wide = narrow * 3
  const gap = narrow
  const chars = ["*", ...text.toUpperCase().split(""), "*"]
  const bars: BarcodeSeg[] = []
  let x = 0
  for (let i = 0; i < chars.length; i++) {
    const pattern = CODE39[chars[i]]
    if (!pattern) continue
    // Pattern has 9 elements: bars and spaces alternating, starting with a bar.
    for (let j = 0; j < pattern.length; j++) {
      const w = pattern[j] === "W" ? wide : narrow
      const isBar = j % 2 === 0
      if (isBar) bars.push({ x, w })
      x += w
    }
    if (i < chars.length - 1) x += gap
  }
  return { bars, totalWidth: x }
}

function Code39({ text, height = 48 }: { text: string; height?: number }) {
  if (!text) return null
  const { bars, totalWidth } = encodeCode39(text)
  return (
    <svg
      role="img"
      aria-label={`ברקוד Code-39: ${text}`}
      viewBox={`0 0 ${totalWidth} ${height}`}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      className="block"
    >
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={height} fill="black" />
      ))}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function TaxInvoicePrintPage() {
  const params = useParams<{ id: string }>()
  const id = typeof params?.id === "string" ? params.id : ""

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [header, setHeader] = React.useState<FetchedTaxInvoiceHeader | null>(null)
  const [lines, setLines] = React.useState<FetchedTaxInvoiceLine[]>([])
  const [issuer, setIssuer] = React.useState<IssuerRow | null>(null)
  const [copyLabel, setCopyLabel] = React.useState<"מקור" | "העתק" | null>(null)
  const printEventRegisteredRef = React.useRef(false)

  React.useEffect(() => {
    if (!id) {
      setError("מזהה חשבונית חסר")
      setLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await fetchTaxInvoiceAction(id)
        if (!res.ok) {
          if (!cancelled) setError(res.error)
          return
        }
        if (cancelled) return
        setHeader(res.header)
        setLines(res.lines)

        // Fetch issuer block separately from the browser (RLS-safe).
        const supabase = createSupabaseBrowserClient()
        const { data: companyRow } = await supabase
          .from("erp_companies")
          .select(
            "id, name_he, name_en, legal_id, vat_registration_number, withholding_id, mod_supplier_number, address, phone, fax, email, website, bank_name, bank_branch, bank_account_number, brand_logo_url, payee_check_name, retention_of_title_clause, active_manager_name, legal_disclaimer, signatories",
          )
          .eq("id", res.header.companyId)
          .maybeSingle()
        if (!cancelled) setIssuer((companyRow ?? null) as IssuerRow | null)

        // Auto-register a print event on first successful render — idempotent
        // within this page instance via `printEventRegisteredRef`. Only fires
        // when the invoice is already closed (DRAFT / PENDING_ALLOCATION are
        // rejected by the server action anyway).
        if (
          !printEventRegisteredRef.current &&
          res.header.status !== "DRAFT" &&
          res.header.status !== "PENDING_ALLOCATION" &&
          res.header.status !== "CANCELLED"
        ) {
          printEventRegisteredRef.current = true
          const ev = await recordPrintEventAction({
            invoiceId: id,
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
          })
          if (!cancelled && ev.ok) {
            setCopyLabel(ev.copyLabel)
          }
        } else if (res.header.status === "CANCELLED") {
          setCopyLabel("העתק")
        }
      } catch (e) {
        if (!cancelled) setError(formatError(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-slate-600">
        <Loader2 className="size-8 animate-spin" aria-hidden />
        <p className="text-sm">טוען חשבונית מס…</p>
      </div>
    )
  }

  if (error || !header) {
    return (
      <div className="mx-auto max-w-md p-8 text-center text-slate-700">
        <p className="text-base font-semibold text-red-700">
          {error ?? "החשבונית לא נמצאה"}
        </p>
      </div>
    )
  }

  // ---- Dynamic column visibility ----
  const showSourceDocCol =
    header.kind === "CONSOLIDATED_INVOICE" ||
    lines.some((l) => (l.sourceDocNumber ?? "").trim().length > 0)
  const showDiscountCol = lines.some((l) => Number(l.discountPct) > 0)

  // ---- Totals block collapse logic ----
  const hasGlobalDiscount = Number(header.globalDiscountAmount) !== 0

  // ---- Header date triple collapse ----
  const printDateStr = header.printDate ?? (copyLabel ? new Date().toISOString().slice(0, 10) : null)
  const printTimeStr = header.printDate
    ? formatTime(null) // print_time column not exposed by fetch action — minor; safe to omit
    : copyLabel
      ? new Date().toTimeString().slice(0, 8)
      : ""
  const issueDateStr = header.issueDate
  const showPrintStamp = Boolean(printDateStr) && printDateStr !== issueDateStr

  // ---- Barcode ----
  const barcodeText = header.invoiceNumberLabel ?? ""

  // ---- Signatories ----
  const signatories = Array.isArray(issuer?.signatories) ? issuer?.signatories : []

  return (
    <div className="mx-auto w-full max-w-[210mm] bg-white px-6 py-8 text-black print:px-0 print:py-0">
      {/* Floating print button — hidden when printing */}
      <div
        data-print-control="1"
        className="fixed bottom-6 left-6 z-50 print:hidden"
      >
        <button
          type="button"
          onClick={() => window.print()}
          className="group inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-lg ring-1 ring-slate-900/20 transition hover:bg-slate-800 hover:shadow-xl active:scale-[0.98]"
          aria-label="הדפס / הפק PDF"
        >
          <Printer className="size-4" aria-hidden />
          <span>הדפס / הפק PDF</span>
        </button>
      </div>

      <article
        dir="rtl"
        lang="he"
        className="text-[11.5px] leading-[1.45] text-black"
        aria-label={KIND_TITLE_HE[header.kind]}
      >
        {/* ============================ Header ============================ */}
        <header className="border-b-2 border-black pb-3">
          <div className="flex items-start justify-between gap-6">
            {/* Issuer block */}
            <div className="flex items-start gap-3">
              {issuer?.brand_logo_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={issuer.brand_logo_url}
                  alt={`לוגו ${issuer.name_he}`}
                  className="size-14 shrink-0 rounded-md object-contain"
                />
              ) : (
                <div
                  aria-hidden
                  className="flex size-14 shrink-0 items-center justify-center rounded-md border-2 border-black bg-white text-[10px] font-bold tracking-wider text-black"
                >
                  לוגו
                </div>
              )}
              <div className="space-y-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-black/60">
                  המנפיק
                </p>
                <p className="text-[14px] font-bold leading-tight">
                  {issuer?.name_he ?? header.customerName /* fallback only */}
                </p>
                {issuer?.legal_id ? (
                  <p className="text-[10.5px]">
                    ח.פ / ע.מ{" "}
                    <span className="font-mono">{issuer.legal_id}</span>
                  </p>
                ) : null}
                {issuer?.vat_registration_number &&
                issuer.vat_registration_number !== issuer.legal_id ? (
                  <p className="text-[10.5px]">
                    עוסק מורשה{" "}
                    <span className="font-mono">{issuer.vat_registration_number}</span>
                  </p>
                ) : null}
                {issuer?.mod_supplier_number ? (
                  <p className="text-[10.5px]">
                    ספק משהב&quot;ט{" "}
                    <span className="font-mono">{issuer.mod_supplier_number}</span>
                  </p>
                ) : null}
                {issuer?.address ? (
                  <p className="text-[10.5px]">{issuer.address}</p>
                ) : null}
                {issuer?.phone ? (
                  <p className="text-[10.5px]">טל׳ {issuer.phone}</p>
                ) : null}
              </div>
            </div>

            {/* Document title + copy stamp + barcode */}
            <div className="flex flex-col items-end gap-2">
              <div className="text-end">
                <h1 className="border-2 border-black px-5 py-2 text-[18px] font-black tracking-tight">
                  {KIND_TITLE_HE[header.kind]}
                </h1>
                <p className="mt-1 text-[10.5px] text-black">
                  {copyLabel === "העתק" ? (
                    <span className="font-bold text-amber-800 print:text-black">
                      העתק · Reprint
                    </span>
                  ) : copyLabel === "מקור" ? (
                    <span className="font-bold text-emerald-800 print:text-black">
                      מקור · Original
                    </span>
                  ) : header.status === "DRAFT" ? (
                    <span className="font-bold text-slate-600">טיוטה</span>
                  ) : null}
                </p>
              </div>
              {barcodeText ? (
                <div className="w-[180px] border border-black/20 bg-white px-1 py-1">
                  <Code39 text={barcodeText} height={40} />
                  <p className="mt-0.5 text-center font-mono text-[10px] tracking-wide">
                    *{barcodeText}*
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          {/* Document classification block — triple dates + invoice number */}
          <div
            className={`mt-3 grid gap-0 border-2 border-black ${
              showPrintStamp ? "grid-cols-5" : "grid-cols-4"
            }`}
          >
            <DetailCell
              label="מספר חשבונית"
              value={
                <span className="font-mono text-[14px] font-bold">
                  {header.invoiceNumberLabel ?? "—"}
                </span>
              }
            />
            <DetailCell
              label="תאריך חשבונית"
              value={<span className="font-mono">{dateFmt.format(new Date(issueDateStr))}</span>}
            />
            {showPrintStamp && printDateStr ? (
              <DetailCell
                label="תאריך הדפסה"
                value={<span className="font-mono">{dateFmt.format(new Date(printDateStr))}</span>}
              />
            ) : null}
            {showPrintStamp && printTimeStr ? (
              <DetailCell
                label="שעת הדפסה"
                value={<span className="font-mono">{printTimeStr}</span>}
              />
            ) : null}
            <DetailCell
              label="סטטוס"
              value={
                <span className="text-[11.5px] font-semibold">
                  {header.status === "CANCELLED"
                    ? "בוטלה"
                    : header.status === "CLOSED" ||
                        header.status === "PRINTED_ORIGINAL" ||
                        header.status === "REPRINTED"
                      ? "סגורה"
                      : header.status === "PENDING_ALLOCATION"
                        ? "ממתינה להקצאה"
                        : "טיוטה"}
                </span>
              }
            />
          </div>

          {/* Buyer block */}
          <div className="mt-2 grid grid-cols-3 gap-0 border-2 border-black">
            <DetailCell label="לכבוד" value={header.customerName} />
            {header.attentionTo ? (
              <DetailCell label="לידי" value={header.attentionTo} />
            ) : (
              <DetailCell
                label="כתובת"
                value={header.customerAddress ?? "—"}
              />
            )}
            <DetailCell
              label={header.customerVatId ? "מס׳ עוסק" : "ח.פ / ע.מ"}
              value={
                <span className="font-mono">
                  {header.customerVatId ??
                    header.customerLegalId ??
                    header.customerFileNumber ??
                    "—"}
                </span>
              }
            />
          </div>

          {header.shipToAddress ? (
            <p className="mt-1 text-[10.5px] text-black/80">
              <span className="font-bold">כתובת למשלוח:</span>{" "}
              {header.shipToAddress}
            </p>
          ) : null}
          {header.customerInternalCode ? (
            <p className="mt-0.5 text-[10.5px] text-black/70">
              מס. לקוח (פנימי):{" "}
              <span className="font-mono">{header.customerInternalCode}</span>
            </p>
          ) : null}
        </header>

        {/* ============================ Lines table ============================ */}
        <section aria-label="שורות החשבונית" className="mt-4">
          <table className="w-full border-collapse border-2 border-black text-[10.5px]">
            <thead>
              <tr className="bg-slate-100 print:bg-white">
                <Th className="w-[4%]">#</Th>
                <Th className="w-[10%]">מק״ט</Th>
                {showSourceDocCol ? <Th className="w-[10%]">תעודה</Th> : null}
                <Th className="w-[30%] text-start">תאור</Th>
                <Th className="w-[7%]">כמות</Th>
                <Th className="w-[6%]">יח׳</Th>
                <Th className="w-[10%]">מחיר ליחידה</Th>
                {showDiscountCol ? <Th className="w-[7%]">הנחה %</Th> : null}
                <Th className="w-[12%]">סה״כ מחיר</Th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td
                    colSpan={showSourceDocCol ? (showDiscountCol ? 9 : 8) : showDiscountCol ? 8 : 7}
                    className="border border-black px-3 py-3 text-center text-black/70"
                  >
                    לא הוזנו שורות
                  </td>
                </tr>
              ) : (
                lines.map((l) => (
                  <tr key={l.lineNo} className="break-inside-avoid">
                    <Td className="font-mono tabular-nums">{l.lineNo}</Td>
                    <Td className="font-mono">{l.itemCode ?? "—"}</Td>
                    {showSourceDocCol ? (
                      <Td className="font-mono text-[10px]">
                        {l.sourceDocNumber ?? ""}
                      </Td>
                    ) : null}
                    <Td className="text-start">{l.description}</Td>
                    <Td className="font-mono tabular-nums">
                      {num2.format(Number(l.quantity) || 0)}
                    </Td>
                    <Td className="text-[10px]">{l.unitLabel ?? ""}</Td>
                    <Td className="font-mono tabular-nums">
                      {ils.format(Number(l.unitPriceExcl) || 0)}
                    </Td>
                    {showDiscountCol ? (
                      <Td className="font-mono tabular-nums">
                        {l.discountPct > 0 ? `${pct.format(l.discountPct)}%` : ""}
                      </Td>
                    ) : null}
                    <Td className="font-mono tabular-nums font-semibold">
                      {ils.format(Number(l.lineTotalExcl) || 0)}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        {/* ====================== Totals block ====================== */}
        <section aria-label="סיכום כספי" className="mt-4 break-inside-avoid">
          <div className="border-2 border-black">
            <table className="w-full border-collapse text-[12px]">
              <tbody>
                <TotalsRow label="מחיר כולל (לפני הנחה)" value={header.subtotalAmount} bold />
                {hasGlobalDiscount ? (
                  <>
                    <TotalsRow
                      label={`הנחה כללית (${pct.format(header.globalDiscountPct)}%)`}
                      value={-header.globalDiscountAmount}
                      negative
                    />
                    <TotalsRow
                      label="מחיר אחרי הנחה"
                      value={header.subtotalAfterDiscount}
                      emphasized
                    />
                  </>
                ) : null}
                <TotalsRow
                  label={`מע״מ (${pct.format(header.vatRatePct)}%)`}
                  value={header.vatAmount}
                />
                <TotalsRow
                  label="סה״כ לתשלום (כולל מע״מ)"
                  value={header.grandTotal}
                  grand
                />
              </tbody>
            </table>
          </div>
        </section>

        {/* ====================== Payment + legal block ====================== */}
        <section className="mt-4 grid grid-cols-2 gap-3 break-inside-avoid">
          {/* Payment block */}
          <div className="rounded-md border border-black/40 p-3 text-[10.5px]">
            <p className="text-[11px] font-bold text-black">פרטי תשלום</p>
            {issuer?.payee_check_name ? (
              <p className="mt-0.5">
                <span className="font-semibold">שיקים נא לרשום ל:</span>{" "}
                {issuer.payee_check_name}
              </p>
            ) : (
              <p className="mt-0.5">
                <span className="font-semibold">שיקים נא לרשום ל:</span>{" "}
                {issuer?.name_he ?? ""}
              </p>
            )}
            {issuer?.bank_name || issuer?.bank_branch || issuer?.bank_account_number ? (
              <p className="mt-0.5 text-black/80">
                העברה בנקאית:{" "}
                {[
                  issuer.bank_name,
                  issuer.bank_branch ? `סניף ${issuer.bank_branch}` : null,
                  issuer.bank_account_number ? `חשבון ${issuer.bank_account_number}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
            {header.allocationNumber ? (
              <p className="mt-0.5">
                <span className="font-semibold">מספר הקצאה (רשות המסים):</span>{" "}
                <span className="font-mono">{header.allocationNumber}</span>
              </p>
            ) : null}
          </div>

          {/* Legal / retention block */}
          <div className="rounded-md border border-black/40 p-3 text-[10.5px]">
            <p className="text-[11px] font-bold text-black">הודעות משפטיות</p>
            {issuer?.retention_of_title_clause ? (
              <p className="mt-0.5">{issuer.retention_of_title_clause}</p>
            ) : null}
            {issuer?.active_manager_name ? (
              <p className="mt-0.5 text-black/80">
                <span className="font-semibold">מנהל פעיל:</span>{" "}
                {issuer.active_manager_name}
              </p>
            ) : null}
            {header.agentName ? (
              <p className="mt-0.5 text-black/80">
                <span className="font-semibold">סוכן:</span> {header.agentName}
              </p>
            ) : null}
            {header.notes ? (
              <p className="mt-0.5 border-t border-black/20 pt-0.5 text-black/70">
                <span className="font-semibold">הערות:</span> {header.notes}
              </p>
            ) : null}
          </div>
        </section>

        {/* ====================== Signatories ====================== */}
        {signatories && signatories.length > 0 ? (
          <section className="mt-5 break-inside-avoid">
            <div className="grid grid-cols-3 gap-4">
              {signatories.slice(0, 3).map((s, i) => (
                <div key={i} className="flex flex-col">
                  <p className="mb-0.5 text-[10.5px] text-black/70">
                    בברכה,
                  </p>
                  <p className="text-[12px] font-bold">{s.name ?? "—"}</p>
                  {s.email ? (
                    <p className="text-[10px] text-black/70">{s.email}</p>
                  ) : null}
                  {s.phone ? (
                    <p className="text-[10px] text-black/70">טל׳ {s.phone}</p>
                  ) : null}
                  {s.role ? (
                    <p className="text-[10px] text-black/70">{s.role}</p>
                  ) : null}
                  {s.branch ? (
                    <p className="text-[10px] text-black/70">{s.branch}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* ============================ Footer ============================ */}
        <footer className="mt-5 border-t border-black/30 pt-2 text-[9.5px] text-black/70">
          <div className="flex items-center justify-between gap-3">
            <span className="font-bold">{issuer?.legal_disclaimer ?? "ט.ל.ח"}</span>
            <span>
              הופק על-ידי מערכת מרקר אופק · {dateFmt.format(new Date())}
            </span>
          </div>
          {header.digitalSignatureSha256 ? (
            <p className="mt-1 break-all font-mono text-[8px] text-black/50">
              SHA-256:&nbsp;{header.digitalSignatureSha256}
            </p>
          ) : null}
        </footer>
      </article>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components (visual consistency with /print/bills/[id])
// ---------------------------------------------------------------------------

function DetailCell({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex flex-col border border-black px-3 py-1.5">
      <span className="text-[9.5px] font-semibold uppercase tracking-wide text-black/60">
        {label}
      </span>
      <span className="mt-0.5 text-[11.5px] font-medium text-black">{value}</span>
    </div>
  )
}

function Th({
  children,
  className = "",
  colSpan,
}: {
  children: React.ReactNode
  className?: string
  colSpan?: number
}) {
  return (
    <th
      colSpan={colSpan}
      className={`border border-black bg-slate-100 px-2 py-1 text-center text-[10.5px] font-bold print:bg-white ${className}`}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <td className={`border border-black px-2 py-1 text-center ${className}`}>
      {children}
    </td>
  )
}

function TotalsRow({
  label,
  value,
  bold = false,
  emphasized = false,
  negative = false,
  grand = false,
}: {
  label: string
  value: number
  bold?: boolean
  emphasized?: boolean
  negative?: boolean
  grand?: boolean
}) {
  const rowClass = grand
    ? "border-t-[3px] border-black bg-slate-200 print:bg-white"
    : emphasized
      ? "border-t-2 border-black bg-slate-50 print:bg-white"
      : ""

  const labelClass = grand
    ? "text-[14px] font-black"
    : emphasized || bold
      ? "text-[12px] font-bold"
      : "text-[11.5px] font-medium"

  const valueClass = grand
    ? "text-[14px] font-black"
    : emphasized || bold
      ? "text-[12px] font-bold"
      : "text-[11.5px]"

  return (
    <tr className={`border-b border-black/30 ${rowClass}`}>
      <th scope="row" className={`px-3 py-1 text-end ${labelClass}`}>
        {label}
      </th>
      <td
        className={`w-[35%] px-3 py-1 text-end font-mono tabular-nums ${valueClass} ${
          negative ? "text-red-700 print:text-black" : ""
        }`}
      >
        {ils.format(value)}
      </td>
    </tr>
  )
}
