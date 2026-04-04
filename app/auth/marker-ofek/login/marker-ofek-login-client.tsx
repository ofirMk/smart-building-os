"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { Building2, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { markerOfekPasswordLogin } from "@/app/auth/marker-ofek/actions"
import type { OrganizationBrandingSnapshot } from "@/lib/marker-ofek/organization-branding-public"
import { submitMoAccessRequest } from "@/lib/marker-ofek/mo-access-request-actions"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn, formatError } from "@/lib/utils"

type Mode = "signin" | "request"

export function MarkerOfekLoginClient({
  branding,
}: {
  branding: OrganizationBrandingSnapshot
}) {
  const searchParams = useSearchParams()
  const [mode, setMode] = React.useState<Mode>("signin")
  const [pending, startTransition] = React.useTransition()
  const [oauthBusy, setOauthBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [rememberMe, setRememberMe] = React.useState(true)

  const [reqName, setReqName] = React.useState("")
  const [reqRole, setReqRole] = React.useState("")
  const [reqProject, setReqProject] = React.useState("")
  const [reqMobile, setReqMobile] = React.useState("")
  const [reqEmail, setReqEmail] = React.useState("")
  const [reqCompany, setReqCompany] = React.useState("")

  React.useEffect(() => {
    const err = searchParams.get("error")
    if (err === "oauth") {
      setError("התחברות SSO נכשלה. נסו שוב או פנו למנהל המערכת.")
    } else if (err === "missing_code") {
      setError("חסר קוד אימות — חזרו ממסך הספק או נסו שוב.")
    } else if (err === "config") {
      setError("המערכת לא מוגדרת (Supabase).")
    }
  }, [searchParams])

  async function startOAuth(provider: "google" | "azure") {
    setError(null)
    setOauthBusy(provider)
    try {
      const supabase = createSupabaseBrowserClient()
      const origin = window.location.origin
      const { data, error: oErr } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${origin}/auth/callback`,
          queryParams:
            provider === "google"
              ? { prompt: "select_account" }
              : { prompt: "select_account" },
        },
      })
      if (oErr) {
        toast.error(oErr.message)
        setError(oErr.message)
        return
      }
      if (data.url) {
        window.location.assign(data.url)
      }
    } catch (e) {
      toast.error(formatError(e))
      setError(formatError(e))
    } finally {
      setOauthBusy(null)
    }
  }

  function onLoginSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    if (rememberMe) {
      fd.set("remember_me", "1")
    }
    setError(null)
    startTransition(async () => {
      const res = await markerOfekPasswordLogin(fd)
      if (!res.ok) {
        setError(res.error)
        toast.error(res.error)
      }
    })
  }

  async function onRequestSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await submitMoAccessRequest({
        full_name: reqName,
        role_requested: reqRole,
        requested_project_name: reqProject,
        project_id: null,
        mobile: reqMobile,
        email: reqEmail || null,
        company: reqCompany || null,
      })
      if (!res.ok) {
        setError(res.error)
        toast.error(res.error)
        return
      }
      toast.success("הבקשה נשלחה. צוות ההנהלה יחזור אליך.")
      setReqName("")
      setReqRole("")
      setReqProject("")
      setReqMobile("")
      setReqEmail("")
      setReqCompany("")
      setMode("signin")
    })
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex size-16 items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          {branding.brandLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.brandLogoUrl}
              alt=""
              className="size-full object-contain p-2"
            />
          ) : (
            <Building2 className="size-9 text-indigo-950" aria-hidden />
          )}
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-indigo-950">
            {branding.organizationName}
          </h1>
          <p className="mt-2 max-w-sm text-pretty font-currency-mono text-[12px] leading-relaxed text-indigo-900/80">
            {branding.slogan}
          </p>
          <p className="mt-2 font-currency-mono text-[11px] text-slate-500">
            כניסה מאובטחת · ERP ארגוני
          </p>
        </div>
      </div>

      <div className="flex rounded-xl border border-slate-100 bg-slate-50/50 p-1">
        <button
          type="button"
          className={cn(
            "flex-1 rounded-lg py-2 text-sm font-medium transition-colors",
            mode === "signin"
              ? "bg-white text-indigo-950 shadow-sm"
              : "text-slate-500"
          )}
          onClick={() => {
            setMode("signin")
            setError(null)
          }}
        >
          התחברות
        </button>
        <button
          type="button"
          className={cn(
            "flex-1 rounded-lg py-2 text-sm font-medium transition-colors",
            mode === "request"
              ? "bg-white text-indigo-950 shadow-sm"
              : "text-slate-500"
          )}
          onClick={() => {
            setMode("request")
            setError(null)
          }}
        >
          בקשת גישה
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 font-currency-mono text-sm text-red-900"
        >
          {error}
        </p>
      ) : null}

      {mode === "signin" ? (
        <div className="space-y-6">
          <div className="grid gap-3">
            <Button
              type="button"
              variant="outline"
              className="h-11 border-slate-200 bg-white font-currency-mono text-sm text-indigo-950 hover:bg-slate-50"
              disabled={oauthBusy != null || pending}
              onClick={() => void startOAuth("google")}
            >
              {oauthBusy === "google" ? (
                <Loader2 className="ms-2 size-4 animate-spin" aria-hidden />
              ) : null}
              Sign in with Google
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 border-slate-200 bg-white font-currency-mono text-sm text-indigo-950 hover:bg-slate-50"
              disabled={oauthBusy != null || pending}
              onClick={() => void startOAuth("azure")}
            >
              {oauthBusy === "azure" ? (
                <Loader2 className="ms-2 size-4 animate-spin" aria-hidden />
              ) : null}
              Sign in with Microsoft
            </Button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center" aria-hidden>
              <span className="w-full border-t border-slate-100" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-3 font-currency-mono text-slate-400">
                או אימייל
              </span>
            </div>
          </div>

          <form onSubmit={onLoginSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mo-email" className="font-currency-mono text-xs text-indigo-950">
                אימייל
              </Label>
              <Input
                id="mo-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                disabled={pending}
                placeholder="name@company.co.il"
                className="border-slate-100 font-currency-mono placeholder:font-currency-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mo-password" className="font-currency-mono text-xs text-indigo-950">
                סיסמה
              </Label>
              <Input
                id="mo-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                disabled={pending}
                placeholder="••••••••"
                className="border-slate-100 font-currency-mono placeholder:font-currency-mono"
              />
            </div>
            <label
              htmlFor="remember"
              className="flex cursor-pointer items-center gap-2 font-currency-mono text-xs text-slate-600"
            >
              <Checkbox
                checked={rememberMe}
                onCheckedChange={(v) => setRememberMe(v === true)}
                id="remember"
              />
              זכור אותי במכשיר (סשן מתמשך לשטח)
            </label>
            <Button
              type="submit"
              disabled={pending}
              className="h-11 w-full bg-indigo-950 font-currency-mono text-sm text-white hover:bg-indigo-900"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                "כניסה"
              )}
            </Button>
          </form>
        </div>
      ) : (
        <form onSubmit={(e) => void onRequestSubmit(e)} className="space-y-4">
          <p className="font-currency-mono text-xs text-slate-500">
            אין הרשמה ציבורית — הבקשה תועבר לאישור מנכ״ל.
          </p>
          <div className="space-y-2">
            <Label className="font-currency-mono text-xs text-indigo-950">
              שם מלא
            </Label>
            <Input
              value={reqName}
              onChange={(e) => setReqName(e.target.value)}
              required
              className="border-slate-100 font-currency-mono"
            />
          </div>
          <div className="space-y-2">
            <Label className="font-currency-mono text-xs text-indigo-950">
              חברה (אופציונלי)
            </Label>
            <Input
              value={reqCompany}
              onChange={(e) => setReqCompany(e.target.value)}
              className="border-slate-100 font-currency-mono"
              placeholder="שם החברה"
            />
          </div>
          <div className="space-y-2">
            <Label className="font-currency-mono text-xs text-indigo-950">
              תפקיד
            </Label>
            <Input
              value={reqRole}
              onChange={(e) => setReqRole(e.target.value)}
              required
              placeholder="למשל: מנהל פרויקט"
              className="border-slate-100 font-currency-mono placeholder:font-currency-mono"
            />
          </div>
          <div className="space-y-2">
            <Label className="font-currency-mono text-xs text-indigo-950">
              פרויקט מבוקש
            </Label>
            <Input
              value={reqProject}
              onChange={(e) => setReqProject(e.target.value)}
              required
              placeholder="שם אתר / קוד פנימי"
              className="border-slate-100 font-currency-mono placeholder:font-currency-mono"
            />
          </div>
          <div className="space-y-2">
            <Label className="font-currency-mono text-xs text-indigo-950">
              נייד
            </Label>
            <Input
              value={reqMobile}
              onChange={(e) => setReqMobile(e.target.value)}
              required
              inputMode="tel"
              className="border-slate-100 font-currency-mono"
            />
          </div>
          <div className="space-y-2">
            <Label className="font-currency-mono text-xs text-indigo-950">
              אימייל (אופציונלי)
            </Label>
            <Input
              type="email"
              value={reqEmail}
              onChange={(e) => setReqEmail(e.target.value)}
              className="border-slate-100 font-currency-mono placeholder:font-currency-mono"
              placeholder="reply@…"
            />
          </div>
          <Button
            type="submit"
            disabled={pending}
            className="h-11 w-full border border-slate-100 bg-white font-currency-mono text-sm text-indigo-950 hover:bg-slate-50"
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "שליחת בקשה"}
          </Button>
        </form>
      )}

      <p className="text-center font-currency-mono text-[11px] text-slate-400">
        פורטל מתקנים (הולדן): /login
      </p>
    </div>
  )
}
