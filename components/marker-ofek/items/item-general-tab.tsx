"use client"

/**
 * ItemGeneralTab — Phase 7.13.4
 *
 * טאב "כללי" editable בכרטיס פריט. חושף את שדות הזיהוי והמיון:
 *   • description          (תיאור עברי, חובה)
 *   • descriptionEn        (תיאור לועזי / English)
 *   • barcode              (ברקוד — חדש ב-7.13.4)
 *   • status               (פעיל / לא פעיל / רכש בלבד / פנימי / obsolete)
 *   • minOrderQuantity     (כמות מינימלית להזמנה)
 *
 * לא כולל כאן: SKU (לא ניתן לעריכה אחרי יצירה), משפחת מוצר (דורש
 * migration של hierarchy), או שדות לוגיסטיקה/מחירים (טאבים ייעודיים).
 *
 * הטופס מוכל ב-`FormProvider` של הדף; הרכיב קורא לו דרך `useFormContext`.
 */

import * as React from "react"
import { Controller, useFormContext } from "react-hook-form"
import { ScanLine } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

import {
  ITEM_STATUS_OPTIONS,
  type ItemEditFormValues,
} from "./item-edit-form-types"

export function ItemGeneralTab() {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<ItemEditFormValues>()

  return (
    <div className="space-y-4">
      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle>זיהוי ותיאור</CardTitle>
          <CardDescription>
            תיאורים בעברית/אנגלית, ברקוד, סטטוס וכמות מינימום להזמנה.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gen-desc">
              תיאור (עברית) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="gen-desc"
              dir="rtl"
              {...register("description", {
                required: "תיאור חובה",
                maxLength: { value: 200, message: "תיאור עד 200 תווים" },
              })}
              placeholder="לדוגמה: ברז כדורי פליז 1 אינץ&quot;"
            />
            {errors.description ? (
              <p className="text-[11px] text-destructive">
                {errors.description.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="gen-desc-en">תיאור לועזי (English)</Label>
            <Input
              id="gen-desc-en"
              dir="ltr"
              {...register("descriptionEn")}
              placeholder="Brass ball valve 1 inch"
            />
            <p className="text-[11px] text-muted-foreground">
              משמש ל-RFQ בינלאומי, הצעות מחיר במטבעות זרים ו-OCR של מסמכי ספק.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="gen-barcode" className="flex items-center gap-1.5">
                <ScanLine className="size-3.5" aria-hidden />
                ברקוד
              </Label>
              <Input
                id="gen-barcode"
                dir="ltr"
                {...register("barcode")}
                className="font-mono"
                placeholder="7290000000000"
              />
              <p className="text-[11px] text-muted-foreground">
                EAN-13 / UPC / Code-128 — לסריקה בקבלת סחורה וספירת מלאי.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gen-status">סטטוס</Label>
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <select
                    id="gen-status"
                    value={field.value}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value as ItemEditFormValues["status"]
                      )
                    }
                    dir="rtl"
                    className={cn(
                      "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    )}
                  >
                    {ITEM_STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                )}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gen-moq">כמות מינימום להזמנה</Label>
            <Input
              id="gen-moq"
              dir="ltr"
              inputMode="decimal"
              className="font-mono"
              {...register("minOrderQuantity", {
                validate: (v) => {
                  if (!v.trim()) return true
                  const n = Number(v.trim().replace(",", "."))
                  if (!Number.isFinite(n) || n < 0) return "מספר לא שלילי"
                  return true
                },
              })}
              placeholder="1"
            />
            {errors.minOrderQuantity ? (
              <p className="text-[11px] text-destructive">
                {errors.minOrderQuantity.message}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
