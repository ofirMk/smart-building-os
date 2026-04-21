import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"

import type { ErpPurchaseOrder, ErpPurchaseOrderLine } from "@/types/erp"

function money(value: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0)
}

export function poReportFileName(po: ErpPurchaseOrder): string {
  return `purchase-order-${po.poNumber}.pdf`
}

export function buildPurchaseOrderPdfBlob(
  po: ErpPurchaseOrder,
  lines: ErpPurchaseOrderLine[]
): Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  doc.setFont("helvetica", "bold")
  doc.setFontSize(18)
  doc.text("Purchase Order", 14, 16)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.text(`PO Number: ${po.poNumber}`, 14, 24)
  doc.text(`Title: ${po.title}`, 14, 30)
  doc.text(`Status: ${po.status}`, 14, 36)
  doc.text(`Total: ${money(po.totalAmount)}`, 14, 42)
  doc.text(`Issue Date: ${po.issuedAt ?? "-"}`, 14, 48)

  autoTable(doc, {
    startY: 56,
    head: [["Budget Sub Chapter", "Resource", "Description", "Qty", "Unit Price", "Total"]],
    body: lines.map((line) => [
      line.budgetSubChapter,
      line.resourceId,
      line.description,
      line.quantity.toLocaleString("he-IL"),
      money(line.unitPrice),
      money(line.totalPrice),
    ]),
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 1.8 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
  })

  return doc.output("blob")
}

