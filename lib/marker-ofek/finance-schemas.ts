import { z } from "zod"

export const moPaymentMethodSchema = z.enum([
  "bank_transfer",
  "check",
  "cash",
  "credit_card",
  "other",
])

export const createReceiptInputSchema = z.object({
  receiptDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך לא תקין"),
  paymentMethod: moPaymentMethodSchema,
  reference: z.string().max(200).optional(),
  amount: z.coerce.number().positive("סכום חייב להיות חיובי"),
  entityId: z.string().uuid("לקוח לא תקין"),
  projectId: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).optional(),
  allocations: z
    .array(
      z.object({
        invoiceId: z.string().uuid(),
        amount: z.coerce.number().positive(),
      })
    )
    .default([]),
})

export type CreateReceiptInput = z.infer<typeof createReceiptInputSchema>

export const journalLineInputSchema = z.object({
  accountCode: z.string().min(1),
  debit: z.coerce.number().min(0),
  credit: z.coerce.number().min(0),
  memo: z.string().optional(),
})

export const createJournalEntryInputSchema = z
  .object({
    entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reference: z.string().min(1).max(120),
    description: z.string().max(500).optional(),
    projectId: z.string().uuid().nullable().optional(),
    sourceType: z.string().max(40).optional(),
    sourceId: z.string().uuid().optional(),
    lines: z.array(journalLineInputSchema).min(2),
  })
  .superRefine((data, ctx) => {
    let dr = 0
    let cr = 0
    for (let i = 0; i < data.lines.length; i++) {
      const line = data.lines[i]!
      if (line.debit > 0 && line.credit > 0) {
        ctx.addIssue({
          code: "custom",
          message: "שורה לא יכולה לכלול חובה וזכות יחד",
          path: ["lines", i],
        })
      }
      if (line.debit === 0 && line.credit === 0) {
        ctx.addIssue({
          code: "custom",
          message: "חובה או זכות חייבים להיות חיוביים",
          path: ["lines", i],
        })
      }
      dr += line.debit
      cr += line.credit
    }
    if (Math.round(dr * 100) !== Math.round(cr * 100)) {
      ctx.addIssue({
        code: "custom",
        message: `כפל קלט לא מאוזן: חובה ${dr.toFixed(2)} זכות ${cr.toFixed(2)}`,
        path: ["lines"],
      })
    }
  })

export type CreateJournalEntryInput = z.infer<typeof createJournalEntryInputSchema>
