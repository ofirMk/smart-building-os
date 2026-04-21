"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Building2, Lock, User } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { writeActiveCompanyCookie } from "@/lib/company-context"

type LoginCompanyId =
  | "marker_ofek"
  | "holden_buildings"
  | "hh_electrical_panels"
  | "holden_group"

const LOGIN_COMPANIES: { id: LoginCompanyId; label: string }[] = [
  { id: "marker_ofek", label: "מרקר אופק" },
  { id: "holden_buildings", label: "הולדן מבנים" },
  { id: "hh_electrical_panels", label: "ח.ח לוחות חשמל" },
  { id: "holden_group", label: "הולדן גרופ" },
]

export default function RootPage() {
  const router = useRouter()
  const [username, setUsername] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [company, setCompany] = React.useState<LoginCompanyId | "">("")
  const [error, setError] = React.useState<string | null>(null)
  const [comingSoonCompany, setComingSoonCompany] = React.useState<string | null>(null)

  function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!username.trim() || !password.trim() || !company) {
      setError("נא למלא שם משתמש, סיסמה ולבחור חברה.")
      return
    }

    if (company === "marker_ofek") {
      writeActiveCompanyCookie("marker_ofek")
      router.push("/marker-ofek/projects")
      return
    }

    const selectedLabel =
      LOGIN_COMPANIES.find((option) => option.id === company)?.label ?? "החברה שבחרתם"
    setComingSoonCompany(selectedLabel)
  }

  return (
    <div
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-background px-4 py-8 text-foreground md:px-8"
    >
      <Card className="w-full max-w-md border-border shadow-xl">
        <CardHeader className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            sys-mk.com
          </p>
          <CardTitle className="text-2xl font-bold">Holden Group Gatekeeper</CardTitle>
          <p className="text-sm text-muted-foreground">התחברות למערכות קבוצת הולדן</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleLogin}>
            <div className="grid gap-1.5">
              <Label htmlFor="username">שם משתמש</Label>
              <div className="relative">
                <User className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="pe-10"
                  placeholder="הזינו שם משתמש"
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="password">סיסמה</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="pe-10"
                  placeholder="הזינו סיסמה"
                  autoComplete="current-password"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="company">חברה</Label>
              <div className="relative">
                <Building2 className="pointer-events-none absolute end-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
                <Select value={company} onValueChange={(value) => setCompany(value as LoginCompanyId)}>
                  <SelectTrigger id="company" className="pe-10">
                    <SelectValue placeholder="בחרו חברה" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOGIN_COMPANIES.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {error ? <p className="text-xs text-destructive">{error}</p> : null}

            <Button type="submit" className="w-full">
              כניסה למערכת
            </Button>
          </form>
        </CardContent>
      </Card>

      {comingSoonCompany ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-sm border-border text-center shadow-2xl">
            <CardHeader>
              <CardTitle className="text-xl">בקרוב</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                סביבת <span className="font-semibold text-foreground">{comingSoonCompany}</span>{" "}
                תעלה בקרוב.
              </p>
              <Button type="button" onClick={() => setComingSoonCompany(null)}>
                סגירה
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  )
}