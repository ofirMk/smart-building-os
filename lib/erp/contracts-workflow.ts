import type { NextRequest } from "next/server"

import type { AppUserRole } from "@/lib/auth/user-role"
import type { ErpContractStatus } from "@/types/erp"

export const CONTRACT_STATUS_LABELS: Record<ErpContractStatus, string> = {
  DRAFT: "טיוטה",
  PENDING_APPROVAL: "ממתין לאישור",
  ACTIVE: "פעיל",
  CLOSED: "סגור",
}

export const CONTRACT_STATUS_TRANSITIONS: Record<
  ErpContractStatus,
  readonly ErpContractStatus[]
> = {
  DRAFT: ["PENDING_APPROVAL", "CLOSED"],
  PENDING_APPROVAL: ["ACTIVE", "DRAFT"],
  ACTIVE: ["CLOSED"],
  CLOSED: [],
}

export function normalizeContractStatus(value: unknown): ErpContractStatus | null {
  if (typeof value !== "string") return null
  const status = value.trim().toUpperCase()
  if (
    status === "DRAFT" ||
    status === "PENDING_APPROVAL" ||
    status === "ACTIVE" ||
    status === "CLOSED"
  ) {
    return status
  }
  return null
}

export function canTransitionContractStatus(args: {
  from: ErpContractStatus
  to: ErpContractStatus
  actorRole: AppUserRole | null
}): { ok: true } | { ok: false; reason: string } {
  const { from, to, actorRole } = args
  if (from === to) return { ok: true }
  const allowed = CONTRACT_STATUS_TRANSITIONS[from]
  if (!allowed.includes(to)) {
    return { ok: false, reason: `Transition ${from} -> ${to} is not allowed` }
  }
  if (from === "PENDING_APPROVAL" && to === "ACTIVE") {
    const isManager =
      actorRole === "admin" || actorRole === "manager" || actorRole === "property_manager"
    if (!isManager) {
      return { ok: false, reason: "Only Manager role can activate a pending contract" }
    }
  }
  return { ok: true }
}

export function resolveActorRoleFromRequest(req: NextRequest): AppUserRole | null {
  const headerValue = req.headers.get("x-user-role")?.trim().toLowerCase() ?? null
  if (
    headerValue === "admin" ||
    headerValue === "manager" ||
    headerValue === "property_manager" ||
    headerValue === "tenant" ||
    headerValue === "contractor"
  ) {
    return headerValue
  }
  return null
}

