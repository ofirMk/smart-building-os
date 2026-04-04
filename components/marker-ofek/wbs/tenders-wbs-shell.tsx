"use client"

import Link from "next/link"
import * as React from "react"
import { ArrowRight, Layers } from "lucide-react"

import { CatalogVsSheetHint } from "@/components/marker-ofek/catalog-vs-sheet-hint"
import { TendersSubnav } from "@/components/marker-ofek/tenders/tenders-subnav"
import { ProcurementPageHeader } from "@/components/marker-ofek/procurement/procurement-page-header"
import { TendersWbsClient } from "@/components/marker-ofek/tenders/tenders-wbs-client"
import { WbsStructureEditorClient } from "@/components/marker-ofek/wbs/wbs-structure-editor-client"
import { cn } from "@/lib/utils"

type ProjectOpt = { id: string; name: string; internal_project_code: string }

type Mode = "editor" | "boq"

export function TendersWbsShell({
  mode,
  tenderProjectId,
  projects,
}: {
  mode: Mode
  tenderProjectId: string | null
  projects: ProjectOpt[]
}) {
  const base = "/marker-ofek/tenders/wbs"

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 bg-white px-2 pb-10 md:px-4">
      <Link
        href="/marker-ofek"
        className="inline-flex w-fit items-center gap-2 text-sm text-slate-500 transition-colors hover:text-indigo-700"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה ללוח הבקרה
      </Link>

      <TendersSubnav />

      <ProcurementPageHeader
        icon={Layers}
        kicker="ביצוע"
        title="מבנה WBS"
        titleAddon={<CatalogVsSheetHint variant="wbsCoding" />}
        subtitle="עורך עץ עבודה, תבניות, והחלה לגאנט — לצד קידוד שורות כתב כמויות במכרז."
      />

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-100 bg-slate-50/50 p-1">
        <Link
          href={base}
          className={cn(
            "rounded-lg px-4 py-2 text-xs font-semibold transition-colors",
            mode === "editor"
              ? "bg-white text-indigo-700 shadow-sm"
              : "text-slate-500 hover:text-[#0f172a]"
          )}
        >
          עורך מבנה (Master)
        </Link>
        <Link
          href={`${base}?mode=boq`}
          className={cn(
            "rounded-lg px-4 py-2 text-xs font-semibold transition-colors",
            mode === "boq"
              ? "bg-white text-indigo-700 shadow-sm"
              : "text-slate-500 hover:text-[#0f172a]"
          )}
        >
          קידוד BoQ (מכרז)
        </Link>
      </div>

      {mode === "editor" ? (
        <WbsStructureEditorClient projects={projects} />
      ) : (
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="mb-4 text-xs text-slate-500">
            לקידוד שורות ה־BoQ נדרש מזהה מכרז בכתובת:{" "}
            <span className="font-currency-mono text-indigo-700 tabular-nums">?projectId=…</span>{" "}
            (מרכז המכרזים).
          </p>
          <TendersWbsClient projectId={tenderProjectId} />
        </div>
      )}
    </div>
  )
}
