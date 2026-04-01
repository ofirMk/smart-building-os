"use client"

import * as React from "react"
import { useTransition } from "react"
import { toast } from "sonner"

import { login, signup } from "./actions"
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
import { cn } from "@/lib/utils"

type Mode = "login" | "signup"

export function LoginForm() {
  const [mode, setMode] = React.useState<Mode>("login")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const formId = "auth-form"

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    setError(null)

    startTransition(async () => {
      if (mode === "login") {
        const result = await login(fd)
        if (!result.ok) {
          setError(result.error)
          toast.error(result.error)
          return
        }
        return
      }

      const result = await signup(fd)
      if (!result.ok) {
        setError(result.error)
        toast.error(result.error)
        return
      }
      if (result.pendingVerification) {
        const msg =
          "נשלח אליכם מייל לאימות הכתובת. לאחר האישור תוכלו להתחבר."
        toast.success(msg, { duration: 8_000 })
        setError(null)
        form.reset()
        setMode("login")
      }
    })
  }

  return (
    <Card
      className={cn(
        "w-full max-w-md border-border/50 bg-card/80 shadow-2xl shadow-black/40 ring-1 ring-white/5 backdrop-blur-xl",
        "supports-[backdrop-filter]:bg-card/70"
      )}
    >
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-xl font-semibold tracking-tight">
          {mode === "login" ? "התחברות למערכת" : "יצירת חשבון מנהל"}
        </CardTitle>
        <CardDescription className="text-pretty">
          {mode === "login"
            ? "הזינו פרטי גישה כדי לעבור ללוח הבקרה."
            : "הרשמה לחשבון מנהל — לאחר האישור תוכלו לנהל נכסים וקריאות שירות."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/50 bg-destructive/15 px-3 py-2.5 text-start text-sm text-destructive"
          >
            {error}
          </div>
        ) : null}

        <form
          id={formId}
          method="post"
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="email">אימייל</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="name@company.co.il"
              disabled={pending}
              className="text-start"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">סיסמה</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              required
              minLength={mode === "signup" ? 6 : undefined}
              placeholder="••••••••"
              disabled={pending}
              className="text-start"
            />
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <Button
              type="submit"
              className="w-full"
              disabled={pending}
              size="default"
            >
              {pending
                ? mode === "login"
                  ? "מתחברים…"
                  : "יוצרים חשבון…"
                : mode === "login"
                  ? "התחברות"
                  : "יצירת חשבון מנהל"}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={pending}
              onClick={() => {
                setError(null)
                setMode((m) => (m === "login" ? "signup" : "login"))
              }}
            >
              {mode === "login"
                ? "יצירת חשבון מנהל"
                : "חזרה להתחברות"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
