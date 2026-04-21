"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import {
  ArrowRight,
  CheckCircle2,
  FileSearch,
  Loader2,
  Plus,
  Trophy,
} from "lucide-react"
import { toast } from "sonner"

import { TendersSubnav } from "@/components/marker-ofek/tenders/tenders-subnav"
import { ProcurementPageHeader } from "@/components/marker-ofek/procurement/procurement-page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { convertTenderToContract } from "@/lib/actions/contract-actions"
import {
  listEntitiesForTenderLink,
  listProjectsForTenderLink,
  submitTenderProject,
  updateTenderProjectLinks,
  type TenderLinkOption,
} from "@/lib/marker-ofek/tenders/tender-contract-actions"
import {
  createTenderProject,
  listTenderProjects,
  type TenderProjectListRow,
} from "@/lib/marker-ofek/tenders/tender-actions"
import { TENDERS_ROUTES } from "@/lib/marker-ofek/tenders/nav"
import type { MoTenderProjectStatus } from "@/types/marker-ofek"

const currencyToastFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

function statusLabel(s: MoTenderProjectStatus): string {
  switch (s) {
    case "draft":
      return "טיוטה"
    case "submitted":
      return "הוגש"
    case "won":
      return "ניצח"
    case "lost":
      return "הפסיד"
    default:
      return s
  }
}

function statusBadgeClass(s: MoTenderProjectStatus): string {
  switch (s) {
    case "draft":
      return "border-slate-200 bg-background text-slate-700"
    case "submitted":
      return "border-amber-200 bg-amber-50 text-amber-900"
    case "won":
      return "border-emerald-200 bg-emerald-50 text-emerald-900"
    case "lost":
      return "border-rose-200 bg-rose-50 text-rose-900"
    default:
      return "border-slate-200 bg-card text-slate-700"
  }
}

export function TendersHubClient({ canConvertTender }: { canConvertTender: boolean }) {
  const router = useRouter()
  const [rows, setRows] = React.useState<TenderProjectListRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [name, setName] = React.useState("")
  const [code, setCode] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [projectOptions, setProjectOptions] = React.useState<TenderLinkOption[]>([])
  const [entityOptions, setEntityOptions] = React.useState<TenderLinkOption[]>([])
  const [linksLoading, setLinksLoading] = React.useState(true)
  const [submittingId, setSubmittingId] = React.useState<string | null>(null)
  const [convertingId, setConvertingId] = React.useState<string | null>(null)
  const [flashWin, setFlashWin] = React.useState<{ tenderId: string; contractId: string } | null>(
    null
  )

  const load = React.useCallback(async () => {
    setLoading(true)
    const res = await listTenderProjects()
    if (res.ok) setRows(res.rows)
    else toast.error(res.error)
    setLoading(false)
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLinksLoading(true)
      const [p, e] = await Promise.all([listProjectsForTenderLink(), listEntitiesForTenderLink()])
      if (cancelled) return
      if (p.ok) setProjectOptions(p.rows)
      else toast.error(p.error)
      if (e.ok) setEntityOptions(e.rows)
      else toast.error(e.error)
      setLinksLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) {
      toast.error("יש להזין שם מכרז")
      return
    }
    setSaving(true)
    const res = await createTenderProject({ name: n, internalCode: code.trim() || null })
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("נוצר מכרז חדש")
    setName("")
    setCode("")
    await load()
  }

  async function handleLinkChange(
    tenderId: string,
    field: "project" | "entity",
    value: string
  ) {
    const row = rows.find((r) => r.id === tenderId)
    if (!row) return
    const linkedProjectId =
      field === "project" ? (value === "__none__" ? null : value) : (row.linked_project_id ?? null)
    const linkedEntityId =
      field === "entity" ? (value === "__none__" ? null : value) : (row.linked_entity_id ?? null)
    const res = await updateTenderProjectLinks({
      tenderProjectId: tenderId,
      linkedProjectId,
      linkedEntityId,
    })
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setRows((prev) =>
      prev.map((r) =>
        r.id === tenderId ? { ...r, linked_project_id: linkedProjectId, linked_entity_id: linkedEntityId } : r
      )
    )
  }

  async function handleSubmitTender(tenderId: string) {
    setSubmittingId(tenderId)
    const res = await submitTenderProject(tenderId)
    setSubmittingId(null)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("המכרז הוגש — ניתן לקשר פרויקט וישות ולנצח")
    await load()
  }

  async function handleWin(tenderId: string) {
    setConvertingId(tenderId)
    setFlashWin(null)
    const res = await convertTenderToContract(tenderId)
    setConvertingId(null)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setFlashWin({ tenderId, contractId: res.contractId })
    const href = `/marker-ofek/finance/contracts/${res.contractId}`
    toast.success(
      res.alreadyConverted ? "החוזה כבר קיים — לא בוצעה המרה נוספת" : "המכרז הומר לחוזה פעיל",
      {
        className: "border border-slate-100 bg-card",
        description:
          res.totalAmount != null ? (
            <span className="font-currency-mono text-sm tabular-nums text-slate-700">
              {currencyToastFormatter.format(res.totalAmount)}
            </span>
          ) : undefined,
        action: {
          label: "מרכז חיוב",
          onClick: () => router.push(href),
        },
      }
    )
    await load()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8 bg-card pb-10">
      <Link
        href="/marker-ofek"
        className="inline-flex w-fit items-center gap-2 text-sm text-slate-500 transition-colors hover:text-indigo-700"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה ללוח הבקרה
      </Link>

      <TendersSubnav />

      <ProcurementPageHeader
        icon={FileSearch}
        kicker="מרקר אופק"
        title="מכרזים והערכות"
        subtitle="תמחור, כתבי כמויות, השוואת ספקים ומבנה ביצוע — ה-DNA הפיננסי של הקבוצה."
        primaryAction={
          <form onSubmit={(e) => void handleCreate(e)} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="grid gap-1">
              <Label htmlFor="tender-name" className="text-xs text-slate-500">
                שם מכרז
              </Label>
              <Input
                id="tender-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-10 min-w-[200px] border-slate-100 bg-card"
                placeholder="לדוגמה: מגדלי השרון"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="tender-code" className="text-xs text-slate-500">
                קוד (אופציונלי)
              </Label>
              <Input
                id="tender-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="h-10 w-32 border-slate-100 bg-card"
                placeholder="T-102"
              />
            </div>
            <Button
              type="submit"
              disabled={saving}
              className="h-10 bg-indigo-600 hover:bg-indigo-500"
            >
              <Plus className="size-4 stroke-[1.5]" aria-hidden />
              מכרז חדש
            </Button>
          </form>
        }
      />

      <section className="rounded-xl border border-slate-100 bg-card">
        <div className="border-b border-slate-100 px-4 py-3 md:px-6">
          <h2 className="text-sm font-semibold text-[#1e293b]">מכרזים פעילים</h2>
          <p className="mt-1 text-xs text-slate-500">
            הגשה → קישור פרויקט וישות → ניצוח (אופיר בלבד) והמרה לחוזה במרכז החיוב.
          </p>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 px-4 py-12 text-slate-500 md:px-6">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            טוען…
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500 md:px-6">
            אין עדיין מכרזים — הזינו שם ולחצו &quot;מכרז חדש&quot;.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => {
              const q = `?projectId=${encodeURIComponent(r.id)}`
              const showLinks = r.status === "draft" || r.status === "submitted"
              const showWin = r.status === "submitted" && canConvertTender
              const won = r.status === "won"
              const linkContractId =
                r.winning_contract_id ??
                (flashWin?.tenderId === r.id ? flashWin.contractId : null)
              const showSuccessBanner =
                Boolean(linkContractId) && (won || flashWin?.tenderId === r.id)

              return (
                <li key={r.id} className="px-4 py-4 md:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-[#1e293b]">{r.name}</p>
                        <Badge
                          variant="outline"
                          className={`text-[11px] font-normal ${statusBadgeClass(r.status)}`}
                        >
                          {statusLabel(r.status)}
                        </Badge>
                      </div>
                      <p className="font-mono text-xs text-slate-500">
                        {r.internal_code ?? "—"} · סיכון{" "}
                        <span className="tabular-nums">{r.risk_percent}</span>% · עומס{" "}
                        <span className="tabular-nums">{r.overhead_percent}</span>%
                      </p>

                      {showLinks && (
                        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap sm:items-end">
                          <div className="grid min-w-[min(100%,12rem)] gap-1">
                            <span className="text-[11px] text-slate-500">פרויקט ביצוע</span>
                            <Select
                              disabled={linksLoading}
                              value={r.linked_project_id ?? "__none__"}
                              onValueChange={(v) => {
                                if (!r.id) return
                                void handleLinkChange(r.id, "project", v ?? "__none__")
                              }}
                            >
                              <SelectTrigger className="h-9 border-slate-100 bg-card text-start text-sm">
                                <SelectValue placeholder="בחרו פרויקט" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">—</SelectItem>
                                {projectOptions.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.subtitle ? `${p.name} (${p.subtitle})` : p.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid min-w-[min(100%,12rem)] gap-1">
                            <span className="text-[11px] text-slate-500">ישות (לקוח/צד)</span>
                            <Select
                              disabled={linksLoading}
                              value={r.linked_entity_id ?? "__none__"}
                              onValueChange={(v) => {
                                if (!r.id) return
                                void handleLinkChange(r.id, "entity", v ?? "__none__")
                              }}
                            >
                              <SelectTrigger className="h-9 border-slate-100 bg-card text-start text-sm">
                                <SelectValue placeholder="בחרו ישות" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">—</SelectItem>
                                {entityOptions.map((en) => (
                                  <SelectItem key={en.id} value={en.id}>
                                    {en.subtitle ? `${en.name} · ${en.subtitle}` : en.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}

                      {showSuccessBanner && linkContractId ? (
                        <div
                          className="mt-3 flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50/80 p-3 sm:flex-row sm:items-center sm:justify-between"
                          role="status"
                        >
                          <div className="flex items-center gap-2 text-sm font-medium text-emerald-900">
                            <CheckCircle2 className="size-4 shrink-0" aria-hidden />
                            <span>חוזה פעיל — מוכן למרכז חיוב</span>
                          </div>
                          <Link
                            href={`/marker-ofek/finance/contracts/${linkContractId}`}
                            className="inline-flex items-center justify-center rounded-lg border border-emerald-300 bg-card px-3 py-1.5 font-currency-mono text-sm font-medium text-emerald-900 shadow-sm transition-colors hover:bg-emerald-100/80"
                          >
                            פתיחת מרכז חיוב
                          </Link>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {r.status === "draft" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-9 border border-slate-200 bg-card"
                          disabled={submittingId === r.id}
                          onClick={() => void handleSubmitTender(r.id)}
                        >
                          {submittingId === r.id ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                          ) : null}
                          הגש למכרז
                        </Button>
                      )}
                      {showWin && (
                        <Button
                          type="button"
                          size="sm"
                          className="h-9 gap-1.5 bg-indigo-600 hover:bg-indigo-500"
                          disabled={convertingId === r.id || !r.linked_project_id || !r.linked_entity_id}
                          title={
                            !r.linked_project_id || !r.linked_entity_id
                              ? "נדרש לקשר פרויקט וישות"
                              : undefined
                          }
                          onClick={() => void handleWin(r.id)}
                        >
                          {convertingId === r.id ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                          ) : (
                            <Trophy className="size-4" aria-hidden />
                          )}
                          ניצחון והמרה לחוזה
                        </Button>
                      )}
                      <Link
                        href={`${TENDERS_ROUTES.pricing}${q}`}
                        className="inline-flex h-9 items-center rounded-lg border border-slate-100 px-3 text-xs font-medium text-indigo-600 hover:bg-background"
                      >
                        תמחור
                      </Link>
                      <Link
                        href={`${TENDERS_ROUTES.boq}${q}`}
                        className="inline-flex h-9 items-center rounded-lg border border-slate-100 px-3 text-xs font-medium text-indigo-600 hover:bg-background"
                      >
                        BoQ
                      </Link>
                      <Link
                        href={`${TENDERS_ROUTES.comparison}${q}`}
                        className="inline-flex h-9 items-center rounded-lg border border-slate-100 px-3 text-xs font-medium text-indigo-600 hover:bg-background"
                      >
                        השוואה
                      </Link>
                      <Link
                        href={`${TENDERS_ROUTES.wbs}${q}`}
                        className="inline-flex h-9 items-center rounded-lg border border-slate-100 px-3 text-xs font-medium text-indigo-600 hover:bg-background"
                      >
                        WBS
                      </Link>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
