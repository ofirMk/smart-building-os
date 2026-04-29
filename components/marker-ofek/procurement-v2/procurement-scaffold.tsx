"use client"

import * as React from "react"
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"
import { useRouter } from "next/navigation"
import { Plus, RefreshCw, Save } from "lucide-react"
import { toast } from "sonner"

import { createProcurementPurchaseOrderAction } from "@/app/actions/procurement"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type {
  ProcurementBoqNodeOption,
  ProcurementInvoiceView,
  ProcurementLineView,
  ProcurementProjectOption,
  ProcurementReceiptView,
  ProcurementReconciliationView,
  ProcurementSupplierOption,
} from "@/lib/marker-ofek/procurement-data"
import { cn } from "@/lib/utils"

export type ProcurementStatus = "DRAFT" | "APPROVED" | "PARTIALLY_PAID" | "CLOSED"

export type ProcurementRow = {
  id: string
  supplierId?: string
  poNumber: string
  projectLabel: string
  boqRef: string
  supplierName: string
  status: ProcurementStatus
  totalAmount: number
}

type ProcurementScaffoldProps = {
  title: string
  subtitle: string
  rows: ProcurementRow[]
  projects: ProcurementProjectOption[]
  suppliers: ProcurementSupplierOption[]
  boqNodes: ProcurementBoqNodeOption[]
  lines: ProcurementLineView[]
  receipts: ProcurementReceiptView[]
  invoices: ProcurementInvoiceView[]
  reconciliations: ProcurementReconciliationView[]
  initialError?: string | null
}

type ProcurementCreateLineState = {
  id: string
  description: string
  requestedQuantity: string
  unitPrice: string
  boqNodeId: string
}

type ProcurementDraftState = {
  open: boolean
  poNumber: string
  projectId: string
  supplierId: string
  notes: string
  lines: ProcurementCreateLineState[]
}

type ProcurementDraftAction =
  | { type: "open" }
  | { type: "close" }
  | { type: "set-po-number"; value: string }
  | { type: "set-supplier"; value: string }
  | { type: "set-notes"; value: string }
  | { type: "set-project"; value: string; validBoqNodeIds: Set<string> }
  | { type: "add-line" }
  | { type: "remove-line"; lineId: string }
  | { type: "patch-line"; lineId: string; patch: Partial<ProcurementCreateLineState> }
  | { type: "reset" }

function createLine(): ProcurementCreateLineState {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `line-${Date.now()}-${Math.random().toString(16).slice(2)}`
  return { id, description: "", requestedQuantity: "1", unitPrice: "0", boqNodeId: "" }
}

function createInitialDraft(): ProcurementDraftState {
  return {
    open: false,
    poNumber: "",
    projectId: "",
    supplierId: "",
    notes: "",
    lines: [createLine()],
  }
}

function procurementDraftReducer(
  state: ProcurementDraftState,
  action: ProcurementDraftAction
): ProcurementDraftState {
  if (action.type === "open") return { ...state, open: true }
  if (action.type === "close") return { ...state, open: false }
  if (action.type === "set-po-number") return { ...state, poNumber: action.value }
  if (action.type === "set-supplier") return { ...state, supplierId: action.value }
  if (action.type === "set-notes") return { ...state, notes: action.value }
  if (action.type === "set-project") {
    return {
      ...state,
      projectId: action.value,
      lines: state.lines.map((line) => ({
        ...line,
        boqNodeId:
          line.boqNodeId && !action.validBoqNodeIds.has(line.boqNodeId) ? "" : line.boqNodeId,
      })),
    }
  }
  if (action.type === "add-line") {
    return { ...state, lines: [...state.lines, createLine()] }
  }
  if (action.type === "remove-line") {
    if (state.lines.length === 1) return state
    return { ...state, lines: state.lines.filter((line) => line.id !== action.lineId) }
  }
  if (action.type === "patch-line") {
    return {
      ...state,
      lines: state.lines.map((line) =>
        line.id === action.lineId ? { ...line, ...action.patch } : line
      ),
    }
  }
  return createInitialDraft()
}

export function ProcurementScaffold({
  title,
  subtitle,
  rows,
  projects,
  suppliers,
  boqNodes,
  lines,
  receipts,
  invoices,
  reconciliations,
  initialError = null,
}: ProcurementScaffoldProps) {
  const router = useRouter()
  const [selectedPoId, setSelectedPoId] = React.useState<string | null>(rows[0]?.id ?? null)
  const [pending, startTransition] = React.useTransition()
  const [draftState, dispatchDraft] = React.useReducer(
    procurementDraftReducer,
    undefined,
    createInitialDraft
  )

  const selectedPo = React.useMemo(
    () => (selectedPoId ? rows.find((row) => row.id === selectedPoId) ?? null : null),
    [rows, selectedPoId]
  )
  const selectedPoLines = React.useMemo(
    () => (selectedPo ? lines.filter((line) => line.poId === selectedPo.id) : []),
    [lines, selectedPo]
  )
  const selectedPoReceipts = React.useMemo(
    () => (selectedPo ? receipts.filter((receipt) => receipt.poId === selectedPo.id) : []),
    [receipts, selectedPo]
  )
  const selectedPoInvoices = React.useMemo(
    () => (selectedPo ? invoices.filter((invoice) => invoice.poId === selectedPo.id) : []),
    [invoices, selectedPo]
  )
  const selectedPoReconciliation = React.useMemo(
    () =>
      selectedPo ? reconciliations.find((row) => row.poId === selectedPo.id) ?? null : null,
    [reconciliations, selectedPo]
  )
  const boqOptionsForProject = React.useMemo(
    () =>
      boqNodes.filter((node) => !draftState.projectId || node.projectId === draftState.projectId),
    [boqNodes, draftState.projectId]
  )

  const approvedSpend = rows
    .filter((row) => row.status === "APPROVED")
    .reduce((sum, row) => sum + row.totalAmount, 0)
  const draftCount = rows.filter((row) => row.status === "DRAFT").length
  const partiallyPaidCount = rows.filter((row) => row.status === "PARTIALLY_PAID").length

  async function onCreatePurchaseOrder() {
    if (!draftState.projectId) {
      toast.error("יש לבחור פרויקט להזמנה")
      return
    }
    if (!draftState.supplierId) {
      toast.error("יש לבחור ספק להזמנה")
      return
    }

    startTransition(async () => {
      const result = await createProcurementPurchaseOrderAction({
        poNumber: draftState.poNumber.trim(),
        projectId: draftState.projectId,
        supplierId: draftState.supplierId,
        notes: draftState.notes.trim() || undefined,
        lines: draftState.lines.map((line) => ({
          description: line.description.trim(),
          requestedQuantity: Number(line.requestedQuantity || "0"),
          unitPrice: Number(line.unitPrice || "0"),
          boqNodeId: line.boqNodeId,
        })),
      })

      if (!result.ok) {
        toast.error(result.error)
        return
      }

      toast.success("הזמנת הרכש נוצרה בהצלחה")
      dispatchDraft({ type: "reset" })
      router.refresh()
    })
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden bg-background">
      <div dir="ltr" className="flex flex-1 min-h-0 overflow-hidden">
        <aside
          dir="rtl"
          className="flex w-80 min-h-0 flex-col overflow-hidden border-r border-border bg-card"
        >
          <div className="flex-none border-b border-border p-4">
            <p className="text-xs text-muted-foreground">שרשרת רכש</p>
            <h1 className="mt-1 text-lg font-semibold text-foreground">{title}</h1>
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            <KpiCard title="סה״כ הזמנות מאושרות" value={formatNis(approvedSpend)} />
            <KpiCard title="הזמנות בטיוטה" value={`${draftCount}`} />
            <KpiCard title="הזמנות בתשלום חלקי" value={`${partiallyPaidCount}`} />
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground">הפעלות ישירות</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button type="button" className="w-full justify-start gap-2" onClick={() => dispatchDraft({ type: "open" })}>
                  <Plus className="size-4" aria-hidden />
                  הזמנת רכש חדשה
                </Button>
                <Button type="button" variant="outline" className="w-full justify-start gap-2" onClick={() => router.refresh()}>
                  <RefreshCw className="size-4" aria-hidden />
                  רענון נתונים
                </Button>
              </CardContent>
            </Card>
          </div>
        </aside>

        <section dir="rtl" className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
          <div className="flex flex-none items-center gap-2 border-b border-border bg-card/95 px-3 py-2 backdrop-blur">
            <Button type="button" size="sm" className="gap-2" onClick={() => dispatchDraft({ type: "open" })}>
              <Plus className="size-4" aria-hidden />
              הזמנת רכש חדשה
            </Button>
            <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => router.refresh()}>
              <RefreshCw className="size-4" aria-hidden />
              רענון
            </Button>
            {initialError ? <p className="text-xs text-destructive">שגיאה: {initialError}</p> : null}
          </div>

          <div className="min-h-0 flex-1 overflow-hidden p-3">
            <PanelGroup direction="vertical" className="h-full min-h-0">
              <Panel defaultSize={52} minSize={34} className="min-h-0">
                <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
                  <div className="flex flex-none items-center justify-between border-b border-border px-4 py-3">
                    <p className="text-sm font-semibold text-foreground">הזמנות רכש</p>
                    <p className="text-xs text-muted-foreground">{rows.length} רשומות</p>
                  </div>
                  <div className="min-h-0 flex-1 overflow-hidden p-3">
                    <Tabs defaultValue="master" className="flex min-h-0 flex-1 flex-col overflow-hidden">
                      <TabsList variant="line" className="flex-none">
                        <TabsTrigger value="master">טבלת הזמנות</TabsTrigger>
                        <TabsTrigger value="summary">סיכום הזמנה נבחרת</TabsTrigger>
                      </TabsList>
                      <TabsContent value="master" className="mt-3 min-h-0 flex-1 overflow-y-auto">
                        <div className="rounded-lg border border-border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-start">PO</TableHead>
                                <TableHead className="text-start">פרויקט / BOQ</TableHead>
                                <TableHead className="text-start">ספק</TableHead>
                                <TableHead className="text-start">סטטוס</TableHead>
                                <TableHead className="text-start">סה״כ</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {rows.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">לא נמצאו הזמנות רכש</TableCell>
                                </TableRow>
                              ) : (
                                rows.map((row) => (
                                  <TableRow
                                    key={row.id}
                                    data-state={selectedPo?.id === row.id ? "selected" : undefined}
                                    className="cursor-pointer transition-colors hover:bg-muted/60"
                                    onClick={() => setSelectedPoId(row.id)}
                                  >
                                    <TableCell className="font-currency-mono text-xs">{row.poNumber}</TableCell>
                                    <TableCell className="max-w-[20rem] truncate">{row.projectLabel} · {row.boqRef}</TableCell>
                                    <TableCell>{row.supplierName}</TableCell>
                                    <TableCell>{statusLabelHe(row.status)}</TableCell>
                                    <TableCell className="font-currency-mono text-xs">{formatNis(row.totalAmount)}</TableCell>
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </TabsContent>
                      <TabsContent value="summary" className="mt-3 min-h-0 flex-1 overflow-y-auto">
                        <div className="grid gap-3 md:grid-cols-2">
                          <SummaryStat title="PO נבחר" value={selectedPo?.poNumber ?? "—"} />
                          <SummaryStat title="סטטוס" value={selectedPo ? statusLabelHe(selectedPo.status) : "—"} />
                          <SummaryStat title="ספק" value={selectedPo?.supplierName ?? "—"} />
                          <SummaryStat title="פרויקט / BOQ" value={selectedPo ? `${selectedPo.projectLabel} · ${selectedPo.boqRef}` : "—"} />
                          <SummaryStat title="סה״כ הזמנה" value={selectedPo ? formatNis(selectedPo.totalAmount) : "—"} />
                          <SummaryStat title="שורות מקושרות" value={`${selectedPoLines.length}`} />
                        </div>
                      </TabsContent>
                    </Tabs>
                  </div>
                </div>
              </Panel>

              <PanelResizeHandle className="my-2 h-2 rounded-md bg-border transition-colors hover:bg-primary/30" />

              <Panel minSize={28} className="min-h-0">
                <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
                  <div className="flex flex-none items-center justify-between border-b border-border px-4 py-3">
                    <h2 className="text-sm font-semibold text-foreground">פרטי הזמנה מקושרים</h2>
                    <p className="text-xs text-muted-foreground">{selectedPo ? `PO ${selectedPo.poNumber}` : "בחרו הזמנה להצגת פירוט"}</p>
                  </div>
                  <div className="min-h-0 flex-1 overflow-hidden p-3">
                    <Tabs defaultValue="lines" className="flex min-h-0 flex-1 flex-col overflow-hidden">
                      <TabsList variant="line" className="flex-none">
                        <TabsTrigger value="lines">שורות הזמנה</TabsTrigger>
                        <TabsTrigger value="receipts">קבלות סחורה</TabsTrigger>
                        <TabsTrigger value="invoices">חשבוניות ספק</TabsTrigger>
                        <TabsTrigger value="match">התאמות</TabsTrigger>
                      </TabsList>
                      <TabsContent value="lines" className="mt-3 min-h-0 flex-1 overflow-y-auto">
                        <SimpleTable emptyMessage="אין שורות להזמנה שנבחרה" colCount={6}>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-start">שורה</TableHead>
                              <TableHead className="text-start">תיאור</TableHead>
                              <TableHead className="text-start">כמות נדרשת</TableHead>
                              <TableHead className="text-start">כמות שהתקבלה</TableHead>
                              <TableHead className="text-start">מחיר יחידה</TableHead>
                              <TableHead className="text-start">סה״כ</TableHead>
                            </TableRow>
                          </TableHeader>
                          {selectedPoLines.map((line) => (
                            <TableRow key={line.id}>
                              <TableCell>{line.lineNo}</TableCell>
                              <TableCell className="max-w-[16rem] truncate">{line.description}</TableCell>
                              <TableCell>{line.requestedQuantity.toLocaleString("he-IL")}</TableCell>
                              <TableCell>{line.receivedQuantity.toLocaleString("he-IL")}</TableCell>
                              <TableCell>{formatNis(line.unitPrice)}</TableCell>
                              <TableCell>{formatNis(line.totalAmount)}</TableCell>
                            </TableRow>
                          ))}
                        </SimpleTable>
                      </TabsContent>
                      <TabsContent value="receipts" className="mt-3 min-h-0 flex-1 overflow-y-auto">
                        <SimpleTable emptyMessage="אין קבלות סחורה להזמנה שנבחרה" colCount={5}>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-start">מספר קבלה</TableHead>
                              <TableHead className="text-start">שורת PO</TableHead>
                              <TableHead className="text-start">כמות שהתקבלה</TableHead>
                              <TableHead className="text-start">תאריך קבלה</TableHead>
                              <TableHead className="text-start">הערת אתר</TableHead>
                            </TableRow>
                          </TableHeader>
                          {selectedPoReceipts.map((receipt) => (
                            <TableRow key={receipt.id}>
                              <TableCell>{receipt.receiptNumber}</TableCell>
                              <TableCell>{receipt.lineNo}</TableCell>
                              <TableCell>{receipt.receivedQuantity.toLocaleString("he-IL")}</TableCell>
                              <TableCell>{new Date(receipt.receivedAt).toLocaleDateString("he-IL")}</TableCell>
                              <TableCell className="max-w-[18rem] truncate">{receipt.siteNote || "—"}</TableCell>
                            </TableRow>
                          ))}
                        </SimpleTable>
                      </TabsContent>
                      <TabsContent value="invoices" className="mt-3 min-h-0 flex-1 overflow-y-auto">
                        <SimpleTable emptyMessage="אין חשבוניות ספק להזמנה שנבחרה" colCount={4}>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-start">מספר חשבונית</TableHead>
                              <TableHead className="text-start">תאריך חשבונית</TableHead>
                              <TableHead className="text-start">סטטוס</TableHead>
                              <TableHead className="text-start">סה״כ</TableHead>
                            </TableRow>
                          </TableHeader>
                          {selectedPoInvoices.map((invoice) => (
                            <TableRow key={invoice.id}>
                              <TableCell>{invoice.invoiceNumber}</TableCell>
                              <TableCell>{invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString("he-IL") : "—"}</TableCell>
                              <TableCell>{invoice.status}</TableCell>
                              <TableCell>{formatNis(invoice.totalAmount)}</TableCell>
                            </TableRow>
                          ))}
                        </SimpleTable>
                      </TabsContent>
                      <TabsContent value="match" className="mt-3 min-h-0 flex-1 overflow-y-auto">
                        <div className="grid gap-3 md:grid-cols-2">
                          <SummaryStat title="סכום נדרש (PO)" value={selectedPoReconciliation ? formatNis(selectedPoReconciliation.requestedAmount) : "—"} />
                          <SummaryStat title="סכום שהתקבל (GRN)" value={selectedPoReconciliation ? formatNis(selectedPoReconciliation.receivedAmount) : "—"} />
                          <SummaryStat title="סכום מחושב (חשבוניות)" value={selectedPoReconciliation ? formatNis(selectedPoReconciliation.invoicedAmount) : "—"} />
                          <SummaryStat
                            title="פער חשבונית מול קבלה"
                            value={selectedPoReconciliation ? formatNis(selectedPoReconciliation.deltaInvoiceVsReceived) : "—"}
                            valueClassName={
                              selectedPoReconciliation &&
                              Math.abs(selectedPoReconciliation.deltaInvoiceVsReceived) > 0.001
                                ? "text-destructive"
                                : "text-foreground"
                            }
                          />
                        </div>
                      </TabsContent>
                    </Tabs>
                  </div>
                </div>
              </Panel>
            </PanelGroup>
          </div>
        </section>
      </div>

      <Sheet open={draftState.open} onOpenChange={(open) => dispatchDraft({ type: open ? "open" : "close" })}>
        <SheetContent side="right" className="w-[min(46rem,100vw)] p-0">
          <SheetHeader className="border-b border-border/70">
            <SheetTitle>יצירת הזמנת רכש</SheetTitle>
            <SheetDescription>הזמנה חדשה מחייבת שיוך פרויקט ושיוך סעיפי BOQ מאותו פרויקט.</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 overflow-y-auto p-4">
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">כותרת הזמנה</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="po-number">מספר PO</Label>
                  <Input id="po-number" value={draftState.poNumber} onChange={(event) => dispatchDraft({ type: "set-po-number", value: event.target.value })} placeholder="PO-2026-001" />
                </div>
                <div className="space-y-1">
                  <Label>פרויקט</Label>
                  <Select
                    value={draftState.projectId}
                    onValueChange={(value) => {
                      const nextProjectId = value ?? ""
                      const validBoqNodeIds = new Set(
                        boqNodes
                          .filter((node) => !nextProjectId || node.projectId === nextProjectId)
                          .map((node) => node.id)
                      )
                      dispatchDraft({ type: "set-project", value: nextProjectId, validBoqNodeIds })
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="בחרו פרויקט" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.projectCode} · {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>ספק</Label>
                  <Select value={draftState.supplierId} onValueChange={(value) => dispatchDraft({ type: "set-supplier", value: value ?? "" })}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="בחרו ספק" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.id}>
                          {supplier.supplierCode} · {supplier.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="po-notes">הערות</Label>
                  <Input id="po-notes" value={draftState.notes} onChange={(event) => dispatchDraft({ type: "set-notes", value: event.target.value })} placeholder="הערה פנימית להזמנה (אופציונלי)" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">שורות הזמנה מקושרות ל-BOQ</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {draftState.lines.map((line, index) => (
                  <div key={line.id} className="grid gap-2 rounded-md border border-border/70 p-3 sm:grid-cols-[2fr_1fr_1fr_2fr_auto]">
                    <div className="space-y-1">
                      <Label htmlFor={`line-desc-${line.id}`}>תיאור</Label>
                      <Input id={`line-desc-${line.id}`} value={line.description} onChange={(event) => dispatchDraft({ type: "patch-line", lineId: line.id, patch: { description: event.target.value } })} placeholder={`שורה ${index + 1}`} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`line-qty-${line.id}`}>כמות</Label>
                      <Input id={`line-qty-${line.id}`} value={line.requestedQuantity} type="number" min="0" step="0.001" onChange={(event) => dispatchDraft({ type: "patch-line", lineId: line.id, patch: { requestedQuantity: event.target.value } })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`line-price-${line.id}`}>מחיר יחידה</Label>
                      <Input id={`line-price-${line.id}`} value={line.unitPrice} type="number" min="0" step="0.01" onChange={(event) => dispatchDraft({ type: "patch-line", lineId: line.id, patch: { unitPrice: event.target.value } })} />
                    </div>
                    <div className="space-y-1">
                      <Label>שיוך BOQ</Label>
                      <Select value={line.boqNodeId} onValueChange={(value) => dispatchDraft({ type: "patch-line", lineId: line.id, patch: { boqNodeId: value ?? "" } })}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="בחרו סעיף BOQ" />
                        </SelectTrigger>
                        <SelectContent>
                          {boqOptionsForProject.map((node) => (
                            <SelectItem key={node.id} value={node.id}>
                              v{node.versionNumber} · {node.structureCode} · {node.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      <Button type="button" variant="outline" size="sm" onClick={() => dispatchDraft({ type: "remove-line", lineId: line.id })} disabled={pending}>
                        מחק
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <Button type="button" variant="outline" size="sm" onClick={() => dispatchDraft({ type: "add-line" })} disabled={pending}>
                    הוסף שורה
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={() => dispatchDraft({ type: "close" })} disabled={pending}>
                      ביטול
                    </Button>
                    <Button type="button" onClick={() => void onCreatePurchaseOrder()} disabled={pending}>
                      <Save className="size-4" aria-hidden />
                      יצירת PO
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function statusLabelHe(status: ProcurementStatus): string {
  if (status === "DRAFT") return "טיוטה"
  if (status === "APPROVED") return "מאושר"
  if (status === "PARTIALLY_PAID") return "שולם חלקי"
  return "סגור"
}

function formatNis(value: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value)
}

function KpiCard({
  title,
  value,
  valueClassName,
}: {
  title: string
  value: string
  valueClassName?: string
}) {
  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={cn("font-currency-mono text-sm font-semibold text-foreground", valueClassName)}>
          {value}
        </p>
      </CardContent>
    </Card>
  )
}

function SummaryStat({
  title,
  value,
  valueClassName,
}: {
  title: string
  value: string
  valueClassName?: string
}) {
  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={cn("text-sm font-semibold text-foreground", valueClassName)}>{value}</p>
      </CardContent>
    </Card>
  )
}

function SimpleTable({
  children,
  emptyMessage,
  colCount,
}: {
  children: React.ReactNode
  emptyMessage: string
  colCount: number
}) {
  const rows = React.Children.toArray(children).filter((child) => {
    if (!React.isValidElement(child)) return false
    return child.type !== TableHeader
  })

  const header = React.Children.toArray(children).find((child) => {
    if (!React.isValidElement(child)) return false
    return child.type === TableHeader
  })

  return (
    <div className="rounded-lg border border-border">
      <Table>
        {header}
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colCount} className="text-center text-sm text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            rows
          )}
        </TableBody>
      </Table>
    </div>
  )
}
