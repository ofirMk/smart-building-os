/**
 * `/api/master-data/uoms` — ניהול יחידות מידה (Master Data לפריטים).
 *
 * מודל: היברידי (ראה `20260720120000_uom_company_scoping_hybrid.sql`):
 *   • company_id IS NULL  → UOM גלובלי (KG, M, EA, וכו')
 *   • company_id = active → UOM ספציפי לחברה הפעילה
 *
 * GET:
 *   מחזיר את שני הסטים מאוחדים, לפי הסדר: גלובליים תחילה ואח"כ פרטיים-לחברה.
 *   דה-דופ לפי `code` בצד השרת — אם חברה יצרה override לקוד גלובלי, הספציפי גובר.
 *
 * POST:
 *   יוצר UOM חדש מתחת לסקופ של החברה הפעילה.
 *   בודק שאין collision עם UOM קיים (גלובלי או פרטי) באותו code.
 *   מחזיר 409 על conflict, 400 על input לא חוקי, 201 על הצלחה.
 *
 * הגנת חברה: כל הקריאות עוברות דרך `requireMasterDataApiContext` —
 * אימות משתמש + membership + active company context.
 */

import { type NextRequest, NextResponse } from "next/server"

import {
  requireMasterDataApiContext,
  sanitizeOptionalString,
} from "@/lib/erp/master-data-api"

type UomCreateBody = {
  code?: unknown
  descriptionHe?: unknown
  nameEn?: unknown
}

type UomRow = {
  id: string
  code: string
  description_he: string
  name_en: string
  company_id: string | null
}

type UomDto = {
  id: string
  code: string
  descriptionHe: string
  nameEn: string
  /** null = גלובלי */
  companyId: string | null
}

const UOM_CODE_RE = /^[A-Z0-9][A-Z0-9_-]{0,15}$/

function toDto(row: UomRow): UomDto {
  return {
    id: row.id,
    code: row.code,
    descriptionHe: row.description_he,
    nameEn: row.name_en,
    companyId: row.company_id,
  }
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const q = sanitizeOptionalString(req.nextUrl.searchParams.get("q"))
  let query = supabase
    .from("units_of_measure")
    .select("id,code,description_he,name_en,company_id")
    // RLS כבר מסנן: company_id IS NULL OR company_id = active.
    // ה-OR-clause בקוד מטה הוא הגנה כפולה למקרה ש-RLS עוקף (admin/service-role).
    .or(`company_id.is.null,company_id.eq.${activeCompanyId}`)
    .order("company_id", { ascending: true, nullsFirst: true })
    .order("code", { ascending: true })

  if (q) {
    query = query.or(
      `code.ilike.%${q}%,description_he.ilike.%${q}%,name_en.ilike.%${q}%`
    )
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // De-dup לפי code — מעדיפים פרטי-חברה על גלובלי (override)
  const byCode = new Map<string, UomDto>()
  for (const row of (data ?? []) as UomRow[]) {
    const existing = byCode.get(row.code)
    if (!existing) {
      byCode.set(row.code, toDto(row))
      continue
    }
    // אם הקיים גלובלי והחדש פרטי-חברה — מחליפים
    if (existing.companyId === null && row.company_id !== null) {
      byCode.set(row.code, toDto(row))
    }
  }

  return NextResponse.json({
    data: Array.from(byCode.values()).sort((a, b) =>
      a.code.localeCompare(b.code)
    ),
  })
}

export async function POST(req: NextRequest) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const body = (await req.json().catch(() => null)) as UomCreateBody | null
  const codeRaw = sanitizeOptionalString(body?.code)
  const code = codeRaw ? codeRaw.toUpperCase() : null
  const descriptionHe = sanitizeOptionalString(body?.descriptionHe)
  const nameEn = sanitizeOptionalString(body?.nameEn) ?? ""

  if (!code || !descriptionHe) {
    return NextResponse.json(
      { error: "code and descriptionHe are required" },
      { status: 400 }
    )
  }
  if (!UOM_CODE_RE.test(code)) {
    return NextResponse.json(
      {
        error:
          "code: A-Z, 0-9, _ או - בלבד; אות/מספר ראשון; עד 16 תווים",
      },
      { status: 400 }
    )
  }
  if (descriptionHe.length > 100) {
    return NextResponse.json(
      { error: "descriptionHe מוגבל ל-100 תווים" },
      { status: 400 }
    )
  }
  if (nameEn.length > 128) {
    return NextResponse.json(
      { error: "nameEn מוגבל ל-128 תווים" },
      { status: 400 }
    )
  }

  // בדיקת conflict — code קיים כגלובלי או פרטי לחברה זו
  const { data: existing, error: lookupError } = await supabase
    .from("units_of_measure")
    .select("id,company_id")
    .eq("code", code)
    .or(`company_id.is.null,company_id.eq.${activeCompanyId}`)
    .maybeSingle()

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 })
  }
  if (existing) {
    const scope = existing.company_id === null ? "גלובלי" : "בחברה זו"
    return NextResponse.json(
      { error: `קוד "${code}" כבר קיים (${scope})` },
      { status: 409 }
    )
  }

  const { data, error } = await supabase
    .from("units_of_measure")
    .insert({
      code,
      description_he: descriptionHe,
      name_en: nameEn,
      company_id: activeCompanyId,
    })
    .select("id,code,description_he,name_en,company_id")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ data: toDto(data as UomRow) }, { status: 201 })
}
