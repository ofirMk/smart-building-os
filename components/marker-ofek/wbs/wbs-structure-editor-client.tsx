"use client"

import * as React from "react"
import {
  ChevronRight,
  FileText,
  FolderTree,
  GripVertical,
  Loader2,
  Paperclip,
  Plus,
  Save,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  applyWbsStructureToProject,
  cloneWbsStructureFromTemplate,
  getWbsStructureForEditor,
  listWbsStructures,
  saveWbsAsTemplate,
  saveWbsStructure,
  type WbsEditorTreeNode,
  type WbsStructureRow,
} from "@/lib/marker-ofek/wbs-structure-actions"
import { computeWbsCodeMapForTree } from "@/lib/marker-ofek/wbs-code-numbering"
import { WbsNodeVaultDialog, isPersistedWbsNodeId } from "@/components/marker-ofek/wbs/wbs-node-vault-dialog"
import { listWbsNodeIdsWithPlanLinksForStructure } from "@/lib/marker-ofek/wbs-plan-link-actions"
import {
  getNodeAtPath,
  insertSiblingAfterPath,
  reorderSiblingInParent,
} from "@/lib/marker-ofek/wbs-tree-edit-utils"
import { formatError } from "@/lib/utils"

function newTreeNode(): WbsEditorTreeNode {
  const id =
    typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto
      ? `n-${globalThis.crypto.randomUUID()}`
      : `n-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  return { id, label: "", sort_order: 0, children: [] }
}

function TreeRows({
  nodes,
  parentPath,
  depth,
  codeMap,
  vaultProjectId,
  nodesWithPlanLinks,
  onOpenVault,
  onChange,
  registerInputRef,
  onEnterSibling,
  onEscapeToParent,
  onReorderSibling,
}: {
  nodes: WbsEditorTreeNode[]
  parentPath: number[]
  depth: number
  codeMap: Map<string, string>
  vaultProjectId: string | null
  nodesWithPlanLinks: Set<string>
  onOpenVault: (node: WbsEditorTreeNode, code: string) => void
  onChange: (next: WbsEditorTreeNode[]) => void
  registerInputRef: (id: string, el: HTMLInputElement | null) => void
  onEnterSibling: (path: number[]) => void
  onEscapeToParent: (path: number[]) => void
  onReorderSibling: (parentPath: number[], fromIndex: number, toIndex: number) => void
}) {
  function updateAt(index: number, patch: Partial<WbsEditorTreeNode>) {
    const next = nodes.map((n, i) => (i === index ? { ...n, ...patch } : n))
    onChange(next)
  }

  function updateChildren(index: number, children: WbsEditorTreeNode[]) {
    const next = nodes.map((n, i) => (i === index ? { ...n, children } : n))
    onChange(next)
  }

  function removeAt(index: number) {
    onChange(nodes.filter((_, i) => i !== index))
  }

  function addChild(index: number) {
    const next = nodes.map((n, i) =>
      i === index ? { ...n, children: [...n.children, newTreeNode()] } : n
    )
    onChange(next)
  }

  return (
    <ul className="space-y-1">
      {nodes.map((node, index) => {
        const path = [...parentPath, index]
        return (
        <li key={node.id}>
          <div
            className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-white px-2 py-2 text-indigo-900"
            style={{ marginInlineStart: depth * 16 }}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = "move"
            }}
            onDrop={(e) => {
              e.preventDefault()
              const raw = e.dataTransfer.getData("application/json")
              if (!raw) return
              try {
                const parsed = JSON.parse(raw) as { pp?: number[]; i?: number }
                const pp = Array.isArray(parsed.pp) ? parsed.pp.map(Number) : []
                const from = Number(parsed.i)
                if (!Number.isFinite(from)) return
                if (pp.length !== parentPath.length || pp.some((v, j) => v !== parentPath[j])) {
                  toast.error("ניתן לגרור רק בין אחים באותה רמה")
                  return
                }
                onReorderSibling(parentPath, from, index)
              } catch {
                /* ignore */
              }
            }}
          >
            <div
              className="flex shrink-0 cursor-grab text-slate-400 active:cursor-grabbing"
              draggable
              title="גרירה לסידור מחדש"
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  "application/json",
                  JSON.stringify({ pp: parentPath, i: index })
                )
                e.dataTransfer.effectAllowed = "move"
              }}
            >
              <GripVertical className="size-4" aria-hidden />
            </div>
            <ChevronRight className="size-4 shrink-0 text-slate-400" aria-hidden />
            <span
              className="min-w-[2.75rem] shrink-0 select-none font-currency-mono text-xs tabular-nums text-indigo-900"
              title={`קוד נגזר מהעץ (לא ניתן לעריכה) · ${node.id}`}
            >
              {codeMap.get(node.id) ?? "—"}
            </span>
            {nodesWithPlanLinks.has(node.id) ? (
              <span title="מסמכים מקושרים לצומת זה" className="shrink-0 text-indigo-700">
                <Paperclip className="size-4" aria-hidden />
              </span>
            ) : null}
            <Input
              ref={(el) => registerInputRef(node.id, el)}
              value={node.label}
              onChange={(e) => updateAt(index, { label: e.target.value })}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.ctrlKey &&
                  !e.altKey &&
                  !e.metaKey
                ) {
                  e.preventDefault()
                  onEnterSibling(path)
                }
                if (e.key === "Escape") {
                  e.preventDefault()
                  onEscapeToParent(path)
                }
              }}
              placeholder="שם שלב / משימה / תת־משימה"
              className="min-w-[12rem] flex-1 border-slate-100 bg-white font-sans text-sm text-indigo-900 placeholder:text-slate-400"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 border-slate-100 text-xs text-indigo-900"
              onClick={() => addChild(index)}
            >
              <Plus className="size-3.5" aria-hidden />
              תת־רמה
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 border-slate-100 text-xs text-indigo-900"
              title="צרף מסמך מהכספת"
              disabled={!vaultProjectId || !isPersistedWbsNodeId(node.id)}
              onClick={() => onOpenVault(node, codeMap.get(node.id) ?? "")}
            >
              <FileText className="size-3.5" aria-hidden />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 text-destructive hover:text-destructive"
              onClick={() => removeAt(index)}
            >
              <Trash2 className="size-3.5" aria-hidden />
            </Button>
          </div>
          {node.children.length > 0 ? (
            <TreeRows
              nodes={node.children}
              parentPath={path}
              depth={depth + 1}
              codeMap={codeMap}
              vaultProjectId={vaultProjectId}
              nodesWithPlanLinks={nodesWithPlanLinks}
              onOpenVault={onOpenVault}
              onChange={(ch) => updateChildren(index, ch)}
              registerInputRef={registerInputRef}
              onEnterSibling={onEnterSibling}
              onEscapeToParent={onEscapeToParent}
              onReorderSibling={onReorderSibling}
            />
          ) : null}
        </li>
        )
      })}
    </ul>
  )
}

type ProjectOpt = { id: string; name: string; internal_project_code: string }

export function WbsStructureEditorClient({ projects }: { projects: ProjectOpt[] }) {
  const [structureId, setStructureId] = React.useState<string | null>(null)
  const [name, setName] = React.useState("מבנה חדש")
  const [isTemplate, setIsTemplate] = React.useState(true)
  const [projectId, setProjectId] = React.useState("")
  const [tree, setTree] = React.useState<WbsEditorTreeNode[]>(() => [newTreeNode()])
  const [saving, setSaving] = React.useState(false)
  const [structures, setStructures] = React.useState<WbsStructureRow[]>([])
  const [loadOpen, setLoadOpen] = React.useState(false)
  const [loadPick, setLoadPick] = React.useState("")
  const [tplOpen, setTplOpen] = React.useState(false)
  const [tplName, setTplName] = React.useState("")
  const [applyOpen, setApplyOpen] = React.useState(false)
  const [applyProjectId, setApplyProjectId] = React.useState("")
  const [applyReplace, setApplyReplace] = React.useState(true)
  const [cloneOpen, setCloneOpen] = React.useState(false)
  const [clonePick, setClonePick] = React.useState("")
  const [cloneName, setCloneName] = React.useState("")
  const [cloneAsTemplate, setCloneAsTemplate] = React.useState(true)
  const [cloneProjectId, setCloneProjectId] = React.useState("")
  const [vaultOpen, setVaultOpen] = React.useState(false)
  const [vaultNode, setVaultNode] = React.useState<WbsEditorTreeNode | null>(null)
  const [vaultCode, setVaultCode] = React.useState("")
  const [nodesWithPlanLinks, setNodesWithPlanLinks] = React.useState<Set<string>>(() => new Set())

  const inputRefs = React.useRef<Map<string, HTMLInputElement>>(new Map())
  const focusAfterTreeCommitRef = React.useRef<string | null>(null)
  const treeRef = React.useRef(tree)
  treeRef.current = tree

  const registerInputRef = React.useCallback((id: string, el: HTMLInputElement | null) => {
    if (el) inputRefs.current.set(id, el)
    else inputRefs.current.delete(id)
  }, [])

  React.useLayoutEffect(() => {
    const id = focusAfterTreeCommitRef.current
    if (!id) return
    focusAfterTreeCommitRef.current = null
    const el = inputRefs.current.get(id)
    if (el) {
      el.focus()
      const len = el.value.length
      try {
        el.setSelectionRange(len, len)
      } catch {
        /* ignore */
      }
    }
  }, [tree])

  const handleEnterSibling = React.useCallback((path: number[]) => {
    const nn = newTreeNode()
    focusAfterTreeCommitRef.current = nn.id
    setTree((t) => insertSiblingAfterPath(t, path, nn))
  }, [])

  const handleReorderSibling = React.useCallback(
    (parentPath: number[], fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return
      setTree((t) => reorderSiblingInParent(t, parentPath, fromIndex, toIndex))
    },
    []
  )

  const handleEscapeToParent = React.useCallback((path: number[]) => {
    if (path.length <= 1) {
      ;(document.activeElement as HTMLElement | null)?.blur()
      return
    }
    const parentPath = path.slice(0, -1)
    const parent = getNodeAtPath(treeRef.current, parentPath)
    if (!parent) {
      ;(document.activeElement as HTMLElement | null)?.blur()
      return
    }
    requestAnimationFrame(() => {
      const el = inputRefs.current.get(parent.id)
      if (el) {
        el.focus()
        const len = el.value.length
        try {
          el.setSelectionRange(len, len)
        } catch {
          /* ignore */
        }
      }
    })
  }, [])

  const wbsCodeMap = React.useMemo(() => computeWbsCodeMapForTree(tree), [tree])
  const vaultProjectId = React.useMemo(
    () => (isTemplate ? null : projectId.trim() || null),
    [isTemplate, projectId]
  )
  const templateStructures = React.useMemo(
    () => structures.filter((s) => s.is_template),
    [structures]
  )

  const refreshStructures = React.useCallback(async () => {
    try {
      const list = await listWbsStructures()
      setStructures(list)
    } catch (e) {
      toast.error(formatError(e))
    }
  }, [])

  React.useEffect(() => {
    void refreshStructures()
  }, [refreshStructures])

  const refreshPlanLinkFlags = React.useCallback(async () => {
    if (!structureId) {
      setNodesWithPlanLinks(new Set())
      return
    }
    try {
      const ids = await listWbsNodeIdsWithPlanLinksForStructure(structureId)
      setNodesWithPlanLinks(new Set(ids))
    } catch {
      setNodesWithPlanLinks(new Set())
    }
  }, [structureId])

  React.useEffect(() => {
    void refreshPlanLinkFlags()
  }, [refreshPlanLinkFlags])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await saveWbsStructure({
        structureId,
        name,
        isTemplate,
        projectId: isTemplate ? null : projectId || null,
        tree,
      })
      setStructureId(res.structureId)
      if (res.tree?.length) setTree(res.tree)
      toast.success("המבנה נשמר")
      await refreshStructures()
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleLoad() {
    if (!loadPick) return
    setSaving(true)
    try {
      const bundle = await getWbsStructureForEditor(loadPick)
      if (!bundle) {
        toast.error("מבנה לא נמצא")
        return
      }
      setStructureId(bundle.structure.id)
      setName(bundle.structure.name)
      setIsTemplate(bundle.structure.is_template)
      setProjectId(bundle.structure.project_id ?? "")
      setTree(bundle.tree.length ? bundle.tree : [newTreeNode()])
      setLoadOpen(false)
      toast.success("נטען מהמסד")
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveTemplate() {
    if (!structureId) {
      toast.error("שמרו את המבנה לפני שמירה כתבנית")
      return
    }
    const n = tplName.trim()
    if (!n) {
      toast.error("שם תבנית נדרש")
      return
    }
    setSaving(true)
    try {
      await saveWbsAsTemplate(structureId, n)
      toast.success("נשמרה תבנית חדשה")
      setTplOpen(false)
      setTplName("")
      await refreshStructures()
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleCloneFromTemplate() {
    if (!clonePick) {
      toast.error("בחרו תבנית מקור")
      return
    }
    const n = cloneName.trim()
    if (!n) {
      toast.error("שם למבנה החדש נדרש")
      return
    }
    if (!cloneAsTemplate && !cloneProjectId.trim()) {
      toast.error("בחרו פרויקט למבנה שאינו תבנית")
      return
    }
    setSaving(true)
    try {
      const res = await cloneWbsStructureFromTemplate({
        sourceStructureId: clonePick,
        name: n,
        asTemplate: cloneAsTemplate,
        projectId: cloneAsTemplate ? null : cloneProjectId.trim(),
      })
      setStructureId(res.structureId)
      setName(n)
      setIsTemplate(cloneAsTemplate)
      setProjectId(cloneAsTemplate ? "" : cloneProjectId.trim())
      if (res.tree?.length) setTree(res.tree)
      setCloneOpen(false)
      setClonePick("")
      setCloneName("")
      toast.success("נוצר מבנה משוכפל")
      await refreshStructures()
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleApply() {
    if (!structureId) {
      toast.error("שמרו את המבנה לפני החלה")
      return
    }
    const pid = applyProjectId.trim()
    if (!pid) {
      toast.error("בחרו פרויקט יעד")
      return
    }
    setSaving(true)
    try {
      await applyWbsStructureToProject({
        structureId,
        projectId: pid,
        replaceExisting: applyReplace,
      })
      toast.success("המבנה הוחל על הפרויקט")
      setApplyOpen(false)
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 rounded-xl border border-slate-100 bg-white p-4 text-indigo-900 shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <FolderTree className="size-5 text-indigo-600" aria-hidden />
          <div>
            <h2 className="text-lg font-bold text-indigo-900">עורך מבנה WBS</h2>
            <p className="text-xs text-slate-600">
              שלב → משימה → תת־משימה. קוד WBS מספרי בלבד (1.2.3) נגזר מהעץ ואינו ניתן לעריכה.
              <span className="mt-1 block font-currency-mono text-[10px] text-indigo-700/90">
                Enter — אח חדש מתחת · Esc — מיקוד לשורת ההורה · גרירה — סידור אחים
              </span>
              שמירה כתבנית או שיוך לפרויקט, צירוף מסמכים מהכספת, והחלה לגאנט.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-slate-100"
            onClick={() => setLoadOpen(true)}
          >
            טעינת מבנה
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-slate-100"
            onClick={() => setCloneOpen(true)}
          >
            שכפול מתבנית
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-slate-100"
            disabled={!structureId}
            onClick={() => setTplOpen(true)}
          >
            שמור כתבנית
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-500"
            disabled={!structureId}
            onClick={() => setApplyOpen(true)}
          >
            החל על פרויקט
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs text-slate-500">שם מבנה</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border-slate-100"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-slate-500">סוג</Label>
          <Select
            value={isTemplate ? "template" : "project"}
            onValueChange={(v) => setIsTemplate(v === "template")}
          >
            <SelectTrigger className="border-slate-100">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="template">תבנית כללית</SelectItem>
              <SelectItem value="project">שיוך לפרויקט</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {!isTemplate ? (
          <div className="space-y-2 md:col-span-2">
            <Label className="text-xs text-slate-500">פרויקט</Label>
            <Select value={projectId || ""} onValueChange={(v) => setProjectId(v ?? "")}>
              <SelectTrigger className="border-slate-100">
                <SelectValue placeholder="בחרו פרויקט" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}{" "}
                    <span className="font-currency-mono text-slate-500 tabular-nums">
                      ({p.internal_project_code})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {structureId ? (
        <p className="font-currency-mono text-[11px] text-slate-500">
          מזהה מבנה: <span className="text-indigo-700">{structureId}</span>
        </p>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs text-slate-500">עץ המשימות</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 border-slate-100 text-xs"
            onClick={() => setTree((t) => [...t, newTreeNode()])}
          >
            <Plus className="size-3.5" aria-hidden />
            שלב ראשי (שורש)
          </Button>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-3">
          <TreeRows
            nodes={tree}
            parentPath={[]}
            depth={0}
            codeMap={wbsCodeMap}
            vaultProjectId={vaultProjectId}
            nodesWithPlanLinks={nodesWithPlanLinks}
            onOpenVault={(node, code) => {
              setVaultNode(node)
              setVaultCode(code)
              setVaultOpen(true)
            }}
            onChange={setTree}
            registerInputRef={registerInputRef}
            onEnterSibling={handleEnterSibling}
            onEscapeToParent={handleEscapeToParent}
            onReorderSibling={handleReorderSibling}
          />
        </div>
      </div>

      <div className="flex justify-end border-t border-slate-100 pt-4">
        <Button
          type="button"
          className="gap-2 bg-indigo-600 hover:bg-indigo-500"
          disabled={saving}
          onClick={() => void handleSave()}
        >
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
          שמירה
        </Button>
      </div>

      <Dialog open={loadOpen} onOpenChange={setLoadOpen}>
        <DialogContent className="border-slate-100 sm:max-w-md" showCloseButton dir="rtl">
          <DialogHeader>
            <DialogTitle>טעינת מבנה / תבנית</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-xs">בחרו מבנה</Label>
            <Select value={loadPick || ""} onValueChange={(v) => setLoadPick(v ?? "")}>
              <SelectTrigger className="border-slate-100">
                <SelectValue placeholder="רשימה" />
              </SelectTrigger>
              <SelectContent>
                {structures.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="font-sans">{s.name}</span>{" "}
                    <span className="font-currency-mono text-[10px] text-slate-400">
                      {s.id.slice(0, 8)}
                    </span>
                    {s.is_template ? " · תבנית" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button type="button" variant="outline" onClick={() => setLoadOpen(false)}>
              ביטול
            </Button>
            <Button type="button" onClick={() => void handleLoad()} disabled={saving || !loadPick}>
              טען
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cloneOpen} onOpenChange={setCloneOpen}>
        <DialogContent className="border-slate-100 sm:max-w-md" showCloseButton dir="rtl">
          <DialogHeader>
            <DialogTitle>שכפול מתבנית</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-2">
              <Label className="text-xs">תבנית מקור</Label>
              {templateStructures.length === 0 ? (
                <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  אין תבניות שמורות. שמרו מבנה קיים כתבנית או צרו תבנית חדשה.
                </p>
              ) : (
                <Select value={clonePick || ""} onValueChange={(v) => setClonePick(v ?? "")}>
                  <SelectTrigger className="border-slate-100">
                    <SelectValue placeholder="בחרו תבנית" />
                  </SelectTrigger>
                  <SelectContent>
                    {templateStructures.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs">שם למבנה החדש</Label>
              <Input
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value)}
                placeholder="למשל: Ir HaYin — שלד"
                className="border-slate-100"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">סוג</Label>
              <Select
                value={cloneAsTemplate ? "template" : "project"}
                onValueChange={(v) => setCloneAsTemplate(v === "template")}
              >
                <SelectTrigger className="border-slate-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="template">תבנית חדשה</SelectItem>
                  <SelectItem value="project">מבנה לפרויקט</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!cloneAsTemplate ? (
              <div className="space-y-2">
                <Label className="text-xs">פרויקט</Label>
                <Select
                  value={cloneProjectId || ""}
                  onValueChange={(v) => setCloneProjectId(v ?? "")}
                >
                  <SelectTrigger className="border-slate-100">
                    <SelectValue placeholder="בחרו פרויקט" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button type="button" variant="outline" onClick={() => setCloneOpen(false)}>
              ביטול
            </Button>
            <Button type="button" onClick={() => void handleCloneFromTemplate()} disabled={saving}>
              שכפל
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tplOpen} onOpenChange={setTplOpen}>
        <DialogContent className="border-slate-100 sm:max-w-md" showCloseButton dir="rtl">
          <DialogHeader>
            <DialogTitle>שמירה כתבנית</DialogTitle>
          </DialogHeader>
          <Input
            value={tplName}
            onChange={(e) => setTplName(e.target.value)}
            placeholder="שם התבנית"
            className="border-slate-100"
          />
          <DialogFooter className="gap-2 sm:justify-start">
            <Button type="button" variant="outline" onClick={() => setTplOpen(false)}>
              ביטול
            </Button>
            <Button type="button" onClick={() => void handleSaveTemplate()} disabled={saving}>
              שמור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="border-slate-100 sm:max-w-md" showCloseButton dir="rtl">
          <DialogHeader>
            <DialogTitle>החלת מבנה על פרויקט (גאנט)</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-2">
              <Label className="text-xs">פרויקט יעד</Label>
              <Select
                value={applyProjectId || ""}
                onValueChange={(v) => setApplyProjectId(v ?? "")}
              >
                <SelectTrigger className="border-slate-100">
                  <SelectValue placeholder="בחרו" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={applyReplace}
                onChange={(e) => setApplyReplace(e.target.checked)}
                className="rounded border-slate-300"
              />
              להחליף את כל משימות הלו״ז הקיימות בפרויקט (מומלץ לפני ייבוא נקי)
            </label>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button type="button" variant="outline" onClick={() => setApplyOpen(false)}>
              ביטול
            </Button>
            <Button type="button" onClick={() => void handleApply()} disabled={saving}>
              החל
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WbsNodeVaultDialog
        open={vaultOpen}
        onOpenChange={setVaultOpen}
        projectId={vaultProjectId}
        wbsNodeId={vaultNode?.id ?? ""}
        wbsCode={vaultCode}
        nodeLabel={vaultNode?.label}
        onChanged={() => void refreshPlanLinkFlags()}
      />
    </div>
  )
}
