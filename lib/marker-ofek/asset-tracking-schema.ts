import { z } from "zod"

/** סטטוס כלי במלאי / בשטח */
export const assetStatusSchema = z.enum(["זמין", "בשימוש"])
export type AssetStatus = z.infer<typeof assetStatusSchema>

export const MOCK_WORKER_OPTIONS = [
  "דני לוי",
  "מאיר אברהם",
  "יוסי כהן",
  "רונית שמעוני",
  "עומר חדד",
] as const

/** קטלוג כלי עבודה (מאסטר) — דמה; `status` ברירת מחדל במלאי (בשימוש בפועל = רשומת ניפוק פעילה) */
export type MockAssetDefinition = {
  id: string
  name: string
  status: AssetStatus
}

export const MOCK_ASSET_DEFINITIONS: readonly MockAssetDefinition[] = [
  {
    id: "mo-asset-makita-18v",
    name: "פטישון מקיטה 18V",
    status: "זמין",
  },
  {
    id: "mo-asset-fluke-dmm",
    name: "מגר דיגיטלי פלוק",
    status: "זמין",
  },
  {
    id: "mo-asset-ladder-fg-8",
    name: "סולם פיברגלס 8 שלבים",
    status: "זמין",
  },
]

/** סטטוס אפקטיבי: ניפוק פעיל ⇒ בשימוש, אחרת לפי המאסטר */
export function getEffectiveAssetStatus(
  assetId: string,
  activeCheckoutAssetIds: ReadonlySet<string>
): AssetStatus {
  return activeCheckoutAssetIds.has(assetId) ? "בשימוש" : "זמין"
}

/** ימי איחור לפי תאריך יעד (חיובי = באיחור) */
export function daysPastDue(expectedReturnIso: string, todayIso: string): number {
  const a = new Date(`${expectedReturnIso}T12:00:00`).getTime()
  const b = new Date(`${todayIso}T12:00:00`).getTime()
  const diff = Math.round((b - a) / 86_400_000)
  return diff > 0 ? diff : 0
}

/**
 * טופס ניפוק כלי — Zod (RHF).
 * `assetId` — בחירה מרשימת כלים זמינים בלבד (מסונן ב־UI).
 */
export const assetCheckoutFormSchema = z
  .object({
    assetId: z.string().min(1, "בחרו כלי עבודה"),
    assignedTo: z.string().min(1, "נא לציין אצל מי הכלי"),
    checkoutDate: z.string().min(1, "תאריך ניפוק"),
    expectedReturnDate: z.string().min(1, "תאריך החזרה משוער"),
    notes: z.string().default(""),
  })
  .superRefine((data, ctx) => {
    if (data.checkoutDate && data.expectedReturnDate) {
      if (data.expectedReturnDate < data.checkoutDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["expectedReturnDate"],
          message: "תאריך החזרה חייב להיות אחרי או בשווה לתאריך הניפוק",
        })
      }
    }
  })

export type AssetCheckoutFormInput = z.input<typeof assetCheckoutFormSchema>
export type AssetCheckoutFormOutput = z.infer<typeof assetCheckoutFormSchema>

export function defaultAssetCheckoutFormValues(
  todayIso: string
): AssetCheckoutFormOutput {
  return {
    assetId: "",
    assignedTo: "",
    checkoutDate: todayIso,
    expectedReturnDate: todayIso,
    notes: "",
  }
}

/** רשומת ניפוק פעיל (שדה / מחסן) */
export type ActiveAssetCheckout = {
  checkoutId: string
  assetId: string
  assignedTo: string
  checkoutDate: string
  expectedReturnDate: string
  notes: string
}

function isoDateAddDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/**
 * דמה התחלתי: כלי אחד כבר בשטח + החזרה איחור (לצביעת שורה).
 * הערכים יחסיים ל־`todayIso` בצד הלקוח.
 */
export function seedActiveCheckouts(todayIso: string): ActiveAssetCheckout[] {
  return [
    {
      checkoutId: "chk-seed-1",
      assetId: "mo-asset-ladder-fg-8",
      assignedTo: "יוסי כהן",
      checkoutDate: isoDateAddDays(todayIso, -14),
      expectedReturnDate: isoDateAddDays(todayIso, -10),
      notes: "עבודות גג — איחור חמור (דמה) לצביעת שורה אדומה",
    },
  ]
}
