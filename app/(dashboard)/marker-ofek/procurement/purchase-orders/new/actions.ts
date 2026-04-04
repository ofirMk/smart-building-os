"use server"

import { revalidatePath } from "next/cache"

import { evaluateSupplierTaxCompliance } from "@/lib/marker-ofek/entity-supplier-compliance"
import { poFromBoqServerSchema } from "@/lib/marker-ofek/erp-validation-schemas"
import { getMoSystemSettings } from "@/lib/marker-ofek/mo-system-settings-actions"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export type CreatePoFromBoqLine = {
  tenderBoqItemId: string
  description: string
  unit: string | null
  quantity: number
  unitPrice: number
  /** חובה — FK ל־items_catalog */
  catalogItemId: string
}

export type CreatePurchaseOrderFromBoqResult =
  | {
      ok: true
      poId: string
      poNumber: string
      ceoApprovalRequired: boolean
      priceDeviationPercent: number
      priceDeviationAmount: number
    }
  | { ok: false; error: string }

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export async function createPurchaseOrderFromBoq(input: {
  projectId: string
  tenderId: string
  supplierEntityId: string
  lines: CreatePoFromBoqLine[]
}): Promise<CreatePurchaseOrderFromBoqResult> {
  const parsed = poFromBoqServerSchema.safeParse({
    projectId: input.projectId,
    tenderId: input.tenderId,
    supplierEntityId: input.supplierEntityId,
    lines: input.lines,
  })
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join(" · ")
    return { ok: false, error: msg || "נתוני הזמנה לא תקינים" }
  }

  const { projectId, tenderId, supplierEntityId, lines } = parsed.data

  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: projRow, error: projErr } = await supabase
    .from("projects")
    .select("id, is_deleted")
    .eq("id", projectId)
    .maybeSingle()
  if (projErr) return { ok: false, error: projErr.message }
  if (!projRow || projRow.is_deleted) {
    return { ok: false, error: "פרויקט לא נמצא או מסומן כמחוק" }
  }

  const { data: tenderRow, error: tenErr } = await supabase
    .from("tenders")
    .select("id, project_id")
    .eq("id", tenderId)
    .maybeSingle()
  if (tenErr) return { ok: false, error: tenErr.message }
  if (!tenderRow) {
    return { ok: false, error: "מכרז לא נמצא" }
  }
  const tProj = tenderRow.project_id as string | null
  if (tProj != null && tProj !== projectId) {
    return {
      ok: false,
      error: "המכרז אינו משויך לפרויקט שנבחר — בחרו התאמה תקינה",
    }
  }

  const { data: supplierRow, error: supErr } = await supabase
    .from("entities")
    .select(
      "id, type, is_deleted, legal_id, withholding_tax_expiry, bookkeeping_auth_expiry"
    )
    .eq("id", supplierEntityId)
    .maybeSingle()

  if (supErr) {
    return { ok: false, error: supErr.message }
  }
  if (!supplierRow || supplierRow.is_deleted || supplierRow.type !== "supplier") {
    return {
      ok: false,
      error: "יש לבחור ספק מאומת מהמערכת (ישות מסוג supplier)",
    }
  }
  const legal = String(supplierRow.legal_id ?? "").trim()
  if (!legal) {
    return {
      ok: false,
      error: "לספק חייב להיות ח.פ / ע.מ (legal_id) לפני יצירת הזמנה",
    }
  }

  const settingsRes = await getMoSystemSettings()
  const settingsRow = settingsRes.ok ? settingsRes.settings : null
  const compliance = evaluateSupplierTaxCompliance(
    {
      withholding_tax_expiry: supplierRow.withholding_tax_expiry as string | null,
      bookkeeping_auth_expiry: supplierRow.bookkeeping_auth_expiry as string | null,
    },
    {
      tax_compliance_mode: settingsRow?.tax_compliance_mode ?? "warning",
    }
  )
  if (compliance.submitBlocked) {
    return {
      ok: false,
      error:
        "מצב תאימות מס: חסימה — עדכנו תאריכי תוקף לספק או שינוי מדיניות בהגדרות המערכת",
    }
  }

  const catalogIds = Array.from(new Set(lines.map((l) => l.catalogItemId)))
  const { data: catalogRows, error: catErr } = await supabase
    .from("items_catalog")
    .select("id")
    .in("id", catalogIds)

  if (catErr) {
    return { ok: false, error: catErr.message }
  }
  if ((catalogRows ?? []).length !== catalogIds.length) {
    return {
      ok: false,
      error: "אחד או יותר מזהי הפריטים בקטלוג אינם קיימים במערכת",
    }
  }

  const selectedTotal = roundMoney(
    lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)
  )

  const minPriceByItem = new Map<string, number>()
  const { data: histRows, error: histErr } = await supabase
    .from("supplier_item_prices")
    .select("master_item_id, last_price")
    .in("master_item_id", catalogIds)
    .limit(2000)

  if (histErr) {
    return { ok: false, error: histErr.message }
  }

  for (const row of (histRows ?? []) as {
    master_item_id: string | null
    last_price: number | null
  }[]) {
    const itemId = row.master_item_id ?? ""
    const p = Number(row.last_price ?? 0)
    if (!itemId || !Number.isFinite(p)) continue
    const current = minPriceByItem.get(itemId)
    if (current == null || p < current) minPriceByItem.set(itemId, p)
  }

  const minTotal = roundMoney(
    lines.reduce((sum, line) => {
      const minUnit = minPriceByItem.get(line.catalogItemId)
      const safeUnit =
        minUnit != null && Number.isFinite(minUnit) ? minUnit : line.unitPrice
      return sum + line.quantity * safeUnit
    }, 0)
  )

  const priceDeviationAmount = roundMoney(Math.max(0, selectedTotal - minTotal))
  const priceDeviationPercent =
    minTotal > 0 ? roundMoney((priceDeviationAmount / minTotal) * 100) : 0

  let ceoApprovalRequired = false
  if (user?.id && priceDeviationPercent > 8) {
    const { count, error: violationsErr } = await supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("created_by", user.id)
      .eq("is_deleted", false)
      .gt("price_deviation_percent", 8)
    if (violationsErr) {
      return { ok: false, error: violationsErr.message }
    }
    const previousViolations = count ?? 0
    ceoApprovalRequired = previousViolations + 1 >= 5
  }

  const status = ceoApprovalRequired ? "pending_ceo_approval" : "approved"

  const { data: poRow, error: poErr } = await supabase
    .from("purchase_orders")
    .insert({
      project_id: projectId,
      tender_id: tenderId,
      supplier_id: supplierEntityId,
      po_number: null,
      total_amount: selectedTotal,
      status,
      internal_notes: "נוצר מכתב כמויות (BoQ) מאושר",
      created_by: user?.id ?? null,
      user_signed_by: user?.id ?? null,
      user_signed_at: new Date().toISOString(),
      price_deviation_percent: priceDeviationPercent,
      price_deviation_amount: priceDeviationAmount,
      ceo_approval_required: ceoApprovalRequired,
    })
    .select("id, po_number")
    .single()

  if (poErr || !poRow?.id) {
    return {
      ok: false,
      error: poErr?.message ?? "שמירת הזמנת רכש נכשלה",
    }
  }

  const poId = poRow.id as string
  const linePayload = lines.map((row) => {
    const lineTotal = roundMoney(row.quantity * row.unitPrice)
    return {
      po_id: poId,
      item_id: row.catalogItemId,
      description: row.description.trim(),
      quantity: row.quantity,
      unit: row.unit?.trim() || null,
      unit_price: roundMoney(row.unitPrice),
      total_price: lineTotal,
      selected_supplier_item_id: null,
      additional_attributes: {
        source: "tender_boq",
        tender_id: tenderId,
        tender_boq_item_id: row.tenderBoqItemId,
      },
    }
  })

  const { error: linesErr } = await supabase.from("po_line_items").insert(linePayload)

  if (linesErr) {
    await supabase.from("purchase_orders").delete().eq("id", poId)
    return { ok: false, error: linesErr.message }
  }

  revalidatePath("/marker-ofek/procurement")
  const poNumber = typeof poRow.po_number === "string" ? poRow.po_number : ""

  if (ceoApprovalRequired) {
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000"
    const ceoEmail =
      process.env.CEO_APPROVER_EMAIL?.trim() || "ofir.dayan@marker-ofek.co.il"
    const resendApiKey = process.env.RESEND_API_KEY?.trim()
    if (resendApiKey) {
      const approvalLink = `${appUrl.replace(/\/$/, "")}/marker-ofek/procurement/${poId}`
      const body = {
        from: process.env.RESEND_FROM_EMAIL?.trim() || "Smart Building OS <onboarding@resend.dev>",
        to: [ceoEmail],
        subject: `נדרש אישור מנכ"ל להזמנת רכש ${poNumber || poId}`,
        html: `
          <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.6">
            <h2>נדרש אישור מנכ"ל - חריגת מחיר</h2>
            <p><strong>הזמנה:</strong> ${poNumber || poId}</p>
            <p><strong>סטיית מחיר:</strong> ${priceDeviationAmount.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ש"ח (${priceDeviationPercent.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%)</p>
            <p>הזמנה זו חצתה את כלל 5 החריגות (>8%) ודורשת חתימת מנכ"ל.</p>
            <p><a href="${approvalLink}">פתיחה ואישור ההזמנה</a></p>
          </div>
        `,
      }
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        })
        await supabase
          .from("purchase_orders")
          .update({ ceo_approval_email_sent_at: new Date().toISOString() })
          .eq("id", poId)
      } catch {
        // Do not fail PO creation if email send fails.
      }
    }
  }

  return {
    ok: true,
    poId,
    poNumber,
    ceoApprovalRequired,
    priceDeviationPercent,
    priceDeviationAmount,
  }
}
