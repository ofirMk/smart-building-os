"use client"

/**
 * PoGeneralTab — Phase B'' (Priority parity — editable header)
 * ----------------------------------------------------------------
 * טאב "כללי" של מסך הפרט של הזמנת רכש, עם תמיכה ב-view ו-edit:
 *
 *   View mode (read-only):
 *     - פרטי ספק + פרויקט
 *     - כרטיס Phase A: contact, warehouse, order_date, payment terms,
 *       VAT code, withholding, shipping address, flags (confidential /
 *       affects_planning), closed_at/by
 *     - משילות AI + דחיפות
 *     - הערות + גוף HTML
 *     - סיכום פיננסי (צד ימין)
 *
 *   Edit mode (מותנה ב-statusMeta.allowChanges):
 *     - כל השדות הניתנים לעריכה הופכים inputs
 *     - טוען /api/master-data/payment-terms + suppliers/{id}/contacts
 *       על-פי דרישה (lazy, רק כאשר נכנסים ל-edit)
 *     - Save → PUT /api/procurement/orders/{id} → onChanged()
 *     - Cancel → חוזר ל-view + משחזר את הטופס מה-data.
 *
 * העיצוב תואם ל-InfoCard/DLRow של ה-page.tsx (shadcn). הרכיב מיובא
 * מתוך page.tsx ומחליף את ה-GeneralTab הישן.
 */

import * as React from "react"
import {
  AlertTriangle,
  Building2,
  Calendar,
  CircleDollarSign,
  ClipboardList,
  FileSignature,
  Lock,
  Pencil,
  TrendingUp,
  Truck,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { PoStatusBadge } from "@/components/marker-ofek/procurement/po-status-badge"
import { usePoStatusTypes } from "@/lib/hooks/use-po-status-types"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// DTO imports are redeclared here as local types to keep the tab decoupled
// from the page (which is "use client" and imports this file). The shapes
// below mirror `app/api/procurement/orders/[id]/route.ts`.
// ---------------------------------------------------------------------------

export type ShippingAddress = {
  name?: string
  contact?: string
  phone?: string
  fax?: string
  line1?: string
  line2?: string
  line3?: string
  city?: string
  state?: string
  zip?: string
  country?: string
}

export type PoGeneralTabData = {
  id: string
  poNumber: string
  officialPoNumber: string | null
  title: string
  status: string
  notes: string | null
  createdAt: string
  issuedAt: string | null
  currency: string
  totalAmount: number
  totalAmountNet: number
  vatAmount: number
  totalAmountGross: number
  urgencyLevel: string
  urgencyJustification: string | null
  aiNegotiationStatus: string | null
  poTotalDeviationPct: number | null
  requiresPoEscalation: boolean
  bodyHtml: string | null
  // Phase A — Priority parity
  contactId: string | null
  receivingWarehouseCode: string | null
  orderDate: string | null
  paymentTermsCode: string | null
  vatCode: string | null
  withholdingPct: number | null
  shippingAddrHe: ShippingAddress | null
  shippingAddrEn: ShippingAddress | null
  isConfidential: boolean
  affectsPlanning: boolean
  closedAt: string | null
  closedBy: string | null
  // "אישורים ומעקב ביצוע" — Priority parity
  isPrinted: boolean
  isUnlockedForChanges: boolean
  isPartiallyClosed: boolean
  isPurchasingOnly: boolean
  supplierAuthLevelOverride: number | null
  approversListCode: string | null
  /** החותם הבא — Priority: NEXTSIGNER */
  nextSignerName: string | null
  // extended header fields — Priority parity
  poTypeCode: string | null
  deliveryMethodCode: string | null
  branchCode: string | null
  forUserName: string | null
  centralizedDemandRef: string | null
  quoteRef: string | null
  blanketOrderRef: string | null
  customerOrderRef: string | null
  serviceCallRef: string | null
  importExportFileType: string | null
  importExportFileRef: string | null
  locationTracking: string | null
  supplier: {
    id: string
    name: string
    supplierNum: string | null
    email: string | null
    address: string | null
    phone: string | null
    taxVatId: string | null
    paymentTerms: string | null
  } | null
  project: {
    id: string
    projectNumber: string | null
    name: string | null
  } | null
}

type PaymentTerm = {
  code: string
  description: string
}

type SupplierContact = {
  id: string
  name: string
  role: string | null
  phone: string | null
  email: string | null
  isPrimary: boolean
}

// ---------------------------------------------------------------------------
// Editable form state — only fields a user may change.
// חשוב: urgencyJustification חובה כש-urgencyLevel !== NORMAL (מגובה גם
// ע"י ה-API). ה-UI מסמן זאת, אבל ולידציה סופית נעשית בשרת.
// ---------------------------------------------------------------------------

type FormState = {
  title: string
  notes: string
  orderDate: string // YYYY-MM-DD או ""
  paymentTermsCode: string // "" = null
  contactId: string // "" = null
  receivingWarehouseCode: string
  vatCode: string
  withholdingPct: string // מאוחסן כמחרוזת בעריכה, ממיר ל-number ב-submit
  urgencyLevel: string
  urgencyJustification: string
  isConfidential: boolean
  affectsPlanning: boolean
  shippingAddrHeName: string
  shippingAddrHeContact: string
  shippingAddrHePhone: string
  shippingAddrHeLine1: string
  shippingAddrHeLine2: string
  shippingAddrHeCity: string
  shippingAddrHeZip: string
  shippingAddrHeCountry: string
}

function formFromData(d: PoGeneralTabData): FormState {
  const he = d.shippingAddrHe ?? {}
  return {
    title: d.title ?? "",
    notes: d.notes ?? "",
    orderDate: d.orderDate ? d.orderDate.slice(0, 10) : "",
    paymentTermsCode: d.paymentTermsCode ?? "",
    contactId: d.contactId ?? "",
    receivingWarehouseCode: d.receivingWarehouseCode ?? "",
    vatCode: d.vatCode ?? "",
    withholdingPct:
      d.withholdingPct != null ? String(d.withholdingPct) : "",
    urgencyLevel: d.urgencyLevel ?? "NORMAL",
    urgencyJustification: d.urgencyJustification ?? "",
    isConfidential: Boolean(d.isConfidential),
    affectsPlanning: d.affectsPlanning !== false, // default true
    shippingAddrHeName: he.name ?? "",
    shippingAddrHeContact: he.contact ?? "",
    shippingAddrHePhone: he.phone ?? "",
    shippingAddrHeLine1: he.line1 ?? "",
    shippingAddrHeLine2: he.line2 ?? "",
    shippingAddrHeCity: he.city ?? "",
    shippingAddrHeZip: he.zip ?? "",
    shippingAddrHeCountry: he.country ?? "",
  }
}

function buildPatchPayload(form: FormState, base: PoGeneralTabData): Record<string, unknown> {
  const payload: Record<string, unknown> = {}

  if (form.title !== (base.title ?? "")) payload.title = form.title
  if ((form.notes || null) !== (base.notes ?? null)) {
    payload.notes = form.notes ? form.notes : null
  }
  if ((form.orderDate || null) !== (base.orderDate ? base.orderDate.slice(0, 10) : null)) {
    payload.orderDate = form.orderDate ? form.orderDate : null
  }
  if ((form.paymentTermsCode || null) !== (base.paymentTermsCode ?? null)) {
    payload.paymentTermsCode = form.paymentTermsCode ? form.paymentTermsCode : null
  }
  if ((form.contactId || null) !== (base.contactId ?? null)) {
    payload.contactId = form.contactId ? form.contactId : null
  }
  if ((form.receivingWarehouseCode || null) !== (base.receivingWarehouseCode ?? null)) {
    payload.receivingWarehouseCode = form.receivingWarehouseCode || null
  }
  if ((form.vatCode || null) !== (base.vatCode ?? null)) {
    payload.vatCode = form.vatCode || null
  }

  const withholdingAsNumber =
    form.withholdingPct.trim() === "" ? null : Number(form.withholdingPct)
  const baseWithholding = base.withholdingPct ?? null
  if (withholdingAsNumber !== baseWithholding) {
    payload.withholdingPct = withholdingAsNumber
  }

  if (form.urgencyLevel !== (base.urgencyLevel ?? "NORMAL")) {
    payload.urgencyLevel = form.urgencyLevel
  }
  if ((form.urgencyJustification || null) !== (base.urgencyJustification ?? null)) {
    payload.urgencyJustification = form.urgencyJustification || null
  }
  if (form.isConfidential !== Boolean(base.isConfidential)) {
    payload.isConfidential = form.isConfidential
  }
  if (form.affectsPlanning !== (base.affectsPlanning !== false)) {
    payload.affectsPlanning = form.affectsPlanning
  }

  const baseAddr = base.shippingAddrHe ?? {}
  const newAddr: ShippingAddress = {}
  if (form.shippingAddrHeName.trim()) newAddr.name = form.shippingAddrHeName.trim()
  if (form.shippingAddrHeContact.trim()) newAddr.contact = form.shippingAddrHeContact.trim()
  if (form.shippingAddrHePhone.trim()) newAddr.phone = form.shippingAddrHePhone.trim()
  if (form.shippingAddrHeLine1.trim()) newAddr.line1 = form.shippingAddrHeLine1.trim()
  if (form.shippingAddrHeLine2.trim()) newAddr.line2 = form.shippingAddrHeLine2.trim()
  if (form.shippingAddrHeCity.trim()) newAddr.city = form.shippingAddrHeCity.trim()
  if (form.shippingAddrHeZip.trim()) newAddr.zip = form.shippingAddrHeZip.trim()
  if (form.shippingAddrHeCountry.trim()) newAddr.country = form.shippingAddrHeCountry.trim()

  // שווה ערך shallow — הופכים לrecord ומשווים JSON (קטן, זול).
  const newAddrJson = JSON.stringify(newAddr)
  const baseAddrJson = JSON.stringify({
    name: baseAddr.name,
    contact: baseAddr.contact,
    phone: baseAddr.phone,
    line1: baseAddr.line1,
    line2: baseAddr.line2,
    city: baseAddr.city,
    zip: baseAddr.zip,
    country: baseAddr.country,
  })
  if (newAddrJson !== baseAddrJson) {
    payload.shippingAddrHe = Object.keys(newAddr).length > 0 ? newAddr : null
  }

  return payload
}

// Base UI Select's onValueChange passes `string | null`. מנרמל ל-"" שמייצג
// "ללא" בטופס (מתורגם אחר-כך לnull ב-buildPatchPayload).
function normalizeSelectValue(v: string | null): string {
  if (v == null) return ""
  if (v === "__none__") return ""
  return v
}

const URGENCY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "NORMAL", label: "רגילה" },
  { value: "HIGH", label: "גבוהה" },
  { value: "CRITICAL", label: "קריטית" },
]

const URGENCY_LABEL: Record<string, string> = {
  NORMAL: "רגילה",
  HIGH: "גבוהה",
  CRITICAL: "קריטית",
}

const URGENCY_BADGE_CLASS: Record<string, string> = {
  NORMAL: "bg-slate-500/10 text-slate-700 border-slate-500/30",
  HIGH: "bg-orange-500/15 text-orange-800 border-orange-500/30",
  CRITICAL: "bg-rose-500/15 text-rose-800 border-rose-500/30",
}

const numberFormatter = new Intl.NumberFormat("he-IL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const dateFormatter = new Intl.DateTimeFormat("he-IL", { dateStyle: "medium" })
const dateTimeFormatter = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "medium",
  timeStyle: "short",
})

function formatDate(value: string | null): string {
  if (!value) return "—"
  try {
    return dateFormatter.format(new Date(value))
  } catch {
    return value
  }
}
function formatDateTime(value: string | null): string {
  if (!value) return "—"
  try {
    return dateTimeFormatter.format(new Date(value))
  } catch {
    return value
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PoGeneralTab({
  data,
  onChanged,
}: {
  data: PoGeneralTabData
  onChanged: () => void
}) {
  const { statusMap } = usePoStatusTypes()
  const statusMeta = statusMap[data.status] ?? null
  const allowChanges = statusMeta?.allowChanges ?? false

  const [mode, setMode] = React.useState<"view" | "edit">("view")
  const [form, setForm] = React.useState<FormState>(() => formFromData(data))
  const [saving, setSaving] = React.useState(false)
  const [confirmDiscard, setConfirmDiscard] = React.useState(false)

  // isDirty — compare current form against original data.
  const isDirty = React.useMemo(() => {
    if (mode !== "edit") return false
    return JSON.stringify(form) !== JSON.stringify(formFromData(data))
  }, [form, data, mode])

  // כאשר ה-data השתנתה (refetch אחרי save מוצלח, או navigation) —
  // נאפס את הטופס. מונע סטטוס stale אחרי Save.
  React.useEffect(() => {
    setForm(formFromData(data))
  }, [data])

  // Payment terms + supplier contacts — טעינה lazy בכניסה ל-edit.
  const [paymentTerms, setPaymentTerms] = React.useState<PaymentTerm[]>([])
  const [contacts, setContacts] = React.useState<SupplierContact[]>([])
  const [lookupsLoaded, setLookupsLoaded] = React.useState(false)

  const supplierId = data.supplier?.id ?? null

  const loadLookups = React.useCallback(async () => {
    if (lookupsLoaded) return
    try {
      const [ptRaw, contactsRaw] = await Promise.all([
        masterDataFetch<PaymentTerm[]>("/api/master-data/payment-terms"),
        supplierId
          ? masterDataFetch<SupplierContact[]>(
              `/api/erp/master-data/suppliers/${encodeURIComponent(supplierId)}/contacts`
            )
          : Promise.resolve<SupplierContact[]>([]),
      ])
      setPaymentTerms(ptRaw ?? [])
      setContacts(contactsRaw ?? [])
      setLookupsLoaded(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "טעינת נתוני עזר נכשלה"
      toast.error(msg)
    }
  }, [lookupsLoaded, supplierId])

  const enterEdit = React.useCallback(() => {
    setMode("edit")
    void loadLookups()
  }, [loadLookups])

  const cancelEdit = React.useCallback(() => {
    if (isDirty) {
      setConfirmDiscard(true)
      return
    }
    setMode("view")
    setForm(formFromData(data))
  }, [data, isDirty])

  const discardAndCancel = React.useCallback(() => {
    setConfirmDiscard(false)
    setMode("view")
    setForm(formFromData(data))
  }, [data])

  const handleSave = React.useCallback(async () => {
    // ולידציה מינימלית בצד-לקוח.
    if (!form.title.trim()) {
      toast.error("כותרת ההזמנה חובה")
      return
    }
    if (form.urgencyLevel !== "NORMAL" && !form.urgencyJustification.trim()) {
      toast.error("יש לספק הצדקה לדחיפות מוגברת")
      return
    }

    const patch = buildPatchPayload(form, data)
    if (Object.keys(patch).length === 0) {
      toast.info("אין שינויים לשמירה")
      setMode("view")
      return
    }

    setSaving(true)
    try {
      await masterDataFetch(
        `/api/procurement/orders/${encodeURIComponent(data.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }
      )
      toast.success("פרטי ההזמנה נשמרו")
      setMode("view")
      onChanged()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "שמירת שינויים נכשלה"
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }, [form, data, onChanged])

  const isEdit = mode === "edit"

  return (
    <div className="space-y-3">
      {/* Dirty-form guard — confirm discard unsaved changes */}
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>בטל שינויים?</AlertDialogTitle>
            <AlertDialogDescription>
              בוצעו שינויים שטרם נשמרו. האם לבטל את העריכה ולאבד את השינויים?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>המשך עריכה</AlertDialogCancel>
            <AlertDialogAction
              onClick={discardAndCancel}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              בטל שינויים
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
        <div className="flex items-center gap-2 text-xs">
          <PoStatusBadge status={data.status} meta={statusMeta} />
          {!allowChanges ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Lock className="size-3.5" aria-hidden />
              הסטטוס הנוכחי אינו מאפשר עריכה
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {isEdit ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={cancelEdit}
                className="gap-1.5"
              >
                <X className="size-4" aria-hidden />
                ביטול
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saving}
                onClick={() => void handleSave()}
                className="gap-1.5"
              >
                {saving ? "שומר…" : "שמירה"}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!allowChanges}
              onClick={enterEdit}
              className="gap-1.5"
              title={
                allowChanges
                  ? "עריכת פרטי ההזמנה"
                  : "לא ניתן לערוך בסטטוס זה"
              }
            >
              <Pencil className="size-4" aria-hidden />
              עריכה
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Left column */}
        <div className="space-y-4">
          {/* --------------------------------------------------------- */}
          {/* פרטי ספק ופרויקט                                           */}
          {/* --------------------------------------------------------- */}
          <InfoCard title="פרטי ספק ופרויקט" icon={<Building2 className="size-4" />}>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <DLRow
                label="ספק"
                value={
                  data.supplier ? (
                    <span>
                      {data.supplier.supplierNum ? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {data.supplier.supplierNum} ·{" "}
                        </span>
                      ) : null}
                      {data.supplier.name}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )
                }
              />
              <DLRow
                label="פרויקט"
                value={
                  data.project ? (
                    <span>
                      {data.project.projectNumber ? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {data.project.projectNumber} ·{" "}
                        </span>
                      ) : null}
                      {data.project.name ?? "—"}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )
                }
              />
              <DLRow
                label="מטבע"
                value={<span className="font-mono">{data.currency}</span>}
              />
              <DLRow
                label="תאריך יצירה"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="size-3.5 text-muted-foreground" aria-hidden />
                    {formatDateTime(data.createdAt)}
                  </span>
                }
              />
              {data.issuedAt ? (
                <DLRow
                  label="תאריך הוצאה"
                  value={
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="size-3.5 text-muted-foreground" aria-hidden />
                      {formatDate(data.issuedAt)}
                    </span>
                  }
                />
              ) : null}
              {/* כותרת — ניתנת לעריכה */}
              <DLRow
                label="כותרת ההזמנה"
                fullWidth
                value={
                  isEdit ? (
                    <Input
                      value={form.title}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, title: e.target.value }))
                      }
                      maxLength={200}
                      dir="rtl"
                    />
                  ) : (
                    <span>{data.title || "—"}</span>
                  )
                }
              />
            </dl>
          </InfoCard>

          {/* --------------------------------------------------------- */}
          {/* כרטיס Phase A — Priority parity                            */}
          {/* --------------------------------------------------------- */}
          <InfoCard
            title="נתוני Priority (כללי)"
            icon={<Truck className="size-4" />}
          >
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <DLRow
                label="איש קשר אצל הספק"
                value={
                  isEdit ? (
                    <Select
                      value={form.contactId || "__none__"}
                      onValueChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          contactId: normalizeSelectValue(v),
                        }))
                      }
                    >
                      <SelectTrigger dir="rtl">
                        <SelectValue placeholder="ללא" />
                      </SelectTrigger>
                      <SelectContent dir="rtl">
                        <SelectItem value="__none__">ללא</SelectItem>
                        {contacts.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                            {c.isPrimary ? " ★" : ""}
                            {c.role ? ` — ${c.role}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-sm">
                      {data.contactId
                        ? contacts.find((c) => c.id === data.contactId)?.name ??
                          data.contactId
                        : "—"}
                    </span>
                  )
                }
              />
              <DLRow
                label="מחסן קליטה (קוד)"
                value={
                  isEdit ? (
                    <Input
                      value={form.receivingWarehouseCode}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          receivingWarehouseCode: e.target.value,
                        }))
                      }
                      maxLength={32}
                      dir="ltr"
                      className="font-mono"
                    />
                  ) : (
                    <span className="font-mono text-xs">
                      {data.receivingWarehouseCode ?? "—"}
                    </span>
                  )
                }
              />
              <DLRow
                label="תאריך הזמנה"
                value={
                  isEdit ? (
                    <Input
                      type="date"
                      value={form.orderDate}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, orderDate: e.target.value }))
                      }
                      dir="ltr"
                    />
                  ) : (
                    <span>{formatDate(data.orderDate)}</span>
                  )
                }
              />
              <DLRow
                label="תנאי תשלום"
                value={
                  isEdit ? (
                    <Select
                      value={form.paymentTermsCode || "__none__"}
                      onValueChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          paymentTermsCode: normalizeSelectValue(v),
                        }))
                      }
                    >
                      <SelectTrigger dir="rtl">
                        <SelectValue placeholder="ירושת ברירת-מחדל מהספק" />
                      </SelectTrigger>
                      <SelectContent dir="rtl">
                        <SelectItem value="__none__">ירושה מהספק</SelectItem>
                        {paymentTerms.map((p) => (
                          <SelectItem key={p.code} value={p.code}>
                            <span className="font-mono text-xs">{p.code}</span>
                            {" — "}
                            {p.description}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span>
                      {data.paymentTermsCode ? (
                        <>
                          <span className="font-mono text-xs text-muted-foreground">
                            {data.paymentTermsCode}
                          </span>
                          {paymentTerms.find((p) => p.code === data.paymentTermsCode)
                            ? ` — ${paymentTerms.find((p) => p.code === data.paymentTermsCode)?.description}`
                            : ""}
                        </>
                      ) : (
                        <span className="text-muted-foreground">
                          {data.supplier?.paymentTerms ?? "—"}
                        </span>
                      )}
                    </span>
                  )
                }
              />
              <DLRow
                label='קוד מע"מ'
                value={
                  isEdit ? (
                    <Input
                      value={form.vatCode}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, vatCode: e.target.value }))
                      }
                      maxLength={16}
                      dir="ltr"
                      className="font-mono"
                    />
                  ) : (
                    <span className="font-mono text-xs">
                      {data.vatCode ?? "—"}
                    </span>
                  )
                }
              />
              <DLRow
                label="ניכוי מס במקור (%)"
                value={
                  isEdit ? (
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={form.withholdingPct}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          withholdingPct: e.target.value,
                        }))
                      }
                      dir="ltr"
                    />
                  ) : (
                    <span className="tabular-nums">
                      {data.withholdingPct != null
                        ? `${data.withholdingPct}%`
                        : "—"}
                    </span>
                  )
                }
              />
              <DLRow
                label="חסוי (Confidential)"
                value={
                  isEdit ? (
                    <Switch
                      checked={form.isConfidential}
                      onCheckedChange={(v) =>
                        setForm((f) => ({ ...f, isConfidential: v }))
                      }
                    />
                  ) : data.isConfidential ? (
                    <Badge variant="outline" className="border-rose-500/40 bg-rose-500/10 text-rose-700">
                      חסוי
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">לא</span>
                  )
                }
              />
              <DLRow
                label="משפיע על תכנון חומרים"
                value={
                  isEdit ? (
                    <Switch
                      checked={form.affectsPlanning}
                      onCheckedChange={(v) =>
                        setForm((f) => ({ ...f, affectsPlanning: v }))
                      }
                    />
                  ) : data.affectsPlanning ? (
                    <span className="text-emerald-700">כן</span>
                  ) : (
                    <span className="text-muted-foreground">לא</span>
                  )
                }
              />
              {data.closedAt ? (
                <DLRow
                  label="סגירה"
                  fullWidth
                  value={
                    <span className="text-xs text-muted-foreground">
                      נסגר ב-{formatDateTime(data.closedAt)}
                      {data.closedBy ? ` ע"י ${data.closedBy}` : ""}
                    </span>
                  }
                />
              ) : null}
              {/* אישורים ומעקב ביצוע — Priority parity flags */}
              {(data.isPrinted ||
                data.isUnlockedForChanges ||
                data.isPartiallyClosed ||
                data.isPurchasingOnly ||
                data.supplierAuthLevelOverride != null ||
                data.approversListCode ||
                data.nextSignerName) ? (
                <>
                  <Separator className="col-span-full my-1" />
                  {data.nextSignerName ? (
                    <DLRow
                      label="החותם הבא"
                      value={
                        <span className="font-medium text-amber-700">{data.nextSignerName}</span>
                      }
                    />
                  ) : null}
                  {data.approversListCode ? (
                    <DLRow
                      label="רשימת מאשרים"
                      value={
                        <span className="font-mono text-xs">{data.approversListCode}</span>
                      }
                    />
                  ) : null}
                  {data.supplierAuthLevelOverride != null ? (
                    <DLRow
                      label="דרגת הרשאה לספק"
                      value={<span className="tabular-nums">{data.supplierAuthLevelOverride}</span>}
                    />
                  ) : null}
                  <DLRow
                    label="הודפסה"
                    value={
                      data.isPrinted ? (
                        <Badge variant="outline" className="border-blue-400/40 bg-blue-50 text-blue-700">הודפסה</Badge>
                      ) : (
                        <span className="text-muted-foreground">לא</span>
                      )
                    }
                  />
                  <DLRow
                    label="מנותקת לשינוי"
                    value={
                      data.isUnlockedForChanges ? (
                        <Badge variant="outline" className="border-amber-400/40 bg-amber-50 text-amber-700">מנותקת</Badge>
                      ) : (
                        <span className="text-muted-foreground">לא</span>
                      )
                    }
                  />
                  <DLRow
                    label="סגורה חלקית"
                    value={
                      data.isPartiallyClosed ? (
                        <Badge variant="outline" className="border-orange-400/40 bg-orange-50 text-orange-700">סגורה חלקית</Badge>
                      ) : (
                        <span className="text-muted-foreground">לא</span>
                      )
                    }
                  />
                  <DLRow
                    label="לקנין בלבד"
                    value={
                      data.isPurchasingOnly ? (
                        <Badge variant="outline" className="border-violet-400/40 bg-violet-50 text-violet-700">לקנין בלבד</Badge>
                      ) : (
                        <span className="text-muted-foreground">לא</span>
                      )
                    }
                  />
                </>
              ) : null}
            </dl>
          </InfoCard>

          {/* --------------------------------------------------------- */}
          {/* פרטי הזמנה נוספים — Priority parity                        */}
          {/* --------------------------------------------------------- */}
          {(data.poTypeCode ||
            data.deliveryMethodCode ||
            data.branchCode ||
            data.forUserName ||
            data.locationTracking ||
            data.centralizedDemandRef ||
            data.quoteRef ||
            data.blanketOrderRef ||
            data.customerOrderRef ||
            data.serviceCallRef ||
            data.importExportFileType ||
            data.importExportFileRef) ? (
            <InfoCard title="פרטי הזמנה נוספים" icon={<ClipboardList className="size-4" />}>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {data.poTypeCode ? (
                  <DLRow label="סוג הזמנה" value={<span className="font-mono text-xs">{data.poTypeCode}</span>} />
                ) : null}
                {data.deliveryMethodCode ? (
                  <DLRow label="אופן משלוח" value={data.deliveryMethodCode} />
                ) : null}
                {data.branchCode ? (
                  <DLRow label="סניף" value={<span className="font-mono text-xs">{data.branchCode}</span>} />
                ) : null}
                {data.forUserName ? (
                  <DLRow label="עבור משתמש" value={data.forUserName} />
                ) : null}
                {data.locationTracking ? (
                  <DLRow label="איתור" value={<span className="font-mono text-xs">{data.locationTracking}</span>} />
                ) : null}
                {data.centralizedDemandRef ? (
                  <DLRow label="דרישה מרוכזת" value={<span className="font-mono text-xs">{data.centralizedDemandRef}</span>} />
                ) : null}
                {data.quoteRef ? (
                  <DLRow label="הצעת מחיר" value={<span className="font-mono text-xs">{data.quoteRef}</span>} />
                ) : null}
                {data.blanketOrderRef ? (
                  <DLRow label="הזמנת מסגרת" value={<span className="font-mono text-xs">{data.blanketOrderRef}</span>} />
                ) : null}
                {data.customerOrderRef ? (
                  <DLRow label="הזמנת לקוח" value={<span className="font-mono text-xs">{data.customerOrderRef}</span>} />
                ) : null}
                {data.serviceCallRef ? (
                  <DLRow label="קריאת שרות" value={<span className="font-mono text-xs">{data.serviceCallRef}</span>} />
                ) : null}
                {data.importExportFileType ? (
                  <DLRow label="סוג תיק יבוא/יצוא" value={<span className="font-mono text-xs">{data.importExportFileType}</span>} />
                ) : null}
                {data.importExportFileRef ? (
                  <DLRow label="תיק יבוא/יצוא" value={<span className="font-mono text-xs">{data.importExportFileRef}</span>} />
                ) : null}
              </dl>
            </InfoCard>
          ) : null}

          {/* --------------------------------------------------------- */}
          {/* כתובת משלוח (he)                                           */}
          {/* --------------------------------------------------------- */}
          <InfoCard title="כתובת משלוח" icon={<Truck className="size-4" />}>
            {isEdit ? (
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <FieldGroup label="שם">
                  <Input
                    value={form.shippingAddrHeName}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        shippingAddrHeName: e.target.value,
                      }))
                    }
                    dir="rtl"
                  />
                </FieldGroup>
                <FieldGroup label="איש קשר בשטח">
                  <Input
                    value={form.shippingAddrHeContact}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        shippingAddrHeContact: e.target.value,
                      }))
                    }
                    dir="rtl"
                  />
                </FieldGroup>
                <FieldGroup label="טלפון">
                  <Input
                    value={form.shippingAddrHePhone}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        shippingAddrHePhone: e.target.value,
                      }))
                    }
                    dir="ltr"
                    className="font-mono"
                  />
                </FieldGroup>
                <FieldGroup label="רחוב ומספר">
                  <Input
                    value={form.shippingAddrHeLine1}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        shippingAddrHeLine1: e.target.value,
                      }))
                    }
                    dir="rtl"
                  />
                </FieldGroup>
                <FieldGroup label="פרטים נוספים">
                  <Input
                    value={form.shippingAddrHeLine2}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        shippingAddrHeLine2: e.target.value,
                      }))
                    }
                    dir="rtl"
                  />
                </FieldGroup>
                <FieldGroup label="עיר">
                  <Input
                    value={form.shippingAddrHeCity}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        shippingAddrHeCity: e.target.value,
                      }))
                    }
                    dir="rtl"
                  />
                </FieldGroup>
                <FieldGroup label="מיקוד">
                  <Input
                    value={form.shippingAddrHeZip}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        shippingAddrHeZip: e.target.value,
                      }))
                    }
                    dir="ltr"
                    className="font-mono"
                  />
                </FieldGroup>
                <FieldGroup label="מדינה">
                  <Input
                    value={form.shippingAddrHeCountry}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        shippingAddrHeCountry: e.target.value,
                      }))
                    }
                    dir="rtl"
                  />
                </FieldGroup>
              </div>
            ) : data.shippingAddrHe &&
              Object.values(data.shippingAddrHe).some(Boolean) ? (
              <AddressView addr={data.shippingAddrHe} />
            ) : (
              <p className="text-sm text-muted-foreground">
                לא הוגדרה כתובת משלוח. ברירת-מחדל: כתובת הספק.
              </p>
            )}
          </InfoCard>

          {/* --------------------------------------------------------- */}
          {/* משילות AI ודחיפות — urgencyLevel הופך editable ב-edit mode */}
          {/* --------------------------------------------------------- */}
          <InfoCard
            title="משילות AI ובקרה"
            icon={<TrendingUp className="size-4" />}
          >
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <DLRow
                label="רמת דחיפות"
                value={
                  isEdit ? (
                    <Select
                      value={form.urgencyLevel}
                      onValueChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          urgencyLevel: v ?? "NORMAL",
                        }))
                      }
                    >
                      <SelectTrigger dir="rtl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent dir="rtl">
                        {URGENCY_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-medium",
                        URGENCY_BADGE_CLASS[data.urgencyLevel] ??
                          URGENCY_BADGE_CLASS.NORMAL
                      )}
                    >
                      {URGENCY_LABEL[data.urgencyLevel] ?? data.urgencyLevel}
                    </Badge>
                  )
                }
              />
              <DLRow
                label="סטטוס AI Negotiation"
                value={
                  <span className="font-mono text-xs">
                    {data.aiNegotiationStatus ?? "—"}
                  </span>
                }
              />
              {data.poTotalDeviationPct !== null ? (
                <DLRow
                  label="חריגת מחיר ב-PO (משוקללת)"
                  value={
                    <span
                      className={cn(
                        "font-mono tabular-nums",
                        data.requiresPoEscalation
                          ? "font-semibold text-amber-700"
                          : "text-muted-foreground"
                      )}
                    >
                      {data.poTotalDeviationPct.toFixed(2)}%
                    </span>
                  }
                />
              ) : null}
              <DLRow
                label="הצדקת דחיפות"
                fullWidth
                value={
                  isEdit ? (
                    <Textarea
                      value={form.urgencyJustification}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          urgencyJustification: e.target.value,
                        }))
                      }
                      placeholder={
                        form.urgencyLevel === "NORMAL"
                          ? "אופציונלי (אין חובה בדחיפות רגילה)"
                          : "חובה לספק נימוק"
                      }
                      rows={3}
                      dir="rtl"
                    />
                  ) : data.urgencyJustification ? (
                    <p className="rounded-md bg-muted/40 p-2 text-xs leading-relaxed text-foreground">
                      {data.urgencyJustification}
                    </p>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )
                }
              />
            </dl>
          </InfoCard>

          {/* --------------------------------------------------------- */}
          {/* הערות                                                      */}
          {/* --------------------------------------------------------- */}
          <InfoCard title="הערות" icon={<ClipboardList className="size-4" />}>
            {isEdit ? (
              <Textarea
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                rows={5}
                dir="rtl"
                placeholder="הערות חופשיות (יוצגו במסמך ובפנייה לספק)"
              />
            ) : data.notes ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                {data.notes}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </InfoCard>

          {/* --------------------------------------------------------- */}
          {/* גוף המסמך — read-only גם ב-edit mode (Tiptap יבוא בפאזה אחרת) */}
          {/* --------------------------------------------------------- */}
          {data.bodyHtml ? (
            <InfoCard
              title="גוף מסמך ההזמנה"
              icon={<FileSignature className="size-4" />}
            >
              <div
                className="prose prose-sm max-w-none rounded-md border border-border bg-background p-3 text-sm leading-relaxed dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: data.bodyHtml }}
              />
              {isEdit ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  <AlertTriangle className="me-1 inline size-3" aria-hidden />
                  עריכת גוף המסמך תתמך בפאזה 7.13.X (Tiptap).
                </p>
              ) : null}
            </InfoCard>
          ) : null}
        </div>

        {/* Right column — summary */}
        <div className="space-y-4">
          <SummaryCard data={data} />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Internal presentational helpers
// ---------------------------------------------------------------------------

function SummaryCard({ data }: { data: PoGeneralTabData }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <CircleDollarSign className="size-4 text-primary" aria-hidden />
        <h2 className="text-sm font-semibold text-muted-foreground">
          סיכום פיננסי
        </h2>
      </div>
      <dl className="space-y-2 text-sm">
        <SumRow
          label="סכום נטו"
          value={`${numberFormatter.format(data.totalAmountNet)} ${data.currency}`}
        />
        <SumRow
          label={`מע"מ`}
          value={`${numberFormatter.format(data.vatAmount)} ${data.currency}`}
        />
        <Separator />
        <SumRow
          label="סכום ברוטו"
          value={`${numberFormatter.format(data.totalAmountGross)} ${data.currency}`}
          emphasis
        />
      </dl>
      <Separator className="my-3" />
      <p className="text-xs text-muted-foreground">
        חישוב מע&quot;מ 17% מתבצע אוטומטית בשרת.
      </p>
    </div>
  )
}

function SumRow({
  label,
  value,
  emphasis,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt
        className={cn(
          "text-muted-foreground",
          emphasis && "text-base font-semibold text-foreground"
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          "font-medium tabular-nums",
          emphasis && "text-base font-bold text-primary"
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function InfoCard({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-primary" aria-hidden>
          {icon}
        </span>
        <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function DLRow({
  label,
  value,
  fullWidth,
}: {
  label: string
  value: React.ReactNode
  fullWidth?: boolean
}) {
  return (
    <div className={cn("space-y-0.5", fullWidth && "sm:col-span-2")}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  )
}

function FieldGroup({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function AddressView({ addr }: { addr: ShippingAddress }) {
  const lines = [
    addr.name,
    addr.contact && addr.phone
      ? `${addr.contact} · ${addr.phone}`
      : addr.contact ?? addr.phone ?? null,
    addr.line1,
    addr.line2,
    [addr.city, addr.zip].filter(Boolean).join(" "),
    addr.country,
  ].filter((x): x is string => Boolean(x && x.trim()))

  return (
    <address className="space-y-0.5 text-sm not-italic leading-relaxed">
      {lines.map((ln, i) => (
        <div key={i}>{ln}</div>
      ))}
    </address>
  )
}
