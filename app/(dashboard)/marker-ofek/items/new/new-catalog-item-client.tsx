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
import { quickCreateCatalogItem } from "@/lib/marker-ofek/erp-quick-create-actions"
import { quickCatalogItemSchema } from "@/lib/marker-ofek/erp-validation-schemas"
import { cn, formatError } from "@/lib/utils"

export function NewCatalogItemClient() {
  const [sku, setSku] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [category, setCategory] = React.useState("")
  const [unit, setUnit] = React.useState("")
  const [defaultPrice, setDefaultPrice] = React.useState("")
  const [pending, setPending] = React.useState(false)

  const draft = React.useMemo(
    () => ({
      sku: sku.trim(),
      description: description.trim(),
      category: category.trim(),
      unit: unit.trim() || undefined,
      defaultPrice:
        defaultPrice.trim() === ""
          ? null
          : Number.parseFloat(defaultPrice.replace(",", ".")),
    }),
    [sku, description, category, unit, defaultPrice]
  )

  const zod = React.useMemo(
    () => quickCatalogItemSchema.safeParse(draft),
    [draft]
  )

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!zod.success) {
      toast.error(zod.error.issues.map((i) => i.message).join(" · "))
      return
    }
    setPending(true)
    try {
      const res = await quickCreateCatalogItem({
        sku: zod.data.sku,
        description: zod.data.description,
        category: zod.data.category,
        unit: zod.data.unit,
        defaultPrice: zod.data.defaultPrice,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("הפריט נשמר בקטלוג")
      setSku("")
      setDescription("")
      setCategory("")
      setUnit("")
      setDefaultPrice("")
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
        href="/marker-ofek/items"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        חזרה לקטלוג
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">פריט קטלוג חדש</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          קטגוריה חובה — ללא טקסט חופשי במקום שדות מאומתים.
        </p>
      </div>
      <form onSubmit={(e) => void handleSave(e)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>פרטי פריט</CardTitle>
            <CardDescription>מק״ט, תיאור, קטגוריה ויחידה.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="it-sku">מק״ט פנימי (חובה)</Label>
              <Input
                id="it-sku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                dir="ltr"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="it-desc">תיאור (חובה)</Label>
              <Input
                id="it-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                dir="rtl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="it-cat">קטגוריה (חובה)</Label>
              <Input
                id="it-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                dir="rtl"
                className={cn(
                  !category.trim() && sku && description && "border-destructive"
                )}
                placeholder="למשל: חומרי בניין"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="it-unit">יחידה</Label>
              <Input
                id="it-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                dir="rtl"
                placeholder="מ״ר, יח׳, שעה…"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="it-price">מחיר ברירת מחדל</Label>
              <Input
                id="it-price"
                value={defaultPrice}
                onChange={(e) => setDefaultPrice(e.target.value)}
                dir="ltr"
                className="font-mono"
                inputMode="decimal"
              />
            </div>
          </CardContent>
        </Card>
        {!zod.success ? (
          <ul className="list-inside list-disc text-sm text-destructive">
            {zod.error.issues.map((issue, i) => (
              <li key={i}>{issue.message}</li>
            ))}
          </ul>
        ) : null}
        <Button type="submit" disabled={pending || !zod.success} className="gap-2">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          שמירה
        </Button>
      </form>
    </div>
  )
}
