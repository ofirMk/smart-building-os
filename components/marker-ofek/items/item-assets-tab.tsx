"use client"

/**
 * ItemAssetsTab — Phase 7.13.3.A
 *
 * חושף את `erp_md_item_assets` של ה-master SKU (datasheets, תמונות, תווי
 * תקן). הטבלה גלובלית — כתיבה רק ע"י service-role / Data Enrichment Agent
 * (Phase 7.10.2). ה-tab כולו read-only מצד הקליינט; הפעולה היחידה היא
 * הורדה דרך signed URL.
 *
 * עיצוב: גריד של כרטיסי asset, מקובצים לפי asset_type, עם תמונות-ממוזערות
 * עבור PRIMARY_IMAGE, badges של מקור, source_priority גלוי כאינדיקטור
 * סמכות (10=SII, ירידה מטה ליצרן/מפיץ).
 */

import * as React from "react"
import {
  AlertTriangle,
  BadgeCheck,
  Bot,
  Clock,
  Download,
  ExternalLink,
  FileText,
  ImageIcon,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button-variants"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { cn } from "@/lib/utils"

// ============================================================================
// Types — mirror של ה-API
// ============================================================================

type ItemAsset = {
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

const ASSET_TYPE_LABEL: Record<ItemAsset["assetType"], string> = {
  PRIMARY_IMAGE: "תמונה ראשית",
  DATASHEET: "Datasheet",
  STANDARD_CERT: "תו תקן",
  SAFETY_DATA_SHEET: "MSDS / SDS",
  BROCHURE: "ברושור",
  OTHER: "אחר",
}

const ASSET_TYPE_ORDER: ItemAsset["assetType"][] = [
  "PRIMARY_IMAGE",
  "DATASHEET",
  "STANDARD_CERT",
  "SAFETY_DATA_SHEET",
  "BROCHURE",
  "OTHER",
]

const SOURCE_TYPE_LABEL: Record<string, string> = {
  SII: "מכון התקנים",
  MANUFACTURER: "יצרן",
  DISTRIBUTOR: "מפיץ",
  USER_UPLOAD: "העלאה ידנית",
  OTHER: "אחר",
}

const dateFormatter = new Intl.DateTimeFormat("he-IL", { dateStyle: "short" })

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatDate(value: string | null): string | null {
  if (!value) return null
  try {
    return dateFormatter.format(new Date(value))
  } catch {
    return value
  }
}

// ============================================================================
// Main
// ============================================================================

export function ItemAssetsTab({ itemId }: { itemId: string }) {
  const [assets, setAssets] = React.useState<ItemAsset[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await masterDataFetch<ItemAsset[]>(
          `/api/master-data/items/${encodeURIComponent(itemId)}/assets`
        )
        if (!cancelled) setAssets(result)
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "טעינת נכסים נכשלה")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [itemId])

  // Group by asset_type, preserving the canonical type order.
  const grouped = React.useMemo(() => {
    const map = new Map<ItemAsset["assetType"], ItemAsset[]>()
    for (const asset of assets) {
      const arr = map.get(asset.assetType) ?? []
      arr.push(asset)
      map.set(asset.assetType, arr)
    }
    return ASSET_TYPE_ORDER.filter((t) => map.has(t)).map((t) => ({
      type: t,
      items: map.get(t)!,
    }))
  }, [assets])

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/10 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        טוען נכסים…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        <AlertTriangle className="size-4" aria-hidden />
        {error}
      </div>
    )
  }

  if (assets.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/10 p-10 text-center">
        <FileText className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">אין נכסים מקושרים לפריט זה</p>
        <p className="max-w-md text-xs text-muted-foreground">
          ה-Data Enrichment Agent (Phase 7.10.2) ממלא נכסים אוטומטית מ-SII,
          יצרנים ומפיצים. אם הפריט חדש, ייתכן שייקח עד 24 שעות.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {grouped.map((group) => (
        <section key={group.type} className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">
            {ASSET_TYPE_LABEL[group.type]}
            <span className="ms-1 font-mono text-xs">({group.items.length})</span>
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {group.items.map((asset) => (
              <AssetCard key={asset.id} asset={asset} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

// ============================================================================
// AssetCard
// ============================================================================

function AssetCard({ asset }: { asset: ItemAsset }) {
  const isImage = asset.assetType === "PRIMARY_IMAGE" ||
    (asset.mimeType?.startsWith("image/") ?? false)

  const validUntil = formatDate(asset.validUntil)
  const lastChecked = formatDate(asset.lastCheckedAt)
  const discovered = formatDate(asset.discoveredAt)
  const isExpired = (() => {
    if (!asset.validUntil) return false
    try {
      return new Date(asset.validUntil) < new Date()
    } catch {
      return false
    }
  })()

  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border bg-card",
        isExpired ? "border-amber-500/40" : "border-border"
      )}
    >
      {/* Preview area */}
      {isImage && asset.signedUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={asset.signedUrl}
          alt={ASSET_TYPE_LABEL[asset.assetType]}
          className="aspect-video w-full object-cover"
        />
      ) : (
        <div className="flex aspect-video items-center justify-center bg-muted/40">
          {isImage ? (
            <ImageIcon className="size-8 text-muted-foreground" aria-hidden />
          ) : (
            <FileText className="size-8 text-muted-foreground" aria-hidden />
          )}
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2 p-3">
        {/* Source + verification badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          <SourceBadge
            sourceType={asset.sourceType}
            priority={asset.sourcePriority}
          />
          {asset.verifiedByUser ? (
            <Badge
              variant="outline"
              className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-xs text-emerald-800"
            >
              <ShieldCheck className="size-3" aria-hidden />
              מאומת
            </Badge>
          ) : null}
          {asset.enrichedByAi ? (
            <Badge
              variant="outline"
              className="gap-1 border-violet-500/40 bg-violet-500/10 text-xs text-violet-800"
            >
              <Bot className="size-3" aria-hidden />
              AI
            </Badge>
          ) : null}
          {isExpired ? (
            <Badge
              variant="outline"
              className="gap-1 border-amber-500/40 bg-amber-500/10 text-xs text-amber-800"
            >
              <AlertTriangle className="size-3" aria-hidden />
              פג תוקף
            </Badge>
          ) : null}
        </div>

        {/* Metadata */}
        <dl className="space-y-0.5 text-[11px] text-muted-foreground">
          {asset.mimeType ? (
            <div className="flex items-center justify-between gap-2">
              <dt>סוג קובץ</dt>
              <dd className="truncate font-mono">{asset.mimeType}</dd>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <dt>גודל</dt>
            <dd className="font-mono tabular-nums">{formatBytes(asset.sizeBytes)}</dd>
          </div>
          {discovered ? (
            <div className="flex items-center justify-between gap-2">
              <dt>תגלית</dt>
              <dd>{discovered}</dd>
            </div>
          ) : null}
          {lastChecked ? (
            <div className="flex items-center justify-between gap-2">
              <dt className="inline-flex items-center gap-1">
                <Clock className="size-3" aria-hidden />
                בדיקה אחרונה
              </dt>
              <dd>{lastChecked}</dd>
            </div>
          ) : null}
          {validUntil ? (
            <div className="flex items-center justify-between gap-2">
              <dt>תקף עד</dt>
              <dd className={isExpired ? "text-amber-700" : ""}>{validUntil}</dd>
            </div>
          ) : null}
        </dl>

        {/* Actions */}
        <div className="mt-auto flex items-center justify-end gap-1 pt-1">
          {asset.sourceUrl ? (
            <a
              href={asset.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ size: "sm", variant: "ghost" }),
                "h-7 gap-1 text-xs"
              )}
            >
              <ExternalLink className="size-3" aria-hidden />
              מקור
            </a>
          ) : null}
          {asset.signedUrl ? (
            <a
              href={asset.signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              download
              className={cn(
                buttonVariants({ size: "sm", variant: "outline" }),
                "h-7 gap-1 text-xs"
              )}
            >
              <Download className="size-3" aria-hidden />
              הורד
            </a>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function SourceBadge({
  sourceType,
  priority,
}: {
  sourceType: string | null
  priority: number
}) {
  const isAuthoritative = priority >= 8
  const label = sourceType ? SOURCE_TYPE_LABEL[sourceType] ?? sourceType : "—"
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1",
        isAuthoritative
          ? "border-sky-500/40 bg-sky-500/10 text-sky-900"
          : "border-slate-300/50 bg-slate-100/40 text-slate-700"
      )}
    >
      {isAuthoritative ? (
        <BadgeCheck className="size-3" aria-hidden />
      ) : (
        <Sparkles className="size-3" aria-hidden />
      )}
      {label}
      <span className="font-mono text-[10px] opacity-60">
        ·{priority}
      </span>
    </Badge>
  )
}
