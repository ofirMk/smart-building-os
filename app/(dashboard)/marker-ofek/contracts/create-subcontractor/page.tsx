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
  type HrAgentRiskItem,
  type HrAgentSuggestions,
} from "@/components/marker-ofek/hr-agent-panel"
import { RiskCard } from "@/components/marker-ofek/risk-card"
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
  const [risks, setRisks] = React.useState<HrAgentRiskItem[]>([])
  const [projects, setProjects] = React.useState<ProjectRow[]>([])
  const [projectsError, setProjectsError] = React.useState<string | null>(null)
  const [loadingProjects, setLoadingProjects] = React.useState(true)
  const [parentProjectId, setParentProjectId] = React.useState<string>("")
  const [subName, setSubName] = React.useState("")
  const [backToBackNotes, setBackToBackNotes] = React.useState("")
  const [pdfSaveOk, setPdfSaveOk] = React.useState(true)
  const [backToBackAlert, setBackToBackAlert] = React.useState<string | null>(null)
  const [analysisDone, setAnalysisDone] = React.useState(false)
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
    setProjectsError(null)
    setLoadingProjects(true)
    void (async () => {
      try {
        const [rows, itemRows] = await Promise.all([
          apiGet<ProjectRow[]>("/api/projects?status=ACTIVE", {
            schema: projectsSchema,
            signal: controller.signal,
          }),
          apiGet<Array<z.infer<typeof itemRowSchema>>>("/api/erp/master-data/items", {
            schema: itemsSchema,
            signal: controller.signal,
          }),
        ])
        if (controller.signal.aborted) return
        setProjects(rows)
        setItems(itemRows)
      } catch (error) {
        if (controller.signal.aborted) return
        if (error instanceof Error && error.name === "AbortError") return
        setProjectsError(error instanceof Error ? error.message : "טעינת פרויקטים נכשלה")
      } finally {
        if (!controller.signal.aborted) setLoadingProjects(false)
      }
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
                onRisksFound={setRisks}
                onContractTypeMismatch={setContractTypeAlert}
                onBackToBackMismatch={setBackToBackAlert}
                onAnalysisFinished={({ success }) => setAnalysisDone(success)}
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
/*

import * as React from "react"
import Link from "next/link"
import { ArrowRight, Info, Save } from "lucide-react"
import { z } from "zod"
import { toast } from "sonner"

import { FormStatusGuard, useFormStatusGuard } from "@/components/erp/shared/form-status-guard"
import { EntityWorkspaceLayout } from "@/components/layout/EntityWorkspaceLayout"
import {
  HRAgentPanel,
  type HrAgentRiskItem,
  type HrAgentSuggestions,
} from "@/components/marker-ofek/hr-agent-panel"
import { RiskCard } from "@/components/marker-ofek/risk-card"
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
import { apiGet } from "@/lib/utils/api-client"

const projectRowSchema = z.object({
  id: z.string(),
  name: z.string(),
})
const projectsSchema = z.array(projectRowSchema)
type ProjectRow = z.infer<typeof projectRowSchema>

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
  const [risks, setRisks] = React.useState<HrAgentRiskItem[]>([])
  const [projects, setProjects] = React.useState<ProjectRow[]>([])
  const [projectsError, setProjectsError] = React.useState<string | null>(null)
  const [loadingProjects, setLoadingProjects] = React.useState(true)
  const [parentProjectId, setParentProjectId] = React.useState<string>("")
  const [subName, setSubName] = React.useState("")
  const [backToBackNotes, setBackToBackNotes] = React.useState("")
  const [pdfSaveOk, setPdfSaveOk] = React.useState(true)
  const [backToBackAlert, setBackToBackAlert] = React.useState<string | null>(null)
  const [analysisDone, setAnalysisDone] = React.useState(false)

  useDiamondNavigation("projects")

  React.useEffect(() => {
    const controller = new AbortController()
    setProjects([])
    setProjectsError(null)
    setLoadingProjects(true)
    void (async () => {
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
    })()
    return () => controller.abort()
  }, [])

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
    <EntityWorkspaceLayout
      title="הקמת חוזה קבלן / ספק"
      description="Marker Ofek Master-Detail · חוזי משנה בתצורת Bento דו-עמודתית"
      headerActions={
        <>
          <Button type="button" variant="outline" size="sm">
            טיוטה
          </Button>
          <Button type="button" size="sm" disabled={!formValidForSave || guard.blocked} onClick={handleSaveContract}>
            <Save className="ms-1 h-4 w-4" />
            שמור חוזה
          </Button>
        </>
      }
      sidebar={
        <div className="space-y-3">
          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Project Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs text-slate-600">
              <p>פרויקט אב: {parentProjectLabel || "לא נבחר"}</p>
              <p>תנאי תשלום: {formState.paymentTerms || "—"} ימים</p>
              <p>סטטוס ניתוח: {analysisDone ? "בוצע" : "ממתין"}</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Budget Alerts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
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
              {risks.length === 0 ? (
                <p className="text-xs text-slate-500">אין סיכונים פעילים כרגע.</p>
              ) : (
                <div className="space-y-1">
                  {risks.map((risk, idx) => (
                    <RiskCard
                      key={`${risk.title}-${idx}`}
                      title={risk.title}
                      level={risk.level}
                      source={risk.source}
                      recommendation={risk.recommendation}
                    />
                  ))}
                </div>
              )}
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
                <Link href="/marker-ofek/contracts/select-type" className="inline-flex items-center gap-1 hover:underline">
                  <ArrowRight className="h-3.5 w-3.5" />
                  חזרה לבחירה
                </Link>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">שיוך לפרויקט אב</Label>
                <Select value={parentProjectId} onValueChange={(v) => setParentProjectId(v ?? "")} disabled={loadingProjects}>
                  <SelectTrigger className={denseInput}>
                    <SelectValue placeholder={loadingProjects ? "טוען פרויקטים…" : "בחרו פרויקט"} />
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
                <Input className={denseInput} value={subName} onChange={(e) => setSubName(e.target.value)} placeholder="למשל: גילוי אש בע״מ" />
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
                  onChange={(e) => setFormState((prev) => ({ ...prev, paymentTerms: e.target.value }))}
                  placeholder={extractedData?.paymentTerms?.value != null ? `הצעה: ${extractedData.paymentTerms.value}` : "מספר ימים"}
                />
              </div>
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                <p className="font-semibold inline-flex items-center gap-1"><Info className="h-3.5 w-3.5" /> הערת בקרה</p>
                <p>ודאו שכתב הכמויות תואם להגדרות כדי למנוע כפל תשלומים או פערי אספקה.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 xl:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Documents & AI Validation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <FormStatusGuard isStale={loadingProjects || Boolean(projectsError)} hasHighVariance={Boolean(contractTypeAlert || backToBackAlert)} staleMessage={projectsError ?? undefined} />
              <HRAgentPanel
                mode="subcontractor"
                metadata={agentMetadata}
                primaryActionLabel="בצע ניתוח חוזי חכם"
                hideResultsColumn
                pdfGateForSave
                onPdfSaveGateSatisfied={setPdfSaveOk}
                onSuggestionsFound={setExtractedData}
                onRisksFound={setRisks}
                onContractTypeMismatch={setContractTypeAlert}
                onBackToBackMismatch={setBackToBackAlert}
                onAnalysisFinished={({ success }) => setAnalysisDone(success)}
              />
            </CardContent>
          </Card>
        </div>
      }
      footerActions={
        <>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/marker-ofek/contracts/select-type">ביטול</Link>
          </Button>
          <Button type="button" size="sm" disabled={!formValidForSave || guard.blocked} onClick={handleSaveContract}>
            <Save className="ms-1 h-4 w-4" />
            שמירה והמשך
          </Button>
        </>
      }
    />
  )
}
*/
/*
"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, Info, Save } from "lucide-react"
import { toast } from "sonner"

import {
  HRAgentPanel,
  type HrAgentRiskItem,
  type HrAgentSuggestions,
} from "@/components/marker-ofek/hr-agent-panel"
import { RiskCard } from "@/components/marker-ofek/risk-card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useDiamondNavigation } from "@/hooks/use-diamond-navigation"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { cn, formatError } from "@/lib/utils"

const SUBCONTRACTOR_TRADE_OPTIONS = [
  { value: "elec", label: "חשמל ותשתיות" },
  { value: "fire", label: "גילוי אש וכריזה" },
  { value: "low", label: "מתח נמוך" },
] as const

function subcontractorTradeLabel(value: string): string {
  const row = SUBCONTRACTOR_TRADE_OPTIONS.find((o) => o.value === value)
  return row?.label ?? value
}

const fieldSelectClass =
  "h-auto w-full min-w-0 border-slate-200 bg-background py-6 text-lg"
const fieldInputClass =
  "border-slate-200 bg-background py-6 text-lg"

type ProjectRow = { id: string; name: string }

export default function CreateSubcontractorContractPage() {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false)
  const [laborOnly, setLaborOnly] = React.useState(false)
  const [paymentModel, setPaymentModel] = React.useState("btb")
  const [contractKind, setContractKind] = React.useState("")
  const [contractTypeAlert, setContractTypeAlert] = React.useState<
    string | null
  >(null)
  const [trade, setTrade] = React.useState<string>("")
  const [formState, setFormState] = React.useState({ paymentTerms: "" })
  const [extractedData, setExtractedData] =
    React.useState<HrAgentSuggestions | null>(null)
  const [risks, setRisks] = React.useState<HrAgentRiskItem[]>([])
  const [projects, setProjects] = React.useState<ProjectRow[]>([])
  const [loadingProjects, setLoadingProjects] = React.useState(true)
  const [parentProjectId, setParentProjectId] = React.useState<string>("")
  const [subName, setSubName] = React.useState("")
  const [backToBackNotes, setBackToBackNotes] = React.useState("")
  const [pdfSaveOk, setPdfSaveOk] = React.useState(true)
  const [backToBackAlert, setBackToBackAlert] = React.useState<
    string | null
  >(null)
  const [analysisDone, setAnalysisDone] = React.useState(false)

  useDiamondNavigation("projects")

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoadingProjects(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error } = await supabase
          .from("projects")
          .select("id, name")
          .eq("is_deleted", false)
          .order("name", { ascending: true })
          .limit(500)
        if (error) throw error
        if (!cancelled) {
          setProjects((data ?? []) as ProjectRow[])
        }
      } catch (e) {
        if (!cancelled) toast.error(formatError(e))
      } finally {
        if (!cancelled) setLoadingProjects(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

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
      ...(parentProjectLabel
        ? { parentProjectName: parentProjectLabel }
        : {}),
      ...(backToBackNotes.trim()
        ? { backToBackNotes: backToBackNotes.trim() }
        : {}),
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

  function handleSaveContract() {
    if (!formValidForSave) {
      toast.error(
        "יש למלא פרויקט אב, שם קבלן וסוג חוזה, ולהשלים ניתוח מסמכים (או „דלג על ניתוח”) לפני שמירה."
      )
      return
    }
    toast.info(
      "שמירת חוזה קבלן לשרת תתווסף בשלב הבא — הטופס והניתוח מוכנים לבדיקה."
    )
  }

  const applyValue = React.useCallback(
    (field: keyof typeof formState, val: string | number) => {
      setFormState((prev) => ({
        ...prev,
        [field]: typeof val === "number" ? String(val) : val,
      }))
    },
    []
  )

  return (
    <div className="flex min-h-0 flex-col bg-card" dir="rtl">
      <main className="ms-2 flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-background/50 p-6 lg:p-8">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-sm text-slate-400">
              <Link
                href="/marker-ofek/contracts/select-type"
                className="flex items-center gap-1 transition-colors hover:text-slate-600"
              >
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                חזרה לבחירה
              </Link>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
              הקמת חוזה קבלן / ספק
            </h1>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3 lg:gap-4">
            <Button
              type="button"
              variant="outline"
              className="rounded-full px-6"
            >
              טיוטה
            </Button>
            <Button
              type="button"
              className="gap-2 rounded-full bg-green-600 px-8 shadow-lg transition-transform hover:bg-green-700 active:scale-95 disabled:opacity-50"
              disabled={!formValidForSave}
              title={
                !formValidForSave
                  ? "מלאו שדות חובה והשלימו ניתוח מסמכים כשהועלו קבצים"
                  : undefined
              }
              onClick={() => handleSaveContract()}
            >
              <Save className="h-4 w-4 shrink-0" aria-hidden />
              שמור חוזה
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-visible">
          <div className="form-stack mx-auto w-full max-w-5xl p-8 lg:p-12">
            <section className="grid grid-cols-1 gap-12 overflow-visible border-b border-slate-100 pb-12 md:grid-cols-2">
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-slate-800">
                  פרטי הפרויקט
                </h2>
                <p className="text-sm text-slate-500 italic">
                  שיוך הקבלן לחוזה המזמין הקיים במערכת
                </p>
              </div>
              <div className="space-y-6 overflow-visible">
                <div className="grid gap-2">
                  <Label
                    htmlFor="parentContract"
                    className="flex justify-between font-semibold text-slate-600"
                  >
                    <span>שיוך לחוזה מזמין (פרויקט אב)</span>
                    <span className="text-[10px] font-light text-slate-400">
                      F2 · הקמה מהירה
                    </span>
                  </Label>
                  <Select
                    value={parentProjectId}
                    onValueChange={(v) => setParentProjectId(v ?? "")}
                    disabled={loadingProjects}
                  >
                    <SelectTrigger
                      id="parentContract"
                      className={fieldSelectClass}
                    >
                      <SelectValue
                        placeholder={
                          loadingProjects
                            ? "טוען פרויקטים…"
                            : "בחרו פרויקט אב מהרשימה"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent
                      className="z-[100] border-slate-100 bg-card shadow-xl"
                      align="end"
                      diamondEntity="projects"
                    >
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name?.trim() || p.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="subName" className="font-semibold text-slate-600">
                    שם הקבלן / חברה
                  </Label>
                  <Input
                    id="subName"
                    placeholder="למשל: גילוי אש בע״מ"
                    className={fieldInputClass}
                    value={subName}
                    onChange={(e) => setSubName(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="trade" className="font-semibold text-slate-600">
                    תחום עבודה
                  </Label>
                  <Select value={trade} onValueChange={(v) => setTrade(v ?? "")}>
                    <SelectTrigger id="trade" className={fieldSelectClass}>
                      <SelectValue placeholder="בחר תחום" />
                    </SelectTrigger>
                    <SelectContent
                      className="z-[100] border-slate-200 bg-card"
                      align="end"
                    >
                      {SUBCONTRACTOR_TRADE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label
                    htmlFor="backToBackNotes"
                    className="font-semibold text-slate-600"
                  >
                    תקציר / הערות מזמין (חוזה אב) להשוואת גב־אל־גב
                  </Label>
                  <Textarea
                    id="backToBackNotes"
                    placeholder="למשל: תשלום 45 יום, עיכבון 5%, ביטוח עד סיום + 12 חודש…"
                    className="min-h-[120px] border-slate-200 bg-background/80 text-base font-light leading-relaxed"
                    value={backToBackNotes}
                    onChange={(e) => setBackToBackNotes(e.target.value)}
                  />
                  <p className="text-xs font-light text-slate-500">
                    הטקסט נשלח למודל הניתוח יחד עם שם פרויקט האב; להשוואה מלאה
                    מומלץ להעלות גם את מסמכי חוזה המזמין בחבילה.
                  </p>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-12 border-b border-slate-100 pb-12 md:grid-cols-2">
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-slate-800">
                  תנאי התקשרות
                </h2>
                <p className="text-sm text-slate-500 italic">
                  הגדרת היקף העבודה והתמורה הכספית
                </p>
              </div>
              <div className="space-y-8">
                <div className="flex items-center justify-between rounded-2xl border border-green-100 bg-green-50/50 p-4">
                  <div className="space-y-1 pe-4">
                    <Label
                      htmlFor="labor-only"
                      className="text-lg font-bold text-green-900"
                    >
                      ביצוע בלבד (ללא חומר)
                    </Label>
                    <p className="text-sm text-green-800/80">
                      הפעילו אם הציוד מסופק על ידי מרקר אופק
                    </p>
                  </div>
                  <Switch
                    id="labor-only"
                    checked={laborOnly}
                    onCheckedChange={setLaborOnly}
                    className="data-[state=checked]:bg-green-600"
                  />
                </div>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label
                      htmlFor="contractAmount"
                      className="block w-full text-end font-semibold text-slate-600"
                    >
                      סכום חוזה (₪)
                    </Label>
                    <Input
                      id="contractAmount"
                      type="number"
                      placeholder="0"
                      min={0}
                      dir="ltr"
                      className={cn(
                        fieldInputClass,
                        "text-start font-mono text-xl"
                      )}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label
                      htmlFor="paymentModel"
                      className="block w-full text-end font-semibold text-slate-600"
                    >
                      תנאי תשלום
                    </Label>
                    <Select
                      value={paymentModel}
                      onValueChange={(v) => setPaymentModel(v ?? "btb")}
                    >
                      <SelectTrigger
                        id="paymentModel"
                        className={fieldSelectClass}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent
                        className="z-[100] border-slate-200 bg-card"
                        align="end"
                      >
                        <SelectItem value="btb">
                          גב אל גב מול המזמין
                        </SelectItem>
                        <SelectItem value="direct">שוטף פלוס קבוע</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid w-full gap-2">
                  <Label
                    htmlFor="contract-kind"
                    className="w-full text-end font-semibold text-slate-600"
                  >
                    סוג חוזה
                  </Label>
                  <Select
                    value={contractKind || undefined}
                    onValueChange={(v) => setContractKind(v ?? "")}
                  >
                    <SelectTrigger id="contract-kind" className={fieldSelectClass}>
                      <SelectValue
                        placeholder="בחר סוג חוזה…"
                        className="justify-end text-end"
                      />
                    </SelectTrigger>
                    <SelectContent
                      className="z-[100] border-slate-200 bg-card"
                      align="end"
                    >
                      <SelectItem
                        value="lump-sum"
                        className="justify-end text-end"
                      >
                        פאושלי / גלובלי
                      </SelectItem>
                      <SelectItem
                        value="measurement"
                        className="justify-end text-end"
                      >
                        לפי מדידה / כמויות
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid w-full gap-2">
                  <Label
                    htmlFor="payment-shoftef"
                    className="block w-full text-end font-semibold text-slate-600"
                  >
                    תנאי תשלום (שוטף+ — ימים)
                  </Label>
                  <div className="group relative">
                    <Input
                      id="payment-shoftef"
                      type="number"
                      min={0}
                      value={formState.paymentTerms}
                      onChange={(e) =>
                        setFormState((s) => ({
                          ...s,
                          paymentTerms: e.target.value,
                        }))
                      }
                      placeholder={
                        extractedData?.paymentTerms?.value != null
                          ? `הצעה מהניתוח: ${extractedData.paymentTerms.value}`
                          : "מספר ימים"
                      }
                      dir="ltr"
                      className={cn(
                        fieldInputClass,
                        "text-start font-mono text-xl",
                        extractedData?.paymentTerms?.value != null &&
                          "border-slate-200/90 bg-background/60 ring-1 ring-slate-200/50"
                      )}
                    />
                    {extractedData?.paymentTerms?.value != null ? (
                      <div className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                        <button
                          type="button"
                          className="pointer-events-auto rounded-full border border-slate-200/80 bg-card/90 px-3 py-1.5 text-[10px] font-medium text-slate-500 shadow-sm hover:bg-background"
                          title={extractedData.paymentTerms.source}
                          onClick={() => {
                            const v = extractedData.paymentTerms?.value
                            if (v == null) return
                            applyValue("paymentTerms", v)
                          }}
                        >
                          לאישור הערך
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {extractedData?.paymentTerms?.value != null ? (
                    <p className="ai-ghost-suggestion mt-3 text-xs">
                      מקור: {extractedData.paymentTerms.source}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

            <div className="flex gap-3 rounded-2xl border border-amber-100 bg-amber-50/80 p-4">
              <Info
                className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
                aria-hidden
              />
              <div className="text-sm leading-relaxed text-amber-950">
                <p className="mb-1 font-bold">שים לב</p>
                <p>
                  במצב{" "}
                  <strong>
                    {laborOnly ? "ביצוע בלבד" : "חומר וגם ביצוע"}
                  </strong>
                  , ודאו שכתב הכמויות שמועלה לניתוח המסמכים תואם להגדרות כדי
                  למנוע כפל תשלומים או פערים באספקה.
                </p>
              </div>
            </div>

            <section className="space-y-4 border-t border-slate-100 pt-12">
              <h2 className="text-xl font-bold text-slate-800">
                ניתוח מסמכים להשוואה
              </h2>
              <p className="text-sm font-light text-slate-500">
                העלאת קבצים חוסמת שמירה עד להרצת ניתוח או לחיצה על „דלג על
                ניתוח” בכרטיס המסמכים.
              </p>
              <HRAgentPanel
                mode="subcontractor"
                metadata={agentMetadata}
                primaryActionLabel="בצע ניתוח חוזי חכם"
                hideResultsColumn
                pdfGateForSave
                onPdfSaveGateSatisfied={setPdfSaveOk}
                onSuggestionsFound={setExtractedData}
                onRisksFound={setRisks}
                onContractTypeMismatch={setContractTypeAlert}
                onBackToBackMismatch={setBackToBackAlert}
                onAnalysisFinished={({ success }) => {
                  setAnalysisDone(success)
                  if (success) setIsSidebarOpen(true)
                }}
              />
            </section>
          </div>
        </div>
      </main>

      <aside
        className={cn(
          "fixed top-0 start-0 z-40 h-full border-e border-slate-200 bg-card shadow-2xl transition-all duration-500 ease-in-out",
          isSidebarOpen ? "w-96" : "w-2"
        )}
        onMouseEnter={() => setIsSidebarOpen(true)}
        onMouseLeave={() => setIsSidebarOpen(false)}
      >
        {isSidebarOpen ? (
          <div className="overflow-visible p-6 transition-opacity delay-200">
            <h2 className="mb-6 text-sm font-bold text-slate-600">
              בקרת סיכונים
            </h2>
            {contractTypeAlert ? (
              <Alert variant="warning" className="mb-6 text-end">
                <AlertTitle>סוג חוזה — אי-התאמה למסמך</AlertTitle>
                <AlertDescription>{contractTypeAlert}</AlertDescription>
              </Alert>
            ) : null}
            {backToBackAlert ? (
              <Alert variant="warning" className="mb-6 text-end">
                <AlertTitle>גב־אל־גב — פער מול חוזה המזמין</AlertTitle>
                <AlertDescription>{backToBackAlert}</AlertDescription>
              </Alert>
            ) : null}
            {!analysisDone && risks.length === 0 && !contractTypeAlert ? (
              <p className="mb-4 text-xs text-slate-500">
                הריצו ניתוח מסמכים כדי למלא את סרגל הסיכונים.
              </p>
            ) : null}
            {risks.length === 0 ? (
              <p className="text-xs leading-relaxed text-slate-500">
                הרחיבו את הסרגל והריצו ניתוח. כרטיסיות סיכון יופיעו כאן כשיזוהו
                בנתונים המובנים.
              </p>
            ) : (
              <div className="space-y-1">
                {risks.map((r, i) => (
                  <RiskCard
                    key={`${r.title}-${i}`}
                    title={r.title}
                    level={r.level}
                    source={r.source}
                    recommendation={r.recommendation}
                  />
                ))}
              </div>
            )}
          </div>
        ) : null}
      </aside>
    </div>
  )
}
*/
