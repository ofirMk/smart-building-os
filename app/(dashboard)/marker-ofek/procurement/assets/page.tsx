"use client"

import Link from "next/link"
import * as React from "react"
import { ArrowRight, Car, Plus } from "lucide-react"
import { toast } from "sonner"

import { AssetCard } from "@/components/marker-ofek/procurement/asset-card"
import { ProcurementCommandSubnav } from "@/components/marker-ofek/procurement/procurement-command-subnav"
import { ProcurementPageHeader } from "@/components/marker-ofek/procurement/procurement-page-header"
import { buttonVariants } from "@/components/ui/button-variants"
import type { CompanyAsset } from "@/lib/marker-ofek/procurement/types"
import { cn } from "@/lib/utils"

/** דמו עד לחיבור טבלת נכסים ב-Supabase */
const DEMO_ASSETS: CompanyAsset[] = [
  {
    id: "demo-1",
    assetName: "מזראטי ליוואנטה — ציוד שטח",
    serialNumber: "MZ-2018-4421",
    category: "vehicle",
    lastServiceDate: "2025-11-02",
    nextServiceDate: "2026-05-02",
    status: "active",
  },
  {
    id: "demo-2",
    assetName: "מקדחה חשמלית Hilti TE 30",
    serialNumber: "HL-TE30-88901",
    category: "power_tools",
    lastServiceDate: "2026-01-15",
    status: "maintenance",
  },
  {
    id: "demo-3",
    assetName: "מחפר זחל קטן — יארד",
    serialNumber: "CAT-303-772",
    category: "heavy_machinery",
    nextServiceDate: "2026-06-01",
    status: "active",
  },
  {
    id: "demo-4",
    assetName: "תחנת עבודה ניידת",
    serialNumber: "IT-LAP-9912",
    category: "it_equipment",
    status: "retired",
  },
]

export default function ProcurementAssetsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 bg-white pb-10">
      <Link
        href="/marker-ofek"
        className="inline-flex w-fit items-center gap-2 text-sm text-slate-500 transition-colors hover:text-indigo-700"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה ללוח מרקר אופק
      </Link>

      <ProcurementCommandSubnav />

      <ProcurementPageHeader
        icon={Car}
        kicker="מרקר אופק — רכש"
        title="נכסי חברה"
        subtitle="רכב, ציוד כבד וכלים — הדגמה עד לחיבור טבלת נכסים ב-Supabase."
        primaryAction={
          <button
            type="button"
            className={cn(
              buttonVariants({ size: "lg" }),
              "inline-flex gap-2 bg-indigo-600 text-white hover:bg-indigo-500"
            )}
            onClick={() => toast.message("רישום נכס — יתווסף עם חיבור מסד הנתונים")}
          >
            <Plus className="size-4 stroke-[1.5]" aria-hidden />
            + רישום נכס
          </button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {DEMO_ASSETS.map((asset) => (
          <AssetCard
            key={asset.id}
            asset={asset}
            onAccept={async () => {
              toast.success(`אושר עדכון לנכס: ${asset.assetName}`)
            }}
            acceptLabel="אשר קבלה / עדכון"
          />
        ))}
      </div>
    </div>
  )
}
