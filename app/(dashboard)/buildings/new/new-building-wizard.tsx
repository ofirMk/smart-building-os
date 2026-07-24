"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Building2, MapPin, Layers, FileText, Users, Zap,
  ChevronLeft, ChevronRight, Check, PlugZap, Lock,
  Camera, Gauge, Wifi, Leaf, Bug, Sparkles
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { createBuilding } from "./actions"
import type { FeaturesConfig } from "./actions"

// ─── Types ────────────────────────────────────────────────────────────────────

const STEP_COUNT = 5

const STEP_META = [
  { label: "פרטי הנכס",       Icon: MapPin      },
  { label: "מאפיינים",         Icon: Layers      },
  { label: "חוזה ניהול",       Icon: FileText    },
  { label: "ועד הדיירים",      Icon: Users       },
  { label: "שירותים חכמים",    Icon: Zap         },
]

const REGIONS = ["מרכז", "ירושלים", "דרום", "צפון", "חיפה", "שפלה", "שרון", "אחר"]

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  full_maintenance: "תחזוקה מלאה",
  basic_management: "ניהול בסיסי",
  premium: "פרמיום",
  custom: "מותאם אישית",
}

type FeatureKey = keyof FeaturesConfig

const FEATURE_DEFS: { key: FeatureKey; label: string; desc: string; Icon: React.ElementType }[] = [
  { key: "ev_charging",          label: "טעינת EV",          desc: "עמדות טעינה חשמלית לרכב",     Icon: PlugZap  },
  { key: "elevator_monitoring",  label: "ניטור מעלית",        desc: "SLA P0 + התראות מניעתיות",     Icon: Building2 },
  { key: "pump_monitoring",      label: "ניטור משאבות",       desc: "ROI 4.1x תחזוקה מונעת",        Icon: Gauge    },
  { key: "smart_locks",          label: "מנעולים חכמים",      desc: "גישה מבוקרת + לוג כניסות",     Icon: Lock     },
  { key: "cctv",                 label: "מצלמות אבטחה",       desc: "ניטור 24/7 + אחסון ענן",       Icon: Camera   },
  { key: "energy_metering",      label: "מדידת אנרגיה",       desc: "AMI חכם + דוחות צריכה",       Icon: Zap      },
  { key: "iot_gateway",          label: "שער IoT",             desc: "Auto-ON עם כל תכונת חיישן",   Icon: Wifi     },
  { key: "cleaning",             label: "ניקיון",              desc: "ניהול ספקי ניקיון",            Icon: Sparkles },
  { key: "gardening",            label: "גינון",               desc: "תחזוקת גינות ומרפסות",         Icon: Leaf     },
  { key: "pest_control",         label: "הדברה",               desc: "לוח טיפולים תקופתי",           Icon: Bug      },
]

const DEFAULT_FEATURES: FeaturesConfig = {
  ev_charging: false, elevator_monitoring: false, pump_monitoring: false,
  smart_locks: false, cctv: false, energy_metering: false, iot_gateway: false,
  cleaning: false, gardening: false, pest_control: false,
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0" aria-label="שלבי האשף">
      {STEP_META.map((s, i) => {
        const done    = i < current
        const active  = i === current
        return (
          <div key={i} className="flex flex-1 items-center gap-0">
            <div className="flex flex-col items-center gap-1">
              <div className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-all",
                done   && "border-emerald-500 bg-emerald-500 text-white",
                active && "border-primary bg-primary text-white shadow-md",
                !done && !active && "border-border bg-muted text-muted-foreground",
              )}>
                {done ? <Check className="size-4" /> : <s.Icon className="size-3.5" />}
              </div>
              <span className={cn(
                "hidden text-[9px] font-semibold uppercase tracking-wide sm:block whitespace-nowrap",
                active ? "text-primary" : done ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
              )}>
                {s.label}
              </span>
            </div>
            {i < STEP_COUNT - 1 && (
              <div className={cn(
                "h-0.5 flex-1 transition-all",
                i < current ? "bg-emerald-500" : "bg-border"
              )} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Field helpers ────────────────────────────────────────────────────────────

function Field({ label, required, children, hint }: {
  label: string; required?: boolean; children: React.ReactNode; hint?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="mr-1 text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function ToggleCard({
  active, onClick, label, desc, Icon,
}: { active: boolean; onClick: () => void; label: string; desc: string; Icon: React.ElementType }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3 text-start transition-all",
        active
          ? "border-primary/60 bg-primary/8 ring-1 ring-primary/30"
          : "border-border hover:border-border/80 hover:bg-muted/30"
      )}
    >
      <div className={cn(
        "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg",
        active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
      )}>
        <Icon className="size-4" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className={cn("text-sm font-semibold", active && "text-primary")}>{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <div className={cn(
        "mr-auto mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-all",
        active ? "border-primary bg-primary" : "border-muted-foreground/30"
      )}>
        {active && <Check className="size-3 text-white" />}
      </div>
    </button>
  )
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export function NewBuildingWizard() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [step, setStep] = useState(0)

  // --- Form state ---
  const [name, setName]               = useState("")
  const [address1, setAddress1]       = useState("")
  const [address2, setAddress2]       = useState("")
  const [city, setCity]               = useState("")
  const [region, setRegion]           = useState("")
  const [postalCode, setPostalCode]   = useState("")
  const [totalFloors, setTotalFloors] = useState("")
  const [plannedUnits, setPlannedUnits] = useState("")
  const [yearBuilt, setYearBuilt]     = useState("")
  const [contractType, setContractType] = useState<"full_maintenance" | "basic_management" | "premium" | "custom">("full_maintenance")
  const [agreementRef, setAgreementRef] = useState("")
  const [agreementDate, setAgreementDate] = useState("")
  const [committeeName, setCommitteeName] = useState("")
  const [committeePhone, setCommitteePhone] = useState("")
  const [committeeEmail, setCommitteeEmail] = useState("")
  const [features, setFeatures]       = useState<FeaturesConfig>(DEFAULT_FEATURES)

  function toggleFeature(key: FeatureKey) {
    setFeatures((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // --- Step validation ---
  function canNext(): boolean {
    if (step === 0) return name.trim().length > 0 && city.trim().length > 0
    return true
  }

  // --- Submit ---
  function handleSubmit() {
    startTransition(async () => {
      const result = await createBuilding({
        name, address_line1: address1, address_line2: address2,
        city, region, postal_code: postalCode, site_id: "",
        total_floors:  totalFloors  ? Number(totalFloors)  : null,
        planned_units: plannedUnits ? Number(plannedUnits) : null,
        year_built:    yearBuilt    ? Number(yearBuilt)    : null,
        contract_type: contractType,
        agreement_reference: agreementRef,
        agreement_signed_at: agreementDate,
        committee_contact_name: committeeName,
        committee_contact_phone: committeePhone,
        committee_contact_email: committeeEmail,
        features,
      })

      if (result.ok) {
        toast.success("הבניין נוצר בהצלחה!")
        router.push(`/buildings/${result.buildingId}`)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="flex min-h-screen flex-col bg-background" dir="rtl">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="mx-auto max-w-2xl px-4 py-5">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <Building2 className="size-5" aria-hidden />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight">הקמת בניין חדש</h1>
              <p className="text-xs text-muted-foreground">אשף הגדרה בשלושה דקות</p>
            </div>
          </div>
        </div>
      </div>

      {/* Step bar */}
      <div className="sticky top-0 z-10 border-b bg-card/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <StepBar current={step} />
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">

          {/* ── Step 0: פרטי הנכס ─────────────────────────────── */}
          {step === 0 && (
            <div className="flex flex-col gap-5">
              <SectionTitle icon={MapPin} title="פרטי הנכס" />
              <Field label="שם הבניין" required>
                <Input
                  placeholder="מגדל עיר היין - שלב א"
                  value={name} onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="רחוב + מספר">
                  <Input placeholder="רחוב הרב קוק 12"
                    value={address1} onChange={(e) => setAddress1(e.target.value)} />
                </Field>
                <Field label="כניסה / בניין">
                  <Input placeholder="כניסה א"
                    value={address2} onChange={(e) => setAddress2(e.target.value)} />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="עיר" required>
                  <Input placeholder="תל אביב"
                    value={city} onChange={(e) => setCity(e.target.value)} />
                </Field>
                <Field label="אזור">
                  <Select value={region} onValueChange={(v) => { if (v != null) setRegion(v) }}>
                    <SelectTrigger><SelectValue placeholder="בחר אזור" /></SelectTrigger>
                    <SelectContent>
                      {REGIONS.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="מיקוד">
                  <Input placeholder="6120101"
                    value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
                </Field>
              </div>
            </div>
          )}

          {/* ── Step 1: מאפייני הבניין ────────────────────────── */}
          {step === 1 && (
            <div className="flex flex-col gap-5">
              <SectionTitle icon={Layers} title="מאפייני הבניין" />
              <div className="grid grid-cols-3 gap-4">
                <Field label="מספר קומות" hint="כולל קומת קרקע">
                  <Input type="number" min="1" max="120" placeholder="14"
                    value={totalFloors} onChange={(e) => setTotalFloors(e.target.value)} />
                </Field>
                <Field label="יחידות מתוכנן" hint="סה״כ דירות">
                  <Input type="number" min="1" placeholder="84"
                    value={plannedUnits} onChange={(e) => setPlannedUnits(e.target.value)} />
                </Field>
                <Field label="שנת בניה" hint="טופס 4">
                  <Input type="number" min="1900" max="2030" placeholder="2022"
                    value={yearBuilt} onChange={(e) => setYearBuilt(e.target.value)} />
                </Field>
              </div>
              <InfoBox>
                שדות אלה אינם חובה. ניתן לעדכן בכל עת מדף הפרטים של הבניין.
              </InfoBox>
            </div>
          )}

          {/* ── Step 2: חוזה ניהול ───────────────────────────── */}
          {step === 2 && (
            <div className="flex flex-col gap-5">
              <SectionTitle icon={FileText} title="חוזה ניהול" />
              <Field label="סוג חוזה">
                <Select value={contractType} onValueChange={(v) => { if (v != null) setContractType(v as typeof contractType) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CONTRACT_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="מספר חוזה">
                  <Input placeholder="CONTRACT-2026-001"
                    value={agreementRef} onChange={(e) => setAgreementRef(e.target.value)} />
                </Field>
                <Field label="תאריך תחילת ניהול">
                  <Input type="date"
                    value={agreementDate} onChange={(e) => setAgreementDate(e.target.value)} />
                </Field>
              </div>
              <InfoBox>
                פרטי החוזה ישמשו ליצירת משימות הקמה אוטומטיות בשלב הבא.
              </InfoBox>
            </div>
          )}

          {/* ── Step 3: ועד הדיירים ──────────────────────────── */}
          {step === 3 && (
            <div className="flex flex-col gap-5">
              <SectionTitle icon={Users} title="ועד הדיירים" />
              <Field label="שם איש קשר ועד">
                <Input placeholder="יוסי כהן"
                  value={committeeName} onChange={(e) => setCommitteeName(e.target.value)} />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="טלפון ועד">
                  <Input type="tel" placeholder="050-1234567" dir="ltr"
                    value={committeePhone} onChange={(e) => setCommitteePhone(e.target.value)} />
                </Field>
                <Field label="אימייל ועד">
                  <Input type="email" placeholder="vaad@building.co.il" dir="ltr"
                    value={committeeEmail} onChange={(e) => setCommitteeEmail(e.target.value)} />
                </Field>
              </div>
              <InfoBox>
                פרטי הועד ישמשו לתקשורת אוטומטית ולהפקת דוחות חודשיים.
              </InfoBox>
            </div>
          )}

          {/* ── Step 4: שירותים חכמים ────────────────────────── */}
          {step === 4 && (
            <div className="flex flex-col gap-4">
              <SectionTitle icon={Zap} title="שירותים חכמים" />
              <p className="text-sm text-muted-foreground -mt-2">
                בחר את השירותים שיופעלו עבור הבניין. ניתן לשנות בכל עת.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {FEATURE_DEFS.map(({ key, label, desc, Icon }) => (
                  <ToggleCard
                    key={key}
                    active={features[key]}
                    onClick={() => toggleFeature(key)}
                    label={label}
                    desc={desc}
                    Icon={Icon}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="mt-6 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="lg"
            onClick={() => step > 0 ? setStep(step - 1) : router.push("/buildings")}
            disabled={isPending}
            className="gap-2"
          >
            <ChevronRight className="size-4" aria-hidden />
            {step === 0 ? "ביטול" : "חזור"}
          </Button>

          <div className="flex items-center gap-1">
            {Array.from({ length: STEP_COUNT }).map((_, i) => (
              <div key={i} className={cn(
                "rounded-full transition-all",
                i === step ? "h-2 w-5 bg-primary" : i < step ? "size-2 bg-emerald-500" : "size-2 bg-border"
              )} />
            ))}
          </div>

          {step < STEP_COUNT - 1 ? (
            <Button
              size="lg"
              onClick={() => setStep(step + 1)}
              disabled={!canNext()}
              className="gap-2"
            >
              הבא
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={handleSubmit}
              disabled={isPending || !canNext()}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isPending ? "יוצר בניין..." : "צור בניין"}
              <Building2 className="size-4" aria-hidden />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function SectionTitle({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-border/50 pb-4">
      <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-4" aria-hidden />
      </div>
      <h2 className="text-base font-bold tracking-tight">{title}</h2>
    </div>
  )
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-blue-500/20 bg-blue-500/8 px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
      {children}
    </div>
  )
}
