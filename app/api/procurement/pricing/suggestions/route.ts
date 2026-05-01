/**
 * `/api/procurement/pricing/suggestions` — Phase 7.5
 *
 * Endpoint stateless להצעות מחיר רב-מקורי.
 * נצרך ע"י:
 *   • UI הטופס של יצירת PO (panel "מחירים אפשריים" מתחת לטבלת השורות).
 *   • Python AI agents ב-7.10 דרך service-role (אין הבדל בחוזה).
 *
 * Query params:
 *   - itemId      (uuid, חובה)  — ה-master SKU
 *   - supplierId  (uuid, חובה)  — הספק שנבחר (נמצא במרכז ההשוואה)
 *   - quantity    (number, אופ) — לסינון tier-based; ברירת מחדל 1
 *   - windowDays  (number, אופ) — חלון היסטורי; ברירת מחדל מהגדרות החברה
 *
 * Response:
 *   {
 *     "suggestions": [...],          // כל המקורות (PRICELIST + LAST_PURCHASE + CROSS)
 *     "bestAlternative": {...}|null, // ההצעה הזולה ביותר מספק אחר (אם קיימת)
 *     "windowDays": 90
 *   }
 */

import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"
import { getPriceSuggestions } from "@/lib/procurement/pricing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const paramsSchema = z.object({
  itemId: z.string().uuid("itemId חייב להיות uuid"),
  supplierId: z.string().uuid("supplierId חייב להיות uuid"),
  quantity: z.coerce.number().positive().optional(),
  windowDays: z.coerce.number().int().min(1).max(3650).optional(),
})

export async function GET(req: NextRequest) {
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const url = req.nextUrl
  const parsed = paramsSchema.safeParse({
    itemId: url.searchParams.get("itemId"),
    supplierId: url.searchParams.get("supplierId"),
    quantity: url.searchParams.get("quantity") ?? undefined,
    windowDays: url.searchParams.get("windowDays") ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid params" },
      { status: 400 }
    )
  }

  try {
    const result = await getPriceSuggestions(supabase, {
      companyId: activeCompanyId,
      masterItemId: parsed.data.itemId,
      supplierId: parsed.data.supplierId,
      quantity: parsed.data.quantity,
      windowDays: parsed.data.windowDays,
    })
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
