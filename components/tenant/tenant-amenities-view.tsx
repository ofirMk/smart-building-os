"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { format } from "date-fns"
import { Building2, CalendarDays, Loader2, Users } from "lucide-react"
import { useMemo, useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { createAmenityBooking } from "@/app/tenant/amenities/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type { TenantAmenity } from "@/lib/tenant-amenities"
import { cn } from "@/lib/utils"

function amenityCategoryHe(type: string): string {
  switch (type) {
    case "gym":
      return "חדר כושר"
    case "clubhouse":
      return "מתחם משותף"
    default:
      return type || "מתקן"
  }
}

function buildBookingFormSchema(capacity: number) {
  return z
    .object({
      bookingDate: z.string().min(1, "נא לבחור תאריך"),
      startTime: z.string().min(1, "נא לבחור שעת התחלה"),
      endTime: z.string().min(1, "נא לבחור שעת סיום"),
      partySize: z
        .number()
        .int()
        .min(1, "מינימום משתתף אחד")
        .max(capacity, `עד ${capacity} משתתפים במשבצת`),
      healthAccepted: z.boolean().refine((v) => v === true, {
        message: "יש לאשר את הצהרת הבריאות",
      }),
    })
    .superRefine((data, ctx) => {
      const start = new Date(`${data.bookingDate}T${data.startTime}:00`)
      const end = new Date(`${data.bookingDate}T${data.endTime}:00`)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "תאריך או שעה לא תקינים",
          path: ["endTime"],
        })
        return
      }
      if (end <= start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "שעת הסיום חייבת להיות אחרי שעת ההתחלה",
          path: ["endTime"],
        })
      }
    })
}

type AmenityBookingFormProps = {
  amenity: TenantAmenity
  todayStr: string
  onSuccess: () => void
}

function AmenityBookingForm({
  amenity,
  todayStr,
  onSuccess,
}: AmenityBookingFormProps) {
  const [pending, startTransition] = useTransition()

  const formSchema = useMemo(
    () => buildBookingFormSchema(amenity.capacity_per_slot),
    [amenity.capacity_per_slot]
  )

  type FormValues = z.infer<ReturnType<typeof buildBookingFormSchema>>

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      bookingDate: todayStr,
      startTime: "09:00",
      endTime: "10:00",
      partySize: 1,
      healthAccepted: false,
    },
  })

  function onSubmit(values: FormValues) {
    const startsAt = new Date(
      `${values.bookingDate}T${values.startTime}:00`
    ).toISOString()
    const endsAt = new Date(
      `${values.bookingDate}T${values.endTime}:00`
    ).toISOString()

    startTransition(async () => {
      const result = await createAmenityBooking({
        amenityId: amenity.id,
        startsAt,
        endsAt,
        partySize: values.partySize,
        healthAccepted: values.healthAccepted,
      })
      if (result.ok) {
        toast.success("ההזמנה נקלטה בהצלחה")
        onSuccess()
        form.reset()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <>
      <SheetHeader className="border-b border-border/60 px-4 py-4 text-start">
        <SheetTitle className="text-lg">הזמנת {amenity.name}</SheetTitle>
        <SheetDescription>
          {amenityCategoryHe(amenity.type)} · עד {amenity.capacity_per_slot}{" "}
          משתתפים · משבצת {amenity.slot_minutes} דק׳
        </SheetDescription>
      </SheetHeader>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex max-h-[min(72dvh,560px)] flex-col overflow-hidden"
          noValidate
        >
          <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4">
            <FormField
              control={form.control}
              name="bookingDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>תאריך</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      min={todayStr}
                      disabled={pending}
                      className="font-medium"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>שעת התחלה</FormLabel>
                    <FormControl>
                      <Input type="time" disabled={pending} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>שעת סיום</FormLabel>
                    <FormControl>
                      <Input type="time" disabled={pending} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="partySize"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>מספר משתתפים</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={amenity.capacity_per_slot}
                      disabled={pending}
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={field.value}
                      onChange={(e) => {
                        const n = e.target.valueAsNumber
                        field.onChange(Number.isNaN(n) ? 1 : n)
                      }}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    מקסימום {amenity.capacity_per_slot} לפי קיבולת המתקן.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="healthAccepted"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-xl border border-border/60 bg-muted/20 p-3">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) =>
                        field.onChange(checked === true)
                      }
                      disabled={pending}
                      className="mt-0.5"
                    />
                  </FormControl>
                  <div className="space-y-1 leading-snug">
                    <FormLabel className="cursor-pointer font-medium text-foreground">
                      הצהרת בריאות (חובה)
                    </FormLabel>
                    <p className="text-xs text-muted-foreground">
                      אני מאשר/ת כי אין לי חום או תסמיני מחלה, ואני מתחייב/ת לעמוד
                      בכללי התנהגות ובטיחות במתקן, לפי הנחיות הנכס.
                    </p>
                    <FormMessage />
                  </div>
                </FormItem>
              )}
            />
          </div>

          <SheetFooter className="border-t border-border/60 bg-background/95 px-4 py-4">
            <Button
              type="submit"
              className="h-12 w-full gap-2 text-base"
              disabled={pending}
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  שולחים…
                </>
              ) : (
                "אישור הזמנה"
              )}
            </Button>
          </SheetFooter>
        </form>
      </Form>
    </>
  )
}

type TenantAmenitiesViewProps = {
  amenities: TenantAmenity[]
  error: string | null
}

export function TenantAmenitiesView({ amenities, error }: TenantAmenitiesViewProps) {
  const [selected, setSelected] = useState<TenantAmenity | null>(null)
  const todayStr = useMemo(() => format(new Date(), "yyyy-MM-dd"), [])

  return (
    <>
      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          לא ניתן לטעון מתקנים: {error}
        </div>
      ) : amenities.length === 0 ? (
        <div className="flex min-h-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/20 px-6 py-12 text-center">
          <Building2 className="mb-3 size-11 text-muted-foreground/60" aria-hidden />
          <p className="text-sm font-medium text-foreground">אין מתקנים זמינים כרגע</p>
          <p className="mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">
            כשהנכס יגדיר מתקנים פעילים, תוכלו להזמין משבצת ישירות מכאן.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {amenities.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => setSelected(a)}
                className={cn(
                  "w-full rounded-2xl border border-border/70 bg-card/70 text-start shadow-sm transition-all",
                  "hover:border-primary/40 hover:bg-card active:scale-[0.99]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                )}
              >
                <Card className="border-0 bg-transparent shadow-none">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <CardTitle className="text-base font-semibold leading-snug">
                          {a.name}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {amenityCategoryHe(a.type)}
                        </CardDescription>
                      </div>
                      <Badge
                        variant="outline"
                        className="shrink-0 border-emerald-500/35 bg-emerald-500/10 text-emerald-900 dark:text-emerald-300"
                      >
                        זמין
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-4 pt-0 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="size-4 shrink-0 opacity-80" aria-hidden />
                      <span>
                        עד{" "}
                        <span className="font-medium tabular-nums text-foreground">
                          {a.capacity_per_slot}
                        </span>{" "}
                        משתתפים
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays className="size-4 shrink-0 opacity-80" aria-hidden />
                      <span>משבצת {a.slot_minutes} דק׳</span>
                    </span>
                  </CardContent>
                </Card>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={selected != null}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      >
        <SheetContent
          side="bottom"
          showCloseButton
          dir="rtl"
          className="max-h-[min(92dvh,720px)] gap-0 overflow-hidden rounded-t-2xl p-0"
        >
          {selected ? (
            <AmenityBookingForm
              key={selected.id}
              amenity={selected}
              todayStr={todayStr}
              onSuccess={() => setSelected(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  )
}
