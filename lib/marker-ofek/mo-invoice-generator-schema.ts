import { z } from "zod"

export const moInvoiceLineInputSchema = z.object({
  description: z.string().trim().min(1, "תיאור שורה חובה").max(600),
  quantity: z.coerce.number().positive("כמות חייבת להיות חיובית").max(1e9),
  unitPrice: z.coerce.number().min(0, "מחיר יחידה שלילי").max(1e12),
})

export const moInvoiceCreateInputSchema = z
  .object({
    entityId: z.string().uuid("בחרו לקוח"),
    projectId: z.string().uuid().optional().nullable(),
    contractId: z.string().uuid().optional().nullable(),
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך לא תקין"),
    documentCopyLabel: z.enum(["מקור", "העתק"]),
    vatRatePercent: z.coerce
      .number()
      .min(0, "מע״מ לא תקין")
      .max(100, "מע״מ לא תקין"),
    lines: z.array(moInvoiceLineInputSchema).min(1, "נדרשת לפחות שורה אחת"),
  })
  .strict()

export type MoInvoiceCreateInput = z.infer<typeof moInvoiceCreateInputSchema>
export type MoInvoiceLineInput = z.infer<typeof moInvoiceLineInputSchema>
