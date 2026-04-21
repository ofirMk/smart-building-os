import ExcelJS from "exceljs"

type ClientBillingExcelLine = {
  itemNo: string
  description: string
  contractQty: number
  unitPrice: number
  previousCumulativePct: number
  currentPeriodPct: number
  totalPct: number
  amountForPayment: number
}

export type GenerateClientProgressBillExcelInput = {
  projectName: string
  billNumber: string
  periodStart: string | null
  periodEnd: string | null
  lines: ClientBillingExcelLine[]
}

const HOLDEN_BLUE = "FF0F3D91"
const HOLDEN_LIGHT = "FFF8FAFC"
const HOLDEN_BORDER = "FFE2E8F0"
const NIS_FORMAT = '#,##0.00" ₪"'

function n(value: number): number {
  if (!Number.isFinite(value)) return 0
  return value
}

function pct(value: number): number {
  return n(value) / 100
}

function applyBorder(cell: ExcelJS.Cell): void {
  cell.border = {
    top: { style: "thin", color: { argb: HOLDEN_BORDER } },
    right: { style: "thin", color: { argb: HOLDEN_BORDER } },
    bottom: { style: "thin", color: { argb: HOLDEN_BORDER } },
    left: { style: "thin", color: { argb: HOLDEN_BORDER } },
  }
}

function normalizeExcelBuffer(buffer: ExcelJS.Buffer | ArrayBuffer): ArrayBuffer {
  if (buffer instanceof ArrayBuffer) return buffer
  if (ArrayBuffer.isView(buffer)) {
    const view = buffer as ArrayBufferView
    const copy = new ArrayBuffer(view.byteLength)
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
    new Uint8Array(copy).set(Array.from(bytes))
    return copy
  }
  return new ArrayBuffer(0)
}

export async function generateClientProgressBillExcel(
  billId: string,
  input: GenerateClientProgressBillExcelInput
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Holden Group"
  workbook.created = new Date()

  const sheet = workbook.addWorksheet("Client Billing", {
    properties: { defaultRowHeight: 18 },
  })

  sheet.columns = [
    { key: "itemNo", width: 12 },
    { key: "description", width: 38 },
    { key: "contractQty", width: 14 },
    { key: "unitPrice", width: 14 },
    { key: "prev", width: 16 },
    { key: "current", width: 14 },
    { key: "total", width: 10 },
    { key: "amount", width: 16 },
  ]

  sheet.mergeCells("A1:H1")
  const title = sheet.getCell("A1")
  title.value = "Holden Group | Client Progress Bill"
  title.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FFFFFFFF" } }
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HOLDEN_BLUE } }
  title.alignment = { horizontal: "left", vertical: "middle" }
  sheet.getRow(1).height = 24

  sheet.mergeCells("A2:H2")
  sheet.getCell("A2").value = `Project: ${input.projectName}`
  sheet.getCell("A2").font = { name: "Calibri", size: 10, bold: true }

  const periodLabel = `${input.periodStart ?? "-"} - ${input.periodEnd ?? "-"}`
  sheet.mergeCells("A3:H3")
  sheet.getCell("A3").value = `Bill No: ${input.billNumber} (${billId}) | Period: ${periodLabel}`
  sheet.getCell("A3").font = { name: "Calibri", size: 10 }

  const headerRow = sheet.getRow(5)
  headerRow.values = [
    "Item No",
    "Description",
    "Contract Qty",
    "Unit Price",
    "Prev. Cumulative %",
    "Current Period %",
    "Total %",
    "Amount for Payment",
  ]
  headerRow.eachCell((cell) => {
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HOLDEN_BLUE } }
    cell.alignment = { horizontal: "center", vertical: "middle" }
    applyBorder(cell)
  })
  headerRow.height = 22

  let totalAmount = 0
  let rowIndex = 6
  for (const line of input.lines) {
    const row = sheet.getRow(rowIndex)
    const amount = n(line.amountForPayment)
    totalAmount += amount
    row.values = [
      line.itemNo,
      line.description,
      n(line.contractQty),
      n(line.unitPrice),
      pct(line.previousCumulativePct),
      pct(line.currentPeriodPct),
      pct(line.totalPct),
      amount,
    ]

    row.getCell(3).numFmt = "#,##0.000"
    row.getCell(4).numFmt = NIS_FORMAT
    row.getCell(5).numFmt = "0.00%"
    row.getCell(6).numFmt = "0.00%"
    row.getCell(7).numFmt = "0.00%"
    row.getCell(8).numFmt = NIS_FORMAT

    row.eachCell((cell, colNum) => {
      cell.font = { name: "Calibri", size: 10 }
      cell.alignment = { vertical: "middle", horizontal: colNum === 2 ? "left" : "center" }
      if ((rowIndex - 6) % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HOLDEN_LIGHT } }
      }
      applyBorder(cell)
    })

    rowIndex += 1
  }

  sheet.mergeCells(`A${rowIndex}:G${rowIndex}`)
  const totalLabelCell = sheet.getCell(`A${rowIndex}`)
  totalLabelCell.value = "TOTAL"
  totalLabelCell.font = { name: "Calibri", size: 11, bold: true }
  totalLabelCell.alignment = { horizontal: "right", vertical: "middle" }
  applyBorder(totalLabelCell)

  const totalValueCell = sheet.getCell(`H${rowIndex}`)
  totalValueCell.value = n(totalAmount)
  totalValueCell.numFmt = NIS_FORMAT
  totalValueCell.font = { name: "Calibri", size: 11, bold: true }
  totalValueCell.alignment = { horizontal: "center", vertical: "middle" }
  applyBorder(totalValueCell)

  sheet.views = [{ state: "frozen", ySplit: 5 }]
  sheet.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: 5, column: 8 },
  }

  const workbookBuffer = await workbook.xlsx.writeBuffer()
  return normalizeExcelBuffer(workbookBuffer)
}
