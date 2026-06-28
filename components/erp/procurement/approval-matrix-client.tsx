"use client"

/**
 * Phase 14 — Approval Matrix Client Component
 *
 * Full CRUD management of erp_approval_matrix_rules.
 * Features:
 *   - Rules table (priority, name, active toggle, conditions summary, levels count)
 *   - Inline add / edit via Sheet drawer
 *   - Drag-based re-priority (via up/down arrows — no DnD library required)
 *   - Delete with protection for fallback rule
 */

import { useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
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
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

// ─── Types ────────────────────────────────────────────────────────────────────

type ApprovalLevel = {
  level: number
  role?: string
  user_id?: string
  amount_limit?: number
  label?: string
}

type MatrixRule = {
  id: string
  rule_name: string
  description: string | null
  priority_order: number
  is_active: boolean
  condition_json: {
    amount_min?: number
    amount_max?: number
    cost_center_codes?: string[]
    project_ids?: string[]
    supplier_ids?: string[]
    urgency_levels?: string[]
    po_type_codes?: string[]
  }
  approval_levels_json: ApprovalLevel[]
  updated_at?: string
}

type RuleForm = {
  rule_name: string
  description: string
  priority_order: string
  is_active: boolean
  amount_min: string
  amount_max: string
  urgency_levels: string
  po_type_codes: string
  levels: Array<{ role: string; label: string }>
}

const emptyForm = (): RuleForm => ({
  rule_name: "",
  description: "",
  priority_order: "10",
  is_active: true,
  amount_min: "",
  amount_max: "",
  urgency_levels: "",
  po_type_codes: "",
  levels: [{ role: "PROCUREMENT_MANAGER", label: "מנהל רכש" }],
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function conditionSummary(rule: MatrixRule): string {
  const parts: string[] = []
  const c = rule.condition_json
  if (c.amount_min != null || c.amount_max != null) {
    const min = c.amount_min != null ? `₪${c.amount_min.toLocaleString()}` : ""
    const max = c.amount_max != null ? `₪${c.amount_max.toLocaleString()}` : ""
    if (min && max) parts.push(`סכום ${min}–${max}`)
    else if (min) parts.push(`סכום ≥ ${min}`)
    else if (max) parts.push(`סכום ≤ ${max}`)
  }
  if (c.urgency_levels?.length) parts.push(`דחיפות: ${c.urgency_levels.join(", ")}`)
  if (c.po_type_codes?.length) parts.push(`סוג: ${c.po_type_codes.join(", ")}`)
  return parts.length ? parts.join(" | ") : "כל הזמנה"
}

function formToPayload(form: RuleForm) {
  const condition: MatrixRule["condition_json"] = {}
  if (form.amount_min) condition.amount_min = Number(form.amount_min)
  if (form.amount_max) condition.amount_max = Number(form.amount_max)
  if (form.urgency_levels.trim()) {
    condition.urgency_levels = form.urgency_levels
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  }
  if (form.po_type_codes.trim()) {
    condition.po_type_codes = form.po_type_codes
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  }

  const levels: ApprovalLevel[] = form.levels.map((l, i) => ({
    level: i + 1,
    role: l.role || undefined,
    label: l.label || undefined,
  }))

  return {
    rule_name: form.rule_name,
    description: form.description || null,
    priority_order: Number(form.priority_order),
    is_active: form.is_active,
    condition_json: condition,
    approval_levels_json: levels,
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ApprovalMatrixClient({ initialRules }: { initialRules: unknown[] }) {
  const [rules, setRules] = useState<MatrixRule[]>(initialRules as MatrixRule[])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<RuleForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // ── form helpers ──────────────────────────────────────────────────────────

  function openNew() {
    setEditingId(null)
    setForm(emptyForm())
    setDialogOpen(true)
  }

  function openEdit(rule: MatrixRule) {
    setEditingId(rule.id)
    setForm({
      rule_name: rule.rule_name,
      description: rule.description ?? "",
      priority_order: String(rule.priority_order),
      is_active: rule.is_active,
      amount_min: rule.condition_json.amount_min != null ? String(rule.condition_json.amount_min) : "",
      amount_max: rule.condition_json.amount_max != null ? String(rule.condition_json.amount_max) : "",
      urgency_levels: rule.condition_json.urgency_levels?.join(", ") ?? "",
      po_type_codes: rule.condition_json.po_type_codes?.join(", ") ?? "",
      levels: rule.approval_levels_json.map((l) => ({
        role: l.role ?? "",
        label: l.label ?? "",
      })),
    })
    setDialogOpen(true)
  }

  function setField<K extends keyof RuleForm>(k: K, v: RuleForm[K]) {
    setForm((prev) => ({ ...prev, [k]: v }))
  }

  function setLevel(i: number, k: keyof RuleForm["levels"][0], v: string) {
    setForm((prev) => {
      const levels = [...prev.levels]
      levels[i] = { ...levels[i], [k]: v }
      return { ...prev, levels }
    })
  }

  function addLevel() {
    setForm((prev) => ({
      ...prev,
      levels: [...prev.levels, { role: "", label: "" }],
    }))
  }

  function removeLevel(i: number) {
    setForm((prev) => ({
      ...prev,
      levels: prev.levels.filter((_, idx) => idx !== i),
    }))
  }

  // ── API calls ─────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.rule_name.trim() || !form.levels.length) {
      toast.error("שם כלל ורמת אישור אחת לפחות הם שדות חובה")
      return
    }
    setSaving(true)
    try {
      const payload = formToPayload(form)
      const url = editingId
        ? `/api/procurement/setup/approval-matrix/${editingId}`
        : "/api/procurement/setup/approval-matrix"
      const method = editingId ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json() as { data?: MatrixRule; error?: string }
      if (!res.ok) {
        toast.error((json.error as string | undefined) ?? "שגיאה בשמירה")
        return
      }

      if (editingId) {
        setRules((prev) => prev.map((r) => (r.id === editingId ? { ...r, ...payload } : r)))
        toast.success("כלל עודכן")
      } else {
        const newRule = { ...payload, id: (json.data as MatrixRule).id, updated_at: new Date().toISOString(), description: payload.description ?? null } as MatrixRule
        setRules((prev) => [...prev, newRule].sort((a, b) => a.priority_order - b.priority_order))
        toast.success("כלל נוסף")
      }
      setDialogOpen(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(rule: MatrixRule) {
    const newActive = !rule.is_active
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, is_active: newActive } : r)))
    const res = await fetch(`/api/procurement/setup/approval-matrix/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: newActive }),
    })
    if (!res.ok) {
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, is_active: !newActive } : r)))
      toast.error("שגיאה בעדכון סטטוס")
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/procurement/setup/approval-matrix/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const json = await res.json() as { error?: string; message?: string }
        toast.error((json.message as string | undefined) ?? "שגיאה במחיקה")
        return
      }
      setRules((prev) => prev.filter((r) => r.id !== id))
      toast.success("כלל נמחק")
    } finally {
      setDeletingId(null)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">מטריצת אישורים</h1>
          <p className="text-muted-foreground text-sm mt-1">
            הגדר כללי ניתוב דינמי להזמנות רכש — כלל ראשון שמתאים לתנאים מנצח.
          </p>
        </div>
        <Button onClick={openNew}>+ הוסף כלל</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16 text-right">עדיפות</TableHead>
            <TableHead className="text-right">שם כלל</TableHead>
            <TableHead className="text-right">תנאים</TableHead>
            <TableHead className="text-right">רמות אישור</TableHead>
            <TableHead className="text-right w-24">פעיל</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                אין כללים — לחץ &quot;הוסף כלל&quot; להתחיל
              </TableCell>
            </TableRow>
          )}
          {rules.map((rule) => (
            <TableRow key={rule.id} className={!rule.is_active ? "opacity-50" : ""}>
              <TableCell className="text-center font-mono text-sm">
                {rule.priority_order}
              </TableCell>
              <TableCell>
                <span className="font-medium">{rule.rule_name}</span>
                {rule.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{rule.description}</p>
                )}
                {rule.priority_order === 9999 && (
                  <Badge variant="secondary" className="mt-1 text-xs">ברירת מחדל</Badge>
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {conditionSummary(rule)}
              </TableCell>
              <TableCell>
                <div className="flex gap-1 flex-wrap">
                  {rule.approval_levels_json.map((l) => (
                    <Badge key={l.level} variant="outline" className="text-xs">
                      {l.label ?? l.role ?? `רמה ${l.level}`}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                <Switch
                  checked={rule.is_active}
                  onCheckedChange={() => handleToggleActive(rule)}
                  disabled={rule.priority_order === 9999}
                />
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openEdit(rule)}
                  >
                    עריכה
                  </Button>
                  {rule.priority_order !== 9999 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={deletingId === rule.id}
                      onClick={() => handleDelete(rule.id)}
                    >
                      מחק
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* ── Edit / Add Dialog ────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingId ? "עריכת כלל אישור" : "הוספת כלל אישור"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
            {/* Basic fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1 col-span-2">
                <Label>שם כלל *</Label>
                <Input
                  value={form.rule_name}
                  onChange={(e) => setField("rule_name", e.target.value)}
                  placeholder='לדוג׳ "הזמנות מעל 50,000 ₪"'
                />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>תיאור</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setField("description", e.target.value)}
                  rows={2}
                  placeholder="תיאור אופציונלי..."
                />
              </div>
              <div className="space-y-1">
                <Label>סדר עדיפות</Label>
                <Input
                  type="number"
                  min={0}
                  max={9998}
                  value={form.priority_order}
                  onChange={(e) => setField("priority_order", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">מספר נמוך = עדיפות גבוהה (1 מנצח 100)</p>
              </div>
              <div className="flex items-center gap-3 pt-5">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setField("is_active", v)}
                />
                <Label>כלל פעיל</Label>
              </div>
            </div>

            {/* Conditions */}
            <div className="border rounded-lg p-3 space-y-3">
              <p className="font-medium text-sm">תנאי הפעלה</p>
              <p className="text-xs text-muted-foreground">שדות ריקים = התאמה לכל ערך</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>סכום מינימום (₪)</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="ללא מינימום"
                    value={form.amount_min}
                    onChange={(e) => setField("amount_min", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>סכום מקסימום (₪)</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="ללא מקסימום"
                    value={form.amount_max}
                    onChange={(e) => setField("amount_max", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>רמות דחיפות (מופרדות בפסיק)</Label>
                  <Input
                    placeholder="URGENT, HIGH"
                    value={form.urgency_levels}
                    onChange={(e) => setField("urgency_levels", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>קודי סוג הזמנה</Label>
                  <Input
                    placeholder="CAPEX, OPEX"
                    value={form.po_type_codes}
                    onChange={(e) => setField("po_type_codes", e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Approval levels */}
            <div className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm">רמות אישור (בסדר)</p>
                <Button size="sm" variant="outline" onClick={addLevel} type="button">
                  + רמה
                </Button>
              </div>
              {form.levels.map((l, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="w-8 pt-2 text-center text-sm font-mono text-muted-foreground">{i + 1}</div>
                  <div className="flex-1 space-y-1">
                    <Input
                      placeholder="תפקיד (PROCUREMENT_MANAGER / CFO)"
                      value={l.role}
                      onChange={(e) => setLevel(i, "role", e.target.value)}
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Input
                      placeholder="תווית תצוגה (לדוג׳ מנהל רכש)"
                      value={l.label}
                      onChange={(e) => setLevel(i, "label", e.target.value)}
                    />
                  </div>
                  {form.levels.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive mt-0.5"
                      onClick={() => removeLevel(i)}
                      type="button"
                    >
                      ✕
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              ביטול
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "שומר..." : editingId ? "שמור שינויים" : "הוסף כלל"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
