"use client"

/**
 * ItemLogisticsTab — Phase 7.13.4
 *
 * טאב "לוגיסטיקה ומלאי" editable. חושף את ה-toggles וה-UOM של קנייה:
 *   • is_inventory_managed  (האם מנוהל מלאי — קובע אם נכנס ל-GR/Inventory valuation)
 *   • is_serial_tracked     (האם מנהל מספרים סידוריים)
 *   • purchasing_uom        (יחידת קניה, code-based — FK רך ל-units_of_measure.code)
 *   • conversion_factor     (שעור המרה ליחידת בסיס)
 *
 * הרציונל:
 *   אלה השדות הקריטיים לקראת מודול מלאי/GR עתידי. "האם מנוהל מלאי" קובע
 *   אם הפריט נכנס בכלל לתנועות מלאי. "מספרים סידוריים" מפעיל UI נוסף ב-GR.
 *   "יחידת קניה" + "שעור המרה" ממירים כמות מהפו"ר ליחידת בסיס של המלאי.
 */

import * as React from "react"
import { Controller, useFormContext, useWatch } from "react-hook-form"
import { Boxes, Hash, Warehouse } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

import type {
  ItemEditFormValues,
  UomLookupOption,
} from "./item-edit-form-types"

export interface ItemLogisticsTabProps {
  /** רשימת יחידות מידה (גלובלי + פרטי לחברה, דה-דופ לפי code). */
  uoms: UomLookupOption[]
  /** קוד יחידת הבסיס (unitOfMeasure) של הפריט — מוצג read-only להקשר. */
  baseUom: string | null
  /** האם רשימת ה-UOM עדיין בטעינה. */
  uomsLoading?: boolean
}

export function ItemLogisticsTab({
  uoms,
  baseUom,
  uomsLoading = false,
}: ItemLogisticsTabProps) {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<ItemEditFormValues>()

  // ה-lock של conversionFactor מופעל רק כשיחידת הקנייה זהה ליחידת הבסיס.
  const purchasingUom = useWatch({ control, name: "purchasingUom" })
  const sameUom =
    Boolean(baseUom) &&
    Boolean(purchasingUom) &&
    purchasingUom.trim() === baseUom?.trim()

  return (
    <div className="space-y-4">
      {/* ── ניהול מלאי ── */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Warehouse className="size-4 text-muted-foreground" aria-hidden />
            <CardTitle>ניהול מלאי</CardTitle>
          </div>
          <CardDescription>
            קובע אם הפריט נכנס לתנועות מלאי ולהערכת שווי.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Controller
            control={control}
            name="isInventoryManaged"
            render={({ field }) => (
              <SwitchRow
                id="log-inv"
                label="פריט מנוהל מלאי"
                description='כבה אם הפריט לא נכנס למלאי (שירות, חד-פעמי, פריט Expense).'
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
          <Controller
            control={control}
            name="isSerialTracked"
            render={({ field }) => (
              <SwitchRow
                id="log-serial"
                label="ניהול מספרים סידוריים"
                description="נדרש עבור פריטי ציוד עם מזהה ייחודי (אחריות, הפרדה ב-GR)."
                icon={<Hash className="size-4" aria-hidden />}
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
        </CardContent>
      </Card>

      {/* ── יחידת קניה + המרה ── */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Boxes className="size-4 text-muted-foreground" aria-hidden />
            <CardTitle>יחידת קניה</CardTitle>
          </div>
          <CardDescription>
            יחידת הקניה מהספק ושעור ההמרה ליחידת הבסיס של הפריט.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="log-base-uom">יחידת בסיס</Label>
              <Input
                id="log-base-uom"
                value={baseUom ?? ""}
                readOnly
                disabled
                dir="rtl"
                className="bg-muted/40 font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                נקבעת בעת יצירת הפריט; לא ניתן לשינוי מכאן.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="log-purchasing-uom">יחידת קניה</Label>
              <Controller
                control={control}
                name="purchasingUom"
                render={({ field }) => (
                  <select
                    id="log-purchasing-uom"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                    disabled={uomsLoading}
                    dir="rtl"
                    className={cn(
                      "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      "disabled:cursor-not-allowed disabled:opacity-50"
                    )}
                  >
                    <option value="">
                      {uomsLoading
                        ? "טוען…"
                        : `ברירת מחדל: ${baseUom || "(זהה ליח' בסיס)"}`}
                    </option>
                    {uoms.map((u) => (
                      <option key={u.id} value={u.code}>
                        {u.code} — {u.descriptionHe}
                      </option>
                    ))}
                  </select>
                )}
              />
              <p className="text-[11px] text-muted-foreground">
                לדוגמה: אם היחידה היא &quot;יח&apos;&quot; והקניה &quot;ארגז
                של 12&quot; — בחר ארגז.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="log-cf">שעור המרה ליחידת בסיס</Label>
            <Input
              id="log-cf"
              dir="ltr"
              inputMode="decimal"
              className="font-mono"
              disabled={sameUom}
              {...register("conversionFactor", {
                validate: (v) => {
                  if (sameUom) return true
                  const cfStr = v.trim().replace(",", ".")
                  if (!/^\d+(\.\d{1,4})?$/.test(cfStr))
                    return "מספר חיובי, עד 4 ספרות עשרוניות"
                  const n = Number(cfStr)
                  if (!Number.isFinite(n) || n <= 0) return "חייב להיות גדול מ-0"
                  return true
                },
              })}
              placeholder="1"
            />
            <p className="text-[11px] text-muted-foreground">
              {sameUom
                ? "יחידת הקניה זהה ליחידת הבסיס — שעור ההמרה ננעל ל-1."
                : 'כמה יחידות בסיס שוות ליחידת קניה אחת. דוגמה: ק"ג ל-טון = 1000.'}
            </p>
            {errors.conversionFactor ? (
              <p className="text-[11px] text-destructive">
                {errors.conversionFactor.message}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ----------------------------------------------------------------------------
// SwitchRow — תצוגת toggle אחידה עם תווית + תיאור + איקון אופציונלי.
// ----------------------------------------------------------------------------

function SwitchRow({
  id,
  label,
  description,
  icon,
  checked,
  onCheckedChange,
}: {
  id: string
  label: string
  description: string
  icon?: React.ReactNode
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-border/60 bg-muted/20 p-3">
      <div className="flex items-start gap-2">
        {icon ? <span className="mt-0.5 text-muted-foreground">{icon}</span> : null}
        <div className="space-y-1">
          <Label htmlFor={id} className="cursor-pointer text-sm font-medium">
            {label}
          </Label>
          <p className="text-[11px] text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}
