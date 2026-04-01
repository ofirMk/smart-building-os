export type InvoiceStatus = "pending" | "paid"

export type InvoiceRow = {
  id: string
  tenant_id: string
  amount: string | number
  description: string
  due_date: string
  status: InvoiceStatus
  paid_at: string | null
  created_at: string
  updated_at: string
}

/** שורה מהשרת עם join לפרופיל (PostgREST עשוי להחזיר מערך) */
export type InvoiceWithTenant = InvoiceRow & {
  profiles:
    | { full_name: string | null; email: string | null }
    | { full_name: string | null; email: string | null }[]
    | null
}
