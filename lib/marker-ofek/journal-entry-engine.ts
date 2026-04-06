"use server"

import { createJournalEntryInputSchema } from "@/lib/marker-ofek/finance-schemas"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatError } from "@/lib/utils"

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * יצירת פקודת יומן מאוזנת (כפל קלט כפול).
 * לשימוש מתהליכי שרת (קבלות, ידני) — חשבוניות מטופלות בטריגר DB.
 */
export async function createJournalEntry(
  raw: unknown
): Promise<{ ok: true; journalEntryId: string } | { ok: false; error: string }> {
  const parsed = createJournalEntryInputSchema.safeParse(raw)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join(" · ")
    return { ok: false, error: msg || "נתונים לא תקינים" }
  }
  const p = parsed.data

  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

    const { data: accounts, error: coaErr } = await supabase
      .from("mo_chart_of_accounts")
      .select("id, code")
      .eq("is_active", true)
    if (coaErr) return { ok: false, error: coaErr.message }

    const byCode = new Map(
      (accounts ?? []).map((a) => [String((a as { code: string }).code), a as { id: string; code: string }])
    )

    const linePayload: {
      account_id: string
      debit: number
      credit: number
      memo: string | null
    }[] = []

    for (const line of p.lines) {
      const acc = byCode.get(line.accountCode)
      if (!acc) {
        return { ok: false, error: `חשבון לא נמצא: ${line.accountCode}` }
      }
      linePayload.push({
        account_id: acc.id,
        debit: roundMoney(line.debit),
        credit: roundMoney(line.credit),
        memo: line.memo?.trim() || null,
      })
    }

    const { data: je, error: jeErr } = await supabase
      .from("mo_journal_entries")
      .insert({
        entry_date: p.entryDate,
        reference: p.reference.trim(),
        description: p.description?.trim() || null,
        source_type: p.sourceType ?? null,
        source_id: p.sourceId ?? null,
        project_id: p.projectId ?? null,
        created_by: user.id,
      })
      .select("id")
      .single()

    if (jeErr || !je?.id) {
      return { ok: false, error: jeErr?.message ?? "יצירת יומן נכשלה" }
    }

    const jeId = je.id as string

    const { error: jlErr } = await supabase.from("mo_journal_lines").insert(
      linePayload.map((row) => ({
        journal_entry_id: jeId,
        account_id: row.account_id,
        debit: row.debit,
        credit: row.credit,
        memo: row.memo,
      }))
    )

    if (jlErr) {
      await supabase.from("mo_journal_entries").delete().eq("id", jeId)
      return { ok: false, error: jlErr.message }
    }

    return { ok: true, journalEntryId: jeId }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
