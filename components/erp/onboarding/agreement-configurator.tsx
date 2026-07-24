"use client"

import { useReducer, useTransition } from "react"
import { toast } from "sonner"
import { Building2, Loader2, Zap } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"

import { createOnboardingConfig, generateOnboardingTasks } from "@/app/actions/onboarding"
import {
  CONTRACT_TYPE_DEFAULTS,
  CONTRACT_TYPE_DESCRIPTIONS,
  CONTRACT_TYPE_LABELS,
  FEATURE_LABELS,
  IOT_DEPENDENT_FEATURES,
  coerceIotGateway,
  type ContractType,
  type ErpOnboardingConfig,
  type FeaturesConfig,
  type OnboardingFeature,
} from "@/types/onboarding"
import { cn } from "@/lib/utils"

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

interface FormState {
  contractType: ContractType
  features: FeaturesConfig
  agreementReference: string
  agreementSignedAt: string
  committeeContactName: string
  committeeContactPhone: string
  committeeContactEmail: string
  notes: string
}

type Action =
  | { type: "SET_CONTRACT_TYPE"; payload: ContractType }
  | { type: "TOGGLE_FEATURE"; feature: OnboardingFeature; value: boolean }
  | { type: "SET_FIELD"; field: keyof Omit<FormState, "contractType" | "features">; value: string }

function reducer(state: FormState, action: Action): FormState {
  switch (action.type) {
    case "SET_CONTRACT_TYPE":
      return {
        ...state,
        contractType: action.payload,
        features: CONTRACT_TYPE_DEFAULTS[action.payload],
      }
    case "TOGGLE_FEATURE": {
      const updated = { ...state.features, [action.feature]: action.value }
      return { ...state, features: coerceIotGateway(updated) }
    }
    case "SET_FIELD":
      return { ...state, [action.field]: action.value }
  }
}

const initialState: FormState = {
  contractType: "full_maintenance",
  features: CONTRACT_TYPE_DEFAULTS.full_maintenance,
  agreementReference: "",
  agreementSignedAt: "",
  committeeContactName: "",
  committeeContactPhone: "",
  committeeContactEmail: "",
  notes: "",
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature groups for visual layout
// ─────────────────────────────────────────────────────────────────────────────

const FEATURE_GROUPS: { label: string; features: OnboardingFeature[] }[] = [
  {
    label: "מערכות IoT ובטחון",
    features: ["iot_gateway", "smart_locks", "cctv", "elevator_monitoring", "pump_monitoring"],
  },
  {
    label: "שירותים שוטפים",
    features: ["cleaning", "pest_control", "gardening"],
  },
  {
    label: "תשתיות אנרגיה",
    features: ["ev_charging", "energy_metering"],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  buildingId: string
  existingConfig: ErpOnboardingConfig | null
  onSuccess: () => void
}

export function AgreementConfigurator({ buildingId, existingConfig, onSuccess }: Props) {
  const [state, dispatch] = useReducer(reducer, initialState, (init) => {
    if (!existingConfig) return init
    return {
      contractType: existingConfig.contract_type,
      features: existingConfig.features_config,
      agreementReference: existingConfig.agreement_reference ?? "",
      agreementSignedAt: existingConfig.agreement_signed_at ?? "",
      committeeContactName: existingConfig.committee_contact_name ?? "",
      committeeContactPhone: existingConfig.committee_contact_phone ?? "",
      committeeContactEmail: existingConfig.committee_contact_email ?? "",
      notes: existingConfig.notes ?? "",
    }
  })

  const [isPending, startTransition] = useTransition()

  const isReadonly = !!existingConfig && existingConfig.status !== "draft"

  async function handleSubmit() {
    startTransition(async () => {
      // Step 1: create / validate config
      const configResult = await createOnboardingConfig({
        buildingId,
        contractType: state.contractType,
        featuresConfig: state.features,
        agreementReference: state.agreementReference || undefined,
        agreementSignedAt: state.agreementSignedAt || undefined,
        committeeContactName: state.committeeContactName || undefined,
        committeeContactPhone: state.committeeContactPhone || undefined,
        committeeContactEmail: state.committeeContactEmail || undefined,
        notes: state.notes || undefined,
      })

      if (!configResult.ok) {
        toast.error(configResult.error ?? "שגיאה ביצירת הגדרת ההקמה")
        return
      }

      // Step 2: generate tasks
      const tasksResult = await generateOnboardingTasks(configResult.data.id)
      if (!tasksResult.ok) {
        toast.error(tasksResult.error ?? "שגיאה ביצירת המשימות")
        return
      }

      const count = tasksResult.data.length
      toast.success(`נוצרו ${count} משימות הקמה בהצלחה`)
      onSuccess()
    })
  }

  return (
    <div className="space-y-6">
      {/* Contract type cards */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            סוג הסכם עם ועד הדיירים
          </CardTitle>
          <CardDescription>
            בחרו את סוג ההסכם שנחתם. הבחירה תקבע את ברירות המחדל של המודולים למטה.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(["full_maintenance", "basic_management", "premium", "custom"] as ContractType[]).map((ct) => (
              <button
                key={ct}
                type="button"
                disabled={isReadonly}
                onClick={() => dispatch({ type: "SET_CONTRACT_TYPE", payload: ct })}
                className={cn(
                  "rounded-lg border-2 p-4 text-right transition-all",
                  state.contractType === ct
                    ? "border-primary bg-primary/5"
                    : "border-muted hover:border-primary/40",
                  isReadonly && "opacity-60 cursor-not-allowed"
                )}
              >
                <p className="font-semibold text-sm">{CONTRACT_TYPE_LABELS[ct]}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {CONTRACT_TYPE_DESCRIPTIONS[ct]}
                </p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Feature toggles */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            מודולים ותכונות
          </CardTitle>
          <CardDescription>
            הפעלת/כיבוי מודול משפיע על המשימות שייוצרו בשלב הבא.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {FEATURE_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                {group.label}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {group.features.map((feature) => {
                  const isGateway = feature === "iot_gateway"
                  const isAutoOn = isGateway && IOT_DEPENDENT_FEATURES.some((f) => state.features[f])
                  return (
                    <div
                      key={feature}
                      className={cn(
                        "flex items-center justify-between rounded-md border p-3 gap-3",
                        state.features[feature] ? "border-primary/30 bg-primary/5" : "border-muted"
                      )}
                    >
                      <div>
                        <p className="text-sm font-medium">{FEATURE_LABELS[feature]}</p>
                        {isAutoOn && (
                          <p className="text-xs text-muted-foreground">מופעל אוטומטית</p>
                        )}
                      </div>
                      <Switch
                        checked={state.features[feature]}
                        disabled={isReadonly || isAutoOn}
                        onCheckedChange={(v) =>
                          dispatch({ type: "TOGGLE_FEATURE", feature, value: v })
                        }
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Legal / contact details */}
      <Card>
        <CardHeader>
          <CardTitle>פרטי ההסכם ואיש הקשר</CardTitle>
          <CardDescription>אופציונלי — לתיעוד ולפורטל ועד הדיירים</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="agreementReference">מספר חוזה / הפניה</Label>
            <Input
              id="agreementReference"
              value={state.agreementReference}
              disabled={isReadonly}
              onChange={(e) => dispatch({ type: "SET_FIELD", field: "agreementReference", value: e.target.value })}
              placeholder="CTR-2026-0042"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agreementSignedAt">תאריך חתימה</Label>
            <Input
              id="agreementSignedAt"
              type="date"
              value={state.agreementSignedAt}
              disabled={isReadonly}
              onChange={(e) => dispatch({ type: "SET_FIELD", field: "agreementSignedAt", value: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="committeeContactName">שם יו&quot;ר הועד</Label>
            <Input
              id="committeeContactName"
              value={state.committeeContactName}
              disabled={isReadonly}
              onChange={(e) => dispatch({ type: "SET_FIELD", field: "committeeContactName", value: e.target.value })}
              placeholder="ישראל ישראלי"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="committeeContactPhone">טלפון</Label>
            <Input
              id="committeeContactPhone"
              value={state.committeeContactPhone}
              disabled={isReadonly}
              onChange={(e) => dispatch({ type: "SET_FIELD", field: "committeeContactPhone", value: e.target.value })}
              placeholder="050-000-0000"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="committeeContactEmail">דוא&quot;ל</Label>
            <Input
              id="committeeContactEmail"
              type="email"
              value={state.committeeContactEmail}
              disabled={isReadonly}
              onChange={(e) => dispatch({ type: "SET_FIELD", field: "committeeContactEmail", value: e.target.value })}
              placeholder="vaad@building.co.il"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="notes">הערות</Label>
            <Textarea
              id="notes"
              rows={3}
              value={state.notes}
              disabled={isReadonly}
              onChange={(e) => dispatch({ type: "SET_FIELD", field: "notes", value: e.target.value })}
              placeholder="כל מידע נוסף רלוונטי להקמה..."
            />
          </div>
        </CardContent>
      </Card>

      {!isReadonly && (
        <>
          <Separator />
          <div className="flex justify-start">
            <Button size="lg" onClick={handleSubmit} disabled={isPending} className="gap-2 min-w-40">
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  יוצר משימות...
                </>
              ) : (
                "שמור וצור משימות ←"
              )}
            </Button>
          </div>
        </>
      )}

      {isReadonly && (
        <p className="text-sm text-muted-foreground text-center">
          ההגדרה נשמרה. עבור לשלב &ldquo;צינור ביצוע&rdquo; לשיבוץ ספקים.
        </p>
      )}
    </div>
  )
}
