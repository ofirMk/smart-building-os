"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  ArrowDown,
  ArrowUp,
  Briefcase,
  ChevronDown,
  Layers,
  LayoutGrid,
  Pencil,
  Plus,
  ShoppingCart,
  Sparkles,
  Trash2,
  Wallet,
  type LucideIcon,
} from "lucide-react"

import {
  applyWorkspaceScenario,
  deleteWorkspaceScenario,
  saveCurrentViewAsScenario,
  updateWorkspaceScenarios,
} from "@/lib/marker-ofek/workspace-scenario-actions"
import type { WorkspaceScenario } from "@/lib/marker-ofek/workspace-types"
import { cn } from "@/lib/utils"
import { useSmartWorkspace } from "@/components/marker-ofek/workspace/smart-workspace-context"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"

const ICONS: Record<string, LucideIcon> = {
  "layout-grid": LayoutGrid,
  layers: Layers,
  briefcase: Briefcase,
  "shopping-cart": ShoppingCart,
  wallet: Wallet,
  sparkles: Sparkles,
}

function ScenarioIcon({ name }: { name: string }) {
  const Icon = ICONS[name] ?? LayoutGrid
  return <Icon className="size-3.5 shrink-0 text-emerald-700" aria-hidden />
}

export function WorkspaceScenarioSwitcher() {
  const router = useRouter()
  const ws = useSmartWorkspace()
  const [saveOpen, setSaveOpen] = React.useState(false)
  const [editOpen, setEditOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [localScenarios, setLocalScenarios] = React.useState<WorkspaceScenario[]>([])

  React.useEffect(() => {
    if (ws) setLocalScenarios(ws.workspaceScenarios)
  }, [ws?.workspaceScenarios])

  React.useEffect(() => {
    if (editOpen && ws) setLocalScenarios(ws.workspaceScenarios)
  }, [editOpen, ws])

  if (!ws) return null

  const active = ws.workspaceScenarios.find((s) => s.id === ws.activeScenarioId)

  async function onApply(id: string) {
    setPending(true)
    const res = await applyWorkspaceScenario(id)
    setPending(false)
    if (res.ok) router.refresh()
  }

  async function onSaveNew() {
    const n = name.trim()
    if (!n) return
    setPending(true)
    const res = await saveCurrentViewAsScenario({ name: n, icon: "layout-grid" })
    setPending(false)
    if (res.ok) {
      setSaveOpen(false)
      setName("")
      router.refresh()
    }
  }

  async function onDelete(id: string) {
    setPending(true)
    const res = await deleteWorkspaceScenario(id)
    setPending(false)
    if (res.ok) {
      setLocalScenarios((prev) => prev.filter((s) => s.id !== id))
      router.refresh()
    }
  }

  async function persistReorder(next: WorkspaceScenario[]) {
    setLocalScenarios(next)
    setPending(true)
    const res = await updateWorkspaceScenarios(next)
    setPending(false)
    if (res.ok) router.refresh()
  }

  function move(idx: number, delta: number) {
    const j = idx + delta
    if (j < 0 || j >= localScenarios.length) return
    const next = [...localScenarios]
    const t = next[idx]!
    next[idx] = next[j]!
    next[j] = t
    void persistReorder(next)
  }

  async function renameAt(id: string, newName: string) {
    const nn = newName.trim()
    if (!nn) return
    const next = localScenarios.map((s) => (s.id === id ? { ...s, name: nn } : s))
    setLocalScenarios(next)
    setPending(true)
    const res = await updateWorkspaceScenarios(next)
    setPending(false)
    if (res.ok) router.refresh()
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "inline-flex h-9 max-w-[11rem] items-center gap-1.5 rounded-md border border-slate-200 bg-card px-2.5 text-xs font-medium text-slate-800 shadow-sm outline-none transition hover:border-emerald-300/60 hover:bg-emerald-50/50 focus-visible:ring-2 focus-visible:ring-emerald-500/25 disabled:opacity-60",
            active && "border-emerald-300/80 bg-emerald-50/60"
          )}
          disabled={pending}
          aria-label="תרחישי שולחן עבודה"
        >
          <Layers className="size-3.5 shrink-0 text-emerald-600" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-start">
            {active?.name ?? "תרחישים"}
          </span>
          <ChevronDown className="size-3 shrink-0 opacity-60" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[14rem]">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            בחירת תרחיש
          </DropdownMenuLabel>
          {ws.workspaceScenarios.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">אין תרחישים שמורים</p>
          ) : (
            ws.workspaceScenarios.map((s) => (
              <DropdownMenuItem
                key={s.id}
                onClick={() => void onApply(s.id)}
                className={cn(
                  "gap-2 text-sm",
                  s.id === ws.activeScenarioId && "bg-emerald-50 font-medium text-emerald-950"
                )}
              >
                <ScenarioIcon name={s.icon} />
                <span className="truncate">{s.name}</span>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setName("")
              setSaveOpen(true)
            }}
            className="gap-2 text-sm"
          >
            <Plus className="size-3.5 text-emerald-600" aria-hidden />
            שמור תצוגה נוכחית כתרחיש…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditOpen(true)} className="gap-2 text-sm">
            <Pencil className="size-3.5 text-slate-600" aria-hidden />
            ניהול תרחישים…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>תרחיש חדש</DialogTitle>
            <DialogDescription>
              נשמרים: פריסת יהלום, ווידג׳טים נעוצים, פרסונה ומרכז הפיקוד.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="שם התרחיש"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-start"
          />
          <DialogFooter className="gap-2 sm:justify-start">
            <Button type="button" disabled={pending || !name.trim()} onClick={() => void onSaveNew()}>
              שמור
            </Button>
            <Button type="button" variant="outline" onClick={() => setSaveOpen(false)}>
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>ניהול תרחישים</DialogTitle>
            <DialogDescription>שינוי שם, סדר או מחיקה.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2">
            {localScenarios.map((s, idx) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-background/50 p-2"
              >
                <ScenarioIcon name={s.icon} />
                <RenameInline
                  initial={s.name}
                  onCommit={(nn) => void renameAt(s.id, nn)}
                />
                <div className="ms-auto flex items-center gap-0.5">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    disabled={pending || idx === 0}
                    aria-label="הזז למעלה"
                    onClick={() => move(idx, -1)}
                  >
                    <ArrowUp className="size-3.5" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    disabled={pending || idx === localScenarios.length - 1}
                    aria-label="הזז למטה"
                    onClick={() => move(idx, 1)}
                  >
                    <ArrowDown className="size-3.5" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8 text-red-600 hover:bg-red-50"
                    disabled={pending}
                    aria-label="מחק"
                    onClick={() => void onDelete(s.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              סגור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function RenameInline({
  initial,
  onCommit,
}: {
  initial: string
  onCommit: (name: string) => void
}) {
  const [v, setV] = React.useState(initial)
  React.useEffect(() => setV(initial), [initial])
  return (
    <Input
      className="h-8 min-w-[8rem] flex-1 text-start text-sm"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v.trim() !== initial.trim()) onCommit(v)
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur()
      }}
    />
  )
}
