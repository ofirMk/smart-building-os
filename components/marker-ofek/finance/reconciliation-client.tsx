"use client"

import React, { useMemo, useState } from "react"
import { ArrowLeftRight, CheckCircle2, Sparkles } from "lucide-react"

import {
  loadReconciliationArenaData,
  performMatchAction,
} from "@/lib/holden-erp/reconciliation-actions"
import type {
  GlAccountRow,
  UnmatchedBankLine,
  UnmatchedJournalLine,
} from "@/types/holden-finance"
import { cn } from "@/lib/utils"

interface ReconciliationClientProps {
  accounts: GlAccountRow[]
}

function daysBetween(a: string, b: string) {
  const ta = new Date(a + "T12:00:00").getTime()
  const tb = new Date(b + "T12:00:00").getTime()
  return Math.abs(ta - tb) / 864e5
}

export function ReconciliationClient({ accounts }: ReconciliationClientProps) {
  const bankAccounts = useMemo(() => {
    const filtered = accounts.filter(
      (a) =>
        a.trial_balance_group?.includes("שוטף") ||
        a.account_name_he?.includes("בנק") ||
        a.account_name_he?.includes("קופה") ||
        a.account_code?.startsWith("11")
    )
    return filtered.length > 0 ? filtered : accounts
  }, [accounts])

  const [selectedBankId, setSelectedBankId] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isMatching, setIsMatching] = useState(false)
  const [matchMessage, setMatchMessage] = useState<{
    type: "success" | "error"
    text: string
  } | null>(null)
  const [autoMatchMessage, setAutoMatchMessage] = useState("")

  const [journalLines, setJournalLines] = useState<UnmatchedJournalLine[]>([])
  const [bankLines, setBankLines] = useState<UnmatchedBankLine[]>([])

  const [selectedJournalIds, setSelectedJournalIds] = useState<Set<string>>(
    () => new Set()
  )
  const [selectedBankIds, setSelectedBankIds] = useState<Set<string>>(
    () => new Set()
  )

  const handleBankSelection = async (accountId: string) => {
    setSelectedBankId(accountId)
    setAutoMatchMessage("")
    if (!accountId) {
      setJournalLines([])
      setBankLines([])
      return
    }

    setIsLoading(true)
    setSelectedJournalIds(new Set())
    setSelectedBankIds(new Set())

    try {
      const result = await loadReconciliationArenaData(accountId)
      setJournalLines(result.journal)
      setBankLines(result.bank)
    } catch (error) {
      console.error("Failed to load reconciliation data:", error)
      setJournalLines([])
      setBankLines([])
    } finally {
      setIsLoading(false)
    }
  }

  const toggleJournalSelection = (id: string) => {
    setSelectedJournalIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleBankSelection = (id: string) => {
    setSelectedBankIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const totals = useMemo(() => {
    const journalTotal = journalLines
      .filter((l) => selectedJournalIds.has(l.id))
      .reduce((sum, l) => sum + l.amount, 0)

    const bankTotal = bankLines
      .filter((l) => selectedBankIds.has(l.id))
      .reduce((sum, l) => sum + l.amount, 0)

    const liveDelta = journalTotal - bankTotal
    const delta = Math.abs(liveDelta)
    const epsilon = 0.01
    const isBalanced =
      delta < epsilon &&
      selectedJournalIds.size > 0 &&
      selectedBankIds.size > 0

    return { journalTotal, bankTotal, liveDelta, delta, isBalanced }
  }, [journalLines, bankLines, selectedJournalIds, selectedBankIds])

  const handleAutoMatch = () => {
    if (!selectedBankId) return
    setMatchMessage(null)
    const newSelectedJournal = new Set(selectedJournalIds)
    const newSelectedBank = new Set(selectedBankIds)
    let availableJournal = journalLines.filter(
      (l) => !newSelectedJournal.has(l.id)
    )
    let matchesFound = 0

    for (const bankLine of bankLines) {
      if (newSelectedBank.has(bankLine.id)) continue
      const matchIdx = availableJournal.findIndex((journalLine) => {
        if (
          Math.abs(journalLine.amount) !== Math.abs(bankLine.amount)
        ) {
          return false
        }
        const jRef = String(journalLine.reference_1 ?? "").trim()
        const bRef = String(bankLine.reference_number ?? "").trim()
        if (jRef && bRef && jRef === bRef) return true
        return (
          daysBetween(journalLine.entry_date, bankLine.transaction_date) <= 3
        )
      })
      if (matchIdx === -1) continue
      const journalLine = availableJournal[matchIdx]
      newSelectedBank.add(bankLine.id)
      newSelectedJournal.add(journalLine.id)
      availableJournal.splice(matchIdx, 1)
      matchesFound += 1
    }

    setSelectedJournalIds(newSelectedJournal)
    setSelectedBankIds(newSelectedBank)
    if (matchesFound > 0) {
      setAutoMatchMessage(`נמצאו ${matchesFound} התאמות (סכום + תאריך קרוב)`)
    } else {
      setAutoMatchMessage("לא נמצאו התאמות אוטומטיות — בחרו ידנית או בדקו סכומים")
    }
  }

  const handlePerformMatch = async () => {
    if (!totals.isBalanced || !selectedBankId) return
    setIsMatching(true)
    setMatchMessage(null)
    try {
      const result = await performMatchAction({
        bankAccountId: selectedBankId,
        journalLineIds: [...selectedJournalIds],
        bankEntryIds: [...selectedBankIds],
        type: "bank",
      })
      if (result.success) {
        setMatchMessage({
          type: "success",
          text: `התאמה #${result.reconciliationNumber} בוצעה בהצלחה`,
        })
        setSelectedJournalIds(new Set())
        setSelectedBankIds(new Set())
        await handleBankSelection(selectedBankId)
      } else {
        setMatchMessage({ type: "error", text: result.error })
      }
    } catch (error) {
      console.error("performMatch:", error)
      setMatchMessage({
        type: "error",
        text: "שגיאה בביצוע ההתאמה",
      })
    } finally {
      setIsMatching(false)
    }
  }

  const cardGlass =
    "rounded-3xl border border-white/30 bg-white/40 shadow-xl shadow-slate-900/5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/40 dark:shadow-black/40"

  const rowGlow = (on: boolean, side: "books" | "bank") =>
    cn(
      "cursor-pointer rounded-2xl border border-transparent px-3 py-2.5 transition-all duration-200 will-change-transform motion-safe:active:scale-[0.98]",
      on &&
        side === "books" &&
        "border-sky-400/35 bg-sky-500/10 shadow-[0_0_24px_-4px_rgba(56,189,248,0.35)] dark:bg-sky-500/15",
      on &&
        side === "bank" &&
        "border-violet-400/35 bg-violet-500/10 shadow-[0_0_24px_-4px_rgba(167,139,250,0.35)] dark:bg-violet-500/15",
      !on && "hover:bg-white/30 dark:hover:bg-white/5"
    )

  return (
    <div className="flex min-h-[calc(100vh-10rem)] flex-col gap-6" dir="rtl">
      <div
        className={cn(
          "flex shrink-0 flex-wrap items-end gap-4 p-5",
          cardGlass
        )}
      >
        <div className="min-w-[220px] flex-1 space-y-2">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            חשבון בנק בכרטסת (משטח התאמה)
          </label>
          <select
            value={selectedBankId}
            onChange={(e) => void handleBankSelection(e.target.value)}
            className="w-full rounded-2xl border-0 bg-white/60 px-4 py-3 text-sm text-slate-900 shadow-inner ring-1 ring-slate-200/50 focus:ring-2 focus:ring-blue-500/50 dark:bg-slate-900/60 dark:text-slate-100 dark:ring-white/10"
          >
            <option value="" disabled>
              בחרו חשבון…
            </option>
            {bankAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.account_code} — {a.account_name_he}
              </option>
            ))}
          </select>
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-sky-400">
            <div className="size-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent dark:border-sky-400" />
            טוען…
          </div>
        ) : null}
      </div>

      <div
        className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-5"
        dir="ltr"
      >
        <section className={cn("flex min-h-[420px] flex-1 flex-col overflow-hidden", cardGlass)}>
          <header className="flex shrink-0 items-center justify-between border-b border-white/30 px-5 py-4 dark:border-white/10">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-violet-500 shadow-[0_0_12px_rgba(139,92,246,0.7)]" />
              <h2 className="text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-100">
                Bank Side
              </h2>
            </div>
            <span className="rounded-full bg-violet-500/15 px-2.5 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-200">
              {bankLines.length} פתוחות
            </span>
          </header>
          <div className="flex-1 space-y-1.5 overflow-auto p-4">
            {bankLines.map((line) => {
              const isSelected = selectedBankIds.has(line.id)
              return (
                <div
                  key={line.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleBankSelection(line.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      toggleBankSelection(line.id)
                    }
                  }}
                  className={rowGlow(isSelected, "bank")}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="tabular-nums text-slate-500 dark:text-slate-400">
                      {new Date(line.transaction_date).toLocaleDateString(
                        "he-IL"
                      )}
                    </span>
                    <span
                      className={cn(
                        "font-mono text-sm font-semibold tabular-nums",
                        line.amount >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      )}
                    >
                      {Math.abs(line.amount).toLocaleString("he-IL", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">
                    {line.description || "—"}
                  </p>
                  {line.reference_number ? (
                    <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                      {line.reference_number}
                    </p>
                  ) : null}
                </div>
              )
            })}
            {bankLines.length === 0 && !isLoading ? (
              <p className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                {!selectedBankId
                  ? "בחרו חשבון בנק — או ייבאו שורות מקליטת דפי בנק"
                  : "אין שורות מיובאות — הוסיפו מקליטת דפי בנק"}
              </p>
            ) : null}
          </div>
        </section>

        <div className="hidden shrink-0 items-center justify-center lg:flex lg:w-12">
          <div className="rounded-full border border-white/40 bg-white/30 p-3 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-slate-900/50">
            <ArrowLeftRight className="size-6 text-slate-400 dark:text-slate-500" />
          </div>
        </div>

        <section className={cn("flex min-h-[420px] flex-1 flex-col overflow-hidden", cardGlass)}>
          <header className="flex shrink-0 items-center justify-between border-b border-white/30 px-5 py-4 dark:border-white/10">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-sky-500 shadow-[0_0_12px_rgba(14,165,233,0.7)]" />
              <h2 className="text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-100">
                Books Side
              </h2>
            </div>
            <span className="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-[11px] font-medium text-sky-800 dark:text-sky-200">
              {journalLines.length} פתוחות
            </span>
          </header>
          <div className="flex-1 space-y-1.5 overflow-auto p-4">
            {journalLines.map((line) => {
              const isSelected = selectedJournalIds.has(line.id)
              return (
                <div
                  key={line.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleJournalSelection(line.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      toggleJournalSelection(line.id)
                    }
                  }}
                  className={rowGlow(isSelected, "books")}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="tabular-nums text-slate-500 dark:text-slate-400">
                      {new Date(line.entry_date).toLocaleDateString("he-IL")}
                    </span>
                    <span
                      className={cn(
                        "font-mono text-sm font-semibold tabular-nums",
                        line.amount >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      )}
                    >
                      {Math.abs(line.amount).toLocaleString("he-IL", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">
                    {line.description || "—"}
                  </p>
                  {line.reference_1 ? (
                    <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                      {line.reference_1}
                    </p>
                  ) : null}
                </div>
              )
            })}
            {journalLines.length === 0 && !isLoading ? (
              <p className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                {!selectedBankId
                  ? "בחרו חשבון"
                  : "אין שורות יומן פתוחות לחשבון זה"}
              </p>
            ) : null}
          </div>
        </section>
      </div>

      <footer
        className={cn(
          "shrink-0 space-y-4 p-6",
          "rounded-3xl border border-white/20 bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-slate-950 text-white shadow-2xl shadow-slate-900/30 ring-1 ring-white/10 backdrop-blur-xl dark:from-slate-950 dark:via-slate-950"
        )}
      >
        {matchMessage ? (
          <div
            className={cn(
              "rounded-2xl px-4 py-2.5 text-sm",
              matchMessage.type === "success"
                ? "bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-400/30"
                : "bg-red-500/15 text-red-100 ring-1 ring-red-400/30"
            )}
          >
            {matchMessage.text}
          </div>
        ) : null}
        {autoMatchMessage ? (
          <div className="rounded-2xl bg-sky-500/10 px-4 py-2 text-sm text-sky-100 ring-1 ring-sky-400/25">
            {autoMatchMessage}
          </div>
        ) : null}

        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Books Σ
              </p>
              <p className="mt-1 font-mono text-xl font-bold tabular-nums text-sky-300">
                {totals.journalTotal.toLocaleString("he-IL", {
                  minimumFractionDigits: 2,
                })}
              </p>
            </div>
            <span className="text-slate-600">−</span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Bank Σ
              </p>
              <p className="mt-1 font-mono text-xl font-bold tabular-nums text-violet-300">
                {totals.bankTotal.toLocaleString("he-IL", {
                  minimumFractionDigits: 2,
                })}
              </p>
            </div>
            <span className="text-slate-600">=</span>
            <div
              className={cn(
                "rounded-2xl px-5 py-3 ring-1",
                totals.isBalanced
                  ? "bg-emerald-500/20 ring-emerald-400/40 shadow-[0_0_28px_-6px_rgba(52,211,153,0.45)]"
                  : "bg-amber-500/10 ring-amber-400/25 shadow-[0_0_24px_-8px_rgba(251,191,36,0.25)]"
              )}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Live Delta
              </p>
              <p
                className={cn(
                  "mt-1 font-mono text-2xl font-bold tabular-nums",
                  totals.isBalanced ? "text-emerald-300" : "text-amber-200"
                )}
              >
                {totals.liveDelta.toLocaleString("he-IL", {
                  minimumFractionDigits: 2,
                })}
              </p>
              {totals.isBalanced ? (
                <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-200/90">
                  <CheckCircle2 className="size-3.5" />
                  מאוזן — ניתן לפרסם התאמה
                </p>
              ) : (
                <p className="mt-1 text-xs text-amber-100/80">
                  יעד: 0 — בחרו שורות עד שההפרש נעלם
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={!selectedBankId}
              onClick={() => handleAutoMatch()}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-slate-100 transition hover:bg-white/10 disabled:opacity-40"
            >
              <Sparkles className="size-4 text-amber-300" />
              Match AI
            </button>
            <button
              type="button"
              disabled={!totals.isBalanced || isMatching}
              onClick={() => void handlePerformMatch()}
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl px-8 py-3 text-sm font-semibold transition",
                totals.isBalanced && !isMatching
                  ? "bg-gradient-to-l from-emerald-500 to-emerald-400 text-slate-900 shadow-lg shadow-emerald-500/30 hover:from-emerald-400 hover:to-emerald-300"
                  : "cursor-not-allowed bg-slate-800 text-slate-500"
              )}
            >
              {isMatching ? (
                <span className="inline-block size-5 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
              ) : (
                <CheckCircle2 className="size-5" />
              )}
              {isMatching ? "מבצע…" : "פרסם התאמה"}
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}
