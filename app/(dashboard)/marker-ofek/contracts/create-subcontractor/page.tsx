"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, Info, Save } from "lucide-react"
import { z } from "zod"
import { toast } from "sonner"

import { FormStatusGuard, useFormStatusGuard } from "@/components/erp/shared/form-status-guard"
import { EntityWorkspace } from "@/components/layout/EntityWorkspace"
import {
  HRAgentPanel,
  type HrAgentSuggestions,
} from "@/components/marker-ofek/hr-agent-panel"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useDiamondNavigation } from "@/hooks/use-diamond-navigation"
import { apiGet, apiPost } from "@/lib/utils/api-client"

const projectRowSchema = z.object({
  id: z.string(),
  name: z.string(),
})
const projectsSchema = z.array(projectRowSchema)
type ProjectRow = z.infer<typeof projectRowSchema>
const itemRowSchema = z.object({
  id: z.string(),
  itemNumber: z.string(),
  description: z.string(),
})
const itemsSchema = z.array(itemRowSchema)
const historicalStatsSchema = z.object({
  avgPrice: z.coerce.number(),
  minPrice: z.coerce.number(),
  maxPrice: z.coerce.number(),
  lastPaidPrice: z.coerce.number(),
  sampleCount: z.coerce.number(),
})
const profitabilityInputSchema = z.object({
  contractValue: z.coerce.number().min(0),
  estimatedCost: z.coerce.number().min(0),
})

const SUBCONTRACTOR_TRADE_OPTIONS = [
  { value: "elec", label: "חשמל ותשתיות" },
  { value: "fire", label: "גילוי אש וכריזה" },
  { value: "low", label: "מתח נמוך" },
] as const

function subcontractorTradeLabel(value: string): string {
  const row = SUBCONTRACTOR_TRADE_OPTIONS.find((o) => o.value === value)
  return row?.label ?? value
}

const denseInput = "h-8 border-slate-200 bg-background text-sm"

export default function CreateSubcontractorContractPage() {
  const [laborOnly, setLaborOnly] = React.useState(false)
  const [paymentModel, setPaymentModel] = React.useState("btb")
  const [contractKind, setContractKind] = React.useState("")
  const [contractTypeAlert, setContractTypeAlert] = React.useState<string | null>(null)
  const [trade, setTrade] = React.useState<string>("")
  const [formState, setFormState] = React.useState({ paymentTerms: "" })
  const [extractedData, setExtractedData] = React.useState<HrAgentSuggestions | null>(null)
  const [projects, setProjects] = React.useState<ProjectRow[]>([])
  const [projectsError, setProjectsError] = React.useState<string | null>(null)
  const [loadingProjects, setLoadingProjects] = React.useState(true)
  const [parentProjectId, setParentProjectId] = React.useState<string>("")
  const [subName, setSubName] = React.useState("")
  const [backToBackNotes, setBackToBackNotes] = React.useState("")
  const [pdfSaveOk, setPdfSaveOk] = React.useState(true)
  const [backToBackAlert, setBackToBackAlert] = React.useState<string | null>(null)
  const [items, setItems] = React.useState<Array<z.infer<typeof itemRowSchema>>>([])
  const [selectedMainItemIds, setSelectedMainItemIds] = React.useState<string[]>([])
  const [historicalByItemId, setHistoricalByItemId] = React.useState<
    Record<string, z.infer<typeof historicalStatsSchema>>
  >({})
  const [contractValue, setContractValue] = React.useState("")
  const [estimatedCost, setEstimatedCost] = React.useState("")

  useDiamondNavigation("projects")

  React.useEffect(() => {
    const controller = new AbortController()
    setProjects([])
    setItems([])
    setProjectsError(null)
    setLoadingProjects(true)
    void (async () => {
      const itemsPromise = apiGet<Array<z.infer<typeof itemRowSchema>>>(
        "/api/erp/master-data/items",
        {
          schema: itemsSchema,
          signal: controller.signal,
        }
      ).catch((error: unknown) => {
        if (controller.signal.aborted) return null
        if (error instanceof Error && error.name === "AbortError") return null
        return []
      })

      try {
        const rows = await apiGet<ProjectRow[]>("/api/projects?status=ACTIVE", {
          schema: projectsSchema,
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        setProjects(rows)
      } catch (error) {
        if (controller.signal.aborted) return
        if (error instanceof Error && error.name === "AbortError") return
        setProjectsError(error instanceof Error ? error.message : "טעינת פרויקטים נכשלה")
      } finally {
        if (!controller.signal.aborted) setLoadingProjects(false)
      }

      const itemRows = await itemsPromise
      if (controller.signal.aborted || itemRows === null) return
      setItems(itemRows)
    })()
    return () => controller.abort()
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    if (selectedMainItemIds.length === 0) {
      setHistoricalByItemId({})
      return () => controller.abort()
    }
    void (async () => {
      try {
        const entries = await Promise.all(
          selectedMainItemIds.slice(0, 3).map(async (itemId) => {
            const stats = await apiPost<z.infer<typeof historicalStatsSchema>>(
              "/api/erp/pricing/historical-stats",
              { itemId },
              { schema: historicalStatsSchema, signal: controller.signal }
            )
            return [itemId, stats] as const
          })
        )
        if (controller.signal.aborted) return
        setHistoricalByItemId(Object.fromEntries(entries))
      } catch (error) {
        if (controller.signal.aborted) return
        if (error instanceof Error && error.name === "AbortError") return
      }
    })()
    return () => controller.abort()
  }, [selectedMainItemIds])

  const profitability = React.useMemo(() => {
    const parsed = profitabilityInputSchema.safeParse({
      contractValue: contractValue === "" ? 0 : Number(contractValue),
      estimatedCost: estimatedCost === "" ? 0 : Number(estimatedCost),
    })
    if (!parsed.success) {
      return { totalContractValue: 0, totalEstimatedCost: 0, marginPct: 0 }
    }
    const totalContractValue = parsed.data.contractValue
    const totalEstimatedCost = parsed.data.estimatedCost
    const marginPct =
      totalContractValue > 0
        ? ((totalContractValue - totalEstimatedCost) / totalContractValue) * 100
        : 0
    return {
      totalContractValue,
      totalEstimatedCost,
      marginPct: Number(marginPct.toFixed(1)),
    }
  }, [contractValue, estimatedCost])

  const marginClass =
    profitability.marginPct > 15
      ? "text-emerald-700"
      : profitability.marginPct >= 5
        ? "text-amber-700"
        : "text-rose-700"

  const parentProjectLabel = React.useMemo(
    () => projects.find((p) => p.id === parentProjectId)?.name?.trim() ?? "",
    [projects, parentProjectId]
  )

  const agentMetadata = React.useMemo(
    () => ({
      laborOnly,
      paymentModel,
      shoftefPlusDays: formState.paymentTerms || undefined,
      ...(trade ? { trade: subcontractorTradeLabel(trade) } : {}),
      ...(contractKind === "lump-sum" || contractKind === "measurement"
        ? { contractType: contractKind }
        : {}),
      ...(parentProjectLabel ? { parentProjectName: parentProjectLabel } : {}),
      ...(backToBackNotes.trim() ? { backToBackNotes: backToBackNotes.trim() } : {}),
    }),
    [
      laborOnly,
      paymentModel,
      formState.paymentTerms,
      trade,
      contractKind,
      parentProjectLabel,
      backToBackNotes,
    ]
  )

  const formValidForSave =
    Boolean(parentProjectId.trim()) &&
    Boolean(subName.trim()) &&
    (contractKind === "lump-sum" || contractKind === "measurement") &&
    pdfSaveOk

  const guard = useFormStatusGuard({
    isStale: loadingProjects || Boolean(projectsError),
    hasHighVariance: Boolean(contractTypeAlert || backToBackAlert),
    staleMessage: projectsError ?? "המידע עדיין נטען. המתינו להשלמת טעינת פרויקטים.",
    highVarianceMessage: "זוהו פערים בחוזה. נדרש טיפול בהתראות לפני שמירה.",
  })

  function handleSaveContract() {
    if (!guard.assertReady()) return
    if (!formValidForSave) {
      toast.error("יש למלא פרויקט אב, שם קבלן וסוג חוזה, ולהשלים ניתוח מסמכים לפני שמירה.")
      return
    }
    toast.info("שמירת חוזה קבלן לשרת תתווסף בשלב הבא — הטופס והניתוח מוכנים לבדיקה.")
  }

  return (
    <EntityWorkspace
      title="הקמת חוזה קבלן / ספק"
      description="Marker Ofek Master-Detail · חוזי משנה בתצורת Bento דו-עמודתית"
      headerActions={
        <>
          <Button type="button" variant="outline" size="sm">
            טיוטה
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!formValidForSave || guard.blocked}
            onClick={handleSaveContract}
          >
            <Save className="ms-1 h-4 w-4" />
            שמור חוזה
          </Button>
        </>
      }
      sidebar={
        <div className="space-y-3">
          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Live Profitability</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs text-slate-600">
              <p>Contract Value: {profitability.totalContractValue.toLocaleString("he-IL")} ₪</p>
              <p>Estimated Cost: {profitability.totalEstimatedCost.toLocaleString("he-IL")} ₪</p>
              <p className={marginClass}>Margin: {profitability.marginPct.toFixed(1)}%</p>
              <p>פרויקט אב: {parentProjectLabel || "לא נבחר"}</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Historical Comparison</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {selectedMainItemIds.length === 0 ? (
                <p className="text-xs text-slate-500">בחרו פריטים ראשיים להצגת היסטוריית מחירים.</p>
              ) : (
                <div className="space-y-1">
                  {selectedMainItemIds.slice(0, 3).map((itemId) => {
                    const row = items.find((item) => item.id === itemId)
                    const stats = historicalByItemId[itemId]
                    return (
                      <div key={itemId} className="rounded-md border border-slate-200 bg-background p-2 text-[11px]">
                        <p className="font-semibold text-slate-800">{row?.description ?? itemId}</p>
                        <p>Avg: {Number(stats?.avgPrice ?? 0).toLocaleString("he-IL")} ₪</p>
                        <p>Last: {Number(stats?.lastPaidPrice ?? 0).toLocaleString("he-IL")} ₪</p>
                        <p>Samples: {Number(stats?.sampleCount ?? 0).toFixed(0)}</p>
                      </div>
                    )
                  })}
                </div>
              )}
              {contractTypeAlert ? (
                <Alert variant="warning">
                  <AlertTitle>סוג חוזה</AlertTitle>
                  <AlertDescription>{contractTypeAlert}</AlertDescription>
                </Alert>
              ) : null}
              {backToBackAlert ? (
                <Alert variant="warning">
                  <AlertTitle>פער גב-אל-גב</AlertTitle>
                  <AlertDescription>{backToBackAlert}</AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>
        </div>
      }
      main={
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <Card className="border-slate-200 xl:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">General Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <Link
                  href="/marker-ofek/contracts/select-type"
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                  חזרה לבחירה
                </Link>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">שיוך לפרויקט אב</Label>
                <Select
                  value={parentProjectId}
                  onValueChange={(v) => setParentProjectId(v ?? "")}
                  disabled={loadingProjects}
                >
                  <SelectTrigger className={denseInput}>
                    <SelectValue
                      placeholder={loadingProjects ? "טוען פרויקטים…" : "בחרו פרויקט"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">שם הקבלן / חברה</Label>
                <Input
                  className={denseInput}
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  placeholder="למשל: גילוי אש בע״מ"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">תחום עבודה</Label>
                <Select value={trade} onValueChange={(v) => setTrade(v ?? "")}>
                  <SelectTrigger className={denseInput}>
                    <SelectValue placeholder="בחר תחום" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBCONTRACTOR_TRADE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">הערות חוזה אב</Label>
                <Textarea
                  value={backToBackNotes}
                  onChange={(e) => setBackToBackNotes(e.target.value)}
                  className="min-h-24 border-slate-200 bg-background text-sm"
                  placeholder="למשל: תשלום 45 יום, עיכבון 5%"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 xl:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Financial Terms</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
                <div>
                  <Label className="text-xs font-semibold text-emerald-900">ביצוע בלבד</Label>
                  <p className="text-[11px] text-emerald-800">ללא אספקת חומרים</p>
                </div>
                <Switch checked={laborOnly} onCheckedChange={setLaborOnly} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">מודל תשלום</Label>
                <Select value={paymentModel} onValueChange={(v) => setPaymentModel(v ?? "btb")}>
                  <SelectTrigger className={denseInput}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="btb">גב אל גב</SelectItem>
                    <SelectItem value="direct">שוטף פלוס</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">סוג חוזה</Label>
                <Select value={contractKind} onValueChange={(v) => setContractKind(v ?? "")}>
                  <SelectTrigger className={denseInput}>
                    <SelectValue placeholder="בחר סוג חוזה" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lump-sum">פאושלי / גלובלי</SelectItem>
                    <SelectItem value="measurement">לפי מדידה / כמויות</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">תנאי תשלום (ימים)</Label>
                <Input
                  type="number"
                  min={0}
                  className={denseInput}
                  value={formState.paymentTerms}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, paymentTerms: e.target.value }))
                  }
                  placeholder={
                    extractedData?.paymentTerms?.value != null
                      ? `הצעה: ${extractedData.paymentTerms.value}`
                      : "מספר ימים"
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Total Contract Value</Label>
                  <Input
                    type="number"
                    min={0}
                    className={denseInput}
                    value={contractValue}
                    onChange={(event) => setContractValue(event.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Total Estimated Cost</Label>
                  <Input
                    type="number"
                    min={0}
                    className={denseInput}
                    value={estimatedCost}
                    onChange={(event) => setEstimatedCost(event.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Main Items (for historical comparison)</Label>
                <Select
                  value=""
                  onValueChange={(value: string | null) => {
                    const nextValue = value ?? ""
                    if (!nextValue) return
                    setSelectedMainItemIds((current) =>
                      current.includes(nextValue) ? current : [...current, nextValue].slice(0, 3)
                    )
                  }}
                >
                  <SelectTrigger className={denseInput}>
                    <SelectValue placeholder="הוספת פריט להשוואה" />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.itemNumber} · {item.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedMainItemIds.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {selectedMainItemIds.map((itemId) => {
                      const item = items.find((row) => row.id === itemId)
                      return (
                        <button
                          key={itemId}
                          type="button"
                          className="rounded border border-slate-200 bg-card px-2 py-1 text-[11px] text-slate-700"
                          onClick={() =>
                            setSelectedMainItemIds((current) => current.filter((row) => row !== itemId))
                          }
                        >
                          {item?.itemNumber ?? itemId} ✕
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                <p className="inline-flex items-center gap-1 font-semibold">
                  <Info className="h-3.5 w-3.5" /> הערת בקרה
                </p>
                <p>ודאו שכתב הכמויות תואם להגדרות כדי למנוע כפל תשלומים או פערי אספקה.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 xl:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Documents & AI Validation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <FormStatusGuard
                isStale={loadingProjects || Boolean(projectsError)}
                hasHighVariance={Boolean(contractTypeAlert || backToBackAlert)}
                staleMessage={projectsError ?? undefined}
              />
              <HRAgentPanel
                mode="subcontractor"
                metadata={agentMetadata}
                primaryActionLabel="בצע ניתוח חוזי חכם"
                hideResultsColumn
                pdfGateForSave
                onPdfSaveGateSatisfied={setPdfSaveOk}
                onSuggestionsFound={setExtractedData}
                onContractTypeMismatch={setContractTypeAlert}
                onBackToBackMismatch={setBackToBackAlert}
              />
            </CardContent>
          </Card>
        </div>
      }
      footerActions={
        <>
          <Link href="/marker-ofek/contracts/select-type">
            <Button type="button" variant="outline" size="sm">
              ביטול
            </Button>
          </Link>
          <Button
            type="button"
            size="sm"
            disabled={!formValidForSave || guard.blocked}
            onClick={handleSaveContract}
          >
            <Save className="ms-1 h-4 w-4" />
            שמירה והמשך
          </Button>
        </>
      }
    />
  )
}
