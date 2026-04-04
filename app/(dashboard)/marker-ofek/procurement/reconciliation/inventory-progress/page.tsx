"use client"

import Link from "next/link"
import * as React from "react"
import { AlertTriangle, ArrowRight, Loader2 } from "lucide-react"
import { toast } from "sonner"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { Badge } from "@/components/ui/badge"
import {
  UnassignedItemsCard,
  type UnassignedCardContractItem,
  type UnassignedCardItem,
} from "@/components/dashboard/UnassignedItemsCard"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { decodeMilestoneStoredName } from "@/lib/marker-ofek/milestone-name-codec"
import {
  assignTransactionToContractItem,
  assignTransactionsToContractItem,
  getContractItems,
  getProjectDiscrepancies,
  getUnassignedInventory,
} from "@/lib/marker-ofek/reconciliation-actions"
import { formatError } from "@/lib/utils"

type ProjectOption = {
  id: string
  name: string
  internal_project_code: string
}

type ContractRow = { id: string }
type ContractItemRow = { id: string; name: string; contract_id: string }

type ReconRow = {
  contractItemId: string
  sectionCode: string
  description: string
  contractQty: number
  inventoryConsumedQty: number
  inventoryConsumedPct: number
  reportedProgressPct: number
  gapPct: number
  severity: "ok" | "orange" | "red"
}

function matchesIrHaYayin(projectName: string): boolean {
  const normalized = projectName.replace(/\s+/g, "").toLowerCase()
  return (
    normalized.includes("עירהיין") ||
    normalized.includes("irhayayin") ||
    normalized.includes("ir-ha-yayin")
  )
}

function asNum(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export default function InventoryProgressReconciliationPage() {
  const [projects, setProjects] = React.useState<ProjectOption[]>([])
  const [selectedProjectId, setSelectedProjectId] = React.useState("")
  const [rows, setRows] = React.useState<ReconRow[]>([])
  const [unassignedItems, setUnassignedItems] = React.useState<UnassignedCardItem[]>([])
  const [contractItems, setContractItems] = React.useState<UnassignedCardContractItem[]>([])
  const [loading, setLoading] = React.useState(true)

  async function loadRecon(projectId: string) {
    if (!projectId) return
    const supabase = createSupabaseBrowserClient()
    setLoading(true)
    try {
      const contractsRes = await supabase
        .schema("public")
        .from("contracts")
        .select("id")
        .eq("project_id", projectId)
        .eq("is_deleted", false)
      if (contractsRes.error) throw contractsRes.error
      const contractIds = ((contractsRes.data as ContractRow[]) ?? []).map((c) => c.id)

      if (contractIds.length === 0) {
        setRows([])
        return
      }

      const milestonesRes = await supabase
        .schema("public")
        .from("contract_milestones")
        .select("id, name, contract_id")
        .in("contract_id", contractIds)
      if (milestonesRes.error) throw milestonesRes.error
      const milestones = (milestonesRes.data as ContractItemRow[]) ?? []

      const [discrepancies, unassignedRes, contractItemsRes] = await Promise.all([
        getProjectDiscrepancies(projectId),
        getUnassignedInventory(projectId),
        getContractItems(projectId),
      ])
      setUnassignedItems(
        unassignedRes.items.map((i) => ({
          id: i.id,
          quantity: i.quantity,
          items: {
            item_name: i.items.item_name,
            unit_cost: i.items.unit_cost,
          },
        }))
      )
      setContractItems(contractItemsRes)
      const byContractItemId = new Map(
        discrepancies
          .filter((d) => Boolean(d.contractItemId))
          .map((d) => [String(d.contractItemId), d] as const)
      )

      const computed: ReconRow[] = milestones.map((milestone) => {
        const decoded = decodeMilestoneStoredName(milestone.name)
        const contractQty = asNum(decoded.quantity)
        const source = byContractItemId.get(milestone.id)
        const consumedQty = source?.inventoryQty ?? 0
        const progressQty = source?.billedQty ?? 0
        const consumedPct =
          contractQty > 0 ? Math.min(999, (consumedQty / contractQty) * 100) : 0
        const progressPct =
          contractQty > 0 ? Math.min(999, (progressQty / contractQty) * 100) : 0
        const gapPct = consumedPct - progressPct
        const severity: ReconRow["severity"] =
          source?.status === "CRITICAL"
            ? "red"
            : source?.status === "WARNING"
              ? "orange"
              : "ok"

        return {
          contractItemId: milestone.id,
          sectionCode: decoded.sectionCode || "—",
          description: decoded.description || milestone.name,
          contractQty,
          inventoryConsumedQty: consumedQty,
          inventoryConsumedPct: consumedPct,
          reportedProgressPct: progressPct,
          gapPct,
          severity,
        }
      })

      setRows(
        computed
          .filter((r) => r.inventoryConsumedQty > 0 || r.reportedProgressPct > 0)
          .sort((a, b) => b.gapPct - a.gapPct)
      )
    } catch (e) {
      toast.error(formatError(e))
      setRows([])
      setUnassignedItems([])
      setContractItems([])
    } finally {
      setLoading(false)
    }
  }

  async function handleAssign(transactionId: string, contractItemId: string) {
    try {
      await assignTransactionToContractItem(transactionId, contractItemId)
      toast.success("בוצע שיוך לסעיף בהצלחה")
      if (selectedProjectId) {
        await loadRecon(selectedProjectId)
      }
    } catch (e) {
      toast.error(formatError(e))
    }
  }

  async function handleBulkAssign(
    transactionIds: string[],
    contractItemId: string
  ) {
    try {
      await assignTransactionsToContractItem(transactionIds, contractItemId)
      toast.success(`בוצע שיוך גורף ל-${transactionIds.length} תנועות`)
      if (selectedProjectId) {
        await loadRecon(selectedProjectId)
      }
    } catch (e) {
      toast.error(formatError(e))
    }
  }

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient()
        const res = await supabase
          .schema("public")
          .from("projects")
          .select("id, name, internal_project_code")
          .eq("is_deleted", false)
          .order("name", { ascending: true })
        if (res.error) throw res.error
        if (cancelled) return
        const list = (res.data as ProjectOption[]) ?? []
        setProjects(list)
        const defaultProject = list.find((p) => matchesIrHaYayin(p.name)) ?? list[0]
        if (defaultProject) {
          setSelectedProjectId(defaultProject.id)
          await loadRecon(defaultProject.id)
        } else {
          setLoading(false)
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(formatError(e))
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-10" dir="rtl">
      <Link
        href="/marker-ofek/procurement"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה לרכש
      </Link>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Reconciliation View - מחסן מול ביצוע מדווח</CardTitle>
          <CardDescription>
            השוואה בין צריכת מלאי מהמחסן לבין אחוז ההתקדמות המדווח מחשבונות AI.
          </CardDescription>
        </CardHeader>
        <CardContent className="max-w-md">
          <Select
            value={selectedProjectId}
            onValueChange={(v) => {
              const id = v ?? ""
              setSelectedProjectId(id)
              void loadRecon(id)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="בחרו פרויקט" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.internal_project_code} · {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <UnassignedItemsCard
        unassignedItems={unassignedItems}
        contractItems={contractItems}
        onAssign={handleAssign}
        onBulkAssign={handleBulkAssign}
      />

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>פערי צריכה מול התקדמות</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              טוען נתוני התאמה…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              אין נתונים זמינים לפרויקט שנבחר.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-start">סעיף</TableHead>
                    <TableHead className="text-start">תיאור</TableHead>
                    <TableHead className="text-start">כמות חוזה</TableHead>
                    <TableHead className="text-start">צריכת מחסן</TableHead>
                    <TableHead className="text-start">צריכה (%)</TableHead>
                    <TableHead className="text-start">דווח AI (%)</TableHead>
                    <TableHead className="text-start">פער (%)</TableHead>
                    <TableHead className="text-start">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.contractItemId}
                      className={
                        row.severity === "red"
                          ? "bg-red-500/15"
                          : row.severity === "orange"
                            ? "bg-orange-500/15"
                            : ""
                      }
                    >
                      <TableCell className="font-mono">{row.sectionCode}</TableCell>
                      <TableCell>{row.description}</TableCell>
                      <TableCell className="tabular-nums">
                        {row.contractQty.toLocaleString("he-IL", {
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {row.inventoryConsumedQty.toLocaleString("he-IL", {
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell className="tabular-nums font-medium">
                        {row.inventoryConsumedPct.toLocaleString("he-IL", {
                          maximumFractionDigits: 2,
                        })}
                        %
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {row.reportedProgressPct.toLocaleString("he-IL", {
                          maximumFractionDigits: 2,
                        })}
                        %
                      </TableCell>
                      <TableCell className="tabular-nums font-semibold">
                        {row.gapPct.toLocaleString("he-IL", {
                          maximumFractionDigits: 2,
                        })}
                        %
                      </TableCell>
                      <TableCell>
                        {row.severity === "red" ? (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="size-3" aria-hidden />
                            פער חריג מאוד
                          </Badge>
                        ) : row.severity === "orange" ? (
                          <Badge className="bg-orange-600 text-white hover:bg-orange-600">
                            פער צריכה
                          </Badge>
                        ) : (
                          <Badge variant="outline">תקין</Badge>
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
