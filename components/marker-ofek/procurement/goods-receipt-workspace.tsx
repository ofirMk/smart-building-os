"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Bot,
  ClipboardCheck,
  FileUp,
  Package,
  Paperclip,
  Save,
  Scan,
  Sparkles,
} from "lucide-react"
import { toast } from "sonner"
import {
  Controller,
  useFieldArray,
  useForm,
  type SubmitHandler,
} from "react-hook-form"

import {
  DenseDetailPanel,
  DenseMasterDetailTemplate,
} from "@/components/layout/DenseMasterDetailTemplate"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  GOODS_RECEIPT_MOCK_PURCHASE_ORDERS,
  defaultGoodsReceiptValues,
  goodsReceiptFormSchema,
  type GoodsReceiptFormInput,
  type GoodsReceiptFormOutput,
} from "@/lib/marker-ofek/goods-receipt-schema"
import { cn } from "@/lib/utils"

const fieldClass =
  "h-8 border-slate-200 bg-white text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:border-emerald-500/40 focus-visible:ring-emerald-500/15"
const labelClass = "text-xs font-semibold text-slate-600"

function parseQty(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (v === "" || v == null) return 0
  const n = Number(String(v).replace(",", ".").trim())
  return Number.isFinite(n) ? n : 0
}

function lineReceiveBadge(orderedQty: number, receivedQty: number) {
  if (receivedQty <= 0) {
    return { label: "ממתין", className: "bg-slate-100 text-slate-700" }
  }
  if (receivedQty > orderedQty) {
    return { label: "חריגה", className: "bg-red-100 text-red-800" }
  }
  if (receivedQty >= orderedQty) {
    return { label: "מלא", className: "bg-emerald-100 text-emerald-800" }
  }
  return { label: "חלקי", className: "bg-amber-100 text-amber-900" }
}

type OcrExtractedLine = {
  sku: string
  itemName: string
  poNumber: string
  quantity: number
}

type OcrResponse = {
  supplierName: string
  documentNumber: string
  documentDate: string
  lines: OcrExtractedLine[]
}

function normalizePoToken(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase()
}

function isOcrResponse(value: unknown): value is OcrResponse {
  if (!value || typeof value !== "object") return false
  const v = value as Partial<OcrResponse>
  return (
    typeof v.supplierName === "string" &&
    typeof v.documentNumber === "string" &&
    typeof v.documentDate === "string" &&
    Array.isArray(v.lines)
  )
}

export default function GoodsReceiptWorkspace() {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const [isDragActive, setIsDragActive] = React.useState(false)
  const [isAnalyzing, setIsAnalyzing] = React.useState(false)
  const [ocrSupplierName, setOcrSupplierName] = React.useState("")
  const [aiTouchedFields, setAiTouchedFields] = React.useState<Set<string>>(
    () => new Set()
  )

  const initialDefaults = React.useMemo(
    () => defaultGoodsReceiptValues(GOODS_RECEIPT_MOCK_PURCHASE_ORDERS[0]?.id ?? ""),
    []
  )

  const form = useForm<GoodsReceiptFormInput, unknown, GoodsReceiptFormOutput>({
    resolver: zodResolver(goodsReceiptFormSchema),
    defaultValues: initialDefaults,
    mode: "onChange",
  })

  const {
    control,
    register,
    handleSubmit,
    reset,
    getValues,
    watch,
    formState: { errors },
  } = form

  const { fields } = useFieldArray({ control, name: "lines" })
  const watchedLines = watch("lines")

  const onSaveDraft = React.useCallback(() => {
    const data = getValues()
    console.log("[Goods Receipt] שמור טיוטה:", data)
    toast.success("טיוטה נשמרה (מקומית)")
  }, [getValues])

  const onAttachDeliveryNote = React.useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const onPostReceipt: SubmitHandler<GoodsReceiptFormOutput> = (data) => {
    console.log("[Goods Receipt] אשר קליטה — payload:", data)
    toast.success("קליטת סחורה נרשמה (דמה)")
  }

  const handlePoChange = React.useCallback(
    (poId: string) => {
      reset(defaultGoodsReceiptValues(poId))
      setAiTouchedFields(new Set())
      setOcrSupplierName("")
    },
    [reset]
  )

  const applyOcrPayload = React.useCallback(
    (payload: OcrResponse) => {
      const firstPoNumber = payload.lines[0]?.poNumber ?? ""
      const normalizedOcrPo = normalizePoToken(firstPoNumber)
      const matchedPo =
        GOODS_RECEIPT_MOCK_PURCHASE_ORDERS.find((po) =>
          normalizePoToken(po.label).includes(normalizedOcrPo)
        ) ?? GOODS_RECEIPT_MOCK_PURCHASE_ORDERS[0]

      const nextValues = defaultGoodsReceiptValues(matchedPo?.id ?? "")
      nextValues.deliveryNoteNumber = payload.documentNumber
      nextValues.receiptDate = payload.documentDate

      const ocrBySku = new Map(
        payload.lines.map((line) => [line.sku.trim().toLowerCase(), line])
      )

      nextValues.lines = nextValues.lines.map((line) => {
        const ocrLine = ocrBySku.get(line.sku.trim().toLowerCase())
        return {
          ...line,
          receivedQty: ocrLine ? parseQty(ocrLine.quantity) : 0,
        }
      })

      reset(nextValues, { keepErrors: false })
      setOcrSupplierName(payload.supplierName)

      const touched = new Set<string>([
        "poNumber",
        "deliveryNoteNumber",
        "receiptDate",
        "supplierName",
      ])
      nextValues.lines.forEach((line, index) => {
        if (line.receivedQty > 0) touched.add(`lines.${index}.receivedQty`)
      })
      setAiTouchedFields(touched)
    },
    [reset]
  )

  const analyzeDocument = React.useCallback(
    async (file: File) => {
      setIsAnalyzing(true)
      try {
        const body = new FormData()
        body.append("file", file)
        const response = await fetch("/api/ocr", {
          method: "POST",
          body,
        })
        const json = (await response.json()) as unknown
        if (!response.ok) {
          const message =
            typeof json === "object" &&
            json !== null &&
            "error" in json &&
            typeof (json as { error?: unknown }).error === "string"
              ? (json as { error: string }).error
              : "OCR נכשל"
          throw new Error(message)
        }
        if (!isOcrResponse(json)) {
          throw new Error("מבנה תשובת OCR לא תקין")
        }
        if ("error" in json) {
          const message =
            typeof (json as { error?: unknown }).error === "string"
              ? ((json as { error?: string }).error ?? "OCR נכשל")
              : "OCR נכשל"
          throw new Error(message)
        }
        applyOcrPayload(json)
        toast.success("Magic Extract הושלם", {
          description: "השדות מולאו אוטומטית. נא לאמת ולאשר קליטה.",
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        toast.error("פענוח תעודה נכשל", { description: message })
      } finally {
        setIsAnalyzing(false)
      }
    },
    [applyOcrPayload]
  )

  const onDropZoneFile = React.useCallback(
    async (file: File | null | undefined) => {
      if (!file) return
      const isSupported =
        file.type === "application/pdf" || file.type.startsWith("image/")
      if (!isSupported) {
        toast.error("סוג קובץ לא נתמך", {
          description: "נא להעלות PDF, PNG או JPG.",
        })
        return
      }
      await analyzeDocument(file)
    },
    [analyzeDocument]
  )

  const isAiField = React.useCallback(
    (field: string) => aiTouchedFields.has(field),
    [aiTouchedFields]
  )

  return (
    <form
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-white [color-scheme:light]"
      onSubmit={handleSubmit(onPostReceipt)}
    >
      <DenseMasterDetailTemplate
        dir="rtl"
        className="min-h-0 flex-1 text-slate-900"
        eyebrow="Marker Ofek · רכש"
        title="קליטת סחורה (GR)"
        description="קליטה מול הזמנת רכש מאושרת — תעודת משלוח וכמויות שהתקבלו (דמה)."
        leading={<Package className="size-5 text-slate-700" aria-hidden />}
        backLink={{
          href: "/marker-ofek/procurement",
          label: "חזרה לרכש",
        }}
        headerActions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 border-slate-200 bg-white text-sm text-slate-800"
              onClick={onSaveDraft}
            >
              <Save className="size-3.5 opacity-90" aria-hidden />
              טיוטה
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 border-slate-200 bg-white text-sm text-slate-800"
              onClick={onAttachDeliveryNote}
            >
              <Paperclip className="size-3.5 opacity-90" aria-hidden />
              צירוף תעודה
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-8 gap-1 bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <ClipboardCheck className="size-3.5 opacity-95" aria-hidden />
              אשר קליטה
            </Button>
          </>
        }
        master={
          <div className="flex flex-col gap-2">
            <div
              className={cn(
                "relative overflow-hidden rounded-lg border bg-white p-3 shadow-sm transition",
                isDragActive
                  ? "border-sky-400 ring-2 ring-sky-100"
                  : "border-slate-200",
                isAnalyzing && "border-emerald-300"
              )}
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragActive(true)
              }}
              onDragLeave={(e) => {
                e.preventDefault()
                setIsDragActive(false)
              }}
              onDrop={(e) => {
                e.preventDefault()
                setIsDragActive(false)
                const file = e.dataTransfer.files?.[0]
                void onDropZoneFile(file)
              }}
            >
              {isAnalyzing ? (
                <div className="absolute inset-x-3 top-2 h-0.5 overflow-hidden rounded-full bg-emerald-100">
                  <div className="h-full w-full animate-pulse bg-emerald-400/80" />
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {isAnalyzing ? (
                    <Bot className="size-4 animate-pulse text-emerald-600" aria-hidden />
                  ) : (
                    <Scan className="size-4 text-sky-700" aria-hidden />
                  )}
                  <p className="text-xs font-semibold text-slate-800">
                    {isAnalyzing
                      ? "AI Analyzing..."
                      : "Magic Extract · Drag & Drop PDF/Image"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 border-slate-200 bg-white text-xs text-slate-800"
                  disabled={isAnalyzing}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileUp className="size-3.5" aria-hidden />
                  העלאת קובץ
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.currentTarget.value = ""
                    void onDropZoneFile(file)
                  }}
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-600">
                גררו תעודת משלוח (PDF/תמונה) לפענוח אוטומטי של ספק, מספר מסמך ושורות קליטה.
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-3 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-slate-600">
                <Sparkles className="size-3.5 text-emerald-600" aria-hidden />
                שדות עם מילוי AI מסומנים לאימות לפני אישור
                <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">
                  AI Generated
                </span>
              </div>
              <div className="flex flex-wrap gap-4">
              <div className="flex min-w-[260px] flex-1 flex-col gap-1">
                <span className={labelClass}>הזמנת רכש (PO)</span>
                <Controller
                  control={control}
                  name="poNumber"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        const id = v ?? ""
                        field.onChange(id)
                        handlePoChange(id)
                      }}
                    >
                      <SelectTrigger
                        className={cn(
                          fieldClass,
                          "w-full",
                          isAiField("poNumber") &&
                            "border-emerald-300 bg-emerald-50/50",
                          errors.poNumber && "border-red-300 ring-1 ring-red-200"
                        )}
                      >
                        <SelectValue placeholder="בחרו PO" />
                      </SelectTrigger>
                      <SelectContent dir="rtl">
                        {GOODS_RECEIPT_MOCK_PURCHASE_ORDERS.map((po) => (
                          <SelectItem key={po.id} value={po.id}>
                            {po.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.poNumber ? (
                  <p className="text-[11px] text-red-600">
                    {errors.poNumber.message}
                  </p>
                ) : null}
              </div>

              <div className="flex min-w-[160px] flex-col gap-1">
                <Label htmlFor="gr-delivery-note" className={labelClass}>
                  מספר תעודת משלוח
                </Label>
                <Input
                  id="gr-delivery-note"
                  className={cn(
                    fieldClass,
                    isAiField("deliveryNoteNumber") &&
                      "border-emerald-300 bg-emerald-50/50",
                    errors.deliveryNoteNumber &&
                      "border-red-300 ring-1 ring-red-200"
                  )}
                  placeholder="למשל DN-2026-0144"
                  {...register("deliveryNoteNumber")}
                />
                {errors.deliveryNoteNumber ? (
                  <p className="text-[11px] text-red-600">
                    {errors.deliveryNoteNumber.message}
                  </p>
                ) : null}
              </div>

              <div className="flex min-w-[150px] flex-col gap-1">
                <Label htmlFor="gr-date" className={labelClass}>
                  תאריך קליטה
                </Label>
                <Input
                  id="gr-date"
                  type="date"
                  className={cn(
                    fieldClass,
                    isAiField("receiptDate") &&
                      "border-emerald-300 bg-emerald-50/50",
                    errors.receiptDate && "border-red-300 ring-1 ring-red-200"
                  )}
                  {...register("receiptDate")}
                />
                {errors.receiptDate ? (
                  <p className="text-[11px] text-red-600">
                    {errors.receiptDate.message}
                  </p>
                ) : null}
              </div>

              <div className="flex min-w-[200px] flex-1 flex-col gap-1">
                <Label className={labelClass}>ספק (זוהה מהתעודה)</Label>
                <div
                  className={cn(
                    "flex h-8 items-center rounded-md border px-2 text-xs text-slate-800",
                    isAiField("supplierName")
                      ? "border-emerald-300 bg-emerald-50/60"
                      : "border-slate-200 bg-white"
                  )}
                >
                  {ocrSupplierName || "—"}
                  {isAiField("supplierName") ? (
                    <span className="me-auto rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                      Needs Verification
                    </span>
                  ) : null}
                </div>
              </div>
              </div>
            </div>
          </div>
        }
        detail={
          <DenseDetailPanel className="min-h-0 flex-1 overflow-auto border-slate-200 bg-white p-1.5 shadow-sm">
            <div className="px-1 pb-2 pt-1 md:px-2">
              <p className="mb-2 text-xs font-bold text-slate-800">
                שורות קליטה
              </p>
              <div className="rounded-md border border-slate-200 bg-white md:rounded-lg">
                <Table dir="rtl" className="relative">
                  <TableHeader>
                    <TableRow className="border-slate-200 hover:bg-transparent">
                      <TableHead className="w-[110px] py-2 text-start text-xs font-semibold text-slate-700">
                        מק״ט
                      </TableHead>
                      <TableHead className="min-w-[200px] py-2 text-start text-xs font-semibold text-slate-700">
                        תיאור פריט
                      </TableHead>
                      <TableHead className="w-[100px] py-2 text-start text-xs font-semibold text-slate-700">
                        הוזמן
                      </TableHead>
                      <TableHead className="w-[120px] py-2 text-start text-xs font-semibold text-slate-700">
                        התקבל
                      </TableHead>
                      <TableHead className="w-[100px] py-2 text-start text-xs font-semibold text-slate-700">
                        סטטוס
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((field, index) => {
                      const row = watchedLines?.[index]
                      const ordered = parseQty(row?.orderedQty)
                      const received = parseQty(row?.receivedQty)
                      const badge = lineReceiveBadge(ordered, received)
                      return (
                        <TableRow
                          key={field.id}
                          className="border-slate-100 hover:bg-slate-50/80"
                        >
                          <TableCell className="px-2 py-1.5 align-middle font-mono text-xs text-slate-800">
                            <input
                              type="hidden"
                              {...register(`lines.${index}.sku`)}
                            />
                            {row?.sku ?? "—"}
                          </TableCell>
                          <TableCell className="px-2 py-1.5 align-middle">
                            <input
                              type="hidden"
                              {...register(`lines.${index}.itemName`)}
                            />
                            <input
                              type="hidden"
                              {...register(`lines.${index}.orderedQty`, {
                                valueAsNumber: true,
                              })}
                            />
                            <span className="text-sm text-slate-900">
                              {row?.itemName ?? "—"}
                            </span>
                          </TableCell>
                          <TableCell className="px-2 py-1.5 align-middle tabular-nums text-sm text-slate-800">
                            {ordered.toLocaleString("he-IL")}
                          </TableCell>
                          <TableCell className="px-2 py-1.5 align-middle">
                            <Input
                              inputMode="decimal"
                              min={0}
                              step="any"
                              className={cn(
                                fieldClass,
                                "w-28 font-currency-mono tabular-nums",
                                isAiField(`lines.${index}.receivedQty`) &&
                                  "border-emerald-300 bg-emerald-50/50",
                                errors.lines?.[index]?.receivedQty &&
                                  "border-red-300 ring-1 ring-red-200"
                              )}
                              aria-label={`כמות שהתקבלה — שורה ${index + 1}`}
                              {...register(`lines.${index}.receivedQty`, {
                                setValueAs: (v) => parseQty(v),
                              })}
                            />
                          </TableCell>
                          <TableCell className="px-2 py-1.5 align-middle">
                            <span
                              className={cn(
                                "inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold",
                                badge.className
                              )}
                            >
                              {badge.label}
                            </span>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              {errors.lines && typeof errors.lines.message === "string" ? (
                <p className="mt-2 text-[11px] text-red-600">
                  {errors.lines.message}
                </p>
              ) : null}
            </div>
          </DenseDetailPanel>
        }
      />
    </form>
  )
}
