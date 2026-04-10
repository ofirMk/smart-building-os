"use client"

import React, { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import {
  Loader2,
  Save,
  FileText,
  Wallet,
  Users,
  FileDigit,
  Plus,
} from "lucide-react"

import {
  ErpDenseTable,
  ErpDenseTableBody,
  ErpDenseTableCell,
  ErpDenseTableHead,
  ErpDenseTableHeader,
  ErpDenseHeaderRow,
  ErpDenseTableRow,
} from "@/components/marker-ofek/data-grid"
import { ErpMasterDetailLayout } from "@/components/marker-ofek/data-grid/erp-master-detail-layout"
import { AiContractImportModal } from "@/components/marker-ofek/contracts/ai-contract-import-modal"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type {
  ErpEntityData,
  EntityContractListRow,
} from "@/lib/marker-ofek/erp-entity-detail-types"
import {
  quickEntitySchema,
  type QuickEntityInput,
} from "@/lib/marker-ofek/erp-validation-schemas"
import { updateErpEntity } from "@/lib/marker-ofek/erp-entity-actions"

interface EntityMasterDetailClientProps {
  entityId: string
  initialData: ErpEntityData
  /**
   * חוזים מקושרים לישות (שורות `contracts` מהשרת).
   * שונה מ־`ErpContractCreateInput` (טופס יצירה מלא) — אלו שדות צרים לתצוגה.
   */
  contracts?: EntityContractListRow[]
}

type TabType = "financials" | "contracts" | "contacts" | "invoices"

function formatContractDate(value: string | null | undefined): string {
  if (value == null || String(value).trim() === "") return "—"
  return value
}

export function EntityMasterDetailClient({
  entityId,
  initialData,
  contracts = [],
}: EntityMasterDetailClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [activeTab, setActiveTab] = useState<TabType>("financials")
  const [isContractModalOpen, setIsContractModalOpen] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<QuickEntityInput>({
    resolver: zodResolver(quickEntitySchema as never) as Resolver<QuickEntityInput>,
    defaultValues: initialData as QuickEntityInput,
  })

  useEffect(() => {
    reset(initialData as QuickEntityInput)
  }, [initialData, reset])

  const onSubmit = (data: QuickEntityInput) => {
    startTransition(async () => {
      const result = await updateErpEntity(entityId, data)
      if (result.success) {
        toast.success("הנתונים נשמרו בהצלחה!")
        router.refresh()
      } else {
        toast.error(result.error || "אירעה שגיאה בשמירה")
      }
    })
  }

  const contractRows = contracts ?? []

  return (
    <ErpMasterDetailLayout
      key={entityId}
      title={initialData.name}
      subtitle={`ח.פ/ע.מ: ${initialData.legal_id || "לא הוגדר"} | סוג: ${
        initialData.type === "supplier"
          ? "ספק"
          : initialData.type === "client"
            ? "לקוח"
            : "קבלן משנה"
      }`}
      status={initialData.status || "פעיל"}
    >
      <div className="flex h-full flex-col space-y-4">
        <div className="flex items-center space-x-1 space-x-reverse border-b border-slate-200 pb-px dark:border-slate-700">
          <button
            type="button"
            onClick={() => setActiveTab("financials")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === "financials"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400"
            }`}
          >
            <Wallet className="h-4 w-4" />
            פרטים פיננסיים
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("contracts")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === "contracts"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400"
            }`}
          >
            <FileText className="h-4 w-4" />
            חוזים
            {contractRows.length > 0 ? (
              <span className="mr-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {contractRows.length}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("contacts")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === "contacts"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400"
            }`}
          >
            <Users className="h-4 w-4" />
            אנשי קשר
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("invoices")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === "invoices"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400"
            }`}
          >
            <FileDigit className="h-4 w-4" />
            חשבוניות / חשבונות חלקיים
          </button>
        </div>

        <div className="flex-1 rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700/80 dark:bg-slate-950">
          {activeTab === "financials" ? (
            <form onSubmit={handleSubmit(onSubmit)} className="p-6">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
                  הגדרות ספק/לקוח במערכת
                </h2>
                <button
                  type="submit"
                  disabled={!isDirty || isPending}
                  className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  שמור שינויים
                </button>
              </div>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    תנאי תשלום
                  </label>
                  <input
                    {...register("payment_term_code")}
                    className="rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900"
                    placeholder="למשל: +30"
                  />
                  {errors.payment_term_code ? (
                    <span className="text-xs text-red-500">
                      {errors.payment_term_code.message}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    מספר ספק ERP
                  </label>
                  <input
                    {...register("erp_supplier_number")}
                    className="rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900"
                    placeholder="מזהה מערכת קודמת"
                  />
                  {errors.erp_supplier_number ? (
                    <span className="text-xs text-red-500">
                      {errors.erp_supplier_number.message}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    ח.פ / ע.מ
                  </label>
                  <input
                    {...register("legal_id")}
                    className="rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900"
                    placeholder="ח.פ או ת.ז תקין"
                  />
                  {errors.legal_id ? (
                    <span className="text-xs text-red-500">{errors.legal_id.message}</span>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    % ניכוי מס במקור
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    {...register("withholding_tax_pct", {
                      setValueAs: (v) => {
                        if (v === "" || v === null || v === undefined) return null
                        const n = Number(v)
                        return Number.isFinite(n) ? n : null
                      },
                    })}
                    className="rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900"
                    placeholder="0 עד 100"
                  />
                  {errors.withholding_tax_pct ? (
                    <span className="text-xs text-red-500">
                      {errors.withholding_tax_pct.message}
                    </span>
                  ) : null}
                </div>

                <input type="hidden" {...register("name")} />
                <input type="hidden" {...register("type")} />
              </div>
            </form>
          ) : null}

          {activeTab === "contracts" ? (
            <div className="p-6">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
                  ניהול חוזים
                </h2>
                <button
                  type="button"
                  onClick={() => setIsContractModalOpen(true)}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "inline-flex gap-2"
                  )}
                >
                  <Plus className="h-4 w-4" />
                  חוזה חדש
                </button>
              </div>

              {contractRows.length === 0 ? (
                <div className="flex h-48 items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40">
                  <div className="text-center">
                    <FileText className="mx-auto mb-2 h-10 w-10 text-slate-400" />
                    <p className="font-medium text-slate-600 dark:text-slate-300">
                      אין חוזים מקושרים לישות זו
                    </p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                  <ErpDenseTable>
                    <ErpDenseTableHeader>
                      <ErpDenseHeaderRow>
                        <ErpDenseTableHead className="min-w-[140px]">שם / מספר</ErpDenseTableHead>
                        <ErpDenseTableHead className="min-w-[100px]">סוג</ErpDenseTableHead>
                        <ErpDenseTableHead className="min-w-[100px]">תמחור</ErpDenseTableHead>
                        <ErpDenseTableHead className="min-w-[110px]">תאריך התחלה</ErpDenseTableHead>
                        <ErpDenseTableHead className="min-w-[100px] text-end">
                          סכום
                        </ErpDenseTableHead>
                      </ErpDenseHeaderRow>
                    </ErpDenseTableHeader>
                    <ErpDenseTableBody>
                      {contractRows.map((c) => {
                        const label =
                          c.name?.trim() ||
                          c.contract_number ||
                          c.id.slice(0, 8)
                        const total =
                          c.total_amount != null
                            ? Number(c.total_amount).toLocaleString("he-IL")
                            : "—"

                        return (
                          <ErpDenseTableRow key={c.id} interactive>
                            <ErpDenseTableCell>
                              <Link
                                href={`/marker-ofek/contracts/${c.id}`}
                                className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                              >
                                {label}
                              </Link>
                            </ErpDenseTableCell>
                            <ErpDenseTableCell dir="ltr" className="text-slate-600">
                              {String(c.contract_type)}
                            </ErpDenseTableCell>
                            <ErpDenseTableCell dir="ltr" className="text-slate-600">
                              {c.pricing_model}
                            </ErpDenseTableCell>
                            <ErpDenseTableCell dir="ltr" className="text-slate-600">
                              {formatContractDate(c.start_date)}
                            </ErpDenseTableCell>
                            <ErpDenseTableCell dir="ltr" className="text-end tabular-nums">
                              {total}
                            </ErpDenseTableCell>
                          </ErpDenseTableRow>
                        )
                      })}
                    </ErpDenseTableBody>
                  </ErpDenseTable>
                </div>
              )}
            </div>
          ) : null}

          {activeTab === "contacts" || activeTab === "invoices" ? (
            <div className="p-6">
              <p className="py-10 text-center text-slate-500">המודול בבנייה...</p>
            </div>
          ) : null}
        </div>
      </div>

      <AiContractImportModal
        isOpen={isContractModalOpen}
        onClose={() => setIsContractModalOpen(false)}
        entityId={entityId}
      />
    </ErpMasterDetailLayout>
  )
}
