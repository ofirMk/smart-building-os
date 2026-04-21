import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRight } from "lucide-react"

import {
  ProjectDailyLogApprovalList,
  type DailyLogApprovalRow,
} from "@/components/marker-ofek/projects/project-daily-log-approval-list"
import { ProjectDailyLogMobileForm } from "@/components/marker-ofek/projects/project-daily-log-mobile-form"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export default async function ProjectDailyLogPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string }
}) {
  const resolved = await Promise.resolve(params)
  const id = typeof resolved.id === "string" ? resolved.id : ""
  if (!id) notFound()

  const supabase = await createSupabaseServerAuthClient()
  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", id)
    .eq("is_deleted", false)
    .maybeSingle()

  if (!project) notFound()

  let approvalLogs: DailyLogApprovalRow[] = []
  const logExtended = await supabase
    .from("project_daily_logs")
    .select("id, log_date, field_approval_status, field_approved_at")
    .eq("project_id", id)
    .order("log_date", { ascending: false })
    .limit(40)

  let rawRows: Array<Record<string, unknown>> | null = null
  if (!logExtended.error && logExtended.data) {
    rawRows = logExtended.data as Array<Record<string, unknown>>
  } else if (
    logExtended.error &&
    /field_approved_at|column/i.test(String(logExtended.error.message ?? ""))
  ) {
    const legacy = await supabase
      .from("project_daily_logs")
      .select("id, log_date, field_approval_status")
      .eq("project_id", id)
      .order("log_date", { ascending: false })
      .limit(40)
    if (!legacy.error && legacy.data) {
      rawRows = legacy.data as Array<Record<string, unknown>>
    }
  }

  if (rawRows) {
    approvalLogs = rawRows.map((r) => ({
      id: String(r.id),
      log_date: String(r.log_date),
      field_approval_status:
        r.field_approval_status === "approved" ? "approved" : "draft",
      field_approved_at:
        r.field_approved_at != null ? String(r.field_approved_at) : null,
    }))
  }

  return (
    <div className="min-h-0 flex-1 space-y-4 bg-card pb-12 pt-2">
      <Link
        href={`/marker-ofek/projects/${id}`}
        className="inline-flex w-fit items-center gap-2 text-sm text-slate-500 hover:text-indigo-700"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה לפרויקט
      </Link>
      <p className="text-center font-medium text-[#1e293b]">
        {(project as { name?: string }).name}
      </p>
      <ProjectDailyLogMobileForm projectId={id} />
      <ProjectDailyLogApprovalList initialLogs={approvalLogs} />
    </div>
  )
}
