"use client"

import * as React from "react"
import { Camera, Loader2, PackageCheck, TriangleAlert, Users } from "lucide-react"
import { z } from "zod"
import { toast } from "sonner"

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
import { apiGet, apiPost } from "@/lib/utils/api-client"

const fieldProjectsSchema = z.array(
  z.object({
    id: z.string().uuid(),
    projectNumber: z.string(),
    name: z.string(),
    status: z.string(),
    assignedToCurrentUser: z.boolean(),
  })
)

const poLineSchema = z.object({
  id: z.string().uuid(),
  description: z.string(),
  itemSku: z.string().nullable(),
  quantity: z.coerce.number(),
  unitPrice: z.coerce.number(),
  totalPrice: z.coerce.number(),
})

const mobilePoSchema = z.array(
  z.object({
    id: z.string().uuid(),
    poNumber: z.string(),
    title: z.string(),
    status: z.string(),
    issuedAt: z.string().nullable(),
    lines: z.array(poLineSchema),
  })
)

const workLogResultSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  workDate: z.string(),
  wbsChapter: z.string(),
  workersCount: z.coerce.number(),
  machineryHours: z.coerce.number(),
  progressPct: z.coerce.number(),
})

const materialReceiptResultSchema = z.object({
  receiptId: z.string().uuid(),
  movementId: z.string().uuid(),
  totalValue: z.coerce.number(),
})

const exceptionResultSchema = z.object({
  id: z.string().uuid(),
  changeOrderNumber: z.string(),
  status: z.string(),
  parentContractId: z.string().uuid(),
})

const money = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

export function MobileFieldClient() {
  const [projects, setProjects] = React.useState<z.infer<typeof fieldProjectsSchema>>([])
  const [loadingProjects, setLoadingProjects] = React.useState(false)
  const [selectedProjectId, setSelectedProjectId] = React.useState("")

  const [purchaseOrders, setPurchaseOrders] = React.useState<
    z.infer<typeof mobilePoSchema>
  >([])
  const [loadingPurchaseOrders, setLoadingPurchaseOrders] = React.useState(false)

  const [selectedPoId, setSelectedPoId] = React.useState("")
  const [selectedPoLineId, setSelectedPoLineId] = React.useState("")
  const [receiptQty, setReceiptQty] = React.useState("1")
  const [receiptNote, setReceiptNote] = React.useState("")

  const [workDate, setWorkDate] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [wbsChapter, setWbsChapter] = React.useState("")
  const [workersCount, setWorkersCount] = React.useState("0")
  const [machineryHours, setMachineryHours] = React.useState("0")
  const [progressPct, setProgressPct] = React.useState("0")
  const [workNote, setWorkNote] = React.useState("")

  const [exceptionTitle, setExceptionTitle] = React.useState("")
  const [exceptionDetails, setExceptionDetails] = React.useState("")
  const [exceptionPhotoLabel, setExceptionPhotoLabel] = React.useState<string | null>(null)

  const [submittingWorkLog, setSubmittingWorkLog] = React.useState(false)
  const [submittingReceipt, setSubmittingReceipt] = React.useState(false)
  const [submittingException, setSubmittingException] = React.useState(false)

  const selectedPo = React.useMemo(
    () => purchaseOrders.find((po) => po.id === selectedPoId) ?? null,
    [purchaseOrders, selectedPoId]
  )
  const selectedPoLine = React.useMemo(
    () => selectedPo?.lines.find((line) => line.id === selectedPoLineId) ?? null,
    [selectedPo, selectedPoLineId]
  )

  React.useEffect(() => {
    let isCurrentRequest = true
    const controller = new AbortController()

    const loadProjects = async () => {
      setLoadingProjects(true)
      try {
        const data = await apiGet("/api/erp/mobile/field/projects", {
          schema: fieldProjectsSchema,
          signal: controller.signal,
        })
        if (!isCurrentRequest) return
        setProjects(data)
        setSelectedProjectId((prev) => {
          if (prev && data.some((project) => project.id === prev)) return prev
          return data[0]?.id ?? ""
        })
      } catch (error) {
        if (controller.signal.aborted) return
        toast.error(error instanceof Error ? error.message : "טעינת פרויקטים נכשלה")
      } finally {
        if (isCurrentRequest) setLoadingProjects(false)
      }
    }

    void loadProjects()
    return () => {
      isCurrentRequest = false
      controller.abort()
    }
  }, [])

  React.useEffect(() => {
    let isCurrentRequest = true
    const controller = new AbortController()

    if (!selectedProjectId) {
      setPurchaseOrders([])
      setSelectedPoId("")
      setSelectedPoLineId("")
      return () => {
        isCurrentRequest = false
        controller.abort()
      }
    }

    const loadPurchaseOrders = async () => {
      setLoadingPurchaseOrders(true)
      try {
        const data = await apiGet(
          `/api/erp/mobile/field/projects/${selectedProjectId}/purchase-orders`,
          {
            schema: mobilePoSchema,
            signal: controller.signal,
          }
        )
        if (!isCurrentRequest) return
        setPurchaseOrders(data)
        setSelectedPoId((prev) => {
          if (prev && data.some((po) => po.id === prev)) return prev
          return data[0]?.id ?? ""
        })
      } catch (error) {
        if (controller.signal.aborted) return
        if (isCurrentRequest) {
          setPurchaseOrders([])
          toast.error(error instanceof Error ? error.message : "טעינת הזמנות רכש נכשלה")
        }
      } finally {
        if (isCurrentRequest) setLoadingPurchaseOrders(false)
      }
    }

    void loadPurchaseOrders()
    return () => {
      isCurrentRequest = false
      controller.abort()
    }
  }, [selectedProjectId])

  React.useEffect(() => {
    if (!selectedPo) {
      setSelectedPoLineId("")
      return
    }
    setSelectedPoLineId((prev) => {
      if (prev && selectedPo.lines.some((line) => line.id === prev)) return prev
      return selectedPo.lines[0]?.id ?? ""
    })
  }, [selectedPo])

  const submitWorkLog = React.useCallback(async () => {
    if (!selectedProjectId) return
    setSubmittingWorkLog(true)
    const controller = new AbortController()
    try {
      const data = await apiPost(
        "/api/erp/mobile/field/work-logs",
        {
          projectId: selectedProjectId,
          workDate,
          wbsChapter,
          workersCount,
          machineryHours,
          progressPct,
          note: workNote,
        },
        {
          schema: workLogResultSchema,
          signal: controller.signal,
        }
      )
      toast.success(`יומן עבודה נשמר (${data.wbsChapter})`)
      setWorkNote("")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שמירת יומן עבודה נכשלה")
    } finally {
      setSubmittingWorkLog(false)
      controller.abort()
    }
  }, [
    selectedProjectId,
    workDate,
    wbsChapter,
    workersCount,
    machineryHours,
    progressPct,
    workNote,
  ])

  const submitMaterialReceipt = React.useCallback(async () => {
    if (!selectedProjectId || !selectedPoId || !selectedPoLineId) return
    setSubmittingReceipt(true)
    const controller = new AbortController()
    try {
      const data = await apiPost(
        "/api/erp/mobile/field/material-receipts",
        {
          projectId: selectedProjectId,
          purchaseOrderId: selectedPoId,
          purchaseOrderLineId: selectedPoLineId,
          receivedQty: receiptQty,
          note: receiptNote,
        },
        {
          schema: materialReceiptResultSchema,
          signal: controller.signal,
        }
      )
      toast.success(`קליטת חומר נשמרה. תנועת מלאי: ${data.movementId.slice(0, 8)}`)
      setReceiptNote("")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "קליטת חומר נכשלה")
    } finally {
      setSubmittingReceipt(false)
      controller.abort()
    }
  }, [
    selectedProjectId,
    selectedPoId,
    selectedPoLineId,
    receiptQty,
    receiptNote,
  ])

  const submitException = React.useCallback(async () => {
    if (!selectedProjectId) return
    setSubmittingException(true)
    const controller = new AbortController()
    try {
      const data = await apiPost(
        "/api/erp/mobile/field/exceptions",
        {
          projectId: selectedProjectId,
          title: exceptionTitle,
          details: exceptionDetails,
          photoLabel: exceptionPhotoLabel,
        },
        {
          schema: exceptionResultSchema,
          signal: controller.signal,
        }
      )
      toast.success(`נוצרה הוראת שינוי טיוטה: ${data.changeOrderNumber}`)
      setExceptionTitle("")
      setExceptionDetails("")
      setExceptionPhotoLabel(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "דיווח חריגה נכשל")
    } finally {
      setSubmittingException(false)
      controller.abort()
    }
  }, [selectedProjectId, exceptionTitle, exceptionDetails, exceptionPhotoLabel])

  return (
    <div
      dir="rtl"
      className="mx-auto min-h-screen w-full max-w-[390px] space-y-3 bg-background px-3 py-3"
    >
      <header className="rounded-xl border border-slate-200 bg-card p-3 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Mobile Field Interface
        </p>
        <h1 className="text-base font-bold text-foreground">ניהול שטח יומי</h1>
        <p className="text-xs text-slate-600">
          דיווח עובדים, קליטת חומרים וחריגות שטח מתוך iPhone.
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-card p-3 shadow-sm">
        <Label className="mb-1 block text-xs font-semibold text-slate-700">פרויקט</Label>
        <Select
          value={selectedProjectId}
          onValueChange={(value) => setSelectedProjectId(value ?? "")}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder={loadingProjects ? "טוען..." : "בחרו פרויקט"} />
          </SelectTrigger>
          <SelectContent>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.projectNumber} · {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <section className="rounded-xl border border-slate-200 bg-card p-3 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <Users className="size-4 text-emerald-700" />
          <h2 className="text-sm font-semibold text-foreground">Work Log</h2>
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px] text-slate-600">תאריך</Label>
              <Input
                className="h-8 text-sm"
                type="date"
                value={workDate}
                onChange={(event) => setWorkDate(event.target.value)}
              />
            </div>
            <div>
              <Label className="text-[11px] text-slate-600">WBS Chapter</Label>
              <Input
                className="h-8 text-sm"
                value={wbsChapter}
                onChange={(event) => setWbsChapter(event.target.value)}
                placeholder="לדוגמה 03.02"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-[11px] text-slate-600">עובדים</Label>
              <Input
                className="h-8 text-sm"
                inputMode="numeric"
                value={workersCount}
                onChange={(event) => setWorkersCount(event.target.value)}
              />
            </div>
            <div>
              <Label className="text-[11px] text-slate-600">שעות ציוד</Label>
              <Input
                className="h-8 text-sm"
                inputMode="decimal"
                value={machineryHours}
                onChange={(event) => setMachineryHours(event.target.value)}
              />
            </div>
            <div>
              <Label className="text-[11px] text-slate-600">התקדמות %</Label>
              <Input
                className="h-8 text-sm"
                inputMode="decimal"
                value={progressPct}
                onChange={(event) => setProgressPct(event.target.value)}
              />
            </div>
          </div>
          <Input
            className="h-8 text-sm"
            value={workNote}
            onChange={(event) => setWorkNote(event.target.value)}
            placeholder="הערה (אופציונלי)"
          />
          <Button
            type="button"
            className="h-8 w-full"
            disabled={submittingWorkLog || !selectedProjectId || !wbsChapter.trim()}
            onClick={() => void submitWorkLog()}
          >
            {submittingWorkLog ? <Loader2 className="size-4 animate-spin" /> : null}
            שמירת דיווח יומי
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-card p-3 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <PackageCheck className="size-4 text-indigo-700" />
          <h2 className="text-sm font-semibold text-foreground">Material Receipt</h2>
        </div>
        <p className="mb-2 text-[11px] text-slate-600">
          Scan/Select PO וקליטה ישירה ל־`erp_inventory_movements`.
        </p>
        <div className="space-y-2">
          <Select value={selectedPoId} onValueChange={(value) => setSelectedPoId(value ?? "")}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue
                placeholder={loadingPurchaseOrders ? "טוען הזמנות..." : "בחרו הזמנת רכש"}
              />
            </SelectTrigger>
            <SelectContent>
              {purchaseOrders.map((po) => (
                <SelectItem key={po.id} value={po.id}>
                  {po.poNumber} · {po.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={selectedPoLineId}
            onValueChange={(value) => setSelectedPoLineId(value ?? "")}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="בחרו שורת רכש" />
            </SelectTrigger>
            <SelectContent>
              {(selectedPo?.lines ?? []).map((line) => (
                <SelectItem key={line.id} value={line.id}>
                  {(line.itemSku ?? "—")} · {line.description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="grid grid-cols-2 gap-2">
            <Input
              className="h-8 text-sm"
              inputMode="decimal"
              value={receiptQty}
              onChange={(event) => setReceiptQty(event.target.value)}
              placeholder="כמות"
            />
            <Input
              className="h-8 text-sm"
              value={receiptNote}
              onChange={(event) => setReceiptNote(event.target.value)}
              placeholder="הערה"
            />
          </div>
          {selectedPoLine ? (
            <p className="text-[11px] text-slate-600">
              שווי שורת מקור: {money.format(selectedPoLine.totalPrice)}
            </p>
          ) : null}
          <Button
            type="button"
            className="h-8 w-full"
            disabled={submittingReceipt || !selectedProjectId || !selectedPoId || !selectedPoLineId}
            onClick={() => void submitMaterialReceipt()}
          >
            {submittingReceipt ? <Loader2 className="size-4 animate-spin" /> : null}
            אישור קליטת חומר
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-card p-3 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <TriangleAlert className="size-4 text-amber-700" />
          <h2 className="text-sm font-semibold text-foreground">Field Exceptions</h2>
        </div>
        <p className="mb-2 text-[11px] text-slate-600">
          Camera-first flow ליצירת Draft Change Order.
        </p>
        <div className="space-y-2">
          <Input
            className="h-8 text-sm"
            value={exceptionTitle}
            onChange={(event) => setExceptionTitle(event.target.value)}
            placeholder="כותרת החריגה"
          />
          <Input
            className="h-8 text-sm"
            value={exceptionDetails}
            onChange={(event) => setExceptionDetails(event.target.value)}
            placeholder="תיאור מפורט"
          />

          <Label className="flex h-8 cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-200 bg-background text-xs font-medium text-slate-700 hover:bg-slate-100">
            <Camera className="size-4" />
            {exceptionPhotoLabel ? `תמונה: ${exceptionPhotoLabel}` : "צילום תקלה"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) =>
                setExceptionPhotoLabel(event.target.files?.[0]?.name ?? null)
              }
            />
          </Label>

          <Button
            type="button"
            className="h-8 w-full"
            disabled={
              submittingException ||
              !selectedProjectId ||
              exceptionTitle.trim().length < 2 ||
              exceptionDetails.trim().length < 3
            }
            onClick={() => void submitException()}
          >
            {submittingException ? <Loader2 className="size-4 animate-spin" /> : null}
            יצירת חריגה + Draft CO
          </Button>
        </div>
      </section>
    </div>
  )
}
