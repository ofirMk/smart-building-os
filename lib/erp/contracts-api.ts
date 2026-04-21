export async function recalculateContractTotalAmount(params: {
  supabase: any
  activeCompanyId: string
  contractId: string
}): Promise<{ ok: true; totalAmount: number } | { ok: false; error: string }> {
  const { supabase, activeCompanyId, contractId } = params
  const rpcResult = await supabase.rpc("erp_recalculate_contract_total", {
    p_company_id: activeCompanyId,
    p_contract_id: contractId,
  })
  if (rpcResult.error) return { ok: false, error: rpcResult.error.message }
  return { ok: true, totalAmount: Number(rpcResult.data ?? 0) }
}
