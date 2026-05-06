"use client"

/**
 * Phase B — Engineering BOM → DRAFT PO (Manual Trigger UI)
 *
 * עמוד טופס דטרמיניסטי (ללא AI) לאימות שכבת הפיצוץ ההנדסי.
 * המשתמש בוחר פרויקט / מיקום / Assembly / כמות, ומפעיל את ה-RPC
 * `erp_generate_draft_po_from_bom` (דרך `POST /api/procurement/autonomous-po`).
 *
 * זרימה:
 *   1) GET `/api/procurement/autonomous-po`  → projects + assemblies + locations
 *   2) משתמש מזין פרמטרים → POST.
 *   3) 201 → toast ירוק + ניווט אל `/marker-ofek/procurement/orders/{id}`.
 *   4) 409 (engineering_block) → toast אדום עם פירוט החריגות.
 *   5) 4xx/500 אחר → toast אדום.
 *
 * ב-Phase C/D, אותו UI יקבל בנוסף תיבת prompt חופשי שתפעיל את LLM
 * Intent Parser, ש-בתורו יקרא לאותו RPC כ-tool. כלומר זה ה-baseline
 * דטרמיניסטי שעליו ה-AI ייבנה.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Cog,
  Layers,
  Loader2,
  MapPin,
  Wrench,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
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
import { Separator } from "@/components/ui/separator"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { readActiveCompanyIdFromCookie } from "@/lib/company-context"

// ============================================================================
// Types — מתאימים ל-DTO המוחזר מ-`GET /api/procurement/autonomous-po`
// ============================================================================

type ProjectOption = {
  id: string
  projectNumber: string
  name: string
  status: string
}

type AssemblyOption = {
  id: string
  code: string
  name: string
  category: string
  unitOfMeasure: string
}

type LocationOption = {
  id: string
  projectId: string
  code: string
  name: string
  levelType: string
  lengthM: number | null
  areaSqm: number | null
}

type OptionsDto = {
  projects: ProjectOption[]
  assemblies: AssemblyOption[]
  locations: LocationOption[]
}

type ViolationDto = {
  rule_code: string
  rule_name?: string
  rule_type: string
  violation_action: "WARN" | "BLOCK" | "ESCALATE"
  actual_value: number
  expected_value: number
  delta_pct: number
  tolerance_pct: number
  message: string
}

type GenerateSuccessDto = {
  purchaseOrderId: string
  poNumber: string
  status: string
  totalAmountNet: number
  violations: ViolationDto[]
  bomRequestId: string
  linesCount: number
}

type GenerateErrorBlocked = {
  error: "engineering_block"
  message: string
  violations: ViolationDto[]
  hint: string | null
}

const NONE_VALUE = "__none__"

const VIOLATION_ACTION_LABELS: Record<ViolationDto["violation_action"], string> = {
  WARN: "אזהרה",
  BLOCK: "חוסם",
  ESCALATE: "מצריך אישור",
}

const VIOLATION_ACTION_VARIANT: Record<
  ViolationDto["violation_action"],
  "default" | "secondary" | "destructive"
> = {
  WARN: "secondary",
  BLOCK: "destructive",
  ESCALATE: "default",
}

// ============================================================================
// Page
// ============================================================================

export default function AutonomousPoNewPage() {
  const router = useRouter()
  const [activeCompanyId, setActiveCompanyId] = React.useState<string | null>(null)
  const [options, setOptions] = React.useState<OptionsDto | null>(null)
  const [loadingOptions, setLoadingOptions] = React.useState(true)
  const [submitting, setSubmitting] = React.useState(false)

  const [projectId, setProjectId] = React.useState<string>("")
  const [locationId, setLocationId] = React.useState<string>(NONE_VALUE)
  const [assemblyId, setAssemblyId] = React.useState<string>("")
  const [requestedQty, setRequestedQty] = React.useState<string>("100")

  // Phase A — קריאה אחידה של החברה הפעילה מהקוקי (לתצוגה בלבד)
  React.useEffect(() => {
    setActiveCompanyId(readActiveCompanyIdFromCookie())
  }, [])

  // טען את 3 הקולקציות בקריאה אחת
  React.useEffect(() => {
    let cancelled = false
    setLoadingOptions(true)
    masterDataFetch<OptionsDto>("/api/procurement/autonomous-po")
      .then((data) => {
        if (cancelled) return
        setOptions(data)
        // אם יש ערכי seed יחידים, נבחר אותם אוטומטית — UX חלק.
        if (data.projects.length === 1) setProjectId(data.projects[0].id)
        if (data.assemblies.length === 1) setAssemblyId(data.assemblies[0].id)
      })
      .catch((err: Error) => {
        toast.error(`טעינת אפשרויות נכשלה: ${err.message}`)
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // מסנן locations לפי הפרויקט הנבחר
  const filteredLocations = React.useMemo<LocationOption[]>(() => {
    if (!options || !projectId) return []
    return options.locations.filter((l) => l.projectId === projectId)
  }, [options, projectId])

  // אם המיקום הנבחר לא שייך לפרויקט החדש → איפוס
  React.useEffect(() => {
    if (locationId === NONE_VALUE) return
    if (!filteredLocations.some((l) => l.id === locationId)) {
      setLocationId(NONE_VALUE)
    }
  }, [filteredLocations, locationId])

  const selectedAssembly = React.useMemo(
    () => options?.assemblies.find((a) => a.id === assemblyId) ?? null,
    [options, assemblyId]
  )

  const canSubmit =
    !!projectId &&
    !!assemblyId &&
    !!requestedQty &&
    Number(requestedQty) > 0 &&
    !submitting

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    try {
      const payload = {
        projectId,
        assemblyId,
        requestedQty: Number(requestedQty),
        locationId: locationId === NONE_VALUE ? null : locationId,
      }
      const activeCompanyHeader = readActiveCompanyIdFromCookie()
      const res = await fetch("/api/procurement/autonomous-po", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "content-type": "application/json",
          ...(activeCompanyHeader
            ? {
                "x-company-id": activeCompanyHeader,
                "x-active-company-id": activeCompanyHeader,
              }
            : {}),
        },
        body: JSON.stringify(payload),
      })

      if (res.status === 201) {
        const json = (await res.json()) as { data: GenerateSuccessDto }
        const data = json.data
        const escalateCount = data.violations.filter(
          (v) => v.violation_action === "ESCALATE"
        ).length
        const warnCount = data.violations.filter(
          (v) => v.violation_action === "WARN"
        ).length

        toast.success(
          `נוצרה הזמנה ${data.poNumber} בסטטוס ${data.status} (${data.linesCount} שורות, נטו ${data.totalAmountNet.toLocaleString(
            "he-IL"
          )} ₪)` +
            (escalateCount + warnCount > 0
              ? ` — ${escalateCount} אישורים נדרשים, ${warnCount} אזהרות`
              : "")
        )
        router.push(`/marker-ofek/procurement/orders/${data.purchaseOrderId}`)
        return
      }

      if (res.status === 409) {
        const json = (await res.json()) as GenerateErrorBlocked
        const lines = (json.violations ?? [])
          .map(
            (v) => `• ${v.rule_code} (${v.rule_type}): ${v.message ?? "חריגה"}`
          )
          .join("\n")
        toast.error(`חריגה הנדסית חוסמת — ${lines || json.message}`, {
          duration: 12000,
        })
        return
      }

      const json = (await res.json().catch(() => null)) as { error?: string } | null
      toast.error(json?.error ?? `שגיאה ${res.status}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה לא צפויה")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="container mx-auto max-w-3xl py-8">
      <div className="mb-6 flex items-start gap-3">
        <div className="rounded-xl bg-gradient-to-br from-amber-500/15 to-orange-500/15 p-3 text-amber-600 dark:text-amber-400">
          <Cog className="h-7 w-7" />
        </div>
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            הנדסת רכש (בטא)
            <Badge variant="secondary" className="text-xs">
              Phase B
            </Badge>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            פיצוץ עץ מוצר → ולידציה הנדסית → DRAFT PO.{" "}
            <span className="font-medium">דטרמיניסטי, ללא AI.</span> כל החישובים
            רצים ב-RPC <code className="text-xs">erp_generate_draft_po_from_bom</code>.
          </p>
        </div>
      </div>

      {activeCompanyId ? (
        <p className="mb-4 text-xs text-muted-foreground">
          חברה פעילה: <code>{activeCompanyId}</code>
        </p>
      ) : null}

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" /> פרמטרי הפעלה
            </CardTitle>
            <CardDescription>
              בחרי פרויקט, מיקום, Assembly וכמות בסיס. המערכת תפצוץ את עץ המוצר,
              תפעיל את חוקי התקן ההנדסיים, ותיצור הזמנת רכש בסטטוס המתאים
              (DRAFT אם אין חריגות, PENDING_APPROVAL אם נדרש אישור).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {loadingOptions ? (
              <div className="flex items-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                טוען אפשרויות...
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="project" className="font-medium">
                    פרויקט <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={projectId}
                    onValueChange={(v) => setProjectId(v ?? "")}
                  >
                    <SelectTrigger id="project">
                      <SelectValue placeholder="בחרי פרויקט..." />
                    </SelectTrigger>
                    <SelectContent>
                      {options?.projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="font-mono text-xs text-muted-foreground">
                            {p.projectNumber}
                          </span>{" "}
                          — {p.name}{" "}
                          <span className="text-xs text-muted-foreground">
                            ({p.status})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location" className="flex items-center gap-1.5 font-medium">
                    <MapPin className="h-3.5 w-3.5" />
                    מיקום (אופציונלי, נדרש לחוקי PER_LENGTH/PER_AREA)
                  </Label>
                  <Select
                    value={locationId}
                    onValueChange={(v) => setLocationId(v ?? NONE_VALUE)}
                    disabled={!projectId}
                  >
                    <SelectTrigger id="location">
                      <SelectValue placeholder="בחרי מיקום..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>— ללא מיקום ספציפי —</SelectItem>
                      {filteredLocations.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          <span className="font-mono text-xs text-muted-foreground">
                            {l.code}
                          </span>{" "}
                          — {l.name}
                          {l.lengthM !== null ? (
                            <span className="ms-2 text-xs text-muted-foreground">
                              ({l.lengthM} מ׳
                              {l.areaSqm !== null ? `, ${l.areaSqm} מ"ר` : ""})
                            </span>
                          ) : null}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {projectId && filteredLocations.length === 0 ? (
                    <p className="text-xs text-amber-600">
                      אין מיקומים מוגדרים בפרויקט זה.
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="assembly" className="flex items-center gap-1.5 font-medium">
                    <Layers className="h-3.5 w-3.5" />
                    Assembly (עץ מוצר) <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={assemblyId}
                    onValueChange={(v) => setAssemblyId(v ?? "")}
                  >
                    <SelectTrigger id="assembly">
                      <SelectValue placeholder="בחרי קיט..." />
                    </SelectTrigger>
                    <SelectContent>
                      {options?.assemblies.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          <span className="font-mono text-xs text-muted-foreground">
                            {a.code}
                          </span>{" "}
                          — {a.name}{" "}
                          <span className="text-xs text-muted-foreground">
                            ({a.unitOfMeasure})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="qty" className="font-medium">
                    כמות בסיס{" "}
                    {selectedAssembly ? (
                      <span className="font-normal text-muted-foreground">
                        (ביחידות {selectedAssembly.unitOfMeasure})
                      </span>
                    ) : null}{" "}
                    <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="qty"
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={requestedQty}
                    onChange={(e) => setRequestedQty(e.target.value)}
                    placeholder="100"
                  />
                  {selectedAssembly ? (
                    <p className="text-xs text-muted-foreground">
                      כל יחידת בסיס תפוצץ לרכיבים לפי ההגדרות ב-
                      <code>erp_md_assembly_lines</code>; כמויות יעוגלו לפי UoM
                      (CEIL ל-UNIT/KG, ROUND ל-METER/SQM).
                    </p>
                  ) : null}
                </div>

                <Separator />

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
                  <p className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="h-4 w-4" />
                    Phase B — ללא AI
                  </p>
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                    מנוע ה-LLM ושכבת ה-Intent Parser ייכנסו ב-Phase C. כאן
                    מאמתים שהמתמטיקה והוולידציה ההנדסית עובדות 100% דטרמיניסטית.
                    BLOCK violation יחזיר 409 ולא ייווצר PO.
                  </p>
                </div>
              </>
            )}
          </CardContent>
          <CardFooter className="justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.back()}
              disabled={submitting}
            >
              ביטול
            </Button>
            <Button type="submit" disabled={!canSubmit || loadingOptions} size="lg">
              {submitting ? (
                <>
                  <Loader2 className="me-2 h-4 w-4 animate-spin" /> מחולל...
                </>
              ) : (
                <>
                  <CheckCircle2 className="me-2 h-4 w-4" /> חולל הזמנה הנדסית
                  <ArrowRight className="ms-2 h-4 w-4" />
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  )
}
