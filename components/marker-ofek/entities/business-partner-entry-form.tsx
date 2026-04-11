"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Plus, Trash2 } from "lucide-react"
import {
  Controller,
  useFieldArray,
  useForm,
  type SubmitHandler,
} from "react-hook-form"

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import {
  BP_PAYMENT_TERM_OPTIONS,
  BP_ENTITY_TYPES,
  businessPartnerEntrySchema,
  defaultBusinessPartnerEntryValues,
  labelForEntityType,
  type BpEntityType,
  type BusinessPartnerEntryInput,
  type BusinessPartnerEntryOutput,
} from "@/lib/marker-ofek/business-partner-entry-schema"

const fieldClass =
  "h-8 border-slate-200 bg-white text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:border-emerald-500/40 focus-visible:ring-emerald-500/15 md:text-sm"
const labelClass = "text-xs font-semibold text-slate-600"

/** Jimmy: לבן בלבד — דורס מחלקות dark מהרכיבים הבסיסיים */
const tabTriggerJimmy =
  "text-xs data-active:bg-white data-active:text-slate-900 data-active:shadow-sm md:text-sm dark:!bg-transparent dark:!text-slate-700 dark:data-active:!border-slate-200 dark:data-active:!bg-white dark:data-active:!text-slate-900 dark:hover:!text-slate-800"

type Props = {
  initialKind?: BpEntityType | null
  lockKind: boolean
}

export function BusinessPartnerEntryForm({ initialKind, lockKind }: Props) {
  const defaults = React.useMemo(
    () => defaultBusinessPartnerEntryValues(initialKind ?? null),
    [initialKind]
  )

  const form = useForm<BusinessPartnerEntryInput, unknown, BusinessPartnerEntryOutput>({
    resolver: zodResolver(businessPartnerEntrySchema),
    defaultValues: defaults,
    mode: "onBlur",
  })

  const { control, register, handleSubmit, formState, reset, watch } = form

  React.useEffect(() => {
    reset(defaultBusinessPartnerEntryValues(initialKind ?? null))
  }, [initialKind, lockKind, reset])

  const { fields, append, remove } = useFieldArray({
    control,
    name: "contacts",
  })

  const onValid: SubmitHandler<BusinessPartnerEntryOutput> = (data) => {
    console.log("[BP] Validated Data:", data)
  }

  const onInvalid = () => {
    console.warn("[BP] validation failed — field errors", formState.errors)
  }

  const entityType = watch("entityType")

  return (
    <div
      dir="rtl"
      className="w-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-5 [color-scheme:light]"
    >
      <header className="mb-4 border-b border-slate-100 pb-3">
        <h1 className="text-lg font-bold tracking-tight text-slate-900">
          הקמת שותף עסקי (Business Partner)
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          Phase 1.1 — טופס מאוחד; שמירה ל-MDM תחובר בשלב הבא.
        </p>
        {lockKind ? (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-950">
            סוג ישות נקבע ממסלול הניווט ואינו ניתן לשינוי.
          </p>
        ) : (
          <p className="mt-2 text-[11px] text-slate-500">
            סוג ישות ברירת מחדל:{" "}
            <span className="font-semibold text-slate-800">
              {labelForEntityType(entityType)}
            </span>
            — ניתן לשנות בכל עת.
          </p>
        )}
      </header>

      <form
        className="space-y-4"
        onSubmit={handleSubmit(onValid, onInvalid)}
        noValidate
      >
        <Tabs defaultValue="general" className="w-full gap-3">
          <TabsList
            variant="line"
            className="grid h-auto w-full grid-cols-3 gap-0 rounded-lg border border-slate-200 bg-slate-50 p-1"
          >
            <TabsTrigger value="general" className={tabTriggerJimmy}>
              פרטים כלליים
            </TabsTrigger>
            <TabsTrigger value="financials" className={tabTriggerJimmy}>
              כספים ובנק
            </TabsTrigger>
            <TabsTrigger value="contacts" className={tabTriggerJimmy}>
              אנשי קשר
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-3 space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="bp-entity-name" className={labelClass}>
                  שם הישות (חובה)
                </Label>
                <Input
                  id="bp-entity-name"
                  className={cn(fieldClass, "w-full")}
                  placeholder="למשל: אלקטרה כבלים בע״מ"
                  aria-invalid={!!formState.errors.entityName}
                  {...register("entityName")}
                />
                {formState.errors.entityName ? (
                  <p className="text-[11px] text-red-600" role="alert">
                    {formState.errors.entityName.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label className={labelClass}>סוג הישות (חובה)</Label>
                <Controller
                  control={control}
                  name="entityType"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        if (lockKind) return
                        if (
                          v === "client" ||
                          v === "supplier" ||
                          v === "subcontractor"
                        ) {
                          field.onChange(v)
                        }
                      }}
                    >
                      <SelectTrigger
                        size="sm"
                        disabled={lockKind}
                        className={cn(
                          "h-8 w-full border-slate-200 bg-white text-sm text-slate-900",
                          lockKind && "cursor-not-allowed opacity-90"
                        )}
                        aria-invalid={!!formState.errors.entityType}
                      >
                        <SelectValue placeholder="בחרו סוג" />
                      </SelectTrigger>
                      <SelectContent className="border-slate-200 bg-white">
                        {BP_ENTITY_TYPES.map((t) => (
                          <SelectItem key={t} value={t} className="text-sm">
                            {labelForEntityType(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {formState.errors.entityType ? (
                  <p className="text-[11px] text-red-600" role="alert">
                    {formState.errors.entityType.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bp-tax-id" className={labelClass}>
                  ח.פ / ע.מ. (חובה — 9 ספרות)
                </Label>
                <Input
                  id="bp-tax-id"
                  inputMode="numeric"
                  autoComplete="off"
                  className={cn(fieldClass, "w-full font-mono tabular-nums")}
                  placeholder="123456789"
                  aria-invalid={!!formState.errors.taxId}
                  {...register("taxId")}
                />
                {formState.errors.taxId ? (
                  <p className="text-[11px] text-red-600" role="alert">
                    {formState.errors.taxId.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="bp-address" className={labelClass}>
                  כתובת (אופציונלי)
                </Label>
                <Input
                  id="bp-address"
                  className={cn(fieldClass, "w-full")}
                  placeholder="רחוב, עיר, מיקוד"
                  {...register("address")}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="financials" className="mt-3 space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="bp-bank" className={labelClass}>
                  שם בנק (אופציונלי)
                </Label>
                <Input
                  id="bp-bank"
                  className={cn(fieldClass, "w-full")}
                  {...register("bankName")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bp-branch" className={labelClass}>
                  מספר סניף (אופציונלי)
                </Label>
                <Input
                  id="bp-branch"
                  className={cn(fieldClass, "w-full font-mono")}
                  {...register("bankBranch")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bp-account" className={labelClass}>
                  מספר חשבון (אופציונלי)
                </Label>
                <Input
                  id="bp-account"
                  className={cn(fieldClass, "w-full font-mono")}
                  {...register("bankAccount")}
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label className={labelClass}>תנאי תשלום (חובה)</Label>
                <Controller
                  control={control}
                  name="paymentTermsCode"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger
                        size="sm"
                        className="h-8 w-full max-w-md border-slate-200 bg-white text-sm text-slate-900"
                        aria-invalid={!!formState.errors.paymentTermsCode}
                      >
                        <SelectValue placeholder="בחרו תנאי תשלום" />
                      </SelectTrigger>
                      <SelectContent className="border-slate-200 bg-white">
                        {BP_PAYMENT_TERM_OPTIONS.map((o) => (
                          <SelectItem
                            key={o.value}
                            value={o.value}
                            className="text-sm"
                          >
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {formState.errors.paymentTermsCode ? (
                  <p className="text-[11px] text-red-600" role="alert">
                    {formState.errors.paymentTermsCode.message}
                  </p>
                ) : null}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="contacts" className="mt-3 space-y-3">
            <p className="text-xs text-slate-600">
              נדרש לפחות איש קשר אחד עם שם וטלפון.
            </p>
            <ul className="space-y-3">
              {fields.map((row, index) => (
                <li
                  key={row.id}
                  className="rounded-lg border border-slate-200 bg-slate-50/80 p-3"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      איש קשר {index + 1}
                    </span>
                    {fields.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs text-red-700 hover:bg-red-50 hover:text-red-800"
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                        הסרה
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className={labelClass}>שם (חובה)</Label>
                      <Input
                        className={cn(fieldClass, "w-full")}
                        {...register(`contacts.${index}.name` as const)}
                      />
                      {formState.errors.contacts?.[index]?.name ? (
                        <p className="text-[11px] text-red-600" role="alert">
                          {formState.errors.contacts[index]?.name?.message}
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-1.5">
                      <Label className={labelClass}>טלפון (חובה)</Label>
                      <Input
                        type="tel"
                        dir="ltr"
                        className={cn(fieldClass, "w-full text-start")}
                        {...register(`contacts.${index}.phone` as const)}
                      />
                      {formState.errors.contacts?.[index]?.phone ? (
                        <p className="text-[11px] text-red-600" role="alert">
                          {formState.errors.contacts[index]?.phone?.message}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-slate-200 bg-white text-xs text-slate-800"
              onClick={() => append({ name: "", phone: "" })}
            >
              <Plus className="size-3.5" aria-hidden />
              הוספת איש קשר
            </Button>
            {formState.errors.contacts &&
            typeof formState.errors.contacts === "object" &&
            "message" in formState.errors.contacts ? (
              <p className="text-[11px] text-red-600" role="alert">
                {(formState.errors.contacts as { message?: string }).message}
              </p>
            ) : null}
          </TabsContent>
        </Tabs>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-[11px] text-slate-500">
            שליחה מאמתת ומדפיסה לקונסול בלבד (אין שמירת DB בשלב זה).
          </p>
          <Button
            type="submit"
            className="h-8 bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-600"
          >
            אימות ושמירה
          </Button>
        </div>
      </form>
    </div>
  )
}
