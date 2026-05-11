"use client"

import * as React from "react"
import { format } from "date-fns"
import { he } from "date-fns/locale"
import {
  AlertTriangle,
  CheckCircle2,
  EyeOff,
  Info,
  Loader2,
  RotateCcw,
  Save,
  ShieldCheck,
} from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { setSystemParametersBulk } from "@/lib/erp/system-parameters-actions"
import type { SystemParameter } from "@/lib/erp/system-parameters"
import { cn, formatError } from "@/lib/utils"

type Props = {
  companyId: string
  initialParameters: SystemParameter[]
}

const CATEGORY_META: Record<
  string,
  { label: string; description: string; order: number }
> = {
  finance: {
    label: "פיננסים ומיסוי",
    description: "מע״מ, עכבון, מטבע ועיגול כספים — משפיע על PDFs ועל חישובים מקובלי-המערכת.",
    order: 1,
  },
  numbering: {
    label: "מספור אוטומטי",
    description: "תחיליות למספור חשבוניות, הזמנות רכש וקודי פרויקט.",
    order: 2,
  },
  branding: {
    label: "מיתוג ותקשורת",
    description: "טקסט שולח במייל, סלוגן ב-PDF, פרטי חברה גלויים.",
    order: 3,
  },
  banking: {
    label: "בנקאות ו-MASAV",
    description: "קוד מוסד, שם שולח ופרטי זיהוי במנגנון MASAV (ZNK).",
    order: 4,
  },
  ai: {
    label: "אוטומציות AI",
    description: "ספי ביטחון וטולרנסים שמכתיבים מתי המערכת פועלת אוטונומית.",
    order: 5,
  },
  cost_control: {
    label: "בקרה תקציבית",
    description: "ספי אזהרה/חסימה על מסמכי עלות + נעילת תקופות (MedaTech §6).",
    order: 6,
  },
}

function categoryLabel(c: string): string {
  return CATEGORY_META[c]?.label ?? c
}

function categoryOrder(c: string): number {
  return CATEGORY_META[c]?.order ?? 99
}

function paramOrder(p: SystemParameter): number {
  const raw = p.metadata?.group_order
  const n = typeof raw === "number" ? raw : Number(raw)
  return Number.isFinite(n) ? n : 999
}

function unitFor(p: SystemParameter): string {
  const u = p.metadata?.unit
  return typeof u === "string" ? u : ""
}

function validateValue(p: SystemParameter, raw: string): string | null {
  if (raw === "" && p.dataType !== "STRING" && p.dataType !== "JSON") {
    /** Allow empty string only for free-text params; numbers default. */
    return null
  }
  switch (p.dataType) {
    case "NUMBER":
    case "PERCENT": {
      const n = Number(raw)
      if (!Number.isFinite(n)) return "ערך חייב להיות מספרי"
      const min = Number(p.metadata?.min)
      const max = Number(p.metadata?.max)
      if (Number.isFinite(min) && n < min) return `מינימום ${min}`
      if (Number.isFinite(max) && n > max) return `מקסימום ${max}`
      return null
    }
    case "BOOLEAN":
      if (!["true", "false", "1", "0"].includes(raw.toLowerCase()))
        return "ערך חייב להיות true/false"
      return null
    case "EMAIL":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? null : "כתובת מייל לא תקינה"
    case "URL":
      try {
        new URL(raw)
        return null
      } catch {
        return "URL לא תקין"
      }
    case "JSON":
      try {
        JSON.parse(raw)
        return null
      } catch {
        return "JSON לא תקין"
      }
    case "STRING":
    default: {
      const re = p.metadata?.regex
      if (typeof re === "string" && re.length > 0) {
        try {
          if (!new RegExp(re).test(raw)) return "הערך לא תואם את הפורמט הנדרש"
        } catch {
          /** Bad regex in metadata — skip validation. */
        }
      }
      return null
    }
  }
}

export function SystemParametersEditor({
  companyId,
  initialParameters,
}: Props) {
  /** Working copy of values keyed by paramKey. */
  const [values, setValues] = React.useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    for (const p of initialParameters) m[p.paramKey] = p.paramValue ?? ""
    return m
  })
  const [original, setOriginal] = React.useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    for (const p of initialParameters) m[p.paramKey] = p.paramValue ?? ""
    return m
  })
  const [revealedSecrets, setRevealedSecrets] = React.useState<Set<string>>(
    new Set()
  )
  const [saving, setSaving] = React.useState(false)

  /** Group params by category, sorted by category.order and metadata.group_order. */
  const grouped = React.useMemo(() => {
    const byCat = new Map<string, SystemParameter[]>()
    for (const p of initialParameters) {
      if (!byCat.has(p.category)) byCat.set(p.category, [])
      byCat.get(p.category)!.push(p)
    }
    for (const list of byCat.values()) {
      list.sort((a, b) => paramOrder(a) - paramOrder(b))
    }
    return Array.from(byCat.entries()).sort(
      (a, b) => categoryOrder(a[0]) - categoryOrder(b[0])
    )
  }, [initialParameters])

  const dirty = React.useMemo(() => {
    const changed: string[] = []
    for (const p of initialParameters) {
      if ((values[p.paramKey] ?? "") !== (original[p.paramKey] ?? "")) {
        changed.push(p.paramKey)
      }
    }
    return changed
  }, [values, original, initialParameters])

  const validationErrors = React.useMemo(() => {
    const errs: Record<string, string> = {}
    for (const p of initialParameters) {
      const v = values[p.paramKey] ?? ""
      const e = validateValue(p, v)
      if (e) errs[p.paramKey] = e
    }
    return errs
  }, [values, initialParameters])

  const hasErrors = Object.keys(validationErrors).length > 0

  function setValue(key: string, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }))
  }

  function resetParam(key: string) {
    setValues((prev) => ({ ...prev, [key]: original[key] ?? "" }))
  }

  async function saveAll() {
    if (dirty.length === 0) return
    if (hasErrors) {
      toast.error("יש לתקן שגיאות לפני שמירה")
      return
    }
    setSaving(true)
    try {
      const updates = dirty.map((k) => ({
        paramKey: k,
        paramValue: values[k] ?? null,
      }))
      const res = await setSystemParametersBulk({ companyId, updates })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`${res.updated} פרמטרים נשמרו`)
      setOriginal((prev) => {
        const next = { ...prev }
        for (const u of updates) next[u.paramKey] = u.paramValue ?? ""
        return next
      })
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Sticky save bar */}
      <div
        className={cn(
          "sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-sm transition-all",
          dirty.length > 0 && "border-amber-300 bg-amber-50 dark:bg-amber-950/30"
        )}
      >
        <div className="flex items-center gap-3">
          {dirty.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-emerald-500" />
              אין שינויים שמורים
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="size-4 text-amber-500" />
              <span className="font-medium">{dirty.length} שינויים ממתינים</span>
              {hasErrors && (
                <Badge variant="destructive" className="ms-1 h-5 text-[10px]">
                  {Object.keys(validationErrors).length} שגיאות
                </Badge>
              )}
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            חברה: <span className="font-mono">{companyId}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={saving || dirty.length === 0}
            onClick={() => {
              setValues({ ...original })
              toast.info("השינויים בוטלו")
            }}
          >
            <RotateCcw className="size-3.5" />
            בטל שינויים
          </Button>
          <Button
            size="sm"
            disabled={saving || dirty.length === 0 || hasErrors}
            onClick={() => void saveAll()}
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            שמור הכל
          </Button>
        </div>
      </div>

      {/* Category cards */}
      {grouped.map(([category, params]) => {
        const meta = CATEGORY_META[category]
        return (
          <Card key={category}>
            <CardHeader>
              <CardTitle className="text-base">
                {meta?.label ?? categoryLabel(category)}
              </CardTitle>
              {meta?.description && (
                <CardDescription>{meta.description}</CardDescription>
              )}
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {params.map((p) => {
                const v = values[p.paramKey] ?? ""
                const err = validationErrors[p.paramKey]
                const isDirty = (values[p.paramKey] ?? "") !== (original[p.paramKey] ?? "")
                return (
                  <ParameterField
                    key={p.paramKey}
                    parameter={p}
                    value={v}
                    error={err}
                    dirty={isDirty}
                    revealed={revealedSecrets.has(p.paramKey)}
                    onChange={(nv) => setValue(p.paramKey, nv)}
                    onReset={() => resetParam(p.paramKey)}
                    onToggleReveal={() =>
                      setRevealedSecrets((prev) => {
                        const next = new Set(prev)
                        if (next.has(p.paramKey)) next.delete(p.paramKey)
                        else next.add(p.paramKey)
                        return next
                      })
                    }
                  />
                )
              })}
            </CardContent>
          </Card>
        )
      })}

      {grouped.length === 0 && (
        <Alert>
          <AlertTitle>אין פרמטרים</AlertTitle>
          <AlertDescription>
            לא נמצאו פרמטרים מוגדרים לחברה זו. ייתכן שצריך להריץ את ה-seed
            במיגרציה <code>20260910120000_erp_system_parameters.sql</code>.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

function ParameterField({
  parameter,
  value,
  error,
  dirty,
  revealed,
  onChange,
  onReset,
  onToggleReveal,
}: {
  parameter: SystemParameter
  value: string
  error: string | undefined
  dirty: boolean
  revealed: boolean
  onChange: (v: string) => void
  onReset: () => void
  onToggleReveal: () => void
}) {
  const unit = unitFor(parameter)
  const inputType =
    parameter.dataType === "NUMBER" || parameter.dataType === "PERCENT"
      ? "number"
      : parameter.dataType === "EMAIL"
        ? "email"
        : parameter.dataType === "URL"
          ? "url"
          : parameter.dataType === "DATE"
            ? "date"
            : "text"
  const isSecretHidden = parameter.isSecret && !revealed
  const displayValue = isSecretHidden ? "***" : value

  return (
    <div
      className={cn(
        "space-y-1.5 rounded-md border p-3 transition-colors",
        dirty && "border-amber-300 bg-amber-50/40 dark:bg-amber-950/10",
        error && "border-destructive bg-destructive/5"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={`param-${parameter.paramKey}`} className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-muted-foreground">
            {parameter.paramKey}
          </span>
          {parameter.isSystem && (
            <Badge variant="outline" className="h-4 px-1 text-[9px]">
              מערכת
            </Badge>
          )}
          {parameter.isSecret && (
            <Badge variant="secondary" className="h-4 px-1 text-[9px]">
              <ShieldCheck className="me-0.5 size-2.5" />
              מוגן
            </Badge>
          )}
        </Label>
        <div className="flex items-center gap-1">
          {parameter.isSecret && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-xs"
              onClick={onToggleReveal}
            >
              <EyeOff className="size-3" />
              {revealed ? "הסתר" : "חשוף"}
            </Button>
          )}
          {dirty && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-xs"
              onClick={onReset}
            >
              <RotateCcw className="size-3" />
              שחזר
            </Button>
          )}
        </div>
      </div>

      {parameter.dataType === "BOOLEAN" ? (
        <div className="flex items-center gap-2 py-1">
          <Switch
            id={`param-${parameter.paramKey}`}
            checked={value.toLowerCase() === "true" || value === "1"}
            onCheckedChange={(c) => onChange(c ? "true" : "false")}
          />
          <span className="text-sm">{value.toLowerCase() === "true" || value === "1" ? "פעיל" : "כבוי"}</span>
        </div>
      ) : parameter.dataType === "JSON" ? (
        <Textarea
          id={`param-${parameter.paramKey}`}
          value={displayValue}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="font-mono text-xs"
          disabled={isSecretHidden}
        />
      ) : (
        <div className="flex items-center gap-2">
          <Input
            id={`param-${parameter.paramKey}`}
            type={inputType}
            value={displayValue}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1"
            disabled={isSecretHidden}
          />
          {unit && (
            <span className="text-xs text-muted-foreground">{unit}</span>
          )}
        </div>
      )}

      {parameter.description && (
        <p className="flex items-start gap-1 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3 shrink-0" />
          {parameter.description}
        </p>
      )}

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      <div className="text-[10px] text-muted-foreground">
        עודכן לאחרונה:{" "}
        {format(new Date(parameter.updatedAt), "dd MMM yyyy HH:mm", {
          locale: he,
        })}
      </div>
    </div>
  )
}
