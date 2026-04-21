"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Boxes, Loader2, Plus, Save } from "lucide-react"
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { COMPANY_COOKIE_KEY, type CompanyContextId, resolveCompanyContext } from "@/lib/company-context"
import { cn } from "@/lib/utils"

type ProductFamily = {
  id: string
  companyId: string
  code: string
  name: string
}

type ItemRecord = {
  id: string
  companyId: string
  sku: string
  description: string
  foreignDescription: string | null
  uom: string
  familyId: string
  isInventoryManaged: boolean
  status: string
  family: ProductFamily | null
}

type ApiResponse<T> = { data: T; error?: string }

const itemSchema = z.object({
  sku: z.string().trim().min(2, "מק\"ט חייב להכיל לפחות 2 תווים"),
  description: z.string().trim().min(2, "תיאור חייב להכיל לפחות 2 תווים"),
  foreignDescription: z.string().trim().optional(),
  uom: z.string().trim().min(1, "יש להזין יחידת מידה"),
  familyId: z.string().trim().min(1, "יש לבחור משפחת מוצר"),
  isInventoryManaged: z.boolean(),
  status: z.string().trim().min(1, "יש להזין סטטוס"),
})

type ItemFormInput = z.infer<typeof itemSchema>

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

export function ItemsMasterDetailClient() {
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [items, setItems] = React.useState<ItemRecord[]>([])
  const [families, setFamilies] = React.useState<ProductFamily[]>([])
  const [selectedItemId, setSelectedItemId] = React.useState<string | null>(null)
  const [selectedItem, setSelectedItem] = React.useState<ItemRecord | null>(null)
  const [detailsOpen, setDetailsOpen] = React.useState(false)
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)

  const createForm = useForm<ItemFormInput, undefined, ItemFormInput>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      sku: "",
      description: "",
      foreignDescription: "",
      uom: "EA",
      familyId: "",
      isInventoryManaged: false,
      status: "ACTIVE",
    },
  })

  const detailForm = useForm<ItemFormInput, undefined, ItemFormInput>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      sku: "",
      description: "",
      foreignDescription: "",
      uom: "EA",
      familyId: "",
      isInventoryManaged: false,
      status: "ACTIVE",
    },
  })

  const loadFamilies = React.useCallback(async () => {
    const result = await requestJson<ApiResponse<ProductFamily[]>>("/api/product-families")
    setFamilies(result.data ?? [])
  }, [])

  const loadItems = React.useCallback(async () => {
    setLoading(true)
    try {
      const result = await requestJson<ApiResponse<ItemRecord[]>>("/api/items")
      const rows = result.data ?? []
      setItems(rows)
      setSelectedItemId((prev) => prev ?? rows[0]?.id ?? null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שגיאה בטעינת קטלוג פריטים")
      setItems([])
      setSelectedItemId(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadItemDetails = React.useCallback(async (itemId: string) => {
    try {
      const result = await requestJson<ApiResponse<ItemRecord>>(`/api/items/${itemId}`)
      setSelectedItem(result.data)
      detailForm.reset({
        sku: result.data.sku,
        description: result.data.description,
        foreignDescription: result.data.foreignDescription ?? "",
        uom: result.data.uom,
        familyId: result.data.familyId,
        isInventoryManaged: result.data.isInventoryManaged,
        status: result.data.status,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שגיאה בטעינת פרטי פריט")
      setSelectedItem(null)
    }
  }, [detailForm])

  React.useEffect(() => {
    void Promise.all([loadFamilies(), loadItems()]).catch(() => null)
  }, [loadFamilies, loadItems])

  React.useEffect(() => {
    if (!selectedItemId) {
      setSelectedItem(null)
      return
    }
    void loadItemDetails(selectedItemId)
  }, [loadItemDetails, selectedItemId])

  async function createItem(values: ItemFormInput) {
    setSaving(true)
    try {
      const result = await requestJson<ApiResponse<ItemRecord>>("/api/items", {
        method: "POST",
        body: JSON.stringify(values),
      })
      toast.success("הפריט נוצר בהצלחה")
      createForm.reset({
        sku: "",
        description: "",
        foreignDescription: "",
        uom: "EA",
        familyId: "",
        isInventoryManaged: false,
        status: "ACTIVE",
      })
      setCreateDialogOpen(false)
      await loadItems()
      setSelectedItemId(result.data.id)
      setDetailsOpen(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "יצירת פריט נכשלה")
    } finally {
      setSaving(false)
    }
  }

  async function saveItemDetails(values: ItemFormInput) {
    if (!selectedItem) return
    setSaving(true)
    try {
      await requestJson<ApiResponse<ItemRecord>>(`/api/items/${selectedItem.id}`, {
        method: "PUT",
        body: JSON.stringify(values),
      })
      toast.success("פרטי הפריט נשמרו")
      await Promise.all([loadItems(), loadItemDetails(selectedItem.id)])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שמירת פריט נכשלה")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div dir="rtl" className="min-h-[calc(100vh-10rem)] bg-[#F8FAFC] px-4 py-5 md:px-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-right">
              <h1 className="text-2xl font-semibold text-foreground">קטלוג פריטים</h1>
              <p className="mt-1 text-sm text-slate-600">
                Master Data ארגוני לפריטים, שיוך משפחות מוצר וניהול מלאי.
              </p>
            </div>
            <Button className="gap-2" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="size-4" aria-hidden />
              Create New Item
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-background/80">
                  <TableHead className="text-right">מק"ט</TableHead>
                  <TableHead className="text-right">תיאור</TableHead>
                  <TableHead className="text-right">יחידת מידה</TableHead>
                  <TableHead className="text-right">מנוהל מלאי</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      <span className="inline-flex items-center gap-2 text-sm text-slate-500">
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        טוען פריטים...
                      </span>
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-sm text-slate-500">
                      אין פריטים להצגה.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow
                      key={item.id}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-background",
                        selectedItemId === item.id && "bg-indigo-50/60 hover:bg-indigo-50/70"
                      )}
                      onClick={() => {
                        setSelectedItemId(item.id)
                        setDetailsOpen(true)
                      }}
                    >
                      <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                      <TableCell className="font-medium">{item.description}</TableCell>
                      <TableCell>{item.uom}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            item.isInventoryManaged
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                              : "border-slate-200 bg-background text-slate-700"
                          }
                        >
                          {item.isInventoryManaged ? "כן" : "לא"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>יצירת פריט חדש</DialogTitle>
            <DialogDescription>הגדירו פריט חדש בקטלוג הארגוני.</DialogDescription>
          </DialogHeader>
          <Form {...createForm}>
            <form className="grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={createForm.handleSubmit(createItem)}>
              <FormField
                control={createForm.control}
                name="sku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="uom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>UOM</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
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
                control={createForm.control}
                name="foreignDescription"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Foreign Description</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="familyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>משפחת מוצר</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="בחר משפחה" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {families.map((family) => (
                          <SelectItem key={family.id} value={family.id}>
                            {family.code} · {family.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="isInventoryManaged"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                      <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                      מנוהל מלאי
                    </label>
                  </FormItem>
                )}
              />
              <DialogFooter className="md:col-span-2">
                <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  ביטול
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="me-1 size-4 animate-spin" aria-hidden />
                      שומר...
                    </>
                  ) : (
                    "יצירת פריט"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent
          side="left"
          className="w-[min(92vw,920px)] max-w-[920px] bg-card p-0 sm:max-w-[920px]"
        >
          <SheetHeader className="border-b border-border bg-card">
            <SheetTitle className="text-right">כרטיס פריט</SheetTitle>
            <SheetDescription className="text-right">
              {selectedItem ? `${selectedItem.sku} · ${selectedItem.description}` : "בחרו פריט להצגה"}
            </SheetDescription>
          </SheetHeader>

          <div className="h-full overflow-y-auto bg-[#F8FAFC] p-4">
            {!selectedItem ? (
              <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-border bg-card shadow-sm">
                <p className="text-sm text-slate-500">אין פריט להצגה</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <h3 className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Boxes className="size-4" aria-hidden />
                  עריכת פריט
                </h3>
                <Form {...detailForm}>
                  <form className="grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={detailForm.handleSubmit(saveItemDetails)}>
                    <FormField
                      control={detailForm.control}
                      name="sku"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>SKU</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={detailForm.control}
                      name="uom"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>UOM</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={detailForm.control}
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
                      control={detailForm.control}
                      name="foreignDescription"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel>Foreign Description</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value ?? ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={detailForm.control}
                      name="familyId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>משפחת מוצר</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="בחר משפחה" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {families.map((family) => (
                                <SelectItem key={family.id} value={family.id}>
                                  {family.code} · {family.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={detailForm.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={detailForm.control}
                      name="isInventoryManaged"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                            <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                            מנוהל מלאי
                          </label>
                        </FormItem>
                      )}
                    />
                    <div className="md:col-span-2">
                      <Button type="submit" disabled={saving} className="gap-2">
                        {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
                        שמירת שינויים
                      </Button>
                    </div>
                  </form>
                </Form>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

