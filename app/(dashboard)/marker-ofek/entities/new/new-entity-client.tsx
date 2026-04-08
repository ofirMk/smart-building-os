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
import {
  listErpPaymentTermsForEntityForm,
  quickCreateEntity,
} from "@/lib/marker-ofek/erp-quick-create-actions"
import { cn, formatError } from "@/lib/utils"

type EntityKind = "client" | "supplier" | "subcontractor"

const FINANCIAL_KINDS: EntityKind[] = ["supplier", "subcontractor", "client"]

export function NewEntityClient({
  initialKind,
}: {
  /** מסלול הקמת מזמין (לקוח) — מ־/marker-ofek/customers/new */
  initialKind?: EntityKind
} = {}) {
  const [kind, setKind] = React.useState<EntityKind>(initialKind ?? "supplier")
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [phone, setPhone] = React.useState("")

  React.useEffect(() => {
    if (initialKind) setKind(initialKind)
  }, [initialKind])
  const [legalId, setLegalId] = React.useState("")
  const [address, setAddress] = React.useState("")
  const [pending, setPending] = React.useState(false)

  const [taxId, setTaxId] = React.useState("")
  const [erpSupplierNumber, setErpSupplierNumber] = React.useState("")
  const [erpCustomerNumber, setErpCustomerNumber] = React.useState("")
  const [paymentTermCode, setPaymentTermCode] = React.useState<string>("")
  const [withholdingTaxPct, setWithholdingTaxPct] = React.useState("")
  const [bookkeepingCertExpiresAt, setBookkeepingCertExpiresAt] =
    React.useState("")
  const [withholdingTaxExpiresAt, setWithholdingTaxExpiresAt] =
    React.useState("")
  const [glAccountCode, setGlAccountCode] = React.useState("")

  const [paymentTerms, setPaymentTerms] = React.useState<
    { code: string; label: string }[]
  >([])

  React.useEffect(() => {
    void listErpPaymentTermsForEntityForm().then(setPaymentTerms)
  }, [])

  const supplierNeedsLegal =
    kind === "supplier" || kind === "subcontractor"
  const showFinancialDetails = FINANCIAL_KINDS.includes(kind)

  const canSave =
    name.trim().length >= 2 && (!supplierNeedsLegal || legalId.trim().length > 0)

  function resetFinancialFields() {
    setTaxId("")
    setErpSupplierNumber("")
    setErpCustomerNumber("")
    setPaymentTermCode("")
    setWithholdingTaxPct("")
    setBookkeepingCertExpiresAt("")
    setWithholdingTaxExpiresAt("")
    setGlAccountCode("")
  }

  function financialPayload() {
    const pctRaw = withholdingTaxPct.trim().replace(",", ".")
    const pctParsed =
      pctRaw === "" ? null : Number.parseFloat(pctRaw)
    const pct =
      pctParsed != null && Number.isFinite(pctParsed) ? pctParsed : null
    return {
      tax_id: taxId.trim() || null,
      erp_supplier_number: erpSupplierNumber.trim() || null,
      erp_customer_number: erpCustomerNumber.trim() || null,
      payment_term_code: paymentTermCode.trim() || null,
      withholding_tax_pct: pct,
      bookkeeping_cert_expiry: bookkeepingCertExpiresAt.trim() || null,
      withholding_tax_expiry: withholdingTaxExpiresAt.trim() || null,
      gl_account_code: glAccountCode.trim() || null,
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!canSave) {
      toast.error(
        supplierNeedsLegal
          ? "שם (2+ תווים) וח.פ / ע.מ חובה לספק או קבלן משנה"
          : "שם חובה (לפחות 2 תווים)"
      )
      return
    }
    setPending(true)
    try {
      const payload = {
        name: name.trim(),
        type: kind,
        legal_id: legalId.trim() || undefined,
        address: address.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        ...(showFinancialDetails ? financialPayload() : {}),
      }

      const res = await quickCreateEntity(payload)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("הישות נשמרה ב-MDM")
      setName("")
      setLegalId("")
      setAddress("")
      setEmail("")
      setPhone("")
      resetFinancialFields()
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
      className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-12 pt-2"
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
            <CardDescription>
              ספק וקבלן משנה דורשים ח.פ / ע.מ (אכיפת שרת + DB).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>סוג</Label>
              <Select
                value={kind}
                onValueChange={(v) =>
                  setKind((v as EntityKind) ?? "supplier")
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="supplier">ספק</SelectItem>
                  <SelectItem value="subcontractor">קבלן משנה</SelectItem>
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
                className={cn(
                  !canSave &&
                    name.length > 0 &&
                    name.trim().length < 2 &&
                    "border-destructive"
                )}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ent-email">אימייל</Label>
                <Input
                  id="ent-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  dir="ltr"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ent-phone">טלפון</Label>
                <Input
                  id="ent-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  dir="ltr"
                  className="font-mono text-sm"
                />
              </div>
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

        {showFinancialDetails && (
          <Card className="border-2 border-primary/20 shadow-sm">
            <CardHeader className="space-y-1 border-b bg-muted/50 pb-4">
              <CardTitle className="text-xl font-bold tracking-tight text-foreground">
                פרטים פיננסיים והנהלת חשבונות
              </CardTitle>
              <CardDescription>
                כל השדות למטה ניתנים לעריכה — נשמרים ב-MDM יחד עם הישות.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                  <Label htmlFor="ent-tax-id">ח.פ / ע.מ (tax_id)</Label>
                  <Input
                    id="ent-tax-id"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    dir="ltr"
                    className="font-mono text-sm"
                    placeholder="מזהה מס / עוסק מורשה"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ent-erp-sup">
                    מספר ספק פריוריטי (erp_supplier_number)
                  </Label>
                  <Input
                    id="ent-erp-sup"
                    value={erpSupplierNumber}
                    onChange={(e) => setErpSupplierNumber(e.target.value)}
                    dir="ltr"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ent-erp-cust">
                    מספר לקוח פריוריטי (erp_customer_number)
                  </Label>
                  <Input
                    id="ent-erp-cust"
                    value={erpCustomerNumber}
                    onChange={(e) => setErpCustomerNumber(e.target.value)}
                    dir="ltr"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label>תנאי תשלום (payment_term_code)</Label>
                  <Select
                    value={paymentTermCode || "__none__"}
                    onValueChange={(v) =>
                      setPaymentTermCode(
                        !v || v === "__none__" ? "" : v
                      )
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="בחרו קוד" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">לא נבחר</SelectItem>
                      {paymentTerms.map((t) => (
                        <SelectItem key={t.code} value={t.code}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ent-wh-pct">
                    % ניכוי מס במקור (withholding_tax_pct)
                  </Label>
                  <Input
                    id="ent-wh-pct"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step="any"
                    value={withholdingTaxPct}
                    onChange={(e) => setWithholdingTaxPct(e.target.value)}
                    dir="ltr"
                    className="font-mono text-sm"
                    placeholder="0–100"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ent-gl">
                    כרטיס הנה״ח (gl_account_code)
                  </Label>
                  <Input
                    id="ent-gl"
                    value={glAccountCode}
                    onChange={(e) => setGlAccountCode(e.target.value)}
                    dir="ltr"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ent-book-exp">
                    תוקף אישור ניהול ספרים (bookkeeping_cert_expiry)
                  </Label>
                  <Input
                    id="ent-book-exp"
                    type="date"
                    value={bookkeepingCertExpiresAt}
                    onChange={(e) =>
                      setBookkeepingCertExpiresAt(e.target.value)
                    }
                    dir="ltr"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ent-wh-exp">
                    תוקף אישור ניכוי מס (withholding_tax_expiry)
                  </Label>
                  <Input
                    id="ent-wh-exp"
                    type="date"
                    value={withholdingTaxExpiresAt}
                    onChange={(e) =>
                      setWithholdingTaxExpiresAt(e.target.value)
                    }
                    dir="ltr"
                    className="font-mono text-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        <Button type="submit" disabled={pending || !canSave} className="gap-2">
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          שמירה
        </Button>
      </form>
    </div>
  )
}
