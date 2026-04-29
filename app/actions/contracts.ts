"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { apiErrorPayload, type ApiErrorPayload } from "@/lib/api/api-error"
import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { formatError } from "@/lib/format-error"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

type ActionSuccess<T> = { ok: true; data: T }
type ActionResult<T> = ActionSuccess<T> | ApiErrorPayload

const createContractSchema = z.object({
  contractNumber: z.string().trim().min(1, "מספר חוזה הוא שדה חובה"),
  title: z.string().trim().min(2, "שם חוזה הוא שדה חובה"),
  projectId: z.string().uuid("יש לבחור פרויקט תקין"),
  businessPartnerId: z.string().uuid().optional().nullable(),
  paymentTerms: z.string().trim().optional(),
  totalAmount: z.coerce.number().min(0, "סכום חוזה חייב להיות חיובי או אפס"),
  retentionPercent: z.coerce.number().min(0).max(100),
  insurancePercent: z.coerce.number().min(0).max(100).optional(),
})

async function resolveActionContext() {
  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.id) {
    return {
      ok: false as const,
      error: apiErrorPayload("UNAUTHORIZED", "User must be authenticated"),
    }
  }

  const cookieStore = await cookies()
  const companyId = resolveCompanyContext(cookieStore.get(COMPANY_COOKIE_KEY)?.value)
  if (!companyId) return { ok: false as const, error: apiErrorPayload("BAD_REQUEST", "חסר הקשר חברה בסשן") }

  return {
    ok: true as const,
    supabase,
    userId: user.id,
    companyId,
  }
}

export async function createSubcontractContractAction(
  input: z.input<typeof createContractSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = createContractSchema.safeParse(input)
    if (!parsed.success) {
      return apiErrorPayload(
        "VALIDATION_ERROR",
        parsed.error.issues.map((issue) => issue.message).join(" · ") || "Invalid input"
      )
    }

    const ctx = await resolveActionContext()
    if (!ctx.ok) return ctx.error

    const projectRes = await ctx.supabase
      .from("pbc_projects")
      .select("id")
      .eq("company_id", ctx.companyId)
      .eq("id", parsed.data.projectId)
      .maybeSingle()

    if (projectRes.error) {
      return apiErrorPayload("PROJECT_RESOLVE_FAILED", projectRes.error.message)
    }
    if (!projectRes.data) {
      return apiErrorPayload("PROJECT_RESOLVE_FAILED", "Project not found for active company")
    }

    if (parsed.data.businessPartnerId) {
      const partnerRes = await ctx.supabase
        .from("erp_master_business_partners")
        .select("id")
        .eq("company_id", ctx.companyId)
        .eq("id", parsed.data.businessPartnerId)
        .maybeSingle()

      if (partnerRes.error) {
        return apiErrorPayload("PARTNER_RESOLVE_FAILED", partnerRes.error.message)
      }
      if (!partnerRes.data) {
        return apiErrorPayload(
          "PARTNER_RESOLVE_FAILED",
          "Business partner not found for active company"
        )
      }
    }

    const insertRes = await ctx.supabase
      .from("ctr_contracts")
      .insert({
        company_id: ctx.companyId,
        contract_number: parsed.data.contractNumber,
        pbc_project_id: parsed.data.projectId,
        business_partner_id: parsed.data.businessPartnerId ?? null,
        title: parsed.data.title,
        total_amount: parsed.data.totalAmount,
        payment_terms: parsed.data.paymentTerms?.trim() || null,
        retention_percent: parsed.data.retentionPercent,
        insurance_percent: parsed.data.insurancePercent ?? 0,
        status: "DRAFT",
      })
      .select("id")
      .single()

    if (insertRes.error) {
      return apiErrorPayload("CONTRACT_CREATE_FAILED", insertRes.error.message)
    }

    const contractId = String(insertRes.data?.id ?? "")
    if (!contractId) {
      return apiErrorPayload("CONTRACT_CREATE_FAILED", "Contract created without returned id")
    }

    revalidatePath("/marker-ofek/contracts")
    revalidatePath(`/marker-ofek/contracts/${contractId}`)
    return { ok: true, data: { id: contractId } }
  } catch (error) {
    return apiErrorPayload("CONTRACT_CREATE_FAILED", formatError(error))
  }
}
