import { cookies } from "next/headers"
import { z } from "zod"

import type { ProcurementRow } from "@/components/marker-ofek/procurement-v2/procurement-scaffold"
import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { formatError } from "@/lib/format-error"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export type ProcurementProjectOption = {
  id: string
  projectCode: string
  name: string
}

export type ProcurementSupplierOption = {
  id: string
  supplierCode: string
  name: string
}

export type ProcurementBoqNodeOption = {
  id: string
  projectId: string
  structureCode: string
  title: string
  versionNumber: number
}

export type ProcurementLineView = {
  id: string
  poId: string
  lineNo: number
  description: string
  requestedQuantity: number
  receivedQuantity: number
  unitPrice: number
  totalAmount: number
  boqRef: string
}

export type ProcurementReceiptView = {
  id: string
  poId: string
  receiptNumber: string
  lineNo: number
  receivedQuantity: number
  receivedAt: string
  siteNote: string | null
}

export type ProcurementInvoiceView = {
  id: string
  poId: string
  invoiceNumber: string
  invoiceDate: string | null
  totalAmount: number
  status: string
}

export type ProcurementReconciliationView = {
  poId: string
  requestedAmount: number
  receivedAmount: number
  invoicedAmount: number
  deltaReceivedVsRequested: number
  deltaInvoiceVsReceived: number
}

type LoadProcurementResult = {
  rows: ProcurementRow[]
  projects: ProcurementProjectOption[]
  suppliers: ProcurementSupplierOption[]
  boqNodes: ProcurementBoqNodeOption[]
  lines: ProcurementLineView[]
  receipts: ProcurementReceiptView[]
  invoices: ProcurementInvoiceView[]
  reconciliations: ProcurementReconciliationView[]
  error: string | null
}

const procurementStatusSchema = z.enum(["DRAFT", "APPROVED", "PARTIALLY_PAID", "CLOSED"])
const procurementProjectRowSchema = z.object({
  id: z.string().uuid(),
  project_code: z.string(),
  name: z.string(),
})
const procurementSupplierRowSchema = z.object({
  id: z.string().uuid(),
  supplier_code: z.string(),
  name: z.string(),
})
const planningVersionRowSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  version_number: z.coerce.number(),
})
const boqNodeRowSchema = z.object({
  id: z.string().uuid(),
  version_id: z.string().uuid(),
  structure_code: z.string(),
  title: z.string(),
})
const purchaseOrderRowSchema = z.object({
  id: z.string().uuid(),
  po_number: z.string(),
  pbc_project_id: z.string().uuid().nullable(),
  supplier_id: z.string().uuid(),
  status: procurementStatusSchema,
  total_amount: z.coerce.number().nullable(),
})
const purchaseOrderLineRowSchema = z.object({
  id: z.string().uuid(),
  po_id: z.string().uuid(),
  line_no: z.coerce.number(),
  description: z.string(),
  requested_quantity: z.coerce.number(),
  received_quantity: z.coerce.number(),
  unit_price: z.coerce.number(),
  pbc_boq_node_id: z.string().uuid().nullable(),
})
const goodsReceiptRowSchema = z.object({
  id: z.string().uuid(),
  po_line_id: z.string().uuid(),
  receipt_number: z.string(),
  received_quantity: z.coerce.number(),
  received_at: z.string(),
  site_note: z.string().nullable(),
})
const supplierInvoiceRowSchema = z.object({
  id: z.string().uuid(),
  po_id: z.string().uuid().nullable(),
  invoice_number: z.string(),
  invoice_date: z.string().nullable(),
  total_amount: z.coerce.number(),
  status: z.string(),
})

export async function loadProcurementWorkspaceData(): Promise<LoadProcurementResult> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user?.id) {
      return {
        rows: [],
        projects: [],
        suppliers: [],
        boqNodes: [],
        lines: [],
        receipts: [],
        invoices: [],
        reconciliations: [],
        error: "נדרשת התחברות כדי לצפות בנתוני רכש.",
      }
    }

    const cookieStore = await cookies()
    const companyId = resolveCompanyContext(cookieStore.get(COMPANY_COOKIE_KEY)?.value)
    if (!companyId) {
      return {
        rows: [],
        projects: [],
        suppliers: [],
        boqNodes: [],
        lines: [],
        receipts: [],
        invoices: [],
        reconciliations: [],
        error: "נדרש הקשר חברה פעיל לצפייה בנתוני רכש.",
      }
    }

    const [projectsRes, suppliersRes, versionsRes, boqRes, poRes] =
      await Promise.all([
        supabase
          .from("pbc_projects")
          .select("id, project_code, name")
          .eq("company_id", companyId)
          .order("name", { ascending: true }),
        supabase
          .from("proc_suppliers")
          .select("id, supplier_code, name")
          .eq("company_id", companyId)
          .order("name", { ascending: true }),
        supabase
          .from("pbc_planning_versions")
          .select("id, project_id, version_number")
          .eq("company_id", companyId),
        supabase
          .from("pbc_boq_nodes")
          .select("id, version_id, structure_code, title")
          .eq("company_id", companyId)
          .order("structure_code", { ascending: true }),
        supabase
          .from("proc_purchase_orders")
          .select("id, po_number, pbc_project_id, supplier_id, status, total_amount")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false }),
      ])

    if (projectsRes.error) {
      return {
        rows: [],
        projects: [],
        suppliers: [],
        boqNodes: [],
        lines: [],
        receipts: [],
        invoices: [],
        reconciliations: [],
        error: projectsRes.error.message,
      }
    }
    if (suppliersRes.error) {
      return {
        rows: [],
        projects: [],
        suppliers: [],
        boqNodes: [],
        lines: [],
        receipts: [],
        invoices: [],
        reconciliations: [],
        error: suppliersRes.error.message,
      }
    }
    if (versionsRes.error) {
      return {
        rows: [],
        projects: [],
        suppliers: [],
        boqNodes: [],
        lines: [],
        receipts: [],
        invoices: [],
        reconciliations: [],
        error: versionsRes.error.message,
      }
    }
    if (boqRes.error) {
      return {
        rows: [],
        projects: [],
        suppliers: [],
        boqNodes: [],
        lines: [],
        receipts: [],
        invoices: [],
        reconciliations: [],
        error: boqRes.error.message,
      }
    }
    if (poRes.error) {
      return {
        rows: [],
        projects: [],
        suppliers: [],
        boqNodes: [],
        lines: [],
        receipts: [],
        invoices: [],
        reconciliations: [],
        error: poRes.error.message,
      }
    }

    const projectsParsed = z.array(procurementProjectRowSchema).safeParse(projectsRes.data ?? [])
    if (!projectsParsed.success) {
      return {
        rows: [],
        projects: [],
        suppliers: [],
        boqNodes: [],
        lines: [],
        receipts: [],
        invoices: [],
        reconciliations: [],
        error: "שגיאת מבנה בנתוני פרויקטים.",
      }
    }
    const suppliersParsed = z.array(procurementSupplierRowSchema).safeParse(suppliersRes.data ?? [])
    if (!suppliersParsed.success) {
      return {
        rows: [],
        projects: [],
        suppliers: [],
        boqNodes: [],
        lines: [],
        receipts: [],
        invoices: [],
        reconciliations: [],
        error: "שגיאת מבנה בנתוני ספקים.",
      }
    }
    const versionsParsed = z.array(planningVersionRowSchema).safeParse(versionsRes.data ?? [])
    if (!versionsParsed.success) {
      return {
        rows: [],
        projects: [],
        suppliers: [],
        boqNodes: [],
        lines: [],
        receipts: [],
        invoices: [],
        reconciliations: [],
        error: "שגיאת מבנה בנתוני גרסאות תכנון.",
      }
    }
    const boqParsed = z.array(boqNodeRowSchema).safeParse(boqRes.data ?? [])
    if (!boqParsed.success) {
      return {
        rows: [],
        projects: [],
        suppliers: [],
        boqNodes: [],
        lines: [],
        receipts: [],
        invoices: [],
        reconciliations: [],
        error: "שגיאת מבנה בנתוני BOQ.",
      }
    }
    const purchaseOrdersParsed = z.array(purchaseOrderRowSchema).safeParse(poRes.data ?? [])
    if (!purchaseOrdersParsed.success) {
      return {
        rows: [],
        projects: [],
        suppliers: [],
        boqNodes: [],
        lines: [],
        receipts: [],
        invoices: [],
        reconciliations: [],
        error: "שגיאת מבנה בנתוני הזמנות רכש.",
      }
    }

    const projects = projectsParsed.data.map((row) => ({
      id: row.id,
      projectCode: row.project_code,
      name: row.name,
    }))
    const suppliers = suppliersParsed.data.map((row) => ({
      id: row.id,
      supplierCode: row.supplier_code,
      name: row.name,
    }))
    const versions = versionsParsed.data
    const versionById = new Map(versions.map((row) => [row.id, row]))
    const boqNodes = boqParsed.data
      .map((row) => {
        const version = versionById.get(row.version_id)
        if (!version) return null
        return {
          id: row.id,
          projectId: version.project_id,
          structureCode: row.structure_code,
          title: row.title,
          versionNumber: Number(version.version_number ?? 0),
        } satisfies ProcurementBoqNodeOption
      })
      .filter((row): row is ProcurementBoqNodeOption => Boolean(row))

    const purchaseOrders = purchaseOrdersParsed.data
    const poIds = purchaseOrders.map((row) => row.id)
    const linesRes =
      poIds.length > 0
        ? await supabase
            .from("proc_purchase_order_lines")
            .select(
              "id, po_id, line_no, description, requested_quantity, received_quantity, unit_price, pbc_boq_node_id"
            )
            .eq("company_id", companyId)
            .in("po_id", poIds)
            .order("line_no", { ascending: true })
        : { data: [], error: null }
    if (linesRes.error) {
      return {
        rows: [],
        projects,
        suppliers,
        boqNodes,
        lines: [],
        receipts: [],
        invoices: [],
        reconciliations: [],
        error: linesRes.error.message,
      }
    }

    const parsedLines = z.array(purchaseOrderLineRowSchema).safeParse(linesRes.data ?? [])
    if (!parsedLines.success) {
      return {
        rows: [],
        projects,
        suppliers,
        boqNodes,
        lines: [],
        receipts: [],
        invoices: [],
        reconciliations: [],
        error: "שגיאת מבנה בשורות הזמנות.",
      }
    }

    const lineIds = parsedLines.data.map((row) => row.id)
    const [receiptsRes, invoicesRes] = await Promise.all([
      lineIds.length > 0
        ? supabase
            .from("proc_goods_receipts")
            .select("id, po_line_id, receipt_number, received_quantity, received_at, site_note")
            .eq("company_id", companyId)
            .in("po_line_id", lineIds)
            .order("received_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      poIds.length > 0
        ? supabase
            .from("proc_supplier_invoices")
            .select("id, po_id, invoice_number, invoice_date, total_amount, status")
            .eq("company_id", companyId)
            .in("po_id", poIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ])

    if (receiptsRes.error) {
      return {
        rows: [],
        projects,
        suppliers,
        boqNodes,
        lines: [],
        receipts: [],
        invoices: [],
        reconciliations: [],
        error: receiptsRes.error.message,
      }
    }
    if (invoicesRes.error) {
      return {
        rows: [],
        projects,
        suppliers,
        boqNodes,
        lines: [],
        receipts: [],
        invoices: [],
        reconciliations: [],
        error: invoicesRes.error.message,
      }
    }

    const parsedReceipts = z.array(goodsReceiptRowSchema).safeParse(receiptsRes.data ?? [])
    if (!parsedReceipts.success) {
      return {
        rows: [],
        projects,
        suppliers,
        boqNodes,
        lines: [],
        receipts: [],
        invoices: [],
        reconciliations: [],
        error: "שגיאת מבנה בקליטות סחורה.",
      }
    }
    const parsedInvoices = z.array(supplierInvoiceRowSchema).safeParse(invoicesRes.data ?? [])
    if (!parsedInvoices.success) {
      return {
        rows: [],
        projects,
        suppliers,
        boqNodes,
        lines: [],
        receipts: [],
        invoices: [],
        reconciliations: [],
        error: "שגיאת מבנה בחשבוניות ספק.",
      }
    }

    const projectById = new Map(projects.map((row) => [row.id, row]))
    const supplierById = new Map(suppliers.map((row) => [row.id, row]))
    const boqById = new Map(boqNodes.map((row) => [row.id, row]))
    const firstLineByPo = new Map<string, z.infer<typeof purchaseOrderLineRowSchema>>()
    for (const row of parsedLines.data) {
      const existing = firstLineByPo.get(row.po_id)
      if (!existing || row.line_no < existing.line_no) {
        firstLineByPo.set(row.po_id, row)
      }
    }

    const rows: ProcurementRow[] = purchaseOrders.map((row) => {
      const project = row.pbc_project_id ? projectById.get(row.pbc_project_id) : null
      const supplier = supplierById.get(row.supplier_id)
      const firstLine = firstLineByPo.get(row.id)
      const boqNode =
        firstLine?.pbc_boq_node_id != null
          ? boqById.get(firstLine.pbc_boq_node_id)
          : null

      return {
        id: row.id,
        supplierId: row.supplier_id,
        poNumber: row.po_number,
        projectLabel: project ? `${project.projectCode} · ${project.name}` : "ללא פרויקט",
        boqRef: boqNode ? `${boqNode.structureCode} · ${boqNode.title}` : "ללא BOQ",
        supplierName: supplier?.name || "ספק לא מזוהה",
        status: row.status ?? "DRAFT",
        totalAmount: Number(row.total_amount ?? 0),
      }
    })

    const lines: ProcurementLineView[] = parsedLines.data.map((row) => {
      const boq = row.pbc_boq_node_id ? boqById.get(row.pbc_boq_node_id) : null
      return {
        id: row.id,
        poId: row.po_id,
        lineNo: row.line_no,
        description: row.description,
        requestedQuantity: row.requested_quantity,
        receivedQuantity: row.received_quantity,
        unitPrice: row.unit_price,
        totalAmount: row.requested_quantity * row.unit_price,
        boqRef: boq ? `${boq.structureCode} · ${boq.title}` : "ללא BOQ",
      }
    })

    const lineById = new Map(lines.map((row) => [row.id, row]))
    const receipts: ProcurementReceiptView[] = parsedReceipts.data
      .map((row) => {
        const poLine = lineById.get(row.po_line_id)
        if (!poLine) return null
        return {
          id: row.id,
          poId: poLine.poId,
          receiptNumber: row.receipt_number,
          lineNo: poLine.lineNo,
          receivedQuantity: row.received_quantity,
          receivedAt: row.received_at,
          siteNote: row.site_note,
        } satisfies ProcurementReceiptView
      })
      .filter((row): row is ProcurementReceiptView => Boolean(row))

    const invoices: ProcurementInvoiceView[] = parsedInvoices.data
      .map((row) => {
        if (!row.po_id) return null
        return {
          id: row.id,
          poId: row.po_id,
          invoiceNumber: row.invoice_number,
          invoiceDate: row.invoice_date,
          totalAmount: row.total_amount,
          status: row.status,
        } satisfies ProcurementInvoiceView
      })
      .filter((row): row is ProcurementInvoiceView => Boolean(row))

    const requestedByPo = new Map<string, number>()
    const receivedByPo = new Map<string, number>()
    const invoicedByPo = new Map<string, number>()
    for (const line of lines) {
      requestedByPo.set(line.poId, (requestedByPo.get(line.poId) ?? 0) + line.totalAmount)
      receivedByPo.set(
        line.poId,
        (receivedByPo.get(line.poId) ?? 0) + line.receivedQuantity * line.unitPrice
      )
    }
    for (const invoice of invoices) {
      invoicedByPo.set(invoice.poId, (invoicedByPo.get(invoice.poId) ?? 0) + invoice.totalAmount)
    }
    const reconciliations: ProcurementReconciliationView[] = rows.map((row) => {
      const requestedAmount = requestedByPo.get(row.id) ?? 0
      const receivedAmount = receivedByPo.get(row.id) ?? 0
      const invoicedAmount = invoicedByPo.get(row.id) ?? 0
      return {
        poId: row.id,
        requestedAmount,
        receivedAmount,
        invoicedAmount,
        deltaReceivedVsRequested: requestedAmount - receivedAmount,
        deltaInvoiceVsReceived: receivedAmount - invoicedAmount,
      }
    })

    return { rows, projects, suppliers, boqNodes, lines, receipts, invoices, reconciliations, error: null }
  } catch (error) {
    return {
      rows: [],
      projects: [],
      suppliers: [],
      boqNodes: [],
      lines: [],
      receipts: [],
      invoices: [],
      reconciliations: [],
      error: formatError(error),
    }
  }
}
