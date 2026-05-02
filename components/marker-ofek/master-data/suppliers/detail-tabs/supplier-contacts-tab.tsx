"use client"

/**
 * Suppliers Master/Detail → Detail tab: אנשי קשר.
 *
 * רשימת `erp_md_supplier_contacts` של הספק. מקור הנתונים — ה-API
 * הקיים `/api/erp/master-data/suppliers/[id]/contacts`.
 *
 * בעקבות תמונה #2 ב-Priority — Tab "אנשי קשר לספק" — העמודות
 * הקבילות הן: שם, תפקיד, טלפון, אימייל, ראשי?.
 */

import * as React from "react"
import { Star } from "lucide-react"

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
import type { ErpSupplierContact } from "@/types/erp"

export function SupplierContactsTab({
  supplierId,
}: {
  supplierId: string | null
}) {
  const [rows, setRows] = React.useState<ErpSupplierContact[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!supplierId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    masterDataFetch<ErpSupplierContact[]>(
      `/api/erp/master-data/suppliers/${encodeURIComponent(supplierId)}/contacts`,
    )
      .then((data) => {
        if (cancelled) return
        setRows(data)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "טעינת אנשי קשר נכשלה")
        setRows([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [supplierId])

  const columns = React.useMemo<BentoSmartListColumn<ErpSupplierContact>[]>(
    () => [
      {
        key: "primary",
        title: "",
        className: "w-[1.5rem]",
        render: (r) =>
          r.isPrimary ? (
            <Star
              className="size-3 fill-amber-500 text-amber-500"
              aria-label="איש קשר ראשי"
            />
          ) : null,
      },
      {
        key: "name",
        title: "שם",
        className: "min-w-[10rem] font-medium",
        render: (r) => r.name,
      },
      {
        key: "role",
        title: "תפקיד",
        className: "min-w-[8rem] text-xs text-muted-foreground",
        render: (r) => r.role ?? "—",
      },
      {
        key: "phone",
        title: "טלפון",
        className: "w-[9rem] font-mono text-[11px]",
        render: (r) => r.phone ?? "—",
      },
      {
        key: "email",
        title: "אימייל",
        className: "min-w-[12rem] text-xs",
        render: (r) =>
          r.email ? (
            <a
              href={`mailto:${r.email}`}
              className="text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {r.email}
            </a>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
    ],
    [],
  )

  if (!supplierId) {
    return (
      <MasterDetailTabEmpty>
        בחר ספק במסך האב כדי לראות את אנשי הקשר שלו.
      </MasterDetailTabEmpty>
    )
  }
  if (loading) return <MasterDetailTabLoading>טוען אנשי קשר…</MasterDetailTabLoading>
  if (error) return <MasterDetailTabError>{error}</MasterDetailTabError>

  return (
    <BentoSmartList<ErpSupplierContact>
      items={rows}
      columns={columns}
      rowKey={(r) => r.id}
      emptyState="לא הוגדרו אנשי קשר לספק זה."
    />
  )
}
