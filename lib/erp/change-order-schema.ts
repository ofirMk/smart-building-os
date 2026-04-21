import { z } from "zod"

export const ChangeOrderSchema = z
  .object({
    contractLineId: z.string().uuid().nullable().optional(),
    changeOrderNumber: z.string().trim().min(1),
    changeType: z.enum(["NEW_LINE", "QTY_CHANGE", "PRICE_CHANGE"]),
    newLineDescription: z.string().trim().nullable().optional(),
    qtyDelta: z.coerce.number().nullable().optional(),
    newUnitPrice: z.coerce.number().min(0).nullable().optional(),
    status: z
      .enum(["DRAFT", "PENDING_PRICE_APPROVAL", "ACTIVE", "APPROVED", "REJECTED"])
      .optional(),
    notes: z.string().trim().nullable().optional(),
    isExtraWork: z.boolean().optional(),
    isAdditionalWork: z.boolean().optional(),
    priceItemId: z.string().uuid().nullable().optional(),
    priceSupplierId: z.string().uuid().nullable().optional(),
    inheritanceRules: z.object({
      retentionPct: z.coerce.number().min(0).max(100),
      discountPct: z.coerce.number().min(0),
      indexationPct: z.coerce.number().min(0),
    }),
  })
  .superRefine((value, ctx) => {
    if (
      (value.changeType === "QTY_CHANGE" || value.changeType === "PRICE_CHANGE") &&
      !value.contractLineId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Source line is required for QTY/PRICE changes",
        path: ["contractLineId"],
      })
    }
    if (value.changeType === "NEW_LINE" && !value.newLineDescription?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Description is required for NEW_LINE",
        path: ["newLineDescription"],
      })
    }
  })

export type ChangeOrderInput = z.infer<typeof ChangeOrderSchema>

export const ChangeOrderPatchSchema = ChangeOrderSchema.partial().superRefine((value, ctx) => {
  const effectiveChangeType = value.changeType
  const hasContractLineField = value.contractLineId !== undefined
  if (
    (effectiveChangeType === "QTY_CHANGE" || effectiveChangeType === "PRICE_CHANGE") &&
    hasContractLineField &&
    !value.contractLineId
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Source line is required for QTY/PRICE changes",
      path: ["contractLineId"],
    })
  }
})

export type ChangeOrderPatchInput = z.infer<typeof ChangeOrderPatchSchema>
