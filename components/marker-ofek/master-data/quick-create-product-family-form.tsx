"use client"

/**
 * QuickCreateProductFamilyForm — טופס יצירה מהירה למשפחת מוצר.
 *
 * נטען בתוך `<DrilldownSheet>` בזרם F2 מטופס פריט.
 * שולח POST ל-`/api/master-data/product-families` ומחזיר את הרשומה החדשה
 * דרך `onCreated` callback. האב אחראי על append+auto-select.
 *
 * שדות (מותאמים לתקן ERP — ראה `onboarding-master-data-templates.md`):
 *  - familyCode  → עמודת "משפחה":       CHAR(8),  חובה (M)
 *  - familyName  → עמודת "תאור משפחה": RCHAR(32), אופציונלית-במהות (אנו מחילים בתור חובה ל-UX ברור)
 *
 * TODO(Phase Master Data Admin):
 *   שדה נוסף "טיפוס משפחה" (CHAR(4), FK ל-`erp_item_family_types`) מוערך הקמה מהירה זו.
 *   ייוסף במסך ניהול Master Data המלא (CRUD על `erp_item_family_types`) — לא סקופ של Quick Create.
 *
 * UX:
 *  - Auto-uppercase ל-familyCode בעת ההקלדה (ה-API גם עושה toUpperCase כ-defense).
 *  - Trim על שני השדות לפני שליחה.
 *  - Enter בתוך השדה האחרון = submit (טופס HTML רגיל).
 *  - שגיאת validation מצד-לקוח לפני שליחה לשרת (חוסך round-trip).
 */

import * as React from "react"
import { Loader2, Save } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { cn, formatError } from "@/lib/utils"

export interface ProductFamilyCreated {
  id: string
  companyId: string
  familyCode: string
  familyName: string
}

export interface QuickCreateProductFamilyFormProps {
  /** קוד מוצע מראש (אופציונלי). למשל אם המשתמש כבר התחיל לכתוב. */
  initialCode?: string
  /** שם מוצע מראש. */
  initialName?: string
  /** רשימת קודים קיימים — לבדיקת כפילות מצד-לקוח. */
  existingCodes?: string[]
  onCreated: (family: ProductFamilyCreated) => void
  onCancel: () => void
}

// פורמט קוד על פי תקן ERP (onboarding-master-data-templates.md):
//   • מתחיל באות/ספרה.
//   • עד 8 תווים (CHAR(8)).
//   • תווי פנימיים מותרים: אותיות גדולות, ספרות, קו תחתון, מקף,
//     נקודה ו-slash — ככלול לקודים היררכיים כמו "88.038" או "08.30.02".
//
// הערה: ה-DB מחזיק varchar(32) עבור `family_code` — ההגבלה הקשוחה של 8 היא
// כלל UX בלבד (להתאמת תקן ERP). לא נדרשות תיקוני סכמה לפעולה הזאת.
const FAMILY_CODE_MAX_LEN = 8
const FAMILY_NAME_MAX_LEN = 32
const FAMILY_CODE_RE = /^[A-Z0-9][A-Z0-9_./-]{0,7}$/

export function QuickCreateProductFamilyForm({
  initialCode,
  initialName,
  existingCodes,
  onCreated,
  onCancel,
}: QuickCreateProductFamilyFormProps) {
  const [familyCode, setFamilyCode] = React.useState(
    (initialCode ?? "").toUpperCase()
  )
  const [familyName, setFamilyName] = React.useState(initialName ?? "")
  const [pending, setPending] = React.useState(false)
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const codeInputRef = React.useRef<HTMLInputElement>(null)

  // Focus ראשוני על שדה הקוד כשה-Sheet נפתח
  React.useEffect(() => {
    codeInputRef.current?.focus()
  }, [])

  const trimmedCode = familyCode.trim()
  const trimmedName = familyName.trim()

  const validation = React.useMemo(() => {
    const errors: string[] = []
    if (!trimmedCode) errors.push("קוד משפחה חובה")
    else if (trimmedCode.length > FAMILY_CODE_MAX_LEN)
      errors.push(`קוד משפחה מוגבל ל-${FAMILY_CODE_MAX_LEN} תווים (תקן ERP: CHAR(8))`)
    else if (!FAMILY_CODE_RE.test(trimmedCode))
      errors.push(
        `קוד משפחה: אותיות אנגלית גדולות, ספרות, מקף/קו-תחתון, נקודה או /; אות/מספר ראשון; עד ${FAMILY_CODE_MAX_LEN} תווים`
      )
    else if (existingCodes?.includes(trimmedCode))
      errors.push(`קוד "${trimmedCode}" כבר קיים`)
    if (!trimmedName) errors.push("שם משפחה חובה")
    if (trimmedName.length > FAMILY_NAME_MAX_LEN)
      errors.push(`תאור משפחה מוגבל ל-${FAMILY_NAME_MAX_LEN} תווים (תקן ERP: RCHAR(32))`)
    return { errors, ok: errors.length === 0 }
  }, [trimmedCode, trimmedName, existingCodes])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    if (!validation.ok) {
      toast.error(validation.errors.join(" · "))
      return
    }
    setPending(true)
    try {
      const created = await masterDataFetch<ProductFamilyCreated>(
        "/api/master-data/product-families",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            familyCode: trimmedCode,
            familyName: trimmedName,
          }),
        }
      )
      toast.success(`משפחה "${created.familyCode}" נוצרה`, {
        duration: 4000,
      })
      onCreated(created)
    } catch (err) {
      const message = formatError(err) || "יצירת משפחה נכשלה"
      // לוג מלא ל-console ל-debug + inline error מתמשך עד ללחיצה הבאה + toast מאריך.
      console.error("[QuickCreateProductFamilyForm] submit failed", err)
      setSubmitError(message)
      toast.error(message, { duration: 8000 })
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
          <Label htmlFor="qcf-code" className="flex items-center gap-1">
            קוד משפחה
            <span aria-hidden className="text-destructive">
              *
            </span>
          </Label>
          <Input
            id="qcf-code"
            ref={codeInputRef}
            value={familyCode}
            onChange={(e) => setFamilyCode(e.target.value.toUpperCase())}
            placeholder='למשל: "88.038"'
            dir="ltr"
            className="font-mono"
            maxLength={FAMILY_CODE_MAX_LEN}
            autoComplete="off"
            disabled={pending}
          />
          <p className="text-[11px] text-muted-foreground">
            תקן ERP: CHAR({FAMILY_CODE_MAX_LEN}) — אותיות גדולות, ספרות, נקודות, מקפים או /. ייחודי לחברה.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="qcf-name" className="flex items-center gap-1">
            שם תצוגה
            <span aria-hidden className="text-destructive">
              *
            </span>
          </Label>
          <Input
            id="qcf-name"
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            placeholder="למשל: מובילים"
            dir="rtl"
            maxLength={FAMILY_NAME_MAX_LEN}
            autoComplete="off"
            disabled={pending}
          />
          <p className="text-[11px] text-muted-foreground">
            תקן ERP: RCHAR({FAMILY_NAME_MAX_LEN}).
          </p>
        </div>

        {!validation.ok && (trimmedCode || trimmedName) ? (
          <ul className="list-inside list-disc text-[11px] text-destructive">
            {validation.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        ) : null}

        {submitError ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-[12px] leading-relaxed text-destructive"
          >
            <div className="font-semibold">שמירה נכשלה</div>
            <div className="mt-1 break-words font-mono" dir="ltr">
              {submitError}
            </div>
          </div>
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
