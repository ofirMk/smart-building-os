"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import * as React from "react"
import {
  ArrowRight,
  BookOpen,
  Calculator,
  FileSignature,
  LayoutDashboard,
  ListPlus,
  Loader2,
  Plus,
  Save,
  Tags,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { updateContract } from "../../actions/contract-actions"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DualPaneLayout } from "@/components/marker-ofek/workspace/dual-pane-layout"
import { onBoqRowInputKeyDown } from "@/lib/marker-ofek/contract-boq-enter"
import { decodeMilestoneStoredName } from "@/lib/marker-ofek/milestone-name-codec"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { cn, formatError } from "@/lib/utils"

type ContractTypeValue = "main_contract" | "sub_contract"
type PricingModelValue = "boq" | "paushal"

type BoqRow = {
  id: string
  sectionCode: string
  description: string
  unit: string
  quantity: string
  unitPrice: string
}

function createEmptyBoqRow(): BoqRow {
  return {
    id: crypto.randomUUID(),
    sectionCode: "",
    description: "",
    unit: "",
    quantity: "",
    unitPrice: "",
  }
}

type PaushalRow = {
  id: string
  sectionCode: string
  description: string
  weightPct: string
}

function createEmptyPaushalRow(): PaushalRow {
  return {
    id: crypto.randomUUID(),
    sectionCode: "",
    description: "",
    weightPct: "",
  }
}

function parseNum(s: string): number {
  const n = parseFloat(String(s).replace(",", "."))
  return Number.isFinite(n) ? n : 0
}

function computeBoqTotal(rows: BoqRow[]): number {
  return rows.reduce((sum, row) => {
    return sum + parseNum(row.quantity) * parseNum(row.unitPrice)
  }, 0)
}

function getValidPaushalRowsForDb(rows: PaushalRow[]) {
  return rows.filter(
    (r) => r.sectionCode.trim().length > 0 && r.description.trim().length > 0
  )
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function sumPaushalWeights(rows: PaushalRow[]): number {
  return roundMoney(rows.reduce((s, r) => s + parseNum(r.weightPct), 0))
}

function paushalLineAmount(totalVal: number, weightPct: number): number {
  return roundMoney((totalVal * weightPct) / 100)
}

const currencyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export default function EditMarkerOfekContractPage() {
  const params = useParams()
  const router = useRouter()
  const contractId = typeof params.id === "string" ? params.id : ""

  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [loadingContract, setLoadingContract] = React.useState(true)
  const [milestoneCount, setMilestoneCount] = React.useState<number | null>(null)

  const [projectName, setProjectName] = React.useState("")
  const [entityName, setEntityName] = React.useState("")
  const [contractType, setContractType] = React.useState<ContractTypeValue>(
    "main_contract"
  )
  const [pricingModel, setPricingModel] =
    React.useState<PricingModelValue>("boq")
  const [retentionPct, setRetentionPct] = React.useState("5")
  const [insurancePct, setInsurancePct] = React.useState("0.6")
  const [testingPct, setTestingPct] = React.useState("0")
  const [paushalTotalValue, setPaushalTotalValue] = React.useState("")
  const [rows, setRows] = React.useState<BoqRow[]>(() => [createEmptyBoqRow()])
  const [paushalRows, setPaushalRows] = React.useState<PaushalRow[]>(() => [
    createEmptyPaushalRow(),
  ])
  const [isSavePending, startSaveTransition] = React.useTransition()
  const [entityLegalId, setEntityLegalId] = React.useState("")
  const [entityAddress, setEntityAddress] = React.useState("")
  const [entityDeductionsFile, setEntityDeductionsFile] = React.useState("")
  const [dualSplit, setDualSplit] = React.useState(false)

  const boqTotal = React.useMemo(() => computeBoqTotal(rows), [rows])
  const paushalTotalNum = parseNum(paushalTotalValue)
  const validPaushal = React.useMemo(
    () => getValidPaushalRowsForDb(paushalRows),
    [paushalRows]
  )
  const paushalWeightSum = React.useMemo(
    () => sumPaushalWeights(validPaushal),
    [validPaushal]
  )
  const paushalWeightsOk = Math.abs(paushalWeightSum - 100) <= 0.05

  React.useEffect(() => {
    if (!contractId) {
      setLoadError("מזהה חוזה חסר")
      setLoadingContract(false)
      return
    }

    let cancelled = false

    async function load() {
      setLoadingContract(true)
      setLoadError(null)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data: cRow, error: cErr } = await supabase
          .from("contracts")
          .select(
            `
            id,
            agreement_type,
            contract_type,
            retention_pct,
            insurance_pct,
            testing_pct,
            pricing_model,
            total_amount,
            projects ( name ),
            entities ( name, legal_id, address, deductions_file_number ),
            contract_milestones (
              id,
              name,
              amount,
              weight_percentage,
              sort_order
            )
          `
          )
          .eq("id", contractId)
          .eq("is_deleted", false)
          .maybeSingle()

        if (cErr) throw cErr
        if (!cRow) {
          if (!cancelled) setLoadError("החוזה לא נמצא")
          return
        }

        const { count: msCount, error: msErr } = await supabase
          .from("contract_milestones")
          .select("id", { count: "exact", head: true })
          .eq("contract_id", contractId)

        const p = cRow.projects as
          | { name: string }
          | { name: string }[]
          | null
        const e = cRow.entities as
          | {
              name: string
              legal_id: string | null
              address: string | null
              deductions_file_number: string | null
            }
          | Array<{
              name: string
              legal_id: string | null
              address: string | null
              deductions_file_number: string | null
            }>
          | null

        const proj = Array.isArray(p) ? p[0] : p
        const ent = Array.isArray(e) ? e[0] : e

        const pmRaw = (cRow as { pricing_model?: string | null }).pricing_model
        const pm: PricingModelValue =
          pmRaw === "paushal" ? "paushal" : "boq"

        const msNested = (cRow as { contract_milestones?: unknown })
          .contract_milestones
        const msList = (
          Array.isArray(msNested) ? msNested : msNested ? [msNested] : []
        ) as Array<{
          name: string
          amount: number | string | null
          weight_percentage: number | string | null
          sort_order: number | null
        }>
        const msSorted = [...msList].sort(
          (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)
        )
        const totalAmt = Number(
          (cRow as { total_amount?: number | null }).total_amount
        )

        const mappedRows: BoqRow[] =
          msSorted.length > 0 && pm === "boq"
            ? msSorted.map((m) => {
                const dec = decodeMilestoneStoredName(String(m.name ?? ""))
                const amt = Number(m.amount)
                let qty = dec.quantity
                let up = dec.unitPrice
                if (
                  (!qty || !up) &&
                  Number.isFinite(amt) &&
                  amt > 0
                ) {
                  qty = "1"
                  up = String(amt)
                }
                return {
                  id: crypto.randomUUID(),
                  sectionCode: dec.sectionCode,
                  description: dec.description,
                  unit: "",
                  quantity: qty,
                  unitPrice: up,
                }
              })
            : [createEmptyBoqRow()]

        let mappedPaushal: PaushalRow[] = [createEmptyPaushalRow()]
        if (msSorted.length > 0 && pm === "paushal") {
          mappedPaushal = msSorted.map((m) => {
            let w = Number(m.weight_percentage)
            if (!Number.isFinite(w) && Number.isFinite(totalAmt) && totalAmt > 0) {
              w = roundMoney(
                (Number(m.amount) / totalAmt) * 100
              )
            }
            const dec = decodeMilestoneStoredName(String(m.name ?? ""))
            return {
              id: crypto.randomUUID(),
              sectionCode: dec.sectionCode,
              description: dec.description,
              weightPct: Number.isFinite(w) ? String(w) : "",
            }
          })
        }

        if (cancelled) return

        setProjectName(proj?.name?.trim() ?? "")
        setEntityName(ent?.name?.trim() ?? "")
        setEntityLegalId(ent?.legal_id?.trim() ?? "")
        setEntityAddress(ent?.address?.trim() ?? "")
        setEntityDeductionsFile(ent?.deductions_file_number?.trim() ?? "")
        setContractType(
          (cRow.contract_type as ContractTypeValue) === "sub_contract"
            ? "sub_contract"
            : "main_contract"
        )
        setRetentionPct(String(Number(cRow.retention_pct) ?? 5))
        setInsurancePct(String(Number(cRow.insurance_pct) ?? 0.6))
        setTestingPct(
          String(
            Number((cRow as { testing_pct?: number | null }).testing_pct) ?? 0
          )
        )
        setPricingModel(pm)
        if (pm === "paushal") {
          setPaushalRows(mappedPaushal)
          setPaushalTotalValue(
            Number.isFinite(totalAmt) && totalAmt > 0
              ? String(totalAmt)
              : ""
          )
          setRows([createEmptyBoqRow()])
        } else {
          setRows(mappedRows)
          setPaushalRows([createEmptyPaushalRow()])
          setPaushalTotalValue("")
        }
        setMilestoneCount(!msErr && msCount != null ? msCount : null)
      } catch (err) {
        if (!cancelled) setLoadError(formatError(err))
      } finally {
        if (!cancelled) setLoadingContract(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [contractId])

  function updateRow(id: string, patch: Partial<BoqRow>) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    )
  }

  function addRow() {
    setRows((prev) => [...prev, createEmptyBoqRow()])
  }

  function removeRow(id: string) {
    setRows((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((r) => r.id !== id)
    })
  }

  function updatePaushalRow(id: string, patch: Partial<PaushalRow>) {
    setPaushalRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    )
  }

  function addPaushalRow() {
    setPaushalRows((prev) => [...prev, createEmptyPaushalRow()])
  }

  function removePaushalRow(id: string) {
    setPaushalRows((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((r) => r.id !== id)
    })
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const pName = projectName.trim()
    const eName = entityName.trim()
    if (!contractId) {
      toast.error("מזהה חוזה חסר")
      return
    }
    if (!pName || !eName) {
      toast.error("יש למלא שם פרויקט ושם ישות לפני השמירה")
      return
    }

    startSaveTransition(async () => {
      try {
        const fd = new FormData()
        fd.set("projectName", pName)
        fd.set("entityName", eName)
        fd.set("entityLegalId", entityLegalId)
        fd.set("entityAddress", entityAddress)
        fd.set("entityDeductionsFile", entityDeductionsFile)
        fd.set("contractType", contractType)
        fd.set("retentionPct", retentionPct)
        fd.set("insurancePct", insurancePct)
        fd.set("testingPct", testingPct)

        const structure =
          pricingModel === "boq"
            ? {
                pricingModel: "boq" as const,
                boqRows: rows.map((r) => ({
                  sectionCode: r.sectionCode,
                  description: r.description,
                  unit: r.unit,
                  quantity: r.quantity,
                  unitPrice: r.unitPrice,
                })),
              }
            : {
                pricingModel: "paushal" as const,
                totalContractValue: paushalTotalValue,
                milestones: paushalRows.map((r) => ({
                  sectionCode: r.sectionCode,
                  description: r.description,
                  weightPct: r.weightPct,
                })),
              }

        const res = await updateContract(contractId, fd, structure)
        if (!res.ok) {
          toast.error(res.error)
          return
        }
        toast.success("החוזה עודכן בהצלחה")
        router.refresh()
      } catch (err) {
        toast.error(`עדכון החוזה נכשל: ${formatError(err)}`)
      }
    })
  }

  const referencePanel = (
    <div className="space-y-4 text-sm leading-relaxed">
      <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
        <p className="flex items-center gap-2 font-semibold text-cyan-900 dark:text-cyan-200">
          <BookOpen className="size-4 shrink-0" aria-hidden />
          כתב כמויות (BoQ)
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted-foreground">
          <li>סעיף ותיאור חובה לכל שורה שנשמרת בבסיס הנתונים.</li>
          <li>מקש Enter בשדה מוסיף שורה חדשה (לא שולח את הטופס).</li>
          <li>שורות שינוי דייר / עבודות נוספות לא נמחקות בעדכון זה.</li>
        </ul>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-center gap-2 border-violet-500/30"
        render={<Link href="/marker-ofek/items" target="_blank" rel="noopener noreferrer" />}
      >
        <Tags className="size-4" aria-hidden />
        פתיחת קטלוג פריטים (לשונית חדשה)
      </Button>
    </div>
  )

  if (loadingContract) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="size-8 animate-spin" aria-hidden />
        <p className="text-sm">טוען חוזה לעריכה…</p>
      </div>
    )
  }

  if (loadError || !contractId) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-12 text-center">
        <p className="text-destructive">{loadError ?? "שגיאה"}</p>
        <Button variant="outline" render={<Link href="/marker-ofek/contracts" />}>
          חזרה לרשימת חוזים
        </Button>
      </div>
    )
  }

  return (
    <DualPaneLayout
      split={dualSplit}
      onSplitChange={setDualSplit}
      referenceTitle="עזרים וקטלוג"
      reference={referencePanel}
    >
      <div
        dir="rtl"
        lang="he"
        className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-6 pb-10"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/marker-ofek/contracts"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowRight className="size-4 rotate-180" aria-hidden />
            חזרה לרשימת חוזים
          </Link>
          <Link
            href={`/marker-ofek/contracts/${contractId}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <LayoutDashboard className="size-4" aria-hidden />
            תצוגת חשבון וחשבונות חלקיים
          </Link>
        </div>

        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            עריכת חוזה
          </h1>
          <p className="text-sm text-muted-foreground">
            עדכון פרטי חוזה, תנאים מסחריים וכתב כמויות בסיס. אבני דרך לחשבונות
            חלקיים:{" "}
            {milestoneCount != null ? (
              <span className="font-medium text-foreground">{milestoneCount}</span>
            ) : (
              "—"
            )}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          dir="rtl"
          className="flex flex-col gap-6"
          aria-busy={isSavePending}
        >
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="border-b border-border/60 pb-4">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">
                  <FileSignature className="size-5" aria-hidden />
                </div>
                <div className="space-y-1">
                  <CardTitle>פרטי חוזה</CardTitle>
                  <CardDescription>
                    פרויקט, ישות חוזית וסוג החוזה — השינויים נשמרים בישויות
                    המקושרות.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-5 pt-6 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="edit-project-name">שם פרויקט</Label>
                <Input
                  id="edit-project-name"
                  name="projectName"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder='לדוגמה: הירדן 89 רמת גן'
                  dir="rtl"
                  disabled={isSavePending}
                  className="w-full"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="edit-entity-name">שם ישות (מזמין / קבלן משנה)</Label>
                <Input
                  id="edit-entity-name"
                  name="entityName"
                  value={entityName}
                  onChange={(e) => setEntityName(e.target.value)}
                  placeholder='לדוגמה: חיים מיכאלוביץ ניהול ביצוע ויזמות בע"מ'
                  dir="rtl"
                  disabled={isSavePending}
                  className="w-full"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="edit-entity-legal-id">ח.פ / ע.מ</Label>
                <Input
                  id="edit-entity-legal-id"
                  name="entityLegalId"
                  value={entityLegalId}
                  onChange={(e) => setEntityLegalId(e.target.value)}
                  placeholder="מספר רישום מס"
                  dir="ltr"
                  disabled={isSavePending}
                  className="w-full font-mono"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="edit-entity-address">כתובת</Label>
                <Input
                  id="edit-entity-address"
                  name="entityAddress"
                  value={entityAddress}
                  onChange={(e) => setEntityAddress(e.target.value)}
                  placeholder="רחוב, עיר, מיקוד"
                  dir="rtl"
                  disabled={isSavePending}
                  className="w-full"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="edit-entity-deductions">תיק ניכויים</Label>
                <Input
                  id="edit-entity-deductions"
                  name="entityDeductionsFile"
                  value={entityDeductionsFile}
                  onChange={(e) => setEntityDeductionsFile(e.target.value)}
                  placeholder="מספר תיק ניכויים אצל הלקוח"
                  dir="ltr"
                  disabled={isSavePending}
                  className="w-full font-mono"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="edit-contract-type">סוג חוזה</Label>
                <Select
                  value={contractType}
                  disabled={isSavePending}
                  onValueChange={(v) =>
                    setContractType((v as ContractTypeValue) ?? "main_contract")
                  }
                >
                  <SelectTrigger id="edit-contract-type" className="w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="main_contract">חוזה מזמין</SelectItem>
                    <SelectItem value="sub_contract">חוזה קבלן משנה</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <CardHeader className="border-b border-border/60 pb-4">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400">
                  <Calculator className="size-5" aria-hidden />
                </div>
                <div className="space-y-1">
                  <CardTitle>תנאים מסחריים</CardTitle>
                  <CardDescription>
                    סוג הסכם, עכבון וביטוח — לפי תנאי החוזה.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-5 pt-6 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-3">
                <Label htmlFor="edit-pricing-model">סוג הסכם (תמחיר)</Label>
                <Select
                  value={pricingModel}
                  disabled={isSavePending}
                  onValueChange={(v) =>
                    setPricingModel((v as PricingModelValue) ?? "boq")
                  }
                >
                  <SelectTrigger
                    id="edit-pricing-model"
                    className="w-full min-w-0"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="boq">כתב כמויות</SelectItem>
                    <SelectItem value="paushal">פאושלי</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-retention-pct">אחוז עכבון (%)</Label>
                <Input
                  id="edit-retention-pct"
                  name="retentionPct"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0}
                  max={100}
                  value={retentionPct}
                  onChange={(e) => setRetentionPct(e.target.value)}
                  dir="ltr"
                  disabled={isSavePending}
                  className="w-full tabular-nums"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-insurance-pct">אחוז ביטוח (%)</Label>
                <Input
                  id="edit-insurance-pct"
                  name="insurancePct"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0}
                  value={insurancePct}
                  onChange={(e) => setInsurancePct(e.target.value)}
                  dir="ltr"
                  disabled={isSavePending}
                  className="w-full tabular-nums"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-testing-pct">אחוז בדיקות (%)</Label>
                <Input
                  id="edit-testing-pct"
                  name="testingPct"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0}
                  max={100}
                  value={testingPct}
                  onChange={(e) => setTestingPct(e.target.value)}
                  dir="ltr"
                  disabled={isSavePending}
                  className="w-full tabular-nums"
                />
              </div>
            </CardContent>
          </Card>

          <Card dir="rtl" className="border-border/70 shadow-sm">
            <CardHeader className="flex flex-col gap-4 border-b border-border/60 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-700 dark:text-violet-400">
                  <ListPlus className="size-5" aria-hidden />
                </div>
                <div className="space-y-1">
                  <CardTitle>
                    {pricingModel === "boq"
                      ? "כתב כמויות (BoQ) בסיס"
                      : "אבני דרך — פאושלי"}
                  </CardTitle>
                  <CardDescription>
                    {pricingModel === "boq"
                      ? "שורות מקור בלבד — שינויים כאן מחליפים את שורות ה-BoQ הבסיסיות; שאר סוגי השורות נשמרים."
                      : "במצב פאושלי מתעדכנות אבני הדרך לחשבונות חלקיים; סכום השורה = סכום החוזה × משקל ÷ 100."}
                  </CardDescription>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5 self-start"
                disabled={isSavePending}
                onClick={pricingModel === "boq" ? addRow : addPaushalRow}
              >
                <Plus className="size-4" aria-hidden />
                הוסף שורה
              </Button>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {pricingModel === "paushal" ? (
                <div className="space-y-2">
                  <Label htmlFor="edit-paushal-total">סכום חוזה כולל (₪)</Label>
                  <Input
                    id="edit-paushal-total"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min={0}
                    value={paushalTotalValue}
                    onChange={(e) => setPaushalTotalValue(e.target.value)}
                    onKeyDown={(e) => onBoqRowInputKeyDown(e, addPaushalRow)}
                    dir="ltr"
                    disabled={isSavePending}
                    className="max-w-xs tabular-nums"
                    placeholder="0"
                  />
                </div>
              ) : null}
              {pricingModel === "boq" ? (
                <>
                  <div
                    className="hidden rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_auto] md:gap-3"
                    dir="rtl"
                  >
                    <span className="text-start">סעיף</span>
                    <span className="text-start">תיאור</span>
                    <span className="text-start">יחידת מידה</span>
                    <span className="text-start">כמות</span>
                    <span className="text-start">מחיר יחידה</span>
                    <span className="text-center">פעולות</span>
                  </div>

                  <ul className="flex flex-col gap-4" dir="rtl">
                    {rows.map((row, index) => (
                      <li
                        key={row.id}
                        className="rounded-xl border border-border/60 bg-card/50 p-4 shadow-xs md:border-0 md:bg-transparent md:p-0 md:shadow-none"
                      >
                        <div className="mb-2 text-xs font-medium text-muted-foreground md:hidden">
                          סעיף {index + 1}
                        </div>
                        <div
                          className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_auto] md:items-end"
                          dir="rtl"
                        >
                          <div className="space-y-1.5">
                            <Label
                              className="md:sr-only"
                              htmlFor={`sec-${row.id}`}
                            >
                              סעיף
                            </Label>
                            <Input
                              id={`sec-${row.id}`}
                              value={row.sectionCode}
                              onChange={(e) =>
                                updateRow(row.id, {
                                  sectionCode: e.target.value,
                                })
                              }
                              onKeyDown={(e) => onBoqRowInputKeyDown(e, addRow)}
                              placeholder="01.08.01.0010"
                              dir="ltr"
                              disabled={isSavePending}
                              className="w-full font-mono text-sm"
                            />
                          </div>
                          <div className="space-y-1.5 md:col-span-1">
                            <Label
                              className="md:sr-only"
                              htmlFor={`desc-${row.id}`}
                            >
                              תיאור
                            </Label>
                            <Input
                              id={`desc-${row.id}`}
                              value={row.description}
                              onChange={(e) =>
                                updateRow(row.id, {
                                  description: e.target.value,
                                })
                              }
                              onKeyDown={(e) => onBoqRowInputKeyDown(e, addRow)}
                              placeholder="הארקות יסוד"
                              dir="rtl"
                              disabled={isSavePending}
                              className="w-full"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label
                              className="md:sr-only"
                              htmlFor={`unit-${row.id}`}
                            >
                              יחידת מידה
                            </Label>
                            <Input
                              id={`unit-${row.id}`}
                              value={row.unit}
                              onChange={(e) =>
                                updateRow(row.id, { unit: e.target.value })
                              }
                              onKeyDown={(e) => onBoqRowInputKeyDown(e, addRow)}
                              placeholder="קומ"
                              dir="rtl"
                              disabled={isSavePending}
                              className="w-full"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label
                              className="md:sr-only"
                              htmlFor={`qty-${row.id}`}
                            >
                              כמות
                            </Label>
                            <Input
                              id={`qty-${row.id}`}
                              type="number"
                              inputMode="decimal"
                              step="any"
                              value={row.quantity}
                              onChange={(e) =>
                                updateRow(row.id, { quantity: e.target.value })
                              }
                              onKeyDown={(e) => onBoqRowInputKeyDown(e, addRow)}
                              placeholder="0"
                              dir="ltr"
                              disabled={isSavePending}
                              className="w-full tabular-nums"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label
                              className="md:sr-only"
                              htmlFor={`price-${row.id}`}
                            >
                              מחיר יחידה
                            </Label>
                            <Input
                              id={`price-${row.id}`}
                              type="number"
                              inputMode="decimal"
                              step="any"
                              value={row.unitPrice}
                              onChange={(e) =>
                                updateRow(row.id, {
                                  unitPrice: e.target.value,
                                })
                              }
                              onKeyDown={(e) => onBoqRowInputKeyDown(e, addRow)}
                              placeholder="0"
                              dir="ltr"
                              disabled={isSavePending}
                              className="w-full tabular-nums"
                            />
                          </div>
                          <div className="flex items-center justify-center pb-0.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className={cn(
                                "text-destructive hover:bg-destructive/10 hover:text-destructive",
                                rows.length <= 1 &&
                                  "pointer-events-none opacity-30"
                              )}
                              disabled={isSavePending || rows.length <= 1}
                              onClick={() => removeRow(row.id)}
                              aria-label="מחק סעיף"
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </Button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="flex flex-col items-stretch justify-between gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-4 py-3 sm:flex-row sm:items-center">
                    <span className="text-sm font-medium text-foreground">
                      סכום כולל (מחושב מכתב הכמויות)
                    </span>
                    <span className="text-lg font-bold tabular-nums text-cyan-700 dark:text-cyan-400">
                      {currencyFormatter.format(boqTotal)}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div
                    className="hidden rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,0.85fr)_minmax(0,1fr)_auto] md:gap-3"
                    dir="rtl"
                  >
                    <span className="text-start">סעיף</span>
                    <span className="text-start">תיאור אבן דרך</span>
                    <span className="text-start">% ביצוע (משקל)</span>
                    <span className="text-start">סכום (₪)</span>
                    <span className="text-center">פעולות</span>
                  </div>
                  <ul className="flex flex-col gap-4" dir="rtl">
                    {paushalRows.map((row, index) => {
                      const w = parseNum(row.weightPct)
                      const lineAmt =
                        Number.isFinite(paushalTotalNum) && paushalTotalNum > 0
                          ? paushalLineAmount(paushalTotalNum, w)
                          : 0
                      return (
                        <li
                          key={row.id}
                          className="rounded-xl border border-border/60 bg-card/50 p-4 shadow-xs md:border-0 md:bg-transparent md:p-0 md:shadow-none"
                        >
                          <div className="mb-2 text-xs font-medium text-muted-foreground md:hidden">
                            אבן דרך {index + 1}
                          </div>
                          <div
                            className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,0.85fr)_minmax(0,1fr)_auto] md:items-end"
                            dir="rtl"
                          >
                            <div className="space-y-1.5">
                              <Label
                                className="md:sr-only"
                                htmlFor={`psec-${row.id}`}
                              >
                                סעיף
                              </Label>
                              <Input
                                id={`psec-${row.id}`}
                                value={row.sectionCode}
                                onChange={(e) =>
                                  updatePaushalRow(row.id, {
                                    sectionCode: e.target.value,
                                  })
                                }
                                onKeyDown={(e) =>
                                  onBoqRowInputKeyDown(e, addPaushalRow)
                                }
                                placeholder="08.01"
                                dir="ltr"
                                disabled={isSavePending}
                                className="w-full font-mono text-sm"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label
                                className="md:sr-only"
                                htmlFor={`pdesc-${row.id}`}
                              >
                                תיאור
                              </Label>
                              <Input
                                id={`pdesc-${row.id}`}
                                value={row.description}
                                onChange={(e) =>
                                  updatePaushalRow(row.id, {
                                    description: e.target.value,
                                  })
                                }
                                onKeyDown={(e) =>
                                  onBoqRowInputKeyDown(e, addPaushalRow)
                                }
                                placeholder="עבודות חשמל"
                                dir="rtl"
                                disabled={isSavePending}
                                className="w-full"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label
                                className="md:sr-only"
                                htmlFor={`pw-${row.id}`}
                              >
                                % משקל
                              </Label>
                              <Input
                                id={`pw-${row.id}`}
                                type="number"
                                inputMode="decimal"
                                step="any"
                                min={0}
                                max={100}
                                value={row.weightPct}
                                onChange={(e) =>
                                  updatePaushalRow(row.id, {
                                    weightPct: e.target.value,
                                  })
                                }
                                onKeyDown={(e) =>
                                  onBoqRowInputKeyDown(e, addPaushalRow)
                                }
                                placeholder="0"
                                dir="ltr"
                                disabled={isSavePending}
                                className="w-full tabular-nums"
                              />
                            </div>
                            <div className="flex min-h-9 items-center rounded-md border border-border/50 bg-muted/40 px-3 tabular-nums text-sm">
                              {currencyFormatter.format(lineAmt)}
                            </div>
                            <div className="flex items-center justify-center pb-0.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className={cn(
                                  "text-destructive hover:bg-destructive/10 hover:text-destructive",
                                  paushalRows.length <= 1 &&
                                    "pointer-events-none opacity-30"
                                )}
                                disabled={
                                  isSavePending || paushalRows.length <= 1
                                }
                                onClick={() => removePaushalRow(row.id)}
                                aria-label="מחק שורה"
                              >
                                <Trash2 className="size-4" aria-hidden />
                              </Button>
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                  <div className="space-y-2 rounded-xl border border-amber-500/35 bg-amber-500/5 px-4 py-3">
                    <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                      <span className="text-sm font-medium text-foreground">
                        סה״כ אחוזי משקל (שורות מלאות)
                      </span>
                      <span
                        className={cn(
                          "text-lg font-bold tabular-nums",
                          paushalWeightsOk
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-amber-800 dark:text-amber-300"
                        )}
                      >
                        {paushalWeightSum}%
                      </span>
                    </div>
                    {validPaushal.length > 0 && !paushalWeightsOk ? (
                      <p className="text-sm font-medium text-destructive">
                        סכום המשקלים חייב להיות בדיוק 100% כדי לשמור חוזה פאושלי.
                      </p>
                    ) : null}
                    <div className="flex flex-col justify-between gap-2 border-t border-border/40 pt-2 sm:flex-row sm:items-center">
                      <span className="text-sm text-muted-foreground">
                        סכום חוזה כולל
                      </span>
                      <span className="text-base font-semibold tabular-nums text-foreground">
                        {currencyFormatter.format(
                          Number.isFinite(paushalTotalNum)
                            ? paushalTotalNum
                            : 0
                        )}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
            <CardFooter className="flex flex-col gap-3 border-t border-border/60 pt-6 sm:flex-row sm:justify-end">
              <Button
                type="submit"
                size="lg"
                disabled={isSavePending}
                className="w-full gap-2 bg-cyan-600 text-white hover:bg-cyan-500 sm:w-auto"
              >
                {isSavePending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Save className="size-4" aria-hidden />
                )}
                {isSavePending ? "שומרים…" : "שמור שינויים"}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </div>
    </DualPaneLayout>
  )
}
