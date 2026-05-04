/**
 * scripts/seed-po-demo.ts — Demo data להרצה מהירה של מסך ההזמנות
 * ---------------------------------------------------------------
 * יוצר בחברה הפעילה:
 *   1) פרויקט DEMO-PROJ (אם עדיין לא קיים)
 *   2) שני budget lines (כדי שטריגר erp_validate_procurement_budget_line יעבור)
 *   3) ספק DEMO-SUP (אם עדיין לא קיים)
 *   4) שלוש הזמנות רכש במצב DRAFT, כל אחת עם 2 שורות:
 *        • DEMO-PO-001 — סטנדרטי, urgency=NORMAL
 *        • DEMO-PO-002 — דחיפות HIGH
 *        • DEMO-PO-003 — גדול יותר, לבדיקת KPI "גדולות"
 *
 * שימוש:
 *   npx tsx scripts/seed-po-demo.ts                 # list of companies
 *   npx tsx scripts/seed-po-demo.ts --company <id>  # seed לחברה שצוינה
 *
 * דרוש: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY ב-.env.local.
 *
 * ה-script idempotent — ניתן להריץ שוב; רק חסר יוזרק.
 */

import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

import { createSupabaseServiceRoleClient } from "../lib/supabase/service-role"

const BUDGET_SUB_CHAPTER = "01.01.001"
const RESOURCE_ID_A = "DEMO-RES-A"
const RESOURCE_ID_B = "DEMO-RES-B"
const PROJECT_NUMBER = "DEMO-PROJ"
const PROJECT_NAME = "פרויקט דמו — Seed"
const SUPPLIER_NUMBER = "DEMO-SUP"
const SUPPLIER_NAME = "ספק דמו בע\"מ"

type Row = Record<string, unknown>

async function main() {
  const client = createSupabaseServiceRoleClient()

  // 1) Determine target company
  const argIdx = process.argv.indexOf("--company")
  const explicitCompany = argIdx >= 0 ? process.argv[argIdx + 1] : undefined

  if (!explicitCompany) {
    const { data, error } = await client
      .from("erp_companies")
      .select("*")
      .order("id")
    if (error) throw error
    console.log("\n=== Available companies ===")
    for (const c of (data as Row[]) ?? []) {
      const display = (c.display_name ?? c.name ?? "") as string
      console.log(`  • ${c.id as string}${display ? `  (${display})` : ""}`)
    }
    console.log("\nUsage: npx tsx scripts/seed-po-demo.ts --company <id>\n")
    return
  }

  const companyId = explicitCompany
  console.log(`\n▶ Seeding demo PO data into company "${companyId}"…\n`)

  // Verify company exists
  const companyCheck = await client
    .from("erp_companies")
    .select("id")
    .eq("id", companyId)
    .maybeSingle()
  if (companyCheck.error) throw companyCheck.error
  if (!companyCheck.data) {
    throw new Error(`Company "${companyId}" not found. Run without --company to list all.`)
  }

  // 2) Project (upsert by company + project_number)
  const projectId = await upsertProject(client, companyId)
  console.log(`  ✓ Project ${PROJECT_NUMBER} → ${projectId}`)

  // 3) Budget lines (2 resources × same sub-chapter, planned=100k each)
  await upsertBudgetLine(client, companyId, projectId, RESOURCE_ID_A, 100000)
  await upsertBudgetLine(client, companyId, projectId, RESOURCE_ID_B, 100000)
  console.log(`  ✓ Budget lines: ${RESOURCE_ID_A}, ${RESOURCE_ID_B} (100k₪ each)`)

  // 4) Supplier
  const supplierId = await upsertSupplier(client, companyId)
  console.log(`  ✓ Supplier ${SUPPLIER_NUMBER} → ${supplierId}`)

  // 5) Three POs
  const pos = [
    {
      poNumber: "DEMO-PO-001",
      title: "הזמנה ראשונה — סטנדרטית",
      lines: [
        { desc: "מסמרים 4 אינץ' אריזה 1 ק\"ג", qty: 50, price: 12, resource: RESOURCE_ID_A },
        { desc: "לוחות עץ 244x122", qty: 20, price: 85, resource: RESOURCE_ID_B },
      ],
    },
    {
      poNumber: "DEMO-PO-002",
      title: "הזמנה דחופה — HIGH",
      lines: [
        { desc: "מלט שק 50 ק\"ג", qty: 100, price: 28, resource: RESOURCE_ID_A },
        { desc: "ברזל 12 מ\"מ מוט 12 מ'", qty: 15, price: 210, resource: RESOURCE_ID_B },
      ],
    },
    {
      poNumber: "DEMO-PO-003",
      title: "הזמנה גדולה",
      lines: [
        { desc: "מזגן 2.5 כ\"ס קיר", qty: 8, price: 3400, resource: RESOURCE_ID_A },
        { desc: "משאבת מים 1 כ\"ס", qty: 4, price: 1800, resource: RESOURCE_ID_B },
      ],
    },
  ]

  for (const po of pos) {
    const existing = await client
      .from("erp_purchase_orders")
      .select("id")
      .eq("company_id", companyId)
      .eq("po_number", po.poNumber)
      .maybeSingle()
    if (existing.data) {
      console.log(`  • ${po.poNumber} already exists → skipping`)
      continue
    }

    const ins = await client
      .from("erp_purchase_orders")
      .insert({
        company_id: companyId,
        project_id: projectId,
        supplier_id: supplierId,
        po_number: po.poNumber,
        title: po.title,
        status: "DRAFT",
      })
      .select("id")
      .single()
    if (ins.error) throw ins.error
    const poId = (ins.data as { id: string }).id

    for (const [idx, line] of po.lines.entries()) {
      const lineIns = await client
        .from("erp_purchase_order_lines")
        .insert({
          company_id: companyId,
          purchase_order_id: poId,
          project_id: projectId,
          budget_sub_chapter: BUDGET_SUB_CHAPTER,
          resource_id: line.resource,
          description: line.desc,
          quantity: line.qty,
          unit_price: line.price,
          line_number: idx + 1,
        })
      if (lineIns.error) throw lineIns.error
    }
    console.log(`  ✓ ${po.poNumber} — ${po.lines.length} שורות`)
  }

  console.log("\n✅ Seed complete. Navigate to /marker-ofek/procurement/orders\n")
}

async function upsertProject(
  client: ReturnType<typeof createSupabaseServiceRoleClient>,
  companyId: string
): Promise<string> {
  const existing = await client
    .from("erp_proj_projects")
    .select("id")
    .eq("company_id", companyId)
    .eq("project_number", PROJECT_NUMBER)
    .maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data) return (existing.data as { id: string }).id

  const ins = await client
    .from("erp_proj_projects")
    .insert({
      company_id: companyId,
      project_number: PROJECT_NUMBER,
      name: PROJECT_NAME,
      status: "ACTIVE",
    })
    .select("id")
    .single()
  if (ins.error) throw ins.error
  return (ins.data as { id: string }).id
}

async function upsertBudgetLine(
  client: ReturnType<typeof createSupabaseServiceRoleClient>,
  companyId: string,
  projectId: string,
  resourceId: string,
  plannedAmount: number
) {
  const existing = await client
    .from("erp_project_budget_lines")
    .select("id")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .eq("budget_sub_chapter", BUDGET_SUB_CHAPTER)
    .eq("resource_id", resourceId)
    .maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data) return

  const ins = await client.from("erp_project_budget_lines").insert({
    company_id: companyId,
    project_id: projectId,
    budget_sub_chapter: BUDGET_SUB_CHAPTER,
    resource_id: resourceId,
    planned_amount: plannedAmount,
  })
  if (ins.error) throw ins.error
}

async function upsertSupplier(
  client: ReturnType<typeof createSupabaseServiceRoleClient>,
  companyId: string
): Promise<string> {
  const existing = await client
    .from("erp_md_suppliers")
    .select("id")
    .eq("company_id", companyId)
    .eq("supplier_number", SUPPLIER_NUMBER)
    .maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data) return (existing.data as { id: string }).id

  const ins = await client
    .from("erp_md_suppliers")
    .insert({
      company_id: companyId,
      supplier_number: SUPPLIER_NUMBER,
      name: SUPPLIER_NAME,
      foreign_name: "Demo Supplier Ltd",
      supplier_kind: "supplier",
      supplier_type: "STANDARD",
      payment_terms: "שוטף +30",
      tax_id: "999999999",
      tax_vat_id: "999999999",
      vat_code: "I",
      currency_code: "ILS",
      phone: "03-1234567",
      email: "demo@demo-supplier.co.il",
    })
    .select("id")
    .single()
  if (ins.error) throw ins.error
  return (ins.data as { id: string }).id
}

main().catch((err) => {
  console.error("\n❌ Seed failed:", err.message ?? err)
  process.exit(1)
})
