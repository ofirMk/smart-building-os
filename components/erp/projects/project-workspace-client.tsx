"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { CheckCircle2, Loader2, Plus, Save, Workflow } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { COMPANY_COOKIE_KEY, type CompanyContextId, resolveCompanyContext } from "@/lib/company-context"
import type {
  CreateBoqLineInput,
  CreatePlanningVersionInput,
  ErpBoqLine,
  ErpPlanningVersion,
  ErpProject,
  ErpProjectStatus,
} from "@/types/erp"
import { cn } from "@/lib/utils"
import { ProjectProfitabilityDashboard } from "@/components/erp/workspaces/projects/dashboard/project-profitability-dashboard"

type ApiResponse<T> = { data: T; error?: string }

const projectSchema = z.object({
  projectNumber: z.string().trim().min(1, "מספר פרויקט חובה"),
  name: z.string().trim().min(2, "שם פרויקט חייב להכיל לפחות 2 תווים"),
  status: z.enum(["ACTIVE", "COMPLETED", "DRAFT"]),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  projectManagerId: z.string().trim().optional(),
})

const versionSchema = z.object({
  versionNumber: z.number().int().positive().optional(),
  description: z.string().trim().min(1, "תיאור מהדורה חובה"),
  isBaseVersion: z.boolean(),
  isExecutionVersion: z.boolean(),
  status: z.enum(["DRAFT", "APPROVED"]),
})

const boqLineSchema = z.object({
  section: z.string().trim().min(1, "פרק חובה"),
  itemNumber: z.string().trim().min(1, "מספר סעיף חובה"),
  description: z.string().trim().min(2, "תיאור חובה"),
  uom: z.string().trim().min(1, "יחידת מידה חובה"),
  quantity: z.number().min(0, "כמות חייבת להיות 0 ומעלה"),
  unitPrice: z.number().min(0, "מחיר יח' חייב להיות 0 ומעלה"),
})

type ProjectInput = z.infer<typeof projectSchema>
type VersionInput = z.infer<typeof versionSchema>
type BoqLineInput = z.infer<typeof boqLineSchema>

function getActiveCompanyIdFromCookie(): CompanyContextId | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${COMPANY_COOKIE_KEY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`)
  )
  return resolveCompanyContext(match?.[1]?.trim())
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const activeCompanyId = getActiveCompanyIdFromCookie()
  const headers = new Headers(init?.headers ?? {})
  headers.set("content-type", "application/json")
  if (activeCompanyId) headers.set("x-company-id", activeCompanyId)

  const response = await fetch(input, {
    ...init,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  })
  const payload = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) throw new Error(payload.error ?? "API request failed")
  return payload as T
}

function projectStatusClass(status: ErpProjectStatus) {
  if (status === "ACTIVE") return "border-emerald-200 bg-emerald-50 text-emerald-800"
  if (status === "COMPLETED") return "border-blue-200 bg-blue-50 text-blue-800"
  return "border-amber-200 bg-amber-50 text-amber-800"
}

export function ProjectWorkspaceClient({ projectId }: { projectId: string }) {
  const [loadingProject, setLoadingProject] = React.useState(true)
  const [loadingVersions, setLoadingVersions] = React.useState(true)
  const [loadingLines, setLoadingLines] = React.useState(false)
  const [savingProject, setSavingProject] = React.useState(false)
  const [creatingVersion, setCreatingVersion] = React.useState(false)
  const [savingLines, setSavingLines] = React.useState(false)
  const [project, setProject] = React.useState<ErpProject | null>(null)
  const [versions, setVersions] = React.useState<ErpPlanningVersion[]>([])
  const [selectedVersionId, setSelectedVersionId] = React.useState<string | null>(null)
  const [lines, setLines] = React.useState<ErpBoqLine[]>([])
  const [versionDialogOpen, setVersionDialogOpen] = React.useState(false)
  const [lineDialogOpen, setLineDialogOpen] = React.useState(false)
  const [statusDraft, setStatusDraft] = React.useState<ErpProjectStatus>("DRAFT")

  const projectForm = useForm<ProjectInput>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      projectNumber: "",
      name: "",
      status: "DRAFT",
      startDate: "",
      endDate: "",
      projectManagerId: "",
    },
  })

  const versionForm = useForm<VersionInput, undefined, VersionInput>({
    resolver: zodResolver(versionSchema),
    defaultValues: {
      versionNumber: undefined,
      description: "",
      isBaseVersion: false,
      isExecutionVersion: false,
      status: "DRAFT",
    },
  })

  const lineForm = useForm<BoqLineInput, undefined, BoqLineInput>({
    resolver: zodResolver(boqLineSchema),
    defaultValues: {
      section: "",
      itemNumber: "",
      description: "",
      uom: "יח'",
      quantity: 0,
      unitPrice: 0,
    },
  })

  const loadProject = React.useCallback(async () => {
    setLoadingProject(true)
    try {
      const result = await requestJson<ApiResponse<ErpProject>>(`/api/erp/projects/${projectId}`)
      setProject(result.data)
      projectForm.reset({
        projectNumber: result.data.projectNumber,
        name: result.data.name,
        status: result.data.status,
        startDate: result.data.startDate ?? "",
        endDate: result.data.endDate ?? "",
        projectManagerId: result.data.projectManagerId ?? "",
      })
      setStatusDraft(result.data.status)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שגיאה בטעינת פרויקט")
      setProject(null)
    } finally {
      setLoadingProject(false)
    }
  }, [projectForm, projectId])

  const loadVersions = React.useCallback(async () => {
    setLoadingVersions(true)
    try {
      const result = await requestJson<ApiResponse<ErpPlanningVersion[]>>(`/api/erp/projects/${projectId}/versions`)
      const rows = result.data ?? []
      setVersions(rows)
      setSelectedVersionId((prev) => {
        if (prev && rows.some((row) => row.id === prev)) return prev
        const execution = rows.find((row) => row.isExecutionVersion)
        const base = rows.find((row) => row.isBaseVersion)
        return execution?.id ?? base?.id ?? rows[0]?.id ?? null
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שגיאה בטעינת מהדורות")
      setVersions([])
      setSelectedVersionId(null)
    } finally {
      setLoadingVersions(false)
    }
  }, [projectId])

  const loadBoqLines = React.useCallback(async (versionId: string | null) => {
    if (!versionId) {
      setLines([])
      return
    }
    setLoadingLines(true)
    try {
      const result = await requestJson<ApiResponse<ErpBoqLine[]>>(`/api/planning-versions/${versionId}/lines`)
      setLines(result.data ?? [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שגיאה בטעינת סעיפי כתב כמויות")
      setLines([])
    } finally {
      setLoadingLines(false)
    }
  }, [])

  React.useEffect(() => {
    void Promise.all([loadProject(), loadVersions()])
  }, [loadProject, loadVersions])

  React.useEffect(() => {
    void loadBoqLines(selectedVersionId)
  }, [loadBoqLines, selectedVersionId])

  const selectedVersion = React.useMemo(
    () => versions.find((version) => version.id === selectedVersionId) ?? null,
    [selectedVersionId, versions]
  )

  const boqTotals = React.useMemo(() => {
    return lines.reduce(
      (acc, line) => {
        acc.quantity += Number(line.quantity) || 0
        acc.total += Number(line.totalPrice) || 0
        return acc
      },
      { quantity: 0, total: 0 }
    )
  }, [lines])

  async function saveProject(values: ProjectInput) {
    setSavingProject(true)
    try {
      await requestJson<ApiResponse<ErpProject>>(`/api/erp/projects/${projectId}`, {
        method: "PUT",
        body: JSON.stringify(values),
      })
      toast.success("פרטי הפרויקט נשמרו")
      await loadProject()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שמירת פרויקט נכשלה")
    } finally {
      setSavingProject(false)
    }
  }

  async function approveProject() {
    setSavingProject(true)
    try {
      await requestJson<ApiResponse<ErpProject>>(`/api/erp/projects/${projectId}`, {
        method: "PUT",
        body: JSON.stringify({ status: "ACTIVE" }),
      })
      toast.success("הפרויקט אושר לביצוע")
      await loadProject()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "אישור פרויקט נכשל")
    } finally {
      setSavingProject(false)
    }
  }

  async function applyStatusChange() {
    setSavingProject(true)
    try {
      await requestJson<ApiResponse<ErpProject>>(`/api/erp/projects/${projectId}`, {
        method: "PUT",
        body: JSON.stringify({ status: statusDraft }),
      })
      toast.success("סטטוס הפרויקט עודכן")
      await loadProject()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "עדכון סטטוס נכשל")
    } finally {
      setSavingProject(false)
    }
  }

  async function createVersion(values: CreatePlanningVersionInput) {
    setCreatingVersion(true)
    try {
      const result = await requestJson<ApiResponse<ErpPlanningVersion>>(`/api/erp/projects/${projectId}/versions`, {
        method: "POST",
        body: JSON.stringify(values),
      })
      toast.success("מהדורת תכנון נוצרה")
      setVersionDialogOpen(false)
      versionForm.reset({
        versionNumber: undefined,
        description: "",
        isBaseVersion: false,
        isExecutionVersion: false,
        status: "DRAFT",
      })
      await loadVersions()
      setSelectedVersionId(result.data.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "יצירת מהדורה נכשלה")
    } finally {
      setCreatingVersion(false)
    }
  }

  async function addBoqLine(values: CreateBoqLineInput) {
    if (!selectedVersionId) {
      toast.error("יש לבחור מהדורת תכנון")
      return
    }
    setSavingLines(true)
    try {
      const payload = [
        ...lines.map((line) => ({
          section: line.section,
          itemNumber: line.itemNumber,
          description: line.description,
          uom: line.uom,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        })),
        {
          section: values.section,
          itemNumber: values.itemNumber,
          description: values.description,
          uom: values.uom,
          quantity: values.quantity,
          unitPrice: values.unitPrice,
        },
      ]

      const result = await requestJson<ApiResponse<ErpBoqLine[]>>(
        `/api/planning-versions/${selectedVersionId}/lines`,
        {
          method: "PUT",
          body: JSON.stringify({ lines: payload }),
        }
      )

      setLines(result.data ?? [])
      lineForm.reset({
        section: "",
        itemNumber: "",
        description: "",
        uom: "יח'",
        quantity: 0,
        unitPrice: 0,
      })
      setLineDialogOpen(false)
      toast.success("סעיף כתב כמויות נוסף")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שמירת סעיף נכשלה")
    } finally {
      setSavingLines(false)
    }
  }

  return (
    <div dir="rtl" className="flex-1 min-h-0 overflow-y-auto bg-[#F8FAFC] px-2 py-2 md:px-3">
      <div className="flex w-full max-w-none flex-col gap-2">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          {loadingProject ? (
            <div className="flex min-h-20 items-center justify-center text-sm text-slate-500">
              <Loader2 className="me-2 size-4 animate-spin" aria-hidden />
              טוען פרויקט...
            </div>
          ) : !project ? (
            <div className="text-sm text-red-600">הפרויקט לא נמצא או שאין גישה.</div>
          ) : (
            <Form {...projectForm}>
              <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-background p-2 text-xs md:grid-cols-5">
                <div className="rounded-md border border-slate-200 bg-card px-2 py-1">
                  <p className="text-[11px] text-slate-500">מספר פרויקט</p>
                  <p className="font-mono text-[12px] font-semibold text-slate-800">{project.projectNumber}</p>
                </div>
                <div className="rounded-md border border-slate-200 bg-card px-2 py-1 md:col-span-2">
                  <p className="text-[11px] text-slate-500">שם פרויקט</p>
                  <p className="truncate text-[12px] font-semibold text-slate-800">{project.name}</p>
                </div>
                <div className="rounded-md border border-slate-200 bg-card px-2 py-1">
                  <p className="text-[11px] text-slate-500">סטטוס</p>
                  <Badge variant="outline" className={cn("mt-1 rounded-md text-[10px]", projectStatusClass(project.status))}>
                    {project.status}
                  </Badge>
                </div>
                <div className="rounded-md border border-slate-200 bg-card px-2 py-1">
                  <p className="text-[11px] text-slate-500">טווח תאריכים</p>
                  <p className="text-[12px] text-slate-800">
                    {(project.startDate ?? "—")} עד {(project.endDate ?? "—")}
                  </p>
                </div>
              </div>
              <form
                className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr_auto]"
                onSubmit={projectForm.handleSubmit(saveProject)}
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <FormField
                    control={projectForm.control}
                    name="projectNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>מספר פרויקט</FormLabel>
                        <FormControl>
                          <Input {...field} className="h-8 px-2 text-sm" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={projectForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>שם פרויקט</FormLabel>
                        <FormControl>
                          <Input {...field} className="h-8 px-2 text-sm" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={projectForm.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>תאריך התחלה</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} type="date" className="h-8 px-2 text-sm" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={projectForm.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>תאריך סיום</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} type="date" className="h-8 px-2 text-sm" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">סטטוס נוכחי</span>
                    <Badge variant="outline" className={cn("rounded-lg font-medium", projectStatusClass(project.status))}>
                      {project.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Change Status:</span>
                    <Select
                      value={statusDraft}
                      onValueChange={(value) => setStatusDraft(value as ErpProjectStatus)}
                    >
                      <SelectTrigger className="h-8 w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DRAFT">DRAFT</SelectItem>
                        <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                        <SelectItem value="COMPLETED">COMPLETED</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <FormField
                    control={projectForm.control}
                    name="projectManagerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>מנהל פרויקט (UUID)</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex flex-col justify-start gap-2">
                  <Button type="submit" className="gap-2" disabled={savingProject}>
                    {savingProject ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    disabled={savingProject}
                    onClick={() => void approveProject()}
                  >
                    <CheckCircle2 className="size-4" aria-hidden />
                    Approve
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    disabled={savingProject}
                    onClick={() => void applyStatusChange()}
                  >
                    <Workflow className="size-4" aria-hidden />
                    Change Status
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
          <Tabs defaultValue="versions" className="space-y-3">
            <TabsList className="h-10 rounded-xl bg-card shadow-sm" variant="line">
              <TabsTrigger value="versions">מהדורות תכנון</TabsTrigger>
              <TabsTrigger value="boq">כתב כמויות</TabsTrigger>
              <TabsTrigger value="profitability">Project Profitability</TabsTrigger>
            </TabsList>

            <TabsContent value="versions" className="rounded-xl border border-border bg-card p-3 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">מהדורות תכנון</p>
                <Button size="sm" className="gap-2" onClick={() => setVersionDialogOpen(true)}>
                  <Plus className="size-4" aria-hidden />
                  מהדורה חדשה
                </Button>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-background/80">
                      <TableHead className="text-right">#</TableHead>
                      <TableHead className="text-right">תיאור</TableHead>
                      <TableHead className="text-right">Base</TableHead>
                      <TableHead className="text-right">Execution</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingVersions ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-20 text-center text-sm text-slate-500">
                          <Loader2 className="me-2 inline size-4 animate-spin" aria-hidden />
                          טוען מהדורות...
                        </TableCell>
                      </TableRow>
                    ) : versions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-20 text-center text-sm text-slate-500">
                          אין מהדורות תכנון.
                        </TableCell>
                      </TableRow>
                    ) : (
                      versions.map((version) => (
                        <TableRow
                          key={version.id}
                          className={cn(
                            "cursor-pointer hover:bg-background",
                            selectedVersionId === version.id && "bg-indigo-50/70 hover:bg-indigo-50"
                          )}
                          onClick={() => setSelectedVersionId(version.id)}
                        >
                          <TableCell className="font-mono text-xs">{version.versionNumber}</TableCell>
                          <TableCell>{version.description}</TableCell>
                          <TableCell>{version.isBaseVersion ? "כן" : "—"}</TableCell>
                          <TableCell>{version.isExecutionVersion ? "כן" : "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="rounded-lg">
                              {version.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="boq" className="rounded-xl border border-border bg-card p-3 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-slate-700">
                  {selectedVersion ? (
                    <>
                      מהדורה פעילה:{" "}
                      <span className="font-semibold">#{selectedVersion.versionNumber}</span> ·{" "}
                      {selectedVersion.description}
                    </>
                  ) : (
                    "בחרו מהדורת תכנון להצגת כתב כמויות"
                  )}
                </div>
                <Button
                  size="sm"
                  className="gap-2"
                  disabled={!selectedVersionId}
                  onClick={() => setLineDialogOpen(true)}
                >
                  <Plus className="size-4" aria-hidden />
                  הוסף סעיף
                </Button>
              </div>
              <div className="mb-2 grid grid-cols-2 gap-2 md:w-[420px]">
                <div className="rounded-md border border-slate-200 bg-background px-2 py-1 text-xs">
                  <p className="text-[11px] text-slate-500">סך כמות</p>
                  <p className="font-mono font-semibold text-foreground">
                    {boqTotals.quantity.toLocaleString("he-IL")}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-background px-2 py-1 text-xs">
                  <p className="text-[11px] text-slate-500">סך תקציב</p>
                  <p className="font-mono font-semibold text-foreground">
                    {boqTotals.total.toLocaleString("he-IL", { style: "currency", currency: "ILS" })}
                  </p>
                </div>
              </div>
              <div className="max-h-[62vh] overflow-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="sticky top-0 z-10 bg-background/95">
                      <TableHead className="text-right">פרק</TableHead>
                      <TableHead className="text-right">סעיף</TableHead>
                      <TableHead className="min-w-[320px] text-right">תיאור</TableHead>
                      <TableHead className="text-right">יח' מידה</TableHead>
                      <TableHead className="text-right">כמות</TableHead>
                      <TableHead className="text-right">מחיר יח'</TableHead>
                      <TableHead className="text-right">סה"כ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingLines ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center text-sm text-slate-500">
                          <Loader2 className="me-2 inline size-4 animate-spin" aria-hidden />
                          טוען סעיפי כתב כמויות...
                        </TableCell>
                      </TableRow>
                    ) : lines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center text-sm text-slate-500">
                          אין סעיפים להצגה.
                        </TableCell>
                      </TableRow>
                    ) : (
                      lines.map((line) => (
                        <TableRow key={line.id} className="hover:bg-background">
                          <TableCell className="font-mono text-xs">{line.section}</TableCell>
                          <TableCell className="font-mono text-xs">{line.itemNumber}</TableCell>
                          <TableCell>{line.description}</TableCell>
                          <TableCell>{line.uom}</TableCell>
                          <TableCell className="font-mono tabular-nums">{line.quantity.toLocaleString("he-IL")}</TableCell>
                          <TableCell className="font-mono tabular-nums">
                            {line.unitPrice.toLocaleString("he-IL", { style: "currency", currency: "ILS" })}
                          </TableCell>
                          <TableCell className="font-mono tabular-nums font-semibold text-foreground">
                            {line.totalPrice.toLocaleString("he-IL", { style: "currency", currency: "ILS" })}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
            <TabsContent value="profitability" className="rounded-xl border border-border bg-card p-3 shadow-sm">
              <ProjectProfitabilityDashboard projectId={projectId} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Dialog open={versionDialogOpen} onOpenChange={setVersionDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>יצירת מהדורת תכנון</DialogTitle>
            <DialogDescription>הגדירו מהדורה חדשה לפרויקט הפעיל.</DialogDescription>
          </DialogHeader>
          <Form {...versionForm}>
            <form
              className="grid grid-cols-1 gap-3 md:grid-cols-2"
              onSubmit={versionForm.handleSubmit(createVersion)}
            >
              <FormField
                control={versionForm.control}
                name="versionNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>מספר מהדורה (אופציונלי)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        value={field.value ?? ""}
                        onChange={(event) =>
                          field.onChange(event.target.value === "" ? undefined : Number(event.target.value))
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={versionForm.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>סטטוס</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="DRAFT">DRAFT</SelectItem>
                        <SelectItem value="APPROVED">APPROVED</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={versionForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>תיאור מהדורה</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={versionForm.control}
                name="isBaseVersion"
                render={({ field }) => (
                  <FormItem>
                    <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                      <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                      מהדורת אפס
                    </label>
                  </FormItem>
                )}
              />
              <FormField
                control={versionForm.control}
                name="isExecutionVersion"
                render={({ field }) => (
                  <FormItem>
                    <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                      <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                      מהדורת ביצוע
                    </label>
                  </FormItem>
                )}
              />
              <DialogFooter className="md:col-span-2">
                <Button type="button" variant="outline" onClick={() => setVersionDialogOpen(false)}>
                  ביטול
                </Button>
                <Button type="submit" disabled={creatingVersion}>
                  {creatingVersion ? (
                    <>
                      <Loader2 className="me-1 size-4 animate-spin" aria-hidden />
                      יוצר...
                    </>
                  ) : (
                    "יצירת מהדורה"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={lineDialogOpen} onOpenChange={setLineDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>הוספת סעיף כתב כמויות</DialogTitle>
            <DialogDescription>הזינו סעיף חדש למהדורה הפעילה במהירות.</DialogDescription>
          </DialogHeader>
          <Form {...lineForm}>
            <form className="grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={lineForm.handleSubmit(addBoqLine)}>
              <FormField
                control={lineForm.control}
                name="section"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>פרק / תת פרק</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={lineForm.control}
                name="itemNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>מספר סעיף</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={lineForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>תיאור</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={lineForm.control}
                name="uom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>יחידת מידה</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={lineForm.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>כמות</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.001"
                        value={field.value}
                        onChange={(event) =>
                          field.onChange(event.target.value === "" ? 0 : Number(event.target.value))
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={lineForm.control}
                name="unitPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>מחיר יח'</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        value={field.value}
                        onChange={(event) =>
                          field.onChange(event.target.value === "" ? 0 : Number(event.target.value))
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter className="md:col-span-2">
                <Button type="button" variant="outline" onClick={() => setLineDialogOpen(false)}>
                  ביטול
                </Button>
                <Button type="submit" disabled={savingLines}>
                  {savingLines ? (
                    <>
                      <Loader2 className="me-1 size-4 animate-spin" aria-hidden />
                      שומר...
                    </>
                  ) : (
                    "הוסף סעיף"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

