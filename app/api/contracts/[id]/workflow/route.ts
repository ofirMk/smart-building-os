import { type NextRequest, NextResponse } from "next/server"

import type { AppUserRole } from "@/lib/auth/user-role"
import {
  canTransitionContractStatus,
  CONTRACT_STATUS_TRANSITIONS,
  normalizeContractStatus,
  resolveActorRoleFromRequest,
} from "@/lib/erp/contracts-workflow"
import { requireMasterDataApiContext } from "@/lib/erp/master-data-api"
import type { ErpContractStatus } from "@/types/erp"

type WorkflowTrailRow = {
  id: string
  from_status: ErpContractStatus | null
  to_status: ErpContractStatus
  changed_at: string
  changed_by: string | null
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response

  const { id } = await Promise.resolve(params)
  const { supabase, activeCompanyId } = gate.ctx
  const contractResult = await supabase
    .from("erp_contracts")
    .select("id,status")
    .eq("id", id)
    .eq("company_id", activeCompanyId)
    .maybeSingle()
  if (contractResult.error) {
    return NextResponse.json({ error: contractResult.error.message }, { status: 500 })
  }
  if (!contractResult.data) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 })
  }

  const currentStatus = normalizeContractStatus(
    (contractResult.data as { status: string }).status
  )
  if (!currentStatus) {
    return NextResponse.json({ error: "Invalid status on contract" }, { status: 500 })
  }

  let actorRole = resolveActorRoleFromRequest(req)
  if (!actorRole) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user?.id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle()
      actorRole = ((profile as { role?: AppUserRole } | null)?.role ?? null)
    }
  }

  const destinations = CONTRACT_STATUS_TRANSITIONS[currentStatus].filter((to) =>
    canTransitionContractStatus({ from: currentStatus, to, actorRole }).ok
  )

  const trailResult = await supabase
    .from("erp_contract_status_events")
    .select("id,from_status,to_status,changed_at,changed_by")
    .eq("company_id", activeCompanyId)
    .eq("contract_id", id)
    .order("changed_at", { ascending: true })

  if (trailResult.error) {
    if (
      /relation .*erp_contract_status_events.* does not exist/i.test(
        trailResult.error.message
      )
    ) {
      return NextResponse.json({
        data: {
          currentStatus,
          allowedDestinations: destinations,
          actorRole,
          trail: [],
        },
      })
    }
    return NextResponse.json({ error: trailResult.error.message }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      currentStatus,
      allowedDestinations: destinations,
      actorRole,
      trail: (trailResult.data ?? []) as WorkflowTrailRow[],
    },
  })
}

