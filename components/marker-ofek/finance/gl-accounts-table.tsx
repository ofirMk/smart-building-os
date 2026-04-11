"use client"

import React, { useMemo, useState } from "react"
import { Search, Filter, Activity, Archive } from "lucide-react"

import type { GlAccountRow } from "@/types/holden-finance"

export type GlAccountsTableProps = {
  initialAccounts: GlAccountRow[]
}

export function GlAccountsTable({ initialAccounts }: GlAccountsTableProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [filterGroup, setFilterGroup] = useState<string>("all")

  const uniqueGroups = useMemo(() => {
    const groups = new Set(
      initialAccounts.map((a) => a.trial_balance_group?.trim()).filter(Boolean)
    )
    return Array.from(groups).sort()
  }, [initialAccounts])

  const filteredAccounts = useMemo(() => {
    const term = searchTerm.trim()
    const termLower = term.toLowerCase()

    return initialAccounts.filter((account) => {
      const matchesSearch =
        !term ||
        account.account_code.toLowerCase().includes(termLower) ||
        account.account_name_he.includes(term) ||
        (account.account_name_en?.toLowerCase().includes(termLower) ?? false)

      const matchesGroup =
        filterGroup === "all" || account.trial_balance_group === filterGroup

      return matchesSearch && matchesGroup
    })
  }, [initialAccounts, searchTerm, filterGroup])

  return (
    <div className="flex h-full min-h-[320px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col items-center justify-between gap-4 border-b border-slate-200 bg-slate-50 p-4 sm:flex-row">
        <div className="relative w-full sm:w-72">
          <Search className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="חיפוש לפי קוד או שם חשבון..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-md border border-slate-200 py-2 pl-3 pr-9 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Filter className="h-4 w-4 shrink-0 text-slate-500" />
          <select
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 sm:w-auto"
          >
            <option value="all">כל קבוצות המאזן</option>
            {uniqueGroups.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-x-auto">
        <table className="w-full text-right text-sm">
          <thead className="border-b border-slate-200 bg-slate-100 font-medium text-slate-600">
            <tr>
              <th className="p-3">קוד חשבון</th>
              <th className="p-3">שם החשבון</th>
              <th className="p-3">קבוצת מאזן בוחן</th>
              <th className="p-3">קטגוריית דוח כספי</th>
              <th className="p-3 text-center">סטטוס</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {filteredAccounts.length > 0 ? (
              filteredAccounts.map((account) => (
                <tr
                  key={account.id}
                  className="transition-colors hover:bg-slate-50"
                >
                  <td className="p-3 font-mono font-medium text-slate-900">
                    {account.account_code}
                  </td>
                  <td className="p-3">
                    <div>{account.account_name_he}</div>
                    {account.account_name_en ? (
                      <div className="text-xs text-slate-400">{account.account_name_en}</div>
                    ) : null}
                  </td>
                  <td className="p-3">{account.trial_balance_group}</td>
                  <td className="p-3">{account.financial_statement_category}</td>
                  <td className="p-3 text-center">
                    {account.is_active ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
                        <Activity className="h-3 w-3" /> פעיל
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                        <Archive className="h-3 w-3" /> ארכיון
                      </span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500">
                  לא נמצאו חשבונות התואמים לחיפוש.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-200 bg-slate-50 p-3 text-left text-xs text-slate-500">
        סה״כ חשבונות מוצגים: {filteredAccounts.length}
      </div>
    </div>
  )
}
