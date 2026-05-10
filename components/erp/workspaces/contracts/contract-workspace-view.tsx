"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { CheckCircle2, FileDown, GitBranch, Link2, Loader2, Mail, MoreHorizontal, Plus, RefreshCcw, Save, Trash2 } from "lucide-react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import {
  DenseMasterDetailTemplate,
  ERP_DENSE_INPUT_CLASS,
  ERP_DENSE_LABEL_CLASS,
} from "@/components/layout/DenseMasterDetailTemplate"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_TRANSITIONS,
  canTransitionContractStatus,
} from "@/lib/erp/contracts-workflow"
import { COMPANY_COOKIE_KEY, type CompanyContextId, resolveCompanyContext } from "@/lib/company-context"
import { cn } from "@/lib/utils"
import type { CreateContractLineInput, ErpContract, ErpContractLine, ErpContractStatus } from "@/types/erp"
import { buildContractReportPdfBlob, contractReportFilename } from "./contract-report-pdf"

type ApiResponse<T> = { data: T; error?: string }
type SupplierContact = { id: string; name: string; email: string | null; isPrimary: boolean }
type ItemLookup = {
  id: string
  itemNumber: string
  description: string
}
type EffectivePriceResult = {
  unitPrice: number
  source: "BLANKET_ORDER" | "PRICE_LIST" | "FALLBACK"
  isAgreedPrice: boolean
  warningCode: string | null
  warningMessage: string | null
}

const headerSchema = z
  .object({
    title: z.string().trim().min(2, "כותרת קצרה מדי"),
    paymentTermsOverride: z.string().trim().max(250).optional(),
    startDate: z.string().trim().optional(),
    endDate: z.string().trim().optional(),
  })
  .refine(
    (values) => {
      if (!values.startDate || !values.endDate) return true
      return new Date(values.startDate).getTime() <= new Date(values.endDate).getTime()
    },
    { message: "תאריך סיום חייב להיות אחרי תאריך התחלה", path: ["endDate"] }
  )

const lineSchema = z.object({
  boqLineId: z.string().trim().optional(),
  itemId: z.string().trim().optional(),
  description: z.string().trim().min(2, "תיאור שורה חובה"),
  quantity: z.number().min(0, "כמות חייבת להיות חיובית או אפס"),
  unitPrice: z.number().min(0, "מחיר יחידה חייב להיות חיובי או אפס"),
})

const emailDraftSchema = z.object({
  to: z.string().trim().email("כתובת אימייל לא תקינה"),
  subject: z.string().trim().min(2, "נושא חובה"),
  message: z.string().trim().min(4, "תוכן הודעה קצר מדי"),
})
const contractDataSchema = z.object({
  id: z.string().uuid(),
  supplierId: z.string().uuid(),
  contractNumber: z.string(),
  title: z.string(),
  status: z.enum(["DRAFT", "PENDING_APPROVAL", "ACTIVE", "CLOSED"]),
  paymentTermsOverride: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  totalAmount: z.coerce.number(),
})
const contractLinesDataSchema = z.array(
  z.object({
    id: z.string().uuid(),
    description: z.string(),
    quantity: z.coerce.number(),
    unitPrice: z.coerce.number(),
    totalPrice: z.coerce.number(),
    boqLineId: z.string().nullable().optional(),
    itemId: z.string().nullable().optional(),
  })
)
const itemLookupDataSchema = z.array(
  z.object({
    id: z.string().uuid(),
    itemNumber: z.string(),
    description: z.string(),
  })
)

type HeaderForm = z.infer<typeof headerSchema>
type LineForm = z.infer<typeof lineSchema>
type EmailDraftForm = z.infer<typeof emailDraftSchema>
type WorkflowEvent = {
  id: string
  fromStatus: ErpContractStatus | null
  toStatus: ErpContractStatus
  changedAt: string
}
type WorkflowResponse = {
  currentStatus: ErpContractStatus
  allowedDestinations: ErpContractStatus[]
  actorRole: string | null
  trail: {
    id: string
    from_status: ErpContractStatus | null
    to_status: ErpContractStatus
    changed_at: string
  }[]
}

function getActiveCompanyIdFromCookie(): CompanyContextId | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${COMPANY_COOKIE_KEY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`)
  )
  return resolveCompanyContext(match?.[1]?.trim())
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const activeCompanyId = getActiveCompanyIdFromCookie()
  const headers = new Headers(init?.headers ?? {})
  headers.set("content-type", "application/json")
  if (activeCompanyId) {
    headers.set("x-company-id", activeCompanyId)
    headers.set("x-active-company-id", activeCompanyId)
  }
  const response = await fetch(input, { ...init, headers, credentials: "same-origin", cache: "no-store" })
  const payload = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) throw new Error(payload.error ?? "API request failed")
  return payload as T
}

function statusClass(status: ErpContractStatus) {
  if (status === "ACTIVE") return "border-emerald-200 bg-emerald-50 text-emerald-800"
  if (status === "PENDING_APPROVAL") return "border-blue-200 bg-blue-50 text-blue-800"
  if (status === "CLOSED") return "border-slate-300 bg-slate-100 text-slate-700"
  return "border-amber-200 bg-amber-50 text-amber-800"
}

function money(value: number) {
  return Number(value).toLocaleString("he-IL", { style: "currency", currency: "ILS" })
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  let binary = ""
  const bytes = new Uint8Array(buffer)
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function ContractWorkspaceClient({ contractId }: { contractId: string }) {
  const [loading, setLoading] = React.useState(true)
  const [savingHeader, setSavingHeader] = React.useState(false)
  const [savingLine, setSavingLine] = React.useState(false)
  const [sendingEmail, setSendingEmail] = React.useState(false)
  const [generatingPdf, setGeneratingPdf] = React.useState(false)
  const [deletingLineId, setDeletingLineId] = React.useState<string | null>(null)
  const [contract, setContract] = React.useState<ErpContract | null>(null)
  const [lines, setLines] = React.useState<ErpContractLine[]>([])
  const [primaryContactEmail, setPrimaryContactEmail] = React.useState("")
  const [emailDialogOpen, setEmailDialogOpen] = React.useState(false)
  const [allowedDestinations, setAllowedDestinations] = React.useState<ErpContractStatus[]>([])
  const [workflowTrail, setWorkflowTrail] = React.useState<WorkflowEvent[]>([])
  const [actorRole, setActorRole] = React.useState<string | null>(null)
  const [transitioningTo, setTransitioningTo] = React.useState<ErpContractStatus | null>(null)
  const [items, setItems] = React.useState<ItemLookup[]>([])
  const [linePriceMeta, setLinePriceMeta] = React.useState<EffectivePriceResult | null>(null)
  const lastLinePriceWarningRef = React.useRef<string | null>(null)

  const headerForm = useForm<HeaderForm>({
    resolver: zodResolver(headerSchema),
    defaultValues: { title: "", paymentTermsOverride: "", startDate: "", endDate: "" },
  })
  const lineForm = useForm<LineForm>({
    resolver: zodResolver(lineSchema),
    defaultValues: { boqLineId: "", itemId: undefined, description: "", quantity: 1, unitPrice: 0 },
  })
  const emailForm = useForm<EmailDraftForm>({
    resolver: zodResolver(emailDraftSchema),
    defaultValues: { to: "", subject: "", message: "" },
  })

  const loadAll = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      const [contractRes, linesRes, itemsRes] = await Promise.all([
        requestJson<ApiResponse<unknown>>(`/api/erp/contracts/${contractId}`, { signal }),
        requestJson<ApiResponse<unknown>>(`/api/erp/contracts/${contractId}/lines`, { signal }),
        requestJson<ApiResponse<unknown>>("/api/erp/master-data/items", { signal }),
      ])
      if (signal?.aborted) return
      const parsedContract = contractDataSchema.safeParse(contractRes.data)
      const parsedLines = contractLinesDataSchema.safeParse(linesRes.data)
      const parsedItems = itemLookupDataSchema.safeParse(itemsRes.data)
      if (!parsedContract.success || !parsedLines.success || !parsedItems.success) {
        throw new Error("Contract detail payload validation failed")
      }
      setContract(parsedContract.data as ErpContract)
      setLines(parsedLines.data as ErpContractLine[])
      setItems(parsedItems.data as ItemLookup[])
      const workflowRes = await requestJson<ApiResponse<WorkflowResponse>>(
        `/api/erp/contracts/${contractId}/workflow`,
        { signal }
      ).catch(() => ({
        data: {
          currentStatus: parsedContract.data.status,
          allowedDestinations: [...CONTRACT_STATUS_TRANSITIONS[parsedContract.data.status]],
          actorRole: null,
          trail: [],
        },
      }))
      headerForm.reset({
        title: parsedContract.data.title,
        paymentTermsOverride: parsedContract.data.paymentTermsOverride ?? "",
        startDate: parsedContract.data.startDate ?? "",
        endDate: parsedContract.data.endDate ?? "",
      })
      setAllowedDestinations([...(workflowRes.data.allowedDestinations ?? [])])
      setActorRole(workflowRes.data.actorRole ?? null)
      setWorkflowTrail(
        (workflowRes.data.trail ?? []).map((item) => ({
          id: item.id,
          fromStatus: item.from_status,
          toStatus: item.to_status,
          changedAt: item.changed_at,
        }))
      )

      const contactsRes = await requestJson<ApiResponse<SupplierContact[]>>(
        `/api/erp/master-data/suppliers/${parsedContract.data.supplierId}/contacts`,
        { signal }
      ).catch(() => ({ data: [] as SupplierContact[] }))
      const primary =
        contactsRes.data.find((contact) => contact.isPrimary && contact.email) ??
        contactsRes.data.find((contact) => Boolean(contact.email))
      const contactEmail = primary?.email ?? ""
      setPrimaryContactEmail(contactEmail)
      emailForm.reset({
        to: contactEmail,
        subject: `Contract ${parsedContract.data.contractNumber} - ${parsedContract.data.title}`,
        message: "Hello,\n\nPlease find attached the latest contract report.\n\nRegards,\nSmart Building OS",
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "טעינת חוזה נכשלה")
      setContract(null)
      setLines([])
      setPrimaryContactEmail("")
      setAllowedDestinations([])
      setWorkflowTrail([])
      setActorRole(null)
    } finally {
      setLoading(false)
    }
  }, [contractId, emailForm, headerForm])

  React.useEffect(() => {
    const controller = new AbortController()
    setContract(null)
    setLines([])
    setItems([])
    setWorkflowTrail([])
    setAllowedDestinations([])
    void loadAll(controller.signal)
    return () => controller.abort()
  }, [loadAll])

  async function saveHeader(values: HeaderForm) {
    if (!contract) return
    setSavingHeader(true)
    try {
      await requestJson(`/api/erp/contracts/${contract.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: values.title,
          paymentTermsOverride: values.paymentTermsOverride || null,
          startDate: values.startDate || null,
          endDate: values.endDate || null,
        }),
      })
      toast.success("פרטי חוזה נשמרו")
      await loadAll()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שמירה נכשלה")
    } finally {
      setSavingHeader(false)
    }
  }

  async function transitionStatus(nextStatus: ErpContractStatus) {
    if (!contract) return
    const guard = canTransitionContractStatus({
      from: contract.status,
      to: nextStatus,
      actorRole:
        actorRole === "admin" ||
        actorRole === "manager" ||
        actorRole === "property_manager" ||
        actorRole === "tenant" ||
        actorRole === "contractor"
          ? actorRole
          : null,
    })
    if (!guard.ok) {
      toast.error(guard.reason)
      return
    }
    setTransitioningTo(nextStatus)
    try {
      await requestJson(`/api/erp/contracts/${contract.id}`, {
        method: "PUT",
        headers: actorRole ? { "x-user-role": actorRole } : undefined,
        body: JSON.stringify({ status: nextStatus }),
      })
      toast.success(`הסטטוס עודכן ל-${CONTRACT_STATUS_LABELS[nextStatus]}`)
      await loadAll()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שינוי סטטוס נכשל")
    } finally {
      setTransitioningTo(null)
    }
  }

  async function addLine(values: LineForm) {
    if (!contract) return
    setSavingLine(true)
    try {
      const payload: CreateContractLineInput = {
        boqLineId: values.boqLineId || null,
        itemId: values.itemId || null,
        description: values.description,
        quantity: values.quantity,
        unitPrice: values.unitPrice,
      }
      await requestJson(`/api/erp/contracts/${contract.id}/lines`, {
        method: "POST",
        body: JSON.stringify(payload),
      })
      toast.success("שורת חוזה נוספה")
      lineForm.reset({
        boqLineId: "",
        itemId: undefined,
        description: "",
        quantity: 1,
        unitPrice: values.unitPrice,
      })
      setLinePriceMeta(null)
      await loadAll()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "הוספת שורה נכשלה")
    } finally {
      setSavingLine(false)
    }
  }

  async function deleteLine(lineId: string) {
    if (!contract) return
    setDeletingLineId(lineId)
    try {
      await requestJson(`/api/erp/contracts/${contract.id}/lines/${lineId}`, { method: "DELETE" })
      toast.success("שורה נמחקה")
      await loadAll()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "מחיקה נכשלה")
    } finally {
      setDeletingLineId(null)
    }
  }

  async function exportContractPdf() {
    if (!contract) return
    setGeneratingPdf(true)
    try {
      const blob = await buildContractReportPdfBlob({ contract, lines })
      const href = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = href
      link.download = contractReportFilename(contract)
      link.click()
      URL.revokeObjectURL(href)
      toast.success("דוח PDF נוצר")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "יצוא PDF נכשל")
    } finally {
      setGeneratingPdf(false)
    }
  }

  function openEmailDraft() {
    if (!contract) return
    emailForm.reset({
      to: primaryContactEmail,
      subject: `Contract ${contract.contractNumber} - ${contract.title}`,
      message: "Hello,\n\nPlease find attached the latest contract report.\n\nRegards,\nSmart Building OS",
    })
    setEmailDialogOpen(true)
  }

  async function sendEmailDraft(values: EmailDraftForm) {
    if (!contract) return
    setSendingEmail(true)
    try {
      const pdfBlob = await buildContractReportPdfBlob({ contract, lines })
      const pdfBase64 = await blobToBase64(pdfBlob)
      await requestJson(`/api/erp/contracts/${contract.id}/report-email`, {
        method: "POST",
        body: JSON.stringify({
          to: values.to,
          subject: values.subject,
          message: values.message,
          fileName: contractReportFilename(contract),
          pdfBase64,
        }),
      })
      toast.success("המייל נשלח עם קובץ מצורף")
      setEmailDialogOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שליחת המייל נכשלה")
    } finally {
      setSendingEmail(false)
    }
  }

  const watchedLineItemId = lineForm.watch("itemId")
  const watchedLineQuantity = lineForm.watch("quantity")

  React.useEffect(() => {
    if (!contract || !watchedLineItemId) {
      setLinePriceMeta(null)
      return
    }

    const selectedItem = items.find((item) => item.id === watchedLineItemId) ?? null
    if (selectedItem && !lineForm.getValues("description")?.trim()) {
      lineForm.setValue("description", selectedItem.description ?? "", { shouldValidate: true })
    }

    const quantity = Number(watchedLineQuantity ?? 0)
    if (!Number.isFinite(quantity) || quantity < 0) return

    const timeoutId = window.setTimeout(() => {
      void requestJson<ApiResponse<EffectivePriceResult>>("/api/erp/pricing/effective-price", {
        method: "POST",
        body: JSON.stringify({
          itemId: watchedLineItemId,
          supplierId: contract.supplierId,
          quantity,
          date: contract.startDate ?? new Date().toISOString().slice(0, 10),
        }),
      })
        .then((result) => {
          const price = result.data
          if (!price) return
          lineForm.setValue("unitPrice", Number(price.unitPrice ?? 0), {
            shouldDirty: true,
            shouldValidate: true,
          })
          setLinePriceMeta(price)
          if (price.warningCode && price.warningMessage) {
            const warningKey = `${price.warningCode}:${watchedLineItemId}:${quantity}`
            if (lastLinePriceWarningRef.current !== warningKey) {
              toast(price.warningMessage)
              lastLinePriceWarningRef.current = warningKey
            }
          }
        })
        .catch(() => undefined)
    }, 280)

    return () => window.clearTimeout(timeoutId)
  }, [contract, items, lineForm, watchedLineItemId, watchedLineQuantity])

  return (
    <div dir="rtl" className="flex-1 min-h-0 overflow-y-auto bg-[#F8FAFC]">
      <DenseMasterDetailTemplate
        title={contract ? `${contract.contractNumber} · ${contract.title}` : "Contract Workspace"}
        description="מסך עבודה ארגוני לניהול חוזה, שורות חוזה, דוח PDF ושליחה במייל."
        backLink={{ href: "/contracts", label: "חזרה לרשימת חוזים" }}
        className="bg-[#F8FAFC]"
        headerActions={
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={() => void loadAll()}>
              <RefreshCcw className="ms-1 size-3.5" />
              רענון
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button size="sm" variant="outline" className="gap-1.5" />}>
                <MoreHorizontal className="size-3.5" />
                פעולות
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => void exportContractPdf()} disabled={!contract || generatingPdf}>
                  <FileDown className="size-4" />
                  Export to PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={openEmailDraft} disabled={!contract}>
                  <Mail className="size-4" />
                  Send via Email
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
        master={
          loading || !contract ? (
            <div className="text-sm text-slate-500">{loading ? "טוען חוזה..." : "החוזה לא נמצא"}</div>
          ) : (
            <Form {...headerForm}>
              <form onSubmit={headerForm.handleSubmit(saveHeader)} className="grid grid-cols-1 gap-3 md:grid-cols-5">
                <div className="rounded-2xl border border-slate-200 bg-card px-2 py-1 text-xs">
                  <p className="text-[11px] text-slate-500">מספר חוזה</p>
                  <p className="font-mono">{contract.contractNumber}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-card px-2 py-1 text-xs">
                  <p className="text-[11px] text-slate-500">סטטוס</p>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="ghost" size="sm" className="mt-1 h-7 rounded-md px-2 data-[popup-open=true]:bg-slate-100" />
                      }
                    >
                      <Badge variant="outline" className={cn("rounded-md text-[10px]", statusClass(contract.status))}>
                        {CONTRACT_STATUS_LABELS[contract.status]}
                      </Badge>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="min-w-48">
                      {(allowedDestinations.length === 0 ? CONTRACT_STATUS_TRANSITIONS[contract.status] : allowedDestinations).map(
                        (nextStatus) => (
                          <DropdownMenuItem
                            key={nextStatus}
                            disabled={transitioningTo !== null}
                            onClick={() => void transitionStatus(nextStatus)}
                          >
                            {transitioningTo === nextStatus ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="size-4 text-emerald-600" />
                            )}
                            מעבר ל-{CONTRACT_STATUS_LABELS[nextStatus]}
                          </DropdownMenuItem>
                        )
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-card px-2 py-1 text-xs">
                  <p className="text-[11px] text-slate-500">סה&quot;כ</p>
                  <p className="font-mono">{money(contract.totalAmount)}</p>
                </div>
                <FormField
                  control={headerForm.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel className={ERP_DENSE_LABEL_CLASS}>כותרת חוזה</FormLabel>
                      <FormControl>
                        <Input {...field} className={ERP_DENSE_INPUT_CLASS} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={headerForm.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={ERP_DENSE_LABEL_CLASS}>תאריך התחלה</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" className={ERP_DENSE_INPUT_CLASS} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={headerForm.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={ERP_DENSE_LABEL_CLASS}>תאריך סיום</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" className={ERP_DENSE_INPUT_CLASS} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={headerForm.control}
                  name="paymentTermsOverride"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={ERP_DENSE_LABEL_CLASS}>תנאי תשלום Override</FormLabel>
                      <FormControl>
                        <Input {...field} className={ERP_DENSE_INPUT_CLASS} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="md:col-span-5 flex justify-end">
                  <Button type="submit" size="sm" className="gap-1.5" disabled={savingHeader}>
                    {savingHeader ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    שמירה
                  </Button>
                </div>
                <div className="md:col-span-5 rounded-2xl border border-slate-200 bg-card px-3 py-2">
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] text-slate-600">
                    <GitBranch className="size-3.5" />
                    מסלול Workflow
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {workflowTrail.length === 0 ? (
                      <span className="text-xs text-slate-500">אין אירועים להצגה</span>
                    ) : (
                      workflowTrail.map((event, index) => (
                        <React.Fragment key={event.id}>
                          <Badge variant="outline" className={cn("rounded-md text-[10px]", statusClass(event.toStatus))}>
                            {CONTRACT_STATUS_LABELS[event.toStatus]}
                          </Badge>
                          <span className="text-[10px] text-slate-500">
                            {new Date(event.changedAt).toLocaleString("he-IL")}
                          </span>
                          {index < workflowTrail.length - 1 ? <span className="text-slate-400">→</span> : null}
                        </React.Fragment>
                      ))
                    )}
                  </div>
                </div>
              </form>
            </Form>
          )
        }
        detail={
          <Tabs defaultValue="lines" className="space-y-2">
            <div className="flex items-center justify-between">
              <TabsList className="h-9 rounded-xl bg-card shadow-sm" variant="line">
                <TabsTrigger value="lines">שורות חוזה</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="lines" className="space-y-2">
              <Form {...lineForm}>
                <form
                  className="grid gap-2 rounded-2xl border border-slate-200 bg-card p-2 lg:grid-cols-[1fr_1fr_2fr_120px_150px_auto]"
                  onSubmit={lineForm.handleSubmit(addLine)}
                >
                  <FormField control={lineForm.control} name="boqLineId" render={({ field }) => (
                    <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>BOQ Reference</FormLabel><FormControl><Input {...field} className={ERP_DENSE_INPUT_CLASS} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={lineForm.control} name="itemId" render={({ field }) => (
                    <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>Item Reference</FormLabel><Select value={field.value || undefined} onValueChange={field.onChange}><FormControl><SelectTrigger className={ERP_DENSE_INPUT_CLASS}><SelectValue placeholder="בחר פריט" /></SelectTrigger></FormControl><SelectContent>{items.map((item) => <SelectItem key={item.id} value={item.id}>{item.itemNumber} · {item.description}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                  )} />
                  <FormField control={lineForm.control} name="description" render={({ field }) => (
                    <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>Description</FormLabel><FormControl><Input {...field} className={ERP_DENSE_INPUT_CLASS} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={lineForm.control} name="quantity" render={({ field }) => (
                    <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>Quantity</FormLabel><FormControl><Input type="number" step="0.001" value={field.value} className={ERP_DENSE_INPUT_CLASS} onChange={(event) => field.onChange(event.target.value === "" ? 0 : Number(event.target.value))} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={lineForm.control} name="unitPrice" render={({ field }) => (
                    <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>Unit Price</FormLabel><FormControl><div className="flex items-center gap-1"><Input type="number" step="0.01" value={field.value} className={ERP_DENSE_INPUT_CLASS} onChange={(event) => field.onChange(event.target.value === "" ? 0 : Number(event.target.value))} />{linePriceMeta?.isAgreedPrice ? <span title={linePriceMeta.source === "BLANKET_ORDER" ? "Agreed price from blanket order" : "Agreed price from vendor price list"} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700"><Link2 className="size-3.5" /></span> : null}</div></FormControl><FormMessage /></FormItem>
                  )} />
                  <div className="flex items-end">
                    <Button type="submit" size="sm" className="gap-1.5" disabled={savingLine || !contract}>
                      {savingLine ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                      הוספת שורה
                    </Button>
                  </div>
                </form>
              </Form>

              <div className="max-h-[62vh] overflow-auto rounded-2xl border border-slate-200 bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="sticky top-0 z-10 bg-card">
                      <TableHead className="text-right">BOQ Reference</TableHead>
                      <TableHead className="text-right">Item Reference</TableHead>
                      <TableHead className="text-right">Description</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Total Price</TableHead>
                      <TableHead className="text-right">פעולות</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center text-sm text-slate-500">
                          טוען שורות...
                        </TableCell>
                      </TableRow>
                    ) : lines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center text-sm text-slate-500">
                          אין שורות חוזה
                        </TableCell>
                      </TableRow>
                    ) : (
                      lines.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell className="font-mono text-xs">{line.boqLineId ?? "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{line.itemId ?? "—"}</TableCell>
                          <TableCell>{line.description}</TableCell>
                          <TableCell className="font-mono text-xs">{Number(line.quantity).toLocaleString("he-IL")}</TableCell>
                          <TableCell className="font-mono text-xs">{money(line.unitPrice)}</TableCell>
                          <TableCell className="font-mono text-xs font-semibold">{money(line.totalPrice)}</TableCell>
                          <TableCell>
                            <Button size="sm" variant="ghost" className="h-7 text-red-600" disabled={deletingLineId === line.id} onClick={() => void deleteLine(line.id)}>
                              {deletingLineId === line.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        }
      />

      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>שליחה במייל</DialogTitle>
          </DialogHeader>
          <Form {...emailForm}>
            <form className="grid gap-3" onSubmit={emailForm.handleSubmit(sendEmailDraft)}>
              <FormField control={emailForm.control} name="to" render={({ field }) => (
                <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>אל</FormLabel><FormControl><Input {...field} className={ERP_DENSE_INPUT_CLASS} placeholder="supplier@example.com" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={emailForm.control} name="subject" render={({ field }) => (
                <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>נושא</FormLabel><FormControl><Input {...field} className={ERP_DENSE_INPUT_CLASS} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={emailForm.control} name="message" render={({ field }) => (
                <FormItem><FormLabel className={ERP_DENSE_LABEL_CLASS}>הודעה</FormLabel><FormControl><Textarea {...field} className="min-h-32 text-sm" /></FormControl><FormMessage /></FormItem>
              )} />
              <p className="text-xs text-slate-500">המייל ישלח עם קובץ PDF מצורף של חוזה האב.</p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEmailDialogOpen(false)}>ביטול</Button>
                <Button type="submit" disabled={sendingEmail}>
                  {sendingEmail ? <Loader2 className="me-1 size-4 animate-spin" /> : <Mail className="me-1 size-4" />}
                  שלח
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

