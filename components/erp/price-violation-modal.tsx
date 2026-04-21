"use client"

import * as React from "react"
import { AlertTriangle, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export type PriceViolationDirection = "ABOVE_CEILING" | "BELOW_COST"

export type PriceViolationContext = {
  entity: "PURCHASE_ORDER" | "CHANGE_ORDER" | "CLIENT_CONTRACT" | "CLIENT_CONTRACT_LINE"
  entityId: string
  lineId?: string | null
  projectId?: string | null
  enteredPrice: number
  effectivePrice: number
  effectiveSource?: string | null
  direction: PriceViolationDirection
  contractNumber?: string | null
}

type PriceViolationModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  context: PriceViolationContext | null
  onRequestManagerApproval: (context: PriceViolationContext) => void | Promise<void>
  onRevertToCeiling?: (context: PriceViolationContext) => void | Promise<void>
  onAuthorizeOverride?: (context: PriceViolationContext) => void | Promise<void>
  canAuthorize?: boolean
  working?: boolean
}

function formatCurrency(value: number): string {
  return Number(value || 0).toLocaleString("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function PriceViolationModal({
  open,
  onOpenChange,
  context,
  onRequestManagerApproval,
  onRevertToCeiling,
  onAuthorizeOverride,
  canAuthorize = false,
  working = false,
}: PriceViolationModalProps) {
  const ctx = context
  const isBelowCost = ctx?.direction === "BELOW_COST"
  const delta =
    ctx !== null
      ? isBelowCost
        ? ctx.effectivePrice - ctx.enteredPrice
        : ctx.enteredPrice - ctx.effectivePrice
      : 0
  const deltaPct =
    ctx && ctx.effectivePrice > 0 ? (Math.abs(delta) / ctx.effectivePrice) * 100 : 0

  const headlineEn = "Financial Guard"
  const subtitle = isBelowCost
    ? "חריגת רווחיות - מחיר מכירה נמוך מעלות מאושרת"
    : "חריגת מחיר - מחיר רכש גבוה מתקרת ספק"

  const helper = isBelowCost
    ? "מחיר המכירה שהוזן נמוך מעלות הספק המאושרת. אישור מנהל נדרש לשמירת השורה."
    : "המחיר שהוזן גבוה מתקרת הספק (מחירון/BPO). ניתן לבקש אישור מנהל או לחזור למחיר המחירון."

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-right">
            <AlertTriangle className="size-4 text-amber-600" />
            <span className="flex flex-col items-start">
              <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                {headlineEn}
              </span>
              <span>{subtitle}</span>
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm text-slate-700">
          <p className="text-xs text-slate-600">{helper}</p>
          {ctx ? (
            <div className="grid grid-cols-6 gap-2">
              <div className="col-span-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                <p className="text-[10px] uppercase tracking-wider text-amber-700">מחיר שהוזן</p>
                <p className="mt-1 font-mono text-base font-semibold text-amber-900">
                  {formatCurrency(ctx.enteredPrice)}
                </p>
              </div>
              <div className="col-span-3 rounded-xl border border-amber-200 bg-card p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                  {isBelowCost ? "עלות ספק מאושרת" : "תקרת מחיר מאושרת"}
                </p>
                <p className="mt-1 font-mono text-base font-semibold text-slate-800">
                  {formatCurrency(ctx.effectivePrice)}
                </p>
              </div>
              <div className="col-span-4 rounded-xl border border-rose-200 bg-rose-50 p-3">
                <p className="text-[10px] uppercase tracking-wider text-rose-700">סטייה</p>
                <p className="mt-1 font-mono text-base font-semibold text-rose-800">
                  {formatCurrency(delta)}{" "}
                  <span className="text-xs font-normal text-rose-600">
                    ({deltaPct.toFixed(2)}%)
                  </span>
                </p>
              </div>
              <div className="col-span-2 rounded-xl border border-slate-200 bg-background p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">מקור מחיר</p>
                <p className="mt-1 truncate font-mono text-xs font-semibold text-slate-700">
                  {ctx.effectiveSource ?? "EFFECTIVE"}
                </p>
              </div>
              {ctx.contractNumber ? (
                <div className="col-span-6 rounded-xl border border-slate-200 bg-card px-3 py-1.5 text-[11px] text-slate-600">
                  חוזה: <span className="font-mono text-slate-800">{ctx.contractNumber}</span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          {onRevertToCeiling ? (
            <Button
              type="button"
              variant="outline"
              disabled={working}
              onClick={() => ctx && void onRevertToCeiling(ctx)}
            >
              {isBelowCost ? "יישר לעלות ספק" : "חזור למחיר מחירון"}
            </Button>
          ) : null}
          {canAuthorize && onAuthorizeOverride ? (
            <Button
              type="button"
              variant="secondary"
              disabled={working}
              onClick={() => ctx && void onAuthorizeOverride(ctx)}
            >
              <ShieldCheck className="me-1 size-4" />
              אישור ידני (מנהל)
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={working}
            onClick={() => ctx && void onRequestManagerApproval(ctx)}
          >
            בקש אישור מנהל
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
