import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

/**
 * Answers cross-module questions like “מה שולי הרווח של ה-PO האחרון בפרויקט X?”
 * PO-level margin is not stored in DB — we return facts + a contract-share proxy.
 */
export async function markerOfekProcurementSnapshot(input: {
  project_name_query: string
}): Promise<{
  ok: true
  summary: string
  details: Record<string, unknown>
} | { ok: false; error: string }> {
  const q = String(input.project_name_query ?? "").trim()
  if (!q) {
    return { ok: false, error: "חסר שם פרויקט לחיפוש" }
  }

  const supabase = await createSupabaseServerAuthClient()

  const { data: matches, error: pErr } = await supabase
    .from("projects")
    .select("id, name, internal_project_code")
    .eq("is_deleted", false)
    .ilike("name", `%${q}%`)
    .order("name", { ascending: true })
    .limit(8)

  if (pErr) {
    return { ok: false, error: pErr.message }
  }

  const list = (matches ?? []) as Array<{
    id: string
    name: string
    internal_project_code: string | null
  }>

  if (list.length === 0) {
    return {
      ok: false,
      error: `לא נמצא פרויקט התואם ל־"${q}". נסו חלק משם או קוד פנימי.`,
    }
  }

  if (list.length > 1) {
    return {
      ok: true,
      summary:
        "נמצאו מספר פרויקטים — ציינו שם מדויק יותר או בחרו מהרשימה.",
      details: {
        ambiguous_projects: list.map((p) => ({
          id: p.id,
          name: p.name,
          code: p.internal_project_code,
        })),
      },
    }
  }

  const project = list[0]!

  const [{ data: po }, { data: contracts }] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select("id, po_number, total_amount, status, created_at, project_id")
      .eq("project_id", project.id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("contracts")
      .select("total_amount")
      .eq("project_id", project.id)
      .eq("is_deleted", false)
      .eq("contract_type", "main_contract")
      .eq("status", "active"),
  ])

  const poRow = po as {
    id: string
    po_number: string | null
    total_amount: number | null
    status: string | null
    created_at: string | null
  } | null

  let contractTotal = 0
  for (const c of contracts ?? []) {
    contractTotal += Number((c as { total_amount?: number }).total_amount ?? 0) || 0
  }

  const poAmount = poRow ? Number(poRow.total_amount ?? 0) || 0 : 0
  const shareOfMainContractPct =
    contractTotal > 0 && poAmount > 0
      ? Math.round((poAmount / contractTotal) * 1000) / 10
      : null

  const summary = poRow
    ? `הזמנת הרכש האחרונה בפרויקט "${project.name}": מספר ${poRow.po_number ?? "—"}, סכום ${poAmount.toLocaleString("he-IL")} ₪, סטטוס ${poRow.status ?? "—"}. שולי רווח להזמנה בודדת אינם שמורים במערכת; יחס לשווי חוזה לקוח פעיל (פרוקסי לחץ עלות): ${shareOfMainContractPct != null ? `${shareOfMainContractPct}%` : "לא ניתן לחשב (אין חוזה ראשי פעיל או סכום אפס)"}.`
    : `לא נמצאה הזמנת רכש בפרויקט "${project.name}".`

  return {
    ok: true,
    summary,
    details: {
      project_id: project.id,
      project_name: project.name,
      project_code: project.internal_project_code,
      last_po: poRow
        ? {
            id: poRow.id,
            po_number: poRow.po_number,
            total_amount: poAmount,
            status: poRow.status,
            created_at: poRow.created_at,
          }
        : null,
      active_main_contract_total_nis: contractTotal,
      last_po_to_contract_value_pct: shareOfMainContractPct,
      note:
        "Profit margin per PO is not a stored field; use contract vault + supplier quotes for true margin.",
    },
  }
}
