// @ts-nocheck
"use client"

import { jsPDF } from "jspdf"

import type { ErpClientContract, ErpClientProgressBill } from "@/types/erp"

export function clientProgressBillPdfFilename(
  contract: Pick<ErpClientContract, "contractNumber">,
  bill: Pick<ErpClientProgressBill, "billNumber">
): string {
  return `client-progress-bill-${contract.contractNumber}-${bill.billNumber}.pdf`
}

export async function buildClientProgressBillPdfBlob(input: {
  contract: Pick<ErpClientContract, "contractNumber" | "title" | "clientName">
  bill: Pick<ErpClientProgressBill, "billNumber" | "status">
  lines: Array<{
    lineNumber: number
    description: string
    contractAmount: number
    currentPercent: number
    currentAmount: number
  }>
}): Promise<Blob> {
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  let y = 44
  doc.setFontSize(16)
  doc.text("Holden Group - Client Progress Bill", 40, y)
  y += 22
  doc.setFontSize(11)
  doc.text(`Contract: ${input.contract.contractNumber} | ${input.contract.title}`, 40, y)
  y += 14
  doc.text(`Client: ${input.contract.clientName}`, 40, y)
  y += 14
  doc.text(`Bill: ${input.bill.billNumber} (${input.bill.status})`, 40, y)
  y += 20

  doc.setFontSize(10)
  for (const line of input.lines) {
    if (y > 780) {
      doc.addPage()
      y = 44
    }
    doc.text(
      `#${line.lineNumber} | ${line.description} | ${line.currentPercent.toFixed(2)}% | ${line.currentAmount.toLocaleString("he-IL")} ILS`,
      40,
      y
    )
    y += 13
  }
  return doc.output("blob")
}
"use client"

import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"

import type { ErpClientContract, ErpClientProgressBill } from "@/types/erp"

type ClientProgressPdfLine = {
  lineNumber: number
  description: string
  contractAmount: number
  currentPercent: number
  currentAmount: number
}

type BuildClientProgressBillPdfInput = {
  contract: ErpClientContract
  bill: ErpClientProgressBill
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
  contract: ErpClientContract,
  bill: ErpClientProgressBill
): string {
  const normalizedContract = String(contract.contractNumber ?? "contract").replace(/[^a-zA-Z0-9._-]/g, "-")
  const normalizedBill = String(bill.billNumber ?? "bill").replace(/[^a-zA-Z0-9._-]/g, "-")
  return `client-progress-bill-${normalizedContract}-${normalizedBill}.pdf`
}

export async function buildClientProgressBillPdfBlob(
  input: BuildClientProgressBillPdfInput
): Promise<Blob> {
  const { contract, bill, lines } = input
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const totalContractValue = lines.reduce((sum, line) => sum + Number(line.contractAmount || 0), 0)
  const totalCurrentAmount = lines.reduce((sum, line) => sum + Number(line.currentAmount || 0), 0)

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

  autoTable(doc, {
    startY: 64,
    head: [["Line", "Description", "Contract Amount", "Current %", "Current Amount"]],
    body: lines.map((line) => [
      String(line.lineNumber),
      line.description || "-",
      money(line.contractAmount),
      `${Number(line.currentPercent || 0).toFixed(2)}%`,
      money(line.currentAmount),
    ]),
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 1.8 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 16, halign: "right" },
      1: { cellWidth: 74 },
      2: { cellWidth: 34, halign: "right" },
      3: { cellWidth: 22, halign: "right" },
      4: { cellWidth: 34, halign: "right" },
    },
  })

  return doc.output("blob")
}
import { jsPDF } from "jspdf"

type PdfLine = {
  description: string
  submittedAmount: number
  approvedAmount: number
}

type PdfInput = {
  contract: { contractNumber?: string | null; title?: string | null; projectId?: string | null }
  bill: { billNumber?: string | null }
  lines: PdfLine[]
}

export function clientProgressBillPdfFilename(
  contract: { contractNumber?: string | null },
  bill: { billNumber?: string | null }
): string {
  const safeContract = String(contract.contractNumber ?? "contract").replace(/[^a-zA-Z0-9_-]/g, "_")
  const safeBill = String(bill.billNumber ?? "bill").replace(/[^a-zA-Z0-9_-]/g, "_")
  return `client-progress-bill-${safeContract}-${safeBill}.pdf`
}

export async function buildClientProgressBillPdfBlob(input: PdfInput): Promise<Blob> {
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  doc.setFontSize(15)
  doc.text("Client Progress Bill", 40, 52)
  doc.setFontSize(10)
  doc.text(`Project: ${input.contract.projectId ?? "-"}`, 40, 72)
  doc.text(`Contract: ${input.contract.contractNumber ?? "-"}`, 40, 88)
  doc.text(`Bill: ${input.bill.billNumber ?? "-"}`, 40, 104)

  let y = 132
  doc.setFontSize(9)
  for (const line of input.lines.slice(0, 28)) {
    const submitted = Number(line.submittedAmount || 0).toFixed(2)
    const approved = Number(line.approvedAmount || 0).toFixed(2)
    doc.text(`${line.description} | Submitted: ${submitted} | Approved: ${approved}`, 40, y)
    y += 14
  }

  return doc.output("blob")
}
