/**
 * Projects importer (`erp_proj_projects`).
 *
 * Source: Priority's PROJECTS form. Conflict key: `(company_id, project_number)`.
 * Status enum: DRAFT | ACTIVE | CLOSED | … (DB enforces via type).
 */
import type { ImporterSpec, RowError } from "../types"

const UPSERT_CHUNK = 200

export type ProjectImportPayload = {
  project_number: string
  name: string
  status: string
  start_date: string | null
  end_date: string | null
}

const VALID_STATUSES = new Set(["DRAFT", "ACTIVE", "CLOSED", "ARCHIVED"])

function transformStatus(raw: string): string {
  const t = raw.trim().toUpperCase()
  if (!t) return "ACTIVE"
  if (VALID_STATUSES.has(t)) return t
  // Hebrew aliases
  if (t.includes("פעיל") || t === "OPEN") return "ACTIVE"
  if (t.includes("סגור") || t === "DONE") return "CLOSED"
  if (t.includes("טיוטה") || t === "DRAFT") return "DRAFT"
  if (t.includes("בארכיון") || t === "ARCHIVED") return "ARCHIVED"
  throw new Error(`סטטוס פרויקט לא חוקי: "${raw}". מותר: DRAFT/ACTIVE/CLOSED/ARCHIVED.`)
}

function transformDate(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  // Accept YYYY-MM-DD, DD/MM/YYYY, DD.MM.YYYY
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (isoMatch) return t
  const dmyMatch = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/.exec(t)
  if (dmyMatch) {
    const [, d, m, yRaw] = dmyMatch
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
  }
  throw new Error(
    `פורמט תאריך לא נתמך: "${raw}". השתמשו ב-YYYY-MM-DD או DD/MM/YYYY.`,
  )
}

export const PROJECTS_IMPORTER: ImporterSpec<ProjectImportPayload> = {
  kind: "projects",
  title: "פרויקטים",
  description: "ייבוא פרויקטים פעילים. Conflict key: project_number.",
  templateFileName: "projects-template.csv",
  columns: [
    {
      field: "project_number",
      label: "מספר פרויקט",
      aliases: ["מספר פרויקט", "Project Number", "project_number", "PROJ"],
      required: true,
    },
    {
      field: "name",
      label: "שם פרויקט",
      aliases: ["שם פרויקט", "שם", "Project Name", "name", "PROJDES"],
      required: true,
    },
    {
      field: "status",
      label: "סטטוס",
      aliases: ["סטטוס", "Status", "status", "STATUS"],
      required: false,
      transform: transformStatus,
    },
    {
      field: "start_date",
      label: "תאריך התחלה",
      aliases: ["תאריך התחלה", "Start Date", "start_date", "STARTDATE"],
      required: false,
      transform: transformDate,
    },
    {
      field: "end_date",
      label: "תאריך סיום",
      aliases: ["תאריך סיום", "End Date", "end_date", "DUEDATE"],
      required: false,
      transform: transformDate,
    },
  ],
  upsert: async (client, companyId, payloads) => {
    const failed: RowError[] = []
    let inserted = 0
    let updated = 0

    const numbers = payloads.map((p) => p.project_number)
    const { data: existing } = await client
      .from("erp_proj_projects")
      .select("project_number")
      .eq("company_id", companyId)
      .in("project_number", numbers)
    const existingSet = new Set(
      (existing ?? []).map((r: { project_number: string }) => r.project_number),
    )

    for (let i = 0; i < payloads.length; i += UPSERT_CHUNK) {
      const chunk = payloads.slice(i, i + UPSERT_CHUNK)
      const rows = chunk.map((p) => ({
        company_id: companyId,
        project_number: p.project_number,
        name: p.name,
        status: p.status ?? "ACTIVE",
        start_date: p.start_date,
        end_date: p.end_date,
      }))
      const { error } = await client
        .from("erp_proj_projects")
        .upsert(rows, { onConflict: "company_id,project_number" })
      if (error) {
        failed.push({
          rowNumber: i + 2,
          field: null,
          message: `שגיאת DB ב-chunk שמתחיל בשורה ${i + 2}: ${error.message}`,
          rawValue: null,
        })
        continue
      }
      for (const p of chunk) {
        if (existingSet.has(p.project_number)) updated += 1
        else inserted += 1
      }
    }
    return { inserted, updated, failed }
  },
}
