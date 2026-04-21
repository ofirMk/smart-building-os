"use client"

import * as React from "react"
import { CheckCircle2, Package, Wrench } from "lucide-react"

import type { CompanyAsset } from "@/lib/marker-ofek/procurement/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const CATEGORY_LABEL: Record<CompanyAsset["category"], string> = {
  vehicle: "רכב",
  heavy_machinery: "מכונה כבדה",
  power_tools: "כלי עבודה חשמליים",
  it_equipment: "ציוד IT",
}

const STATUS_LABEL: Record<CompanyAsset["status"], string> = {
  active: "פעיל",
  maintenance: "בתחזוקה",
  retired: "יצא משימוש",
}

export type AssetCardProps = {
  asset: CompanyAsset
  className?: string
  /** When set, shows an Accept control for workflow (e.g. acknowledge receipt / service). */
  onAccept?: (asset: CompanyAsset) => void | Promise<void>
  acceptLabel?: string
  disabled?: boolean
}

export function AssetCard({
  asset,
  className,
  onAccept,
  acceptLabel = "אשר קבלה",
  disabled = false,
}: AssetCardProps) {
  const [pending, setPending] = React.useState(false)

  async function handleAccept() {
    if (!onAccept || pending) return
    setPending(true)
    try {
      await onAccept(asset)
    } finally {
      setPending(false)
    }
  }

  return (
    <Card className={cn("border border-slate-100 bg-card shadow-none", className)} size="sm">
      <CardHeader className="flex flex-row items-start gap-3 border-b border-slate-100 pb-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-card text-indigo-600">
          <Package className="size-5 stroke-[1.5]" aria-hidden />
        </div>
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-base font-semibold text-[#1e293b]">
            {asset.assetName}
          </CardTitle>
          <p className="font-mono text-xs text-slate-500">סריאלי: {asset.serialNumber}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-4 pt-0 text-sm text-slate-600">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="text-slate-500">קטגוריה:</span>
          <span>{CATEGORY_LABEL[asset.category]}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="text-slate-500">סטטוס:</span>
          <span className="font-medium text-[#1e293b]">{STATUS_LABEL[asset.status]}</span>
        </div>
        {(asset.lastServiceDate || asset.nextServiceDate) && (
          <div className="flex items-start gap-2 pt-1 text-xs text-slate-500">
            <Wrench className="mt-0.5 size-3.5 shrink-0 stroke-[1.5] text-indigo-600" aria-hidden />
            <div className="space-y-0.5">
              {asset.lastServiceDate ? <p>טיפול אחרון: {asset.lastServiceDate}</p> : null}
              {asset.nextServiceDate ? <p>טיפול הבא: {asset.nextServiceDate}</p> : null}
            </div>
          </div>
        )}
      </CardContent>
      {onAccept ? (
        <CardFooter className="border-t border-slate-100 px-4 pt-3 pb-4">
          <Button
            type="button"
            className="w-full gap-2"
            disabled={disabled || pending}
            onClick={() => void handleAccept()}
          >
            <CheckCircle2 className="size-4" aria-hidden />
            {pending ? "שומר…" : acceptLabel}
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  )
}
