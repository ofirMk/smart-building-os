"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect } from "react"
import { HardHat } from "lucide-react"

import {
  createVendor,
  type VendorActionState,
} from "@/app/(dashboard)/vendors/actions"
import type { VendorRow } from "@/types/vendor"
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
import { cn } from "@/lib/utils"

const initialFormState: VendorActionState = {
  ok: false,
  message: "",
}

type VendorsAdminProps = {
  vendors: VendorRow[]
}

export function VendorsAdmin({ vendors }: VendorsAdminProps) {
  const router = useRouter()
  const [formState, formAction, formPending] = useActionState(
    createVendor,
    initialFormState
  )

  useEffect(() => {
    if (formState.ok) {
      router.refresh()
    }
  }, [formState.ok, router])

  return (
    <div
      className="mx-auto flex w-full max-w-6xl flex-col gap-8 text-start"
      dir="rtl"
    >
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          ספקים וקבלנים
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">ניהול קבלנים</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          רישום קבלנים לשירות תחזוקה והקצאתם לקריאות שירות מהמסך &quot;קריאות
          שירות&quot;.
        </p>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="border-b border-border/50 pb-4">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <HardHat className="size-4" aria-hidden />
            </span>
            <div>
              <CardTitle className="text-lg">הוספת חברה</CardTitle>
              <CardDescription>
                פרטי קשר לזיהוי בטבלת הקריאות ובמסמכים.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <form
            key={vendors.length}
            action={formAction}
            className="grid gap-4 sm:grid-cols-2"
          >
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="vendor-name">שם חברה</Label>
              <Input
                id="vendor-name"
                name="name"
                required
                maxLength={200}
                placeholder="לדוגמה: אלקטריקה יוסי בע״מ"
                disabled={formPending}
                className="text-start"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="vendor-profession">מקצוע / תחום</Label>
              <Input
                id="vendor-profession"
                name="profession"
                maxLength={200}
                placeholder="חשמל, אינסטלציה, מיזוג…"
                disabled={formPending}
                className="text-start"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vendor-phone">טלפון</Label>
              <Input
                id="vendor-phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="05x-xxxxxxx"
                disabled={formPending}
                className="text-start"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vendor-email">אימייל</Label>
              <Input
                id="vendor-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="office@example.com"
                disabled={formPending}
                className="text-start"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <Button type="submit" disabled={formPending}>
                {formPending ? "שומרים…" : "שמירת חברה"}
              </Button>
              {formState.message ? (
                <p
                  className={cn(
                    "text-sm",
                    formState.ok
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-destructive"
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
          <CardTitle className="text-lg">כל הקבלנים</CardTitle>
          <CardDescription>
            קבלנים פעילים זמינים להקצאה בקריאות. (ניהול השבתה יתווסף בשלב
            הבא.)
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {vendors.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              עדיין לא נרשמו קבלנים.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[140px]">שם</TableHead>
                  <TableHead className="hidden md:table-cell">מקצוע</TableHead>
                  <TableHead className="hidden sm:table-cell">טלפון</TableHead>
                  <TableHead className="hidden lg:table-cell">אימייל</TableHead>
                  <TableHead className="w-[90px]">סטטוס</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendors.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.name}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {v.profession ?? "—"}
                    </TableCell>
                    <TableCell className="hidden tabular-nums sm:table-cell">
                      {v.phone ?? "—"}
                    </TableCell>
                    <TableCell className="hidden max-w-[200px] truncate lg:table-cell">
                      {v.email ?? "—"}
                    </TableCell>
                    <TableCell>
                      {v.is_active ? (
                        <Badge className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-400">
                          פעיל
                        </Badge>
                      ) : (
                        <Badge variant="outline">לא פעיל</Badge>
                      )}
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
