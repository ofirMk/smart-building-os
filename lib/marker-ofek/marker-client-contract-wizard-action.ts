"use server"

import { createErpContract } from "@/lib/marker-ofek/erp-contract-create-action"
import { clientContractWizardSchema } from "@/lib/marker-ofek/erp-validation-schemas"
import { formatError } from "@/lib/utils"

export async function submitClientContractWizardAction(
  raw: unknown
): Promise<
  | { ok: true; contractId: string }
  | { ok: false; error: string }
> {
  try {
    const parsed = clientContractWizardSchema.safeParse(raw)
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(" · ")
      return { ok: false, error: msg || "נתוני טופס לא תקינים" }
    }
    const d = parsed.data
    const startDate = new Date().toISOString().slice(0, 10)
    const displayName = d.contractDisplayName

    if (d.contractKind === "lump-sum") {
      return createErpContract({
        projectId: d.projectId,
        clientEntityId: d.clientEntityId,
        startDate,
        contractType: "main_contract",
        pricingModel: "paushal",
        contractDisplayName: displayName,
        retentionPct: d.retentionPct,
        insurancePct: 0,
        testingPct: 0,
        paushalTotalValue: 0.01,
        paushalRows: [
          {
            sectionCode: "00",
            description: "טיוטה — יש להשלים סכומים בעריכת חוזה",
            weightPct: 100,
          },
        ],
      })
    }

    return createErpContract({
      projectId: d.projectId,
      clientEntityId: d.clientEntityId,
      startDate,
      contractType: "main_contract",
      pricingModel: "boq",
      contractDisplayName: displayName,
      retentionPct: d.retentionPct,
      insurancePct: 0,
      testingPct: 0,
      boqRows: [
        {
          sectionCode: "00",
          description: "טיוטה — יש להשלים כמויות ומחירים בעריכת חוזה",
          unit: "יח׳",
          quantity: 1,
          unitPrice: 0.01,
        },
      ],
    })
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
