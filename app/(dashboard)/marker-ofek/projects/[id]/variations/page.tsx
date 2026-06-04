/**
 * T13 — Variations cockpit (server page).
 *
 * שולף את כל ה-contract_variation_orders של הפרויקט,
 * מרנדר את ה-ProjectInternalTabs (עם הטאב 'variations' החדש),
 * ומעביר את הנתונים ל-client cockpit.
 *
 * Layout Invariants:
 *   - אין overflow-y-auto גלובלי. שימוש ב-mx-auto + space-y בלבד.
 *   - dir="rtl" על המכולה החיצונית.
 *   - max-w-[1400px] תואם לאחים (cost-control).
 */

import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { ProjectInternalTabs } from "@/components/marker-ofek/projects/cost-control/budget-vs-actual-matrix"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

import {
  VariationsCockpitClient,
  type ContractOption,
  type VariationRow,
} from "./variations-cockpit-client"

export const dynamic = "force-dynamic"

type Params = Promise<{ id: string }>

export default async function VariationsPage({ params }: { params: Params }) {
  const { id: projectId } = await params
  const supabase = await createSupabaseServerAuthClient()

  // Project header info (אם הפרויקט לא קיים נציג בכל זאת את הטאב + מסך ריק).
  const { data: project } = await supabase
    .from("erp_proj_projects")
    .select("id, name, project_number")
    .eq("id", projectId)
    .maybeSingle<{ id: string; name: string; project_number: string }>()

  const { data: rows, error } = await supabase
    .from("contract_variation_orders")
    .select(
      "id, vo_number, title, description, status, pdf_url, ai_justification_text, booklet_generated_at, created_at, approved_amount, contract_id, linked_partial_account_id",
    )
    .eq("project_id", projectId)
    .order("vo_number", { ascending: false })
    .returns<VariationRow[]>()

  const variations: VariationRow[] = rows ?? []
  const loadErrorMessage = error?.message ?? null

  // T14 — חוזי הפרויקט עבור ה-Select בטופס "תמחר ואשר".
  // RLS מטפל ב-tenant isolation. is_deleted=false כדי לא להציג ארכיון.
  const { data: contractRows } = await supabase
    .from("contracts")
    .select("id, title, status")
    .eq("project_id", projectId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .returns<Array<{ id: string; title: string | null; status: string | null }>>()

  const contracts: ContractOption[] = (contractRows ?? []).map((c) => ({
    id: c.id,
    title: c.title?.trim() || `חוזה ${c.id.slice(0, 8)}`,
    status: c.status,
  }))

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30"
    >
      <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-6">
        <ProjectInternalTabs projectId={projectId} active="variations" />

        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
              <Link
                href={`/marker-ofek/projects/${projectId}`}
                className="inline-flex items-center gap-1 hover:text-indigo-700"
              >
                <ArrowRight className="size-3" aria-hidden />
                חזרה לסקירת פרויקט
              </Link>
              {project ? (
                <>
                  <span>·</span>
                  <span>
                    <span className="font-mono">{project.project_number}</span>{" "}
                    {project.name}
                  </span>
                </>
              ) : null}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              חריגים (Variations)
            </h1>
            <p className="text-sm text-slate-600">
              דווח חריג מהשטח, הפק חוברת PDF עם הצדקה משפטית-קבלנית
              שמנוסחת אוטומטית ע&quot;י Holden AI (RAG מול כספת החוזה).
            </p>
          </div>
        </header>

        {loadErrorMessage ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
            כשל בטעינת חריגים: {loadErrorMessage}
          </div>
        ) : null}

        <VariationsCockpitClient
          projectId={projectId}
          initialRows={variations}
          contracts={contracts}
        />
      </div>
    </div>
  )
}
