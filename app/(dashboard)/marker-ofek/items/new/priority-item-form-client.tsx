"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { Loader2, Save, ArrowRight, Hash, ScanLine } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { DrilldownSheet } from "@/components/marker-ofek/forms/drilldown-sheet"
import { F2LookupField } from "@/components/marker-ofek/forms/f2-lookup-field"
import {
  QuickCreateProductFamilyForm,
  type ProductFamilyCreated,
} from "@/components/marker-ofek/master-data/quick-create-product-family-form"
import {
  QuickCreateUomForm,
  type UomCreated,
} from "@/components/marker-ofek/master-data/quick-create-uom-form"
import { useF2Listener } from "@/lib/marker-ofek/hooks/use-f2-listener"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { cn, formatError } from "@/lib/utils"

// הטקסט hint המואחד מתחת לכל שדה lookup — לפי בקשת המשתמש (Phase 4 SOP).
const F2_HINT = "לחץ F2 ליצירת רשומה חדשה"

// ────────────────────────────────────────────────────────────────────────────
// Lookup types
// ────────────────────────────────────────────────────────────────────────────

type ProductFamilyOption = {
  id: string
  familyCode: string
  name?: string
  familyName?: string
}

type SupplierOption = {
  id: string
  name: string
  supplierNumber?: string | null
}

type UomOption = {
  id: string
  code: string
  descriptionHe: string
  nameEn: string
  /** null = גלובלי, ערך = ספציפי לחברה */
  companyId: string | null
}

type SubmitItem = {
  itemNumber: string
  description: string
  foreignDescription?: string
  productFamilyId: string
  itemType: "R" | "P" | "S" | "K"
  unitOfMeasure: string
  factoryUom?: string
  conversionFactor: number
  preferredSupplierId?: string
  defaultPrice?: number
  isInventoryManaged: boolean
  // ── Phase 7.13.4 Logistics Enrichment ──
  barcode?: string
  purchasingUom?: string
  isSerialTracked?: boolean
  standardCost?: number
  imageUrl?: string
}

// ────────────────────────────────────────────────────────────────────────────
// Static option sets (ERP-aligned)
// ────────────────────────────────────────────────────────────────────────────

const ITEM_TYPE_OPTIONS: Array<{ value: SubmitItem["itemType"]; label: string; hint: string }> = [
  { value: "R", label: "R — חומר גלם", hint: "פריט נרכש (Raw / Purchased)" },
  { value: "P", label: "P — מוצר", hint: "מוצר שמיוצר אצלכם (Product)" },
  { value: "S", label: "S — שרות", hint: "פריט שרות (Service)" },
  { value: "K", label: "K — קיט", hint: "מקבץ פריטים (Kit)" },
]

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

export function PriorityItemFormClient() {
  const router = useRouter()

  // form state — 10 fields per ERP SOP Stage A + 5 שדות Phase 7.13.4 Logistics Enrichment
  const [itemNumber, setItemNumber] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [foreignDescription, setForeignDescription] = React.useState("")
  const [productFamilyId, setProductFamilyId] = React.useState("")
  const [itemType, setItemType] = React.useState<SubmitItem["itemType"]>("R")
  // UOM — מאז מגירציה 20260720 מושך ממאסטר אמיתי ולא מרשימה סטטית.
  // הגיבוי הראשוני מומש אחרי טעינת ה-lookups — מעדיף את EA אם קיים.
  const [unitOfMeasure, setUnitOfMeasure] = React.useState("")
  const [factoryUom, setFactoryUom] = React.useState("")
  const [conversionFactor, setConversionFactor] = React.useState("1")
  const [preferredSupplierId, setPreferredSupplierId] = React.useState("")
  const [defaultPrice, setDefaultPrice] = React.useState("")
  const [isInventoryManaged, setIsInventoryManaged] = React.useState(true)
  // ── Phase 7.13.4 Logistics Enrichment ──
  const [barcode, setBarcode] = React.useState("")
  const [purchasingUom, setPurchasingUom] = React.useState("")
  const [isSerialTracked, setIsSerialTracked] = React.useState(false)
  const [standardCost, setStandardCost] = React.useState("")
  const [imageUrl, setImageUrl] = React.useState("")

  // ── F2 Drill-Down state ──
  // Sheet שולט במצב פתוח/סגור. State של הטופס האב נשמר אוטומטית כי הוא לא מתפרק.
  const [familyModalOpen, setFamilyModalOpen] = React.useState(false)
  const [uomModalOpen, setUomModalOpen] = React.useState(false)
  // איזה משדות ה-UOM הפעיל את ה-F2 — קובע איפה לכתוב את הערך החדש בעת שמירה.
  const [uomTarget, setUomTarget] = React.useState<
    "unitOfMeasure" | "factoryUom" | null
  >(null)
  // refs לשדות ה-trigger — להחזרת focus אחרי סגירת ה-Sheet.
  const familySelectRef = React.useRef<HTMLSelectElement>(null)
  const uomSelectRef = React.useRef<HTMLSelectElement>(null)
  const factoryUomSelectRef = React.useRef<HTMLSelectElement>(null)

  // lookups
  const [families, setFamilies] = React.useState<ProductFamilyOption[]>([])
  const [suppliers, setSuppliers] = React.useState<SupplierOption[]>([])
  const [units, setUnits] = React.useState<UomOption[]>([])
  const [lookupsLoading, setLookupsLoading] = React.useState(true)
  const [lookupError, setLookupError] = React.useState<string | null>(null)

  // submission state
  const [pending, setPending] = React.useState(false)

  // Auto-default factory_uom = unit_of_measure when factory empty (standard ERP behavior)
  const factoryUomEffective = factoryUom.trim() || unitOfMeasure.trim()
  const sameUom = factoryUomEffective === unitOfMeasure.trim()

  // ── F2 keyboard handlers ──
  // ה-handler מופעל רק כשהשדה הספציפי בפוקוס. כשה-Sheet כבר פתוח, מתעלמים
  // (focus-trap של ה-Sheet ימנע גישה לשדה האב, אבל הגנה כפולה לא מזיקה).
  const handleFamilyF2 = useF2Listener(() => setFamilyModalOpen(true), {
    enabled: !familyModalOpen && !uomModalOpen,
  })
  const handleUnitF2 = useF2Listener(
    () => {
      setUomTarget("unitOfMeasure")
      setUomModalOpen(true)
    },
    { enabled: !familyModalOpen && !uomModalOpen }
  )
  const handleFactoryUomF2 = useF2Listener(
    () => {
      setUomTarget("factoryUom")
      setUomModalOpen(true)
    },
    { enabled: !familyModalOpen && !uomModalOpen }
  )

  // ── Drill-Down callbacks ──
  function handleFamilyCreated(family: ProductFamilyCreated) {
    // append + auto-select. אין refetch — הרשומה החדשה כבר אצלנו.
    setFamilies((prev) => {
      // הגנה מפני duplicate (race-condition אם מישהו אחר יוצר במקביל).
      if (prev.some((f) => f.id === family.id)) return prev
      return [
        ...prev,
        {
          id: family.id,
          familyCode: family.familyCode,
          familyName: family.familyName,
          name: family.familyName,
        },
      ]
    })
    setProductFamilyId(family.id)
    setFamilyModalOpen(false)
    // החזרת focus לדרופדאון אחרי שה-Sheet ייסגר (timeout כדי לחכות ל-portal cleanup).
    setTimeout(() => familySelectRef.current?.focus(), 50)
  }

  function handleUomCreated(uom: UomCreated) {
    // append + auto-select. הקוד נשמר בטופס (לא ה-id) כי `erp_md_items.unit_of_measure` הוא TEXT.
    setUnits((prev) => {
      if (prev.some((u) => u.id === uom.id)) return prev
      return [...prev, uom]
    })
    if (uomTarget === "unitOfMeasure") {
      setUnitOfMeasure(uom.code)
    } else if (uomTarget === "factoryUom") {
      setFactoryUom(uom.code)
    }
    setUomModalOpen(false)
    setTimeout(() => {
      if (uomTarget === "unitOfMeasure") uomSelectRef.current?.focus()
      else factoryUomSelectRef.current?.focus()
    }, 50)
    setUomTarget(null)
  }

  function handleUomCancel() {
    setUomModalOpen(false)
    setTimeout(() => {
      if (uomTarget === "unitOfMeasure") uomSelectRef.current?.focus()
      else factoryUomSelectRef.current?.focus()
    }, 50)
    setUomTarget(null)
  }

  // קודי UOM קיימים — לבדיקת כפילות מצד-לקוח לפני POST.
  const existingUomCodes = React.useMemo(
    () => units.map((u) => u.code),
    [units]
  )

  React.useEffect(() => {
    let cancelled = false
    async function loadLookups() {
      setLookupsLoading(true)
      setLookupError(null)
      try {
        const [familyData, supplierData, unitData] = await Promise.all([
          masterDataFetch<ProductFamilyOption[]>(
            "/api/master-data/product-families"
          ).catch(() => [] as ProductFamilyOption[]),
          masterDataFetch<SupplierOption[]>(
            "/api/master-data/suppliers"
          ).catch(() => [] as SupplierOption[]),
          masterDataFetch<UomOption[]>(
            "/api/master-data/uoms"
          ).catch(() => [] as UomOption[]),
        ])
        if (cancelled) return
        setFamilies(Array.isArray(familyData) ? familyData : [])
        setSuppliers(Array.isArray(supplierData) ? supplierData : [])
        const uomList = Array.isArray(unitData) ? unitData : []
        setUnits(uomList)
        // ברירת מחדל: EA אם זמין, אחרת הקוד הראשון ברשימה.
        if (uomList.length > 0) {
          const defaultCode =
            uomList.find((u) => u.code === "EA")?.code ?? uomList[0].code
          setUnitOfMeasure((prev) => prev || defaultCode)
        }
      } catch (err) {
        if (!cancelled) setLookupError(formatError(err))
      } finally {
        if (!cancelled) setLookupsLoading(false)
      }
    }
    void loadLookups()
    return () => {
      cancelled = true
    }
  }, [])

  // Validation (lightweight inline — server enforces canonical rules)
  // FP-safe: בודקים פורמט regex ולא Number, כדי שמספרים כמו 0.1234 לא יסבלו עיגול JS.
  const DECIMAL_4_RE = /^\d+(\.\d{1,4})?$/
  const validation = React.useMemo(() => {
    const errors: string[] = []
    if (!itemNumber.trim()) errors.push("מק״ט חובה")
    if (itemNumber.trim().length > 22) errors.push("מק״ט מוגבל ל-22 תווים")
    if (!description.trim()) errors.push("תיאור חובה")
    if (description.trim().length > 200) errors.push("תיאור מוגבל ל-200 תווים")
    if (!productFamilyId) errors.push("משפחת מוצר חובה — אם אין משפחות, יש להקים תחילה")
    if (!unitOfMeasure.trim()) errors.push("יחידת קניה/מכירה חובה")
    const cfStr = conversionFactor.trim().replace(",", ".")
    if (!DECIMAL_4_RE.test(cfStr) || cfStr === "0" || /^0+(\.0+)?$/.test(cfStr)) {
      errors.push("שעור המרה: מספר חיובי, עד 4 ספרות עשרוניות (למשל 1, 0.5, 1000.0001)")
    }
    if (defaultPrice.trim()) {
      const pStr = defaultPrice.trim().replace(",", ".")
      if (!DECIMAL_4_RE.test(pStr)) {
        errors.push("מחיר: לא שלילי, עד 4 ספרות אחרי הנקודה")
      }
    }
    // ── Phase 7.13.4 validation ──
    if (standardCost.trim()) {
      const cStr = standardCost.trim().replace(",", ".")
      if (!DECIMAL_4_RE.test(cStr)) {
        errors.push("עלות תקן: לא שלילי, עד 4 ספרות אחרי הנקודה")
      }
    }
    if (barcode.trim() && barcode.trim().length > 64) {
      errors.push("ברקוד מוגבל ל-64 תווים")
    }
    return { errors, ok: errors.length === 0 }
  }, [
    itemNumber,
    description,
    productFamilyId,
    unitOfMeasure,
    conversionFactor,
    defaultPrice,
    standardCost,
    barcode,
  ])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!validation.ok) {
      toast.error(validation.errors.join(" · "))
      return
    }
    setPending(true)
    try {
      // FP-safe: שולחים כ-string. השרת מקבל string ומעביר ישירות ל-Postgres numeric.
      const cfStr = conversionFactor.trim().replace(",", ".")
      const priceStr = defaultPrice.trim()
        ? defaultPrice.trim().replace(",", ".")
        : undefined
      // Phase 7.13.4: שדות standardCost ו-conversionFactor נשלחים כ-string FP-safe. ריק→undefined.
      const stdCostStr = standardCost.trim()
        ? standardCost.trim().replace(",", ".")
        : undefined
      const created = await masterDataFetch<{ id: string }>(
        "/api/master-data/items",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemNumber: itemNumber.trim(),
            description: description.trim(),
            foreignDescription: foreignDescription.trim() || undefined,
            productFamilyId,
            itemType,
            unitOfMeasure: unitOfMeasure.trim(),
            factoryUom: factoryUom.trim() || unitOfMeasure.trim(),
            conversionFactor: cfStr,
            preferredSupplierId: preferredSupplierId || undefined,
            defaultPrice: priceStr,
            isInventoryManaged,
            status: "ACTIVE",
            // ── Phase 7.13.4 Logistics Enrichment ──
            barcode: barcode.trim() || undefined,
            purchasingUom: purchasingUom.trim() || undefined,
            isSerialTracked,
            standardCost: stdCostStr,
            imageUrl: imageUrl.trim() || undefined,
          }),
        }
      )
      toast.success(`כרטיס הפריט נשמר (${itemNumber.trim()})`)
      router.push(`/marker-ofek/items/${created.id}`)
    } catch (err) {
      toast.error(formatError(err) || "שמירה נכשלה")
    } finally {
      setPending(false)
    }
  }

  return (
    <div
      dir="rtl"
      lang="he"
      className="mx-auto flex w-full max-w-2xl flex-col gap-6 pb-16 pt-2"
    >
      <Link
        href="/marker-ofek/items"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowRight className="size-4" aria-hidden />
        חזרה לקטלוג
      </Link>

      <header className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          כרטיס פריט · שלב א'
        </p>
        <h1 className="text-2xl font-bold tracking-tight">פריט חדש (מאסטר)</h1>
        <p className="text-sm text-muted-foreground">
          מק״ט החברה — לא מק״ט ספק. מק״טי הספקים יקושרו אחרי השמירה דרך מסך הבן.
        </p>
      </header>

      {lookupError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          טעינת רשימות חיפוש נכשלה: {lookupError}
        </div>
      ) : null}

      {/*
        הערה: בעבר היה כאן בלוקר "Seed-data preflight" שחסם ויזואלית את הטופס
        כשאין משפחות מוצר. עם כניסת F2 Drill-Down השומר הזה מיותר — המשתמש
        לוחץ F2 בדרופדאון "משפחת מוצר" ויוצר את הראשונה מתוך הטופס עצמו.
        ה-<option> הריק מציג "אין משפחות — לחץ F2 ליצירה".
      */}

      <form onSubmit={(e) => void handleSave(e)} className="space-y-6">
        {/* ── Card 1: זיהוי ── */}
        <Card>
          <CardHeader>
            <CardTitle>זיהוי ותיאור</CardTitle>
            <CardDescription>
              מק״ט מאסטר ייחודי לחברה + תיאורים בעברית ובאנגלית.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="it-num">
                מק״ט <span className="text-destructive">*</span>
              </Label>
              <Input
                id="it-num"
                value={itemNumber}
                onChange={(e) => setItemNumber(e.target.value)}
                dir="ltr"
                className="font-mono"
                placeholder="08.30.0020"
                maxLength={22}
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                תקן ERP: CHAR(22). מומלץ פורמט היררכי כמו `08.30.0020`.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="it-desc">
                תיאור (עברית) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="it-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                dir="rtl"
                placeholder="לדוגמה: צינור פלסטי שחור 20 מ&quot;מ"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="it-fdesc">תיאור לועזי</Label>
              <Input
                id="it-fdesc"
                value={foreignDescription}
                onChange={(e) => setForeignDescription(e.target.value)}
                dir="ltr"
                placeholder="Black plastic pipe 20mm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="it-barcode" className="flex items-center gap-1.5">
                <ScanLine className="size-3.5" aria-hidden />
                ברקוד
              </Label>
              <Input
                id="it-barcode"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                dir="ltr"
                className="font-mono"
                placeholder="7290000000000"
                maxLength={64}
              />
              <p className="text-[11px] text-muted-foreground">
                EAN-13 / UPC / Code-128 — לסריקה בקבלת סחורה וספירת מלאי.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ── Card 2: סיווג ── */}
        <Card>
          <CardHeader>
            <CardTitle>סיווג</CardTitle>
            <CardDescription>
              משפחת מוצר → גוררת ברירות מחדל לתת-פרק תקציבי ומשאב; טיפוס פריט.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <F2LookupField
              id="it-family"
              label="משפחת מוצר"
              required
              hint={lookupsLoading ? undefined : F2_HINT}
              onTrigger={() => setFamilyModalOpen(true)}
            >
              <select
                id="it-family"
                ref={familySelectRef}
                value={productFamilyId}
                onChange={(e) => setProductFamilyId(e.target.value)}
                onKeyDown={handleFamilyF2}
                disabled={lookupsLoading}
                dir="rtl"
                aria-keyshortcuts="F2"
                aria-haspopup="dialog"
                className={cn(
                  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}
              >
                <option value="">
                  {lookupsLoading
                    ? "טוען משפחות…"
                    : families.length === 0
                      ? "אין משפחות — לחץ F2 ליצירה"
                      : "— בחר משפחת מוצר —"}
                </option>
                {families.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.familyCode} — {f.familyName ?? f.name ?? "—"}
                  </option>
                ))}
              </select>
            </F2LookupField>
            <div className="space-y-2">
              <Label>טיפוס</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {ITEM_TYPE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm transition-colors",
                      itemType === opt.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    )}
                  >
                    <input
                      type="radio"
                      name="itemType"
                      value={opt.value}
                      checked={itemType === opt.value}
                      onChange={() => setItemType(opt.value)}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="font-medium">{opt.label}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {opt.hint}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Card 3: יחידות ── */}
        <Card>
          <CardHeader>
            <CardTitle>יחידות מידה</CardTitle>
            <CardDescription>
              יחידת קניה/מכירה ויחידת מפעל. אם זהות — שעור ההמרה הוא 1.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <F2LookupField
                id="it-uom"
                label="יח' קניה/מכירה"
                required
                hint={lookupsLoading ? undefined : F2_HINT}
                onTrigger={() => {
                  setUomTarget("unitOfMeasure")
                  setUomModalOpen(true)
                }}
              >
                <select
                  id="it-uom"
                  ref={uomSelectRef}
                  value={unitOfMeasure}
                  onChange={(e) => setUnitOfMeasure(e.target.value)}
                  onKeyDown={handleUnitF2}
                  disabled={lookupsLoading}
                  aria-keyshortcuts="F2"
                  aria-haspopup="dialog"
                  dir="rtl"
                  className={cn(
                    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                >
                  <option value="">
                    {lookupsLoading
                      ? "טוען יחידות…"
                      : units.length === 0
                        ? "אין יחידות — לחץ F2 ליצירה"
                        : "— בחר יחידת מידה —"}
                  </option>
                  {units.map((u) => (
                    <option key={u.id} value={u.code}>
                      {u.code} — {u.descriptionHe}
                    </option>
                  ))}
                </select>
              </F2LookupField>
              <F2LookupField
                id="it-fuom"
                label="יח' מפעל"
                hint={lookupsLoading ? undefined : F2_HINT}
                onTrigger={() => {
                  setUomTarget("factoryUom")
                  setUomModalOpen(true)
                }}
              >
                <select
                  id="it-fuom"
                  ref={factoryUomSelectRef}
                  value={factoryUom}
                  onChange={(e) => setFactoryUom(e.target.value)}
                  onKeyDown={handleFactoryUomF2}
                  disabled={lookupsLoading}
                  aria-keyshortcuts="F2"
                  aria-haspopup="dialog"
                  dir="rtl"
                  className={cn(
                    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                >
                  <option value="">
                    {lookupsLoading
                      ? "טוען…"
                      : `ברירת מחדל: ${unitOfMeasure || "(זהה ליח' קניה)"}`}
                  </option>
                  {units.map((u) => (
                    <option key={u.id} value={u.code}>
                      {u.code} — {u.descriptionHe}
                    </option>
                  ))}
                </select>
              </F2LookupField>
            </div>
            <div className="space-y-2">
              <Label htmlFor="it-cf">
                שעור המרה <span className="text-destructive">*</span>
              </Label>
              <Input
                id="it-cf"
                value={conversionFactor}
                onChange={(e) => setConversionFactor(e.target.value)}
                dir="ltr"
                inputMode="decimal"
                className="font-mono"
                disabled={sameUom}
              />
              <p className="text-[11px] text-muted-foreground">
                {sameUom
                  ? "יחידות זהות — שעור ההמרה ננעל ל-1."
                  : 'כמה יחידות מפעל מהוות יחידת קניה אחת. דוגמה: ק"ג ל-טון = 1000.'}
              </p>
            </div>
            {/* ── Phase 7.13.4: purchasing_uom (אופציונלי, code-based סימטרי ל-factory_uom) ── */}
            <div className="space-y-2">
              <Label htmlFor="it-puom">יחידת קנייה (אופציונלי)</Label>
              <select
                id="it-puom"
                value={purchasingUom}
                onChange={(e) => setPurchasingUom(e.target.value)}
                disabled={lookupsLoading}
                dir="rtl"
                className={cn(
                  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}
              >
                <option value="">
                  {lookupsLoading
                    ? "טוען…"
                    : `ברירת מחדל: ${unitOfMeasure || "(זהה ליח' בסיס)"}`}
                </option>
                {units.map((u) => (
                  <option key={u.id} value={u.code}>
                    {u.code} — {u.descriptionHe}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                יחידת הקנייה מהספק (לדוגמה ארגז של 12) — אם נשאר ריק תונח ה-DB על יחידת הבסיס.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ── Card 4: ספק ומחיר ── */}
        <Card>
          <CardHeader>
            <CardTitle>ספק ומחיר</CardTitle>
            <CardDescription>
              ספק מועדף לפריט (אופציונלי) + מחיר מחירון בסיס. ניתן להוסיף ספקים
              נוספים אחרי השמירה.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="it-supplier">ספק מועדף</Label>
              <select
                id="it-supplier"
                value={preferredSupplierId}
                onChange={(e) => setPreferredSupplierId(e.target.value)}
                disabled={lookupsLoading}
                dir="rtl"
                className={cn(
                  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}
              >
                <option value="">
                  {lookupsLoading
                    ? "טוען ספקים…"
                    : suppliers.length === 0
                      ? "אין ספקים — אופציונלי, ניתן להשאיר ריק"
                      : "— ללא / יוקצה אחר כך —"}
                </option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.supplierNumber ? `${s.supplierNumber} — ` : ""}
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="it-price">מחיר מחירון בסיס (₪)</Label>
                <Input
                  id="it-price"
                  value={defaultPrice}
                  onChange={(e) => setDefaultPrice(e.target.value)}
                  dir="ltr"
                  inputMode="decimal"
                  className="font-mono"
                  placeholder="0.00"
                />
              </div>
              {/* ── Phase 7.13.4: standard_cost ── */}
              <div className="space-y-2">
                <Label htmlFor="it-stdcost">עלות תקן (₪)</Label>
                <Input
                  id="it-stdcost"
                  value={standardCost}
                  onChange={(e) => setStandardCost(e.target.value)}
                  dir="ltr"
                  inputMode="decimal"
                  className="font-mono"
                  placeholder="0.00"
                />
                <p className="text-[11px] text-muted-foreground">
                  לחישוב שווי מלאי תיאורטי ולמדדי רווחיות.
                </p>
              </div>
            </div>
            {/* ── Phase 7.13.4: image_url ── */}
            <div className="space-y-2">
              <Label htmlFor="it-image">כתובת תמונת פריט (אופציונלי)</Label>
              <Input
                id="it-image"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                dir="ltr"
                className="font-mono text-xs"
                placeholder="https://…/product.jpg"
              />
              <p className="text-[11px] text-muted-foreground">
                URL חיצוני או נתיב ב-Storage. ניתן לערוך גם מכרטיס הפריט אחרי היצירה.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ── Card 5: ניהול מלאי ── */}
        <Card>
          <CardHeader>
            <CardTitle>ניהול מלאי</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex cursor-pointer items-center gap-3">
              <Checkbox
                checked={isInventoryManaged}
                onCheckedChange={(v) => setIsInventoryManaged(v === true)}
              />
              <span className="text-sm">
                פריט מנוהל מלאי
                <span className="block text-[11px] text-muted-foreground">
                  בטלו אם הפריט לא נכנס למלאי (שירות, חד-פעמי וכו&apos;)
                </span>
              </span>
            </label>
            {/* ── Phase 7.13.4: is_serial_tracked ── */}
            <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/20 p-3">
              <div className="flex items-start gap-2">
                <Hash className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
                <div className="space-y-0.5">
                  <Label htmlFor="it-serial" className="cursor-pointer text-sm font-medium">
                    ניהול מספרים סידוריים
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    נדרש עבור פריטי ציוד עם מזהה ייחודי (אחריות, הפרדה ב-GR).
                  </p>
                </div>
              </div>
              <Switch
                id="it-serial"
                checked={isSerialTracked}
                onCheckedChange={setIsSerialTracked}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Errors + actions ── */}
        {!validation.ok ? (
          <ul className="list-inside list-disc rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {validation.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        ) : null}

        <div className="flex items-center justify-start gap-3 pt-2">
          <Button
            type="submit"
            disabled={pending || !validation.ok || lookupsLoading}
            className="gap-2"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            שמירה (Ctrl+Enter)
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push("/marker-ofek/items")}
            disabled={pending}
          >
            ביטול
          </Button>
        </div>
      </form>

      {/* ─── F2 Drill-Down: משפחת מוצר ─── */}
      <DrilldownSheet
        open={familyModalOpen}
        onOpenChange={(open) => {
          setFamilyModalOpen(open)
          // אם נסגר ע"י Esc/לחיצה מחוץ — מחזירים focus לדרופדאון.
          if (!open) {
            setTimeout(() => familySelectRef.current?.focus(), 50)
          }
        }}
        title="פתיחת משפחת מוצר חדשה"
        description="קוד ייחודי + שם תצוגה. מתווסף לחברה הפעילה."
      >
        <QuickCreateProductFamilyForm
          existingCodes={families.map((f) => f.familyCode)}
          onCreated={handleFamilyCreated}
          onCancel={() => setFamilyModalOpen(false)}
        />
      </DrilldownSheet>

      {/* ─── F2 Drill-Down: יחידת מידה ─── */}
      <DrilldownSheet
        open={uomModalOpen}
        onOpenChange={(open) => {
          setUomModalOpen(open)
          if (!open) {
            setTimeout(() => {
              if (uomTarget === "unitOfMeasure") uomSelectRef.current?.focus()
              else factoryUomSelectRef.current?.focus()
            }, 50)
            // איפוס ה-target אם המודאל נסגר ע"י Esc/חיצוני (אחרי ה-focus restore).
            if (uomTarget !== null) setUomTarget(null)
          }
        }}
        title="פתיחת יחידת מידה חדשה"
        description="קוד ייחודי + תיאור בעברית. מתווסף לחברה הפעילה."
      >
        <QuickCreateUomForm
          initialCode={uomTarget === "factoryUom" ? factoryUom : unitOfMeasure}
          existingCodes={existingUomCodes}
          onCreated={handleUomCreated}
          onCancel={handleUomCancel}
        />
      </DrilldownSheet>
    </div>
  )
}
