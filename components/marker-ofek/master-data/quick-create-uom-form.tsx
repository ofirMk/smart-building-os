"use client"

/**
 * QuickCreateUomForm — טופס יצירה מהירה ליחידת מידה (Master Data).
 *
 * נטען בתוך `<DrilldownSheet>` בזרם F2 מטופס פריט.
 * שולח POST ל-`/api/master-data/uoms` ומחזיר את הרשומה החדשה דרך `onCreated`.
 * האב אחראי על append+auto-select.
 *
 * שדות:
 *  - code: קוד יחידה (UPPERCASE, A-Z 0-9 _ -, עד 16 תווים). ייחודי בחברה
 *    ולא מתנגש עם UOM גלובלי קיים.
 *  - descriptionHe: שם תצוגה בעברית (חובה, ≤ 100 תווים).
 *  - nameEn: שם באנגלית (אופציונלי, ≤ 128 תווים).
 *
 * UX:
 *  - Auto-uppercase ל-code בעת ההקלדה.
 *  - Trim על כל השדות לפני שליחה.
 *  - שגיאת validation מצד-לקוח לפני שליחה לשרת.
 */

import * as React from "react"
import { Loader2, Save } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { cn, formatError } from "@/lib/utils"

export interface UomCreated {
  id: string
  code: string
  descriptionHe: string
  nameEn: string
  /** null = גלובלי, ערך = ספציפי לחברה הפעילה */
  companyId: string | null
}

export interface QuickCreateUomFormProps {
  /** קוד מוצע מראש (אופציונלי). למשל אם המשתמש כבר התחיל לכתוב. */
  initialCode?: string
  /** שם עברי מוצע מראש. */
  initialDescriptionHe?: string
  /** קודי UOM קיימים — לבדיקת כפילות מצד-לקוח (מהיר יותר מ-roundtrip). */
  existingCodes?: string[]
  onCreated: (uom: UomCreated) => void
  onCancel: () => void
}

const UOM_CODE_RE = /^[A-Z0-9][A-Z0-9_-]{0,15}$/

export function QuickCreateUomForm({
  initialCode,
  initialDescriptionHe,
  existingCodes,
  onCreated,
  onCancel,
}: QuickCreateUomFormProps) {
  const [code, setCode] = React.useState((initialCode ?? "").toUpperCase())
  const [descriptionHe, setDescriptionHe] = React.useState(
    initialDescriptionHe ?? ""
  )
  const [nameEn, setNameEn] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const codeInputRef = React.useRef<HTMLInputElement>(null)

  // Focus ראשוני על שדה הקוד כשה-Sheet נפתח
  React.useEffect(() => {
    codeInputRef.current?.focus()
    codeInputRef.current?.select()
  }, [])

  const trimmedCode = code.trim()
  const trimmedDesc = descriptionHe.trim()
  const trimmedNameEn = nameEn.trim()

  const validation = React.useMemo(() => {
    const errors: string[] = []
    if (!trimmedCode) errors.push("קוד יחידה חובה")
    else if (!UOM_CODE_RE.test(trimmedCode))
      errors.push(
        "קוד: A-Z, 0-9, _ או - בלבד; אות/מספר ראשון; עד 16 תווים"
      )
    else if (existingCodes?.includes(trimmedCode))
      errors.push(`קוד "${trimmedCode}" כבר קיים`)
    if (!trimmedDesc) errors.push("שם בעברית חובה")
    if (trimmedDesc.length > 100) errors.push("שם בעברית מוגבל ל-100 תווים")
    if (trimmedNameEn.length > 128)
      errors.push("שם באנגלית מוגבל ל-128 תווים")
    return { errors, ok: errors.length === 0 }
  }, [trimmedCode, trimmedDesc, trimmedNameEn, existingCodes])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validation.ok) {
      toast.error(validation.errors.join(" · "))
      return
    }
    setPending(true)
    try {
      const created = await masterDataFetch<UomCreated>(
        "/api/master-data/uoms",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: trimmedCode,
            descriptionHe: trimmedDesc,
            nameEn: trimmedNameEn || undefined,
          }),
        }
      )
      toast.success(`יחידת מידה "${created.code}" נוצרה`)
      onCreated(created)
    } catch (err) {
      toast.error(formatError(err) || "יצירת יחידת מידה נכשלה")
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="flex h-full flex-col gap-4"
      dir="rtl"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="qcu-code" className="flex items-center gap-1">
            קוד יחידה
            <span aria-hidden className="text-destructive">
              *
            </span>
          </Label>
          <Input
            id="qcu-code"
            ref={codeInputRef}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="למשל: KG, M, EA, BOX"
            dir="ltr"
            className="font-mono"
            maxLength={16}
            autoComplete="off"
            disabled={pending}
          />
          <p className="text-[11px] text-muted-foreground">
            אותיות גדולות, מספרים, מקפים. ייחודי לחברה ולא מתנגש עם קוד גלובלי.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="qcu-desc" className="flex items-center gap-1">
            שם בעברית
            <span aria-hidden className="text-destructive">
              *
            </span>
          </Label>
          <Input
            id="qcu-desc"
            value={descriptionHe}
            onChange={(e) => setDescriptionHe(e.target.value)}
            placeholder="למשל: קילוגרם, מטר, יחידה, ארגז"
            dir="rtl"
            maxLength={100}
            autoComplete="off"
            disabled={pending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="qcu-name-en">שם באנגלית (אופציונלי)</Label>
          <Input
            id="qcu-name-en"
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            placeholder="e.g. Kilogram, Meter, Each"
            dir="ltr"
            maxLength={128}
            autoComplete="off"
            disabled={pending}
          />
        </div>

        {!validation.ok && (trimmedCode || trimmedDesc) ? (
          <ul className="list-inside list-disc text-[11px] text-destructive">
            {validation.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="mt-auto flex items-center gap-2 pt-4">
        <Button
          type="submit"
          disabled={pending || !validation.ok}
          className={cn("gap-2")}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          שמור
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={pending}
        >
          ביטול
        </Button>
      </div>
    </form>
  )
}
