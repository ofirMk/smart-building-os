/**
 * MASAV (מס"ב) File Generator — Sprint A.2.
 *
 * Produces a Bank-of-Israel `.001` formatted text file from an AP Payment Run.
 * The format is fixed-width ASCII (cp862-compatible Hebrew names are
 * transliterated to a safe subset to avoid encoding accidents at the bank).
 *
 * Reference layout (BOI MASAV "Mass Payment" — short form):
 *   Header  (rec type 1, 128 chars)
 *     positions 1-1   : record type ('1')
 *     positions 2-9   : sender institution code (8 digits, zero-pad)
 *     positions 10-17 : sender file serial (8 digits)
 *     positions 18-25 : creation date YYYYMMDD
 *     positions 26-33 : settlement date YYYYMMDD
 *     positions 34-43 : sender bank/branch/account (10 digits, zero-pad)
 *     positions 44-83 : sender name (40 chars, space-pad)
 *     positions 84-128: filler (45 spaces)
 *
 *   Detail (rec type 2, 128 chars), one per payment
 *     positions 1-1   : record type ('2')
 *     positions 2-9   : record sequence (8 digits)
 *     positions 10-12 : beneficiary bank code  (3 digits)
 *     positions 13-15 : beneficiary branch     (3 digits)
 *     positions 16-31 : beneficiary account no. (16 digits, zero-pad right)
 *     positions 32-46 : amount in agorot       (15 digits, zero-pad)
 *     positions 47-86 : beneficiary name       (40 chars)
 *     positions 87-101: external reference     (15 chars)
 *     positions 102-128: filler                (27 spaces)
 *
 *   Trailer (rec type 9, 128 chars)
 *     positions 1-1   : '9'
 *     positions 2-9   : record count (8 digits, includes header+detail+trailer)
 *     positions 10-24 : total amount in agorot (15 digits)
 *     positions 25-128: filler (104 spaces)
 *
 * NOTE: Real production MASAV has more fields & validations (control digits,
 * institution-pair table, modulo-checks). This MVP emits a structurally
 * correct file that banks accept for **test** uploads. Production hardening
 * (BOI ICR-spec § 6.2) is a Sprint A.3 concern.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

const REC_LENGTH = 128

export type MasavGenerateResult =
  | {
      ok: true
      content: string
      fileName: string
      summary: {
        recordCount: number
        totalAgorot: number
        totalIls: number
      }
    }
  | { ok: false; error: string }

type RunRow = {
  id: string
  company_id: string
  run_number: string
  run_date: string
  payment_method: string
  bank_account_id: string
  status: string
  total_amount: number
}

type BankAccountRow = {
  bank_code: string
  branch: string
  account_number: string
  account_alias: string
}

type PaymentRow = {
  id: string
  amount: number
  masav_record_seq: number | null
  reference: string | null
  supplier_id: string
  status: string
}

type SupplierRow = {
  id: string
  supplier_number: string
  name: string
  bank_code: string | null
  bank_branch: string | null
  bank_account_number: string | null
}

type CompanyRow = { id: string; display_name: string; legal_name: string | null }

/**
 * Pad a string on the right to a fixed length (truncates if too long).
 */
function padRight(s: string, len: number, fill: string = " "): string {
  const t = s.length > len ? s.slice(0, len) : s
  return t + fill.repeat(Math.max(0, len - t.length))
}

/**
 * Pad a string on the left to a fixed length (zero-pad numeric).
 */
function padLeft(s: string, len: number, fill: string = "0"): string {
  const t = s.length > len ? s.slice(s.length - len) : s
  return fill.repeat(Math.max(0, len - t.length)) + t
}

/**
 * Strip Hebrew + non-ASCII control chars to a safe transliteration.
 * Banks accept Hebrew via cp862, but to keep the .001 file portable we
 * collapse anything outside printable ASCII to a hyphen (matches BOI
 * "name in Latin chars" convention).
 */
function asciiSafe(s: string): string {
  return s
    .replace(/[\u0590-\u05FF]/g, "-")
    .replace(/[^\x20-\x7E]/g, "-")
    .trim()
}

function toAgorot(ils: number): number {
  return Math.round(ils * 100)
}

function digits(s: string | null | undefined): string {
  if (!s) return ""
  return s.replace(/\D+/g, "")
}

function fmtDateYmd(iso: string): string {
  // expects YYYY-MM-DD; emit YYYYMMDD.
  return iso.slice(0, 10).replace(/-/g, "")
}

/**
 * Generate the MASAV .001 file content for a payment run.
 * Read-only; does NOT mutate the run row (caller persists `masav_file_path`).
 */
export async function generateMasavFile(
  client: SupabaseClient,
  runId: string,
): Promise<MasavGenerateResult> {
  const { data: run, error: runErr } = await client
    .from("erp_ap_payment_runs")
    .select(
      "id, company_id, run_number, run_date, payment_method, bank_account_id, status, total_amount",
    )
    .eq("id", runId)
    .maybeSingle<RunRow>()
  if (runErr) return { ok: false, error: `Failed to load run: ${runErr.message}` }
  if (!run) return { ok: false, error: `Payment run ${runId} not found` }
  if (run.payment_method !== "MASAV") {
    return {
      ok: false,
      error: `Run ${run.run_number} is not a MASAV run (method=${run.payment_method}).`,
    }
  }

  const [bankRes, paymentsRes, companyRes] = await Promise.all([
    client
      .from("erp_bank_accounts")
      .select("bank_code, branch, account_number, account_alias")
      .eq("id", run.bank_account_id)
      .maybeSingle<BankAccountRow>(),
    client
      .from("erp_ap_payments")
      .select("id, amount, masav_record_seq, reference, supplier_id, status")
      .eq("company_id", run.company_id)
      .eq("run_id", run.id)
      .order("masav_record_seq", { ascending: true, nullsFirst: false }),
    client
      .from("erp_companies")
      .select("id, display_name, legal_name")
      .eq("id", run.company_id)
      .maybeSingle<CompanyRow>(),
  ])

  if (bankRes.error || !bankRes.data) {
    return { ok: false, error: `Bank account not found: ${bankRes.error?.message}` }
  }
  if (paymentsRes.error) {
    return { ok: false, error: `Failed to load payments: ${paymentsRes.error.message}` }
  }
  if (companyRes.error || !companyRes.data) {
    return { ok: false, error: `Company not found.` }
  }

  const payments = (paymentsRes.data ?? []) as PaymentRow[]
  if (payments.length === 0) {
    return { ok: false, error: `Run ${run.run_number} has no payments.` }
  }

  // Pull suppliers in one batch
  const supplierIds = [...new Set(payments.map((p) => p.supplier_id))]
  const { data: supplierRows, error: supErr } = await client
    .from("erp_md_suppliers")
    .select("id, supplier_number, name, bank_code, bank_branch, bank_account_number")
    .eq("company_id", run.company_id)
    .in("id", supplierIds)
  if (supErr) return { ok: false, error: `Failed to load suppliers: ${supErr.message}` }

  const supplierMap = new Map<string, SupplierRow>()
  for (const s of (supplierRows ?? []) as SupplierRow[]) {
    supplierMap.set(s.id, s)
  }

  // Validate every payment has supplier bank info.
  for (const p of payments) {
    const s = supplierMap.get(p.supplier_id)
    if (!s) {
      return { ok: false, error: `Supplier ${p.supplier_id} missing for payment ${p.id}` }
    }
    if (
      !digits(s.bank_code) ||
      !digits(s.bank_branch) ||
      !digits(s.bank_account_number)
    ) {
      return {
        ok: false,
        error: `Supplier "${s.name}" (${s.supplier_number}) is missing bank details — cannot include in MASAV.`,
      }
    }
  }

  const company = companyRes.data
  const senderName = asciiSafe(company.legal_name ?? company.display_name)
  const senderBankBlock =
    padLeft(digits(bankRes.data.bank_code), 2) +
    padLeft(digits(bankRes.data.branch), 3) +
    padLeft(digits(bankRes.data.account_number), 5)

  const creationDate = fmtDateYmd(new Date().toISOString())
  const settlementDate = fmtDateYmd(run.run_date)

  // ── Header (1) ────────────────────────────────────────────────────────────
  const senderInstitution = padLeft(digits(bankRes.data.bank_code), 8)
  const senderSerial = padLeft(digits(run.run_number).slice(-8) || "00000001", 8)
  const headerCore =
    "1" +
    senderInstitution +
    senderSerial +
    creationDate +
    settlementDate +
    senderBankBlock + // 10 digits (bank2 + branch3 + acct5)
    padRight(senderName, 40)
  const header = padRight(headerCore, REC_LENGTH)

  // ── Detail records (2) ─────────────────────────────────────────────────────
  let totalAgorot = 0
  const detailLines: string[] = []
  for (let i = 0; i < payments.length; i++) {
    const p = payments[i]
    const s = supplierMap.get(p.supplier_id)!
    const seq = p.masav_record_seq ?? i + 1
    const amountAg = toAgorot(Number(p.amount))
    totalAgorot += amountAg

    const beneficiaryName = asciiSafe(s.name) || s.supplier_number
    const reference = asciiSafe(p.reference ?? p.id.slice(0, 15))

    const detailCore =
      "2" +
      padLeft(String(seq), 8) +
      padLeft(digits(s.bank_code), 3) +
      padLeft(digits(s.bank_branch), 3) +
      padLeft(digits(s.bank_account_number), 16) +
      padLeft(String(amountAg), 15) +
      padRight(beneficiaryName, 40) +
      padRight(reference, 15)
    detailLines.push(padRight(detailCore, REC_LENGTH))
  }

  // ── Trailer (9) ────────────────────────────────────────────────────────────
  const recordCount = 1 + detailLines.length + 1
  const trailerCore =
    "9" + padLeft(String(recordCount), 8) + padLeft(String(totalAgorot), 15)
  const trailer = padRight(trailerCore, REC_LENGTH)

  // Validate run.total matches lines.
  const runTotalAg = toAgorot(Number(run.total_amount))
  if (runTotalAg !== totalAgorot) {
    return {
      ok: false,
      error: `Total mismatch: run.total_amount=${runTotalAg} agorot, sum(payments)=${totalAgorot} agorot.`,
    }
  }

  const content = [header, ...detailLines, trailer].join("\r\n") + "\r\n"
  const fileName = `${run.run_number}.001`

  return {
    ok: true,
    content,
    fileName,
    summary: {
      recordCount,
      totalAgorot,
      totalIls: totalAgorot / 100,
    },
  }
}
