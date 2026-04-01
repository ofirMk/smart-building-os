"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useTransition } from "react"
import { Megaphone } from "lucide-react"

import {
  createAnnouncement,
  toggleAnnouncementActive,
  type AnnouncementActionState,
} from "@/app/(dashboard)/announcements/actions"
import type { AnnouncementRow } from "@/lib/announcements"
import { Badge } from "@/components/ui/badge"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const initialFormState: AnnouncementActionState = {
  ok: false,
  message: "",
}

const URGENCY_LABELS: Record<string, string> = {
  info: "מידע",
  warning: "אזהרה",
  critical: "קריטי",
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("he-IL", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

type AnnouncementsAdminProps = {
  announcements: AnnouncementRow[]
}

export function AnnouncementsAdmin({ announcements }: AnnouncementsAdminProps) {
  const router = useRouter()
  const [formState, formAction, formPending] = useActionState(
    createAnnouncement,
    initialFormState
  )
  const [togglePending, startToggle] = useTransition()

  useEffect(() => {
    if (formState.ok) {
      router.refresh()
    }
  }, [formState.ok, router])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 text-start" dir="rtl">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          תקשורת דיירים
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          מרכז הכרזות
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          פרסמו עדכונים לכל הדיירים. הכרזות פעילות מוצגות בראש פורטל הדיירים לפי
          רמת הדחיפות.
        </p>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="border-b border-border/50 pb-4">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <Megaphone className="size-4" aria-hidden />
            </span>
            <div>
              <CardTitle className="text-lg">פרסום הכרזה חדשה</CardTitle>
              <CardDescription>
                הכרזה תפורסם מיד ותוצג לדיירים (ניתן להשבית מאוחר יותר).
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <form
            key={announcements.length}
            action={formAction}
            className="flex flex-col gap-4"
          >
            <div className="space-y-2">
              <Label htmlFor="title">כותרת</Label>
              <Input
                id="title"
                name="title"
                required
                maxLength={200}
                placeholder="לדוגמה: שינוי שעות פעילות המתקן"
                disabled={formPending}
                className="text-start"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">תוכן</Label>
              <Textarea
                id="content"
                name="content"
                required
                rows={5}
                placeholder="הזינו את נוסח ההודעה לדיירים…"
                disabled={formPending}
                className="min-h-[120px] resize-y text-start"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="urgency">רמת דחיפות</Label>
              <select
                id="urgency"
                name="urgency"
                defaultValue="info"
                disabled={formPending}
                className={cn(
                  "flex h-10 w-full max-w-xs rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none",
                  "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}
              >
                <option value="info">מידע</option>
                <option value="warning">אזהרה</option>
                <option value="critical">קריטי</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={formPending}>
                {formPending ? "שולחים…" : "פרסום הכרזה"}
              </Button>
              {formState.message ? (
                <p
                  className={cn(
                    "text-sm",
                    formState.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                  )}
                  role={formState.ok ? "status" : "alert"}
                >
                  {formState.message}
                </p>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle className="text-lg">הכרזות (פעילות וארכיון)</CardTitle>
          <CardDescription>
            רשימה כרונולוגית. ניתן להשבית הכרזה בלי למחוק אותה.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {announcements.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              עדיין לא פורסמו הכרזות.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[140px]">כותרת</TableHead>
                  <TableHead className="hidden md:table-cell">תוכן</TableHead>
                  <TableHead className="w-[100px]">דחיפות</TableHead>
                  <TableHead className="w-[100px]">סטטוס</TableHead>
                  <TableHead className="hidden sm:table-cell w-[140px]">
                    נוצר
                  </TableHead>
                  <TableHead className="w-[120px] text-end">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {announcements.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="align-top font-medium">
                      {row.title}
                    </TableCell>
                    <TableCell className="hidden max-w-[280px] align-top md:table-cell">
                      <span className="line-clamp-3 text-muted-foreground">
                        {row.content}
                      </span>
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge variant="secondary" className="font-normal">
                        {URGENCY_LABELS[row.urgency] ?? row.urgency}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-top">
                      {row.is_active ? (
                        <Badge className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-400">
                          פעיל
                        </Badge>
                      ) : (
                        <Badge variant="outline">מושבת</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden align-top text-muted-foreground sm:table-cell">
                      {formatDate(row.created_at)}
                    </TableCell>
                    <TableCell className="align-top text-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={togglePending}
                        onClick={() =>
                          startToggle(async () => {
                            const r = await toggleAnnouncementActive(
                              row.id,
                              !row.is_active
                            )
                            if (r.ok) router.refresh()
                          })
                        }
                      >
                        {row.is_active ? "השבתה" : "הפעלה"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
