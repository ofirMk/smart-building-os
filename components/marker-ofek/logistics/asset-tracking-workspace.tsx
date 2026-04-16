"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Wrench } from "lucide-react"
import { Controller, useForm, type SubmitHandler } from "react-hook-form"
import { toast } from "sonner"

import { DenseMasterDetailTemplate } from "@/components/layout/DenseMasterDetailTemplate"
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
import { Textarea } from "@/components/ui/textarea"
import {
  MOCK_ASSET_DEFINITIONS,
  MOCK_WORKER_OPTIONS,
  assetCheckoutFormSchema,
  daysPastDue,
  defaultAssetCheckoutFormValues,
  seedActiveCheckouts,
  type ActiveAssetCheckout,
  type AssetCheckoutFormInput,
  type AssetCheckoutFormOutput,
} from "@/lib/marker-ofek/asset-tracking-schema"
import { cn } from "@/lib/utils"

const fieldClass =
  "h-8 border-slate-200 bg-white text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:border-emerald-500/40 focus-visible:ring-emerald-500/15"
const labelClass = "text-xs font-semibold text-slate-600"

let checkoutIdSeq = 0
function allocateCheckoutId(): string {
  checkoutIdSeq += 1
  return `chk-${checkoutIdSeq}`
}

function todayIsoLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function isOverdue(expectedReturnIso: string, todayIso: string): boolean {
  return expectedReturnIso < todayIso
}

/** איחור חמור — צביעת שורה באדום (מעל שבוע אחרי מועד) */
function isSeverelyOverdue(
  expectedReturnIso: string,
  todayIso: string
): boolean {
  return isOverdue(expectedReturnIso, todayIso) &&
    daysPastDue(expectedReturnIso, todayIso) >= 7
}

function assetLabel(assetId: string): string {
  const row = MOCK_ASSET_DEFINITIONS.find((a) => a.id === assetId)
  return row?.name ?? assetId
}

export function AssetTrackingWorkspace() {
  const formRef = React.useRef<HTMLFormElement | null>(null)
  const [todayIso] = React.useState(() => todayIsoLocal())

  const [checkouts, setCheckouts] = React.useState<ActiveAssetCheckout[]>(() =>
    seedActiveCheckouts(todayIso)
  )

  const defaults = React.useMemo(
    () => defaultAssetCheckoutFormValues(todayIso),
    [todayIso]
  )

  const form = useForm<
    AssetCheckoutFormInput,
    unknown,
    AssetCheckoutFormOutput
  >({
    resolver: zodResolver(assetCheckoutFormSchema),
    defaultValues: {
      ...defaults,
      assetId: defaults.assetId ?? "",
      assignedTo: defaults.assignedTo ?? "",
    },
    mode: "onChange",
  })

  const { control, register, handleSubmit, reset, formState } = form
  const { errors } = formState

  const busyAssetIds = React.useMemo(
    () => new Set(checkouts.map((c) => c.assetId)),
    [checkouts]
  )

  const availableAssets = React.useMemo(
    () => MOCK_ASSET_DEFINITIONS.filter((a) => !busyAssetIds.has(a.id)),
    [busyAssetIds]
  )

  const onCheckout: SubmitHandler<AssetCheckoutFormOutput> = (data) => {
    if (busyAssetIds.has(data.assetId)) {
      toast.error("הכלי כבר מנופק — בחרו כלי זמין אחר")
      return
    }
    const next: ActiveAssetCheckout = {
      checkoutId: allocateCheckoutId(),
      assetId: data.assetId,
      assignedTo: data.assignedTo.trim(),
      checkoutDate: data.checkoutDate,
      expectedReturnDate: data.expectedReturnDate,
      notes: (data.notes ?? "").trim(),
    }
    setCheckouts((prev) => [...prev, next])
    reset(defaultAssetCheckoutFormValues(todayIso))
    toast.success("הכלי נופק בהצלחה")
  }

  function returnToWarehouse(checkoutId: string) {
    setCheckouts((prev) => prev.filter((c) => c.checkoutId !== checkoutId))
    toast.message("הוחזר למחסן")
  }

  return (
    <form
      ref={formRef}
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      onSubmit={handleSubmit(onCheckout)}
    >
      <DenseMasterDetailTemplate
        dir="rtl"
        className="min-h-0 flex-1 bg-white text-slate-900 [color-scheme:light]"
        eyebrow="Marker Ofek · לוגיסטיקה"
        title="ניהול כלי עבודה וציוד"
        description="ניפוק כלים לשטח ומעקב החזרות (דמה)."
        leading={<Wrench className="size-5 text-slate-700" aria-hidden />}
        backLink={{
          href: "/marker-ofek/dashboard",
          label: "חזרה ללוח בקרה",
        }}
        headerActions={
          <Button
            type="button"
            size="sm"
            className="h-8 bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
            onClick={() => formRef.current?.requestSubmit()}
          >
            נפק כלי עבודה
          </Button>
        }
        master={
          <section className="flex min-h-0 flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900">ניפוק לשטח</h2>
            <div className="grid gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="asset-id" className={labelClass}>
                  כלי עבודה (זמין בלבד)
                </Label>
                <Controller
                  name="assetId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value || ""}
                      onValueChange={(v) => {
                        if (v) field.onChange(v)
                      }}
                    >
                      <SelectTrigger
                        id="asset-id"
                        className={cn(fieldClass, "w-full")}
                      >
                        <SelectValue placeholder="בחרו כלי…" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableAssets.length === 0 ? (
                          <div className="px-2 py-3 text-center text-xs text-slate-500">
                            אין כלים זמינים — החזירו כלים מהשטח
                          </div>
                        ) : (
                          availableAssets.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.assetId ? (
                  <p className="text-xs text-red-600">{errors.assetId.message}</p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor="assigned-to" className={labelClass}>
                  אצל מי (עובד)
                </Label>
                <Controller
                  name="assignedTo"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value || ""}
                      onValueChange={(v) => {
                        if (v) field.onChange(v)
                      }}
                    >
                      <SelectTrigger
                        id="assigned-to"
                        className={cn(fieldClass, "w-full")}
                      >
                        <SelectValue placeholder="בחרו עובד…" />
                      </SelectTrigger>
                      <SelectContent>
                        {MOCK_WORKER_OPTIONS.map((w) => (
                          <SelectItem key={w} value={w}>
                            {w}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.assignedTo ? (
                  <p className="text-xs text-red-600">
                    {errors.assignedTo.message}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="checkout-date" className={labelClass}>
                    תאריך ניפוק
                  </Label>
                  <Input
                    id="checkout-date"
                    type="date"
                    className={fieldClass}
                    {...register("checkoutDate")}
                  />
                  {errors.checkoutDate ? (
                    <p className="text-xs text-red-600">
                      {errors.checkoutDate.message}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="expected-return" className={labelClass}>
                    תאריך החזרה משוער
                  </Label>
                  <Input
                    id="expected-return"
                    type="date"
                    className={fieldClass}
                    {...register("expectedReturnDate")}
                  />
                  {errors.expectedReturnDate ? (
                    <p className="text-xs text-red-600">
                      {errors.expectedReturnDate.message}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor="notes" className={labelClass}>
                  הערות
                </Label>
                <Textarea
                  id="notes"
                  rows={3}
                  className="min-h-[4.5rem] resize-y border-slate-200 bg-white text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:border-emerald-500/40 focus-visible:ring-emerald-500/15"
                  placeholder="אופציונלי — אתר, הערות בטיחות…"
                  {...register("notes")}
                />
              </div>
            </div>

            <Button
              type="submit"
              size="sm"
              disabled={availableAssets.length === 0}
              className="h-8 w-full bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              אשר ניפוק
            </Button>
          </section>
        }
        detail={
          <section className="flex min-h-0 min-w-0 flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900">
              בשימוש בשטח ({checkouts.length})
            </h2>
            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow className="h-8 hover:bg-transparent">
                    <TableHead className="h-8 min-w-[8rem] text-xs font-semibold text-slate-700">
                      כלי עבודה
                    </TableHead>
                    <TableHead className="h-8 min-w-[6rem] text-xs font-semibold text-slate-700">
                      אצל מי
                    </TableHead>
                    <TableHead className="h-8 min-w-[7rem] text-xs font-semibold text-slate-700">
                      תאריך החזרה משוער
                    </TableHead>
                    <TableHead className="h-8 w-[7rem] text-xs font-semibold text-slate-700">
                      פעולות
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {checkouts.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="py-6 text-center text-sm text-slate-500"
                      >
                        אין כלים מנופקים — כל המלאי במחסן
                      </TableCell>
                    </TableRow>
                  ) : (
                    checkouts.map((row) => {
                      const overdue = isOverdue(row.expectedReturnDate, todayIso)
                      const severe = isSeverelyOverdue(
                        row.expectedReturnDate,
                        todayIso
                      )
                      return (
                        <TableRow
                          key={row.checkoutId}
                          className={cn(
                            "h-8 text-sm",
                            overdue &&
                              !severe &&
                              "border-l-4 border-l-amber-400 bg-amber-50/90 text-amber-950",
                            overdue &&
                              severe &&
                              "border-l-4 border-l-red-500 bg-red-50/95 text-red-950"
                          )}
                        >
                          <TableCell className="py-1.5 font-medium">
                            {assetLabel(row.assetId)}
                          </TableCell>
                          <TableCell className="py-1.5">{row.assignedTo}</TableCell>
                          <TableCell
                            className={cn(
                              "py-1.5 tabular-nums",
                              overdue && "font-semibold",
                              overdue && !severe && "text-amber-800",
                              overdue && severe && "text-red-700"
                            )}
                          >
                            {row.expectedReturnDate}
                          </TableCell>
                          <TableCell className="py-1.5">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 border-slate-300 px-2 text-xs font-semibold"
                              onClick={() => returnToWarehouse(row.checkoutId)}
                            >
                              החזר למחסן
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </section>
        }
      />
    </form>
  )
}
