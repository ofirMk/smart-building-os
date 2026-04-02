"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import {
  ArrowRight,
  BookOpen,
  Calculator,
  FileSignature,
  ListPlus,
  Loader2,
  Plus,
  Save,
  ScanLine,
  Tags,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

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
import {
  encodeBoqMilestoneStoredName,
  encodeMilestoneDisplayName,
} from "@/lib/marker-ofek/milestone-name-codec"
import { scanContractBoqPdf } from "@/app/(dashboard)/marker-ofek/contracts/actions/contract-actions"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { cn, formatError } from "@/lib/utils"
import type { BaselineBillLineItemAI } from "@/types/marker-ofek"

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

/** שורות BoQ תקפות להכנסה ל-DB (סעיף + תיאור חובה בטבלה) */
function getValidBoqRowsForDb(rows: BoqRow[]) {
  return rows.filter(
    (r) => r.sectionCode.trim().length > 0 && r.description.trim().length > 0
  )
}

function getValidPaushalRowsForDb(rows: PaushalRow[]) {
  return rows.filter(
    (r) => r.sectionCode.trim().length > 0 && r.description.trim().length > 0
  )
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

/** מיפוי שורות AI (section_number, description, …) לטופס BoQ */
function mapAiItemsToBoqRows(items: BaselineBillLineItemAI[]): BoqRow[] {
  if (!items.length) return [createEmptyBoqRow()]
  return items.map((it) => ({
    id: crypto.randomUUID(),
    sectionCode: String(it.section_number ?? "").trim(),
    description: String(it.description ?? "").trim(),
    unit: String(it.unit ?? "").trim(),
    quantity: Number.isFinite(it.contract_quantity)
      ? String(it.contract_quantity)
      : "",
    unitPrice: Number.isFinite(it.unit_price) ? String(it.unit_price) : "",
  }))
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

export default function NewMarkerOfekContractPage() {
  const router = useRouter()
  const boqCardRef = React.useRef<HTMLDivElement | null>(null)
  const aiPdfInputRef = React.useRef<HTMLInputElement | null>(null)
  const [projectName, setProjectName] = React.useState("")
  const [entityName, setEntityName] = React.useState("")
  const [contractNumber, setContractNumber] = React.useState("")
  const [contractDisplayName, setContractDisplayName] = React.useState("")
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
  const [isAiScanPending, startAiScanTransition] = React.useTransition()
  const [aiDataLoaded, setAiDataLoaded] = React.useState(false)
  const [submitAttempted, setSubmitAttempted] = React.useState(false)
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

  function handleContractBoqPdfSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

    setAiDataLoaded(false)
    startAiScanTransition(async () => {
      const fd = new FormData()
      fd.set("contract_boq_pdf", file)
      const res = await scanContractBoqPdf(fd)
      if (!res.ok) {
        toast.error(res.error)
        return
      }

      setPricingModel("boq")
      const mapped = mapAiItemsToBoqRows(res.data.items ?? [])
      setRows(mapped)

      const rPct = res.data.retention_percent
      if (Number.isFinite(rPct) && rPct >= 0 && rPct <= 100) {
        setRetentionPct(String(rPct))
      }

      setAiDataLoaded(true)
      toast.success("נתוני כתב כמויות נטענו מהמסמך")

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          boqCardRef.current?.scrollIntoView({
            behavior: "auto",
            block: "start",
          })
        })
      })
    })
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const pName = projectName.trim()
    const eName = entityName.trim()
    if (!pName || !eName) {
      setSubmitAttempted(true)
      toast.error("יש למלא שם פרויקט ושם ישות לפני השמירה")
      return
    }
    setSubmitAttempted(false)

    startSaveTransition(async () => {
    const supabase = createSupabaseBrowserClient()

    try {
      const { data: existingEntity, error: entitySelectError } = await supabase
        .from("entities")
        .select("id")
        .eq("name", eName)
        .eq("is_deleted", false)
        .maybeSingle()

      if (entitySelectError) throw entitySelectError

      let entityId: string
      if (existingEntity?.id) {
        entityId = existingEntity.id
      } else {
        const { data: newEntity, error: entityInsertError } = await supabase
          .from("entities")
          .insert({
            name: eName,
            type: "subcontractor",
            contact_info: {},
            legal_id: entityLegalId.trim() || null,
            address: entityAddress.trim() || null,
            deductions_file_number: entityDeductionsFile.trim() || null,
          })
          .select("id")
          .single()

        if (entityInsertError) throw entityInsertError
        if (!newEntity?.id) throw new Error("לא התקבל מזהה ישות לאחר יצירה")
        entityId = newEntity.id
      }

      const { data: existingProject, error: projectSelectError } = await supabase
        .from("projects")
        .select("id")
        .eq("name", pName)
        .eq("is_deleted", false)
        .maybeSingle()

      if (projectSelectError) throw projectSelectError

      let projectId: string
      if (existingProject?.id) {
        projectId = existingProject.id
      } else {
        const { data: newProject, error: projectInsertError } = await supabase
          .from("projects")
          .insert({
            name: pName,
            internal_project_code: "",
            status: "planning",
          })
          .select("id")
          .single()

        if (projectInsertError) throw projectInsertError
        if (!newProject?.id) throw new Error("לא התקבל מזהה פרויקט לאחר יצירה")
        projectId = newProject.id
      }

      const retention = parseNum(retentionPct)
      const insurance = parseNum(insurancePct)
      const testing = parseNum(testingPct)

      if (pricingModel === "paushal") {
        const totalVal = parseNum(paushalTotalValue)
        if (!Number.isFinite(totalVal) || totalVal <= 0) {
          toast.error("נא להזין סכום חוזה כולל חיובי (פאושלי)")
          return
        }
        const validMs = getValidPaushalRowsForDb(paushalRows)
        if (validMs.length === 0) {
          toast.error("נא למלא לפחות שורת אבן דרך עם סעיף ותיאור")
          return
        }
        const wSum = sumPaushalWeights(validMs)
        if (Math.abs(wSum - 100) > 0.05) {
          toast.error(
            `סכום אחוזי משקל חייב להיות 100% (כרגע ${wSum}%)`
          )
          return
        }
      }

      const agreementLabel =
        pricingModel === "paushal" ? "פאושלי" : "כתב כמויות"
      const totalForContract =
        pricingModel === "boq" ? boqTotal : parseNum(paushalTotalValue)

      const { data: newContract, error: contractInsertError } = await supabase
        .from("contracts")
        .insert({
          project_id: projectId,
          entity_id: entityId,
          contract_type: contractType,
          agreement_type: agreementLabel,
          retention_pct: retention,
          insurance_pct: insurance,
          testing_pct: testing,
          pricing_model: pricingModel,
          total_amount: totalForContract,
          status: "draft",
          contract_number: contractNumber.trim() || null,
          name: contractDisplayName.trim() || null,
        })
        .select("id")
        .single()

      if (contractInsertError) throw contractInsertError
      if (!newContract?.id) throw new Error("לא התקבל מזהה חוזה לאחר שמירה")
      const contractId = newContract.id

      if (pricingModel === "boq") {
        const boqForDb = getValidBoqRowsForDb(rows)
        const boqTotal = roundMoney(computeBoqTotal(rows))
        if (boqForDb.length > 0) {
          const milestonePayload = boqForDb.map((r, i) => {
            const amount = roundMoney(parseNum(r.quantity) * parseNum(r.unitPrice))
            const wp =
              boqTotal > 0 ? roundMoney((amount / boqTotal) * 100) : 0
            return {
              contract_id: contractId,
              name: encodeBoqMilestoneStoredName(
                r.sectionCode,
                r.description,
                r.quantity,
                r.unitPrice
              ),
              amount,
              sort_order: i,
              weight_percentage: wp,
            }
          })

          const { error: linesError } = await supabase
            .from("contract_milestones")
            .insert(milestonePayload)

          if (linesError) {
            await supabase.from("contracts").delete().eq("id", contractId)
            throw linesError
          }
        }
      } else {
        const totalVal = parseNum(paushalTotalValue)
        const validMs = getValidPaushalRowsForDb(paushalRows)
        const milestonePayload = validMs.map((m, i) => {
          const w = parseNum(m.weightPct)
          return {
            contract_id: contractId,
            name: encodeMilestoneDisplayName(m.sectionCode, m.description),
            amount: paushalLineAmount(totalVal, w),
            sort_order: i,
            weight_percentage: roundMoney(w),
          }
        })

        const { error: msError } = await supabase
          .from("contract_milestones")
          .insert(milestonePayload)

        if (msError) {
          await supabase.from("contracts").delete().eq("id", contractId)
          throw msError
        }
      }

      toast.success("החוזה נשמר בהצלחה")
      router.push("/marker-ofek/contracts")
      router.refresh()
    } catch (err) {
      toast.error(`שמירת החוזה נכשלה: ${formatError(err)}`)
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
          <li>כמות ומחיר יחידה לחישוב סה״כ אוטומטי.</li>
          <li>מקש Enter בשדה בשורת BoQ מוסיף שורה חדשה (לא שולח את הטופס).</li>
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
      <p className="text-xs text-muted-foreground">
        מצב חצוי שומר על הטופס פעיל בזמן עיון בעזרים — ללא רענון הדף.
      </p>
    </div>
  )

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
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
          יצירת חוזה חדש
        </h1>
        <p className="text-sm text-muted-foreground">
          מרקר אופק — הזנת פרטי חוזה, תנאים מסחריים וכתב כמויות (BoQ).
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
                  פרויקט, ישות חוזית (מזמין / קבלן משנה) וסוג החוזה.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5 pt-6 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="project-name">שם פרויקט</Label>
              <Input
                id="project-name"
                name="projectName"
                value={projectName}
                onChange={(e) => {
                  setProjectName(e.target.value)
                  if (submitAttempted) setSubmitAttempted(false)
                }}
                placeholder='לדוגמה: הירדן 89 רמת גן'
                dir="rtl"
                disabled={isSavePending}
                aria-invalid={submitAttempted && !projectName.trim()}
                className={cn(
                  "w-full",
                  submitAttempted &&
                    !projectName.trim() &&
                    "border-destructive ring-2 ring-destructive/25"
                )}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="entity-name">שם ישות (מזמין / קבלן משנה)</Label>
              <Input
                id="entity-name"
                name="entityName"
                value={entityName}
                onChange={(e) => {
                  setEntityName(e.target.value)
                  if (submitAttempted) setSubmitAttempted(false)
                }}
                placeholder='לדוגמה: חיים מיכאלוביץ ניהול ביצוע ויזמות בע"מ'
                dir="rtl"
                disabled={isSavePending}
                aria-invalid={submitAttempted && !entityName.trim()}
                className={cn(
                  "w-full",
                  submitAttempted &&
                    !entityName.trim() &&
                    "border-destructive ring-2 ring-destructive/25"
                )}
              />
              <p className="text-xs text-muted-foreground">
                השדות הבאים נשמרים בבסיס הנתונים רק כשיוצרים ישות חדשה (שם שלא
                קיים במערכת).
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="entity-legal-id">ח.פ / ע.מ (לישות חדשה)</Label>
              <Input
                id="entity-legal-id"
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
              <Label htmlFor="entity-address">כתובת (לישות חדשה)</Label>
              <Input
                id="entity-address"
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
              <Label htmlFor="entity-deductions">
                תיק ניכויים (לישות חדשה)
              </Label>
              <Input
                id="entity-deductions"
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
              <Label htmlFor="contract-type">סוג חוזה</Label>
              <Select
                value={contractType}
                disabled={isSavePending}
                onValueChange={(v) =>
                  setContractType((v as ContractTypeValue) ?? "main_contract")
                }
              >
                <SelectTrigger id="contract-type" className="w-full min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="main_contract">חוזה מזמין</SelectItem>
                  <SelectItem value="sub_contract">חוזה קבלן משנה</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="contract-number">מספר חוזה (לתצוגה, אופציונלי)</Label>
              <Input
                id="contract-number"
                name="contractNumber"
                value={contractNumber}
                onChange={(e) => setContractNumber(e.target.value)}
                placeholder="לדוגמה: 08.01"
                dir="ltr"
                disabled={isSavePending}
                className="w-full font-mono"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="contract-display-name">שם תצוגה לחוזה (אופציונלי)</Label>
              <Input
                id="contract-display-name"
                name="contractDisplayName"
                value={contractDisplayName}
                onChange={(e) => setContractDisplayName(e.target.value)}
                placeholder="לדוגמה: עבודות חשמל"
                dir="rtl"
                disabled={isSavePending}
                className="w-full"
              />
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
              <Label htmlFor="pricing-model">סוג הסכם (תמחיר)</Label>
              <Select
                value={pricingModel}
                disabled={isSavePending}
                onValueChange={(v) =>
                  setPricingModel((v as PricingModelValue) ?? "boq")
                }
              >
                <SelectTrigger id="pricing-model" className="w-full min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="boq">כתב כמויות</SelectItem>
                  <SelectItem value="paushal">פאושלי</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="retention-pct">אחוז עכבון (%)</Label>
              <Input
                id="retention-pct"
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
              <Label htmlFor="insurance-pct">אחוז ביטוח (%)</Label>
              <Input
                id="insurance-pct"
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
              <Label htmlFor="testing-pct">אחוז בדיקות (%)</Label>
              <Input
                id="testing-pct"
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

        <Card ref={boqCardRef} dir="rtl" className="border-border/70 shadow-sm">
          <CardHeader className="flex flex-col gap-4 border-b border-border/60 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-700 dark:text-violet-400">
                <ListPlus className="size-5" aria-hidden />
              </div>
              <div className="space-y-1">
                <CardTitle>
                  {pricingModel === "boq"
                    ? "כתב כמויות (BoQ)"
                    : "אבני דרך — פאושלי"}
                </CardTitle>
                <CardDescription>
                  {pricingModel === "boq"
                    ? "הוסיפו סעיפים, כמויות ומחירי יחידה — הסכום הכולל מחושב אוטומטית."
                    : "הזינו סכום חוזה כולל ואחוז משקל לכל אבן דרך; סכום השורה מחושב אוטומטית. סה״כ משקלים חייב להיות 100%."}
                </CardDescription>
              </div>
            </div>
            <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
              {pricingModel === "boq" ? (
                <>
                  <input
                    ref={aiPdfInputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    className="sr-only"
                    aria-hidden
                    tabIndex={-1}
                    onChange={handleContractBoqPdfSelected}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="shrink-0 gap-1.5 border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/15"
                    disabled={isSavePending || isAiScanPending}
                    onClick={() => aiPdfInputRef.current?.click()}
                  >
                    {isAiScanPending ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <ScanLine className="size-4" aria-hidden />
                    )}
                    סריקת PDF (AI)
                  </Button>
                </>
              ) : null}
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
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            {pricingModel === "boq" && aiDataLoaded ? (
              <div
                role="status"
                className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-900 dark:text-emerald-100"
              >
                נתונים נטענו — ניתן לערוך את השורות לפני השמירה.
              </div>
            ) : null}
            {pricingModel === "paushal" ? (
              <div className="space-y-2">
                <Label htmlFor="paushal-total">סכום חוזה כולל (₪)</Label>
                <Input
                  id="paushal-total"
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
            {/*
              dir=rtl: עמודת DOM ראשונה (סעיף) מימין, אחרונה (פעולות) משמאל.
              מחיר/כמות ב-dir=ltr בתוך התא כדי שלא יתהפכו ספרות.
            */}
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
                      <Label className="md:sr-only" htmlFor={`sec-${row.id}`}>
                        סעיף
                      </Label>
                      <Input
                        id={`sec-${row.id}`}
                        value={row.sectionCode}
                        onChange={(e) =>
                          updateRow(row.id, { sectionCode: e.target.value })
                        }
                        onKeyDown={(e) => onBoqRowInputKeyDown(e, addRow)}
                        placeholder="01.08.01.0010"
                        dir="ltr"
                        disabled={isSavePending}
                        className="w-full font-mono text-sm"
                      />
                    </div>
                    <div className="space-y-1.5 md:col-span-1">
                      <Label className="md:sr-only" htmlFor={`desc-${row.id}`}>
                        תיאור
                      </Label>
                      <Input
                        id={`desc-${row.id}`}
                        value={row.description}
                        onChange={(e) =>
                          updateRow(row.id, { description: e.target.value })
                        }
                        onKeyDown={(e) => onBoqRowInputKeyDown(e, addRow)}
                        placeholder="הארקות יסוד"
                        dir="rtl"
                        disabled={isSavePending}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="md:sr-only" htmlFor={`unit-${row.id}`}>
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
                      <Label className="md:sr-only" htmlFor={`qty-${row.id}`}>
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
                      <Label className="md:sr-only" htmlFor={`price-${row.id}`}>
                        מחיר יחידה
                      </Label>
                      <Input
                        id={`price-${row.id}`}
                        type="number"
                        inputMode="decimal"
                        step="any"
                        value={row.unitPrice}
                        onChange={(e) =>
                          updateRow(row.id, { unitPrice: e.target.value })
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
                          rows.length <= 1 && "pointer-events-none opacity-30"
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
                      סכום חוזה כולל (מהשדה למעלה)
                    </span>
                    <span className="text-base font-semibold tabular-nums text-foreground">
                      {currencyFormatter.format(
                        Number.isFinite(paushalTotalNum) ? paushalTotalNum : 0
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
              {isSavePending ? "שומרים…" : "שמירת חוזה"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
    </DualPaneLayout>
  )
}
