"use client"

/**
 * Items Catalog → Detail tab: נכסים דיגיטליים של פריט.
 *
 * `/api/master-data/items/[id]/assets` — תמונות, datasheets, תווי תקן,
 * SDS וכו׳. ה-API מחזיר signed URLs עם TTL קצר.
 *
 * ערך עסקי: המשתמש בוחר פריט בקטלוג ורואה מיד את תיעוד המוצר
 * (datasheet טכני / תמונה / תעודת תקן) בלי לפתוח את הכרטיס העמוק.
 */

import * as React from "react"
import { Download, ExternalLink } from "lucide-react"

import {
  BentoSmartList,
  type BentoSmartListColumn,
} from "@/components/ui/bento-smart-list"
import {
  MasterDetailTabEmpty,
  MasterDetailTabError,
  MasterDetailTabLoading,
} from "@/components/infrastructure/master-detail/master-detail-shell"
import { masterDataFetch } from "@/lib/erp/master-data-browser"

type AssetRow = {
  id: string
  assetType: string
  storagePath: string
  mimeType: string | null
  sizeBytes: number | null
  sourceUrl: string | null
  discoveredAt: string
  enrichedByAi: boolean
  verifiedByUser: boolean
  signedUrl: string | null
}

const ASSET_TYPE_LABEL: Record<string, string> = {
  PRIMARY_IMAGE: "תמונה ראשית",
  DATASHEET: "Datasheet טכני",
  STANDARD_CERT: "תעודת תקן",
  SAFETY_DATA_SHEET: "גליון בטיחות (SDS)",
  BROCHURE: "חוברת מוצר",
  OTHER: "אחר",
}

const dateFormatter = new Intl.DateTimeFormat("he-IL", { dateStyle: "short" })

function formatSize(bytes: number | null): string {
  if (bytes == null) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function AssetsTab({ itemId }: { itemId: string | null }) {
  const [rows, setRows] = React.useState<AssetRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!itemId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    masterDataFetch<AssetRow[]>(
      `/api/master-data/items/${encodeURIComponent(itemId)}/assets`,
    )
      .then((data) => {
        if (cancelled) return
        setRows(data)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "טעינת נכסים נכשלה")
        setRows([])
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [itemId])

  const columns = React.useMemo<BentoSmartListColumn<AssetRow>[]>(
    () => [
      {
        key: "type",
        title: "סוג",
        className: "min-w-[10rem] text-xs",
        render: (r) => (
          <span className="font-medium">
            {ASSET_TYPE_LABEL[r.assetType] ?? r.assetType}
          </span>
        ),
      },
      {
        key: "mime",
        title: "פורמט",
        className: "w-[7rem] font-mono text-[11px]",
        render: (r) => r.mimeType ?? "—",
      },
      {
        key: "size",
        title: "גודל",
        className: "w-[5rem] text-xs tabular-nums",
        render: (r) => formatSize(r.sizeBytes),
      },
      {
        key: "source",
        title: "מקור",
        className: "w-[8rem]",
        render: (r) => (
          <div className="flex items-center gap-1">
            {r.enrichedByAi ? (
              <span
                className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-700 dark:text-sky-400"
                title="נמצא ע״י זיהוי AI"
              >
                AI
              </span>
            ) : null}
            {r.verifiedByUser ? (
              <span
                className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] text-indigo-700 dark:text-indigo-400"
                title="אומת ידנית"
              >
                מאומת
              </span>
            ) : null}
          </div>
        ),
      },
      {
        key: "discovered",
        title: "נוסף בתאריך",
        className: "w-[7rem] text-[11px]",
        render: (r) => dateFormatter.format(new Date(r.discoveredAt)),
      },
      {
        key: "actions",
        title: "פעולות",
        className: "w-[8rem]",
        render: (r) => (
          <div className="flex items-center gap-1">
            {r.signedUrl ? (
              <>
                <a
                  href={r.signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-indigo-600 hover:bg-indigo-500/10"
                  title="פתח"
                >
                  <ExternalLink className="size-3" aria-hidden />
                  פתח
                </a>
                <a
                  href={r.signedUrl}
                  download
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                  title="הורד"
                >
                  <Download className="size-3" aria-hidden />
                </a>
              </>
            ) : r.sourceUrl ? (
              <a
                href={r.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                title="מקור חיצוני"
              >
                <ExternalLink className="size-3" aria-hidden />
                מקור
              </a>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        ),
      },
    ],
    [],
  )

  if (!itemId) {
    return (
      <MasterDetailTabEmpty>
        בחר פריט במסך האב כדי לראות את הנכסים הדיגיטליים שלו (תמונות,
        Datasheet, תווי תקן).
      </MasterDetailTabEmpty>
    )
  }
  if (loading) return <MasterDetailTabLoading>טוען נכסים…</MasterDetailTabLoading>
  if (error) return <MasterDetailTabError>{error}</MasterDetailTabError>

  return (
    <BentoSmartList<AssetRow>
      items={rows}
      columns={columns}
      rowKey={(r) => r.id}
      emptyState="אין נכסים דיגיטליים לפריט זה. ניתן להעלות datasheet או להריץ זיהוי AI."
    />
  )
}
