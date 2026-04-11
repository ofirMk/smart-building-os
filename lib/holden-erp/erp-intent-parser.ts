import { openai } from "@ai-sdk/openai"
import { generateObject } from "ai"
import { z } from "zod"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

import {
  holdenApplyDefaultRetainageAndRecalculate,
  holdenApproveSubcontractorPartialAccount,
  holdenGeneratePartialAccountFromActiveContract,
  holdenMarkPartialAccountPaid,
  holdenMarkPartialAccountSent,
  holdenSubmitPartialAccountForApproval,
} from "@/lib/holden-erp/partial-account-bpm-actions"

/**
 * סכימה תואמת strict structured output (OpenAI): כל מפתח חייב להופיע ב־`required`
 * ואסור להשתמש ב־`.optional()` או ב־`.default()` על שדות — אלה גורמים להשמטה מ־required.
 * ערכי "חסר" — `null` דרך `.nullable()`.
 */
const erpIntentSchema = z
  .object({
    intent: z.enum([
      "APPROVE_PARTIAL_ACCOUNT",
      "SUBMIT_PARTIAL_ACCOUNT",
      "MARK_SENT",
      "MARK_PAID",
      "GENERATE_PARTIAL_ACCOUNT",
      "APPLY_RETAINAGE_5",
      "QUERY_PROJECT_STATUS",
      "OPEN_PURCHASE_ORDER_SUPPLIER",
      "OPEN_COMMAND_CENTER",
      "WORKSPACE_ACTION",
      "UNKNOWN",
    ]),
    partialAccountNumber: z.number().nullable(),
    subcontractorName: z.string().nullable(),
    contractId: z.string().nullable(),
    /** מק״ט חוזה — ליצירת חשבון חלקי כשאין UUID */
    contractMakat: z.string().nullable(),
    /** שאילתת שם פרויקט (למשל בשביס זינגר) */
    projectNameQuery: z.string().nullable(),
    /** שם ספק לרכש (למשל ארכה) */
    supplierNameQuery: z.string().nullable(),
    /** פעולת UI בסביבת העבודה — רק כש־intent הוא WORKSPACE_ACTION */
    workspaceActionType: z
      .enum(["close_all_tabs", "close_current_tab", "clear_screen"])
      .nullable(),
  })
  .strict()

export type HoldenErpIntent = z.infer<typeof erpIntentSchema>

const SYSTEM = `You are the Holden Group ERP intent parser. The user writes in Hebrew or English.
Extract structured intent for partial accounts (חשבונות חלקיים) and subcontractor billing.

Always return all keys: intent, partialAccountNumber, subcontractorName, contractId, contractMakat, projectNameQuery, supplierNameQuery, workspaceActionType.
Use JSON null for unknown values (never omit keys).

Rules:
- partialAccountNumber: number from phrases like "#5", "מספר 5", "חשבון 5"
- subcontractorName: Hebrew/English name fragment if mentioned (e.g. "Lightman Electricity", "לייטמן")
- contractId: only if a UUID appears explicitly in the text; otherwise null
- contractMakat: organizational contract code / מק״ט if mentioned; otherwise null
- APPROVE_PARTIAL_ACCOUNT: approve a partial account / subcontractor bill (אשר חשבון חלקי)
- SUBMIT_PARTIAL_ACCOUNT: submit for approval (שלח לאישור)
- MARK_SENT: mark as sent (נשלח / סימון שליחה)
- MARK_PAID: mark paid (שולם / תשלום)
- GENERATE_PARTIAL_ACCOUNT: create new partial account from active contract (צור חשבון חלקי / הפק חשבון)
- APPLY_RETAINAGE_5: apply 5% retainage / עיכבון 5%
- QUERY_PROJECT_STATUS: ask project status / "מה סטטוס פרויקט X"
- OPEN_PURCHASE_ORDER_SUPPLIER: open new PO for a supplier / "תפתח הזמנת רכש ל..."
- OPEN_COMMAND_CENTER: navigate to ERP command center / מרכז פיקוח
- WORKSPACE_ACTION: UI/workspace control only (no DB). Set workspaceActionType:
  - close_all_tabs: "סגור את כל הטאבים/חלונות", "close all tabs"
  - close_current_tab: סגירת הטאב הפעיל / current tab
  - clear_screen: ניקוי מפוצל/מסך — split / clear clutter
  For non-workspace utterances workspaceActionType must be null.
- UNKNOWN: if unclear`

export async function parseHoldenErpUtterance(text: string): Promise<
  { ok: true; intent: HoldenErpIntent } | { ok: false; error: string }
> {
  const trimmed = text.trim()
  if (!trimmed) {
    return { ok: false, error: "טקסט ריק" }
  }

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: erpIntentSchema,
      system: SYSTEM,
      prompt: `User message:\n"""${trimmed}"""`,
    })
    return { ok: true, intent: object }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

async function resolvePartialAccountId(params: {
  partialAccountNumber: number | null
  subcontractorName: string | null
  contractId: string | null
}): Promise<string | null> {
  const supabase = await createSupabaseServerAuthClient()

  let q = supabase
    .from("partial_accounts")
    .select(
      `
      id,
      account_number,
      contract_id,
      contracts!inner (
        id,
        entity_id,
        entities ( name )
      )
    `
    )
    .eq("is_deleted", false)

  if (params.contractId?.trim()) {
    q = q.eq("contract_id", params.contractId.trim())
  }

  if (params.partialAccountNumber != null && Number.isFinite(params.partialAccountNumber)) {
    q = q.eq("account_number", Math.trunc(params.partialAccountNumber))
  }

  const { data, error } = await q.limit(25)
  if (error || !data?.length) return null

  const nameNeedle = params.subcontractorName?.trim().toLowerCase()
  const rows = data as Array<{
    id: string
    contracts?: {
      entities?: { name?: string | null } | { name?: string | null }[] | null
    } | null
  }>

  const embedName = (row: (typeof rows)[0]): string => {
    const ent = row.contracts?.entities
    const one = Array.isArray(ent) ? ent[0] : ent
    return String(one?.name ?? "").toLowerCase()
  }

  if (nameNeedle && nameNeedle.length >= 2) {
    const hit = rows.find((r) => embedName(r).includes(nameNeedle))
    return hit?.id ?? null
  }

  if (params.partialAccountNumber != null && rows.length === 1) {
    return rows[0].id
  }

  return rows[0]?.id ?? null
}

export type ExecuteHoldenErpIntentDetail = {
  partialAccountId?: string
  journalEntryId?: string
  path?: string
  url?: string
  workspaceActionType?: "close_all_tabs" | "close_current_tab" | "clear_screen" | null
}

export type ExecuteHoldenErpIntentResult =
  | { ok: true; message: string; detail?: ExecuteHoldenErpIntentDetail }
  | { ok: false; error: string }

/**
 * מריץ את כוונת ה-AI מול BPM והפעולות הקיימות (דורש משתמש מחובר).
 */
export async function executeHoldenErpIntent(
  intent: HoldenErpIntent
): Promise<ExecuteHoldenErpIntentResult> {
  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.id) {
    return { ok: false, error: "נדרשת התחברות" }
  }

  switch (intent.intent) {
    case "UNKNOWN":
      return { ok: false, error: "לא זוהתה כוונה ברורה" }
    case "WORKSPACE_ACTION": {
      const w = intent.workspaceActionType
      if (!w) {
        return { ok: false, error: "לא זוהתה פעולת סביבת עבודה" }
      }
      const messages = {
        close_all_tabs: "סוגר את כל החלונות",
        close_current_tab: "סוגר את הטאב הנוכחי",
        clear_screen: "מנקה את המסך",
      } as const
      return {
        ok: true,
        message: messages[w],
        detail: { workspaceActionType: w },
      }
    }
    case "GENERATE_PARTIAL_ACCOUNT": {
      let cid = intent.contractId?.trim() ?? ""
      if (!cid && intent.contractMakat?.trim()) {
        const { data: byMakat } = await supabase
          .from("contracts")
          .select("id")
          .eq("is_deleted", false)
          .eq("status", "active")
          .eq("makat", intent.contractMakat.trim())
          .limit(1)
          .maybeSingle()
        cid = (byMakat as { id?: string } | null)?.id ?? ""
      }
      if (!cid) {
        return {
          ok: false,
          error: "נדרש מזהה חוזה (UUID) או מק״ט חוזה פעיל ליצירת חשבון חלקי",
        }
      }
      const r = await holdenGeneratePartialAccountFromActiveContract(cid)
      if (!r.ok) return { ok: false, error: r.error }
      return {
        ok: true,
        message: `נוצר חשבון חלקי מס׳ ${r.accountNumber}`,
        detail: {
          partialAccountId: r.partialAccountId,
          path: `/marker-ofek/holden-erp/partial-accounts/${r.partialAccountId}`,
        },
      }
    }
    case "APPLY_RETAINAGE_5": {
      const pid = await resolvePartialAccountId({
        partialAccountNumber: intent.partialAccountNumber,
        subcontractorName: intent.subcontractorName,
        contractId: intent.contractId,
      })
      if (!pid) {
        return { ok: false, error: "לא נמצא חשבון חלקי תואם" }
      }
      const { data: pa } = await supabase
        .from("partial_accounts")
        .select("contract_id")
        .eq("id", pid)
        .maybeSingle()
      const contractId = (pa as { contract_id?: string } | null)?.contract_id
      if (!contractId) return { ok: false, error: "חסר חוזה לחשבון" }
      const r = await holdenApplyDefaultRetainageAndRecalculate(pid, contractId)
      if (!r.ok) return { ok: false, error: r.error }
      return {
        ok: true,
        message: "עודכן עיכבון 5% וחושב מחדש החשבון",
        detail: {
          partialAccountId: pid,
          path: `/marker-ofek/holden-erp/partial-accounts/${pid}`,
        },
      }
    }
    case "QUERY_PROJECT_STATUS": {
      const q = intent.projectNameQuery?.trim()
      if (!q || q.length < 2) {
        return {
          ok: true,
          message: "מעבר למרכז הפיקוח",
          detail: { path: "/marker-ofek/command-center" },
        }
      }
      const { data: proj } = await supabase
        .from("projects")
        .select("id, name, status")
        .eq("is_deleted", false)
        .ilike("name", `%${q}%`)
        .limit(1)
        .maybeSingle()
      const p = proj as { id: string; name?: string; status?: string } | null
      if (p?.id) {
        return {
          ok: true,
          message: `נמצא פרויקט: ${p.name ?? ""} (${p.status ?? ""})`,
          detail: { path: `/marker-ofek/projects/${p.id}` },
        }
      }
      return {
        ok: true,
        message: "לא נמצא פרויקט — מוצג מרכז הפיקוח",
        detail: { path: "/marker-ofek/command-center" },
      }
    }
    case "OPEN_PURCHASE_ORDER_SUPPLIER": {
      const sn = intent.supplierNameQuery?.trim()
      let path = "/marker-ofek/procurement/purchase-orders/new"
      if (sn && sn.length >= 2) {
        const { data: ent } = await supabase
          .from("entities")
          .select("id")
          .eq("type", "supplier")
          .eq("is_deleted", false)
          .ilike("name", `%${sn}%`)
          .limit(1)
          .maybeSingle()
        const id = (ent as { id?: string } | null)?.id
        if (id) {
          path = `${path}?supplierEntityId=${encodeURIComponent(id)}`
        }
      }
      return {
        ok: true,
        message: "פתיחת הזמנת רכש",
        detail: { path },
      }
    }
    case "OPEN_COMMAND_CENTER":
      return {
        ok: true,
        message: "מרכז הפיקוח Holden",
        detail: { path: "/marker-ofek/command-center" },
      }
    case "APPROVE_PARTIAL_ACCOUNT":
    case "SUBMIT_PARTIAL_ACCOUNT":
    case "MARK_SENT":
    case "MARK_PAID": {
      const pid = await resolvePartialAccountId({
        partialAccountNumber: intent.partialAccountNumber,
        subcontractorName: intent.subcontractorName,
        contractId: intent.contractId,
      })
      if (!pid) {
        return { ok: false, error: "לא נמצא חשבון חלקי תואם (מספר / שם קבלן)" }
      }
      const paPath = `/marker-ofek/holden-erp/partial-accounts/${pid}`
      if (intent.intent === "APPROVE_PARTIAL_ACCOUNT") {
        const r = await holdenApproveSubcontractorPartialAccount(pid)
        if (!r.ok) return { ok: false, error: r.error }
        return {
          ok: true,
          message: "החשבון אושר ונרשם יומן (כאשר הכרטסת מוגדרת)",
          detail: { partialAccountId: pid, path: paPath },
        }
      }
      if (intent.intent === "SUBMIT_PARTIAL_ACCOUNT") {
        const r = await holdenSubmitPartialAccountForApproval(pid)
        if (!r.ok) return { ok: false, error: r.error }
        return {
          ok: true,
          message: "נשלח לאישור",
          detail: { partialAccountId: pid, path: paPath },
        }
      }
      if (intent.intent === "MARK_SENT") {
        const r = await holdenMarkPartialAccountSent(pid)
        if (!r.ok) return { ok: false, error: r.error }
        return {
          ok: true,
          message: "סומן כנשלח",
          detail: { partialAccountId: pid, path: paPath },
        }
      }
      const r = await holdenMarkPartialAccountPaid(pid)
      if (!r.ok) return { ok: false, error: r.error }
      return {
        ok: true,
        message: "סומן כשולם",
        detail: { partialAccountId: pid, path: paPath },
      }
    }
    default:
      return { ok: false, error: "כוונה לא נתמכת" }
  }
}

export async function parseAndExecuteHoldenErpUtterance(
  text: string
): Promise<
  | { ok: true; intent: HoldenErpIntent; result: ExecuteHoldenErpIntentResult }
  | { ok: false; error: string }
> {
  const parsed = await parseHoldenErpUtterance(text)
  if (!parsed.ok) return parsed
  const result = await executeHoldenErpIntent(parsed.intent)
  return { ok: true, intent: parsed.intent, result }
}
