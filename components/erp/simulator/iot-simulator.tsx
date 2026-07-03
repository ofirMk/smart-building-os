"use client"

import * as React from "react"
import { AlertTriangle, CheckCircle2, Cpu, Loader2, Send, Zap } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { fireSimulatedWebhook } from "@/app/actions/simulator"

// ─────────────────────────────────────────────────────────────────────────────
// Scenario library
//
// Each payload is carefully designed to satisfy BOTH:
//   1. The JS webhook ingest route (normaliseVerkada / normaliseSalto / normaliseButterflyMx)
//   2. The Python vendor adapters (VerkadaAdapter / SaltoAdapter / ButterflyMXAdapter)
//
// Verkada: uses uppercase event_type for the JS normalise map +
//          anomaly_type / door_held_seconds for the Python adapter
// Salto:   uses PascalCase `type` for the Python adapter (JS falls back to .toLowerCase())
// ButterflyMX: includes both `event_name` (JS, dot-notation) and `event` (Python, snake_case)
// ─────────────────────────────────────────────────────────────────────────────

interface Scenario {
  id: string
  label: string
  description: string
  severity: "critical" | "warning" | "info"
  provider: Provider
  payload: Record<string, unknown>
}

type Provider = "verkada" | "salto" | "butterflymx"

const SCENARIOS: Scenario[] = [
  // ── Verkada ─────────────────────────────────────────────────────────────
  {
    id: "verkada-tailgate",
    label: "Verkada — Tailgate (2 אנשים / כניסה בגרירה)",
    description: "מצלמת Verkada זיהתה שני אנשים על אישור כניסה אחד. מפעיל P1 + נעילה אוטומטית באזורים סטריליים.",
    severity: "critical",
    provider: "verkada",
    payload: {
      event_type: "LPE_TAILGATE",       // JS: maps to 'tailgate_detected'
      device_id: "demo-verkada-gw-lobby-001",
      anomaly_type: "tailgate",          // Python: VerkadaAdapter → is_security_breach=true
      person_count: 2,                   // Python: VerkadaAdapter → person_count=2
      timestamp: new Date().toISOString(),
    },
  },
  {
    id: "verkada-door-held",
    label: "Verkada — Door Held Open (60 שניות)",
    description: "הדלת נותרת פתוחה מעל 45 שניות. מפעיל P2 WO באזורים ציבוריים.",
    severity: "warning",
    provider: "verkada",
    payload: {
      event_type: "DOOR_HELD_OPEN",      // JS: maps to 'door_held_open'
      device_id: "demo-verkada-gw-lobby-001",
      door_held_seconds: 60,             // Python: VerkadaAdapter → door_held_seconds=60
      timestamp: new Date().toISOString(),
    },
  },
  {
    id: "verkada-door-forced",
    label: "Verkada — Door Forced Open (פריצה)",
    description: "פריצה פיזית לדלת. is_security_breach=true — מפעיל P1.",
    severity: "critical",
    provider: "verkada",
    payload: {
      event_type: "DOOR_FORCED",         // JS: maps to 'door_forced'
      device_id: "demo-verkada-gw-lobby-001",
      anomaly_type: "forced_entry",      // Python: VerkadaAdapter → is_security_breach=true
      person_count: 0,
      timestamp: new Date().toISOString(),
    },
  },
  {
    id: "verkada-standard-entry",
    label: "Verkada — Standard Entry (כניסה תקינה)",
    description: "כניסה רגילה של משתמש מורשה. לא אמור לפתוח WO (SILENT_LOG בלבד).",
    severity: "info",
    provider: "verkada",
    payload: {
      event_type: "LPED_ENTRY",          // JS: maps to 'door_open'
      device_id: "demo-verkada-gw-lobby-001",
      person_count: 1,
      timestamp: new Date().toISOString(),
    },
  },

  // ── Salto ───────────────────────────────────────────────────────────────
  {
    id: "salto-forced-open",
    label: "Salto — Door Forced Open (DoorForcedOpen)",
    description: "Salto KS: דלת נפרצה. Python: DoorForcedOpen ∈ _FORCED_TYPES → P1 breach.",
    severity: "critical",
    provider: "salto",
    payload: {
      type: "DoorForcedOpen",            // Python: SaltoAdapter._FORCED_TYPES
      device_uuid: "demo-salto-door-001",
      door_id: "main-entrance-gate",
      site_id: "demo-site-001",
    },
  },
  {
    id: "salto-door-left-open",
    label: "Salto — Door Left Open 72s (DoorLeftOpen)",
    description: "Salto KS: דלת נשארה פתוחה 72 שניות. Python: DoorLeftOpen ∈ _HELD_TYPES.",
    severity: "warning",
    provider: "salto",
    payload: {
      type: "DoorLeftOpen",              // Python: SaltoAdapter._HELD_TYPES
      device_uuid: "demo-salto-door-001",
      door_id: "main-entrance-gate",
      door_open_time: 72,                // Python: door_held_seconds=72
    },
  },
  {
    id: "salto-access-granted",
    label: "Salto — Access Granted (AccessGranted)",
    description: "כניסה תקינה עם כרטיס. Python: AccessGranted ∈ _OPEN_TYPES → door_open.",
    severity: "info",
    provider: "salto",
    payload: {
      type: "AccessGranted",             // Python: SaltoAdapter._OPEN_TYPES
      device_uuid: "demo-salto-door-001",
      door_id: "main-entrance-gate",
      user_id: "demo-user-001",
    },
  },
  {
    id: "salto-intrusion",
    label: "Salto — Intrusion Detected",
    description: "התראת חדירה. Python: IntrusionDetected ∈ _FORCED_TYPES → P1 breach.",
    severity: "critical",
    provider: "salto",
    payload: {
      type: "IntrusionDetected",         // Python: SaltoAdapter._FORCED_TYPES
      device_uuid: "demo-salto-door-001",
      zone_id: "utility-room-zone-007",
    },
  },

  // ── ButterflyMX ─────────────────────────────────────────────────────────
  {
    id: "bmx-call-made",
    label: "ButterflyMX — Intercom Call (Standard)",
    description: "דייר לחץ על כפתור האינטרקום. SILENT_LOG — לא אמור לפתוח WO.",
    severity: "info",
    provider: "butterflymx",
    payload: {
      event_name: "call.started",        // JS: maps to 'visitor_call'
      event: "call_made",               // Python: ButterflyMXAdapter → intercom_call
      panel_id: "demo-bmx-panel-001",
      unit_name: "1A",
      resident_id: "demo-resident-001",
      timestamp: new Date().toISOString(),
    },
  },
  {
    id: "bmx-door-held",
    label: "ButterflyMX — Door Held Open (90s)",
    description: "דלת האינטרקום נותרת פתוחה 90 שניות — מעל סף 45s → P2 WO.",
    severity: "warning",
    provider: "butterflymx",
    payload: {
      event_name: "door.held_open",      // JS: maps to 'door_held_open'
      event: "door_held_open",          // Python: ButterflyMXAdapter → door_held
      panel_id: "demo-bmx-panel-001",
      door_name: "Main Entrance",
      duration_seconds: 90,              // Python: door_held_seconds=90
      timestamp: new Date().toISOString(),
    },
  },
  {
    id: "bmx-door-forced",
    label: "ButterflyMX — Door Forced Open",
    description: "כניסה כוחנית לבניין. Python: door_forced_open → P1 breach.",
    severity: "critical",
    provider: "butterflymx",
    payload: {
      event_name: "door.opened",         // JS fallback
      event: "door_forced_open",        // Python: ButterflyMXAdapter._BREACH_EVENTS
      panel_id: "demo-bmx-panel-001",
      door_name: "Side Gate",
      timestamp: new Date().toISOString(),
    },
  },
  {
    id: "bmx-door-released",
    label: "ButterflyMX — Door Released (פתיחה תקינה)",
    description: "דייר פתח את הדלת דרך האפליקציה. כניסה תקינה.",
    severity: "info",
    provider: "butterflymx",
    payload: {
      event_name: "door.opened",         // JS: maps to 'door_open'
      event: "door_released",           // Python: ButterflyMXAdapter._ACCESS_EVENTS
      panel_id: "demo-bmx-panel-001",
      door_name: "Main Entrance",
      released_by: "resident",
      timestamp: new Date().toISOString(),
    },
  },
]

const SCENARIOS_BY_PROVIDER: Record<Provider, Scenario[]> = {
  verkada: SCENARIOS.filter((s) => s.provider === "verkada"),
  salto: SCENARIOS.filter((s) => s.provider === "salto"),
  butterflymx: SCENARIOS.filter((s) => s.provider === "butterflymx"),
}

const PROVIDER_LABELS: Record<Provider, string> = {
  verkada: "Verkada (Camera + Access)",
  salto: "Salto KS (Smart Locks)",
  butterflymx: "ButterflyMX (Intercom)",
}

const SEVERITY_STYLE: Record<Scenario["severity"], string> = {
  critical: "border-red-200 bg-red-50 text-red-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  info: "border-blue-100 bg-blue-50 text-blue-700",
}

const SEVERITY_ICON: Record<Scenario["severity"], React.ReactNode> = {
  critical: <AlertTriangle className="w-3.5 h-3.5" />,
  warning: <Zap className="w-3.5 h-3.5" />,
  info: <CheckCircle2 className="w-3.5 h-3.5" />,
}

// ─────────────────────────────────────────────────────────────────────────────
// Result display
// ─────────────────────────────────────────────────────────────────────────────

interface FireResult {
  ok: boolean
  status?: number
  responseBody?: string
  error?: string
}

function ResultPanel({ result }: { result: FireResult }) {
  if (result.ok) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-1">
        <p className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4" />
          אירוע נשלח בהצלחה (HTTP {result.status})
        </p>
        {result.responseBody && (
          <pre className="text-xs text-emerald-700 font-mono overflow-auto max-h-24 rounded bg-emerald-100/60 p-2">
            {result.responseBody}
          </pre>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4">
      <p className="text-sm font-semibold text-red-800 flex items-center gap-1.5">
        <AlertTriangle className="w-4 h-4" />
        שגיאה: {result.error}
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function IotSimulator() {
  const [provider, setProvider] = React.useState<Provider>("verkada")
  const [scenarioId, setScenarioId] = React.useState<string>(
    SCENARIOS_BY_PROVIDER.verkada[0]?.id ?? ""
  )
  const [jsonText, setJsonText] = React.useState<string>("")
  const [lastResult, setLastResult] = React.useState<FireResult | null>(null)
  const [pending, startTransition] = React.useTransition()

  // Keep json textarea in sync with selected scenario
  const selectedScenario = SCENARIOS.find((s) => s.id === scenarioId) ?? null
  const scenarios = SCENARIOS_BY_PROVIDER[provider]

  React.useEffect(() => {
    if (selectedScenario) {
      setJsonText(JSON.stringify(selectedScenario.payload, null, 2))
    }
  }, [selectedScenario])

  function handleProviderChange(value: string | null) {
    if (!value) return
    const p = value as Provider
    setProvider(p)
    const first = SCENARIOS_BY_PROVIDER[p][0]
    if (first) {
      setScenarioId(first.id)
      setJsonText(JSON.stringify(first.payload, null, 2))
    }
    setLastResult(null)
  }

  function handleScenarioChange(value: string | null) {
    if (!value) return
    setScenarioId(value)
    const scenario = SCENARIOS.find((s) => s.id === value)
    if (scenario) {
      setJsonText(JSON.stringify(scenario.payload, null, 2))
    }
    setLastResult(null)
  }

  function handleFire() {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      toast.error("JSON לא תקין — בדוק את הטקסט לפני השליחה")
      return
    }

    startTransition(async () => {
      setLastResult(null)
      const result = await fireSimulatedWebhook(provider, parsed)

      if (!result.ok) {
        const errMsg = result.error ?? "שגיאה לא ידועה"
        toast.error(errMsg)
        setLastResult({ ok: false, error: errMsg })
        return
      }

      const note = `אירוע נשלח ← ${provider}`
      toast.success(note)
      setLastResult({ ok: true, status: result.status, responseBody: result.responseBody })
    })
  }

  return (
    <div className="space-y-5">
      {/* Provider + Scenario selectors */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Cpu className="w-4 h-4 text-violet-600" />
            הגדרת אירוע מדומה
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Provider */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">ספק חומרה</label>
            <Select value={provider} onValueChange={handleProviderChange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PROVIDER_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Scenario */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">תרחיש</label>
            <Select value={scenarioId} onValueChange={handleScenarioChange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {scenarios.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Scenario badge + description */}
          {selectedScenario && (
            <div
              className={cn(
                "rounded-xl border px-4 py-3 flex items-start gap-2 text-sm",
                SEVERITY_STYLE[selectedScenario.severity]
              )}
            >
              <span className="mt-0.5 shrink-0">{SEVERITY_ICON[selectedScenario.severity]}</span>
              <p className="leading-relaxed">{selectedScenario.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* JSON editor */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">עריכת Payload (JSON)</CardTitle>
        </CardHeader>
        <CardContent>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            rows={14}
            spellCheck={false}
            dir="ltr"
            className={cn(
              "w-full rounded-xl border bg-slate-50 p-3 font-mono text-xs",
              "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
              "resize-y leading-relaxed"
            )}
            placeholder='{"event_type": "..."}'
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            ערוך את ה-JSON ידנית לפי הצורך. הפאיילוד יישלח כפי שהוא.
          </p>
        </CardContent>
      </Card>

      {/* Fire button */}
      <Button
        className="w-full h-14 text-base rounded-2xl gap-2"
        onClick={handleFire}
        disabled={pending}
      >
        {pending ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            שולח אירוע...
          </>
        ) : (
          <>
            <Send className="w-5 h-5" />
            Fire Event — שגר לצינור האירועים
          </>
        )}
      </Button>

      {/* Result */}
      {lastResult && <ResultPanel result={lastResult} />}

      {/* Architecture note */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-semibold text-foreground">מה קורה אחרי הלחיצה?</p>
        <ol className="list-decimal list-inside space-y-0.5 leading-relaxed">
          <li>Server action חותם את ה-payload עם HMAC זהה לספק האמיתי</li>
          <li>POST ל-/api/iot/webhooks/{"{provider}"}?cid={"{companyId}"}</li>
          <li>Webhook מאמת את החתימה, מנרמל ומאחסן ב-erp_iot_events</li>
          <li>pg_notify מעיר את Python Correlator ב-ai-worker</li>
          <li>Correlator מחיל את הספק-Adapter ואת ה-RuleEvaluator</li>
          <li>אם הכלל מתאים — נוצרת פקודת עבודה ב-erp_work_orders</li>
        </ol>
      </div>
    </div>
  )
}
