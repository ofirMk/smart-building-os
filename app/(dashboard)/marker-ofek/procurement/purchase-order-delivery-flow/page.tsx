"use client"

import * as React from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { Loader2, PackageCheck, Plus, Trash2, Truck } from "lucide-react"
import { toast } from "sonner"

import {
  DenseDetailPanel,
  DenseMasterPanel,
  ERP_DENSE_INPUT_CLASS,
  ERP_DENSE_LABEL_CLASS,
} from "@/components/layout/DenseMasterDetailTemplate"
import { EntityWorkspace } from "@/components/layout/EntityWorkspace"
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
  issuePurchaseOrderAction,
  receiveGoodsAction,
  saveDraftPurchaseOrderAction,
} from "@/lib/holden-erp/procurement-actions"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { cn, formatError } from "@/lib/utils"

type ProjectRow = { id: string; name: string }
type SupplierRow = { id: string; name: string }
type PartRow = {
  id: string
  part_number_supplier: string
  description_48_chars: string
}
type UomRow = { id: string; code: string; description_he: string | null }

type LineDraft = {
  key: string
  partId: string
  uomId: string
  quantity: string
  unitPrice: string
}

type PoLineLoaded = {
  id: string
  quantity: number
  label: string
}

function newLineKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `ln-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function parseQty(s: string): number {
  const n = Number(String(s).replace(",", ".").trim())
  return Number.isFinite(n) ? n : 0
}

const rowMotion = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, height: 0, marginBottom: 0 },
  transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const },
}

export default function PurchaseOrderDeliveryFlowPage() {
  const [projects, setProjects] = React.useState<ProjectRow[]>([])
  const [suppliers, setSuppliers] = React.useState<SupplierRow[]>([])
  const [uoms, setUoms] = React.useState<UomRow[]>([])
  const [partsBySupplier, setPartsBySupplier] = React.useState<PartRow[]>([])
  const [loadingBoot, setLoadingBoot] = React.useState(true)
  const [loadingParts, setLoadingParts] = React.useState(false)

  const [projectId, setProjectId] = React.useState("")
  const [masterSupplierId, setMasterSupplierId] = React.useState("")
  const [orderDate, setOrderDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [lines, setLines] = React.useState<LineDraft[]>([
    {
      key: newLineKey(),
      partId: "",
      uomId: "",
      quantity: "1",
      unitPrice: "0",
    },
  ])

  const [poId, setPoId] = React.useState<string | null>(null)
  const [poNumber, setPoNumber] = React.useState("")
  const [phase, setPhase] = React.useState<"draft" | "issued" | "received">("draft")

  const [savingPo, setSavingPo] = React.useState(false)
  const [issuing, setIssuing] = React.useState(false)

  const [polRows, setPolRows] = React.useState<PoLineLoaded[]>([])
  const [recvQty, setRecvQty] = React.useState<Record<string, string>>({})
  const [receiptDate, setReceiptDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [warehouseLocation, setWarehouseLocation] = React.useState("ראשי")
  const [receiving, setReceiving] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoadingBoot(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const [pr, sup, uom] = await Promise.all([
          supabase
            .from("projects")
            .select("id, name")
            .eq("is_deleted", false)
            .order("name", { ascending: true })
            .limit(500),
          supabase
            .from("suppliers")
            .select("id, name")
            .order("name", { ascending: true })
            .limit(500),
          supabase
            .from("units_of_measure")
            .select("id, code, description_he")
            .order("code", { ascending: true })
            .limit(200),
        ])
        if (pr.error) throw pr.error
        if (sup.error) throw sup.error
        if (uom.error) throw uom.error
        if (cancelled) return
        setProjects((pr.data ?? []) as ProjectRow[])
        setSuppliers((sup.data ?? []) as SupplierRow[])
        const uomRows = (uom.data ?? []) as UomRow[]
        setUoms(uomRows)
        const firstUom = uomRows[0]?.id ?? ""
        setLines((prev) =>
          prev.map((l) => ({ ...l, uomId: l.uomId || firstUom }))
        )
      } catch (e) {
        if (!cancelled) toast.error(formatError(e))
      } finally {
        if (!cancelled) setLoadingBoot(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (!masterSupplierId) {
      setPartsBySupplier([])
      return
    }
    let cancelled = false
    void (async () => {
      setLoadingParts(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error } = await supabase
          .from("supplier_parts")
          .select("id, part_number_supplier, description_48_chars")
          .eq("supplier_id", masterSupplierId)
          .order("part_number_supplier", { ascending: true })
          .limit(2000)
        if (error) throw error
        if (!cancelled) setPartsBySupplier((data ?? []) as PartRow[])
      } catch (e) {
        if (!cancelled) {
          toast.error(formatError(e))
          setPartsBySupplier([])
        }
      } finally {
        if (!cancelled) setLoadingParts(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [masterSupplierId])

  function addLine() {
    const defaultUom = uoms[0]?.id ?? ""
    setLines((prev) => [
      ...prev,
      {
        key: newLineKey(),
        partId: "",
        uomId: defaultUom,
        quantity: "1",
        unitPrice: "0",
      },
    ])
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)))
  }

  function patchLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l))
    )
  }

  async function handleSaveDraft() {
    if (!projectId) {
      toast.error("נא לבחור פרויקט")
      return
    }
    if (!masterSupplierId) {
      toast.error("נא לבחור ספק (מאסטר ספקים)")
      return
    }
    const payloadLines = lines
      .map((l) => ({
        partId: l.partId.trim(),
        uomId: l.uomId.trim(),
        quantity: parseQty(l.quantity),
        unitPrice: parseQty(l.unitPrice),
      }))
      .filter((l) => l.partId && l.uomId && l.quantity > 0)
    if (payloadLines.length === 0) {
      toast.error("הוסיפו לפחות שורה אחת עם מקט״י, יחידת מידה וכמות חיובית")
      return
    }

    setSavingPo(true)
    try {
      const res = await saveDraftPurchaseOrderAction({
        poId,
        projectId,
        masterSupplierId,
        orderDate,
        lines: payloadLines,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setPoId(res.id)
      setPoNumber(res.poNumber)
      toast.success(
        poId ? "טיוטת ההזמנה עודכנה" : "נוצרה הזמנת רכש (טיוטה)"
      )
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setSavingPo(false)
    }
  }

  async function handleIssue() {
    if (!poId) {
      toast.error("שמרו טיוטה לפני הנפקה")
      return
    }
    setIssuing(true)
    try {
      const res = await issuePurchaseOrderAction(poId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setPhase("issued")
      toast.success("ההזמנה הונפקה — ניתן לרשום תעודת משלוח (קבלה)")

      const supabase = createSupabaseBrowserClient()
      const { data, error } = await supabase
        .from("purchase_order_lines")
        .select(
          `
          id,
          quantity,
          supplier_parts (
            part_number_supplier,
            description_48_chars
          )
        `
        )
        .eq("order_id", poId)
      if (error) throw error
      type PolJoinRow = {
        id: string
        quantity: number
        supplier_parts:
          | { part_number_supplier: string | null; description_48_chars: string | null }
          | { part_number_supplier: string | null; description_48_chars: string | null }[]
          | null
      }
      const mapped: PoLineLoaded[] = (data ?? []).map((row: PolJoinRow) => {
        const r = row
        const sp = Array.isArray(r.supplier_parts)
          ? r.supplier_parts[0]
          : r.supplier_parts
        const label = [
          sp?.part_number_supplier?.trim(),
          sp?.description_48_chars?.trim(),
        ]
          .filter(Boolean)
          .join(" · ")
        return {
          id: r.id,
          quantity: Number(r.quantity) || 0,
          label: label || r.id.slice(0, 8),
        }
      })
      setPolRows(mapped)
      const nextRecv: Record<string, string> = {}
      for (const m of mapped) {
        nextRecv[m.id] = String(m.quantity)
      }
      setRecvQty(nextRecv)
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setIssuing(false)
    }
  }

  async function handleReceive() {
    if (!poId) return
    const linesIn = polRows
      .map((r) => ({
        purchaseOrderLineId: r.id,
        quantityReceived: parseQty(recvQty[r.id] ?? "0"),
      }))
      .filter((l) => l.quantityReceived > 0)
    if (linesIn.length === 0) {
      toast.error("הזינו כמות חיובית בלפחות שורה אחת")
      return
    }
    if (!warehouseLocation.trim()) {
      toast.error("נא לציין מיקום מחסן")
      return
    }

    setReceiving(true)
    try {
      const res = await receiveGoodsAction({
        poId,
        receiptDate,
        warehouseLocation: warehouseLocation.trim(),
        lines: linesIn,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setPhase("received")
      toast.success(
        res.duplicate
          ? "קבלה כבר הייתה רשומה (מפתח אידמפוטנטי) — לא נוצרה כפילות"
          : "נרשמה תעודת משלוח (קבלה במחסן)"
      )
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setReceiving(false)
    }
  }

  const defaultUom = uoms[0]?.id ?? ""

  const master = (
    <DenseMasterPanel className="border-slate-200 bg-card p-2.5">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200/90 pb-2">
        {(
          [
            { id: "draft" as const, label: "1 · טיוטה" },
            { id: "issued" as const, label: "2 · הנפקה" },
            { id: "received" as const, label: "3 · קבלה" },
          ] as const
        ).map((s) => (
          <span
            key={s.id}
            className={cn(
              "rounded border px-2 py-0.5 text-[11px] font-medium transition-colors",
              phase === s.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-slate-200 bg-slate-100 text-slate-600"
            )}
          >
            {s.label}
          </span>
        ))}
      </div>

      <div className="mt-2 grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className={cn("space-y-1 sm:col-span-2 lg:col-span-2")}>
          <Label htmlFor="project" className={ERP_DENSE_LABEL_CLASS}>
            פרויקט
          </Label>
          <Select
            value={projectId || undefined}
            onValueChange={(v) => setProjectId(v ?? "")}
            disabled={loadingBoot || phase !== "draft"}
          >
            <SelectTrigger id="project" size="sm" className={cn(ERP_DENSE_INPUT_CLASS, "w-full min-w-0")}>
              <SelectValue placeholder={loadingBoot ? "טוען…" : "בחרו פרויקט"} />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className={cn("space-y-1 sm:col-span-2 lg:col-span-2")}>
          <Label htmlFor="supplier" className={ERP_DENSE_LABEL_CLASS}>
            ספק (מאסטר)
          </Label>
          <Select
            value={masterSupplierId || undefined}
            onValueChange={(v) => {
              setMasterSupplierId(v ?? "")
              setLines((rows) => rows.map((l) => ({ ...l, partId: "" })))
            }}
            disabled={loadingBoot || phase !== "draft"}
          >
            <SelectTrigger id="supplier" size="sm" className={cn(ERP_DENSE_INPUT_CLASS, "w-full min-w-0")}>
              <SelectValue placeholder="בחרו ספק" />
            </SelectTrigger>
            <SelectContent>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="orderDate" className={ERP_DENSE_LABEL_CLASS}>
            תאריך הזמנה
          </Label>
          <Input
            id="orderDate"
            type="date"
            value={orderDate}
            onChange={(e) => setOrderDate(e.target.value)}
            disabled={phase !== "draft"}
            className={cn(ERP_DENSE_INPUT_CLASS, "font-mono")}
            dir="ltr"
          />
        </div>
        {poId ? (
          <div className="space-y-1 sm:col-span-2 lg:col-span-3">
            <Label className={ERP_DENSE_LABEL_CLASS}>מזהה הזמנה</Label>
            <p
              className={cn(
                ERP_DENSE_INPUT_CLASS,
                "flex items-center border border-dashed border-slate-300 bg-background font-mono"
              )}
              dir="ltr"
            >
              {poId}
              {poNumber ? ` · ${poNumber}` : ""}
            </p>
          </div>
        ) : null}
      </div>
    </DenseMasterPanel>
  )

  const detail = (
    <div className="flex min-h-0 w-full min-w-0 max-w-none flex-col gap-2 bg-transparent">
      <DenseDetailPanel className="border-slate-200 bg-card p-2">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/90 pb-2">
          <div className="flex min-w-0 items-center gap-2">
            <PackageCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <p className="text-xs font-semibold leading-tight">שורות הזמנה</p>
              <p className="text-[11px] text-muted-foreground">
                purchase_order_lines · part_id, uom_id, כמות, מחיר
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 px-2 text-xs"
            onClick={addLine}
            disabled={phase !== "draft" || !masterSupplierId}
          >
            <Plus className="size-3.5" aria-hidden />
            שורה
          </Button>
        </div>

        {!masterSupplierId ? (
          <p className="text-xs text-muted-foreground">בחרו ספק כדי לטעון מקט״י.</p>
        ) : loadingParts ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            טוען מקט״י…
          </div>
        ) : partsBySupplier.length === 0 ? (
          <p className="text-xs text-amber-800">
            אין מקט״י לספק זה — הוסיפו ב־supplier_parts או בחרו ספק אחר.
          </p>
        ) : null}

        <Table>
          <TableHeader>
            <TableRow className="border-slate-200 hover:bg-transparent">
              <TableHead className="h-8 py-1 text-[10px] font-semibold uppercase">
                מקט״י
              </TableHead>
              <TableHead className="h-8 w-28 py-1 text-[10px] font-semibold uppercase">
                יח״מ
              </TableHead>
              <TableHead className="h-8 w-24 py-1 text-[10px] font-semibold uppercase">
                כמות
              </TableHead>
              <TableHead className="h-8 w-28 py-1 text-[10px] font-semibold uppercase">
                מחיר יח׳
              </TableHead>
              <TableHead className="h-8 w-10 py-1 pe-0 text-[10px] font-semibold uppercase">
                {""}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence initial={false}>
              {lines.map((line, idx) => (
                <motion.tr
                  key={line.key}
                  layout
                  initial={rowMotion.initial}
                  animate={rowMotion.animate}
                  exit={rowMotion.exit}
                  transition={rowMotion.transition}
                  className="group border-b border-slate-200/90 transition-colors hover:bg-background"
                >
                  <TableCell className="py-1.5 align-middle">
                    <Select
                      value={line.partId || ""}
                      onValueChange={(v) => patchLine(line.key, { partId: v ?? "" })}
                      disabled={phase !== "draft" || !masterSupplierId || loadingParts}
                    >
                      <SelectTrigger
                        size="sm"
                        className={cn(ERP_DENSE_INPUT_CLASS, "h-8 w-full min-w-[12rem] max-w-[28rem]")}
                      >
                        <SelectValue placeholder="מקט״י" />
                      </SelectTrigger>
                      <SelectContent>
                        {partsBySupplier.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {(p.part_number_supplier || "—") +
                              " · " +
                              (p.description_48_chars || "").slice(0, 48)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="sr-only">שורה {idx + 1}</span>
                  </TableCell>
                  <TableCell className="py-1.5">
                    <Select
                      value={line.uomId || defaultUom || ""}
                      onValueChange={(v) => patchLine(line.key, { uomId: v ?? "" })}
                      disabled={phase !== "draft"}
                    >
                      <SelectTrigger size="sm" className={cn(ERP_DENSE_INPUT_CLASS, "h-8 w-full")}>
                        <SelectValue placeholder="יח׳" />
                      </SelectTrigger>
                      <SelectContent>
                        {uoms.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.code}
                            {u.description_he ? ` · ${u.description_he}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="py-1.5">
                    <Input
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(e) => patchLine(line.key, { quantity: e.target.value })}
                      disabled={phase !== "draft"}
                      className={cn(ERP_DENSE_INPUT_CLASS, "tabular-nums")}
                      dir="ltr"
                    />
                  </TableCell>
                  <TableCell className="py-1.5">
                    <Input
                      inputMode="decimal"
                      value={line.unitPrice}
                      onChange={(e) => patchLine(line.key, { unitPrice: e.target.value })}
                      disabled={phase !== "draft"}
                      className={cn(ERP_DENSE_INPUT_CLASS, "tabular-nums")}
                      dir="ltr"
                    />
                  </TableCell>
                  <TableCell className="py-1.5 pe-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-700"
                      onClick={() => removeLine(line.key)}
                      disabled={phase !== "draft" || lines.length <= 1}
                      aria-label="מחק שורה"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TableCell>
                </motion.tr>
              ))}
            </AnimatePresence>
          </TableBody>
        </Table>

        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-200/90 pt-2">
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1.5 px-3 text-xs"
            onClick={() => void handleSaveDraft()}
            disabled={savingPo || phase !== "draft" || loadingBoot}
          >
            {savingPo ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            שמירת טיוטה
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-8 px-3 text-xs"
            onClick={() => void handleIssue()}
            disabled={issuing || !poId || phase !== "draft" || savingPo}
          >
            {issuing ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            הנפקה
          </Button>
        </div>
      </DenseDetailPanel>

      {phase !== "draft" && polRows.length > 0 ? (
        <DenseDetailPanel className="mt-1 border-slate-200 bg-background p-2">
          <p className="mb-2 border-b border-slate-200/90 pb-1.5 text-xs font-semibold">
            תעודת משלוח — קבלה במחסן
          </p>
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="recDate" className={ERP_DENSE_LABEL_CLASS}>
                תאריך קבלה
              </Label>
              <Input
                id="recDate"
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                disabled={phase === "received"}
                className={cn(ERP_DENSE_INPUT_CLASS, "font-mono")}
                dir="ltr"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="whLoc" className={ERP_DENSE_LABEL_CLASS}>
                מיקום מחסן
              </Label>
              <Input
                id="whLoc"
                value={warehouseLocation}
                onChange={(e) => setWarehouseLocation(e.target.value)}
                disabled={phase === "received"}
                className={ERP_DENSE_INPUT_CLASS}
              />
            </div>
          </div>

          <div className="mt-2 overflow-x-auto rounded border border-slate-200/90">
            <table className="w-full min-w-[480px] border-collapse text-start text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/90">
                  <th className="px-2 py-1.5 font-semibold">פריט</th>
                  <th className="w-28 px-2 py-1.5 font-semibold">בהזמנה</th>
                  <th className="w-32 px-2 py-1.5 font-semibold">כמות לקבלה</th>
                </tr>
              </thead>
              <tbody>
                {polRows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-slate-100 transition-colors hover:bg-card"
                  >
                    <td className="px-2 py-1.5 align-top">
                      <span className="font-medium leading-snug">{r.label}</span>
                    </td>
                    <td className="px-2 py-1.5 align-top tabular-nums">
                      {r.quantity.toLocaleString("he-IL", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 3,
                      })}
                    </td>
                    <td className="px-2 py-1 align-top">
                      <Input
                        className={cn(ERP_DENSE_INPUT_CLASS, "tabular-nums")}
                        dir="ltr"
                        inputMode="decimal"
                        value={recvQty[r.id] ?? ""}
                        onChange={(e) =>
                          setRecvQty((prev) => ({
                            ...prev,
                            [r.id]: e.target.value,
                          }))
                        }
                        disabled={phase === "received"}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button
            type="button"
            size="sm"
            className="mt-2 h-8 gap-1.5"
            onClick={() => void handleReceive()}
            disabled={receiving || phase === "received" || polRows.length === 0}
          >
            {receiving ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            רישום תעודת משלוח
          </Button>
        </DenseDetailPanel>
      ) : null}

      {phase === "received" ? (
        <p className="text-center text-xs font-medium text-emerald-800">
          הזרימה הושלמה.{" "}
          <Link href="/marker-ofek/procurement" className="underline underline-offset-2 hover:text-emerald-950">
            חזרה לרכש
          </Link>
        </p>
      ) : null}
    </div>
  )

  return (
    <EntityWorkspace
      title="הזמנת רכש ותעודת משלוח"
      description="טיוטת PO עם שורות מקט״י, הנפקה, ורישום קבלה במחסן — צפיפות Priority / מסך מלא."
      className="w-full min-w-0 max-w-none gap-2 bg-card pb-6 pt-0"
      headerActions={
        <Link
          href="/marker-ofek/procurement"
          className="inline-flex h-8 items-center rounded-md border border-slate-300 px-3 text-xs font-medium transition-colors hover:bg-slate-100"
        >
          <Truck className="ms-1 size-3.5 text-primary" aria-hidden />
          חזרה לרכש
        </Link>
      }
      sidebar={master}
      main={detail}
    />
  )
}
