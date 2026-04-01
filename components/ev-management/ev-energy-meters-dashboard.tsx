"use client"

import * as React from "react"
import { Settings2, UserPlus } from "lucide-react"

import type {
  EvEnergySummaryMock,
  EvMeterStatusUi,
  EvSmartMeterRow,
  EvTenantAssignOption,
  EvUnassignedMeterOption,
} from "@/components/ev-management/ev-meters-mock-data"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatNisHe } from "@/lib/format-nis"
import { cn } from "@/lib/utils"

type EvEnergyMetersDashboardProps = {
  summary: EvEnergySummaryMock
  meters: EvSmartMeterRow[]
  initialUnassignedPool: EvUnassignedMeterOption[]
  tenantAssignOptions: EvTenantAssignOption[]
}

const STATUS_META: Record<
  EvMeterStatusUi,
  { label: string; dotClass: string; badgeClass: string }
> = {
  online: {
    label: "מקוון",
    dotClass: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]",
    badgeClass:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  },
  charging: {
    label: "בטעינה",
    dotClass:
      "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)] animate-pulse",
    badgeClass:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  },
  offline: {
    label: "לא מקוון",
    dotClass: "bg-gray-500",
    badgeClass: "border-gray-600/60 bg-gray-900/60 text-gray-400",
  },
}

function formatKwhHe(value: number): string {
  if (!Number.isFinite(value)) return "0"
  return `${new Intl.NumberFormat("he-IL", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)} קוט״ש`
}

function newRowId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function EvEnergyMetersDashboard({
  summary,
  meters,
  initialUnassignedPool,
  tenantAssignOptions,
}: EvEnergyMetersDashboardProps) {
  const [rows, setRows] = React.useState<EvSmartMeterRow[]>(() =>
    meters.map((m) => ({ ...m }))
  )
  const [pool, setPool] = React.useState<EvUnassignedMeterOption[]>(() => [
    ...initialUnassignedPool,
  ])

  const [tariffOpen, setTariffOpen] = React.useState(false)
  const [tariffPerKwh, setTariffPerKwh] = React.useState("0.85")

  const [assignOpen, setAssignOpen] = React.useState(false)
  const [assignMeterId, setAssignMeterId] = React.useState("")
  const [assignTenantId, setAssignTenantId] = React.useState("")

  const [pendingMeterId, setPendingMeterId] = React.useState<string | null>(
    null
  )

  const assignableMeterOptions = React.useMemo(() => {
    const fromRows = rows
      .filter((r) => !r.isAssigned)
      .map((r) => ({
        meterId: r.meterId,
        label: `${r.meterId} — לא משויך`,
        kind: "existing-row" as const,
        rowId: r.id,
      }))
    const fromPool = pool.map((p) => ({
      meterId: p.meterId,
      label: `${p.meterId} — ללא שיוך`,
      kind: "pool" as const,
      poolEntryId: p.id,
    }))
    return [...fromRows, ...fromPool]
  }, [rows, pool])

  React.useEffect(() => {
    if (!assignOpen) return
    setAssignMeterId("")
    setAssignTenantId("")
  }, [assignOpen])

  function handleTariffSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setTariffOpen(false)
  }

  function handleAssignmentSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!assignMeterId || !assignTenantId) return

    const tenant = tenantAssignOptions.find((t) => t.id === assignTenantId)
    if (!tenant) return

    const option = assignableMeterOptions.find(
      (o) => o.meterId === assignMeterId
    )
    if (!option) return

    if (option.kind === "existing-row") {
      setRows((prev) =>
        prev.map((r) =>
          r.id === option.rowId
            ? {
                ...r,
                isAssigned: true,
                tenantLabel: tenant.tenantLabel,
                buildingLabel: tenant.buildingLabel,
              }
            : r
        )
      )
    } else {
      setPool((prev) => prev.filter((p) => p.meterId !== assignMeterId))
      setRows((prev) => [
        ...prev,
        {
          id: newRowId(),
          meterId: assignMeterId,
          isAssigned: true,
          tenantLabel: tenant.tenantLabel,
          buildingLabel: tenant.buildingLabel,
          status: "online",
          accumulatedKwh: 0,
          currentChargeNis: 0,
        },
      ])
    }

    setAssignOpen(false)
  }

  function handleUnassign(rowId: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? {
              ...r,
              isAssigned: false,
              tenantLabel: "",
              buildingLabel: "",
              accumulatedKwh: 0,
              currentChargeNis: 0,
            }
          : r
      )
    )
  }

  function handleMeterAction(
    meterId: string,
    action: "disconnect" | "manualBill"
  ) {
    setPendingMeterId(`${meterId}-${action}`)
    window.setTimeout(() => {
      setPendingMeterId((cur) =>
        cur === `${meterId}-${action}` ? null : cur
      )
    }, 450)
  }

  const consumptionDisplay = `${new Intl.NumberFormat("he-IL").format(
    summary.totalConsumptionMonthKwh
  )} קוט״ש`

  const revenueDisplay = formatNisHe(summary.estimatedRevenueNis)

  const chargersDisplay = `${summary.activeChargers} / ${summary.totalChargerSlots}`

  const canSubmitAssignment =
    Boolean(assignMeterId) &&
    Boolean(assignTenantId) &&
    assignableMeterOptions.length > 0

  return (
    <div
      className="-mx-4 min-h-[calc(100vh-3.5rem)] bg-[#0a0a0a] px-4 py-6 font-sans text-gray-100 md:-mx-6 md:px-6 md:py-10"
      dir="rtl"
    >
      <header className="mb-8 flex flex-col gap-6 border-b border-gray-800 pb-8 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="bg-gradient-to-l from-cyan-400 to-blue-600 bg-clip-text text-2xl font-bold text-transparent md:text-3xl">
            ניהול אנרגיה וטעינת רכבים
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-400">
            מנוע חיוב ומדידה — פרויקט מגורים מרקר אופק: מונים חכמים, צריכה
            מצטברת והפרדת הכנסות מחשמל לפי עמדות.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end md:w-auto">
          <Button
            type="button"
            size="lg"
            onClick={() => setAssignOpen(true)}
            className="h-12 shrink-0 gap-2 border-0 bg-gradient-to-l from-emerald-500 to-cyan-600 px-6 text-base font-semibold text-white shadow-lg shadow-emerald-900/25 hover:from-emerald-400 hover:to-cyan-500"
          >
            <UserPlus className="size-5" aria-hidden />
            שיוך עמדה לדייר
          </Button>
          <Button
            type="button"
            size="lg"
            onClick={() => setTariffOpen(true)}
            className="h-12 shrink-0 gap-2 border border-gray-600 bg-[#141414] px-6 text-base font-semibold text-gray-100 hover:bg-[#1a1a1a]"
          >
            <Settings2 className="size-5" aria-hidden />
            הגדרת תעריף קוט״ש
          </Button>
        </div>
      </header>

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <SummaryCard
          title="סה״כ צריכה החודש"
          value={consumptionDisplay}
          subtitle="סיכום קוט״ש מכל עמדות הטעינה בפרויקט"
          accent="bg-cyan-500"
        />
        <SummaryCard
          title="צפי הכנסות מחשמל"
          value={revenueDisplay}
          subtitle="הערכה לפי תעריף נוכחי וצריכה מדווחת"
          accent="bg-emerald-500"
        />
        <SummaryCard
          title="עמדות טעינה פעילות"
          value={chargersDisplay}
          subtitle="עמדות עם זיהוי רשת / OCPP פעיל מתוך כלל החניות המצוידות"
          accent="bg-blue-500"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-800 bg-[#111111] shadow-lg">
        <div className="border-b border-gray-800 px-4 py-4 md:px-6">
          <h2 className="text-lg font-semibold text-gray-100">
            מונים חכמים ועמדות טעינה
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            נתוני דמו — פרויקט אשקלון, 4 בניינים
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-start text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-[#141414]">
                <th className="px-3 py-3.5 font-medium text-gray-400 md:px-4">
                  זיהוי עמדה / מונה
                </th>
                <th className="px-3 py-3.5 font-medium text-gray-400 md:px-4">
                  שיוך
                </th>
                <th className="px-3 py-3.5 font-medium text-gray-400 md:px-4">
                  סטטוס
                </th>
                <th className="px-3 py-3.5 font-medium text-gray-400 md:px-4">
                  צריכה מצטברת
                </th>
                <th className="px-3 py-3.5 font-medium text-gray-400 md:px-4">
                  חיוב נוכחי
                </th>
                <th className="px-3 py-3.5 font-medium text-gray-400 md:px-4">
                  פעולות
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const meta = STATUS_META[row.status]
                const busy =
                  pendingMeterId === `${row.id}-disconnect` ||
                  pendingMeterId === `${row.id}-manualBill`
                return (
                  <tr
                    key={row.id}
                    className="border-b border-gray-800/80 transition-colors hover:bg-[#161616]"
                  >
                    <td className="px-3 py-3.5 font-mono text-xs text-cyan-100/95 md:px-4">
                      {row.meterId}
                    </td>
                    <td className="max-w-[260px] px-3 py-3.5 text-gray-200 md:px-4">
                      {row.isAssigned ? (
                        <>
                          <span className="font-medium">{row.tenantLabel}</span>
                          <span className="text-gray-500"> · </span>
                          <span className="text-gray-400">
                            {row.buildingLabel}
                          </span>
                        </>
                      ) : (
                        <span className="text-gray-500">לא משויך</span>
                      )}
                    </td>
                    <td className="px-3 py-3.5 md:px-4">
                      <span
                        className={cn(
                          "inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                          meta.badgeClass
                        )}
                      >
                        <span
                          className={cn(
                            "size-2 shrink-0 rounded-full",
                            meta.dotClass
                          )}
                          aria-hidden
                        />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 tabular-nums text-gray-100 md:px-4">
                      {formatKwhHe(row.accumulatedKwh)}
                    </td>
                    <td className="px-3 py-3.5 font-medium tabular-nums text-gray-100 md:px-4">
                      {formatNisHe(row.currentChargeNis)}
                    </td>
                    <td className="px-3 py-3.5 md:px-4">
                      <div className="flex max-w-[320px] flex-wrap items-center gap-2">
                        {row.isAssigned ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            className="border-rose-600/45 bg-transparent text-rose-200 hover:bg-rose-950/35"
                            onClick={() => handleUnassign(row.id)}
                          >
                            הסר שיוך
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy || row.status === "offline"}
                          className="border-amber-600/50 bg-transparent text-amber-100 hover:bg-amber-950/40 disabled:opacity-50"
                          onClick={() =>
                            handleMeterAction(row.id, "disconnect")
                          }
                        >
                          נתק זרם
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          className="border-cyan-600/50 bg-transparent text-cyan-100 hover:bg-cyan-950/35"
                          onClick={() =>
                            handleMeterAction(row.id, "manualBill")
                          }
                        >
                          הפק חיוב ידני
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent
          className="border-gray-800 bg-[#111111] text-gray-100 sm:max-w-md"
          dir="rtl"
          showCloseButton
        >
          <form onSubmit={handleAssignmentSave}>
            <DialogHeader>
              <DialogTitle className="text-gray-100">
                שיוך מונה לדייר
              </DialogTitle>
              <DialogDescription className="text-gray-400">
                בחרו מונה פנוי או עמדה ללא שיוך, ואז דייר — השמירה מדמה רישום
                במערכת הניהול.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-5 py-2">
              <div className="grid gap-2">
                <Label htmlFor="assign-meter" className="text-gray-300">
                  מונה / עמדה
                </Label>
                <Select
                  value={assignMeterId || undefined}
                  onValueChange={(v) => setAssignMeterId(v ?? "")}
                  disabled={assignableMeterOptions.length === 0}
                >
                  <SelectTrigger
                    id="assign-meter"
                    size="default"
                    className="h-11 w-full min-w-0 border-gray-700 bg-[#0a0a0a] text-gray-100"
                  >
                    <SelectValue placeholder="בחרו מונה זמין" />
                  </SelectTrigger>
                  <SelectContent className="border-gray-800 bg-[#141414] text-gray-100">
                    {assignableMeterOptions.map((o) => (
                      <SelectItem key={`${o.kind}-${o.meterId}`} value={o.meterId}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {assignableMeterOptions.length === 0 ? (
                  <p className="text-xs text-amber-200/90">
                    אין מונים פנויים לשיוך — כל העמדות משויכות או אינן ברשימה.
                  </p>
                ) : null}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="assign-tenant" className="text-gray-300">
                  דייר
                </Label>
                <Select
                  value={assignTenantId || undefined}
                  onValueChange={(v) => setAssignTenantId(v ?? "")}
                  disabled={tenantAssignOptions.length === 0}
                >
                  <SelectTrigger
                    id="assign-tenant"
                    size="default"
                    className="h-11 w-full min-w-0 border-gray-700 bg-[#0a0a0a] text-gray-100"
                  >
                    <SelectValue placeholder="בחרו דייר" />
                  </SelectTrigger>
                  <SelectContent className="border-gray-800 bg-[#141414] text-gray-100">
                    {tenantAssignOptions.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.displayLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="border-gray-800 bg-transparent sm:justify-start">
              <Button
                type="button"
                variant="outline"
                className="border-gray-600 text-gray-200"
                onClick={() => setAssignOpen(false)}
              >
                ביטול
              </Button>
              <Button
                type="submit"
                disabled={!canSubmitAssignment}
                className="border-0 bg-gradient-to-l from-emerald-500 to-cyan-600 text-white hover:from-emerald-400 hover:to-cyan-500 disabled:opacity-50"
              >
                שמור שיוך
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={tariffOpen} onOpenChange={setTariffOpen}>
        <DialogContent
          className="border-gray-800 bg-[#111111] text-gray-100 sm:max-w-md"
          dir="rtl"
          showCloseButton
        >
          <form onSubmit={handleTariffSave}>
            <DialogHeader>
              <DialogTitle className="text-gray-100">
                הגדרת תעריף קוט״ש
              </DialogTitle>
              <DialogDescription className="text-gray-400">
                תעריף לחישוב חיוב דיירים (שקלים לקוט״ש). בפריסה לייצור הערך
                יישמר במסד הנתונים.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 py-2">
              <Label htmlFor="tariff-kwh" className="text-gray-300">
                תעריף (₪ לקוט״ש)
              </Label>
              <Input
                id="tariff-kwh"
                name="tariff"
                inputMode="decimal"
                value={tariffPerKwh}
                onChange={(e) => setTariffPerKwh(e.target.value)}
                className="border-gray-700 bg-[#0a0a0a] text-gray-100"
                autoComplete="off"
              />
            </div>
            <DialogFooter className="border-gray-800 bg-transparent sm:justify-start">
              <Button
                type="button"
                variant="outline"
                className="border-gray-600 text-gray-200"
                onClick={() => setTariffOpen(false)}
              >
                ביטול
              </Button>
              <Button
                type="submit"
                className="border-0 bg-gradient-to-l from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500"
              >
                שמור
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SummaryCard({
  title,
  value,
  subtitle,
  accent,
}: {
  title: string
  value: string
  subtitle: string
  accent: string
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-800 bg-[#111111] p-6 shadow-lg transition-colors hover:border-gray-700">
      <div className={`absolute end-0 top-0 h-full w-1 ${accent}`} />
      <h3 className="mb-2 text-sm font-medium text-gray-400">{title}</h3>
      <div className="mb-2 text-2xl font-bold tabular-nums text-white md:text-3xl">
        {value}
      </div>
      <p className="text-xs text-gray-500">{subtitle}</p>
    </div>
  )
}
