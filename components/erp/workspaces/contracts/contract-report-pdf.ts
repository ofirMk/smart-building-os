import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"

import type { ErpContract, ErpContractLine } from "@/types/erp"

type BuildContractReportPdfInput = {
  contract: ErpContract
  lines: ErpContractLine[]
}

function money(value: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)
}

function quantity(value: number): string {
  return new Intl.NumberFormat("he-IL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(Number(value) || 0)
}

export function contractReportFilename(contract: ErpContract): string {
  return `contract-${contract.contractNumber}.pdf`
}

export async function buildContractReportPdfBlob(
  input: BuildContractReportPdfInput
): Promise<Blob> {
  const { contract, lines } = input
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })

  doc.setFont("helvetica", "bold")
  doc.setFontSize(17)
  doc.text("SMART BUILDING OS", 14, 16)

  doc.setFontSize(11)
  doc.setFont("helvetica", "normal")
  doc.text(`Contract Master Report`, 14, 24)
  doc.text(`Contract Number: ${contract.contractNumber}`, 14, 31)
  doc.text(`Title: ${contract.title}`, 14, 37)
  doc.text(`Status: ${contract.status}`, 14, 43)
  doc.text(`Start Date: ${contract.startDate ?? "-"}`, 14, 49)
  doc.text(`End Date: ${contract.endDate ?? "-"}`, 14, 55)
  doc.text(`Total Amount: ${money(contract.totalAmount)}`, 14, 61)

  autoTable(doc, {
    startY: 69,
    head: [[
      "BOQ Reference",
      "Item Reference",
      "Description",
      "Quantity",
      "Unit Price",
      "Total Price",
    ]],
    body: lines.map((line) => [
      line.boqLineId ?? "-",
      line.itemId ?? "-",
      line.description,
      quantity(line.quantity),
      money(line.unitPrice),
      money(line.totalPrice),
    ]),
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 1.8 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 26 },
      2: { cellWidth: 58 },
      3: { cellWidth: 20, halign: "right" },
      4: { cellWidth: 25, halign: "right" },
      5: { cellWidth: 25, halign: "right" },
    },
    didDrawPage: ({ settings }) => {
      const pageHeight = doc.internal.pageSize.getHeight()
      doc.setFontSize(8)
      doc.setTextColor(100)
      doc.text(
        `Generated ${new Date().toLocaleString("he-IL")} • Contract ${contract.contractNumber}`,
        settings.margin.left,
        pageHeight - 8
      )
    },
  })

  return doc.output("blob")
}

