"use server"

/**
 * Sprint T13 — WBS Cost Control & Budget vs Actual Matrix (server action).
 *
 * Loads a project's BOQ tree (chapters → sub-items) with budget figures from
 * `erp_proj_boq_lines` and approximates "actual cost" per section by
 * distributing the project's APPROVED subcontractor bill totals
 * proportionally to each section's budget weight (a pragmatic stand-in until
 * bill-line ↔ BOQ-line linkage is universally present in production).
 *
 * Falls back to a beautifully crafted MOCK hierarchy whenever:
 *   - The project doesn't exist, OR
 *   - There's no execution/base planning version, OR
 *   - The version has no BOQ lines yet, OR
 *   - Any underlying query errors out.
 *
 * The result always carries `isMock: boolean` so the UI is honest with the
 * operator. This mirrors the T12 auto-seeder pattern.
 */

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CostControlItem {
  id: string
  itemNumber: string
  description: string
  uom: string
  quantity: number
  unitPrice: number
  budget: number
  actual: number
}

export interface CostControlSection {
  code: string
  name: string
  items: CostControlItem[]
  budget: number
  actual: number
}

export interface CostControlReport {
  projectId: string
  projectName: string
  projectNumber: string
  totalBudget: number
  totalActual: number
  sections: CostControlSection[]
  isMock: boolean
}

export type CostControlResult =
  | { ok: true; report: CostControlReport }
  | { ok: false; error: string }

// ---------------------------------------------------------------------------
// Mock builder — hierarchical demo data with intentional over-budget rows so
// the UI's amber/rose highlighting shines for investor walkthroughs.
// ---------------------------------------------------------------------------

function buildMockReport(
  projectId: string,
  projectName?: string,
  projectNumber?: string,
): CostControlReport {
  // Each item: [item_number, description, uom, qty, unit_price (= budget per
  // unit), actual_ratio]. actual_ratio applied as (qty * unit_price * ratio).
  // Ratios are tuned so chapter 01 stays under (visual GREEN), chapter 02
  // crosses 90% (AMBER hit), chapter 03 blows the budget on at least one row
  // (visual RED).
  const sectionsSpec: Array<{
    code: string
    name: string
    items: Array<[string, string, string, number, number, number]>
  }> = [
    {
      code: "01",
      name: "עבודות שלד",
      items: [
        ["01.10", "עבודות עפר וחפירה", 'מ"ק', 4200, 95, 0.78],
        ["01.20", "יציקות בטון מזוין — יסודות", 'מ"ק', 850, 1450, 0.62],
        ["01.30", "ברזל זיון מעוצב — קומות 1-8", "טון", 320, 4800, 0.84],
        ["01.40", "תבניות מתועשות", 'מ"ר', 5400, 95, 0.71],
      ],
    },
    {
      code: "02",
      name: "מעטפת ואיטום",
      items: [
        ["02.10", "בנייה — בלוקי איטונג", 'מ"ר', 6800, 110, 0.93],
        ["02.20", "טיח חוץ אקרילי", 'מ"ר', 5200, 145, 0.97],
        ["02.30", "איטום גגות פולימרי", 'מ"ר', 1100, 280, 0.86],
        ["02.40", "בידוד תרמי חיצוני", 'מ"ר', 5200, 95, 0.91],
      ],
    },
    {
      code: "03",
      name: "גמרים פנימיים",
      items: [
        ["03.10", "ריצוף גרניט פורצלן", 'מ"ר', 4800, 220, 1.18],
        ["03.20", "צבע אקרילי + טייח גבס", 'מ"ר', 12500, 48, 0.74],
        ["03.30", "מטבחים — אספקה והרכבה", "יח׳", 96, 28500, 1.06],
        ["03.40", "דלתות פנים מעוצבות", "יח׳", 480, 1850, 0.88],
      ],
    },
    {
      code: "04",
      name: "מערכות אלקטרו-מכניות",
      items: [
        ["04.10", "חשמל ותקשורת — קומות מגורים", "דירה", 96, 18500, 0.79],
        ["04.20", "אינסטלציה סניטרית", "דירה", 96, 14200, 0.83],
        ["04.30", "מיזוג אוויר — VRF", "דירה", 96, 22800, 0.71],
        ["04.40", "מעליות (3 פירים)", "פיר", 3, 485000, 0.65],
      ],
    },
  ]

  const sections: CostControlSection[] = sectionsSpec.map((sec) => {
    const items: CostControlItem[] = sec.items.map(
      ([num, desc, uom, qty, price, ratio]) => {
        const budget = qty * price
        const actual = Math.round(budget * ratio)
        return {
          id: `mock-${sec.code}-${num}`,
          itemNumber: num,
          description: desc,
          uom,
          quantity: qty,
          unitPrice: price,
          budget: Math.round(budget),
          actual,
        }
      },
    )
    const budget = items.reduce((acc, i) => acc + i.budget, 0)
    const actual = items.reduce((acc, i) => acc + i.actual, 0)
    return { code: sec.code, name: sec.name, items, budget, actual }
  })

  const totalBudget = sections.reduce((acc, s) => acc + s.budget, 0)
  const totalActual = sections.reduce((acc, s) => acc + s.actual, 0)

  return {
    projectId,
    projectName: projectName ?? "פרויקט להדגמה — מגדל היוקרה הצפוני",
    projectNumber: projectNumber ?? "PRJ-DEMO-7700",
    totalBudget,
    totalActual,
    sections,
    isMock: true,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function describeError(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === "string" && err.length > 0) return err
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message
    if (typeof m === "string" && m.length > 0) return m
  }
  return fallback
}

// ---------------------------------------------------------------------------
// Main aggregation
// ---------------------------------------------------------------------------

export async function fetchProjectCostControlAction(
  projectId: string,
): Promise<CostControlResult> {
  // Guard: invalid uuid → mock immediately. We treat ANY exception as a
  // signal to fall back to mock data (never blow up the page).
  if (!projectId || projectId.length < 8) {
    return { ok: true, report: buildMockReport(projectId || "unknown") }
  }

  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data: userData, error: userErr } = await supabase.auth.getUser()
    if (userErr || !userData.user) {
      // Unauthed → still return mock so the page renders the demo flow.
      return { ok: true, report: buildMockReport(projectId) }
    }

    // 1. Project header.
    const { data: projectRow, error: projectErr } = await supabase
      .from("erp_proj_projects")
      .select("id, name, project_number, company_id")
      .eq("id", projectId)
      .maybeSingle()

    if (projectErr || !projectRow) {
      return { ok: true, report: buildMockReport(projectId) }
    }

    const projectName = String((projectRow as { name?: string }).name ?? "")
    const projectNumber = String(
      (projectRow as { project_number?: string }).project_number ?? "",
    )

    // 2. Pick the relevant planning version: prefer the execution version,
    //    else the base version, else the most-recent approved.
    const { data: versions, error: versionsErr } = await supabase
      .from("erp_proj_planning_versions")
      .select("id, version_number, status, is_base_version, is_execution_version")
      .eq("project_id", projectId)
      .order("version_number", { ascending: false })

    if (versionsErr || !versions || versions.length === 0) {
      return {
        ok: true,
        report: buildMockReport(projectId, projectName, projectNumber),
      }
    }

    type VersionRow = {
      id: string
      version_number: number
      status: string
      is_base_version: boolean
      is_execution_version: boolean
    }
    const versionRows = versions as VersionRow[]
    const chosenVersion =
      versionRows.find((v) => v.is_execution_version) ??
      versionRows.find((v) => v.is_base_version) ??
      versionRows.find((v) => v.status === "APPROVED") ??
      versionRows[0]

    if (!chosenVersion) {
      return {
        ok: true,
        report: buildMockReport(projectId, projectName, projectNumber),
      }
    }

    // 3. BOQ lines for that version.
    const { data: boqRows, error: boqErr } = await supabase
      .from("erp_proj_boq_lines")
      .select("id, section, item_number, description, uom, quantity, unit_price, total_price")
      .eq("version_id", chosenVersion.id)
      .order("section", { ascending: true })
      .order("item_number", { ascending: true })

    if (boqErr || !boqRows || boqRows.length === 0) {
      return {
        ok: true,
        report: buildMockReport(projectId, projectName, projectNumber),
      }
    }

    // 4. Total actual cost approximation: sum APPROVED + PAID subcontractor
    //    bills for the project. We distribute proportionally to each section
    //    by budget weight (pragmatic — until full line-level traceability
    //    arrives).
    let totalActualForProject = 0
    try {
      const { data: subBillRows } = await supabase
        .from("erp_subcontractor_bills")
        .select("grand_total_amount, amount_to_pay, cumulative_net_amount, status")
        .eq("project_id", projectId)

      for (const sb of subBillRows ?? []) {
        const status = String((sb as { status?: string }).status ?? "")
        if (status !== "APPROVED" && status !== "PAID") continue
        const amount =
          Number((sb as { grand_total_amount?: number }).grand_total_amount ?? 0) ||
          Number((sb as { amount_to_pay?: number }).amount_to_pay ?? 0) ||
          Number((sb as { cumulative_net_amount?: number }).cumulative_net_amount ?? 0)
        if (amount > 0) totalActualForProject += amount
      }
    } catch {
      // Non-fatal — leave actual at 0 for sections.
    }

    // 5. Materialise sections.
    type BoqRow = {
      id: string
      section: string
      item_number: string
      description: string
      uom: string
      quantity: number
      unit_price: number
      total_price: number
    }
    const sectionsMap = new Map<string, CostControlSection>()
    for (const raw of boqRows as BoqRow[]) {
      const code = String(raw.section ?? "00").trim() || "00"
      let sec = sectionsMap.get(code)
      if (!sec) {
        sec = { code, name: code, items: [], budget: 0, actual: 0 }
        sectionsMap.set(code, sec)
      }
      const rawTotal = raw.total_price
      const budget =
        rawTotal != null
          ? Number(rawTotal)
          : Number(raw.quantity ?? 0) * Number(raw.unit_price ?? 0)
      sec.items.push({
        id: String(raw.id),
        itemNumber: String(raw.item_number ?? ""),
        description: String(raw.description ?? ""),
        uom: String(raw.uom ?? ""),
        quantity: Number(raw.quantity ?? 0),
        unitPrice: Number(raw.unit_price ?? 0),
        budget: Math.round(budget),
        actual: 0, // populated below proportionally
      })
      sec.budget += budget
    }

    const totalBudget = Array.from(sectionsMap.values()).reduce(
      (acc, s) => acc + s.budget,
      0,
    )

    // Distribute the actual cost proportionally by budget weight (only if we
    // have any actuals to spread).
    if (totalActualForProject > 0 && totalBudget > 0) {
      for (const sec of sectionsMap.values()) {
        const sectionRatio = sec.budget / totalBudget
        const sectionActual = totalActualForProject * sectionRatio
        sec.actual = Math.round(sectionActual)
        for (const item of sec.items) {
          const itemRatio = sec.budget > 0 ? item.budget / sec.budget : 0
          item.actual = Math.round(sectionActual * itemRatio)
        }
      }
    }

    const sections = Array.from(sectionsMap.values()).sort((a, b) =>
      a.code.localeCompare(b.code, "he-IL"),
    )

    // If we ended up with empty sections (edge case), fall back to mock.
    if (sections.length === 0) {
      return {
        ok: true,
        report: buildMockReport(projectId, projectName, projectNumber),
      }
    }

    const totalActual = sections.reduce((acc, s) => acc + s.actual, 0)

    return {
      ok: true,
      report: {
        projectId,
        projectName: projectName || `פרויקט ${projectNumber}`,
        projectNumber,
        totalBudget: Math.round(totalBudget),
        totalActual: Math.round(totalActual),
        sections: sections.map((s) => ({
          ...s,
          budget: Math.round(s.budget),
          actual: Math.round(s.actual),
        })),
        isMock: false,
      },
    }
  } catch (err) {
    // Never throw to the page — log the message in dev, render mock.
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[T13] fetchProjectCostControlAction failed → falling back to mock:",
        describeError(err, "unknown"),
      )
    }
    return { ok: true, report: buildMockReport(projectId) }
  }
}
