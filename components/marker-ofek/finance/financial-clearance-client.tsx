"use client"

import * as React from "react"
import { Camera, CheckCircle2, Loader2, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  authorizeProcurementInvoiceAction,
  getDeliveryNoteSignedUrlAction,
} from "@/lib/holden-erp/finance-actions"
import { cn } from "@/lib/utils"
import type { FinancialClearanceRow } from "@/types/holden-finance"

const ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
})

const glass =
  "rounded-2xl border border-white/10 bg-white/[0.04] shadow-[0_0_60px_-24px_rgba(16,185,129,0.45)] backdrop-blur-xl"

type Props = {
  initialRows: FinancialClearanceRow[]
  loadError: string | null
}

export function FinancialClearanceClient({ initialRows, loadError }: Props) {
  const [rows, setRows] = React.useState(initialRows)
  const [busyId, setBusyId] = React.useState<string | null>(null)

  React.useEffect(() => {
    setRows(initialRows)
  }, [initialRows])

  async function onApprove(receiptId: string) {
    setBusyId(receiptId)
    const res = await authorizeProcurementInvoiceAction(receiptId)
    setBusyId(null)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    if (res.pendingSync && res.message) {
      toast.message(res.message)
    } else {
      toast.success("אושר לתשלום — נוצרה טיוטה במסלקת מס״ב")
    }
    setRows((prev) => prev.filter((r) => r.receiptId !== receiptId))
  }

  return (
    <div dir="rtl" className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/40 to-slate-900 ring-1 ring-emerald-500/30">
            <ShieldCheck className="size-6 text-emerald-300" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              בקרת תשלומים
            </h1>
            <p className="text-sm text-slate-400">
              תחנת בקרה — הזמנה מול קבלת מחסן לפני שחרור לתשלום
            </p>
          </div>
        </div>
      </header>

      {loadError ? (
        <p className="text-sm text-red-400">{loadError}</p>
      ) : null}

      <div className="space-y-8">
        {rows.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-16 text-center text-slate-500">
            אין קבלות ממתינות לאישור פיננסי
          </p>
        ) : null}

        {rows.map((row) => (
          <section key={row.receiptId} className={cn(glass, "overflow-hidden")}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-black/30 px-5 py-4">
              <div>
                <p className="font-mono text-sm text-emerald-200/90">
                  PO {row.poNumber} · קבלה {row.receiptId.slice(0, 8)}
                </p>
                <p className="text-xs text-slate-500">
                  {row.supplierName} · {row.projectName} · {row.receiptDate}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {row.deliveryNoteStoragePath ? (
                  <ViewProofButton path={row.deliveryNoteStoragePath} />
                ) : (
                  <span className="text-xs text-slate-500">אין צילום תעודה</span>
                )}
                <Button
                  type="button"
                  disabled={busyId === row.receiptId}
                  onClick={() => void onApprove(row.receiptId)}
                  className={cn(
                    "h-11 rounded-xl px-6 font-semibold text-white shadow-lg transition-all",
                    row.quantitiesFullyAligned
                      ? "bg-gradient-to-l from-emerald-600 to-emerald-500 shadow-emerald-500/40 ring-2 ring-emerald-400/60"
                      : "bg-slate-700 hover:bg-slate-600"
                  )}
                >
                  {busyId === row.receiptId ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                  <span className="ms-2">אשר לתשלום</span>
                </Button>
              </div>
            </div>

            <div className="grid gap-0 lg:grid-cols-2">
              <div className="border-e border-white/10 p-5">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  הזמנה (מה הוזמן)
                </h3>
                <div className="space-y-2">
                  {row.orderedLines.map((ln) => (
                    <div
                      key={ln.lineId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 bg-black/25 px-3 py-2 text-sm"
                    >
                      <span className="text-slate-300">{ln.partLabel}</span>
                      <span className="font-mono tabular-nums text-slate-100">
                        {ln.orderedQty} × {ils.format(ln.unitPrice)} ={" "}
                        {ils.format(ln.lineTotal)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-5">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  קבלה (מה הגיע)
                </h3>
                <div className="space-y-2">
                  {row.orderedLines.map((ln) => {
                    const got =
                      row.receiptQtyByPurchaseOrderLineId[ln.lineId] ?? 0
                    const short = got + 1e-9 < ln.orderedQty
                    const over = got > ln.orderedQty + 1e-9
                    return (
                      <div
                        key={`r-${ln.lineId}`}
                        className={cn(
                          "flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm",
                          short || over
                            ? "border-amber-500/50 bg-amber-500/10 text-amber-100"
                            : "border-emerald-500/30 bg-emerald-500/5 text-emerald-50"
                        )}
                      >
                        <span className="text-slate-300">{ln.partLabel}</span>
                        <span className="font-mono tabular-nums">
                          התקבל: {got}{" "}
                          {short ? (
                            <span className="text-amber-200">(חסר מול הזמנה)</span>
                          ) : null}
                        </span>
                      </div>
                    )
                  })}
                </div>
                {row.verificationNotes ? (
                  <p className="mt-4 text-xs text-amber-200/90">
                    {row.verificationNotes}
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function ViewProofButton({ path }: { path: string }) {
  const [open, setOpen] = React.useState(false)
  const [url, setUrl] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!open) {
      setUrl(null)
      return
    }
    let cancelled = false
    void (async () => {
      setLoading(true)
      const res = await getDeliveryNoteSignedUrlAction(path)
      if (cancelled) return
      setLoading(false)
      if (!res.ok) {
        toast.error(res.error)
        setOpen(false)
        return
      }
      setUrl(res.url)
    })()
    return () => {
      cancelled = true
    }
  }, [open, path])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-white/15 bg-white/5 text-slate-100 hover:bg-white/10"
        onClick={() => setOpen(true)}
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Camera className="size-4" />
        )}
        <span className="ms-2">הוכחה</span>
      </Button>
      <DialogContent className="max-w-4xl border-white/10 bg-[#0c1220] text-slate-100">
        <DialogHeader>
          <DialogTitle>תעודת משלוח</DialogTitle>
        </DialogHeader>
        {url ? (
          <div className="flex max-h-[70vh] justify-center overflow-auto rounded-xl bg-black p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="תעודת משלוח"
              className="max-h-[65vh] w-auto object-contain"
            />
          </div>
        ) : (
          <p className="text-sm text-slate-500">טוען תצוגה…</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
