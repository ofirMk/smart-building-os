"use client"

import Link from "next/link"
import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
  CheckCircle2,
  FileCheck2,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Truck,
} from "lucide-react"

import {
  createJournalEntryAction,
  fetchAllGlAccounts,
} from "@/lib/holden-erp/journal-actions"
import type { GlAccountRow } from "@/types/holden-finance"
import type {
  MasterDataCurrencyRow,
  MasterDataUomRow,
} from "@/types/master-data"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface JournalEntryClientProps {
  accounts: GlAccountRow[]
  /** מטבעות ויחידות מידה מנתוני מאסטר — נוספים לתיאור הכותרת בעת שמירה */
  masterCurrencies?: MasterDataCurrencyRow[]
  masterUnitsOfMeasure?: MasterDataUomRow[]
}

interface JournalLine {
  id: string
  accountId: string
  accountName: string
  debit: string
  credit: string
  reference1: string
  reference2: string
  details: string
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function createEmptyLine(id: string): JournalLine {
  return {
    id,
    accountId: "",
    accountName: "",
    debit: "",
    credit: "",
    reference1: "",
    reference2: "",
    details: "",
  }
}

export function JournalEntryClient({
  accounts: initialAccounts,
  masterCurrencies = [],
  masterUnitsOfMeasure = [],
}: JournalEntryClientProps) {
  const [accounts, setAccounts] = useState(initialAccounts)
  const [glRefreshing, setGlRefreshing] = useState(false)

  useEffect(() => {
    setAccounts(initialAccounts)
  }, [initialAccounts])

  const [entryDate, setEntryDate] = useState(
    () => new Date().toISOString().split("T")[0] as string
  )
  const [referenceNumber, setReferenceNumber] = useState("")
  const [description, setDescription] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")
  const [lines, setLines] = useState<JournalLine[]>([
    createEmptyLine("1"),
    createEmptyLine("2"),
  ])
  const [focusAccountLineId, setFocusAccountLineId] = useState<string | null>(
    null
  )
  const [commandLineId, setCommandLineId] = useState<string>("1")
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState("")
  const [masterCurrencyId, setMasterCurrencyId] = useState("")
  const [masterUomId, setMasterUomId] = useState("")

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setPaletteQuery("")
        const empty = lines.find((l) => !l.accountId.trim())
        setCommandLineId(empty?.id ?? lines[0]?.id ?? "1")
        setPaletteOpen(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [lines])

  const accountsByCode = useMemo(() => {
    const m = new Map<string, GlAccountRow>()
    for (const a of accounts) {
      m.set(a.account_code.trim(), a)
    }
    return m
  }, [accounts])

  const accountsById = useMemo(() => {
    const m = new Map<string, GlAccountRow>()
    for (const a of accounts) {
      m.set(a.id, a)
    }
    return m
  }, [accounts])

  const resolveAccountUuid = (raw: string): string | null => {
    const t = raw.trim()
    if (!t) return null
    if (UUID_RE.test(t)) {
      return accountsById.has(t) ? t : null
    }
    const row = accountsByCode.get(t)
    return row?.id ?? null
  }

  const filterAccounts = useCallback(
    (q: string) => {
      const t = q.trim().toLowerCase()
      if (!t) return accounts.slice(0, 24)
      return accounts
        .filter(
          (a) =>
            a.account_code.toLowerCase().includes(t) ||
            a.account_name_he.includes(q.trim()) ||
            a.account_name_en.toLowerCase().includes(t)
        )
        .slice(0, 24)
    },
    [accounts]
  )

  const paletteFiltered = useMemo(
    () => filterAccounts(paletteQuery),
    [filterAccounts, paletteQuery]
  )

  const totals = useMemo(() => {
    return lines.reduce(
      (acc, line) => {
        acc.debit += Number(line.debit) || 0
        acc.credit += Number(line.credit) || 0
        return acc
      },
      { debit: 0, credit: 0 }
    )
  }, [lines])

  const balance = totals.debit - totals.credit
  const hasAmounts = totals.debit > 0 || totals.credit > 0
  const isBalanced = Math.abs(balance) < 0.000001 && hasAmounts

  const handleSave = async (status: "draft" | "posted") => {
    setSaveMessage("")

    const mapped: {
      line: JournalLine
      accountUuid: string
      debit: number
      credit: number
    }[] = []
    for (const line of lines) {
      const accountUuid = resolveAccountUuid(line.accountId)
      const debit = Number(line.debit) || 0
      const credit = Number(line.credit) || 0
      if (!accountUuid || (debit === 0 && credit === 0)) continue
      mapped.push({ line, accountUuid, debit, credit })
    }

    if (mapped.length === 0) {
      setSaveMessage(
        "לא נמצאו שורות תקינות — בחרו חשבון מהרשימה והזינו סכום חובה או זכות"
      )
      return
    }

    const sumDebit = mapped.reduce((s, r) => s + r.debit, 0)
    const sumCredit = mapped.reduce((s, r) => s + r.credit, 0)
    const balanced = Math.abs(sumDebit - sumCredit) < 0.000001

    if (status === "posted" && !balanced) {
      setSaveMessage(
        "לא ניתן לסגור פקודה — סה״כ חובה חייב להיות שווה לסה״כ זכות"
      )
      return
    }

    setIsSaving(true)
    try {
      let descOut = description.trim()
      if (masterCurrencyId) {
        const c = masterCurrencies.find((x) => x.id === masterCurrencyId)
        if (c) descOut = `${descOut ? `${descOut} ` : ""}[מטבע: ${c.code}]`.trim()
      }
      if (masterUomId) {
        const u = masterUnitsOfMeasure.find((x) => x.id === masterUomId)
        if (u) descOut = `${descOut ? `${descOut} ` : ""}[יחידה: ${u.code}]`.trim()
      }

      const result = await createJournalEntryAction({
        entryDate,
        description: descOut,
        referenceNumber: referenceNumber.trim() || undefined,
        status,
        lines: mapped.map((r) => ({
          accountId: r.accountUuid,
          debit: r.debit,
          credit: r.credit,
          reference1: r.line.reference1,
          reference2: r.line.reference2,
          details: r.line.details,
        })),
      })

      if (result.success) {
        setSaveMessage(`נשמרה בהצלחה פקודה מספר ${result.entryNumber}`)
        setEntryDate(new Date().toISOString().split("T")[0] as string)
        setReferenceNumber("")
        setDescription("")
        setMasterCurrencyId("")
        setMasterUomId("")
        setLines([createEmptyLine("1"), createEmptyLine("2")])
      } else {
        setSaveMessage(result.error || "שמירה נכשלה")
      }
    } finally {
      setIsSaving(false)
    }
  }

  const addLine = () => {
    const id = Math.random().toString(36).slice(2, 11)
    setLines([...lines, createEmptyLine(id)])
  }

  const removeLine = (id: string) => {
    if (lines.length > 2) {
      setLines(lines.filter((l) => l.id !== id))
    }
  }

  const updateLine = (id: string, field: keyof JournalLine, value: string) => {
    setLines(
      lines.map((l) => {
        if (l.id !== id) return l

        const updated = { ...l, [field]: value }

        if (field === "debit" && value !== "") updated.credit = ""
        if (field === "credit" && value !== "") updated.debit = ""

        if (field === "accountId") {
          const found =
            accounts.find((a) => a.account_code === value) ??
            accounts.find((a) => a.id === value)
          if (found) updated.accountName = found.account_name_he || ""
          else updated.accountName = ""
        }

        return updated
      })
    )
  }

  const pickAccount = (lineId: string, acc: GlAccountRow) => {
    setLines(
      lines.map((l) =>
        l.id === lineId
          ? {
              ...l,
              accountId: acc.account_code,
              accountName: acc.account_name_he,
            }
          : l
      )
    )
    setFocusAccountLineId(null)
    setPaletteOpen(false)
  }

  async function refreshGlAccounts() {
    setGlRefreshing(true)
    try {
      const r = await fetchAllGlAccounts()
      if (r.success && r.data) setAccounts(r.data)
    } finally {
      setGlRefreshing(false)
    }
  }

  const glassRow =
    "rounded-2xl border border-white/25 bg-white/35 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.45)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]"

  const inputGhost =
    "rounded-xl border-0 bg-transparent text-slate-900 placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:text-slate-100"

  return (
    <div className="w-full" dir="rtl">
      <div className="grid w-full gap-6 xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] xl:items-start xl:gap-8">
        <aside className="flex flex-col gap-5">
          <div
            className={cn(
              "space-y-4 p-6",
              glassRow,
              "ring-1 ring-slate-200/30 dark:ring-white/5"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                כותרת פקודה
              </p>
              <kbd className="hidden rounded-md bg-slate-100/80 px-2 py-0.5 font-mono text-[10px] text-slate-500 ring-1 ring-slate-200/80 dark:bg-white/10 dark:text-slate-400 dark:ring-white/10 sm:inline-block">
                ⌘K חיפוש
              </kbd>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-600 dark:text-slate-300">
                תאריך
              </Label>
              <Input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className={cn(
                  "h-11",
                  inputGhost,
                  "bg-white/50 dark:bg-white/5 [color-scheme:light] dark:[color-scheme:dark]"
                )}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-600 dark:text-slate-300">
                אסמכתא / מספר הפניה
              </Label>
              <Input
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="REF-2026-001"
                className={cn("h-11", inputGhost, "bg-white/50 dark:bg-white/5")}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-600 dark:text-slate-300">
                תיאור
              </Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="תיאור קצר לכותרת הפקודה"
                className={cn("h-11", inputGhost, "bg-white/50 dark:bg-white/5")}
              />
            </div>
            {(masterCurrencies.length > 0 || masterUnitsOfMeasure.length > 0) ? (
              <div className="space-y-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] p-3 dark:border-emerald-500/25 dark:bg-emerald-950/20">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                    נתוני מאסטר (אופציונלי)
                  </Label>
                  <Link
                    href="/marker-ofek/master-data?tab=suppliers"
                    className="text-[11px] font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
                  >
                    ניהול מאסטר
                  </Link>
                </div>
                {masterCurrencies.length > 0 ? (
                  <div className="space-y-1">
                    <Label className="text-[10px] text-slate-600 dark:text-slate-400">
                      מטבע (יוצג בתיאור)
                    </Label>
                    <select
                      className="h-10 w-full rounded-lg border border-white/20 bg-white/60 px-3 text-sm dark:bg-slate-900/40 dark:text-slate-100"
                      value={masterCurrencyId}
                      onChange={(e) => setMasterCurrencyId(e.target.value)}
                    >
                      <option value="">—</option>
                      {masterCurrencies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} {c.symbol} · {c.name_he}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                {masterUnitsOfMeasure.length > 0 ? (
                  <div className="space-y-1">
                    <Label className="text-[10px] text-slate-600 dark:text-slate-400">
                      יחידת מידה (יוצג בתיאור)
                    </Label>
                    <select
                      className="h-10 w-full rounded-lg border border-white/20 bg-white/60 px-3 text-sm dark:bg-slate-900/40 dark:text-slate-100"
                      value={masterUomId}
                      onChange={(e) => setMasterUomId(e.target.value)}
                    >
                      <option value="">—</option>
                      {masterUnitsOfMeasure.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.code} · {u.description_he}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
            ) : null}
            <Link
              href="/marker-ofek/master-data?tab=suppliers"
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border-0 bg-slate-900/5 text-sm font-medium text-slate-800 shadow-none ring-1 ring-slate-200/50 transition-colors hover:bg-slate-900/10 dark:bg-white/10 dark:text-slate-100 dark:ring-white/10"
            >
              <Truck className="ms-1 size-4 shrink-0" aria-hidden />
              ניהול ספקים במאסטר
            </Link>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={glRefreshing}
              className="w-full rounded-xl border-0 bg-slate-900/5 text-slate-800 shadow-none ring-1 ring-slate-200/50 hover:bg-slate-900/10 dark:bg-white/10 dark:text-slate-100 dark:ring-white/10"
              onClick={() => void refreshGlAccounts()}
            >
              {glRefreshing ? (
                <Loader2 className="ms-1 size-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="ms-1 size-4" aria-hidden />
              )}
              רענון כרטסת חשבונות
            </Button>
          </div>

          <div
            className={cn(
              "flex flex-col gap-3 p-5",
              glassRow,
              "ring-1 ring-slate-900/5 dark:ring-white/10"
            )}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              פעולות
            </p>
            <Button
              type="button"
              disabled={isSaving}
              onClick={() => void handleSave("posted")}
              className="h-12 w-full gap-2 rounded-xl bg-gradient-to-l from-blue-600 to-blue-500 text-base font-semibold text-white shadow-lg shadow-blue-500/30 hover:from-blue-500 hover:to-blue-600 disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <FileCheck2 className="size-5" />
              )}
              סגור פקודה (קבוע)
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isSaving}
              onClick={() => void handleSave("draft")}
              className="h-11 w-full gap-2 rounded-xl border-0 bg-white/60 text-slate-800 ring-1 ring-slate-200/60 hover:bg-white/90 dark:bg-white/10 dark:text-slate-100 dark:ring-white/10"
            >
              {isSaving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              שמור טיוטה
            </Button>
          </div>
        </aside>

        <main className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-center gap-3 px-1">
            {hasAmounts && !isBalanced ? (
              <div
                className="inline-flex items-center gap-2 rounded-full border border-red-400/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-700 shadow-[0_0_24px_-4px_rgba(239,68,68,0.55)] dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-200 dark:shadow-[0_0_28px_-6px_rgba(248,113,113,0.45)]"
                role="status"
              >
                <span className="tabular-nums">
                  הפרש:{" "}
                  {Math.abs(balance).toLocaleString("he-IL", {
                    minimumFractionDigits: 2,
                  })}{" "}
                  ₪
                </span>
                <span className="text-xs font-normal opacity-90">
                  (חובה − זכות ≠ 0)
                </span>
              </div>
            ) : null}
            {isBalanced ? (
              <div
                className="inline-flex items-center gap-2 rounded-full border border-emerald-400/45 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-800 shadow-[0_0_22px_-4px_rgba(16,185,129,0.5)] dark:border-emerald-500/35 dark:bg-emerald-950/35 dark:text-emerald-200 dark:shadow-[0_0_26px_-6px_rgba(52,211,153,0.45)]"
                role="status"
              >
                <CheckCircle2 className="size-4 shrink-0" aria-hidden />
                מוכן לפרסום
              </div>
            ) : null}
            {!hasAmounts ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                הזינו סכומי חובה/זכות — האיזון יחושב אוטומטית
              </p>
            ) : null}
          </div>

          <div
            className={cn(
              "overflow-hidden p-4 sm:p-5",
              glassRow,
              "min-h-[420px] ring-1 ring-slate-200/25 dark:ring-white/10"
            )}
          >
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                  שורות תנועה
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  חיפוש חשבון — הקלידו קוד או שם, או השתמשו ב־⌘K
                </p>
              </div>
              <button
                type="button"
                onClick={addLine}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-500/15 px-3 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-500/25 disabled:opacity-40 dark:text-sky-300"
              >
                <Plus className="size-4" />
                שורה
              </button>
            </div>

            <div className="space-y-3">
              {lines.map((line) => (
                <div
                  key={line.id}
                  className={cn(
                    "grid gap-3 p-4 sm:grid-cols-[1fr_minmax(0,8rem)_minmax(0,8rem)_minmax(0,7rem)_1fr_auto] sm:items-end",
                    glassRow,
                    "ring-1 ring-white/20 dark:ring-white/5"
                  )}
                >
                  <div className="relative min-w-0 sm:col-span-1">
                    <Label className="mb-1.5 block text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      חשבון
                    </Label>
                    <Input
                      value={line.accountId}
                      onChange={(e) =>
                        updateLine(line.id, "accountId", e.target.value)
                      }
                      onFocus={() => {
                        setFocusAccountLineId(line.id)
                        setCommandLineId(line.id)
                      }}
                      onBlur={() => {
                        window.setTimeout(
                          () =>
                            setFocusAccountLineId((id) =>
                              id === line.id ? null : id
                            ),
                          160
                        )
                      }}
                      placeholder="קוד / שם"
                      autoComplete="off"
                      className={cn("h-10", inputGhost)}
                    />
                    {focusAccountLineId === line.id ? (
                      <ul
                        className="absolute start-0 z-40 mt-1 max-h-56 w-full min-w-[220px] max-w-md overflow-auto rounded-xl border border-white/40 bg-white/80 py-1 shadow-2xl shadow-slate-900/10 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/85"
                        role="listbox"
                      >
                        {filterAccounts(line.accountId).map((a) => (
                          <li key={a.id}>
                            <button
                              type="button"
                              className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-right text-sm transition hover:bg-blue-500/15 dark:hover:bg-sky-500/15"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => pickAccount(line.id, a)}
                            >
                              <span className="font-mono text-xs font-medium text-blue-600 dark:text-sky-400">
                                {a.account_code}
                              </span>
                              <span className="text-slate-800 dark:text-slate-100">
                                {a.account_name_he}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      חובה
                    </Label>
                    <Input
                      type="number"
                      value={line.debit}
                      onChange={(e) =>
                        updateLine(line.id, "debit", e.target.value)
                      }
                      placeholder="0"
                      className={cn(
                        "h-10 text-left font-mono tabular-nums",
                        inputGhost
                      )}
                    />
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      זכות
                    </Label>
                    <Input
                      type="number"
                      value={line.credit}
                      onChange={(e) =>
                        updateLine(line.id, "credit", e.target.value)
                      }
                      placeholder="0"
                      className={cn(
                        "h-10 text-left font-mono tabular-nums",
                        inputGhost
                      )}
                    />
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      אסמכתא
                    </Label>
                    <Input
                      value={line.reference1}
                      onChange={(e) =>
                        updateLine(line.id, "reference1", e.target.value)
                      }
                      className={cn("h-10 text-sm", inputGhost)}
                    />
                  </div>
                  <div className="min-w-0 sm:col-span-1">
                    <Label className="mb-1.5 block text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      פרטים
                    </Label>
                    <Input
                      value={line.details}
                      onChange={(e) =>
                        updateLine(line.id, "details", e.target.value)
                      }
                      placeholder={description || "…"}
                      className={cn("h-10 text-sm", inputGhost)}
                    />
                  </div>
                  <div className="flex items-end justify-end pb-1">
                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      disabled={lines.length <= 2 || isSaving}
                      className="rounded-xl p-2 text-slate-400 transition hover:bg-red-500/15 hover:text-red-600 disabled:opacity-30 dark:hover:text-red-400"
                      aria-label="מחק שורה"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  {line.accountName ? (
                    <p className="col-span-full -mt-1 text-xs text-slate-600 dark:text-slate-300">
                      {line.accountName}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/30 pt-4 text-sm dark:border-white/10">
              <div className="flex flex-wrap gap-6 tabular-nums text-slate-700 dark:text-slate-200">
                <span>
                  סה״כ חובה:{" "}
                  <strong>
                    {totals.debit.toLocaleString("he-IL", {
                      minimumFractionDigits: 2,
                    })}
                  </strong>
                </span>
                <span>
                  סה״כ זכות:{" "}
                  <strong>
                    {totals.credit.toLocaleString("he-IL", {
                      minimumFractionDigits: 2,
                    })}
                  </strong>
                </span>
              </div>
              <span
                className={cn(
                  "font-mono text-xs font-medium tabular-nums",
                  hasAmounts && Math.abs(balance) >= 0.01
                    ? "text-red-600 dark:text-red-400"
                    : "text-slate-500 dark:text-slate-400"
                )}
              >
                Δ ={" "}
                {balance.toLocaleString("he-IL", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {saveMessage ? (
            <div
              role="status"
              className={cn(
                "rounded-2xl px-4 py-3 text-sm ring-1",
                saveMessage.startsWith("נשמרה")
                  ? "bg-emerald-500/10 text-emerald-900 ring-emerald-500/25 dark:text-emerald-100"
                  : "bg-red-500/10 text-red-900 ring-red-500/25 dark:text-red-100"
              )}
            >
              {saveMessage}
            </div>
          ) : null}
        </main>
      </div>

      {paletteOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-950/40 p-4 pt-[12vh] backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="חיפוש חשבון"
          onClick={() => setPaletteOpen(false)}
        >
          <div
            className={cn(
              "w-full max-w-lg overflow-hidden shadow-2xl",
              glassRow,
              "ring-1 ring-slate-200/40 dark:ring-white/15"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-white/30 px-3 py-2 dark:border-white/10">
              <Search className="size-4 shrink-0 text-slate-400" aria-hidden />
              <Input
                autoFocus
                value={paletteQuery}
                onChange={(e) => setPaletteQuery(e.target.value)}
                placeholder="הקלידו קוד או שם חשבון…"
                className={cn(
                  "border-0 bg-transparent text-base focus-visible:ring-0",
                  inputGhost
                )}
              />
            </div>
            <div className="max-h-72 overflow-auto p-2">
              {paletteFiltered.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-slate-500">
                  אין תוצאות
                </p>
              ) : (
                <ul role="listbox">
                  {paletteFiltered.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        className="flex w-full flex-col gap-0.5 rounded-xl px-3 py-2.5 text-right transition hover:bg-blue-500/15 dark:hover:bg-sky-500/15"
                        onClick={() => pickAccount(commandLineId, a)}
                      >
                        <span className="font-mono text-xs text-blue-600 dark:text-sky-400">
                          {a.account_code}
                        </span>
                        <span className="text-slate-800 dark:text-slate-100">
                          {a.account_name_he}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-white/30 px-3 py-2 text-[11px] text-slate-500 dark:border-white/10 dark:text-slate-400">
              שיוך לשורה:{" "}
              <select
                value={commandLineId}
                onChange={(e) => setCommandLineId(e.target.value)}
                className="rounded-lg bg-white/50 px-2 py-1 text-slate-800 ring-1 ring-slate-200/60 dark:bg-slate-800/80 dark:text-slate-100 dark:ring-white/10"
              >
                {lines.map((l, i) => (
                  <option key={l.id} value={l.id}>
                    שורה {i + 1}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  )
}
