"use client"

/**
 * Suppliers Master/Detail → Detail tab: מסמכים.
 *
 * רשימת מסמכים מצורפים ברמת ספק (`erp_supplier_attachments` —
 * Phase 9.2 migration). מקביל לתאב "מסמכים לספק" ב-Priority
 * (Batch #5, תמונה #23 — חוזה שירות PDF, אישור ניכוי, מפרט).
 *
 * MVP: read-only. POST/DELETE יבואו ב-Phase 9.4 כש-bucket
 * `supplier-attachments` ב-Storage יהיה מוכן.
 */

import * as React from "react"
import { FileText, Lock } from "lucide-react"

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

type DocumentRow = {
  id: string
  fileName: string
  documentType: string | null
  description: string | null
  mimeType: string | null
  sizeBytes: number | null
  storagePath: string
  storageBucket: string
  uploadedAt: string
  isLocked: boolean
}

const DOCUMENT_TYPE_LABEL: Record<string, string> = {
  SERVICE_CONTRACT: "חוזה שירות",
  TECH_SPEC: "מפרט טכני",
  PRICE_QUOTE: "הצעת מחיר",
  WITHHOLDING_TAX_CERT: "אישור ניכוי מס",
  BOOKKEEPING_CERT: "אישור ניהול ספרים",
  INSURANCE_CERT: "אישור ביטוח",
  BUSINESS_LICENSE: "רישיון עסק",
  BANK_DETAILS: "פרטי בנק",
  OTHER: "אחר",
}

const dateTimeFormatter = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "short",
  timeStyle: "short",
})

function formatBytes(bytes: number | null): string {
  if (bytes == null || bytes === 0) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function SupplierDocumentsTab({
  supplierId,
}: {
  supplierId: string | null
}) {
  const [rows, setRows] = React.useState<DocumentRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!supplierId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    masterDataFetch<DocumentRow[]>(
      `/api/master-data/suppliers/${encodeURIComponent(supplierId)}/documents`,
    )
      .then((data) => {
        if (cancelled) return
        setRows(data)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "טעינת מסמכים נכשלה")
        setRows([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [supplierId])

  const columns = React.useMemo<BentoSmartListColumn<DocumentRow>[]>(
    () => [
      {
        key: "icon",
        title: "",
        className: "w-[2rem]",
        render: () => (
          <FileText className="size-3.5 text-muted-foreground" aria-hidden />
        ),
      },
      {
        key: "fileName",
        title: "שם קובץ",
        className: "min-w-[14rem]",
        render: (r) => (
          <span className="block truncate font-medium text-foreground">
            {r.fileName}
          </span>
        ),
      },
      {
        key: "type",
        title: "סוג",
        className: "w-[10rem] text-xs text-muted-foreground",
        render: (r) =>
          r.documentType
            ? (DOCUMENT_TYPE_LABEL[r.documentType] ?? r.documentType)
            : "—",
      },
      {
        key: "size",
        title: "גודל",
        className: "w-[5rem] text-[11px] tabular-nums text-muted-foreground",
        render: (r) => formatBytes(r.sizeBytes),
      },
      {
        key: "uploaded",
        title: "הועלה",
        className: "w-[10rem] text-[10px] text-muted-foreground",
        render: (r) =>
          r.uploadedAt
            ? dateTimeFormatter.format(new Date(r.uploadedAt))
            : "—",
      },
      {
        key: "locked",
        title: "",
        className: "w-[2rem]",
        render: (r) =>
          r.isLocked ? (
            <Lock
              className="size-3 text-amber-600 dark:text-amber-400"
              aria-label="מסמך נעול"
            />
          ) : null,
      },
    ],
    [],
  )

  if (!supplierId) {
    return (
      <MasterDetailTabEmpty>
        בחר ספק במסך האב כדי לראות את המסמכים שלו (חוזים, אישורים, מפרטים).
      </MasterDetailTabEmpty>
    )
  }
  if (loading) return <MasterDetailTabLoading>טוען מסמכים…</MasterDetailTabLoading>
  if (error) return <MasterDetailTabError>{error}</MasterDetailTabError>

  return (
    <BentoSmartList<DocumentRow>
      items={rows}
      columns={columns}
      rowKey={(r) => r.id}
      emptyState="לא הועלו מסמכים לספק זה."
    />
  )
}
