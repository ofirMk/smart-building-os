import type { Metadata } from "next"
import Link from "next/link"
import { ChevronLeft, FolderArchive, Shield } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatError } from "@/lib/utils"

export const metadata: Metadata = {
  title: "DMS — בחירת פרויקט",
  description: "בחר פרויקט לפתיחת כספת המסמכים המאובטחת.",
}

type ProjectListItem = {
  id: string
  name: string
  code: string | null
  clientName: string | null
}

async function loadProjectsForPicker(): Promise<
  | { ok: true; projects: ProjectListItem[] }
  | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

    const { data, error } = await supabase
      .from("projects")
      .select("id, name, internal_project_code, client_name")
      .eq("is_deleted", false)
      .order("name", { ascending: true })
      .limit(200)

    if (error) return { ok: false, error: error.message }

    type Row = {
      id: string
      name: string | null
      internal_project_code: string | null
      client_name: string | null
    }
    const projects: ProjectListItem[] = ((data ?? []) as Row[]).map((r) => ({
      id: r.id,
      name: r.name ?? "פרויקט ללא שם",
      code: r.internal_project_code,
      clientName: r.client_name,
    }))
    return { ok: true, projects }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export default async function DmsLandingPage() {
  const result = await loadProjectsForPicker()

  return (
    <div dir="rtl" lang="he" className="mx-auto w-full max-w-5xl space-y-6 p-4">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/marker-ofek" className="underline-offset-4 hover:underline">
            Marker-Ofek
          </Link>
          <span>/</span>
          <span>DMS</span>
        </div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <FolderArchive className="size-6 text-amber-500" />
          כספת מסמכים — בחירת פרויקט
        </h1>
        <p className="text-sm text-muted-foreground">
          בחר פרויקט לפתיחת ה-DMS שלו. הרשאות, גרסאות ויומן ביקורת נאכפים ברמת
          המסמך. תיקיות ברירת מחדל ייווצרו אוטומטית בכניסה הראשונה לכל פרויקט.
        </p>
      </header>

      {!result.ok && (
        <Alert variant="destructive">
          <AlertTitle>שגיאת טעינה</AlertTitle>
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      )}

      {result.ok && result.projects.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">אין פרויקטים זמינים</CardTitle>
            <CardDescription>
              ייתכן שאין לך הרשאה לחברה הפעילה, או שעדיין לא נוצרו פרויקטים.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {result.ok && result.projects.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {result.projects.map((p) => (
            <Link
              key={p.id}
              href={`/marker-ofek/dms/${p.id}`}
              className="group rounded-xl border bg-card p-4 transition-all hover:border-amber-500/50 hover:shadow-sm"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <FolderArchive className="size-5 text-amber-500" />
                <ChevronLeft className="size-4 text-muted-foreground transition-transform group-hover:-translate-x-1" />
              </div>
              <div className="mb-1 truncate font-medium">{p.name}</div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {p.code && (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {p.code}
                  </Badge>
                )}
                {p.clientName && <span className="truncate">{p.clientName}</span>}
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Shield className="size-3" />
                <span>נכנס ל-DMS</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
