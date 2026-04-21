"use client"

import { jsPDF } from "jspdf"
import type { ErpClientContract, ErpClientProgressBill } from "@/types/erp"

type ClientProgressPdfLine = {
  lineNumber: number
  description: string
  contractAmount: number
  currentPercent: number
  currentAmount: number
}

type BuildClientProgressBillPdfInput = {
  contract: Pick<ErpClientContract, "contractNumber" | "title" | "clientName">
  bill: Pick<ErpClientProgressBill, "billNumber" | "status" | "netApprovedPayable">
  lines: ClientProgressPdfLine[]
}

function money(value: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0))
}

export function clientProgressBillPdfFilename(
  contract: Pick<ErpClientContract, "contractNumber">,
  bill: Pick<ErpClientProgressBill, "billNumber">
): string {
  const normalizedContract = String(contract.contractNumber ?? "contract").replace(
    /[^a-zA-Z0-9._-]/g,
    "-"
  )
  const normalizedBill = String(bill.billNumber ?? "bill").replace(
    /[^a-zA-Z0-9._-]/g,
    "-"
  )
  return `client-progress-bill-${normalizedContract}-${normalizedBill}.pdf`
}

export async function buildClientProgressBillPdfBlob(
  input: BuildClientProgressBillPdfInput
): Promise<Blob> {
  const { contract, bill, lines } = input
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const totalContractValue = lines.reduce(
    (sum, line) => sum + Number(line.contractAmount || 0),
    0
  )
  const totalCurrentAmount = lines.reduce(
    (sum, line) => sum + Number(line.currentAmount || 0),
    0
  )

  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.text("Client Progress Bill", 14, 14)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.text(`Contract: ${contract.contractNumber}`, 14, 21)
  doc.text(`Client: ${contract.clientName}`, 14, 27)
  doc.text(`Bill: ${bill.billNumber}`, 14, 33)
  doc.text(`Status: ${bill.status}`, 14, 39)
  doc.text(`Contract Total: ${money(totalContractValue)}`, 14, 45)
  doc.text(`Current Realized: ${money(totalCurrentAmount)}`, 14, 51)
  doc.text(`Net Approved Payable: ${money(bill.netApprovedPayable ?? 0)}`, 14, 57)

  let y = 64
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.text("Line", 14, y)
  doc.text("Description", 26, y)
  doc.text("Contract Amount", 112, y, { align: "right" })
  doc.text("Current %", 145, y, { align: "right" })
  doc.text("Current Amount", 196, y, { align: "right" })

  y += 4
  doc.setLineWidth(0.3)
  doc.line(14, y, 196, y)
  y += 5

  doc.setFont("helvetica", "normal")
  for (const line of lines) {
    if (y > 282) {
      doc.addPage()
      y = 18
    }

    const description = String(line.description || "-")
    const shortDescription =
      description.length > 44 ? `${description.slice(0, 41)}...` : description
    doc.text(String(line.lineNumber), 14, y)
    doc.text(shortDescription, 26, y)
    doc.text(money(line.contractAmount), 112, y, { align: "right" })
    doc.text(`${Number(line.currentPercent || 0).toFixed(2)}%`, 145, y, {
      align: "right",
    })
    doc.text(money(line.currentAmount), 196, y, { align: "right" })
    y += 6
  }

  return doc.output("blob")
}
