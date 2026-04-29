"use client"

import Link from "next/link"
import * as React from "react"
import Papa from "papaparse"
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileUp,
  Loader2,
  PlayCircle,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { cn, formatError } from "@/lib/utils"

// ────────────────────────────────────────────────────────────────────────────
// CSV format spec
// ────────────────────────────────────────────────────────────────────────────

const REQUIRED_COLUMNS = ["sku", "description", "family_code", "uom"] as const
const OPTIONAL_COLUMNS = [
  "foreign_description",
  "item_type",
  "factory_uom",
  "conversion_factor",
  "supplier_number",
  "supplier_name",
  "default_price",
  "is_inventory_managed",
  "status",
] as const

type RowError = { col: string; msg: string }

type ParsedRow = {
  rowIndex: number // 1-based, includes header
  raw: Record<string, string>
  // Normalized fields ready for API
  sku: string
  description: string
  foreignDescription?: string
  familyCode: string
  itemType?: string
  unitOfMeasure: string
  factoryUom?: string
  conversionFactor?: string
  supplierNumber?: string
  supplierName?: string
  defaultPrice?: string
  isInventoryManaged?: boolean
  status?: string
  // Validation
  errors: RowError[]
}

const DECIMAL_4_RE = /^\d+(\.\d{1,4})?$/

function validateRow(raw: Record<string, string>, rowIndex: number): ParsedRow {
  const errors: RowError[] = []

  function getStr(col: string): string {
    return (raw[col] ?? "").trim()
  }

  // Required
  const sku = getStr("sku")
  if (!sku) errors.push({ col: "sku", msg: "חובה" })
  if (sku.length > 22) errors.push({ col: "sku", msg: "מקסימום 22 תווים" })
  const description = getStr("description")
  if (!description) errors.push({ col: "description", msg: "חובה" })
  const familyCode = getStr("family_code")
  if (!familyCode) errors.push({ col: "family_code", msg: "חובה" })
  const unitOfMeasure = getStr("uom")
  if (!unitOfMeasure) errors.push({ col: "uom", msg: "חובה" })

  // Optional
  const foreignDescription = getStr("foreign_description") || undefined
  const itemTypeRaw = getStr("item_type").toUpperCase()
  if (itemTypeRaw && !["R", "P", "S", "K"].includes(itemTypeRaw)) {
    errors.push({ col: "item_type", msg: "חייב להיות R/P/S/K" })
  }
  const factoryUom = getStr("factory_uom") || undefined

  const cfStr = getStr("conversion_factor").replace(",", ".")
  let conversionFactor: string | undefined
  if (cfStr) {
    if (!DECIMAL_4_RE.test(cfStr) || cfStr === "0" || /^0+(\.0+)?$/.test(cfStr)) {
      errors.push({
        col: "conversion_factor",
        msg: "מספר חיובי, עד 4 ספרות עשרוניות",
      })
    } else {
      conversionFactor = cfStr
    }
  }

  const supplierNumber = getStr("supplier_number") || undefined
  const supplierName = getStr("supplier_name") || undefined

  const priceStr = getStr("default_price").replace(",", ".")
  let defaultPrice: string | undefined
  if (priceStr) {
    if (!DECIMAL_4_RE.test(priceStr)) {
      errors.push({ col: "default_price", msg: "לא שלילי, עד 4 ספרות עשרוניות" })
    } else {
      defaultPrice = priceStr
    }
  }

  const inventoryRaw = getStr("is_inventory_managed").toLowerCase()
  let isInventoryManaged: boolean | undefined
  if (inventoryRaw) {
    if (["true", "1", "yes", "y", "כן"].includes(inventoryRaw)) isInventoryManaged = true
    else if (["false", "0", "no", "n", "לא"].includes(inventoryRaw))
      isInventoryManaged = false
    else
      errors.push({
        col: "is_inventory_managed",
        msg: "true/false (או כן/לא, 1/0)",
      })
  }

  const statusRaw = getStr("status").toUpperCase()
  if (
    statusRaw &&
    !["ACTIVE", "INACTIVE", "PURCHASE_ONLY", "INTERNAL_ONLY", "OBSOLETE"].includes(statusRaw)
  ) {
    errors.push({ col: "status", msg: "ערך סטטוס לא תקין" })
  }

  return {
    rowIndex,
    raw,
    sku,
    description,
    foreignDescription,
    familyCode,
    itemType: itemTypeRaw || undefined,
    unitOfMeasure,
    factoryUom,
    conversionFactor,
    supplierNumber,
    supplierName,
    defaultPrice,
    isInventoryManaged,
    status: statusRaw || undefined,
    errors,
  }
}

function detectDuplicateSkus(rows: ParsedRow[]): Set<string> {
  const seen = new Map<string, number>()
  const dups = new Set<string>()
  for (const r of rows) {
    if (!r.sku) continue
    if (seen.has(r.sku)) dups.add(r.sku)
    else seen.set(r.sku, r.rowIndex)
  }
  return dups
}

const TEMPLATE_CSV = [
  [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS].join(","),
  '08.30.0001,צינור פלסטי שחור 20מ"מ,GENERAL,מ\',Black plastic pipe 20mm,R,מ\',1,SUP-001,ספק כללי,5.5,true,ACTIVE',
  "08.30.0002,מהדק NYY,GENERAL,יח',NYY clamp,R,יח',1,,ספק כללי,2.4,true,ACTIVE",
].join("\n")

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

type SubmitOutcome = {
  rowIndex: number
  sku: string | null
  status: "created" | "error"
  error?: string
  itemId?: string
}

export function CsvImportClient() {
  const [parsing, setParsing] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [rows, setRows] = React.useState<ParsedRow[]>([])
  const [fileName, setFileName] = React.useState<string | null>(null)
  const [outcomes, setOutcomes] = React.useState<SubmitOutcome[] | null>(null)

  const duplicateSkus = React.useMemo(() => detectDuplicateSkus(rows), [rows])
  const validRows = React.useMemo(
    () => rows.filter((r) => r.errors.length === 0 && !duplicateSkus.has(r.sku)),
    [rows, duplicateSkus]
  )
  const invalidRows = React.useMemo(
    () => rows.filter((r) => r.errors.length > 0 || duplicateSkus.has(r.sku)),
    [rows, duplicateSkus]
  )

  function handleFileSelect(file: File) {
    setParsing(true)
    setOutcomes(null)
    setFileName(file.name)
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
      complete: (results) => {
        const data = results.data as Record<string, string>[]
        // Validate header has all required columns
        const headers = results.meta.fields ?? []
        const missingRequired = REQUIRED_COLUMNS.filter((c) => !headers.includes(c))
        if (missingRequired.length > 0) {
          toast.error(`חסרות עמודות חובה: ${missingRequired.join(", ")}`)
          setRows([])
          setParsing(false)
          return
        }
        const parsed = data.map((raw, i) => validateRow(raw, i + 2)) // +2 = skip header + 1-based
        setRows(parsed)
        setParsing(false)
        toast.success(`נטענו ${parsed.length} שורות`)
      },
      error: (err) => {
        toast.error(`כשל פירוק CSV: ${err.message}`)
        setParsing(false)
      },
    })
  }

  function handleDownloadTemplate() {
    const blob = new Blob(["\uFEFF" + TEMPLATE_CSV], {
      type: "text/csv;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "items-import-template.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleDownloadErrors() {
    if (!outcomes) return
    const errored = outcomes.filter((o) => o.status === "error")
    if (errored.length === 0) {
      toast.info("אין שורות עם שגיאה")
      return
    }
    const csv = [
      "row,sku,error",
      ...errored.map(
        (e) =>
          `${e.rowIndex},"${(e.sku ?? "").replace(/"/g, '""')}","${(e.error ?? "").replace(/"/g, '""')}"`
      ),
    ].join("\n")
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "errors.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleSubmit() {
    if (validRows.length === 0) {
      toast.error("אין שורות תקינות לייבוא")
      return
    }
    setSubmitting(true)
    setOutcomes(null)
    try {
      // Send in chunks of 100 to keep responses snappy
      const CHUNK = 100
      const allOutcomes: SubmitOutcome[] = []
      for (let i = 0; i < validRows.length; i += CHUNK) {
        const chunk = validRows.slice(i, i + CHUNK)
        const payload = {
          rows: chunk.map((r) => ({
            rowIndex: r.rowIndex,
            sku: r.sku,
            description: r.description,
            foreignDescription: r.foreignDescription,
            familyCode: r.familyCode,
            itemType: r.itemType,
            unitOfMeasure: r.unitOfMeasure,
            factoryUom: r.factoryUom,
            conversionFactor: r.conversionFactor,
            supplierNumber: r.supplierNumber,
            supplierName: r.supplierName,
            defaultPrice: r.defaultPrice,
            isInventoryManaged: r.isInventoryManaged,
            status: r.status,
          })),
        }
        const resp = await masterDataFetch<{
          totalProcessed: number
          succeeded: number
          failed: number
          outcomes: SubmitOutcome[]
        }>("/api/master-data/items/bulk-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        allOutcomes.push(...resp.outcomes)
      }
      setOutcomes(allOutcomes)
      const succ = allOutcomes.filter((o) => o.status === "created").length
      const fail = allOutcomes.filter((o) => o.status === "error").length
      if (fail === 0) {
        toast.success(`נשמרו ${succ} פריטים בהצלחה`)
      } else {
        toast.warning(`נשמרו ${succ} פריטים, ${fail} נכשלו — ניתן להוריד errors.csv`)
      }
    } catch (err) {
      toast.error(formatError(err) || "ייבוא נכשל")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      dir="rtl"
      lang="he"
      className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16 pt-2"
    >
      <Link
        href="/marker-ofek/items"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowRight className="size-4" aria-hidden />
        חזרה לקטלוג
      </Link>

      <header className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          ייבוא · Stage 1 (Shadow Testing)
        </p>
        <h1 className="text-2xl font-bold tracking-tight">ייבוא קטלוג פריטים מ-CSV</h1>
        <p className="text-sm text-muted-foreground">
          העלאת מק״טים בכמות גדולה. שורות שבורות יזוהו לפני השמירה ותוכל להוריד
          errors.csv עם השורות שכשלו.
        </p>
      </header>

      {/* ── Card: Template + Upload ── */}
      <Card>
        <CardHeader>
          <CardTitle>1. הכנת קובץ CSV</CardTitle>
          <CardDescription>
            הורידו תבנית, מלאו עם נתוני אמת, והעלו. כותרות חובה:{" "}
            <code className="font-mono text-xs">{REQUIRED_COLUMNS.join(", ")}</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadTemplate}
              className="gap-2"
            >
              <Download className="size-4" aria-hidden />
              הורדת תבנית CSV
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="csv-file">קובץ CSV</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFileSelect(f)
              }}
              disabled={parsing || submitting}
            />
            {fileName ? (
              <p className="text-[11px] text-muted-foreground">
                קובץ נטען: {fileName}
              </p>
            ) : null}
          </div>
          <details className="rounded-md border border-border bg-muted/30 p-3 text-xs">
            <summary className="cursor-pointer font-medium">
              מפרט עמודות מלא
            </summary>
            <ul className="mt-2 space-y-1 ps-4">
              <li>
                <strong>sku</strong> — מק״ט פנימי (חובה, עד 22 תווים, ייחודי בחברה)
              </li>
              <li>
                <strong>description</strong> — תיאור עברי (חובה)
              </li>
              <li>
                <strong>family_code</strong> — קוד משפחת מוצר (חובה, חייב להתקיים
                במערכת)
              </li>
              <li>
                <strong>uom</strong> — יחידת קניה/מכירה (חובה)
              </li>
              <li>
                <strong>foreign_description</strong> — תיאור באנגלית (אופציונלי)
              </li>
              <li>
                <strong>item_type</strong> — R/P/S/K (אופציונלי, ברירת מחדל R)
              </li>
              <li>
                <strong>factory_uom</strong> — יחידת מפעל (אופציונלי, ברירת מחדל =
                uom)
              </li>
              <li>
                <strong>conversion_factor</strong> — שעור המרה, חיובי, עד 4 ספרות
                עשרוניות (אופציונלי, ברירת מחדל 1)
              </li>
              <li>
                <strong>supplier_number</strong> או{" "}
                <strong>supplier_name</strong> — לזיהוי הספק המועדף (אופציונלי).
                אם נשלחים שניהם, supplier_number מנצח.
              </li>
              <li>
                <strong>default_price</strong> — מחיר בסיס, לא שלילי, עד 4 ספרות
                (אופציונלי)
              </li>
              <li>
                <strong>is_inventory_managed</strong> — true/false (אופציונלי,
                ברירת מחדל true)
              </li>
              <li>
                <strong>status</strong> — ACTIVE/INACTIVE/PURCHASE_ONLY/INTERNAL_ONLY/OBSOLETE
                (אופציונלי, ברירת מחדל ACTIVE)
              </li>
            </ul>
          </details>
        </CardContent>
      </Card>

      {parsing ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          מפרק קובץ…
        </div>
      ) : null}

      {rows.length > 0 ? (
        <>
          {/* ── Card: Summary ── */}
          <Card>
            <CardHeader>
              <CardTitle>2. סקירה לפני שמירה</CardTitle>
              <CardDescription>
                סה״כ {rows.length} שורות · תקינות: {validRows.length} · שגויות:{" "}
                {invalidRows.length}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {duplicateSkus.size > 0 ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950/40">
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      className="mt-0.5 size-4 shrink-0 text-amber-600"
                      aria-hidden
                    />
                    <div>
                      <strong>מק״טים כפולים בקובץ:</strong>{" "}
                      <code className="font-mono">
                        {Array.from(duplicateSkus).slice(0, 5).join(", ")}
                        {duplicateSkus.size > 5 ? "…" : ""}
                      </code>
                      <p className="text-[11px] text-amber-700 dark:text-amber-300">
                        כל השורות הכפולות מסומנות כשגויות.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {invalidRows.length > 0 ? (
                <div className="max-h-72 overflow-auto rounded-md border border-border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-muted">
                      <TableRow>
                        <TableHead className="w-16">שורה</TableHead>
                        <TableHead>מק״ט</TableHead>
                        <TableHead>שגיאות</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invalidRows.slice(0, 50).map((r) => (
                        <TableRow key={r.rowIndex}>
                          <TableCell className="font-mono text-xs">
                            {r.rowIndex}
                          </TableCell>
                          <TableCell className="font-mono text-xs" dir="ltr">
                            {r.sku || "—"}
                          </TableCell>
                          <TableCell>
                            <ul className="space-y-1 text-xs text-destructive">
                              {duplicateSkus.has(r.sku) ? (
                                <li>
                                  • <strong>sku</strong>: כפול בקובץ
                                </li>
                              ) : null}
                              {r.errors.map((e, i) => (
                                <li key={i}>
                                  • <strong>{e.col}</strong>: {e.msg}
                                </li>
                              ))}
                            </ul>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {invalidRows.length > 50 ? (
                    <p className="border-t border-border bg-muted/30 p-2 text-center text-[11px] text-muted-foreground">
                      מציג 50 ראשונות מתוך {invalidRows.length} שגויות
                    </p>
                  ) : null}
                </div>
              ) : null}

              {validRows.length > 0 ? (
                <div className="max-h-64 overflow-auto rounded-md border border-border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-muted">
                      <TableRow>
                        <TableHead className="w-16">שורה</TableHead>
                        <TableHead>מק״ט</TableHead>
                        <TableHead>תיאור</TableHead>
                        <TableHead>משפחה</TableHead>
                        <TableHead>יח'</TableHead>
                        <TableHead>שעור</TableHead>
                        <TableHead>מחיר</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validRows.slice(0, 100).map((r) => (
                        <TableRow key={r.rowIndex}>
                          <TableCell className="font-mono text-xs">
                            {r.rowIndex}
                          </TableCell>
                          <TableCell className="font-mono text-xs" dir="ltr">
                            {r.sku}
                          </TableCell>
                          <TableCell className="max-w-[260px] truncate text-xs">
                            {r.description}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {r.familyCode}
                          </TableCell>
                          <TableCell className="text-xs">
                            {r.unitOfMeasure}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {r.conversionFactor ?? "1"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {r.defaultPrice ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {validRows.length > 100 ? (
                    <p className="border-t border-border bg-muted/30 p-2 text-center text-[11px] text-muted-foreground">
                      מציג 100 ראשונות מתוך {validRows.length} תקינות
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={submitting || validRows.length === 0}
                  className="gap-2"
                >
                  {submitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <PlayCircle className="size-4" />
                  )}
                  שמירה ({validRows.length} פריטים)
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  שורות שגויות לא יישלחו לשרת. תקנו ב-CSV ועלו מחדש.
                </span>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      {/* ── Card: Outcomes ── */}
      {outcomes ? (
        <Card>
          <CardHeader>
            <CardTitle>3. תוצאות שמירה</CardTitle>
            <CardDescription>
              נשמרו {outcomes.filter((o) => o.status === "created").length} ·
              נכשלו {outcomes.filter((o) => o.status === "error").length}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadErrors}
                disabled={
                  outcomes.filter((o) => o.status === "error").length === 0
                }
                className="gap-2"
              >
                <Download className="size-4" />
                הורדת errors.csv
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                render={<Link href="/marker-ofek/items" />}
                className="gap-2"
              >
                מעבר לקטלוג
              </Button>
            </div>
            <div className="max-h-72 overflow-auto rounded-md border border-border">
              <Table>
                <TableHeader className="sticky top-0 bg-muted">
                  <TableRow>
                    <TableHead className="w-16">שורה</TableHead>
                    <TableHead>מק״ט</TableHead>
                    <TableHead>סטטוס</TableHead>
                    <TableHead>פירוט</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outcomes.map((o) => (
                    <TableRow key={`${o.rowIndex}-${o.sku ?? ""}`}>
                      <TableCell className="font-mono text-xs">
                        {o.rowIndex}
                      </TableCell>
                      <TableCell className="font-mono text-xs" dir="ltr">
                        {o.sku ?? "—"}
                      </TableCell>
                      <TableCell>
                        {o.status === "created" ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600">
                            <CheckCircle2 className="size-3.5" />
                            נוצר
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-destructive">
                            <XCircle className="size-3.5" />
                            שגיאה
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {o.status === "created" ? (
                          <Link
                            href={`/marker-ofek/items/${o.itemId}`}
                            className="text-primary underline-offset-2 hover:underline"
                          >
                            פתיחה
                          </Link>
                        ) : (
                          <span className="text-destructive">{o.error}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Empty state */}
      {!parsing && rows.length === 0 && !outcomes ? (
        <div
          className={cn(
            "flex flex-col items-center gap-2 rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground"
          )}
        >
          <FileUp className="size-8 opacity-40" aria-hidden />
          <p>בחרו קובץ CSV להתחלה</p>
        </div>
      ) : null}
    </div>
  )
}
