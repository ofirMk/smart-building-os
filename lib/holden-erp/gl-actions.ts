"use server"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import type {
  HoldenGlJournalLineInput,
  PostJournalEntryOptions,
} from "@/types/holden-finance"
import { formatError } from "@/lib/utils"

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function sumDebit(lines: HoldenGlJournalLineInput[]): number {
  return roundMoney(
    lines.reduce((s, l) => s + Math.max(0, roundMoney(Number(l.debitAmount) || 0)), 0)
  )
}

function sumCredit(lines: HoldenGlJournalLineInput[]): number {
  return roundMoney(
    lines.reduce((s, l) => s + Math.max(0, roundMoney(Number(l.creditAmount) || 0)), 0)
  )
}

function validateLineSides(lines: HoldenGlJournalLineInput[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    const d = roundMoney(Number(lines[i].debitAmount) || 0)
    const c = roundMoney(Number(lines[i].creditAmount) || 0)
    const hasDebit = d > 0
    const hasCredit = c > 0
    if (hasDebit && hasCredit) {
      return `שורה ${i + 1}: לא ניתן לרשום חובה וזכות באותה שורה`
    }
    if (!hasDebit && !hasCredit) {
      return `שורה ${i + 1}: חובה או זכות חייבים להיות גדולים מאפס`
    }
  }
  return null
}

/**
 * רישום פקודת יומן כפולה — נקרא ממנוע ה-BPM לאחר אישור מסמך.
 * איזון: סכום חובה = סכום זכות (באפליקציה; ה-DB אינו מאלץ איזון על כותרת).
 */
export async function postJournalEntry(
  documentId: string,
  referenceDocumentType: string,
  lines: HoldenGlJournalLineInput[],
  options?: PostJournalEntryOptions
): Promise<
  { ok: true; journalEntryId: string } | { ok: false; error: string }
> {
  const docId = documentId?.trim()
  const refType = referenceDocumentType?.trim()
  if (!docId) return { ok: false, error: "חסר מזהה מסמך" }
  if (!refType) return { ok: false, error: "חסר סוג מסמך" }
  if (!lines.length) return { ok: false, error: "אין שורות יומן" }

  const sideErr = validateLineSides(lines)
  if (sideErr) return { ok: false, error: sideErr }

  const totalDebit = sumDebit(lines)
  const totalCredit = sumCredit(lines)
  if (totalDebit !== totalCredit) {
    return {
      ok: false,
      error: `פקודת היומן לא מאוזנת: חובה ${totalDebit} לעומת זכות ${totalCredit}`,
    }
  }

  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) {
      return { ok: false, error: "נדרשת התחברות" }
    }

    const entryDate =
      options?.entryDate?.trim() ||
      new Date().toISOString().slice(0, 10)

    const { data: header, error: hErr } = await supabase
      .from("gl_journal_entries")
      .insert({
        entry_date: entryDate,
        reference_document_type: refType,
        reference_document_id: docId,
        description: options?.description ?? null,
        project_id: options?.projectId ?? null,
        created_by: user.id,
      })
      .select("id")
      .single()

    if (hErr) throw hErr
    const journalEntryId = (header as { id: string }).id

    const rowPayload = lines.map((l, idx) => ({
      journal_entry_id: journalEntryId,
      account_id: l.accountId.trim(),
      debit_amount: roundMoney(Math.max(0, Number(l.debitAmount) || 0)),
      credit_amount: roundMoney(Math.max(0, Number(l.creditAmount) || 0)),
      line_memo: l.lineMemo?.trim() || null,
      sort_order: idx,
    }))

    const { error: lErr } = await supabase
      .from("gl_journal_lines")
      .insert(rowPayload)

    if (lErr) {
      await supabase.from("gl_journal_entries").delete().eq("id", journalEntryId)
      throw lErr
    }

    return { ok: true, journalEntryId }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

const PARTIAL_ACCOUNT_GL_REF = "partial_account_finance_approved"

/** חשבון הכנסות פרויקט ברירת מחדל אם אין התאמה לפי קטגוריה */
const DEFAULT_PROJECT_INCOME_ACCOUNT_CODES = ["4100", "4000", "4200"] as const

/**
 * לאחר מעבר חשבון חלקי ל-`approved` (אישור כספי): רישום יומן חובה ללקוח / זכות להכנסות.
 * דורש `gl_accounts` פעילים ו-`entities.gl_account_code` ללקוח (מפרויקט) או קוד AR ברירת מחדל.
 */
export async function generateJournalEntryFromAccount(
  partialAccountId: string
): Promise<
  | { ok: true; journalEntryId: string; skipped?: boolean }
  | { ok: false; error: string }
> {
  const pid = partialAccountId?.trim()
  if (!pid) return { ok: false, error: "חסר מזהה חשבון חלקי" }

  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) {
      return { ok: false, error: "נדרשת התחברות" }
    }

    const { data: existingJe } = await supabase
      .from("gl_journal_entries")
      .select("id")
      .eq("reference_document_type", PARTIAL_ACCOUNT_GL_REF)
      .eq("reference_document_id", pid)
      .maybeSingle()

    if (existingJe?.id) {
      return { ok: true, journalEntryId: existingJe.id as string, skipped: true }
    }

    const { data: pa, error: paErr } = await supabase
      .from("partial_accounts")
      .select(
        "id, status, payment_due, period_work_indexed, project_id, contract_id, is_deleted"
      )
      .eq("id", pid)
      .maybeSingle()

    if (paErr) throw paErr
    const row = pa as {
      status: string
      payment_due?: number | null
      period_work_indexed?: number | null
      project_id?: string | null
      contract_id: string
      is_deleted?: boolean
    } | null
    if (!row || row.is_deleted) {
      return { ok: false, error: "חשבון חלקי לא נמצא" }
    }
    if (row.status !== "approved") {
      return { ok: false, error: "רישום יומן זמין רק לחשבון בסטטוס approved" }
    }

    const amount = roundMoney(
      Math.max(
        0,
        Number(row.period_work_indexed ?? 0) || Number(row.payment_due ?? 0) || 0
      )
    )
    if (amount <= 0) {
      return { ok: false, error: "סכום לרישום יומן אפס — אין מה לרשום" }
    }

    let projectId = row.project_id ?? null
    if (!projectId) {
      const { data: ctr } = await supabase
        .from("contracts")
        .select("project_id")
        .eq("id", row.contract_id)
        .maybeSingle()
      projectId = (ctr as { project_id?: string | null } | null)?.project_id ?? null
    }

    let clientEntityId: string | null = null
    if (projectId) {
      const { data: proj } = await supabase
        .from("projects")
        .select("client_entity_id")
        .eq("id", projectId)
        .maybeSingle()
      clientEntityId =
        (proj as { client_entity_id?: string | null } | null)?.client_entity_id ?? null
    }

    let arAccountCode: string | null = null
    if (clientEntityId) {
      const { data: ent } = await supabase
        .from("entities")
        .select("gl_account_code")
        .eq("id", clientEntityId)
        .maybeSingle()
      arAccountCode =
        (ent as { gl_account_code?: string | null } | null)?.gl_account_code?.trim() ||
        null
    }

    if (!arAccountCode) {
      arAccountCode = "1200"
    }

    const { data: arAcc, error: arErr } = await supabase
      .from("gl_accounts")
      .select("id")
      .eq("account_code", arAccountCode)
      .eq("is_active", true)
      .maybeSingle()

    if (arErr) throw arErr
    if (!arAcc?.id) {
      return {
        ok: false,
        error: `חשבון לקוחות (AR) לא נמצא בכרטסת — קוד ${arAccountCode}`,
      }
    }

    let incomeAccId: string | null = null
    for (const code of DEFAULT_PROJECT_INCOME_ACCOUNT_CODES) {
      const { data: inc } = await supabase
        .from("gl_accounts")
        .select("id")
        .eq("account_code", code)
        .eq("is_active", true)
        .maybeSingle()
      if (inc?.id) {
        incomeAccId = inc.id as string
        break
      }
    }

    if (!incomeAccId) {
      const { data: incRow } = await supabase
        .from("gl_accounts")
        .select("id")
        .eq("is_active", true)
        .ilike("financial_statement_category", "%הכנס%")
        .limit(1)
        .maybeSingle()
      incomeAccId = (incRow as { id?: string } | null)?.id ?? null
    }

    if (!incomeAccId) {
      return {
        ok: false,
        error: "לא נמצא חשבון הכנסות ב-gl_accounts (הגדר כרטסת)",
      }
    }

    const lines: HoldenGlJournalLineInput[] = [
      {
        accountId: arAcc.id as string,
        debitAmount: amount,
        creditAmount: 0,
        lineMemo: `חוב לקוח — חשבון חלקי`,
      },
      {
        accountId: incomeAccId,
        debitAmount: 0,
        creditAmount: amount,
        lineMemo: `הכנסות פרויקט — חשבון חלקי`,
      },
    ]

    return await postJournalEntry(pid, PARTIAL_ACCOUNT_GL_REF, lines, {
      description: `יומן אוטומטי מאישור חשבון חלקי ${pid.slice(0, 8)}…`,
      projectId: projectId ?? undefined,
    })
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
