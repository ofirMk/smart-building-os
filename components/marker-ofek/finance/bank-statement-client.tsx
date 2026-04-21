"use client"

import React, { useMemo, useState } from "react"
import {
  Building2,
  Loader2,
  Plus,
  Save,
  Trash2,
  UploadCloud,
} from "lucide-react"

import { createBankStatementAction } from "@/lib/holden-erp/bank-actions"
import type { GlAccountRow } from "@/types/holden-finance"

interface BankStatementClientProps {
  accounts: GlAccountRow[]
}

interface StatementLine {
  id: string
  date: string
  reference: string
  description: string
  debit: string
  credit: string
}

function emptyLinesRow(statementDate: string): StatementLine[] {
  return [
    {
      id: "1",
      date: statementDate,
      reference: "",
      description: "",
      debit: "",
      credit: "",
    },
  ]
}

export function BankStatementClient({ accounts }: BankStatementClientProps) {
  const bankAccounts = useMemo(() => {
    const filtered = accounts.filter(
      (a) =>
        a.trial_balance_group?.includes("שוטף") ||
        a.account_name_he?.includes("בנק") ||
        a.account_name_he?.includes("קופה")
    )
    return filtered.length > 0 ? filtered : accounts
  }, [accounts])

  const initialStatementDate = useMemo(
    () => new Date().toISOString().split("T")[0] ?? "",
    []
  )

  const [selectedBank, setSelectedBank] = useState("")
  const [statementDate, setStatementDate] = useState(initialStatementDate)
  const [startingBalance, setStartingBalance] = useState("0")
  const [endingBalance, setEndingBalance] = useState("0")
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")

  const [lines, setLines] = useState<StatementLine[]>([
    {
      id: "1",
      date: initialStatementDate,
      reference: "",
      description: "",
      debit: "",
      credit: "",
    },
  ])

  const addLine = () => {
    setLines([
      ...lines,
      {
        id: Math.random().toString(36).slice(2, 11),
        date: statementDate,
        reference: "",
        description: "",
        debit: "",
        credit: "",
      },
    ])
  }

  const removeLine = (id: string) => {
    if (lines.length > 1) setLines(lines.filter((l) => l.id !== id))
  }

  const updateLine = (
    id: string,
    field: keyof StatementLine,
    value: string
  ) => {
    setLines(
      lines.map((l) => {
        if (l.id !== id) return l
        const updated = { ...l, [field]: value }
        if (field === "debit" && value !== "") updated.credit = ""
        if (field === "credit" && value !== "") updated.debit = ""
        return updated
      })
    )
  }

  const handleSave = async () => {
    setSaveMessage("")

    if (!selectedBank.trim()) {
      setSaveMessage("נא לבחור חשבון בנק")
      return
    }

    const payloadLines = lines
      .map((line) => ({
        date: line.date,
        reference: line.reference,
        description: line.description,
        debit: Number(line.debit) || 0,
        credit: Number(line.credit) || 0,
      }))
      .filter((row) => row.debit > 0 || row.credit > 0)

    if (payloadLines.length === 0) {
      setSaveMessage(
        "נדרשת לפחות שורת תנועה עם סכום חובה או זכות"
      )
      return
    }

    setIsSaving(true)
    try {
      const result = await createBankStatementAction({
        bankAccountId: selectedBank,
        statementDate,
        startingBalance: Number(startingBalance) || 0,
        endingBalance: Number(endingBalance) || 0,
        lines: payloadLines,
      })

      if (result.success) {
        setSaveMessage(
          `נשמר דף בנק ${result.statementNumber} בהצלחה`
        )
        setStartingBalance("0")
        setEndingBalance("0")
        setLines(emptyLinesRow(statementDate))
      } else {
        setSaveMessage(result.error || "שמירה נכשלה")
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-6 rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-800">
                פרטי דף בנק
              </h2>
              <p className="text-sm text-slate-500">
                בחר חשבון והזן את יתרות הדף
              </p>
            </div>
          </div>
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg border bg-slate-100 py-2 px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200"
          >
            <UploadCloud className="h-4 w-4" />
            ייבוא מקובץ בנק (CSV)
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              חשבון בנק
            </label>
            <select
              value={selectedBank}
              onChange={(e) => setSelectedBank(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="" disabled>
                בחר חשבון...
              </option>
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.account_code} - {a.account_name_he}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              תאריך הדף
            </label>
            <input
              type="date"
              value={statementDate}
              onChange={(e) => setStatementDate(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              יתרת פתיחה
            </label>
            <input
              type="number"
              value={startingBalance}
              onChange={(e) => setStartingBalance(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              יתרת סגירה
            </label>
            <input
              type="number"
              value={endingBalance}
              onChange={(e) => setEndingBalance(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {saveMessage ? (
        <div
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${
            saveMessage.startsWith("נשמר")
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {saveMessage}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b bg-background px-4 py-3">
          <h3 className="font-medium text-slate-700">
            תנועות דף הבנק
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="border-b bg-background font-medium text-slate-600">
              <tr>
                <th className="w-40 px-4 py-3">תאריך תנועה</th>
                <th className="w-40 px-4 py-3">אסמכתא</th>
                <th className="min-w-[200px] px-4 py-3">תיאור / פרטים</th>
                <th className="w-32 px-4 py-3">חובה (יצא)</th>
                <th className="w-32 px-4 py-3">זכות (נכנס)</th>
                <th className="w-12 px-4 py-3 text-center" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {lines.map((line) => (
                <tr
                  key={line.id}
                  className="group hover:bg-background/50 focus-within:bg-blue-50/30"
                >
                  <td className="p-1.5">
                    <input
                      type="date"
                      value={line.date}
                      onChange={(e) =>
                        updateLine(line.id, "date", e.target.value)
                      }
                      className="w-full rounded border-0 bg-transparent px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                  <td className="p-1.5">
                    <input
                      type="text"
                      value={line.reference}
                      onChange={(e) =>
                        updateLine(line.id, "reference", e.target.value)
                      }
                      placeholder="מס' צ'ק/אסמכתא"
                      className="w-full rounded border-0 bg-transparent px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                  <td className="p-1.5">
                    <input
                      type="text"
                      value={line.description}
                      onChange={(e) =>
                        updateLine(line.id, "description", e.target.value)
                      }
                      placeholder="לדוגמה: עמלת שורה / העברה מלקוח"
                      className="w-full rounded border-0 bg-transparent px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                  <td className="p-1.5">
                    <input
                      type="number"
                      value={line.debit}
                      onChange={(e) =>
                        updateLine(line.id, "debit", e.target.value)
                      }
                      placeholder="0.00"
                      className="w-full rounded border-0 bg-transparent px-2 py-1.5 text-left font-medium text-red-600 outline-none focus:ring-1 focus:ring-red-500"
                    />
                  </td>
                  <td className="p-1.5">
                    <input
                      type="number"
                      value={line.credit}
                      onChange={(e) =>
                        updateLine(line.id, "credit", e.target.value)
                      }
                      placeholder="0.00"
                      className="w-full rounded border-0 bg-transparent px-2 py-1.5 text-left font-medium text-emerald-600 outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </td>
                  <td className="p-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      disabled={lines.length <= 1 || isSaving}
                      className="rounded p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t bg-background p-4">
          <button
            type="button"
            onClick={addLine}
            disabled={isSaving}
            className="flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            הוסף תנועה
          </button>

          <button
            type="button"
            disabled={isSaving}
            onClick={() => void handleSave()}
            className="flex items-center gap-2 rounded-lg bg-blue-600 py-2 px-6 font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            שמור דף בנק
          </button>
        </div>
      </div>
    </div>
  )
}
