"use client"

import Link from "next/link"
import * as React from "react"
import { Loader2, Save } from "lucide-react"
import { toast } from "sonner"

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
import { quickCreateEntity } from "@/lib/marker-ofek/erp-quick-create-actions"
import { cn, formatError } from "@/lib/utils"

type EntityKind = "client" | "supplier"

export function NewEntityClient() {
  const [kind, setKind] = React.useState<EntityKind>("supplier")
  const [name, setName] = React.useState("")
  const [legalId, setLegalId] = React.useState("")
  const [address, setAddress] = React.useState("")
  const [pending, setPending] = React.useState(false)

  const supplierNeedsLegal = kind === "supplier"
  const canSave =
    name.trim().length >= 2 && (!supplierNeedsLegal || legalId.trim().length > 0)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!canSave) {
      toast.error(
        supplierNeedsLegal
          ? "שם (2+ תווים) וח.פ / ע.מ חובה לספק"
          : "שם חובה (לפחות 2 תווים)"
      )
      return
    }
    setPending(true)
    try {
      const res = await quickCreateEntity({
        name: name.trim(),
        type: kind,
        legalId: legalId.trim() || undefined,
        address: address.trim() || undefined,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("הישות נשמרה ב-MDM")
      setName("")
      setLegalId("")
      setAddress("")
    } catch (err) {
      toast.error(formatError(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <div
      dir="rtl"
      lang="he"
      className="mx-auto flex w-full max-w-lg flex-col gap-6 pb-12 pt-2"
    >
      <Link
        href="/marker-ofek/entities"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        חזרה לישויות
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ישות חדשה</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          לקוח או ספק — מזהים רק דרך FK (לא טקסט חופשי בשדות קשר).
        </p>
      </div>
      <form onSubmit={(e) => void handleSave(e)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>סוג ופרטים</CardTitle>
            <CardDescription>ספק דורש ח.פ / ע.מ (אכיפת שרת + DB).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>סוג</Label>
              <Select
                value={kind}
                onValueChange={(v) => setKind((v as EntityKind) ?? "supplier")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="supplier">ספק</SelectItem>
                  <SelectItem value="client">לקוח (מזמין)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ent-name">שם (חובה)</Label>
              <Input
                id="ent-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                dir="rtl"
                className={cn(!canSave && name.length > 0 && name.trim().length < 2 && "border-destructive")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ent-legal">
                ח.פ / ע.מ {supplierNeedsLegal ? "(חובה)" : "(אופציונלי)"}
              </Label>
              <Input
                id="ent-legal"
                value={legalId}
                onChange={(e) => setLegalId(e.target.value)}
                dir="ltr"
                className={cn(
                  "font-mono",
                  supplierNeedsLegal &&
                    !legalId.trim() &&
                    name.trim().length >= 2 &&
                    "border-destructive ring-2 ring-destructive/25"
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ent-addr">כתובת</Label>
              <Input
                id="ent-addr"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                dir="rtl"
              />
            </div>
          </CardContent>
        </Card>
        <Button type="submit" disabled={pending || !canSave} className="gap-2">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          שמירה
        </Button>
      </form>
    </div>
  )
}
