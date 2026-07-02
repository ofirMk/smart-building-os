import {
  type ErpOnboardingTaskInstance,
  type OnboardingPhase,
  type OnboardingReadiness,
} from "@/types/onboarding"

/**
 * Pure utility — computes the readiness score from a list of task instances.
 * Kept outside "use server" actions so it can be called from client components.
 */
export function computeReadiness(tasks: ErpOnboardingTaskInstance[]): OnboardingReadiness {
  const phases: OnboardingPhase[] = ["setup", "commissioning", "handover"]
  const byPhase = Object.fromEntries(
    phases.map((p) => [p, { total: 0, done: 0 }])
  ) as Record<OnboardingPhase, { total: number; done: number }>

  let mandatoryTotal = 0
  let doneCount = 0
  const blockingTasks: ErpOnboardingTaskInstance[] = []

  for (const t of tasks) {
    byPhase[t.phase].total++
    if (t.status === "done") byPhase[t.phase].done++

    if (t.is_mandatory) {
      mandatoryTotal++
      if (t.status === "done") {
        doneCount++
      } else if (t.status !== "skipped") {
        blockingTasks.push(t)
      }
    }
  }

  const scorePct = mandatoryTotal === 0 ? 100 : Math.round((doneCount / mandatoryTotal) * 100)
  return { scorePct, doneCount, mandatoryTotal, byPhase, blockingTasks }
}
