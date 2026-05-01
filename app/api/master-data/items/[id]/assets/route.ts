/**
 * `/api/master-data/items/[id]/assets` — Phase 7.13.3.A
 *
 * GET — מחזיר את ה-`erp_md_item_assets` של ה-master SKU המבוקש (datasheets,
 * תמונות, תווי תקן). signedUrls נוצרים פר אסט עם TTL של 10 דקות.
 *
 * Tenant validation:
 *   טבלת ה-assets היא **גלובלית** (משותפת בין כל הלקוחות; ראה את ההערה
 *   במיגרציה 20260801170000). אין RLS פר-company. כדי לאכוף isolation,
 *   אנחנו מוודאים שה-master_item_id שייך ל-`activeCompanyId` ב-`erp_md_items`
 *   *לפני* שמחזירים את הקבצים.
 */

import { type NextRequest, NextResponse } from "next/server"

import { requireMasterDataApiContext } from "@/lib/erp/master-data-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { id: string }

function normalizeParams(
  params: Promise<RouteParams> | RouteParams
): Promise<RouteParams> {
  return Promise.resolve(params)
}

const SIGNED_URL_TTL_SECONDS = 60 * 10

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

export type ItemAssetDto = {
  id: string
  assetType:
    | "PRIMARY_IMAGE"
    | "DATASHEET"
    | "STANDARD_CERT"
    | "SAFETY_DATA_SHEET"
    | "BROCHURE"
    | "OTHER"
  storagePath: string
  storageBucket: string
  mimeType: string | null
  sizeBytes: number | null
  sourceType: string | null
  sourceUrl: string | null
  sourcePriority: number
  validUntil: string | null
  lastCheckedAt: string | null
  enrichedByAi: boolean
  verifiedByUser: boolean
  discoveredAt: string
  signedUrl: string | null
}

type AssetRow = {
  id: string
  asset_type: string
  storage_path: string
  storage_bucket: string
  mime_type: string | null
  size_bytes: number | string | null
  source_type: string | null
  source_url: string | null
  source_priority: number | string
  valid_until: string | null
  last_checked_at: string | null
  enriched_by_ai: boolean
  verified_by_user: boolean
  discovered_at: string
}

function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (value == null) return null
  const n = typeof value === "string" ? Number(value) : value
  return Number.isFinite(n) ? n : null
}

// ─────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams }
) {
  const { id } = await normalizeParams(params)

  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  // 1) Tenant ownership check on the master item itself.
  const itemQuery = await supabase
    .from("erp_md_items")
    .select("id")
    .eq("id", id)
    .eq("company_id", activeCompanyId)
    .maybeSingle()
  if (itemQuery.error) {
    return NextResponse.json({ error: itemQuery.error.message }, { status: 500 })
  }
  if (!itemQuery.data) {
    return NextResponse.json({ error: "פריט לא נמצא" }, { status: 404 })
  }

  // 2) Fetch assets sorted by source_priority (authority chain).
  const { data, error } = await supabase
    .from("erp_md_item_assets")
    .select(
      "id,asset_type,storage_path,storage_bucket,mime_type,size_bytes,source_type,source_url,source_priority,valid_until,last_checked_at,enriched_by_ai,verified_by_user,discovered_at"
    )
    .eq("master_item_id", id)
    .order("source_priority", { ascending: false })
    .order("discovered_at", { ascending: false })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as AssetRow[]

  // 3) Enrich with signed URLs in parallel; bucket may differ per row.
  const dtos = await Promise.all(
    rows.map(async (row): Promise<ItemAssetDto> => {
      let signedUrl: string | null = null
      try {
        const { data: signed } = await supabase.storage
          .from(row.storage_bucket || "master-sku-assets")
          .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS)
        signedUrl = signed?.signedUrl ?? null
      } catch {
        signedUrl = null
      }
      return {
        id: row.id,
        assetType: row.asset_type as ItemAssetDto["assetType"],
        storagePath: row.storage_path,
        storageBucket: row.storage_bucket,
        mimeType: row.mime_type,
        sizeBytes: toNumberOrNull(row.size_bytes),
        sourceType: row.source_type,
        sourceUrl: row.source_url,
        sourcePriority: Number(row.source_priority ?? 0),
        validUntil: row.valid_until,
        lastCheckedAt: row.last_checked_at,
        enrichedByAi: Boolean(row.enriched_by_ai),
        verifiedByUser: Boolean(row.verified_by_user),
        discoveredAt: row.discovered_at,
        signedUrl,
      }
    })
  )

  return NextResponse.json({ data: dtos })
}
