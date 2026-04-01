"use client"

import { useRouter } from "next/navigation"
import * as React from "react"
import {
  FileText,
  FolderKanban,
  Loader2,
  Search,
  Truck,
} from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { cn } from "@/lib/utils"

import { useMarkerOfekWorkspace } from "./marker-ofek-workspace-context"

type ProjectHit = { id: string; name: string; code: string; kind: "project" }
type SupplierHit = { id: string; name: string; kind: "supplier" }
type InvoiceHit = {
  id: string
  label: string
  kind: "invoice"
}

type Hit = ProjectHit | SupplierHit | InvoiceHit

function isMissingTable(msg: string) {
  return /relation|does not exist|schema cache/i.test(msg)
}

export function MarkerOfekCommandPalette() {
  const router = useRouter()
  const { commandPaletteOpen, setCommandPaletteOpen, openSupplierDrawer } =
    useMarkerOfekWorkspace()
  const [query, setQuery] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [hits, setHits] = React.useState<Hit[]>([])
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const loadAll = React.useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const supabase = createSupabaseBrowserClient()
    const next: Hit[] = []

    try {
      const { data: projects, error: pErr } = await supabase
        .from("projects")
        .select("id, name, internal_project_code")
        .eq("is_deleted", false)
        .order("name", { ascending: true })
        .limit(80)
      if (pErr) throw pErr
      for (const p of projects ?? []) {
        next.push({
          id: (p as { id: string }).id,
          name: (p as { name: string }).name,
          code: (p as { internal_project_code: string }).internal_project_code,
          kind: "project",
        })
      }

      const { data: entities, error: eErr } = await supabase
        .from("entities")
        .select("id, name, type")
        .eq("is_deleted", false)
        .in("type", ["supplier", "subcontractor"])
        .order("name", { ascending: true })
        .limit(80)
      if (eErr) throw eErr
      for (const e of entities ?? []) {
        next.push({
          id: (e as { id: string }).id,
          name: (e as { name: string }).name,
          kind: "supplier",
        })
      }

      const { data: inv, error: iErr } = await supabase
        .from("mo_invoices")
        .select("id, invoice_number, grand_total, issue_date")
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(50)
      if (iErr) {
        if (!isMissingTable(iErr.message)) throw iErr
      } else {
        for (const row of inv ?? []) {
          const r = row as {
            id: string
            invoice_number: number
            grand_total: number
            issue_date: string
          }
          next.push({
            id: r.id,
            label: `#${r.invoice_number} · ${r.issue_date} · ${r.grand_total}`,
            kind: "invoice",
          })
        }
      }

      setHits(next)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "טעינה נכשלה")
      setHits([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (!commandPaletteOpen) {
      setQuery("")
      return
    }
    void loadAll()
    const t = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(t)
  }, [commandPaletteOpen, loadAll])

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        const t = e.target as HTMLElement | null
        if (t?.closest?.("[data-mo-cmdk-stop]")) return
        e.preventDefault()
        setCommandPaletteOpen(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [setCommandPaletteOpen])

  const q = query.trim().toLowerCase()
  const filtered = React.useMemo(() => {
    if (!q) return hits
    return hits.filter((h) => {
      if (h.kind === "project") {
        return (
          h.name.toLowerCase().includes(q) ||
          h.code.toLowerCase().includes(q)
        )
      }
      if (h.kind === "supplier") {
        return h.name.toLowerCase().includes(q)
      }
      return h.label.toLowerCase().includes(q)
    })
  }, [hits, q])

  const projectsF = filtered.filter((h): h is ProjectHit => h.kind === "project")
  const suppliersF = filtered.filter((h): h is SupplierHit => h.kind === "supplier")
  const invoicesF = filtered.filter((h): h is InvoiceHit => h.kind === "invoice")

  function go(h: Hit) {
    setCommandPaletteOpen(false)
    if (h.kind === "project") {
      router.push(`/marker-ofek/budget?project=${encodeURIComponent(h.id)}`)
      return
    }
    if (h.kind === "supplier") {
      openSupplierDrawer({ supplierId: h.id, supplierName: h.name })
      return
    }
    router.push(`/marker-ofek/finance/invoices/${h.id}/print`)
  }

  return (
    <Dialog open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
      <DialogContent
        className="max-w-lg gap-0 overflow-hidden p-0 sm:max-w-lg"
        showCloseButton
        data-mo-cmdk-stop
      >
        <DialogHeader className="sr-only">
          <DialogTitle>חיפוש מהיר</DialogTitle>
          <DialogDescription>
            קפיצה לפרויקטים, ספקים וחשבוניות
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש פרויקט, ספק או חשבונית…"
            className="h-10 border-0 bg-transparent shadow-none focus-visible:ring-0"
            dir="rtl"
          />
          {loading ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : null}
        </div>
        <div
          className="max-h-[min(60vh,420px)] overflow-y-auto p-2"
          dir="rtl"
        >
          {loadError ? (
            <p className="px-2 py-4 text-center text-sm text-destructive">
              {loadError}
            </p>
          ) : null}
          {!loading && !loadError && filtered.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              אין תוצאות. נסו מילת חיפוש אחרת.
            </p>
          ) : null}

          {projectsF.length > 0 ? (
            <div className="mb-3">
              <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                פרויקטים
              </p>
              <ul className="space-y-0.5">
                {projectsF.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => go(h)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-start text-sm transition-colors",
                        "hover:bg-violet-500/10 focus-visible:bg-violet-500/10 focus-visible:outline-none"
                      )}
                    >
                      <FolderKanban className="size-4 shrink-0 text-violet-500" />
                      <span className="min-w-0 flex-1 truncate">
                        {h.name}
                        <span className="ms-1 font-mono text-xs text-muted-foreground">
                          ({h.code})
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {suppliersF.length > 0 ? (
            <div className="mb-3">
              <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                ספקים וקבלני משנה
              </p>
              <ul className="space-y-0.5">
                {suppliersF.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => go(h)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-start text-sm transition-colors",
                        "hover:bg-emerald-500/10 focus-visible:bg-emerald-500/10 focus-visible:outline-none"
                      )}
                    >
                      <Truck className="size-4 shrink-0 text-emerald-600" />
                      <span className="truncate">{h.name}</span>
                      <span className="ms-auto text-[10px] text-muted-foreground">
                        הזמנת רכש
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {invoicesF.length > 0 ? (
            <div>
              <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                חשבוניות
              </p>
              <ul className="space-y-0.5">
                {invoicesF.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => go(h)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-start text-sm transition-colors",
                        "hover:bg-cyan-500/10 focus-visible:bg-cyan-500/10 focus-visible:outline-none"
                      )}
                    >
                      <FileText className="size-4 shrink-0 text-cyan-600" />
                      <span className="font-mono text-xs">{h.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-between border-t border-border/50 bg-muted/30 px-3 py-2 text-[10px] text-muted-foreground">
          <span>מרקר אופק</span>
          <kbd className="rounded border border-border/80 bg-background px-1.5 py-0.5 font-mono">
            Ctrl+K
          </kbd>
        </div>
      </DialogContent>
    </Dialog>
  )
}
