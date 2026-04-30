"use client"

/**
 * Procurement Orders — New PO Form (Phase 7.2.B)
 *
 * טופס Master-Detail עשיר ליצירת הזמנת רכש על גבי `POST /api/procurement/orders`.
 *
 * ## אדריכלות הטופס
 *   • `react-hook-form` + `zodResolver` — מקור-אמת אחיד לוולידציה. ה-zod schema
 *     שכאן זהה במבנה ל-`createOrderSchema` ב-API; הברירת-מחדל היא תאימות
 *     contract.
 *   • `useFieldArray` — לניהול שורות דינמיות.
 *   • `useWatch` נקודתי — חישוב מחדש של summary בלי re-renders של כל הטופס.
 *
 * ## Auto-pilot חכם (UX קריטי)
 *   • בבחירת פריט → ממלא אוטומטית `budget_sub_chapter` ו-`resource_id` מתוך
 *     ברירות המחדל של הפריט ב-`erp_md_items` (governance compliance ללא חיכוך).
 *   • בבחירת ספק+פריט → טוען מ-`/api/master-data/supplier-items?supplierId=X&itemId=Y`
 *     את `base_price` ו-`discount_percentage`, מחשב unit_price נטו ומאכלס. אם אין
 *     מחירון לאותו צירוף — נשאר 0 לעריכה ידנית.
 *   • cache: `Map<"${supplier}_${item}", number | null>` כדי שלא נשלח אותה
 *     בקשה פעמיים בזמן ניווט בטופס.
 *
 * ## Submit Flow
 *   POST → 201 → toast ירוק → router.push חזרה לעמוד ה-grid (refresh אוטומטי
 *   דרך `useEffect` של ה-landing page).
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useFieldArray, useForm, useWatch } from "react-hook-form"
import { ArrowRight, Loader2, Plus, ShoppingCart, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { cn } from "@/lib/utils"

// ============================================================================
// Types — DTO-shaped, matches existing master-data API responses.
// ============================================================================

type SupplierOption = {
  id: string
  supplierNum: string | null
  name: string
}

type ProjectOption = {
  id: string
  projectNumber: string
  name: string
  status: string
}

type ItemOption = {
  id: string
  itemNumber: string
  description: string
  budgetSubChapter: string | null
  resourceId: string | null
}

type SupplierPriceRow = {
  basePrice: number
  discountPercentage: number
}

const SUPPORTED_CURRENCIES = ["ILS", "USD", "EUR"] as const
type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]
const VAT_RATE = 0.17

// ============================================================================
// Form schema — חופף ל-`createOrderSchema` בשרת. הקלט מהטפסים מגיע כמחרוזות,
// אז משתמשים ב-`z.coerce.number()` עבור שדות מספריים. השרת ירץ ולידציה זהה.
// ============================================================================

const lineFormSchema = z.object({
  itemId: z.string().uuid({ message: "יש לבחור פריט" }),
  quantity: z.coerce
    .number({ message: "כמות חייבת להיות מספר" })
    .positive({ message: "כמות חייבת להיות חיובית" }),
  unitPrice: z.coerce
    .number({ message: "מחיר חייב להיות מספר" })
    .min(0, { message: "מחיר חייב להיות אי-שלילי" }),
  // ממולאים אוטומטית מהפריט; המשתמש לא רואה אותם בטופס אבל הם חובה ב-API.
  budgetSubChapter: z.string().trim().min(1, { message: "סעיף תקציבי חסר בפריט" }),
  resourceId: z.string().trim().min(1, { message: "קוד משאב חסר בפריט" }),
  description: z.string().trim().optional(),
})

const formSchema = z.object({
  supplierId: z.string().uuid({ message: "יש לבחור ספק" }),
  projectId: z.string().uuid({ message: "יש לבחור פרויקט" }),
  currency: z.enum(SUPPORTED_CURRENCIES),
  notes: z.string().trim().optional(),
  lines: z.array(lineFormSchema).min(1, { message: "חובה לפחות שורה אחת" }),
})

// `z.coerce.number()` מייצר פער בין input ל-output: הטופס מקבל מחרוזות או מספרים
// (Input HTML), ה-API מקבל מספרים ממש. משתמשים במושג 3-הגנריקים של `useForm`:
//   < TFieldValues = input,  TContext = undefined,  TTransformedValues = output >
export type FormInput = z.input<typeof formSchema>
export type FormOutput = z.output<typeof formSchema>

// ============================================================================
// Formatters
// ============================================================================

const numberFormatter = new Intl.NumberFormat("he-IL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

// ============================================================================
// Page
// ============================================================================

export default function NewProcurementOrderPage() {
  const router = useRouter()

  // -- Lookups (suppliers / projects / items) — נטענים פעם אחת בעלייה.
  const [suppliers, setSuppliers] = React.useState<SupplierOption[]>([])
  const [projects, setProjects] = React.useState<ProjectOption[]>([])
  const [items, setItems] = React.useState<ItemOption[]>([])
  const [loadingLookups, setLoadingLookups] = React.useState(true)
  const [submitting, setSubmitting] = React.useState(false)

  // Index פריטים לפי ID לחיפוש מהיר ב-Auto-fill.
  const itemsById = React.useMemo(() => {
    const map = new Map<string, ItemOption>()
    for (const it of items) map.set(it.id, it)
    return map
  }, [items])

  // Cache למחירי ספק לפי צירוף — מונע בקשות חוזרות בזמן הקלדה/ניווט.
  // value: מחיר נטו לאחר הנחה, או null אם אין מחירון לאותו צירוף.
  const supplierPriceCache = React.useRef<Map<string, number | null>>(new Map())

  const form = useForm<FormInput, undefined, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      supplierId: "",
      projectId: "",
      currency: "ILS",
      notes: "",
      lines: [
        {
          itemId: "",
          quantity: 1,
          unitPrice: 0,
          budgetSubChapter: "",
          resourceId: "",
          description: "",
        },
      ],
    },
    mode: "onTouched",
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  })

  // -- טעינת lookups במקביל.
  React.useEffect(() => {
    let cancelled = false
    Promise.all([
      masterDataFetch<SupplierOption[]>("/api/master-data/suppliers"),
      masterDataFetch<ProjectOption[]>("/api/projects"),
      masterDataFetch<ItemOption[]>("/api/master-data/items"),
    ])
      .then(([suppliersData, projectsData, itemsData]) => {
        if (cancelled) return
        setSuppliers(suppliersData ?? [])
        // מעדיפים פרויקטים פעילים בראש הרשימה — UX משופר.
        const sortedProjects = [...(projectsData ?? [])].sort((a, b) => {
          if (a.status === b.status) return 0
          if (a.status === "ACTIVE") return -1
          if (b.status === "ACTIVE") return 1
          return 0
        })
        setProjects(sortedProjects)
        setItems(itemsData ?? [])
      })
      .catch((error: unknown) => {
        if (cancelled) return
        toast.error(
          error instanceof Error ? error.message : "טעינת נתוני מערכת נכשלה"
        )
      })
      .finally(() => {
        if (!cancelled) setLoadingLookups(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // -- Auto-pricing helper (memoized fetch with cache).
  const fetchEffectivePrice = React.useCallback(
    async (supplierId: string, itemId: string): Promise<number | null> => {
      const key = `${supplierId}_${itemId}`
      const cached = supplierPriceCache.current.get(key)
      if (cached !== undefined) return cached
      try {
        const rows = await masterDataFetch<SupplierPriceRow[]>(
          `/api/master-data/supplier-items?supplierId=${encodeURIComponent(
            supplierId
          )}&itemId=${encodeURIComponent(itemId)}`
        )
        const row = rows?.[0]
        if (!row) {
          supplierPriceCache.current.set(key, null)
          return null
        }
        const net = round2(row.basePrice * (1 - (row.discountPercentage ?? 0) / 100))
        supplierPriceCache.current.set(key, net)
        return net
      } catch {
        // נכשל ברשת — לא חוסם את המשתמש; מסמנים null וממשיכים.
        supplierPriceCache.current.set(key, null)
        return null
      }
    },
    []
  )

  // -- Handlers לבחירת פריט: ממלא budget/resource ומריץ auto-pricing.
  const handleItemChange = React.useCallback(
    async (lineIndex: number, itemId: string) => {
      const item = itemsById.get(itemId)
      if (!item) return
      // 1) שדות governance מהפריט (item.* הם string|null — מאלצים ?? '').
      const budgetSubChapter: string = item.budgetSubChapter ?? ""
      const resourceId: string = item.resourceId ?? ""
      form.setValue(
        `lines.${lineIndex}.budgetSubChapter`,
        budgetSubChapter,
        { shouldValidate: true, shouldDirty: true }
      )
      form.setValue(
        `lines.${lineIndex}.resourceId`,
        resourceId,
        { shouldValidate: true, shouldDirty: true }
      )
      // 2) auto-pricing אם כבר נבחר ספק.
      const supplierId = form.getValues("supplierId")
      if (supplierId) {
        const price = await fetchEffectivePrice(supplierId, itemId)
        if (price !== null) {
          form.setValue(`lines.${lineIndex}.unitPrice`, price, {
            shouldValidate: true,
            shouldDirty: true,
          })
        }
      }
    },
    [form, itemsById, fetchEffectivePrice]
  )

  // -- כשהמשתמש משנה ספק → רץ על כל השורות שכבר יש בהן פריט ומעדכן מחיר.
  const handleSupplierChange = React.useCallback(
    async (supplierId: string) => {
      const lines = form.getValues("lines")
      const updates = await Promise.all(
        lines.map(async (line, idx) => {
          if (!line.itemId) return null
          const price = await fetchEffectivePrice(supplierId, line.itemId)
          return price === null ? null : { idx, price }
        })
      )
      for (const u of updates) {
        if (u) {
          form.setValue(`lines.${u.idx}.unitPrice`, u.price, {
            shouldValidate: true,
            shouldDirty: true,
          })
        }
      }
    },
    [form, fetchEffectivePrice]
  )

  // -- Submit. RHF מעביר את ערכי ה-output המומרים (מספרים ממש אחרי z.coerce).
  const onSubmit = React.useCallback(
    async (values: FormOutput) => {
      setSubmitting(true)
      try {
        type CreatedOrder = { id: string; poNumber: string }
        const created = await masterDataFetch<CreatedOrder>(
          "/api/procurement/orders",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              supplierId: values.supplierId,
              projectId: values.projectId,
              currency: values.currency,
              notes: values.notes?.trim() ? values.notes.trim() : null,
              lines: values.lines.map((line) => ({
                itemId: line.itemId,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                budgetSubChapter: line.budgetSubChapter,
                resourceId: line.resourceId,
                description: line.description?.trim() || undefined,
              })),
            }),
          }
        )
        toast.success(`הזמנת רכש ${created.poNumber} נוצרה בהצלחה`)
        router.push("/marker-ofek/procurement/orders")
        router.refresh()
      } catch (error: unknown) {
        toast.error(
          error instanceof Error ? error.message : "יצירת הזמנת רכש נכשלה"
        )
      } finally {
        setSubmitting(false)
      }
    },
    [router]
  )

  if (loadingLookups) {
    return (
      <div dir="rtl" className="flex h-full items-center justify-center">
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          טוען נתונים...
        </div>
      </div>
    )
  }

  return (
    <div dir="rtl" className="flex h-full min-h-0 flex-col gap-4 p-4 pb-8">
      {/* Header bar */}
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShoppingCart className="size-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold">הזמנת רכש חדשה</h1>
            <p className="text-xs text-muted-foreground">
              מילוי כותרת ושורות פריטים. מע&quot;מ {Math.round(VAT_RATE * 100)}% מחושב אוטומטית.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/marker-ofek/procurement/orders")}
          className="gap-2"
        >
          <ArrowRight className="size-4" aria-hidden />
          חזרה לרשימה
        </Button>
      </header>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex min-h-0 flex-1 flex-col gap-6"
        >
          {/* ------------------------------------------------------------ */}
          {/* Section 1 — Header */}
          {/* ------------------------------------------------------------ */}
          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
              פרטי הזמנה
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <FormField
                control={form.control}
                name="supplierId"
                render={({ field }) => (
                  <FormItem className="lg:col-span-2">
                    <FormLabel>ספק *</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        // Base UI מחזיר string|null מ-onValueChange (null במקרה שה-Select מתאפס).
                        field.onChange(value ?? "")
                        if (value) void handleSupplierChange(value)
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="בחר ספק...">
                            {(() => {
                              const s = suppliers.find((sup) => sup.id === field.value)
                              if (!s) return null
                              return s.supplierNum
                                ? `${s.supplierNum} · ${s.name}`
                                : s.name
                            })()}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {suppliers.length === 0 ? (
                          <div className="p-2 text-sm text-muted-foreground">
                            לא הוגדרו ספקים.
                          </div>
                        ) : (
                          suppliers.map((supplier) => (
                            <SelectItem key={supplier.id} value={supplier.id}>
                              {supplier.supplierNum
                                ? `${supplier.supplierNum} · ${supplier.name}`
                                : supplier.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      שינוי ספק יעדכן אוטומטית את המחירים בכל השורות.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="projectId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>פרויקט *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="בחר פרויקט...">
                            {(() => {
                              const p = projects.find((pr) => pr.id === field.value)
                              return p ? `${p.projectNumber} · ${p.name}` : null
                            })()}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {projects.length === 0 ? (
                          <div className="p-2 text-sm text-muted-foreground">
                            לא הוגדרו פרויקטים.
                          </div>
                        ) : (
                          projects.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                              {project.projectNumber} · {project.name}
                              {project.status !== "ACTIVE" ? (
                                <span className="ms-2 text-xs text-muted-foreground">
                                  ({project.status})
                                </span>
                              ) : null}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>מטבע *</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) =>
                        field.onChange(value as SupportedCurrency)
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SUPPORTED_CURRENCIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem className="md:col-span-2 lg:col-span-4">
                    <FormLabel>הערות</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={2}
                        placeholder="טקסט חופשי — תנאי תשלום, יעד אספקה, וכו'"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </section>

          {/* ------------------------------------------------------------ */}
          {/* Section 2 — Lines */}
          {/* ------------------------------------------------------------ */}
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground">
                שורות הזמנה ({fields.length})
              </h2>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  append({
                    itemId: "",
                    quantity: 1,
                    unitPrice: 0,
                    budgetSubChapter: "",
                    resourceId: "",
                    description: "",
                  })
                }
                className="gap-2"
              >
                <Plus className="size-4" aria-hidden />
                הוסף שורה
              </Button>
            </div>

            <div className="overflow-hidden rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-center">#</TableHead>
                    <TableHead className="text-start">פריט *</TableHead>
                    <TableHead className="w-32 text-start">כמות *</TableHead>
                    <TableHead className="w-40 text-start">מחיר יחידה *</TableHead>
                    <TableHead className="w-40 text-end">סה&quot;כ שורה</TableHead>
                    <TableHead className="w-12 text-center">פעולה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((fieldRow, index) => (
                    <LineRow
                      key={fieldRow.id}
                      index={index}
                      items={items}
                      control={form.control}
                      onItemChange={handleItemChange}
                      onRemove={() => remove(index)}
                      canRemove={fields.length > 1}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
            {form.formState.errors.lines?.message ? (
              <p className="mt-2 text-sm text-destructive">
                {form.formState.errors.lines.message}
              </p>
            ) : null}
          </section>

          {/* ------------------------------------------------------------ */}
          {/* Section 3 — Summary */}
          {/* ------------------------------------------------------------ */}
          <SummaryFooter control={form.control} />

          {/* ------------------------------------------------------------ */}
          {/* Submit */}
          {/* ------------------------------------------------------------ */}
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push("/marker-ofek/procurement/orders")}
              disabled={submitting}
            >
              ביטול
            </Button>
            <Button type="submit" disabled={submitting} className="gap-2" size="lg">
              {submitting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              שמור הזמנה (DRAFT)
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}

// ============================================================================
// LineRow — שורת פריט בודדת. מבודד כדי למזער re-renders של שאר הטופס בזמן
// הקלדה בשורה אחת. משתמש ב-`useWatch` נקודתי לחישוב סה"כ-שורה.
// ============================================================================

type LineRowProps = {
  index: number
  items: ItemOption[]
  control: ReturnType<typeof useForm<FormInput, undefined, FormOutput>>["control"]
  onItemChange: (lineIndex: number, itemId: string) => void | Promise<void>
  onRemove: () => void
  canRemove: boolean
}

function LineRow({
  index,
  items,
  control,
  onItemChange,
  onRemove,
  canRemove,
}: LineRowProps) {
  // useWatch ברמת השורה בלבד — חישוב סה"כ-שורה ללא טריגר re-render גלובלי.
  const watched = useWatch({ control, name: `lines.${index}` })
  const lineTotal = React.useMemo(() => {
    const qty = Number(watched?.quantity ?? 0)
    const price = Number(watched?.unitPrice ?? 0)
    if (Number.isNaN(qty) || Number.isNaN(price)) return 0
    return round2(qty * price)
  }, [watched?.quantity, watched?.unitPrice])

  return (
    <TableRow>
      <TableCell className="text-center text-xs text-muted-foreground tabular-nums">
        {index + 1}
      </TableCell>

      <TableCell>
        <FormField
          control={control}
          name={`lines.${index}.itemId`}
          render={({ field, fieldState }) => (
            <FormItem className="m-0 space-y-1">
              <Select
                value={field.value}
                onValueChange={(value) => {
                  field.onChange(value ?? "")
                  if (value) void onItemChange(index, value)
                }}
              >
                <FormControl>
                  <SelectTrigger
                    className={cn(
                      "h-9",
                      fieldState.error && "border-destructive"
                    )}
                  >
                    <SelectValue placeholder="בחר פריט...">
                      {(() => {
                        const item = items.find((it) => it.id === field.value)
                        return item
                          ? `${item.itemNumber} · ${item.description}`
                          : null
                      })()}
                    </SelectValue>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {items.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">
                      לא הוגדרו פריטים.
                    </div>
                  ) : (
                    items.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.itemNumber} · {item.description}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
      </TableCell>

      <TableCell>
        <FormField
          control={control}
          name={`lines.${index}.quantity`}
          render={({ field, fieldState }) => (
            <FormItem className="m-0 space-y-1">
              <FormControl>
                <Input
                  {...field}
                  // field.value הוא unknown (input type של z.coerce.number) — ממירים
                  // ל-string|number כדי לרצות את HTML input attributes.
                  value={(field.value ?? "") as string | number}
                  type="number"
                  step="0.001"
                  min={0}
                  className={cn(
                    "h-9 tabular-nums",
                    fieldState.error && "border-destructive"
                  )}
                />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
      </TableCell>

      <TableCell>
        <FormField
          control={control}
          name={`lines.${index}.unitPrice`}
          render={({ field, fieldState }) => (
            <FormItem className="m-0 space-y-1">
              <FormControl>
                <Input
                  {...field}
                  value={(field.value ?? "") as string | number}
                  type="number"
                  step="0.01"
                  min={0}
                  className={cn(
                    "h-9 tabular-nums",
                    fieldState.error && "border-destructive"
                  )}
                />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
      </TableCell>

      <TableCell className="text-end font-medium tabular-nums">
        {numberFormatter.format(lineTotal)}
      </TableCell>

      <TableCell className="text-center">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onRemove}
          disabled={!canRemove}
          aria-label={`מחק שורה ${index + 1}`}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </TableCell>
    </TableRow>
  )
}

// ============================================================================
// SummaryFooter — חישוב ריאקטיבי של נטו / מע"מ / ברוטו על בסיס כל השורות.
// מבודד כך שייצב על שינויים בשורות ספציפיות ולא ב-header של הטופס.
// ============================================================================

function SummaryFooter({
  control,
}: {
  control: ReturnType<typeof useForm<FormInput, undefined, FormOutput>>["control"]
}) {
  const watchedLines = useWatch({ control, name: "lines" })
  const watchedCurrency = useWatch({ control, name: "currency" })

  const totals = React.useMemo(() => {
    const net = round2(
      (watchedLines ?? []).reduce((sum, line) => {
        const q = Number(line?.quantity ?? 0)
        const p = Number(line?.unitPrice ?? 0)
        if (Number.isNaN(q) || Number.isNaN(p)) return sum
        return sum + q * p
      }, 0)
    )
    const vat = round2(net * VAT_RATE)
    const gross = round2(net + vat)
    return { net, vat, gross }
  }, [watchedLines])

  return (
    <section className="ms-auto w-full max-w-md rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
        סיכום ההזמנה
      </h2>
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">סכום נטו</span>
          <span className="font-medium tabular-nums">
            {numberFormatter.format(totals.net)} {watchedCurrency}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">
            מע&quot;מ ({Math.round(VAT_RATE * 100)}%)
          </span>
          <span className="font-medium tabular-nums">
            {numberFormatter.format(totals.vat)} {watchedCurrency}
          </span>
        </div>
        <Separator />
        <div className="flex items-center justify-between text-base">
          <span className="font-semibold">סכום ברוטו</span>
          <span className="font-bold tabular-nums text-primary">
            {numberFormatter.format(totals.gross)} {watchedCurrency}
          </span>
        </div>
      </div>
    </section>
  )
}
