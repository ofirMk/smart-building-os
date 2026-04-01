import type { Metadata } from "next"

import { LoginForm } from "@/app/login/login-form"

export const metadata: Metadata = {
  title: "התחברות",
  description: "התחברות לבניין חכם — מערכת ניהול נכסים",
}

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-16">
      {/* רקע */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(59,130,246,0.22),transparent_55%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_100%_100%,rgba(99,102,241,0.12),transparent_50%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.2),rgba(0,0,0,0.65))]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:48px_48px]"
        aria-hidden
      />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-8">
        <div className="space-y-1 text-center">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            בניין חכם
          </h1>
          <p className="text-sm text-muted-foreground">
            מערכת ניהול נכסים ארגונית
          </p>
        </div>

        <LoginForm />
      </div>
    </div>
  )
}
