"use server"

/**
 * Contract module entry points (Marker Ofek).
 *
 * Tender → active contract conversion is owned by
 * `lib/marker-ofek/tenders/tender-contract-actions.ts` (tender BoQ, links, RBAC).
 * Explicit async wrappers are required here — `export { fn } from "..."` breaks
 * the `"use server"` boundary in Next.js.
 */
import type { ConvertTenderToContractResult } from "@/lib/marker-ofek/tenders/tender-contract-actions"
import { convertTenderToContract as originalConvertTenderToContract } from "@/lib/marker-ofek/tenders/tender-contract-actions"

export type { ConvertTenderToContractResult }

export async function convertTenderToContract(
  tenderProjectId: string
): Promise<ConvertTenderToContractResult> {
  return await originalConvertTenderToContract(tenderProjectId)
}
