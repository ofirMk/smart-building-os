"use client"

/**
 * Procurement Orders — Smart PO Form (Phase 7.2.B + 7.5.3)
 *
 * טופס Master-Detail עשיר ליצירת הזמנת רכש על גבי `POST /api/procurement/orders`.
 *
 * ## אדריכלות הטופס
 *   • `react-hook-form` + `zodResolver` — מקור-אמת אחיד לוולידציה. ה-zod schema
 *     שכאן זהה במבנה ל-`createOrderSchema` ב-API; הברירת-מחדל היא תאימות
 *     contract.
 *   • `useFieldArray` — לניהול שורות דינמיות.
 *   • `useWatch` נקודתי — חישוב מחדש של summary בלי re-renders של כל הטופס.
 *
 * ## Auto-pilot חכם (UX קריטי) — Phase 7.5
 *   • בבחירת פריט → ממלא אוטומטית `budget_sub_chapter` ו-`resource_id` מתוך
 *     ברירות המחדל של הפריט ב-`erp_md_items` (governance compliance ללא חיכוך).
 *   • בבחירת ספק+פריט → קורא ל-`/api/procurement/pricing/suggestions` (מנוע
 *     המחירים החכם של 7.5). ההצעה הראשונה מסוג `SUPPLIER_PRICELIST` מוצבת ב-
 *     `unit_price`. אם קיימת `bestAlternative` (ספק אחר זול יותר) — מציגים
 *     רמז קטן מתחת לשדה.
 *   • cache מקומי כדי שלא נשלח אותה בקשה פעמיים בזמן ניווט בטופס.
 *
 * ## אכיפת ה-3% Rule (Phase 7.5)
 *   ה-API ב-POST מחזיר 400 עם `error: "escalation_required"` ו-`details`
 *   (מערך מחרוזות בפורמט "שורה N: …") כאשר חריגת המחיר מעבר לסף החברה
 *   ולא סופקה הצדקה מספקת. אנו תופסים את התשובה, פותחים אוטומטית פאנל
 *   `escalationCategory` + `escalationJustification` תחת השורה הרלוונטית,
 *   ומציגים Toast עם הדרישות. המשתמש משלים ושולח שוב.
 *
 * ## Submit Flow
 *   POST → 201 → toast ירוק → router.push חזרה לעמוד ה-grid.
 *   POST → 400 escalation_required → toast אדום + חשיפת escalation panels.
 *   POST → 400 / 500 אחר → toast אדום עם המסר המקורי.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useFieldArray, useForm, useWatch } from "react-hook-form"
import {
  AlertTriangle,
  ArrowRight,
  Layers,
  Loader2,
  Plus,
  ShoppingCart,
  Sparkles,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import {
  EMPTY_LINE_ENRICHMENT,
  LINE_PRICE_SOURCES,
  LineEnrichmentDialog,
  countFilledEnrichmentFields,
  type LineEnrichmentValues,
} from "@/components/marker-ofek/procurement/line-enrichment-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { readActiveCompanyIdFromCookie } from "@/lib/company-context"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { cn } from "@/lib/utils"

// ============================================================================
// Constants
// ============================================================================

const SUPPORTED_CURRENCIES = ["ILS", "USD", "EUR"] as const
type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]

const URGENCY_LEVELS = ["NORMAL", "HIGH", "CRITICAL"] as const
type UrgencyLevel = (typeof URGENCY_LEVELS)[number]

const URGENCY_LABELS: Record<UrgencyLevel, string> = {
  NORMAL: "רגילה",
  HIGH: "גבוהה",
  CRITICAL: "קריטית",
}

const ESCALATION_CATEGORIES = [
  "BUSINESS_RELATIONSHIP",
  "QUALITY",
  "AVAILABILITY",
  "LEAD_TIME",
  "OTHER",
] as const
type EscalationCategory = (typeof ESCALATION_CATEGORIES)[number]

const ESCALATION_LABELS: Record<EscalationCategory, string> = {
  BUSINESS_RELATIONSHIP: "מערכת יחסים עם הספק",
  QUALITY: "איכות",
  AVAILABILITY: "זמינות",
  LEAD_TIME: "זמן אספקה",
  OTHER: "אחר",
}

const VAT_RATE = 0.17

// ============================================================================
// Types — DTO-shaped, matches existing master-data API responses.
// ============================================================================

type SupplierOption = {
  id: string
  supplierNum: string | null
  name: string
}

type ProjectOption = {
  id: string
  projectNumber: string
  name: string
  status: string
}

type PaymentTermOption = {
  code: string
  description: string
  isEom: boolean
  monthsToAdd: number
  daysToAdd: number
  installments: number
}

// Phase D.2 — איש קשר אצל הספק. ממפה ל-DTO של /api/erp/master-data/suppliers/[id]/contacts.
type SupplierContactOption = {
  id: string
  name: string
  role: string | null
  phone: string | null
  email: string | null
  isPrimary: boolean
}

type ItemOption = {
  id: string
  itemNumber: string
  description: string
  budgetSubChapter: string | null
  resourceId: string | null
}

/** מבנה תגובת `/api/procurement/pricing/suggestions` (Phase 7.5). */
type PriceSuggestion = {
  source: "SUPPLIER_PRICELIST" | "LAST_PURCHASE" | "BEST_OFFER_CROSS"
  supplierId: string
  supplierName: string
  unitPrice: number
  currency: string
  effectiveFrom: string | null
  leadTimeDays: number | null
  poNumber: string | null
  confidence: number
}

type PriceSuggestionsApiResponse = {
  suggestions: PriceSuggestion[]
  bestAlternative: PriceSuggestion | null
  windowDays: number
}

/** מטמון פריצה של מחירון פר זוג ספק↔פריט. */
type CachedPricing = {
  unitPrice: number | null
  bestAlternative: PriceSuggestion | null
}

// ============================================================================
// Form schema — חופף ל-`createOrderSchema` בשרת. הקלט מהטפסים מגיע כמחרוזות,
// אז משתמשים ב-`z.coerce.number()` עבור שדות מספריים. השרת ירץ ולידציה זהה.
// ============================================================================

const lineFormSchema = z.object({
  itemId: z.string().uuid({ message: "יש לבחור פריט" }),
  quantity: z.coerce
    .number({ message: "כמות חייבת להיות מספר" })
    .positive({ message: "כמות חייבת להיות חיובית" }),
  unitPrice: z.coerce
    .number({ message: "מחיר חייב להיות מספר" })
    .min(0, { message: "מחיר חייב להיות אי-שלילי" }),
  // ממולאים אוטומטית מהפריט; המשתמש לא רואה אותם בטופס אבל הם חובה ב-API.
  budgetSubChapter: z.string().trim().min(1, { message: "סעיף תקציבי חסר בפריט" }),
  resourceId: z.string().trim().min(1, { message: "קוד משאב חסר בפריט" }),
  description: z.string().trim().optional(),
  // Phase 7.13.2 — Line enrichment (כולם אופציונליים; ניתנים לעריכה דרך
  // LineEnrichmentDialog). ה-API ב-route.ts אוכף את הקונטרקט המלא של
  // ה-`erp_purchase_order_lines` ועובר ולידציה זהה.
  supplyDate: z.string().trim().nullable().optional(),
  discountPct: z.coerce
    .number({ message: "אחוז הנחה חייב להיות מספר" })
    .min(0)
    .max(100)
    .nullable()
    .optional(),
  lineCurrency: z.string().trim().nullable().optional(),
  exchangeRate: z.coerce
    .number({ message: "שער המרה חייב להיות מספר" })
    .positive()
    .nullable()
    .optional(),
  manufacturerName: z.string().trim().nullable().optional(),
  lineNotes: z.string().trim().nullable().optional(),
  priceSource: z.enum(LINE_PRICE_SOURCES).nullable().optional(),
  // Phase D — Priority parity (מועברים דרך LineEnrichmentDialog).
  uom: z.string().trim().nullable().optional(),
  supplierSku: z.string().trim().nullable().optional(),
  supplierSkuDescription: z.string().trim().nullable().optional(),
  budgetItemCode: z.string().trim().nullable().optional(),
  // Phase D.3 — cross-system linkage
  demandNumber: z.string().trim().nullable().optional(),
  salesOrderId: z
    .string()
    .uuid({ message: "מזהה הזמנת מכירה חייב להיות UUID תקני" })
    .nullable()
    .optional()
    .or(z.literal("")),
  // Phase 7.5 — 3% Rule governance. אופציונליים בסכמה (השרת אוכף תנאית);
  // ה-UI חושף אותם כשהשרת מסמן `escalation_required`.
  escalationCategory: z.enum(ESCALATION_CATEGORIES).optional(),
  escalationJustification: z
    .string()
    .trim()
    .min(10, { message: "הצדקה דרושה (לפחות 10 תווים)" })
    .optional()
    .or(z.literal("")),
})

const formSchema = z
  .object({
    supplierId: z.string().uuid({ message: "יש לבחור ספק" }),
    projectId: z.string().uuid({ message: "יש לבחור פרויקט" }),
    currency: z.enum(SUPPORTED_CURRENCIES),
    urgencyLevel: z.enum(URGENCY_LEVELS),
    urgencyJustification: z.string().trim().optional().or(z.literal("")),
    notes: z.string().trim().optional(),
    // Phase D — Priority parity header fields (כולם אופציונליים; ה-API
    // מבצע גם Tesla auto-fill מתוך master data לטובת המשתמש).
    paymentTermsCode: z.string().trim().nullable().optional().or(z.literal("")),
    receivingWarehouseCode: z
      .string()
      .trim()
      .max(32)
      .nullable()
      .optional()
      .or(z.literal("")),
    withholdingPct: z.coerce
      .number({ message: "ניכוי במקור חייב להיות מספר" })
      .min(0)
      .max(100)
      .nullable()
      .optional(),
    shippingAddrLine1: z.string().trim().nullable().optional().or(z.literal("")),
    shippingAddrCity: z.string().trim().nullable().optional().or(z.literal("")),
    // Phase D.3 — כתובת באנגלית (הזמנות בין -לאומיות / יצוא).
    shippingAddrEnLine1: z.string().trim().nullable().optional().or(z.literal("")),
    shippingAddrEnCity: z.string().trim().nullable().optional().or(z.literal("")),
    shippingAddrEnCountry: z
      .string()
      .trim()
      .nullable()
      .optional()
      .or(z.literal("")),
    // Phase D.2 — contact, VAT, order date, classification flags
    contactId: z.string().uuid().nullable().optional().or(z.literal("")),
    vatCode: z.string().trim().max(32).nullable().optional().or(z.literal("")),
    orderDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "תאריך לא תקין" })
      .optional()
      .or(z.literal("")),
    isConfidential: z.boolean().optional(),
    affectsPlanning: z.boolean().optional(),
    lines: z.array(lineFormSchema).min(1, { message: "חובה לפחות שורה אחת" }),
  })
  .refine(
    // urgency=HIGH/CRITICAL חייב הצדקה — מקביל לאילוץ ב-API.
    (data) => {
      if (data.urgencyLevel === "NORMAL") return true
      return (data.urgencyJustification?.trim().length ?? 0) >= 10
    },
    {
      message: "דחיפות גבוהה/קריטית מחייבת הצדקה (לפחות 10 תווים)",
      path: ["urgencyJustification"],
    }
  )

// `z.coerce.number()` מייצר פער בין input ל-output: הטופס מקבל מחרוזות או מספרים
// (Input HTML), ה-API מקבל מספרים ממש. משתמשים במושג 3-הגנריקים של `useForm`:
//   < TFieldValues = input,  TContext = undefined,  TTransformedValues = output >
export type FormInput = z.input<typeof formSchema>
export type FormOutput = z.output<typeof formSchema>

// ============================================================================
// Formatters
// ============================================================================

const numberFormatter = new Intl.NumberFormat("he-IL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Helper: שולף את המספר מתוך המחרוזת "שורה N: …" שהשרת מחזיר ב-`details`.
 * מחזיר אינדקס 0-מבוסס (השרת משתמש ב-1-מבוסס).
 */
function parseLineIndexFromDetail(detail: string): number | null {
  const match = detail.match(/^שורה\s+(\d+)/)
  if (!match) return null
  const oneBased = Number.parseInt(match[1] ?? "", 10)
  if (!Number.isFinite(oneBased) || oneBased < 1) return null
  return oneBased - 1
}

// ============================================================================
// Page
// ============================================================================

export default function NewProcurementOrderPage() {
  const router = useRouter()

  // -- Lookups (suppliers / projects / items) — נטענים פעם אחת בעלייה.
  const [suppliers, setSuppliers] = React.useState<SupplierOption[]>([])
  const [projects, setProjects] = React.useState<ProjectOption[]>([])
  const [items, setItems] = React.useState<ItemOption[]>([])
  // Phase D — master-data לתנאי תשלום (Priority "תנאי תשלום").
  const [paymentTerms, setPaymentTerms] = React.useState<PaymentTermOption[]>([])
  // Phase D.2 — אנשי קשר של הספק הנבחר (נטען לאחר בחירת הספק).
  const [supplierContacts, setSupplierContacts] = React.useState<
    SupplierContactOption[]
  >([])
  const [loadingContacts, setLoadingContacts] = React.useState(false)
  const [loadingLookups, setLoadingLookups] = React.useState(true)
  const [submitting, setSubmitting] = React.useState(false)

  // -- ה-state של escalation: מפה line-index → הודעה מהשרת. הצגת escalation
  //    panel תחת שורה מותנית ב-(message != null) או ב-toggle ידני של המשתמש.
  const [lineErrors, setLineErrors] = React.useState<Record<number, string>>({})

  // -- ה-state של bestAlternative פר שורה — לרמז UX מתחת ל-unit_price.
  const [lineBestAlts, setLineBestAlts] = React.useState<
    Record<number, PriceSuggestion | null>
  >({})

  // -- Phase 7.13.2 — פותח את LineEnrichmentDialog. null = סגור.
  const [enrichmentLineIndex, setEnrichmentLineIndex] = React.useState<
    number | null
  >(null)

  // Index פריטים לפי ID לחיפוש מהיר ב-Auto-fill.
  const itemsById = React.useMemo(() => {
    const map = new Map<string, ItemOption>()
    for (const it of items) map.set(it.id, it)
    return map
  }, [items])

  // Cache מחירים לפי צירוף — מונע בקשות חוזרות בזמן הקלדה/ניווט.
  const pricingCache = React.useRef<Map<string, CachedPricing>>(new Map())

  const form = useForm<FormInput, undefined, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      supplierId: "",
      projectId: "",
      currency: "ILS",
      urgencyLevel: "NORMAL",
      urgencyJustification: "",
      notes: "",
      // Phase D — Priority parity header defaults
      paymentTermsCode: "",
      receivingWarehouseCode: "",
      withholdingPct: null,
      shippingAddrLine1: "",
      shippingAddrCity: "",
      shippingAddrEnLine1: "",
      shippingAddrEnCity: "",
      shippingAddrEnCountry: "",
      // Phase D.2 — ברירת מחדל ל-orderDate היא היום (yyyy-mm-dd, local).
      contactId: "",
      vatCode: "",
      orderDate: new Date().toISOString().slice(0, 10),
      isConfidential: false,
      affectsPlanning: true,
      lines: [
        {
          itemId: "",
          quantity: 1,
          unitPrice: 0,
          budgetSubChapter: "",
          resourceId: "",
          description: "",
          // Phase 7.13.2 — enrichment defaults (all null / unset).
          supplyDate: null,
          discountPct: null,
          lineCurrency: null,
          exchangeRate: null,
          manufacturerName: null,
          lineNotes: null,
          priceSource: null,
          uom: null,
          supplierSku: null,
          supplierSkuDescription: null,
          budgetItemCode: null,
          demandNumber: null,
          salesOrderId: null,
          escalationCategory: undefined,
          escalationJustification: "",
        },
      ],
    },
    mode: "onTouched",
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  })

  // Watch לדחיפות — קובע אם להציג את שדה ההצדקה.
  const watchedUrgency = useWatch({
    control: form.control,
    name: "urgencyLevel",
  })
  const showUrgencyJustification = watchedUrgency !== "NORMAL"

  // -- טעינת lookups במקביל.
  React.useEffect(() => {
    let cancelled = false
    Promise.all([
      masterDataFetch<SupplierOption[]>("/api/master-data/suppliers"),
      masterDataFetch<ProjectOption[]>("/api/projects"),
      masterDataFetch<ItemOption[]>("/api/master-data/items"),
      // Phase D — תנאי תשלום מ-master data הגלובלי. catch מקומי — אם ה-table
      // ריקה / ה-endpoint לא זמין לא לשבור את טעינת ה-page.
      masterDataFetch<PaymentTermOption[]>("/api/master-data/payment-terms")
        .catch(() => [] as PaymentTermOption[]),
    ])
      .then(([suppliersData, projectsData, itemsData, paymentTermsData]) => {
        if (cancelled) return
        setSuppliers(suppliersData ?? [])
        // מעדיפים פרויקטים פעילים בראש הרשימה — UX משופר.
        const sortedProjects = [...(projectsData ?? [])].sort((a, b) => {
          if (a.status === b.status) return 0
          if (a.status === "ACTIVE") return -1
          if (b.status === "ACTIVE") return 1
          return 0
        })
        setProjects(sortedProjects)
        setItems(itemsData ?? [])
        setPaymentTerms(paymentTermsData ?? [])
      })
      .catch((error: unknown) => {
        if (cancelled) return
        toast.error(
          error instanceof Error ? error.message : "טעינת נתוני מערכת נכשלה"
        )
      })
      .finally(() => {
        if (!cancelled) setLoadingLookups(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // -- Auto-pricing helper (Phase 7.5 — Smart Pricing engine).
  //    קורא ל-`/api/procurement/pricing/suggestions` ומחזיר את המחיר של הספק
  //    הנבחר (SUPPLIER_PRICELIST) + bestAlternative אם קיים.
  const fetchPricing = React.useCallback(
    async (supplierId: string, itemId: string): Promise<CachedPricing> => {
      const key = `${supplierId}_${itemId}`
      const cached = pricingCache.current.get(key)
      if (cached) return cached

      try {
        const url = `/api/procurement/pricing/suggestions?itemId=${encodeURIComponent(
          itemId
        )}&supplierId=${encodeURIComponent(supplierId)}`
        const res = await fetch(url, {
          credentials: "same-origin",
          cache: "no-store",
          headers: buildCompanyHeaders(),
        })
        if (!res.ok) {
          // Endpoint כשל — לא חוסם את המשתמש; מסמנים null וממשיכים.
          const fallback: CachedPricing = { unitPrice: null, bestAlternative: null }
          pricingCache.current.set(key, fallback)
          return fallback
        }
        const payload = (await res.json()) as PriceSuggestionsApiResponse
        // המקור הראשון מסוג SUPPLIER_PRICELIST של אותו הספק = המחיר המדויק.
        const supplierPriceRow = payload.suggestions.find(
          (s) => s.source === "SUPPLIER_PRICELIST" && s.supplierId === supplierId
        )
        const fallbackLast = payload.suggestions.find(
          (s) => s.source === "LAST_PURCHASE" && s.supplierId === supplierId
        )
        const result: CachedPricing = {
          unitPrice: supplierPriceRow
            ? round2(supplierPriceRow.unitPrice)
            : fallbackLast
              ? round2(fallbackLast.unitPrice)
              : null,
          bestAlternative: payload.bestAlternative,
        }
        pricingCache.current.set(key, result)
        return result
      } catch {
        const fallback: CachedPricing = { unitPrice: null, bestAlternative: null }
        pricingCache.current.set(key, fallback)
        return fallback
      }
    },
    []
  )

  // -- Handlers לבחירת פריט: ממלא budget/resource ומריץ auto-pricing.
  const handleItemChange = React.useCallback(
    async (lineIndex: number, itemId: string) => {
      const item = itemsById.get(itemId)
      if (!item) return
      // 1) שדות governance מהפריט (item.* הם string|null — מאלצים ?? '').
      const budgetSubChapter: string = item.budgetSubChapter ?? ""
      const resourceId: string = item.resourceId ?? ""
      form.setValue(`lines.${lineIndex}.budgetSubChapter`, budgetSubChapter, {
        shouldValidate: true,
        shouldDirty: true,
      })
      form.setValue(`lines.${lineIndex}.resourceId`, resourceId, {
        shouldValidate: true,
        shouldDirty: true,
      })
      // 2) auto-pricing אם כבר נבחר ספק.
      const supplierId = form.getValues("supplierId")
      if (supplierId) {
        const pricing = await fetchPricing(supplierId, itemId)
        if (pricing.unitPrice !== null) {
          form.setValue(`lines.${lineIndex}.unitPrice`, pricing.unitPrice, {
            shouldValidate: true,
            shouldDirty: true,
          })
        }
        setLineBestAlts((prev) => ({
          ...prev,
          [lineIndex]: pricing.bestAlternative,
        }))
      }
    },
    [form, itemsById, fetchPricing]
  )

  // -- כשהמשתמש משנה ספק → רץ על כל השורות שכבר יש בהן פריט ומעדכן מחיר.
  const handleSupplierChange = React.useCallback(
    async (supplierId: string) => {
      // Phase D.2 — מאפסים contactId הקודם (שייך לספק הקודם) וטוענים את האנשים
      // של הספק החדש. מסמנים primary-contact אוטומטית אם קיים — מקביל ל-Tesla
      // auto-fill שה-API מבצע אם משאירים null.
      form.setValue("contactId", "", { shouldDirty: true })
      setSupplierContacts([])
      setLoadingContacts(true)
      const contactsPromise = masterDataFetch<SupplierContactOption[]>(
        `/api/erp/master-data/suppliers/${supplierId}/contacts`
      )
        .then((data) => {
          const list = data ?? []
          setSupplierContacts(list)
          // Auto-select primary contact ל-UX — ניתן לשנות ידנית.
          const primary = list.find((c) => c.isPrimary) ?? list[0]
          if (primary) {
            form.setValue("contactId", primary.id, { shouldDirty: true })
          }
        })
        .catch(() => {
          // שקט — לא להרעיש UX. ה-API הראשי מבצע auto-fill דרך קוד.
        })
        .finally(() => setLoadingContacts(false))

      const lines = form.getValues("lines")
      const updates = await Promise.all(
        lines.map(async (line, idx) => {
          if (!line.itemId) return null
          const pricing = await fetchPricing(supplierId, line.itemId)
          return { idx, pricing }
        })
      )
      const altsUpdate: Record<number, PriceSuggestion | null> = {}
      for (const u of updates) {
        if (!u) continue
        if (u.pricing.unitPrice !== null) {
          form.setValue(`lines.${u.idx}.unitPrice`, u.pricing.unitPrice, {
            shouldValidate: true,
            shouldDirty: true,
          })
        }
        altsUpdate[u.idx] = u.pricing.bestAlternative
      }
      setLineBestAlts((prev) => ({ ...prev, ...altsUpdate }))
      await contactsPromise
    },
    [form, fetchPricing]
  )

  // -- Submit. RHF מעביר את ערכי ה-output המומרים (מספרים ממש אחרי z.coerce).
  //    בשונה מ-`masterDataFetch`, אנחנו משתמשים ב-`fetch` גולמי כדי לחשוף את
  //    `error: "escalation_required"` ואת `details` (מערך שורות) שהשרת מחזיר.
  const onSubmit = React.useCallback(
    async (values: FormOutput) => {
      setSubmitting(true)
      // ניקוי שגיאות escalation קודמות לפני submit חדש.
      setLineErrors({})

      try {
        // Phase D — בונה shipping address sub-object מה-form fields השטוחים.
        // מעבירים ל-API רק אם יש לפחות שדה אחד מלא; אחרת משאירים null —
        // וה-API מבצע Tesla auto-fill מכתובת הספק.
        const shippingLine1 = values.shippingAddrLine1?.trim() ?? ""
        const shippingCity = values.shippingAddrCity?.trim() ?? ""
        const shippingAddrHe =
          shippingLine1 || shippingCity
            ? {
                line1: shippingLine1 || undefined,
                city: shippingCity || undefined,
              }
            : undefined
        // Phase D.3 — כתובת אנגלית (להזמנות בין-לאומיות). השרת מתגדיר
        // מה להדפיס ב-PO המודפס לספק. משאירים undefined אם אין מידע.
        const shippingEnLine1 = values.shippingAddrEnLine1?.trim() ?? ""
        const shippingEnCity = values.shippingAddrEnCity?.trim() ?? ""
        const shippingEnCountry = values.shippingAddrEnCountry?.trim() ?? ""
        const shippingAddrEn =
          shippingEnLine1 || shippingEnCity || shippingEnCountry
            ? {
                line1: shippingEnLine1 || undefined,
                city: shippingEnCity || undefined,
                country: shippingEnCountry || undefined,
              }
            : undefined

        const requestBody = {
          supplierId: values.supplierId,
          projectId: values.projectId,
          currency: values.currency,
          urgencyLevel: values.urgencyLevel,
          urgencyJustification:
            values.urgencyLevel !== "NORMAL"
              ? values.urgencyJustification?.trim() || undefined
              : undefined,
          notes: values.notes?.trim() ? values.notes.trim() : null,
          // Phase D — Priority parity header fields
          paymentTermsCode: values.paymentTermsCode?.trim() || undefined,
          receivingWarehouseCode:
            values.receivingWarehouseCode?.trim() || undefined,
          withholdingPct:
            values.withholdingPct != null &&
            Number.isFinite(values.withholdingPct)
              ? values.withholdingPct
              : undefined,
          shippingAddrHe,
          shippingAddrEn,
          // Phase D.2 — מעבירים undefined ל-UUID/תאריך ריקים כדי שה-API יבצע
          // Tesla auto-fill (primary contact מהדב; תאריך הזמנה = היום).
          contactId: values.contactId?.trim() || undefined,
          vatCode: values.vatCode?.trim() || undefined,
          orderDate: values.orderDate?.trim() || undefined,
          isConfidential: values.isConfidential ?? false,
          affectsPlanning: values.affectsPlanning ?? true,
          lines: values.lines.map((line) => ({
            itemId: line.itemId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            budgetSubChapter: line.budgetSubChapter,
            resourceId: line.resourceId,
            description: line.description?.trim() || undefined,
            // Phase 7.13.2 — Line enrichment (מועברים רק אם המשתמש מילא).
            supplyDate: line.supplyDate?.trim() || undefined,
            discountPct:
              line.discountPct != null && Number.isFinite(line.discountPct)
                ? line.discountPct
                : undefined,
            lineCurrency: line.lineCurrency?.trim() || undefined,
            exchangeRate:
              line.exchangeRate != null && Number.isFinite(line.exchangeRate)
                ? line.exchangeRate
                : undefined,
            manufacturerName: line.manufacturerName?.trim() || undefined,
            lineNotes: line.lineNotes?.trim() || undefined,
            priceSource: line.priceSource ?? undefined,
            // Phase D — Priority parity
            uom: line.uom?.trim() || undefined,
            supplierSku: line.supplierSku?.trim() || undefined,
            supplierSkuDescription:
              line.supplierSkuDescription?.trim() || undefined,
            budgetItemCode: line.budgetItemCode?.trim() || undefined,
            // Phase D.3 — cross-system linkage
            demandNumber: line.demandNumber?.trim() || undefined,
            salesOrderId: line.salesOrderId?.trim() || undefined,
            // השדות מועברים תמיד; השרת אוכף אותם רק אם נדרש escalation.
            escalationCategory: line.escalationCategory ?? undefined,
            escalationJustification:
              line.escalationJustification?.trim().length ?? 0 >= 10
                ? line.escalationJustification?.trim()
                : undefined,
          })),
        }

        const res = await fetch("/api/procurement/orders", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            ...Object.fromEntries(buildCompanyHeaders().entries()),
          },
          body: JSON.stringify(requestBody),
        })

        const payload = (await res.json().catch(() => ({}))) as {
          data?: { id: string; poNumber: string }
          error?: string
          details?: string[]
        }

        if (!res.ok) {
          // Phase 7.5 — escalation_required: 400 עם details = ["שורה 1: …", "שורה 3: …"]
          if (res.status === 400 && payload.error === "escalation_required") {
            const newErrors: Record<number, string> = {}
            for (const detail of payload.details ?? []) {
              const idx = parseLineIndexFromDetail(detail)
              if (idx != null) newErrors[idx] = detail
            }
            setLineErrors(newErrors)
            const count = Object.keys(newErrors).length
            toast.error(
              count > 0
                ? `${count} שורות דורשות הצדקת חריגה (3% Rule). מלא את הקטגוריה והנימוק ושלח שוב.`
                : "השרת דרש הצדקת חריגה אך לא זוהו שורות ספציפיות.",
              { duration: 6000 }
            )
            return
          }
          throw new Error(payload.error ?? `שגיאת שרת (${res.status})`)
        }

        const created = payload.data
        if (!created) throw new Error("השרת החזיר תגובה לא צפויה")

        toast.success(`הזמנת רכש ${created.poNumber} נוצרה בהצלחה`, {
          duration: 4000,
        })
        router.push("/marker-ofek/procurement/orders")
        router.refresh()
      } catch (error: unknown) {
        toast.error(
          error instanceof Error ? error.message : "יצירת הזמנת רכש נכשלה"
        )
      } finally {
        setSubmitting(false)
      }
    },
    [router]
  )

  if (loadingLookups) {
    return (
      <div dir="rtl" className="flex h-full items-center justify-center">
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          טוען נתונים...
        </div>
      </div>
    )
  }

  return (
    <div dir="rtl" className="flex h-full min-h-0 flex-col gap-4 p-4 pb-8">
      {/* Header bar */}
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShoppingCart className="size-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold">הזמנת רכש חדשה</h1>
            <p className="text-xs text-muted-foreground">
              מילוי כותרת ושורות פריטים. מע&quot;מ {Math.round(VAT_RATE * 100)}%
              מחושב אוטומטית. מנוע המחירים החכם (Phase 7.5) מציע מחירים בזמן
              אמת.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/marker-ofek/procurement/orders")}
          className="gap-2"
        >
          <ArrowRight className="size-4" aria-hidden />
          חזרה לרשימה
        </Button>
      </header>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex min-h-0 flex-1 flex-col gap-6"
        >
          {/* ------------------------------------------------------------ */}
          {/* Section 1 — Header */}
          {/* ------------------------------------------------------------ */}
          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
              פרטי הזמנה
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <FormField
                control={form.control}
                name="supplierId"
                render={({ field }) => (
                  <FormItem className="lg:col-span-2">
                    <FormLabel>ספק *</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        // Base UI מחזיר string|null מ-onValueChange (null במקרה שה-Select מתאפס).
                        field.onChange(value ?? "")
                        if (value) void handleSupplierChange(value)
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="בחר ספק...">
                            {(() => {
                              const s = suppliers.find(
                                (sup) => sup.id === field.value
                              )
                              if (!s) return null
                              return s.supplierNum
                                ? `${s.supplierNum} · ${s.name}`
                                : s.name
                            })()}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {suppliers.length === 0 ? (
                          <div className="p-2 text-sm text-muted-foreground">
                            לא הוגדרו ספקים.
                          </div>
                        ) : (
                          suppliers.map((supplier) => (
                            <SelectItem key={supplier.id} value={supplier.id}>
                              {supplier.supplierNum
                                ? `${supplier.supplierNum} · ${supplier.name}`
                                : supplier.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      שינוי ספק יעדכן אוטומטית את המחירים בכל השורות.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="projectId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>פרויקט *</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="בחר פרויקט...">
                            {(() => {
                              const p = projects.find(
                                (pr) => pr.id === field.value
                              )
                              return p
                                ? `${p.projectNumber} · ${p.name}`
                                : null
                            })()}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {projects.length === 0 ? (
                          <div className="p-2 text-sm text-muted-foreground">
                            לא הוגדרו פרויקטים.
                          </div>
                        ) : (
                          projects.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                              {project.projectNumber} · {project.name}
                              {project.status !== "ACTIVE" ? (
                                <span className="ms-2 text-xs text-muted-foreground">
                                  ({project.status})
                                </span>
                              ) : null}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>מטבע *</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) =>
                        field.onChange(value as SupportedCurrency)
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SUPPORTED_CURRENCIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
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
                name="urgencyLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>דחיפות *</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) =>
                        field.onChange(value as UrgencyLevel)
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {URGENCY_LEVELS.map((level) => (
                          <SelectItem key={level} value={level}>
                            {URGENCY_LABELS[level]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      גבוהה/קריטית מחייבת הצדקה ועוקפת negotiation אוטומטית.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {showUrgencyJustification ? (
                <FormField
                  control={form.control}
                  name="urgencyJustification"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2 lg:col-span-4">
                      <FormLabel>הצדקת דחיפות *</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          rows={2}
                          placeholder="מדוע ההזמנה דורשת דחיפות גבוהה? (לפחות 10 תווים)"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem className="md:col-span-2 lg:col-span-4">
                    <FormLabel>הערות</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={2}
                        placeholder="טקסט חופשי — תנאי תשלום, יעד אספקה, וכו'"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </section>

          {/* ------------------------------------------------------------ */}
          {/* Section 1.5 — Phase D: לוגיסטיקה ומסחר (Priority parity)    */}
          {/* כל השדות אופציונליים. ה-API מבצע Tesla auto-fill ממה        */}
          {/* שאפשר (כתובת מהספק וכו') כשמשאירים ריק.                     */}
          {/* ------------------------------------------------------------ */}
          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-1 text-sm font-semibold text-muted-foreground">
              לוגיסטיקה ותנאי מסחר
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              שדות אופציונליים מותאמים ל-Priority. ניתן לדלג ולעדכן בהמשך
              במסך הפרט.
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {/* Phase D.2 — orderDate */}
              <FormField
                control={form.control}
                name="orderDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>תאריך הזמנה</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        type="date"
                        className="tabular-nums"
                        dir="ltr"
                      />
                    </FormControl>
                    <FormDescription className="text-[11px]">
                      ברירת מחדל: היום.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Phase D.2 — contactId (depends on supplier) */}
              <FormField
                control={form.control}
                name="contactId"
                render={({ field }) => {
                  const supplierIdValue = form.getValues("supplierId")
                  const disabled =
                    !supplierIdValue || supplierContacts.length === 0
                  return (
                    <FormItem>
                      <FormLabel>איש קשר אצל הספק</FormLabel>
                      <Select
                        value={field.value ?? ""}
                        onValueChange={(value) => field.onChange(value ?? "")}
                        disabled={disabled}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                !supplierIdValue
                                  ? "בחר ספק תחילה…"
                                  : loadingContacts
                                    ? "טוען אנשי קשר…"
                                    : supplierContacts.length === 0
                                      ? "אין אנשי קשר רשומים"
                                      : "בחר איש קשר…"
                              }
                            >
                              {(() => {
                                if (!field.value) return null
                                const c = supplierContacts.find(
                                  (sc) => sc.id === field.value,
                                )
                                if (!c) return field.value
                                return c.isPrimary
                                  ? `★ ${c.name}`
                                  : c.name
                              })()}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {supplierContacts.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              <span>
                                {c.isPrimary ? "★ " : ""}
                                {c.name}
                              </span>
                              {c.role ? (
                                <span className="ms-2 text-xs text-muted-foreground">
                                  {c.role}
                                </span>
                              ) : null}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-[11px]">
                        ★ = איש קשר ראשי (יבחר אוטומטית).
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )
                }}
              />

              {/* Phase D.2 — vatCode (free text — no master table yet) */}
              <FormField
                control={form.control}
                name="vatCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>קוד מע&quot;מ</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        maxLength={32}
                        placeholder="I / Z / X"
                        className="font-mono"
                        dir="ltr"
                      />
                    </FormControl>
                    <FormDescription className="text-[11px]">
                      I=רגיל, Z=אפס, X=פטור (Override של ברירת המחדל).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* paymentTermsCode */}
              <FormField
                control={form.control}
                name="paymentTermsCode"
                render={({ field }) => (
                  <FormItem className="lg:col-span-2">
                    <FormLabel>תנאי תשלום</FormLabel>
                    <Select
                      value={field.value ?? ""}
                      onValueChange={(value) => field.onChange(value ?? "")}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="ברירת מחדל מהספק…">
                            {(() => {
                              if (!field.value) return null
                              const pt = paymentTerms.find(
                                (p) => p.code === field.value
                              )
                              return pt
                                ? `${pt.code} · ${pt.description}`
                                : field.value
                            })()}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {paymentTerms.length === 0 ? (
                          <div className="p-2 text-sm text-muted-foreground">
                            לא הוגדרו תנאי תשלום במערכת.
                          </div>
                        ) : (
                          paymentTerms.map((pt) => (
                            <SelectItem key={pt.code} value={pt.code}>
                              <span className="font-mono text-xs">
                                {pt.code}
                              </span>
                              <span className="ms-2">{pt.description}</span>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Override של תנאי התשלום הדיפולטיים של הספק.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* receivingWarehouseCode */}
              <FormField
                control={form.control}
                name="receivingWarehouseCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>מחסן קליטה</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        maxLength={32}
                        placeholder="MAIN / WH-01"
                        className="font-mono"
                        dir="ltr"
                      />
                    </FormControl>
                    <FormDescription className="text-[11px]">
                      קוד המחסן שמקבל את הסחורה.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* withholdingPct */}
              <FormField
                control={form.control}
                name="withholdingPct"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ניכוי במקור (%)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={(field.value ?? "") as string | number}
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        placeholder="0"
                        className="tabular-nums"
                        dir="ltr"
                      />
                    </FormControl>
                    <FormDescription className="text-[11px]">
                      הוראת ניכוי לתשלום הספק (אם רלוונטי).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* shippingAddrLine1 */}
              <FormField
                control={form.control}
                name="shippingAddrLine1"
                render={({ field }) => (
                  <FormItem className="md:col-span-2 lg:col-span-3">
                    <FormLabel>כתובת למשלוח (רחוב + מספר)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        placeholder='לדוגמה: רחוב הרצל 12'
                      />
                    </FormControl>
                    <FormDescription className="text-[11px]">
                      ריק = יוגדר אוטומטית מכתובת הספק.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* shippingAddrCity */}
              <FormField
                control={form.control}
                name="shippingAddrCity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>עיר</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        placeholder="תל אביב"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/*
                Phase D.3 — English shipping address fields (Address line 1 / City /
                Country) were intentionally removed: 90%+ of Israeli construction
                companies do not run cross-border procurement, and the LTR-English
                block in the middle of the RTL Hebrew form felt like a generic ERP
                template grafted on top of the product. The schema fields
                (`shippingAddrEnLine1` / `shippingAddrEnCity` / `shippingAddrEnCountry`)
                remain in the Zod model and the API payload as optional values
                so that any external integration that relies on them keeps working.
              */}
            </div>

            {/* Phase D.2 — classification flags */}
            <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:gap-6">
              <FormField
                control={form.control}
                name="isConfidential"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start gap-2 space-y-0">
                    <FormControl>
                      <Checkbox
                        id="po-is-confidential"
                        checked={field.value ?? false}
                        onCheckedChange={(value) =>
                          field.onChange(value === true)
                        }
                      />
                    </FormControl>
                    <div className="grid gap-0.5">
                      <Label
                        htmlFor="po-is-confidential"
                        className="cursor-pointer text-sm font-medium"
                      >
                        הזמנה חסויה
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        מסתיר מ-feed הארגוני; נראה רק לשרשרת האישור.
                      </p>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="affectsPlanning"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start gap-2 space-y-0">
                    <FormControl>
                      <Checkbox
                        id="po-affects-planning"
                        checked={field.value ?? true}
                        onCheckedChange={(value) =>
                          field.onChange(value === true)
                        }
                      />
                    </FormControl>
                    <div className="grid gap-0.5">
                      <Label
                        htmlFor="po-affects-planning"
                        className="cursor-pointer text-sm font-medium"
                      >
                        משפיע על תכנון (MRP)
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        כברירת מחדל פעיל. בטל רק עבור הזמנות שלא נכנסות לתכנון
                        חומרים.
                      </p>
                    </div>
                  </FormItem>
                )}
              />
            </div>
          </section>

          {/* ------------------------------------------------------------ */}
          {/* Section 2 — Lines */}
          {/* ------------------------------------------------------------ */}
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground">
                שורות הזמנה ({fields.length})
              </h2>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  append({
                    itemId: "",
                    quantity: 1,
                    unitPrice: 0,
                    budgetSubChapter: "",
                    resourceId: "",
                    description: "",
                    supplyDate: null,
                    discountPct: null,
                    lineCurrency: null,
                    exchangeRate: null,
                    manufacturerName: null,
                    lineNotes: null,
                    priceSource: null,
                    uom: null,
                    supplierSku: null,
                    supplierSkuDescription: null,
                    budgetItemCode: null,
                    demandNumber: null,
                    salesOrderId: null,
                    escalationCategory: undefined,
                    escalationJustification: "",
                  })
                }
                className="gap-2"
              >
                <Plus className="size-4" aria-hidden />
                הוסף שורה
              </Button>
            </div>

            <div className="overflow-hidden rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-center">#</TableHead>
                    <TableHead className="text-start">פריט *</TableHead>
                    <TableHead className="w-32 text-start">כמות *</TableHead>
                    <TableHead className="w-44 text-start">
                      מחיר יחידה *
                    </TableHead>
                    <TableHead className="w-40 text-end">
                      סה&quot;כ שורה
                    </TableHead>
                    <TableHead className="w-12 text-center">פעולה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((fieldRow, index) => (
                    <LineRow
                      key={fieldRow.id}
                      index={index}
                      items={items}
                      control={form.control}
                      onItemChange={handleItemChange}
                      onRemove={() => {
                        remove(index)
                        // נקה גם state חיצוני שקשור לאינדקסים
                        setLineErrors((prev) => {
                          const next = { ...prev }
                          delete next[index]
                          return next
                        })
                        setLineBestAlts((prev) => {
                          const next = { ...prev }
                          delete next[index]
                          return next
                        })
                      }}
                      canRemove={fields.length > 1}
                      bestAlternative={lineBestAlts[index] ?? null}
                      escalationMessage={lineErrors[index] ?? null}
                      onOpenEnrichment={() => setEnrichmentLineIndex(index)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
            {form.formState.errors.lines?.message ? (
              <p className="mt-2 text-sm text-destructive">
                {form.formState.errors.lines.message}
              </p>
            ) : null}
          </section>

          {/* ------------------------------------------------------------ */}
          {/* Section 3 — Summary */}
          {/* ------------------------------------------------------------ */}
          <SummaryFooter control={form.control} />

          {/* ------------------------------------------------------------ */}
          {/* Submit */}
          {/* ------------------------------------------------------------ */}
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push("/marker-ofek/procurement/orders")}
              disabled={submitting}
            >
              ביטול
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="gap-2"
              size="lg"
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              שמור הזמנה (DRAFT)
            </Button>
          </div>
        </form>
      </Form>

      {/* Phase 7.13.2 — Line enrichment dialog (controlled at page level). */}
      <LineEnrichmentDialogConnector
        lineIndex={enrichmentLineIndex}
        form={form}
        onClose={() => setEnrichmentLineIndex(null)}
      />
    </div>
  )
}

// ============================================================================
// LineEnrichmentDialogConnector — מחבר את ה-Dialog למצב הטופס: קורא את
// הערכים הנוכחיים של השורה הפתוחה דרך form.getValues, ובסיום ה-save מעדכן
// את 7 השדות בבת אחת. מבודד כקומפוננטה כדי שלא יגרום ל-re-render של ה-page
// כשמטיפים בשדה אחר.
// ============================================================================

function LineEnrichmentDialogConnector({
  lineIndex,
  form,
  onClose,
}: {
  lineIndex: number | null
  form: ReturnType<typeof useForm<FormInput, undefined, FormOutput>>
  onClose: () => void
}) {
  const watchedCurrency = useWatch({
    control: form.control,
    name: "currency",
  })

  const open = lineIndex != null

  // Snapshot של ערכי השורה הפתוחה בכל פתיחה. הדיאלוג מחזיק draft מקומי
  // ולא מסתנכרן עם ה-form עד ה-save, אז זו צילום-מצב בלבד.
  const initialValues = React.useMemo<LineEnrichmentValues>(() => {
    if (lineIndex == null) return EMPTY_LINE_ENRICHMENT
    const line = form.getValues(`lines.${lineIndex}`)
    return {
      supplyDate: line?.supplyDate ?? null,
      discountPct: line?.discountPct != null ? Number(line.discountPct) : null,
      lineCurrency: line?.lineCurrency ?? null,
      exchangeRate:
        line?.exchangeRate != null ? Number(line.exchangeRate) : null,
      manufacturerName: line?.manufacturerName ?? null,
      lineNotes: line?.lineNotes ?? null,
      priceSource: line?.priceSource ?? null,
      // Phase D — Priority parity
      uom: line?.uom ?? null,
      supplierSku: line?.supplierSku ?? null,
      supplierSkuDescription: line?.supplierSkuDescription ?? null,
      budgetItemCode: line?.budgetItemCode ?? null,
      demandNumber: line?.demandNumber ?? null,
      salesOrderId: line?.salesOrderId ?? null,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineIndex, open])

  if (lineIndex == null) return null

  return (
    <LineEnrichmentDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      lineIndex={lineIndex}
      headerCurrency={watchedCurrency ?? "ILS"}
      values={initialValues}
      onSave={(next) => {
        // setValue פר שדה כדי לשמור על dirty/touched בבסיס שדה.
        form.setValue(`lines.${lineIndex}.supplyDate`, next.supplyDate, {
          shouldDirty: true,
        })
        form.setValue(
          `lines.${lineIndex}.discountPct`,
          next.discountPct ?? undefined,
          { shouldDirty: true }
        )
        form.setValue(`lines.${lineIndex}.lineCurrency`, next.lineCurrency, {
          shouldDirty: true,
        })
        form.setValue(
          `lines.${lineIndex}.exchangeRate`,
          next.exchangeRate ?? undefined,
          { shouldDirty: true }
        )
        form.setValue(
          `lines.${lineIndex}.manufacturerName`,
          next.manufacturerName,
          { shouldDirty: true }
        )
        form.setValue(`lines.${lineIndex}.lineNotes`, next.lineNotes, {
          shouldDirty: true,
        })
        form.setValue(`lines.${lineIndex}.priceSource`, next.priceSource, {
          shouldDirty: true,
        })
        // Phase D — Priority parity
        form.setValue(`lines.${lineIndex}.uom`, next.uom, {
          shouldDirty: true,
        })
        form.setValue(`lines.${lineIndex}.supplierSku`, next.supplierSku, {
          shouldDirty: true,
        })
        form.setValue(
          `lines.${lineIndex}.supplierSkuDescription`,
          next.supplierSkuDescription,
          { shouldDirty: true },
        )
        form.setValue(
          `lines.${lineIndex}.budgetItemCode`,
          next.budgetItemCode,
          { shouldDirty: true },
        )
        // Phase D.3 — cross-system linkage
        form.setValue(
          `lines.${lineIndex}.demandNumber`,
          next.demandNumber,
          { shouldDirty: true },
        )
        form.setValue(
          `lines.${lineIndex}.salesOrderId`,
          next.salesOrderId,
          { shouldDirty: true },
        )
      }}
    />
  )
}

// ============================================================================
// EnrichmentButton — כפתור אייקון עם badge המראה כמה שדות enrichment מולאו.
// מנותק מ-LineRow כדי לא לבלגן את ה-render-tree שלו.
// ============================================================================

function EnrichmentButton({
  filledCount,
  onClick,
  ariaLabel,
}: {
  filledCount: number
  onClick: () => void
  ariaLabel: string
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      onClick={onClick}
      aria-label={ariaLabel}
      className="relative text-muted-foreground hover:text-foreground"
    >
      <Layers className="size-4" aria-hidden />
      {filledCount > 0 ? (
        <Badge
          variant="default"
          className="absolute -end-1 -top-1 h-4 min-w-4 rounded-full px-1 font-mono text-[9px] font-bold leading-none tabular-nums"
        >
          {filledCount}
        </Badge>
      ) : null}
    </Button>
  )
}

// ============================================================================
// LineRow — שורת פריט בודדת. מבודד כדי למזער re-renders של שאר הטופס בזמן
// הקלדה בשורה אחת. משתמש ב-`useWatch` נקודתי לחישוב סה"כ-שורה.
// ============================================================================

type LineRowProps = {
  index: number
  items: ItemOption[]
  control: ReturnType<typeof useForm<FormInput, undefined, FormOutput>>["control"]
  onItemChange: (lineIndex: number, itemId: string) => void | Promise<void>
  onRemove: () => void
  canRemove: boolean
  bestAlternative: PriceSuggestion | null
  /** מחרוזת escalation מהשרת — אם קיימת, ה-panel נחשף אוטומטית. */
  escalationMessage: string | null
  /** Phase 7.13.2 — פותח את LineEnrichmentDialog לשורה זו. */
  onOpenEnrichment: () => void
}

function LineRow({
  index,
  items,
  control,
  onItemChange,
  onRemove,
  canRemove,
  bestAlternative,
  escalationMessage,
  onOpenEnrichment,
}: LineRowProps) {
  // useWatch ברמת השורה בלבד — חישוב סה"כ-שורה ללא טריגר re-render גלובלי.
  const watched = useWatch({ control, name: `lines.${index}` })
  const lineTotal = React.useMemo(() => {
    const qty = Number(watched?.quantity ?? 0)
    const price = Number(watched?.unitPrice ?? 0)
    if (Number.isNaN(qty) || Number.isNaN(price)) return 0
    return round2(qty * price)
  }, [watched?.quantity, watched?.unitPrice])

  // panel חשוף אם השרת סימן או אם המשתמש כבר בחר קטגוריה ידנית.
  const showEscalation =
    escalationMessage != null ||
    Boolean(watched?.escalationCategory) ||
    (watched?.escalationJustification?.trim().length ?? 0) > 0

  // Phase 7.13.2 — סופר שדות enrichment שמולאו, להצגת badge על הכפתור.
  const enrichmentFilledCount = React.useMemo(() => {
    if (!watched) return 0
    return countFilledEnrichmentFields({
      supplyDate: watched.supplyDate ?? null,
      discountPct:
        watched.discountPct != null ? Number(watched.discountPct) : null,
      lineCurrency: watched.lineCurrency ?? null,
      exchangeRate:
        watched.exchangeRate != null ? Number(watched.exchangeRate) : null,
      manufacturerName: watched.manufacturerName ?? null,
      lineNotes: watched.lineNotes ?? null,
      priceSource: watched.priceSource ?? null,
      // Phase D — Priority parity
      uom: watched.uom ?? null,
      supplierSku: watched.supplierSku ?? null,
      supplierSkuDescription: watched.supplierSkuDescription ?? null,
      budgetItemCode: watched.budgetItemCode ?? null,
      demandNumber: watched.demandNumber ?? null,
      salesOrderId: watched.salesOrderId ?? null,
    })
  }, [
    watched?.supplyDate,
    watched?.discountPct,
    watched?.lineCurrency,
    watched?.exchangeRate,
    watched?.manufacturerName,
    watched?.lineNotes,
    watched?.priceSource,
    watched?.uom,
    watched?.supplierSku,
    watched?.supplierSkuDescription,
    watched?.budgetItemCode,
    watched?.demandNumber,
    watched?.salesOrderId,
    watched,
  ])

  return (
    <>
      <TableRow className={cn(escalationMessage && "bg-destructive/5")}>
        <TableCell className="text-center text-xs text-muted-foreground tabular-nums">
          {index + 1}
        </TableCell>

        <TableCell>
          <FormField
            control={control}
            name={`lines.${index}.itemId`}
            render={({ field, fieldState }) => (
              <FormItem className="m-0 space-y-1">
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value ?? "")
                    if (value) void onItemChange(index, value)
                  }}
                >
                  <FormControl>
                    <SelectTrigger
                      className={cn(
                        "h-9",
                        fieldState.error && "border-destructive"
                      )}
                    >
                      <SelectValue placeholder="בחר פריט...">
                        {(() => {
                          const item = items.find(
                            (it) => it.id === field.value
                          )
                          return item
                            ? `${item.itemNumber} · ${item.description}`
                            : null
                        })()}
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {items.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground">
                        לא הוגדרו פריטים.
                      </div>
                    ) : (
                      items.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.itemNumber} · {item.description}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
        </TableCell>

        <TableCell>
          <FormField
            control={control}
            name={`lines.${index}.quantity`}
            render={({ field, fieldState }) => (
              <FormItem className="m-0 space-y-1">
                <FormControl>
                  <Input
                    {...field}
                    // field.value הוא unknown (input type של z.coerce.number) — ממירים
                    // ל-string|number כדי לרצות את HTML input attributes.
                    value={(field.value ?? "") as string | number}
                    type="number"
                    step="0.001"
                    min={0}
                    className={cn(
                      "h-9 tabular-nums",
                      fieldState.error && "border-destructive"
                    )}
                  />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
        </TableCell>

        <TableCell>
          <FormField
            control={control}
            name={`lines.${index}.unitPrice`}
            render={({ field, fieldState }) => (
              <FormItem className="m-0 space-y-1">
                <FormControl>
                  <Input
                    {...field}
                    value={(field.value ?? "") as string | number}
                    type="number"
                    step="0.01"
                    min={0}
                    className={cn(
                      "h-9 tabular-nums",
                      fieldState.error && "border-destructive"
                    )}
                  />
                </FormControl>
                {bestAlternative ? (
                  <p className="flex items-center gap-1 text-[10px] leading-tight text-amber-700 dark:text-amber-500">
                    <Sparkles className="size-3" aria-hidden />
                    חלופה: {numberFormatter.format(bestAlternative.unitPrice)}{" "}
                    {bestAlternative.currency} ({bestAlternative.supplierName})
                  </p>
                ) : null}
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
        </TableCell>

        <TableCell className="text-end font-medium tabular-nums">
          {numberFormatter.format(lineTotal)}
        </TableCell>

        <TableCell className="text-center">
          <div className="flex items-center justify-center gap-0.5">
            <EnrichmentButton
              filledCount={enrichmentFilledCount}
              onClick={onOpenEnrichment}
              ariaLabel={`פרטים מורחבים לשורה ${index + 1}`}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={onRemove}
              disabled={!canRemove}
              aria-label={`מחק שורה ${index + 1}`}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {/* ── Escalation panel (Phase 7.5 — 3% Rule) ────────────────────── */}
      {showEscalation ? (
        <TableRow className="border-t-0 hover:bg-transparent">
          <TableCell colSpan={6} className="bg-amber-50/40 px-3 py-3 dark:bg-amber-900/10">
            <div className="flex items-start gap-2">
              <AlertTriangle
                className="mt-0.5 size-4 flex-none text-amber-600"
                aria-hidden
              />
              <div className="flex-1 space-y-2">
                {escalationMessage ? (
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                    {escalationMessage}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    אם המחיר חורג מהסף — מלא קטגוריה והצדקה כדי שהשרת יקבל את
                    השורה.
                  </p>
                )}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <FormField
                    control={control}
                    name={`lines.${index}.escalationCategory`}
                    render={({ field, fieldState }) => (
                      <FormItem className="m-0 space-y-1">
                        <FormLabel className="text-xs">
                          קטגוריית חריגה
                        </FormLabel>
                        <Select
                          value={field.value ?? ""}
                          onValueChange={(value) =>
                            field.onChange(
                              (value as EscalationCategory) || undefined
                            )
                          }
                        >
                          <FormControl>
                            <SelectTrigger
                              className={cn(
                                "h-9",
                                fieldState.error && "border-destructive"
                              )}
                            >
                              <SelectValue placeholder="בחר קטגוריה..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {ESCALATION_CATEGORIES.map((cat) => (
                              <SelectItem key={cat} value={cat}>
                                {ESCALATION_LABELS[cat]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={control}
                    name={`lines.${index}.escalationJustification`}
                    render={({ field, fieldState }) => (
                      <FormItem className="m-0 space-y-1 md:col-span-2">
                        <FormLabel className="text-xs">
                          הצדקה (לפחות 10 תווים)
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            value={field.value ?? ""}
                            rows={2}
                            placeholder="הסבר עסקי לבחירה למרות חריגת המחיר…"
                            className={cn(
                              "min-h-[60px] resize-y",
                              fieldState.error && "border-destructive"
                            )}
                          />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  )
}

// ============================================================================
// SummaryFooter — חישוב ריאקטיבי של נטו / מע"מ / ברוטו על בסיס כל השורות.
// מבודד כך שייצב על שינויים בשורות ספציפיות ולא ב-header של הטופס.
// ============================================================================

function SummaryFooter({
  control,
}: {
  control: ReturnType<typeof useForm<FormInput, undefined, FormOutput>>["control"]
}) {
  const watchedLines = useWatch({ control, name: "lines" })
  const watchedCurrency = useWatch({ control, name: "currency" })

  const totals = React.useMemo(() => {
    const net = round2(
      (watchedLines ?? []).reduce((sum, line) => {
        const q = Number(line?.quantity ?? 0)
        const p = Number(line?.unitPrice ?? 0)
        if (Number.isNaN(q) || Number.isNaN(p)) return sum
        return sum + q * p
      }, 0)
    )
    const vat = round2(net * VAT_RATE)
    const gross = round2(net + vat)
    return { net, vat, gross }
  }, [watchedLines])

  return (
    <section className="ms-auto w-full max-w-md rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
        סיכום ההזמנה
      </h2>
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">סכום נטו</span>
          <span className="font-medium tabular-nums">
            {numberFormatter.format(totals.net)} {watchedCurrency}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">
            מע&quot;מ ({Math.round(VAT_RATE * 100)}%)
          </span>
          <span className="font-medium tabular-nums">
            {numberFormatter.format(totals.vat)} {watchedCurrency}
          </span>
        </div>
        <Separator />
        <div className="flex items-center justify-between text-base">
          <span className="font-semibold">סכום ברוטו</span>
          <span className="font-bold tabular-nums text-primary">
            {numberFormatter.format(totals.gross)} {watchedCurrency}
          </span>
        </div>
      </div>
    </section>
  )
}

// ============================================================================
// Helpers
// ============================================================================

/** בונה Headers עם x-active-company-id מה-cookie (mirror של masterDataFetch). */
function buildCompanyHeaders(): Headers {
  const out = new Headers()
  const activeCompanyId = readActiveCompanyIdFromCookie()
  if (activeCompanyId) {
    out.set("x-company-id", activeCompanyId)
    out.set("x-active-company-id", activeCompanyId)
  }
  return out
}
