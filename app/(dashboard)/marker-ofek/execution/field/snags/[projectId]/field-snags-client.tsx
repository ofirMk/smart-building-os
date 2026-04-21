"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createFieldSnagAction } from "@/lib/marker-ofek/field-ops-actions"
import { formatError } from "@/lib/utils"

export type FieldSnagRow = {
  id: string
  title: string
  deduction_amount_ils: number
  status: string
  created_at: string
  contract_id: string | null
}

export type FieldSnagContractOption = {
  id: string
  label: string
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result ?? ""))
    r.onerror = () => reject(new Error("קריאת קובץ נכשלה"))
    r.readAsDataURL(file)
  })
}

export default function FieldSnagsClient({
  projectId,
  initialSnags,
  contracts,
}: {
  projectId: string
  initialSnags: FieldSnagRow[]
  contracts: FieldSnagContractOption[]
}) {
  const router = useRouter()
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [amount, setAmount] = React.useState("")
  const [contractId, setContractId] = React.useState<string>("")
  const [files, setFiles] = React.useState<string[]>([])
  const [saving, setSaving] = React.useState(false)

  async function onFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files
    if (!list?.length) return
    const urls: string[] = []
    const max = Math.min(list.length, 6)
    for (let i = 0; i < max; i++) {
      const f = list[i]!
      if (f.size > 900_000) {
        toast.error(`הקובץ ${f.name} גדול מדי (מקס׳ ~900KB)`)
        continue
      }
      try {
        urls.push(await readFileAsDataUrl(f))
      } catch {
        toast.error(`לא ניתן לקרוא את ${f.name}`)
      }
    }
    setFiles((prev) => [...prev, ...urls].slice(0, 6))
    e.target.value = ""
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await createFieldSnagAction({
        projectId,
        contractId: contractId.trim() || null,
        title,
        description: description.trim() || undefined,
        deductionAmountIlsPositive: Number(amount),
        photoDataUrls: files,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(
        "הליקוי נרשם. שורת קיזוז תיווצר אוטומטית בחשבון החלקי הבא של אותו חוזה."
      )
      setTitle("")
      setDescription("")
      setAmount("")
      setContractId("")
      setFiles([])
      router.refresh()
    } catch (err) {
      toast.error(formatError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg flex-col gap-8 px-4 py-8" dir="rtl">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            ליקויים וקיזוזים
          </h1>
          <p className="mt-1 text-sm font-light text-slate-500">
            צילומים וסכום קיזוז — יתווספו כשורה שלילית בחשבון חלקי הבא (חוזה
            נבחר).
          </p>
        </div>
        <Link
          href={`/marker-ofek/execution/gantt/${projectId}/field`}
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          משימות היום
        </Link>
      </div>

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="mb-10 grid gap-4 rounded-2xl border border-slate-100 bg-card p-5 shadow-sm"
      >
        <div className="grid gap-2">
          <Label>חוזה (קבלן משנה)</Label>
          <Select
            value={contractId || "__none__"}
            onValueChange={(v) =>
              setContractId(v === "__none__" || !v ? "" : v)
            }
          >
            <SelectTrigger className="w-full font-light">
              <SelectValue placeholder="ללא — קיזוז ימתין לשיוך חוזה" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">ללא חוזה (שמירה כללית)</SelectItem>
              {contracts.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="snag-title">כותרת</Label>
          <Input
            id="snag-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="font-light"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="snag-desc">תיאור</Label>
          <Textarea
            id="snag-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="font-light"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="snag-amt">סכום קיזוז (₪, חיובי)</Label>
          <Input
            id="snag-amt"
            type="number"
            min={1}
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            dir="ltr"
            className="font-mono"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="snag-ph">תמונות (עד 6)</Label>
          <Input
            id="snag-ph"
            type="file"
            accept="image/*"
            multiple
            className="font-light"
            onChange={(e) => void onFilesChange(e)}
          />
          {files.length > 0 ? (
            <p className="text-xs text-slate-500">{files.length} קבצים נטענו</p>
          ) : null}
        </div>
        <Button
          type="submit"
          className="bg-slate-900 text-white hover:bg-slate-800"
          disabled={saving}
        >
          {saving ? "שולח…" : "דיווח ליקוי"}
        </Button>
      </form>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-400">
          אחרונים
        </h2>
        <ul className="space-y-2">
          {initialSnags.length === 0 ? (
            <li className="text-sm font-light text-slate-500">אין רשומות.</li>
          ) : (
            initialSnags.map((s) => (
              <li
                key={s.id}
                className="rounded-xl border border-slate-100 bg-background/60 px-3 py-3 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-slate-800">{s.title}</span>
                  <span
                    className="font-mono text-xs text-rose-600 tabular-nums"
                    dir="ltr"
                  >
                    {s.deduction_amount_ils} ₪
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  {s.status} ·{" "}
                  <span dir="ltr">{s.created_at.slice(0, 10)}</span>
                </p>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
