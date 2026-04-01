"use server"

import { revalidatePath } from "next/cache"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export type CreatePoFromBoqLine = {
  tenderBoqItemId: string
  description: string
  unit: string | null
  quantity: number
  unitPrice: number
  catalogItemId?: string | null
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

async function resolveSupplierId(
  supabase: Awaited<ReturnType<typeof createSupabaseServerAuthClient>>,
  supplierName: string
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const trimmed = supplierName.trim()
  if (!trimmed) {
    return { ok: false, error: "חסר שם ספק" }
  }

  const { data: existing, error: findErr } = await supabase
    .from("entities")
    .select("id")
    .eq("type", "supplier")
    .eq("is_deleted", false)
    .ilike("name", trimmed)
    .maybeSingle()

  if (findErr) {
    return { ok: false, error: findErr.message }
  }
  if (existing?.id) {
    return { ok: true, id: existing.id as string }
  }

  const { data: inserted, error: insErr } = await supabase
    .from("entities")
    .insert({
      name: trimmed,
      type: "supplier",
      contact_info: {},
      is_deleted: false,
    })
    .select("id")
    .single()

  if (insErr || !inserted?.id) {
    return {
      ok: false,
      error: insErr?.message ?? "יצירת ספק נכשלה",
    }
  }
  return { ok: true, id: inserted.id as string }
}

export async function createPurchaseOrderFromBoq(input: {
  tenderId: string
  supplierName: string
  lines: CreatePoFromBoqLine[]
}): Promise<CreatePurchaseOrderFromBoqResult> {
  const tenderId = input.tenderId?.trim()
  if (!tenderId) {
    return { ok: false, error: "נא לבחור מכרז" }
  }
  const lines = input.lines.filter(
    (l) =>
      l.quantity > 0 &&
      l.unitPrice >= 0 &&
      l.description.trim().length > 0
  )
  if (lines.length === 0) {
    return { ok: false, error: "נא לבחור לפחות שורת BoQ אחת עם כמות חיובית" }
  }

  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const supplier = await resolveSupplierId(supabase, input.supplierName)
  if (!supplier.ok) {
    return { ok: false, error: supplier.error }
  }

  const selectedTotal = roundMoney(
    lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)
  )

  const itemIds = Array.from(
    new Set(
      lines
        .map((line) => line.catalogItemId?.trim() || "")
        .filter((id) => id.length > 0)
    )
  )

  const minPriceByItem = new Map<string, number>()
  if (itemIds.length > 0) {
    const { data: histRows, error: histErr } = await supabase
      .from("supplier_item_prices")
      .select("master_item_id, last_price")
      .in("master_item_id", itemIds)
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
  }

  const minTotal = roundMoney(
    lines.reduce((sum, line) => {
      const id = line.catalogItemId?.trim() || ""
      const minUnit = id ? minPriceByItem.get(id) : undefined
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
      project_id: null,
      tender_id: tenderId,
      supplier_id: supplier.id,
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
      item_id: null,
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

  const { error: linesErr } = await supabase
    .from("po_line_items")
    .insert(linePayload)

  if (linesErr) {
    await supabase.from("purchase_orders").delete().eq("id", poId)
    return { ok: false, error: linesErr.message }
  }

  revalidatePath("/marker-ofek/procurement")
  const poNumber =
    typeof poRow.po_number === "string" ? poRow.po_number : ""

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
