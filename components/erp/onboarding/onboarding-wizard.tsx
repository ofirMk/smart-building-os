"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { CheckCircle2, Settings, GitFork, BarChart3 } from "lucide-react"
import { cn } from "@/lib/utils"

import { AgreementConfigurator } from "./agreement-configurator"
import { PipelineView } from "./pipeline-view"
import { ReadinessTracker } from "./readiness-tracker"
import type { ErpOnboardingConfig, ErpOnboardingTaskInstance } from "@/types/onboarding"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type WizardStep = "configure" | "pipeline" | "track"

interface OnboardingWizardProps {
  building: { id: string; name: string; city: string }
  initialConfig: ErpOnboardingConfig | null
  initialTasks: ErpOnboardingTaskInstance[]
  suppliers: { id: string; name: string; supplier_kind: string }[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Step metadata
// ─────────────────────────────────────────────────────────────────────────────

const STEPS: { id: WizardStep; label: string; Icon: React.ElementType }[] = [
  { id: "configure", label: "הגדרת הסכם", Icon: Settings },
  { id: "pipeline",  label: "צינור ביצוע",  Icon: GitFork },
  { id: "track",    label: "מעקב מוכנות",  Icon: BarChart3 },
]

function resolveInitialStep(
  config: ErpOnboardingConfig | null,
  tasks: ErpOnboardingTaskInstance[]
): WizardStep {
  if (!config || config.status === "draft") return "configure"
  if (tasks.length === 0 || config.status === "tasks_generated") return "pipeline"
  return "track"
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function OnboardingWizard({
  building,
  initialConfig,
  initialTasks,
  suppliers,
}: OnboardingWizardProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const stepParam = searchParams.get("step") as WizardStep | null
  const defaultStep = resolveInitialStep(initialConfig, initialTasks)
  const activeStep: WizardStep = stepParam && STEPS.some((s) => s.id === stepParam)
    ? stepParam
    : defaultStep

  function goToStep(step: WizardStep) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("step", step)
    router.push(`?${params.toString()}`)
  }

  function onConfigCreated() {
    goToStep("pipeline")
  }

  function onTasksReady() {
    goToStep("track")
  }

  // Determine step accessibility
  const hasConfig = !!initialConfig && initialConfig.status !== "draft"
  const hasTasks  = initialTasks.length > 0

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Page header */}
      <div className="border-b bg-card">
        <div className="container max-w-5xl py-5">
          <p className="text-xs text-muted-foreground mb-0.5">הקמת בניין חכם</p>
          <h1 className="text-xl font-bold">{building.name}</h1>
          {building.city && (
            <p className="text-sm text-muted-foreground">{building.city}</p>
          )}
        </div>
      </div>

      {/* Step indicator */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="container max-w-5xl">
          <nav className="flex" aria-label="שלבי האשף">
            {STEPS.map((step, index) => {
              const isActive   = activeStep === step.id
              const isComplete = (
                (step.id === "configure" && hasConfig) ||
                (step.id === "pipeline"  && hasTasks) ||
                (step.id === "track"     && initialConfig?.status === "completed")
              )
              const isAccessible = (
                step.id === "configure" ||
                (step.id === "pipeline" && hasConfig) ||
                (step.id === "track"    && hasTasks)
              )

              return (
                <button
                  key={step.id}
                  onClick={() => isAccessible && goToStep(step.id)}
                  disabled={!isAccessible}
                  className={cn(
                    "flex items-center gap-2 px-5 py-4 text-sm font-medium border-b-2 transition-colors",
                    isActive
                      ? "border-primary text-primary"
                      : isAccessible
                        ? "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
                        : "border-transparent text-muted-foreground/40 cursor-not-allowed"
                  )}
                >
                  {isComplete && !isActive ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <step.Icon className={cn("w-4 h-4 shrink-0", isActive ? "text-primary" : "")} />
                  )}
                  <span className="hidden sm:inline">{step.label}</span>
                  <span className="sm:hidden">{index + 1}</span>
                </button>
              )
            })}
          </nav>
        </div>
      </div>

      {/* Step content */}
      <div className="container max-w-5xl py-8">
        {activeStep === "configure" && (
          <AgreementConfigurator
            buildingId={building.id}
            existingConfig={initialConfig}
            onSuccess={onConfigCreated}
          />
        )}

        {activeStep === "pipeline" && initialConfig && (
          <PipelineView
            config={initialConfig}
            initialTasks={initialTasks}
            suppliers={suppliers}
            onAllAssigned={onTasksReady}
          />
        )}

        {activeStep === "track" && initialConfig && (
          <ReadinessTracker
            config={initialConfig}
            tasks={initialTasks}
          />
        )}
      </div>
    </div>
  )
}
