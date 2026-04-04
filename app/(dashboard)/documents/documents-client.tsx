"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect } from "react"
import { FileText } from "lucide-react"

import {
  uploadDocument,
  type DocumentUploadState,
} from "@/app/(dashboard)/documents/actions"
import type { DocumentRow } from "@/types/documents"
import { buttonVariants } from "@/components/ui/button-variants"
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

const initialState: DocumentUploadState = {
  ok: false,
  message: "",
}

const DOC_TYPE_OPTIONS: { value: DocumentRow["document_type"]; label: string }[] =
  [
    { value: "lease", label: "חוזה שכירות" },
    { value: "warranty", label: "תעודת אחריות" },
    { value: "building_plans", label: "תוכניות בנייה" },
    { value: "general", label: "כללי" },
  ]

const RELATED_OPTIONS: { value: DocumentRow["related_to"]; label: string }[] = [
  { value: "tenant", label: "דייר" },
  { value: "vendor", label: "חברה" },
  { value: "building", label: "בניין" },
  { value: "general", label: "כללי" },
]

function labelDocType(v: DocumentRow["document_type"]) {
  return DOC_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v
}

function labelRelated(v: DocumentRow["related_to"]) {
  return RELATED_OPTIONS.find((o) => o.value === v)?.label ?? v
}

function formatUploaded(iso: string) {
  try {
    return new Intl.DateTimeFormat("he-IL", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Asia/Jerusalem",
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

type DocumentsClientProps = {
  documents: DocumentRow[]
}

export function DocumentsClient({ documents }: DocumentsClientProps) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(
    uploadDocument,
    initialState
  )

  useEffect(() => {
    if (state.ok) {
      router.refresh()
    }
  }, [state.ok, router])

  return (
    <div
      className="mx-auto flex w-full max-w-6xl flex-col gap-8 text-start"
      dir="rtl"
    >
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          ניהול מסמכים
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">כספת מסמכים</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          העלאת קבצים לאחסון מאובטח, רישום מטא-דאטה וגישה מהירה לצפייה או הורדה.
        </p>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="border-b border-border/50 pb-4">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <FileText className="size-4" aria-hidden />
            </span>
            <div>
              <CardTitle className="text-lg">העלאת מסמך</CardTitle>
              <CardDescription>
                עד 50 מ״ב לקובץ. הורדה/צפייה בקישור חתום (משתמש מחובר בלבד).
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <form
            id="document-upload-form"
            action={formAction}
            className="flex flex-col gap-4"
          >
            <div className="space-y-2">
              <Label htmlFor="doc-title">כותרת המסמך</Label>
              <Input
                id="doc-title"
                name="title"
                required
                maxLength={240}
                placeholder="לדוגמה: חוזה שכירות דירה 12"
                disabled={pending}
                className="text-start"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="doc-type">סוג מסמך</Label>
                <select
                  id="doc-type"
                  name="document_type"
                  required
                  disabled={pending}
                  defaultValue="lease"
                  className={cn(
                    "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm",
                    "outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
                    "disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                >
                  {DOC_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="doc-related">שיוך</Label>
                <select
                  id="doc-related"
                  name="related_to"
                  required
                  disabled={pending}
                  defaultValue="general"
                  className={cn(
                    "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm",
                    "outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
                    "disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                >
                  {RELATED_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="doc-file">קובץ</Label>
              <Input
                id="doc-file"
                name="file"
                type="file"
                required
                disabled={pending}
                className="cursor-pointer text-start file:me-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={pending}
                className={cn(
                  buttonVariants({ variant: "default", size: "default" })
                )}
              >
                {pending ? "מעלים…" : "העלאה ושמירה"}
              </button>
              {state.message ? (
                <p
                  className={cn(
                    "text-sm",
                    state.ok
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-destructive"
                  )}
                  role={state.ok ? "status" : "alert"}
                >
                  {state.message}
                </p>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle className="text-lg">מסמכים שמורים</CardTitle>
          <CardDescription>החדשים בראש.</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {documents.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              אין מסמכים. העלו קובץ מהטופס למעלה.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="min-w-[160px] ps-4">כותרת</TableHead>
                    <TableHead className="hidden sm:table-cell">סוג</TableHead>
                    <TableHead className="hidden md:table-cell">שיוך</TableHead>
                    <TableHead className="hidden lg:table-cell">קובץ</TableHead>
                    <TableHead className="hidden md:table-cell">הועלה</TableHead>
                    <TableHead className="pe-4 text-end">פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="ps-4 font-medium">{d.title}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {labelDocType(d.document_type)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {labelRelated(d.related_to)}
                      </TableCell>
                      <TableCell className="hidden max-w-[200px] truncate text-muted-foreground lg:table-cell">
                        {d.file_name ?? "—"}
                      </TableCell>
                      <TableCell className="hidden tabular-nums text-sm text-muted-foreground md:table-cell">
                        {formatUploaded(d.created_at)}
                      </TableCell>
                      <TableCell className="pe-4 text-end">
                        {d.file_url ? (
                          <a
                            href={d.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={buttonVariants({
                              variant: "outline",
                              size: "sm",
                            })}
                          >
                            צפייה / הורדה
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            אין קישור זמין — רעננו את הדף
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
