"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useState, useTransition } from "react"
import { ShieldCheck } from "lucide-react"

import {
  completePreventiveTask,
  createPreventiveTask,
  type MaintenanceActionState,
} from "@/app/(dashboard)/maintenance/actions"
import { classifyDueHighlight } from "@/lib/preventive-maintenance-due"
import type { PreventiveTaskRow } from "@/types/preventive-maintenance"
import type { VendorRow } from "@/types/vendor"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

const initialFormState: MaintenanceActionState = {
  ok: false,
  message: "",
}

const SYSTEM_PRESETS = [
  { value: "מעליות", label: "מעליות" },
  { value: "מאגרי מים", label: "מאגרי מים" },
  { value: "כיבוי אש", label: "כיבוי אש" },
  { value: "__custom__", label: "אחר (הזנה חופשית)" },
] as const

const FREQUENCY_OPTIONS: {
  value: PreventiveTaskRow["frequency"]
  label: string
}[] = [
  { value: "monthly", label: "חודשי" },
  { value: "semi_annual", label: "חצי-שנתי" },
  { value: "annual", label: "שנתי" },
]

const FREQUENCY_LABEL: Record<PreventiveTaskRow["frequency"], string> = {
  monthly: "חודשי",
  semi_annual: "חצי-שנתי",
  annual: "שנתי",
}

function formatDue(iso: string) {
  try {
    return new Intl.DateTimeFormat("he-IL", {
      dateStyle: "medium",
      timeZone: "Asia/Jerusalem",
    }).format(new Date(iso + "T12:00:00"))
  } catch {
    return iso
  }
}

function formatCompleted(iso: string | null) {
  if (!iso) return "—"
  try {
    return new Intl.DateTimeFormat("he-IL", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Asia/Jerusalem",
    }).format(new Date(iso))
  } catch {
    return "—"
  }
}

type MaintenanceClientProps = {
  tasks: PreventiveTaskRow[]
  vendors: VendorRow[]
}

export function MaintenanceClient({ tasks, vendors }: MaintenanceClientProps) {
  const router = useRouter()
  const { success, error } = useToast()
  const [formState, formAction, formPending] = useActionState(
    createPreventiveTask,
    initialFormState
  )
  const [completePending, startComplete] = useTransition()

  const [systemPreset, setSystemPreset] = useState<string>("מעליות")
  const [customSystem, setCustomSystem] = useState("")

  useEffect(() => {
    if (formState.ok) {
      router.refresh()
    }
  }, [formState.ok, router])

  const activeVendors = vendors.filter((v) => v.is_active)

  return (
    <div
      className="mx-auto flex w-full max-w-6xl flex-col gap-8 text-start"
      dir="rtl"
    >
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          תפעול מערכות
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          תחזוקה מונעת
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          תזמון בדיקות וטיפולים לפי מערכות קריטיות. סימון ביצוע מעדכן את מועד היעד
          הבא לפי התדירות.
        </p>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="border-b border-border/50 pb-4">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <ShieldCheck className="size-4" aria-hidden />
            </span>
            <div>
              <CardTitle className="text-lg">הוספת משימת תחזוקה</CardTitle>
              <CardDescription>
                הגדירו יעד, תדירות וקבלן אחראי לפי הצורך.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <form key={tasks.length} action={formAction} className="flex flex-col gap-4">
            <input
              type="hidden"
              name="system_type"
              value={
                systemPreset === "__custom__"
                  ? customSystem.trim()
                  : systemPreset
              }
            />
            <div className="space-y-2">
              <Label htmlFor="mt-title">כותרת המשימה</Label>
              <Input
                id="mt-title"
                name="title"
                required
                maxLength={240}
                placeholder="לדוגמה: בדיקת משאבות בוסטר במאגר עליון"
                disabled={formPending}
                className="text-start"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>סוג מערכת</Label>
                <Select
                  value={systemPreset}
                  onValueChange={(v) => setSystemPreset(v ?? "מעליות")}
                  disabled={formPending}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SYSTEM_PRESETS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {systemPreset === "__custom__" ? (
                  <Input
                    value={customSystem}
                    onChange={(e) => setCustomSystem(e.target.value)}
                    placeholder="תארו את המערכת…"
                    disabled={formPending}
                    className="text-start"
                    required
                  />
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="mt-frequency">תדירות</Label>
                <select
                  id="mt-frequency"
                  name="frequency"
                  defaultValue="monthly"
                  disabled={formPending}
                  className={cn(
                    "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm",
                    "outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
                    "disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                >
                  {FREQUENCY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mt-due">מועד יעד הבא</Label>
                <Input
                  id="mt-due"
                  name="next_due_date"
                  type="date"
                  required
                  disabled={formPending}
                  className="text-start"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mt-vendor">הקצאת קבלן</Label>
                <select
                  id="mt-vendor"
                  name="vendor_id"
                  defaultValue=""
                  disabled={formPending}
                  className={cn(
                    "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm",
                    "outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
                    "disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                >
                  <option value="">ללא הקצאה</option>
                  {activeVendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                disabled={
                  formPending ||
                  (systemPreset === "__custom__" && !customSystem.trim())
                }
              >
                {formPending ? "שומרים…" : "שמירת משימה"}
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
          <CardTitle className="text-lg">משימות (לפי מועד יעד)</CardTitle>
          <CardDescription>
            <span className="text-destructive">אדום</span> — באיחור;{" "}
            <span className="text-amber-700 dark:text-amber-400">צהוב</span> — בשבוע
            הקרוב.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {tasks.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              אין משימות תחזוקה. הוסיפו משימה מהטופס למעלה.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="min-w-[160px] ps-4">משימה</TableHead>
                    <TableHead className="hidden md:table-cell">מערכת</TableHead>
                    <TableHead>תדירות</TableHead>
                    <TableHead className="min-w-[120px]">מועד יעד</TableHead>
                    <TableHead className="hidden lg:table-cell">ביצוע אחרון</TableHead>
                    <TableHead className="hidden sm:table-cell">קבלן</TableHead>
                    <TableHead className="pe-4 text-end">פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((task) => {
                    const hl = classifyDueHighlight(task.next_due_date)
                    const vendorName =
                      task.vendor_id &&
                      vendors.find((v) => v.id === task.vendor_id)?.name
                    return (
                      <TableRow
                        key={task.id}
                        className={cn(
                          hl === "overdue" &&
                            "bg-destructive/10 hover:bg-destructive/15 dark:bg-destructive/15",
                          hl === "upcoming" &&
                            "bg-amber-500/10 hover:bg-amber-500/15 dark:bg-amber-500/12"
                        )}
                      >
                        <TableCell className="align-top ps-4 font-medium">
                          {task.title}
                        </TableCell>
                        <TableCell className="hidden align-top text-muted-foreground md:table-cell">
                          {task.system_type}
                        </TableCell>
                        <TableCell className="align-top">
                          {FREQUENCY_LABEL[task.frequency]}
                        </TableCell>
                        <TableCell className="align-top">
                          <span
                            className={cn(
                              "tabular-nums font-medium",
                              hl === "overdue" && "text-destructive",
                              hl === "upcoming" &&
                                "text-amber-800 dark:text-amber-300"
                            )}
                          >
                            {formatDue(task.next_due_date)}
                          </span>
                        </TableCell>
                        <TableCell className="hidden align-top tabular-nums text-sm text-muted-foreground lg:table-cell">
                          {formatCompleted(task.last_completed_at)}
                        </TableCell>
                        <TableCell className="hidden align-top sm:table-cell">
                          {vendorName ?? "—"}
                        </TableCell>
                        <TableCell className="align-top pe-4 text-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={completePending}
                            onClick={() =>
                              startComplete(async () => {
                                const r = await completePreventiveTask(task.id)
                                if (r.ok) {
                                  success("המשימה סומנה כבוצעה; מועד היעד עודכן.")
                                  router.refresh()
                                } else {
                                  error(r.error)
                                }
                              })
                            }
                          >
                            בוצע
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
