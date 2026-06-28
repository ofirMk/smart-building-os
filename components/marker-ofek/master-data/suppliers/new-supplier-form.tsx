"use client"

/**
 * NewSupplierForm — Phase A של supplier-card-spec.
 *
 * 4 לשוניות תואמות SOP LB22000321:
 *   1. פרטי זיהוי   — שם, שם לועזי, מס' ספק, סוג, סטטוס, קישור ללקוח.
 *   2. כתובת וטלפון — address, phone, email.
 *   3. פרטים נוספים — branch, industry, founding_year, employee_count + 4 דגלים.
 *   4. כספים        — payment_terms, currency, tax_vat_id.
 *
 * Submit → POST /api/master-data/suppliers → redirect לרשימת הספקים עם
 * הספק החדש כ-`?selected=<id>` (מטפל ב-URL הזה ב-scaffold לפי h tag).
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { ArrowRight, BookOpen, Loader2, Save } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { SUPPLIER_STATUSES } from "@/lib/erp/supplier-card-schema"

// ──────────────────────────────────────────────────────────────────────
// Form schema (input shape) — נשמר עם string לכל המספרים כי input HTML
// נותן strings; ההמרה ל-int מבוצעת ב-API דרך הסכמה השרתית.
// ──────────────────────────────────────────────────────────────────────

const formSchema = z.object({
  // Identification
  supplierNum: z.string().trim().min(1, "מס' ספק חובה"),
  name: z.string().trim().min(1, "שם ספק חובה"),
  foreignName: z.string().optional().default(""),
  supplierKind: z.enum(["supplier", "subcontractor"]).default("supplier"),
  status: z.enum(SUPPLIER_STATUSES).default("ACTIVE"),
  linkedCustomerId: z.string().optional().default(""),
  // Address
  address: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  email: z.string().optional().default(""),
  // Extra
  branchCode: z.string().optional().default(""),
  industry: z.string().optional().default(""),
  foundingYear: z.string().optional().default(""),
  employeeCount: z.string().optional().default(""),
  printsInEnglish: z.boolean().default(false),
  isConfidential: z.boolean().default(false),
  isCasual: z.boolean().default(false),
  allowNameOverride: z.boolean().default(false),
  // Finance
  paymentTerms: z.string().optional().default(""),
  currencyCode: z.string().optional().default(""),
  taxVatId: z.string().optional().default(""),
})

type FormInput = z.input<typeof formSchema>
type FormOutput = z.output<typeof formSchema>

const STATUS_LABELS: Record<(typeof SUPPLIER_STATUSES)[number], string> = {
  ACTIVE: "פעיל",
  INACTIVE: "לא פעיל",
  BLOCKED: "חסום",
  PENDING: "בהמתנה",
}

const PAYMENT_TERMS_OPTIONS = [
  { value: "IMMEDIATE", label: "תשלום מיידי" },
  { value: "NET_30", label: "שוטף + 30" },
  { value: "NET_45", label: "שוטף + 45" },
  { value: "NET_60", label: "שוטף + 60" },
  { value: "NET_90", label: "שוטף + 90" },
  { value: "EOM_30", label: "סוף חודש + 30" },
  { value: "EOM_60", label: "סוף חודש + 60" },
] as const

const CURRENCY_OPTIONS = ["ILS", "USD", "EUR", "GBP"] as const

// ──────────────────────────────────────────────────────────────────────

export function NewSupplierForm() {
  const router = useRouter()
  const [submitting, setSubmitting] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState("identity")
  const [coaDialog, setCoaDialog] = React.useState<{ open: boolean; code: string; pendingValues: FormOutput | null }>({
    open: false,
    code: "",
    pendingValues: null,
  })

  const form = useForm<FormInput, undefined, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      supplierNum: "",
      name: "",
      foreignName: "",
      supplierKind: "supplier",
      status: "ACTIVE",
      linkedCustomerId: "",
      address: "",
      phone: "",
      email: "",
      branchCode: "",
      industry: "",
      foundingYear: "",
      employeeCount: "",
      printsInEnglish: false,
      isConfidential: false,
      isCasual: false,
      allowNameOverride: false,
      paymentTerms: "NET_30",
      currencyCode: "ILS",
      taxVatId: "",
    },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    // Priority parity #3: הצג דיאלוג אישור לפני שמירה
    setCoaDialog({ open: true, code: values.supplierNum, pendingValues: values })
  })

  async function handleConfirmCoa() {
    const values = coaDialog.pendingValues
    if (!values) return
    setCoaDialog((p) => ({ ...p, open: false }))
    setSubmitting(true)
    try {
      const payload = {
        supplierNum: values.supplierNum,
        name: values.name,
        foreignName: values.foreignName || null,
        supplierKind: values.supplierKind,
        status: values.status,
        linkedCustomerId: values.linkedCustomerId || null,
        address: values.address || null,
        phone: values.phone || null,
        email: values.email || null,
        branchCode: values.branchCode || null,
        industry: values.industry || null,
        foundingYear: values.foundingYear ? Number(values.foundingYear) : null,
        employeeCount: values.employeeCount ? Number(values.employeeCount) : null,
        printsInEnglish: values.printsInEnglish,
        isConfidential: values.isConfidential,
        isCasual: values.isCasual,
        allowNameOverride: values.allowNameOverride,
        paymentTerms: values.paymentTerms || null,
        currencyCode: values.currencyCode || null,
        taxVatId: values.taxVatId || null,
      }
      const created = await masterDataFetch<{ id: string; name: string }>(
        "/api/master-data/suppliers",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      )
      toast.success(`ספק "${created.name}" נוצר בהצלחה`)
      router.push(
        `/marker-ofek/procurement/suppliers?selected=${encodeURIComponent(created.id)}`,
      )
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "שגיאה לא ידועה ביצירת הספק",
      )
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* ── Priority #3: CoA Confirmation Dialog ──────────── */}
      <Dialog
        open={coaDialog.open}
        onOpenChange={(open) => {
          if (!open) setCoaDialog((p) => ({ ...p, open: false }))
        }}
      >
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="size-4 text-blue-600" aria-hidden />
              פתיחת חשבון ספק
            </DialogTitle>
            <DialogDescription>
              יפתח חשבון{" "}
              <span className="font-semibold text-foreground">{coaDialog.code}</span>{" "}
              שיקושר לספק בתרשים החשבונות (AP).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button
              onClick={handleConfirmCoa}
              disabled={submitting}
              size="sm"
            >
              {submitting ? (
                <Loader2 className="ml-1 size-3.5 animate-spin" aria-hidden />
              ) : null}
              אישור
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCoaDialog((p) => ({ ...p, open: false }))}
              disabled={submitting}
            >
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <form onSubmit={onSubmit} dir="rtl" className="flex flex-col gap-4 p-4">
      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-lg font-semibold tracking-tight">ספק חדש</h1>
          <p className="text-xs text-muted-foreground">
            תואם Priority SOP LB22000321 — חובה: שם ספק + מס&apos; ספק
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => router.push("/marker-ofek/procurement/suppliers")}
            disabled={submitting}
          >
            <ArrowRight className="ml-1 size-3.5" aria-hidden />
            ביטול
          </Button>
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting ? (
              <Loader2 className="ml-1 size-3.5 animate-spin" aria-hidden />
            ) : (
              <Save className="ml-1 size-3.5" aria-hidden />
            )}
            שמור
          </Button>
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="identity">פרטי זיהוי</TabsTrigger>
          <TabsTrigger value="address">כתובת וטלפון</TabsTrigger>
          <TabsTrigger value="extra">פרטים נוספים</TabsTrigger>
          <TabsTrigger value="finance">כספים</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Identity ─────────────────────────────── */}
        <TabsContent value="identity">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">פרטי זיהוי</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <FieldRow label="מס' ספק *" error={form.formState.errors.supplierNum?.message}>
                <Input {...form.register("supplierNum")} placeholder="לדוגמה: SUP-001" />
              </FieldRow>
              <FieldRow label="שם ספק *" error={form.formState.errors.name?.message}>
                <Input {...form.register("name")} placeholder="שם הספק בעברית" />
              </FieldRow>
              <FieldRow label="שם לועזי">
                <Input {...form.register("foreignName")} placeholder="לדוגמה: ACME Ltd" />
              </FieldRow>
              <FieldRow label="סוג">
                <Select
                  value={form.watch("supplierKind")}
                  onValueChange={(v) =>
                    form.setValue("supplierKind", v as "supplier" | "subcontractor")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="supplier">ספק רגיל</SelectItem>
                    <SelectItem value="subcontractor">קבלן משנה</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="סטטוס">
                <Select
                  value={form.watch("status")}
                  onValueChange={(v) =>
                    form.setValue("status", v as (typeof SUPPLIER_STATUSES)[number])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPLIER_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="לקוח מקושר (UUID — אופציונלי)">
                <Input
                  {...form.register("linkedCustomerId")}
                  placeholder="אם הספק הוא גם לקוח קיים"
                  className="font-mono text-xs"
                />
              </FieldRow>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Address ──────────────────────────────── */}
        <TabsContent value="address">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">כתובת וטלפון</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <FieldRow label="כתובת">
                <Textarea
                  {...form.register("address")}
                  rows={2}
                  placeholder="רחוב, עיר, מיקוד"
                />
              </FieldRow>
              <FieldRow label="טלפון">
                <Input {...form.register("phone")} placeholder="03-1234567" />
              </FieldRow>
              <FieldRow label="אימייל">
                <Input
                  {...form.register("email")}
                  type="email"
                  placeholder="contact@example.com"
                />
              </FieldRow>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: Extra ────────────────────────────────── */}
        <TabsContent value="extra">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">פרטים נוספים</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <FieldRow label="סניף (קוד)">
                <Input {...form.register("branchCode")} placeholder="לדוגמה: BR-TLV" />
              </FieldRow>
              <FieldRow label="תחום עיסוק">
                <Input {...form.register("industry")} placeholder="לדוגמה: ציוד חשמל" />
              </FieldRow>
              <FieldRow
                label="שנת הקמה"
                error={form.formState.errors.foundingYear?.message}
              >
                <Input
                  {...form.register("foundingYear")}
                  type="number"
                  placeholder="2010"
                  min={1800}
                  max={new Date().getFullYear() + 1}
                />
              </FieldRow>
              <FieldRow
                label="מס' עובדים"
                error={form.formState.errors.employeeCount?.message}
              >
                <Input
                  {...form.register("employeeCount")}
                  type="number"
                  placeholder="לדוגמה: 50"
                  min={0}
                />
              </FieldRow>
              <div className="col-span-full grid grid-cols-1 gap-2 rounded-md border border-border p-3 sm:grid-cols-2">
                <CheckRow
                  id="prints_in_english"
                  label="הדפסות באנגלית"
                  hint="להפיק תעודות לספק זה באנגלית"
                  checked={form.watch("printsInEnglish") ?? false}
                  onChange={(v) => form.setValue("printsInEnglish", v)}
                />
                <CheckRow
                  id="is_confidential"
                  label="ספק חסוי"
                  hint="רק משתמשים מורשים יראו את הספק"
                  checked={form.watch("isConfidential") ?? false}
                  onChange={(v) => form.setValue("isConfidential", v)}
                />
                <CheckRow
                  id="is_casual"
                  label="ספק מזדמן"
                  hint="ספק חד-פעמי תחת כרטיס שיתופי"
                  checked={form.watch("isCasual") ?? false}
                  onChange={(v) => form.setValue("isCasual", v)}
                />
                <CheckRow
                  id="allow_name_override"
                  label="שינוי שם בהזמנות"
                  hint="מאפשר לשנות את שם הספק בכל הזמנה (ל'ספק מזדמן')"
                  checked={form.watch("allowNameOverride") ?? false}
                  onChange={(v) => form.setValue("allowNameOverride", v)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 4: Finance ──────────────────────────────── */}
        <TabsContent value="finance">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">כספים</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <FieldRow label="תנאי תשלום">
                <Select
                  value={form.watch("paymentTerms") ?? ""}
                  onValueChange={(v) => form.setValue("paymentTerms", v ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="בחר…" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TERMS_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="מטבע">
                <Select
                  value={form.watch("currencyCode") ?? ""}
                  onValueChange={(v) => form.setValue("currencyCode", v ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCY_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="ח.פ. / ע.מ.">
                <Input
                  {...form.register("taxVatId")}
                  placeholder="לדוגמה: 514123456"
                  className="font-mono"
                />
              </FieldRow>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </form>
    </>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Small helpers
// ──────────────────────────────────────────────────────────────────────

function FieldRow({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : null}
    </div>
  )
}

function CheckRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-2 rounded-md p-1 hover:bg-accent/40"
    >
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        className="mt-0.5"
      />
      <div className="flex min-w-0 flex-col">
        <span className="text-xs font-medium">{label}</span>
        {hint ? (
          <span className="text-[10px] leading-tight text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </div>
    </label>
  )
}
