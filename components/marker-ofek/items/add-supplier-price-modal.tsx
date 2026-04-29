"use client"

/**
 * AddSupplierPriceModal — Phase 5.2
 *
 * מודל הוספת מחיר ספק חדש לפריט קיים. נטען עם רשימת הספקים של החברה הפעילה
 * (`/api/master-data/suppliers`) ושולח POST ל-`/api/master-data/supplier-items`.
 *
 * הערות אדריכלות:
 * - השימוש ב-Base UI Select מחייב render-prop ב-`<SelectValue>` כדי להציג שם
 *   ידידותי במקום ה-UUID של הספק (לקח מ-Phase 4).
 * - `netPrice` הוא שדה מחושב read-only כדי לתת UX מיידי בלי לשמור עמודה
 *   נוספת (ה-DB מחזיק `net_unit_price` אבל אנחנו לא ממלאים אותו ידנית כאן —
 *   נשמרת רק ההצגה, וה-API יחשב לפי `base_price` ו-`discount_percentage`).
 */

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { masterDataFetch } from "@/lib/erp/master-data-browser"

type SupplierOption = {
  id: string
  supplierNum: string
  name: string
}

const SUPPORTED_CURRENCIES = ["ILS", "USD", "EUR"] as const
type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]

// ממיר קלט טקסטואלי (מ-`<input type="number">`) למספר תקף. מחזיר NaN ל-`undefined`
// כדי שהוולידציה תטפול בלהיות המספר חובה ב-`min`/`positive`. preprocess מקבל קלט
// מטופס ל-`number` מוצהר למנוע תקלות טיפוס של resolver של react-hook-form ללא `z.coerce`.
const toNumber = (value: unknown): number | undefined => {
  if (value === "" || value === null || value === undefined) return undefined
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isNaN(parsed) ? undefined : parsed
}

const formSchema = z.object({
  supplierId: z.string().uuid({ message: "יש לבחור ספק" }),
  supplierSku: z
    .string()
    .trim()
    .min(1, { message: "מק\"ט ספק הוא שדה חובה" })
    .max(120, { message: "מק\"ט ספק ארוך מדי" }),
  currency: z.enum(SUPPORTED_CURRENCIES),
  basePrice: z.preprocess(
    toNumber,
    z
      .number({ message: "מחיר חייב להיות מספר" })
      .positive({ message: "מחיר חייב להיות גדול מאפס" })
  ),
  discountPercentage: z.preprocess(
    toNumber,
    z
      .number({ message: "הנחה חייבת להיות מספר" })
      .min(0, { message: "הנחה לא יכולה להיות שלילית" })
      .max(100, { message: "הנחה לא יכולה לעבור 100%" })
  ),
  isPreferred: z.boolean(),
  validTo: z.string().trim().optional().nullable(),
})

// עם preprocess, ל-zod 4 יש הפרדה בין input ל-output. ל-RHF נחוץ ה-input (לפני הקוארסיה)
// כדי ששדות מספריים יכולים לקבל מחרוזה מה-`<Input type="number">`.
type FormInput = z.input<typeof formSchema>
type FormOutput = z.output<typeof formSchema>

const DEFAULT_VALUES: FormInput = {
  supplierId: "",
  supplierSku: "",
  currency: "ILS",
  basePrice: "",
  discountPercentage: "",
  isPreferred: false,
  validTo: "",
}

type AddSupplierPriceModalProps = {
  itemId: string | null
  itemSku?: string | null
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function AddSupplierPriceModal({
  itemId,
  itemSku,
  isOpen,
  onClose,
  onSuccess,
}: AddSupplierPriceModalProps) {
  const [suppliers, setSuppliers] = React.useState<SupplierOption[]>([])
  const [suppliersLoading, setSuppliersLoading] = React.useState(false)
  const [submitError, setSubmitError] = React.useState<string | null>(null)

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULT_VALUES,
  })

  // טעינת ספקים בכל פתיחת המודל. שימוש ב-`isOpen` כתלות מבטיח שהרשימה רעננה
  // גם אם המנהל הוסיף ספקים בטאב אחר בין פתיחות.
  React.useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setSuppliersLoading(true)
    masterDataFetch<SupplierOption[]>("/api/master-data/suppliers")
      .then((rows) => {
        if (cancelled) return
        setSuppliers(rows)
      })
      .catch((error) => {
        if (cancelled) return
        toast.error(error instanceof Error ? error.message : "טעינת ספקים נכשלה")
        setSuppliers([])
      })
      .finally(() => {
        if (cancelled) return
        setSuppliersLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen])

  // איפוס הטופס בכל פתיחה כדי שלא יישארו ערכים מהפעם הקודמת.
  React.useEffect(() => {
    if (isOpen) {
      form.reset(DEFAULT_VALUES)
      setSubmitError(null)
    }
  }, [isOpen, form])

  const watchedBase = form.watch("basePrice")
  const watchedDiscount = form.watch("discountPercentage")

  // מחיר נטו מחושב לתצוגה בלבד. שמירה ב-DB נעשית ע"י השרת/מבט מחושב.
  const netPrice = React.useMemo(() => {
    const base = Number(watchedBase) || 0
    const discount = Number(watchedDiscount) || 0
    if (base <= 0) return 0
    const safeDiscount = Math.min(Math.max(discount, 0), 100)
    return base * (1 - safeDiscount / 100)
  }, [watchedBase, watchedDiscount])

  async function onSubmit(values: FormOutput) {
    if (!itemId) {
      setSubmitError("לא נבחר פריט מקור — נסה לסגור ולפתוח שוב")
      return
    }
    setSubmitError(null)
    try {
      await masterDataFetch("/api/master-data/supplier-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId,
          supplierId: values.supplierId,
          supplierSku: values.supplierSku,
          currency: values.currency,
          basePrice: values.basePrice,
          discountPercentage: values.discountPercentage,
          isPreferred: values.isPreferred,
          validTo: values.validTo ? values.validTo : null,
        }),
      })
      toast.success("מחיר הספק נוסף בהצלחה")
      onSuccess()
      onClose()
    } catch (error) {
      // הצגה inline בנוסף ל-toast — למקרה של duplicate item+supplier (PG 23505)
      // או כל שגיאת אכיפת DB אחרת.
      const message =
        error instanceof Error ? error.message : "שמירה נכשלה — נסה שוב"
      setSubmitError(message)
      toast.error(message)
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>הוספת מחיר ספק</DialogTitle>
          <DialogDescription>
            {itemSku ? `קישור ספק לפריט ${itemSku}` : "קישור ספק לפריט הפעיל"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="supplierId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ספק</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value) => field.onChange(value ?? "")}
                  >
                    <FormControl>
                      <SelectTrigger>
                        {/*
                          render-prop על SelectValue: Base UI לא קורא את ItemText
                          אוטומטית; בלי זה היינו רואים UUID במקום קוד+שם.
                        */}
                        <SelectValue
                          placeholder={
                            suppliersLoading
                              ? "טוען ספקים..."
                              : suppliers.length === 0
                                ? "אין ספקים זמינים"
                                : "בחר ספק"
                          }
                        >
                          {(value: string) => {
                            const supplier = suppliers.find((s) => s.id === value)
                            return supplier
                              ? `${supplier.supplierNum} · ${supplier.name}`
                              : null
                          }}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {suppliers.map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.id}>
                          {supplier.supplierNum} · {supplier.name}
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
              name="supplierSku"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>מק&quot;ט ספק</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="off"
                      placeholder="לדוגמה: PLS-VLV-15"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>מטבע</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) =>
                        field.onChange((value ?? "ILS") as SupportedCurrency)
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="בחר מטבע" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SUPPORTED_CURRENCIES.map((code) => (
                          <SelectItem key={code} value={code}>
                            {code}
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
                name="basePrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>מחיר בסיס</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        value={
                          field.value === undefined || field.value === null
                            ? ""
                            : String(field.value)
                        }
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="discountPercentage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>הנחה %</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        max="100"
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        value={
                          field.value === undefined || field.value === null
                            ? ""
                            : String(field.value)
                        }
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/*
                לא ממומש על ידי FormField/FormItem כי זה שדה תצוגה מחושב (read-only) שלא מתלווה
                ל-form state. שימוש ב-FormLabel יקרא ל-`useFormField` ללא קונטקסט.
              */}
              <div className="space-y-2">
                <Label htmlFor="net-price-display">מחיר נטו (מחושב)</Label>
                <Input
                  id="net-price-display"
                  readOnly
                  tabIndex={-1}
                  value={netPrice.toLocaleString("he-IL", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                  className="bg-muted/50"
                />
                <p className="text-sm text-muted-foreground">
                  base × (1 − discount%) — תצוגה בלבד
                </p>
              </div>
            </div>

            <FormField
              control={form.control}
              name="validTo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>תוקף עד (אופציונלי)</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      {...field}
                      value={field.value ?? ""}
                      onChange={(event) => field.onChange(event.target.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isPreferred"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                  <div className="space-y-0.5">
                    <FormLabel htmlFor="is-preferred">ספק מועדף</FormLabel>
                    <FormDescription>
                      סימון כספק ראשוני להזמנת רכש לפריט זה
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      id="is-preferred"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {submitError ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {submitError}
              </div>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={form.formState.isSubmitting}
              >
                ביטול
              </Button>
              <Button
                type="submit"
                disabled={
                  form.formState.isSubmitting ||
                  suppliersLoading ||
                  !itemId ||
                  suppliers.length === 0
                }
              >
                {form.formState.isSubmitting ? "שומר..." : "שמור"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
