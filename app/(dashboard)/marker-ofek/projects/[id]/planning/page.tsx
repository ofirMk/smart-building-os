/**
 * Project Planning Workspace — Sprint A.4 (Pivot to Priority ERP module).
 *
 * Server component:
 *  • Loads project header, all editions (planning_versions), all BOQ lines for
 *    the selected edition, all resource BOM rows for those lines, all control
 *    subjects/resources/chapters/subchapters in the company.
 *  • Edition is selected via `?edition=<id>` (defaults to base / latest).
 *  • Renders KPIs (rolled-up planned cost) + the WBS hierarchical grid.
 *  • Per row → drawer ("עץ מוצר לפעילות") for resource BOM editing.
 *
 * Reverse-engineered from the MedaTech 2016 spec, §5.
 */
import Link from "next/link"
import { cookies } from "next/headers"
import { ArrowRightCircle, Layers, Lock, PencilLine } from "lucide-react"

import { ProjectPlanningWorkspace } from "@/components/marker-ofek/projects/planning/project-planning-workspace"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export const dynamic = "force-dynamic"

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

const dateFmt = new Intl.DateTimeFormat("he-IL", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

type EditionRow = {
  id: string
  version_number: number
  description: string
  status: string
  is_base_version: boolean
  is_execution_version: boolean
  is_tender_edition: boolean
  edition_date: string | null
}

type BoqRow = {
  id: string
  segment_1_structure: string | null
  segment_2_chapter: string | null
  segment_3_subchapter: string | null
  segment_4_item: string | null
  section: string
  item_number: string
  description: string
  uom: string
  quantity: number
  unit_price: number
  total_price: number
  control_subchapter_id: string | null
  notes: string | null
}

type BomRow = {
  id: string
  boq_line_id: string
  resource_id: string
  conversion_ratio: number
  unit_cost: number
  per_unit_cost: number
  notes: string | null
}

type SubjectRow = { id: string; code: string; description: string }
type ResourceRow = {
  id: string
  subject_id: string
  code: string
  description: string
  uom: string
  default_unit_cost: number | null
}
type ChapterRow = { id: string; code: string; description: string }
type SubchapterRow = {
  id: string
  chapter_id: string
  code: string
  description: string
}

function editionTone(e: EditionRow) {
  if (e.is_base_version)
    return { label: "מהדורת אפס", cls: "bg-indigo-100 text-indigo-900", Icon: Lock }
  if (e.is_execution_version)
    return {
      label: "מהדורת ביצוע",
      cls: "bg-emerald-100 text-emerald-900",
      Icon: PencilLine,
    }
  if (e.is_tender_edition)
    return { label: "מהדורת מכרז", cls: "bg-amber-100 text-amber-900", Icon: Layers }
  return { label: `מהדורה #${e.version_number}`, cls: "bg-slate-100 text-slate-800", Icon: Layers }
}

export default async function ProjectPlanningPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ edition?: string }>
}) {
  const { id: projectId } = await params
  const { edition: editionParam } = await searchParams

  const cookieStore = await cookies()
  const companyId = resolveCompanyContext(
    cookieStore.get(COMPANY_COOKIE_KEY)?.value,
  )
  if (!companyId) {
    return (
      <div dir="rtl" className="p-6 text-sm text-slate-700">
        לא נמצא הקשר חברה פעיל.
      </div>
    )
  }

  const supabase = await createSupabaseServerAuthClient()

  const { data: project } = await supabase
    .from("erp_proj_projects")
    .select("id, name, project_number, status")
    .eq("id", projectId)
    .eq("company_id", companyId)
    .maybeSingle<{
      id: string
      name: string
      project_number: string
      status: string
    }>()

  if (!project) {
    return (
      <div dir="rtl" className="p-6 text-sm text-slate-700">
        פרויקט לא נמצא או לא נגיש.
      </div>
    )
  }

  const { data: editions } = await supabase
    .from("erp_proj_planning_versions")
    .select(
      "id, version_number, description, status, is_base_version, is_execution_version, is_tender_edition, edition_date",
    )
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .order("version_number", { ascending: true })

  const allEditions = (editions ?? []) as EditionRow[]
  const activeEdition =
    allEditions.find((e) => e.id === editionParam) ??
    allEditions.find((e) => e.is_execution_version) ??
    allEditions.find((e) => e.is_base_version) ??
    allEditions[0]

  if (!activeEdition) {
    return (
      <div dir="rtl" className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
        <Header projectName={project.name} projectNumber={project.project_number} />
        <Card className="p-8 text-center text-sm text-slate-600">
          טרם הוגדרו מהדורות תכנון לפרויקט זה.
        </Card>
      </div>
    )
  }

  const [boqRes, subjectsRes, resourcesRes, chaptersRes, subchaptersRes] =
    await Promise.all([
      supabase
        .from("erp_proj_boq_lines")
        .select(
          "id, segment_1_structure, segment_2_chapter, segment_3_subchapter, segment_4_item, section, item_number, description, uom, quantity, unit_price, total_price, control_subchapter_id, notes",
        )
        .eq("company_id", companyId)
        .eq("version_id", activeEdition.id)
        .order("section", { ascending: true })
        .order("item_number", { ascending: true }),
      supabase
        .from("erp_proj_control_subjects")
        .select("id, code, description")
        .eq("company_id", companyId)
        .order("sort_order", { ascending: true })
        .order("code", { ascending: true }),
      supabase
        .from("erp_proj_control_resources")
        .select("id, subject_id, code, description, uom, default_unit_cost")
        .eq("company_id", companyId)
        .order("code", { ascending: true }),
      supabase
        .from("erp_proj_control_chapters")
        .select("id, code, description")
        .eq("company_id", companyId)
        .order("sort_order", { ascending: true })
        .order("code", { ascending: true }),
      supabase
        .from("erp_proj_control_subchapters")
        .select("id, chapter_id, code, description")
        .eq("company_id", companyId)
        .order("code", { ascending: true }),
    ])

  const boqLines = (boqRes.data ?? []) as BoqRow[]
  const boqLineIds = boqLines.map((b) => b.id)

  const { data: bomData } = boqLineIds.length
    ? await supabase
        .from("erp_proj_boq_resources")
        .select(
          "id, boq_line_id, resource_id, conversion_ratio, unit_cost, per_unit_cost, notes",
        )
        .eq("company_id", companyId)
        .in("boq_line_id", boqLineIds)
    : { data: [] as BomRow[] }

  const bomRows = (bomData ?? []) as BomRow[]
  const subjects = (subjectsRes.data ?? []) as SubjectRow[]
  const resources = (resourcesRes.data ?? []) as ResourceRow[]
  const chapters = (chaptersRes.data ?? []) as ChapterRow[]
  const subchapters = (subchaptersRes.data ?? []) as SubchapterRow[]

  // KPIs
  const totalContractedValue = boqLines.reduce(
    (s, l) => s + Number(l.total_price ?? 0),
    0,
  )
  // Planned cost = Σ(boq.qty × Σ(bom.per_unit_cost))
  const bomByLine = new Map<string, BomRow[]>()
  for (const r of bomRows) {
    const arr = bomByLine.get(r.boq_line_id) ?? []
    arr.push(r)
    bomByLine.set(r.boq_line_id, arr)
  }
  const totalPlannedCost = boqLines.reduce((s, line) => {
    const lineBoms = bomByLine.get(line.id) ?? []
    const perUnit = lineBoms.reduce((a, b) => a + Number(b.per_unit_cost), 0)
    return s + perUnit * Number(line.quantity)
  }, 0)
  const plannedMargin = totalContractedValue - totalPlannedCost
  const marginPct =
    totalContractedValue > 0 ? plannedMargin / totalContractedValue : 0
  const linesCovered = boqLines.filter((l) => bomByLine.has(l.id)).length
  const coveragePct =
    boqLines.length > 0 ? linesCovered / boqLines.length : 0

  const tone = editionTone(activeEdition)

  return (
    <div dir="rtl" className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
      <Link
        href={`/marker-ofek/projects/${projectId}`}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:underline"
      >
        <ArrowRightCircle className="size-3.5" aria-hidden />
        חזרה ל-Project Hub
      </Link>

      <Header
        projectName={project.name}
        projectNumber={project.project_number}
      />

      {/* Edition selector */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-700">מהדורה:</span>
        {allEditions.map((e) => {
          const t = editionTone(e)
          const Icon = t.Icon
          const isActive = e.id === activeEdition.id
          return (
            <Link
              key={e.id}
              href={`/marker-ofek/projects/${projectId}/planning?edition=${e.id}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                isActive
                  ? `${t.cls} border-current shadow-sm`
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
              data-active={isActive}
            >
              <Icon className="size-3" aria-hidden />
              {t.label}
              {e.edition_date ? (
                <span className="ms-1 font-mono text-[10px] opacity-70">
                  {dateFmt.format(new Date(e.edition_date))}
                </span>
              ) : null}
            </Link>
          )
        })}
      </div>

      {/* Active edition banner */}
      <Card className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-indigo-500 p-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            מהדורה פעילה
          </p>
          <h2 className="text-base font-bold tracking-tight">
            #{activeEdition.version_number} · {activeEdition.description}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={tone.cls}>{tone.label}</Badge>
          <Badge
            className={
              activeEdition.status === "APPROVED"
                ? "bg-emerald-100 text-emerald-900"
                : "bg-slate-100 text-slate-800"
            }
          >
            {activeEdition.status === "APPROVED" ? "מאושרת" : "טיוטה"}
          </Badge>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          label="ערך חוזי לפי BOQ"
          value={ILS.format(totalContractedValue)}
          hint={`${boqLines.length} סעיפים`}
        />
        <Kpi
          label="עלות מתוכננת (עץ מוצר)"
          value={ILS.format(totalPlannedCost)}
          hint={`${linesCovered}/${boqLines.length} סעיפים מתומחרים`}
        />
        <Kpi
          label="רווח גולמי מתוכנן"
          value={ILS.format(plannedMargin)}
          hint={`${(marginPct * 100).toFixed(1)}% מערך החוזה`}
          tone={plannedMargin >= 0 ? "good" : "bad"}
        />
        <Kpi
          label="כיסוי תמחור"
          value={`${(coveragePct * 100).toFixed(0)}%`}
          hint="סעיפים עם עץ מוצר מוגדר"
        />
      </div>

      <ProjectPlanningWorkspace
        projectId={projectId}
        editionId={activeEdition.id}
        editionLocked={
          activeEdition.is_base_version || activeEdition.status === "APPROVED"
        }
        boqLines={boqLines.map((l) => ({
          id: l.id,
          segments: {
            structure: l.segment_1_structure ?? l.section.split(".")[0] ?? "",
            chapter: l.segment_2_chapter ?? l.section.split(".")[1] ?? "",
            subchapter: l.segment_3_subchapter ?? l.section.split(".")[2] ?? "",
            item: l.segment_4_item ?? l.item_number,
          },
          description: l.description,
          uom: l.uom,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unit_price),
          totalPrice: Number(l.total_price),
          controlSubchapterId: l.control_subchapter_id,
          notes: l.notes,
        }))}
        bomRows={bomRows.map((r) => ({
          id: r.id,
          boqLineId: r.boq_line_id,
          resourceId: r.resource_id,
          conversionRatio: Number(r.conversion_ratio),
          unitCost: Number(r.unit_cost),
          perUnitCost: Number(r.per_unit_cost),
          notes: r.notes,
        }))}
        subjects={subjects}
        resources={resources}
        chapters={chapters}
        subchapters={subchapters}
      />
    </div>
  )
}

function Header({
  projectName,
  projectNumber,
}: {
  projectName: string
  projectNumber: string
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700">
          <Layers className="size-5" aria-hidden />
        </span>
        <div>
          <p className="text-[10px] font-mono text-slate-500">
            {projectNumber}
          </p>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            {projectName} — תכנון פרויקט ובקרת תקציב (WBS)
          </h1>
          <p className="text-xs text-muted-foreground">
            כתב כמויות היררכי, מהדורות תכנון, ועץ מוצר לפעילות (תמחור משאבים) —
            לפי אפיון Priority / MedaTech §5.
          </p>
        </div>
      </div>
    </header>
  )
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: "good" | "bad"
}) {
  return (
    <Card className="p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p
        className={`mt-0.5 font-mono text-lg font-bold tabular-nums ${
          tone === "good"
            ? "text-emerald-700"
            : tone === "bad"
              ? "text-rose-700"
              : ""
        }`}
      >
        {value}
      </p>
      {hint ? <p className="text-[10px] text-slate-500">{hint}</p> : null}
    </Card>
  )
}
