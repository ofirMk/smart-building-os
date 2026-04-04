import type { Metadata } from "next"

import { OnboardingSandboxClient } from "./onboarding-sandbox-client"
import { getSandboxOnboardingState } from "@/lib/marker-ofek/onboarding-unlock-actions"

export const metadata: Metadata = {
  title: "הכשרת Diamond — ארגז חול",
}

export default async function OnboardingSandboxPage() {
  const { isQualified } = await getSandboxOnboardingState()

  return <OnboardingSandboxClient isQualified={isQualified} />
}
