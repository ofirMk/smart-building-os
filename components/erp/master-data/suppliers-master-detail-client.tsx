"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Building2, Landmark, Loader2, Plus, UserRound } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
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
import { cn } from "@/lib/utils"

type SupplierType = "STANDARD" | "SUBCONTRACTOR"

type SupplierContact = {
  id: string
  companyId: string
  supplierId: string
  name: string
  role: string | null
  phone: string | null
  email: string | null
}

type SupplierBankAccount = {
  id: string
  companyId: string
  supplierId: string
  bankName: string
  branchNumber: string | null
  accountNumber: string
}

type SupplierRecord = {
  id: string
  companyId: string
  supplierNumber: string
  name: string
  foreignName: string | null
  address: string | null
  phone: string | null
  email: string | null
  taxId: string
  paymentTerms: string
  vatCode: string
  supplierType: SupplierType
  contacts?: SupplierContact[]
  bankAccounts?: SupplierBankAccount[]
}

const supplierCreateSchema = z.object({
  supplierNumber: z.string().trim().optional(),
  name: z.string().trim().min(2, "שם ספק חייב להכיל לפחות 2 תווים"),
  supplierType: z.enum(["STANDARD", "SUBCONTRACTOR"]),
  foreignName: z.string().trim().optional(),
  address: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), "אימייל לא תקין"),
  taxId: z.string().trim().min(3, "ח.פ / עוסק מורשה הוא שדה חובה"),
  paymentTerms: z.string().trim().min(2, "יש להזין תנאי תשלום"),
  vatCode: z.string().trim().min(2, "יש להזין קוד מע\"מ"),
})

const supplierContactSchema = z.object({
  name: z.string().trim().min(2, "שם איש קשר חייב להכיל לפחות 2 תווים"),
  role: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), "אימייל לא תקין"),
})

const supplierBankSchema = z.object({
  bankName: z.string().trim().min(2, "יש להזין שם בנק"),
  branchNumber: z.string().trim().optional(),
  accountNumber: z.string().trim().min(2, "יש להזין מספר חשבון"),
})

type SupplierCreateInput = z.infer<typeof supplierCreateSchema>
type SupplierContactInput = z.infer<typeof supplierContactSchema>
type SupplierBankInput = z.infer<typeof supplierBankSchema>

type ApiResponse<T> = { data: T; error?: string }

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
  if (!response.ok) {
    throw new Error(payload.error ?? "API request failed")
  }
  return payload as T
}

function typeLabel(type: SupplierType): string {
  return type === "SUBCONTRACTOR" ? "SUBCONTRACTOR · קבלן משנה" : "STANDARD · ספק"
}

function typeBadgeClass(type: SupplierType): string {
  return type === "SUBCONTRACTOR"
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : "border-blue-200 bg-blue-50 text-blue-800"
}

export function SuppliersMasterDetailClient() {
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [suppliers, setSuppliers] = React.useState<SupplierRecord[]>([])
  const [selectedSupplierId, setSelectedSupplierId] = React.useState<string | null>(null)
  const [selectedSupplier, setSelectedSupplier] = React.useState<SupplierRecord | null>(null)
  const [loadingDetails, setLoadingDetails] = React.useState(false)
  const [detailsOpen, setDetailsOpen] = React.useState(false)
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)

  const supplierCreateForm = useForm<SupplierCreateInput>({
    resolver: zodResolver(supplierCreateSchema),
    defaultValues: {
      supplierNumber: "",
      name: "",
      supplierType: "STANDARD",
      foreignName: "",
      address: "",
      phone: "",
      email: "",
      taxId: "",
      paymentTerms: "NET30",
      vatCode: "VAT17",
    },
  })

  const contactForm = useForm<SupplierContactInput>({
    resolver: zodResolver(supplierContactSchema),
    defaultValues: { name: "", role: "", phone: "", email: "" },
  })

  const bankForm = useForm<SupplierBankInput>({
    resolver: zodResolver(supplierBankSchema),
    defaultValues: { bankName: "", branchNumber: "", accountNumber: "" },
  })

  const loadSuppliers = React.useCallback(async () => {
    setLoading(true)
    try {
      const result = await requestJson<ApiResponse<SupplierRecord[]>>("/api/suppliers")
      const rows = result.data ?? []
      setSuppliers(rows)
      setSelectedSupplierId((prev) => prev ?? rows[0]?.id ?? null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שגיאה בטעינת ספקים")
      setSuppliers([])
      setSelectedSupplierId(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadSupplierDetails = React.useCallback(async (supplierId: string) => {
    setLoadingDetails(true)
    try {
      const result = await requestJson<ApiResponse<SupplierRecord>>(`/api/suppliers/${supplierId}`)
      setSelectedSupplier(result.data)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שגיאה בטעינת פירוט ספק")
      setSelectedSupplier(null)
    } finally {
      setLoadingDetails(false)
    }
  }, [])

  React.useEffect(() => {
    void loadSuppliers()
  }, [loadSuppliers])

  React.useEffect(() => {
    if (!selectedSupplierId) {
      setSelectedSupplier(null)
      return
    }
    void loadSupplierDetails(selectedSupplierId)
  }, [loadSupplierDetails, selectedSupplierId])

  async function onCreateSupplier(values: SupplierCreateInput) {
    setSaving(true)
    try {
      const result = await requestJson<ApiResponse<SupplierRecord>>("/api/suppliers", {
        method: "POST",
        body: JSON.stringify({
          supplierNumber: values.supplierNumber || undefined,
          name: values.name,
          supplierType: values.supplierType,
          foreignName: values.foreignName || undefined,
          address: values.address || undefined,
          phone: values.phone || undefined,
          email: values.email || undefined,
          taxId: values.taxId,
          paymentTerms: values.paymentTerms,
          vatCode: values.vatCode,
        }),
      })
      toast.success("הספק נוצר בהצלחה")
      setCreateDialogOpen(false)
      supplierCreateForm.reset()
      await loadSuppliers()
      setSelectedSupplierId(result.data.id)
      setDetailsOpen(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "יצירת ספק נכשלה")
    } finally {
      setSaving(false)
    }
  }

  async function addContact(values: SupplierContactInput) {
    if (!selectedSupplier) return
    setSaving(true)
    try {
      const payloadContacts = [
        ...(selectedSupplier.contacts ?? []).map((c) => ({
          name: c.name,
          role: c.role,
          phone: c.phone,
          email: c.email,
        })),
        {
          name: values.name,
          role: values.role || null,
          phone: values.phone || null,
          email: values.email || null,
        },
      ]

      await requestJson<ApiResponse<SupplierRecord>>(`/api/suppliers/${selectedSupplier.id}`, {
        method: "PUT",
        body: JSON.stringify({ contacts: payloadContacts }),
      })
      toast.success("איש קשר נוסף בהצלחה")
      contactForm.reset()
      await loadSupplierDetails(selectedSupplier.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שמירת איש קשר נכשלה")
    } finally {
      setSaving(false)
    }
  }

  async function addBankAccount(values: SupplierBankInput) {
    if (!selectedSupplier) return
    setSaving(true)
    try {
      const payloadBanks = [
        ...(selectedSupplier.bankAccounts ?? []).map((b) => ({
          bankName: b.bankName,
          branchNumber: b.branchNumber,
          accountNumber: b.accountNumber,
        })),
        {
          bankName: values.bankName,
          branchNumber: values.branchNumber || null,
          accountNumber: values.accountNumber,
        },
      ]

      await requestJson<ApiResponse<SupplierRecord>>(`/api/suppliers/${selectedSupplier.id}`, {
        method: "PUT",
        body: JSON.stringify({ bankAccounts: payloadBanks }),
      })
      toast.success("חשבון בנק נוסף בהצלחה")
      bankForm.reset()
      await loadSupplierDetails(selectedSupplier.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שמירת חשבון בנק נכשלה")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div dir="rtl" className="min-h-[calc(100vh-10rem)] bg-[#F8FAFC] px-4 py-5 md:px-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-all">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-right">
              <h1 className="text-2xl font-semibold text-foreground">ספקים</h1>
              <p className="mt-1 text-sm text-slate-600">
                Master Data ארגוני לספקים, אנשי קשר וחשבונות בנק.
              </p>
            </div>
            <Button className="gap-2" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="size-4" aria-hidden />
              Create New Supplier
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-sm transition-all">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-background/80">
                  <TableHead className="text-right">מספר ספק</TableHead>
                  <TableHead className="text-right">שם</TableHead>
                  <TableHead className="text-right">סוג</TableHead>
                  <TableHead className="text-right">ח.פ/עוסק מורשה</TableHead>
                  <TableHead className="text-right">תנאי תשלום</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">
                      <span className="inline-flex items-center gap-2 text-sm text-slate-500">
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        טוען ספקים...
                      </span>
                    </TableCell>
                  </TableRow>
                ) : suppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-sm text-slate-500">
                      אין ספקים להצגה.
                    </TableCell>
                  </TableRow>
                ) : (
                  suppliers.map((supplier) => (
                    <TableRow
                      key={supplier.id}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-background",
                        selectedSupplierId === supplier.id && "bg-indigo-50/60 hover:bg-indigo-50/70"
                      )}
                      onClick={() => {
                        setSelectedSupplierId(supplier.id)
                        setDetailsOpen(true)
                      }}
                    >
                      <TableCell className="font-mono text-xs">{supplier.supplierNumber}</TableCell>
                      <TableCell className="font-medium">{supplier.name}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn("rounded-lg px-2.5 py-0.5 font-medium shadow-sm", typeBadgeClass(supplier.supplierType))}
                        >
                          {typeLabel(supplier.supplierType)}
                        </Badge>
                      </TableCell>
                      <TableCell>{supplier.taxId}</TableCell>
                      <TableCell>{supplier.paymentTerms}</TableCell>
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
            <DialogTitle>יצירת ספק חדש</DialogTitle>
            <DialogDescription>השלימו פרטי ספק בסיסיים לשמירה במאסטר דטה.</DialogDescription>
          </DialogHeader>
          <Form {...supplierCreateForm}>
            <form
              className="grid grid-cols-1 gap-3 md:grid-cols-2"
              onSubmit={supplierCreateForm.handleSubmit(onCreateSupplier)}
            >
              <FormField
                control={supplierCreateForm.control}
                name="supplierNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier Number</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={supplierCreateForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>שם ספק</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={supplierCreateForm.control}
                name="supplierType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>סוג ספק</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="בחר סוג ספק" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="STANDARD">STANDARD · ספק</SelectItem>
                        <SelectItem value="SUBCONTRACTOR">SUBCONTRACTOR · קבלן משנה</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={supplierCreateForm.control}
                name="taxId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tax ID</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={supplierCreateForm.control}
                name="paymentTerms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Terms</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={supplierCreateForm.control}
                name="vatCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>VAT Code</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={supplierCreateForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>טלפון</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={supplierCreateForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>אימייל</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={supplierCreateForm.control}
                name="address"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>כתובת</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
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
                    "יצירת ספק"
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
            <SheetTitle className="text-right">Supplier Detail</SheetTitle>
            <SheetDescription className="text-right">
              {selectedSupplier
                ? `${selectedSupplier.supplierNumber} · ${selectedSupplier.name}`
                : "בחרו ספק מהרשימה להצגת פרטים"}
            </SheetDescription>
          </SheetHeader>

          <div className="h-full overflow-y-auto bg-[#F8FAFC] p-4">
            {loadingDetails ? (
              <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-border bg-card shadow-sm">
                <p className="inline-flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  טוען פרטי ספק...
                </p>
              </div>
            ) : !selectedSupplier ? (
              <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-border bg-card shadow-sm">
                <p className="text-sm text-slate-500">אין ספק להצגה</p>
              </div>
            ) : (
              <Tabs defaultValue="general" className="space-y-4">
                <TabsList className="grid h-10 grid-cols-3 rounded-xl bg-card shadow-sm">
                  <TabsTrigger value="general">General Info</TabsTrigger>
                  <TabsTrigger value="contacts">אנשי קשר</TabsTrigger>
                  <TabsTrigger value="banks">חשבונות בנק</TabsTrigger>
                </TabsList>

                <TabsContent value="general" className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                      <p className="text-xs text-slate-500">כתובת</p>
                      <p className="mt-1 text-sm font-medium">{selectedSupplier.address || "—"}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                      <p className="text-xs text-slate-500">טלפון</p>
                      <p className="mt-1 text-sm font-medium">{selectedSupplier.phone || "—"}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                      <p className="text-xs text-slate-500">אימייל</p>
                      <p className="mt-1 text-sm font-medium">{selectedSupplier.email || "—"}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                      <p className="text-xs text-slate-500">VAT Code</p>
                      <p className="mt-1 text-sm font-medium">{selectedSupplier.vatCode || "—"}</p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="contacts" className="space-y-3">
                  <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                    <h3 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                      <UserRound className="size-4" aria-hidden />
                      הוספת איש קשר
                    </h3>
                    <Form {...contactForm}>
                      <form
                        className="grid grid-cols-1 gap-3 md:grid-cols-2"
                        onSubmit={contactForm.handleSubmit(addContact)}
                      >
                        <FormField
                          control={contactForm.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>שם</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={contactForm.control}
                          name="role"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>תפקיד</FormLabel>
                              <FormControl>
                                <Input {...field} value={field.value ?? ""} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={contactForm.control}
                          name="phone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>טלפון</FormLabel>
                              <FormControl>
                                <Input {...field} value={field.value ?? ""} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={contactForm.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>אימייל</FormLabel>
                              <FormControl>
                                <Input {...field} value={field.value ?? ""} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="md:col-span-2">
                          <Button type="submit" disabled={saving} className="gap-2">
                            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
                            הוסף איש קשר
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                    <h3 className="mb-3 text-sm font-semibold text-foreground">רשימת אנשי קשר</h3>
                    {(selectedSupplier.contacts ?? []).length === 0 ? (
                      <p className="text-sm text-slate-500">אין אנשי קשר לספק זה.</p>
                    ) : (
                      <div className="space-y-2">
                        {(selectedSupplier.contacts ?? []).map((contact) => (
                          <div key={contact.id} className="rounded-lg border border-border bg-background/60 p-3">
                            <p className="font-medium text-foreground">{contact.name}</p>
                            <p className="text-xs text-slate-600">
                              {contact.role || "—"} · {contact.phone || "—"} · {contact.email || "—"}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="banks" className="space-y-3">
                  <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                    <h3 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Landmark className="size-4" aria-hidden />
                      הוספת חשבון בנק
                    </h3>
                    <Form {...bankForm}>
                      <form
                        className="grid grid-cols-1 gap-3 md:grid-cols-3"
                        onSubmit={bankForm.handleSubmit(addBankAccount)}
                      >
                        <FormField
                          control={bankForm.control}
                          name="bankName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Bank Name</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={bankForm.control}
                          name="branchNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Branch Number</FormLabel>
                              <FormControl>
                                <Input {...field} value={field.value ?? ""} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={bankForm.control}
                          name="accountNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Account Number</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="md:col-span-3">
                          <Button type="submit" disabled={saving} className="gap-2">
                            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
                            הוסף חשבון
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                    <h3 className="mb-3 text-sm font-semibold text-foreground">רשימת חשבונות בנק</h3>
                    {(selectedSupplier.bankAccounts ?? []).length === 0 ? (
                      <p className="text-sm text-slate-500">אין חשבונות בנק לספק זה.</p>
                    ) : (
                      <div className="space-y-2">
                        {(selectedSupplier.bankAccounts ?? []).map((bank) => (
                          <div key={bank.id} className="rounded-lg border border-border bg-background/60 p-3">
                            <p className="font-medium text-foreground">{bank.bankName}</p>
                            <p className="text-xs text-slate-600">
                              סניף: {bank.branchNumber || "—"} · חשבון: {bank.accountNumber}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

