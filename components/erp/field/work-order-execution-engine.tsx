"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Loader2,
  LogIn,
  MapPin,
  PenLine,
  ShieldCheck,
  Wrench,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  startWorkOrder,
  uploadVerificationPhoto,
  submitWorkOrderVerification,
} from "@/app/actions/field"
import type { WorkOrderDetail, OnboardingTaskDetail } from "@/app/(erp)/field/work-orders/[id]/page"

// ─────────────────────────────────────────────────────────────────────────────
// Step definitions
// ─────────────────────────────────────────────────────────────────────────────

type Step = "checkin" | "checklist" | "verification" | "complete"

const STEPS: { id: Step; label: string; icon: React.ElementType }[] = [
  { id: "checkin",      label: "כניסה לאתר",    icon: LogIn },
  { id: "checklist",   label: "רשימת ביצוע",   icon: ClipboardList },
  { id: "verification",label: "תיעוד ואימות",   icon: Camera },
  { id: "complete",    label: "סיום וחתימה",    icon: ShieldCheck },
]

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function resolveInitialStep(status: string): Step {
  if (status === "in_progress") return "checklist"
  if (status === "pending_verification" || status === "closed") return "complete"
  return "checkin"
}

const CATEGORY_LABELS: Record<string, string> = {
  electrical: "חשמל",
  plumbing: "אינסטלציה",
  hvac: "מיזוג ואוורור",
  security_access: "אבטחה ובקרת כניסה",
  structural: "קונסטרוקציה",
  cleaning: "ניקיון",
  elevator: "מעלית",
  iot_device: "ציוד IoT",
  general: "כללי",
  other: "אחר",
}

const PRIORITY_STYLE: Record<string, string> = {
  P1: "text-red-600 font-bold",
  P2: "text-orange-500 font-semibold",
  P3: "text-blue-600",
  P4: "text-slate-500",
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StepBar({ current }: { current: Step }) {
  const idx = STEPS.findIndex((s) => s.id === current)
  return (
    <div className="flex items-center gap-0 overflow-hidden rounded-xl border bg-white">
      {STEPS.map((step, i) => {
        const done = i < idx
        const active = i === idx
        const Icon = step.icon
        return (
          <div
            key={step.id}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-3 px-1 transition-colors",
              active && "bg-primary/10",
              done && "bg-emerald-50",
              !active && !done && "opacity-40"
            )}
          >
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full",
                active && "bg-primary text-primary-foreground",
                done && "bg-emerald-500 text-white",
                !active && !done && "bg-slate-100 text-slate-400"
              )}
            >
              {done ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
            </div>
            <span className="text-[10px] text-center leading-tight font-medium">
              {step.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function WoMeta({ wo }: { wo: WorkOrderDetail }) {
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <span className={cn("text-sm", PRIORITY_STYLE[wo.priority] ?? "text-slate-600")}>
            {wo.priority}
          </span>
          <span className="text-xs text-muted-foreground">{wo.wo_number}</span>
        </div>
        <CardTitle className="text-base leading-snug mt-1">{wo.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground pb-4">
        {wo.description && (
          <p className="text-sm text-foreground/80 leading-relaxed">{wo.description}</p>
        )}
        {wo.buildings && (
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span>{wo.buildings.name}{wo.buildings.city ? `, ${wo.buildings.city}` : ""}</span>
          </div>
        )}
        {wo.erp_physical_assets && (
          <div className="flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5 shrink-0" />
            <span>
              {wo.erp_physical_assets.name}
              {wo.erp_physical_assets.model ? ` — ${wo.erp_physical_assets.model}` : ""}
            </span>
          </div>
        )}
        <p className="text-xs">
          קטגוריה: <span className="font-medium text-foreground">{CATEGORY_LABELS[wo.category] ?? wo.category}</span>
        </p>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Check-in
// ─────────────────────────────────────────────────────────────────────────────

function CheckinStep({
  wo,
  onDone,
}: {
  wo: WorkOrderDetail
  onDone: () => void
}) {
  const [pending, startTransition] = React.useTransition()

  function handleCheckin() {
    startTransition(async () => {
      // Request GPS best-effort — not blocking if denied
      let lat: number | undefined
      let lng: number | undefined
      if ("geolocation" in navigator) {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              lat = pos.coords.latitude
              lng = pos.coords.longitude
              resolve()
            },
            () => resolve(), // silent on denial
            { timeout: 5000 }
          )
        })
      }

      const result = await startWorkOrder({ workOrderId: wo.id, lat, lng })
      if (!result.ok) {
        toast.error(result.error ?? "שגיאה בצ'ק-אין")
        return
      }
      toast.success("נרשמת בהצלחה — הזמן התחיל לרוץ")
      onDone()
    })
  }

  const isAlreadyStarted = wo.status === "in_progress"

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border bg-white p-5 space-y-3">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <LogIn className="w-5 h-5 text-primary" />
          כניסה לאתר העבודה
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          לחץ &quot;צ&#39;ק-אין&quot; כשהגעת לאתר. המיקום יירשם (אם הרשאה ניתנה) ושעת התחלה תוחתם.
        </p>

        {wo.buildings?.address_line1 && (
          <div className="rounded-xl bg-slate-50 border p-3 text-sm flex items-start gap-2">
            <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
            <span>{wo.buildings.address_line1}</span>
          </div>
        )}

        {wo.erp_physical_assets && (
          <div className="rounded-xl bg-slate-50 border p-3 text-sm space-y-1">
            <p className="font-medium">{wo.erp_physical_assets.name}</p>
            {wo.erp_physical_assets.serial_number && (
              <p className="text-muted-foreground text-xs">
                S/N: {wo.erp_physical_assets.serial_number}
              </p>
            )}
            {wo.erp_physical_assets.manufacturer && (
              <p className="text-muted-foreground text-xs">
                יצרן: {wo.erp_physical_assets.manufacturer}
              </p>
            )}
          </div>
        )}
      </div>

      {isAlreadyStarted ? (
        <Button className="w-full h-14 text-base rounded-2xl" onClick={onDone}>
          המשך לרשימת ביצוע
          <ChevronRight className="w-5 h-5 ms-1" />
        </Button>
      ) : (
        <Button
          className="w-full h-14 text-base rounded-2xl"
          onClick={handleCheckin}
          disabled={pending}
        >
          {pending && <Loader2 className="w-5 h-5 me-2 animate-spin" />}
          {pending ? "נרשם..." : "✓ צ'ק-אין — אני באתר"}
        </Button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Task Checklist
// ─────────────────────────────────────────────────────────────────────────────

function ChecklistStep({
  wo,
  onboardingTask,
  onDone,
}: {
  wo: WorkOrderDetail
  onboardingTask: OnboardingTaskDetail | null
  onDone: () => void
}) {
  // Derive checklist items: from onboarding template or from asset hardware_meta
  const items: string[] = React.useMemo(() => {
    if (onboardingTask?.checklist_items?.length) return onboardingTask.checklist_items

    // Fallback: generate basic steps from hardware_meta if available
    const meta = wo.erp_physical_assets?.hardware_meta ?? {}
    const hints: string[] = []
    if (meta.provider) hints.push(`בדוק חיבור ${String(meta.provider)} מאומת`)
    if (meta.mac)      hints.push(`אמת כתובת MAC: ${String(meta.mac)}`)
    if (wo.category === "electrical")     hints.push("בדוק מוליכים חשפים וחיבורי נחושת")
    if (wo.category === "plumbing")       hints.push("בדוק דליפות וחיבורי צינורות")
    if (wo.category === "hvac")           hints.push("נקה פילטרים ובדוק לחץ גז")
    if (wo.category === "security_access") hints.push("אמת פעולת מנגנון הנעילה")

    return hints.length ? hints : ["בצע את העבודה לפי נהלי החברה", "תעד ממצאים חריגים"]
  }, [onboardingTask, wo])

  const [checked, setChecked] = React.useState<Set<number>>(() => new Set())

  const toggleItem = (idx: number) => {
    setChecked((prev) => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  const allDone = items.every((_, i) => checked.has(i))

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border bg-white p-5 space-y-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary" />
          {onboardingTask ? onboardingTask.task_name : "רשימת ביצוע"}
        </h2>

        {onboardingTask?.task_description && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {onboardingTask.task_description}
          </p>
        )}

        <ul className="space-y-3">
          {items.map((item, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => toggleItem(i)}
                className={cn(
                  "w-full flex items-start gap-3 rounded-xl border p-3.5 text-start text-sm transition-colors",
                  "min-h-[52px]", // Touch-friendly minimum height
                  checked.has(i)
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                )}
              >
                <div
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    checked.has(i) ? "border-emerald-500 bg-emerald-500" : "border-slate-300"
                  )}
                >
                  {checked.has(i) && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                </div>
                <span className={cn(checked.has(i) && "line-through opacity-70")}>{item}</span>
              </button>
            </li>
          ))}
        </ul>

        <p className="text-xs text-muted-foreground text-center">
          {checked.size} / {items.length} פריטים הושלמו
        </p>
      </div>

      <Button
        className="w-full h-14 text-base rounded-2xl"
        disabled={!allDone}
        onClick={onDone}
      >
        {allDone ? "המשך לתיעוד ←" : `סמן את כל ${items.length} הפריטים להמשך`}
      </Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Verification (photo upload simulation)
// ─────────────────────────────────────────────────────────────────────────────

function VerificationStep({
  wo,
  onDone,
}: {
  wo: WorkOrderDetail
  onDone: () => void
}) {
  const [photoUrl, setPhotoUrl] = React.useState(wo.after_photo_url ?? "")
  const [photoSaved, setPhotoSaved] = React.useState(!!wo.after_photo_url)
  const [pending, startTransition] = React.useTransition()
  const [submitting, startSubmitTransition] = React.useTransition()

  function handleSavePhoto() {
    if (!photoUrl.trim()) {
      toast.error("הכנס כתובת URL של התמונה")
      return
    }
    startTransition(async () => {
      const result = await uploadVerificationPhoto({ workOrderId: wo.id, photoUrl: photoUrl.trim() })
      if (!result.ok) {
        toast.error(result.error ?? "שגיאה בשמירת התמונה")
        return
      }
      toast.success("תמונת אימות נשמרה")
      setPhotoSaved(true)
    })
  }

  function handleSubmit() {
    startSubmitTransition(async () => {
      const result = await submitWorkOrderVerification({ workOrderId: wo.id })
      if (!result.ok) {
        toast.error(result.error ?? "שגיאה בהגשת אימות")
        return
      }
      toast.success("פקודת עבודה הוגשה לאישור")
      onDone()
    })
  }

  const verificationMethodLabel: Record<string, string> = {
    tenant_feedback: "אישור דייר",
    gps_checkin:     "GPS (אישור אוטומטי)",
    sensor_restore:  "שחזור חיישן",
    manual_admin:    "אישור מנהל",
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border bg-white p-5 space-y-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Camera className="w-5 h-5 text-primary" />
          תיעוד עבודה
        </h2>

        {wo.verification_method && (
          <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
            שיטת אימות:{" "}
            <strong>{verificationMethodLabel[wo.verification_method] ?? wo.verification_method}</strong>
          </div>
        )}

        {/* Photo URL field — in production this triggers Supabase Storage upload */}
        <div className="space-y-2">
          <label htmlFor="photo-url" className="text-sm font-medium">
            URL תמונת לאחר העבודה
          </label>
          <div className="flex gap-2">
            <input
              id="photo-url"
              type="url"
              value={photoUrl}
              onChange={(e) => {
                setPhotoUrl(e.target.value)
                setPhotoSaved(false)
              }}
              placeholder="https://storage.supabase.co/..."
              className={cn(
                "flex-1 rounded-xl border px-3 py-3 text-sm outline-none",
                "focus:ring-2 focus:ring-primary/30 focus:border-primary",
                "min-h-[48px]" // Touch-friendly
              )}
            />
            <Button
              variant="outline"
              className="rounded-xl min-h-[48px] px-4"
              onClick={handleSavePhoto}
              disabled={pending || photoSaved}
            >
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : photoSaved ? "✓" : "שמור"}
            </Button>
          </div>
          {photoSaved && (
            <p className="text-xs text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> תמונה נשמרה
            </p>
          )}
        </div>

        {/* Preview */}
        {photoSaved && photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt="תמונת אחרי"
            className="w-full rounded-xl object-cover max-h-48 border"
            onError={(e) => { e.currentTarget.style.display = "none" }}
          />
        )}
      </div>

      <Button
        className="w-full h-14 text-base rounded-2xl"
        onClick={handleSubmit}
        disabled={submitting}
      >
        {submitting && <Loader2 className="w-5 h-5 me-2 animate-spin" />}
        {submitting ? "שולח..." : "הגש לאישור ←"}
      </Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — Complete & Sign-off
// ─────────────────────────────────────────────────────────────────────────────

function CompleteStep({ wo }: { wo: WorkOrderDetail }) {
  const router = useRouter()
  const isClosed = wo.status === "closed"

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border bg-white p-5 flex flex-col items-center text-center gap-4">
        <div
          className={cn(
            "w-16 h-16 rounded-full flex items-center justify-center",
            isClosed ? "bg-emerald-100" : "bg-purple-100"
          )}
        >
          {isClosed ? (
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          ) : (
            <PenLine className="w-8 h-8 text-purple-600" />
          )}
        </div>

        <div>
          <h2 className="text-lg font-bold">
            {isClosed ? "פקודת עבודה סגורה" : "ממתין לאישור מנהל"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            {isClosed
              ? "העבודה אומתה ונסגרה. כל הכבוד!"
              : "הגשתך התקבלה. מנהל הנכס יאמת ויסגור את הפקודה."}
          </p>
        </div>

        <div className="w-full rounded-xl bg-slate-50 border p-4 text-start space-y-1.5 text-sm">
          <p>
            <span className="text-muted-foreground">מספר פקודה: </span>
            <span className="font-medium">{wo.wo_number}</span>
          </p>
          <p>
            <span className="text-muted-foreground">כותרת: </span>
            <span className="font-medium">{wo.title}</span>
          </p>
          {wo.actual_start_at && (
            <p>
              <span className="text-muted-foreground">התחלה בפועל: </span>
              <span className="font-medium">
                {new Date(wo.actual_start_at).toLocaleString("he-IL")}
              </span>
            </p>
          )}
        </div>
      </div>

      <Button
        variant="outline"
        className="w-full h-14 text-base rounded-2xl"
        onClick={() => router.push("/erp/field")}
      >
        חזרה ללוח השטח
      </Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main execution engine
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  workOrder: WorkOrderDetail
  onboardingTask: OnboardingTaskDetail | null
}

export function WorkOrderExecutionEngine({ workOrder, onboardingTask }: Props) {
  const [step, setStep] = React.useState<Step>(() => resolveInitialStep(workOrder.status))

  return (
    <main className="min-h-screen bg-slate-50 pb-24" dir="rtl">
      {/* ── Mobile header ── */}
      <header className="sticky top-0 z-10 bg-white border-b shadow-sm px-4 py-3">
        <p className="text-xs text-muted-foreground">{workOrder.wo_number}</p>
        <h1 className="text-sm font-bold leading-tight line-clamp-1">{workOrder.title}</h1>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* Step indicator */}
        <StepBar current={step} />

        {/* Work order meta — always visible */}
        <WoMeta wo={workOrder} />

        {/* Active step content */}
        {step === "checkin" && (
          <CheckinStep
            wo={workOrder}
            onDone={() => setStep("checklist")}
          />
        )}

        {step === "checklist" && (
          <ChecklistStep
            wo={workOrder}
            onboardingTask={onboardingTask}
            onDone={() => setStep("verification")}
          />
        )}

        {step === "verification" && (
          <VerificationStep
            wo={workOrder}
            onDone={() => setStep("complete")}
          />
        )}

        {step === "complete" && (
          <CompleteStep wo={workOrder} />
        )}
      </div>
    </main>
  )
}
