"use client"

import Link from "next/link"
import { ArrowRight, ClipboardList, GitCompare, PackageSearch, Warehouse } from "lucide-react"

import { ProcurementCommandSubnav } from "@/components/marker-ofek/procurement/procurement-command-subnav"
import { ProcurementPageHeader } from "@/components/marker-ofek/procurement/procurement-page-header"
import { ProcurementIcon } from "@/components/marker-ofek/procurement/procurement-icon"
import { buttonVariants } from "@/components/ui/button-variants"
import { cn } from "@/lib/utils"

const tiles: {
  title: string
  description: string
  href: string
  icon: typeof Warehouse
  action: string
}[] = [
  {
    title: "הוצאות מחסן",
    description: "תנועות יציאה ושיוך לפרויקטים.",
    href: "/marker-ofek/procurement/warehouse-outgoing",
    icon: Warehouse,
    action: "פתיחה",
  },
  {
    title: "מלאי מול ביצוע",
    description: "התאמה בין מלאי לביצוע בשטח.",
    href: "/marker-ofek/procurement/reconciliation/inventory-progress",
    icon: ClipboardList,
    action: "פתיחה",
  },
  {
    title: "בקרת התאמות",
    description: "התאמות רכש, חשבוניות וקבלות.",
    href: "/marker-ofek/procurement/reconciliation",
    icon: GitCompare,
    action: "פתיחה",
  },
  {
    title: "גיליון פריטים",
    description: "מלאי ופריטים ברמת המערכת.",
    href: "/marker-ofek/items",
    icon: PackageSearch,
    action: "פתיחה",
  },
]

export function InventoryHub() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8 bg-white pb-10">
      <Link
        href="/marker-ofek"
        className="inline-flex w-fit items-center gap-2 text-sm text-slate-500 transition-colors hover:text-indigo-700"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה ללוח הבקרה
      </Link>

      <ProcurementCommandSubnav />

      <ProcurementPageHeader
        icon={Warehouse}
        kicker="מרקר אופק — רכש"
        title="ניהול מלאי"
        subtitle="מלאי נוכחי, תנועות והתאמות — גישה מהירה למסכי העבודה."
        primaryAction={
          <Link
            href="/marker-ofek/procurement/warehouse-outgoing"
            className={cn(
              buttonVariants({ size: "lg" }),
              "inline-flex gap-2 bg-indigo-600 text-white hover:bg-indigo-500"
            )}
          >
            <Warehouse className="size-4 stroke-[1.5]" aria-hidden />
            תנועת מלאי
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {tiles.map((t) => (
          <div
            key={t.href}
            className="flex flex-col rounded-xl border border-slate-100 bg-white p-6"
          >
            <div className="mb-4 flex items-start gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg border border-slate-100 bg-white">
                <ProcurementIcon icon={t.icon} className="size-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[#1e293b]">{t.title}</h2>
                <p className="mt-1 text-sm text-slate-500">{t.description}</p>
              </div>
            </div>
            <Link
              href={t.href}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "mt-auto w-fit border-slate-100 text-indigo-600 hover:bg-white"
              )}
            >
              {t.action}
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
