 
import ExcelJS from "exceljs"

import type { ErpClientProgressBill } from "@/types/erp"

export interface ClientProgressBillExportLine {
  itemId: string
  description: string
  contractQty: number
  unitPrice: number
  previousCumulativePct: number
  currentPeriodPct: number
  totalPct: number
  amountForPayment: number
}

export interface GenerateClientProgressBillExcelInput {
  contractNumber: string
  contractTitle: string
  bill: Pick<ErpClientProgressBill, "billNumber" | "periodStart" | "periodEnd">
  lines: ClientProgressBillExportLine[]
}

const HOLDEN_BLUE = "FF1D4ED8"
const BORDER_COLOR = "FFD1D5DB"
const NIS_FORMAT = '"₪" #,##0.00'

function toSafeNumber(value: number): number {
  if (!Number.isFinite(value)) return 0
  return value
}

function toFraction(percent: number): number {
  return toSafeNumber(percent) / 100
}

function applyCellBorder(cell: ExcelJS.Cell): void {
  cell.border = {
    top: { style: "thin", color: { argb: BORDER_COLOR } },
    left: { style: "thin", color: { argb: BORDER_COLOR } },
    bottom: { style: "thin", color: { argb: BORDER_COLOR } },
    right: { style: "thin", color: { argb: BORDER_COLOR } },
  }
}

function normalizeExcelBuffer(buffer: unknown): ArrayBuffer {
  if (buffer instanceof ArrayBuffer) return buffer
  if (buffer instanceof Uint8Array) {
    const bytes = Array.from(buffer)
    const copy = new ArrayBuffer(bytes.length)
    new Uint8Array(copy).set(bytes)
    return copy
  }
  if (buffer && typeof buffer === "object" && "buffer" in buffer) {
    const view = buffer as ArrayBufferView
    const bytes = Array.from(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
    const copy = new ArrayBuffer(bytes.length)
    new Uint8Array(copy).set(bytes)
    return copy
  }
  const bytes = Array.from(new Uint8Array(buffer as ArrayBufferLike))
  const copy = new ArrayBuffer(bytes.length)
  new Uint8Array(copy).set(bytes)
  return copy
}

export async function generateClientProgressBillExcel(
  input: GenerateClientProgressBillExcelInput
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Holden Group"
  workbook.created = new Date()
  workbook.calcProperties = { fullCalcOnLoad: true }

  const sheet = workbook.addWorksheet("Client Progress Bill")
  sheet.columns = [
    { key: "itemId", width: 16 },
    { key: "description", width: 48 },
    { key: "contractQty", width: 16 },
    { key: "unitPrice", width: 15 },
    { key: "previousCumulativePct", width: 18 },
    { key: "currentPeriodPct", width: 17 },
    { key: "totalPct", width: 12 },
    { key: "amountForPayment", width: 18 },
  ]

  const periodText = `${input.bill.periodStart ?? "-"} to ${input.bill.periodEnd ?? "-"}`
  sheet.mergeCells("A1:H1")
  const titleCell = sheet.getCell("A1")
  titleCell.value = `Holden Group | Client Progress Bill ${input.bill.billNumber}`
  titleCell.font = { name: "Calibri", size: 13, bold: true, color: { argb: "FFFFFFFF" } }
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HOLDEN_BLUE } }
  titleCell.alignment = { vertical: "middle", horizontal: "left" }
  sheet.getRow(1).height = 24

  sheet.mergeCells("A2:H2")
  sheet.getCell("A2").value = `Contract: ${input.contractNumber} | ${input.contractTitle}`
  sheet.getCell("A2").font = { name: "Calibri", size: 10, bold: true }
  sheet.getCell("A2").alignment = { vertical: "middle", horizontal: "left" }

  sheet.mergeCells("A3:H3")
  sheet.getCell("A3").value = `Billing period: ${periodText}`
  sheet.getCell("A3").font = { name: "Calibri", size: 10 }
  sheet.getCell("A3").alignment = { vertical: "middle", horizontal: "left" }

  const headerRowIndex = 5
  const headerLabels = [
    "Item ID",
    "Description",
    "Contract Qty",
    "Unit Price",
    "Previous Cumulative %",
    "Current Period %",
    "Total %",
    "Amount for Payment",
  ]
  const headerRow = sheet.getRow(headerRowIndex)
  headerRow.values = headerLabels
  headerRow.height = 22
  headerRow.eachCell((cell) => {
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HOLDEN_BLUE } }
    cell.alignment = { vertical: "middle", horizontal: "center" }
    applyCellBorder(cell)
  })

  let runningTotal = 0
  const dataStartRow = headerRowIndex + 1
  for (let idx = 0; idx < input.lines.length; idx += 1) {
    const line = input.lines[idx]
    const rowIndex = dataStartRow + idx
    const row = sheet.getRow(rowIndex)
    const amount = toSafeNumber(line.amountForPayment)
    runningTotal += amount

    row.values = [
      line.itemId,
      line.description,
      toSafeNumber(line.contractQty),
      toSafeNumber(line.unitPrice),
      toFraction(line.previousCumulativePct),
      toFraction(line.currentPeriodPct),
      toFraction(line.totalPct),
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
      cell.alignment = {
        vertical: "middle",
        horizontal: colNum === 2 ? "left" : "center",
        wrapText: colNum === 2,
      }
      applyCellBorder(cell)
    })
  }

  const totalsRowIndex = dataStartRow + input.lines.length
  sheet.mergeCells(`A${totalsRowIndex}:G${totalsRowIndex}`)
  const totalLabelCell = sheet.getCell(`A${totalsRowIndex}`)
  totalLabelCell.value = "TOTAL"
  totalLabelCell.font = { name: "Calibri", size: 11, bold: true }
  totalLabelCell.alignment = { vertical: "middle", horizontal: "right" }
  applyCellBorder(totalLabelCell)

  const totalValueCell = sheet.getCell(`H${totalsRowIndex}`)
  totalValueCell.value = toSafeNumber(runningTotal)
  totalValueCell.numFmt = NIS_FORMAT
  totalValueCell.font = { name: "Calibri", size: 11, bold: true }
  totalValueCell.alignment = { vertical: "middle", horizontal: "center" }
  applyCellBorder(totalValueCell)
  sheet.getRow(totalsRowIndex).height = 22

  sheet.views = [{ state: "frozen", ySplit: headerRowIndex }]
  sheet.autoFilter = {
    from: { row: headerRowIndex, column: 1 },
    to: { row: headerRowIndex, column: 8 },
  }

  const workbookBuffer = await workbook.xlsx.writeBuffer()
  return normalizeExcelBuffer(workbookBuffer)
}
/* import ExcelJS from "exceljs"

import type { ErpClientProgressBill } from "@/types/erp"

export interface ClientProgressBillExportLine {
  itemId: string
  description: string
  contractQty: number
  unitPrice: number
  previousCumulativePct: number
  currentProgressPct: number
  totalAmount: number
}

export interface GenerateClientProgressBillExcelInput {
  contractNumber: string
  contractTitle: string
  bill: Pick<ErpClientProgressBill, "billNumber" | "periodStart" | "periodEnd">
  lines: ClientProgressBillExportLine[]
}

const HOLDEN_BLUE = "FF1D4ED8"
const BORDER_COLOR = "FFD1D5DB"
const NIS_FORMAT = '"₪" #,##0.00'

function toSafeNumber(value: number): number {
  if (!Number.isFinite(value)) return 0
  return value
}

function toFraction(percent: number): number {
  return toSafeNumber(percent) / 100
}

function applyCellBorder(cell: ExcelJS.Cell): void {
  cell.border = {
    top: { style: "thin", color: { argb: BORDER_COLOR } },
    left: { style: "thin", color: { argb: BORDER_COLOR } },
    bottom: { style: "thin", color: { argb: BORDER_COLOR } },
    right: { style: "thin", color: { argb: BORDER_COLOR } },
  }
}

function normalizeExcelBuffer(buffer: unknown): ArrayBuffer {
  if (buffer instanceof ArrayBuffer) return buffer
  if (ArrayBuffer.isView(buffer)) {
    const view = buffer as ArrayBufferView
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
    const copy = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(copy).set(Array.from(bytes))
    return copy
  }
  const bytes = new Uint8Array(buffer as ArrayBufferLike)
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(Array.from(bytes))
  return copy
}

export async function generateClientProgressBillExcel(
  input: GenerateClientProgressBillExcelInput
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Holden Group"
  workbook.created = new Date()
  workbook.calcProperties = { fullCalcOnLoad: true }

  const sheet = workbook.addWorksheet("Client Progress Bill")
  sheet.columns = [
    { key: "itemId", width: 16 },
    { key: "description", width: 48 },
    { key: "contractQty", width: 16 },
    { key: "unitPrice", width: 15 },
    { key: "previousCumulativePct", width: 18 },
    { key: "currentProgressPct", width: 17 },
    { key: "totalAmount", width: 16 },
  ]

  const periodText = `${input.bill.periodStart ?? "-"} to ${input.bill.periodEnd ?? "-"}`
  sheet.mergeCells("A1:G1")
  const titleCell = sheet.getCell("A1")
  titleCell.value = `Holden Group | Client Progress Bill ${input.bill.billNumber}`
  titleCell.font = { name: "Calibri", size: 13, bold: true, color: { argb: "FFFFFFFF" } }
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HOLDEN_BLUE } }
  titleCell.alignment = { vertical: "middle", horizontal: "left" }
  sheet.getRow(1).height = 24

  sheet.mergeCells("A2:G2")
  sheet.getCell("A2").value = `Contract: ${input.contractNumber} | ${input.contractTitle}`
  sheet.getCell("A2").font = { name: "Calibri", size: 10, bold: true }
  sheet.getCell("A2").alignment = { vertical: "middle", horizontal: "left" }

  sheet.mergeCells("A3:G3")
  sheet.getCell("A3").value = `Billing period: ${periodText}`
  sheet.getCell("A3").font = { name: "Calibri", size: 10 }
  sheet.getCell("A3").alignment = { vertical: "middle", horizontal: "left" }

  const headerRowIndex = 5
  const headerLabels = [
    "Item ID",
    "Description",
    "Contract Qty",
    "Unit Price",
    "Previous Cumulative %",
    "Current Progress %",
    "Total Amount",
  ]
  const headerRow = sheet.getRow(headerRowIndex)
  headerRow.values = headerLabels
  headerRow.height = 22
  headerRow.eachCell((cell) => {
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HOLDEN_BLUE } }
    cell.alignment = { vertical: "middle", horizontal: "center" }
    applyCellBorder(cell)
  })

  let runningTotal = 0
  const dataStartRow = headerRowIndex + 1
  for (let idx = 0; idx < input.lines.length; idx += 1) {
    const line = input.lines[idx]
    const rowIndex = dataStartRow + idx
    const row = sheet.getRow(rowIndex)
    const amount = toSafeNumber(line.totalAmount)
    runningTotal += amount

    row.values = [
      line.itemId,
      line.description,
      toSafeNumber(line.contractQty),
      toSafeNumber(line.unitPrice),
      toFraction(line.previousCumulativePct),
      toFraction(line.currentProgressPct),
      amount,
    ]

    row.getCell(3).numFmt = "#,##0.000"
    row.getCell(4).numFmt = NIS_FORMAT
    row.getCell(5).numFmt = "0.00%"
    row.getCell(6).numFmt = "0.00%"
    row.getCell(7).numFmt = NIS_FORMAT

    row.eachCell((cell, colNum) => {
      cell.font = { name: "Calibri", size: 10 }
      cell.alignment = {
        vertical: "middle",
        horizontal: colNum === 2 ? "left" : "center",
        wrapText: colNum === 2,
      }
      applyCellBorder(cell)
    })
  }

  const totalsRowIndex = dataStartRow + input.lines.length
  sheet.mergeCells(`A${totalsRowIndex}:F${totalsRowIndex}`)
  const totalLabelCell = sheet.getCell(`A${totalsRowIndex}`)
  totalLabelCell.value = "TOTAL"
  totalLabelCell.font = { name: "Calibri", size: 11, bold: true }
  totalLabelCell.alignment = { vertical: "middle", horizontal: "right" }
  applyCellBorder(totalLabelCell)

  const totalValueCell = sheet.getCell(`G${totalsRowIndex}`)
  totalValueCell.value = toSafeNumber(runningTotal)
  totalValueCell.numFmt = NIS_FORMAT
  totalValueCell.font = { name: "Calibri", size: 11, bold: true }
  totalValueCell.alignment = { vertical: "middle", horizontal: "center" }
  applyCellBorder(totalValueCell)
  sheet.getRow(totalsRowIndex).height = 22

  sheet.views = [{ state: "frozen", ySplit: headerRowIndex }]
  sheet.autoFilter = {
    from: { row: headerRowIndex, column: 1 },
    to: { row: headerRowIndex, column: 7 },
  }

  const workbookBuffer = await workbook.xlsx.writeBuffer()
  return normalizeExcelBuffer(workbookBuffer)
}
/*
/**
 * Progress Bill ("חשבון חלקי") Excel export engine.
 *
 * Produces a workbook aligned with the "עיר היין / גינדי" Israeli
 * progress-bill standard with RTL layout, dense typography, and
 * Bento-style conditional formatting (positive approved lines tinted
 * emerald, over-billing rose, pending amber).
 */

/** Single BOQ-style line rendered into the sheet. */
export interface ProgressBillLineInput {
  itemId: string
  description: string
  contractQuantity: number
  unitPrice: number
  previousProgressPct: number
  currentProgressPct: number
  /**
   * Pre-computed total to bill for this period (NIS). When omitted the
   * engine derives it from `contractQuantity * unitPrice * (currentProgressPct / 100)`.
   */
  totalAmount?: number
  /** Optional flag so the trigger row can surface the "over-billing" tint. */
  isOverBilling?: boolean
}

export interface ProgressBillHeaderInput {
  projectName: string
  contractNumber: string
  billNumber: string
  billingPeriod: string
  /** Optional company display name in the header band. */
  companyName?: string
}

export interface ProgressBillFooterInput {
  indexationPct: number
  retentionPct: number
  advanceRepaymentAmount: number
  /** Any extra deductions (procurement commission, etc.). */
  otherDeductionsAmount?: number
}

export interface GenerateProgressBillExcelInput {
  header: ProgressBillHeaderInput
  lines: ProgressBillLineInput[]
  footer: ProgressBillFooterInput
}

const DENSE_HEIGHT = 18
const HEADER_HEIGHT = 26

const PALETTE = {
  headerFill: "FF0F172A", // slate-900 on white header strip
  headerText: "FFFFFFFF",
  stripeFill: "FFF8FAFC", // slate-50 zebra
  emeraldFill: "FFECFDF5", // emerald-50
  emeraldText: "FF065F46", // emerald-900
  amberFill: "FFFFFBEB", // amber-50
  amberText: "FF78350F", // amber-900
  roseFill: "FFFEF2F2", // rose-50
  roseText: "FF991B1B", // rose-900
  borderSlate: "FFE2E8F0", // slate-200
  numberColor: "FF0F172A",
} as const

function round2(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100) / 100
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 100) return 100
  return value
}

function deriveTotal(line: ProgressBillLineInput): number {
  if (typeof line.totalAmount === "number" && Number.isFinite(line.totalAmount)) {
    return round2(line.totalAmount)
  }
  const qty = Number.isFinite(line.contractQuantity) ? line.contractQuantity : 0
  const unit = Number.isFinite(line.unitPrice) ? line.unitPrice : 0
  const pct = clampPct(line.currentProgressPct)
  return round2(qty * unit * (pct / 100))
}

function chooseRowTint(
  line: ProgressBillLineInput
): { fill: string; text: string } | null {
  if (line.isOverBilling) return { fill: PALETTE.roseFill, text: PALETTE.roseText }
  if (line.currentProgressPct <= 0 && line.previousProgressPct <= 0) return null
  if (line.currentProgressPct > line.previousProgressPct) {
    return { fill: PALETTE.emeraldFill, text: PALETTE.emeraldText }
  }
  if (line.currentProgressPct < line.previousProgressPct) {
    return { fill: PALETTE.amberFill, text: PALETTE.amberText }
  }
  return null
}

function applyThinBorder(
  cell: ExcelJS.Cell,
  color: string = PALETTE.borderSlate
): void {
  cell.border = {
    top: { style: "thin", color: { argb: color } },
    left: { style: "thin", color: { argb: color } },
    bottom: { style: "thin", color: { argb: color } },
    right: { style: "thin", color: { argb: color } },
  }
}

/**
 * Entry point. Returns the raw XLSX bytes so the caller can either
 * stream them as a Response body or persist to storage.
 */
export async function generateProgressBillExcel(
  input: GenerateProgressBillExcelInput
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Smart Building OS"
  workbook.created = new Date()
  workbook.calcProperties = { fullCalcOnLoad: true }

  const sheet = workbook.addWorksheet("חשבון חלקי", {
    views: [{ rightToLeft: true, showGridLines: false, state: "normal" }],
    properties: { defaultRowHeight: DENSE_HEIGHT },
  })

  // --- Title band ---------------------------------------------------------
  sheet.mergeCells("A1:G1")
  const titleCell = sheet.getCell("A1")
  titleCell.value = `חשבון חלקי · ${input.header.projectName}`
  titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: PALETTE.headerText } }
  titleCell.alignment = { horizontal: "right", vertical: "middle", readingOrder: "rtl" }
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: PALETTE.headerFill },
  }
  sheet.getRow(1).height = HEADER_HEIGHT

  sheet.mergeCells("A2:G2")
  const subtitle = sheet.getCell("A2")
  subtitle.value =
    `חוזה ${input.header.contractNumber}` +
    ` · חשבון ${input.header.billNumber}` +
    ` · תקופה ${input.header.billingPeriod}` +
    (input.header.companyName ? ` · ${input.header.companyName}` : "")
  subtitle.font = { name: "Arial", size: 10, color: { argb: "FF475569" } }
  subtitle.alignment = { horizontal: "right", vertical: "middle", readingOrder: "rtl" }
  sheet.getRow(2).height = DENSE_HEIGHT

  // --- Column definitions (matches "עיר היין / גינדי" template) -----------
  sheet.columns = [
    { key: "item_id", width: 15 },
    { key: "description", width: 40 },
    { key: "contract_qty", width: 12 },
    { key: "unit_price", width: 14 },
    { key: "prev_progress", width: 16 },
    { key: "current_progress", width: 16 },
    { key: "total_amount", width: 16 },
  ]

  // --- Header row (row 4) -------------------------------------------------
  const headerRowIndex = 4
  const headers = [
    'מזהה פריט',
    'תיאור',
    'כמות בחוזה',
    'מחיר יחידה',
    'ביצוע מצטבר קודם %',
    'ביצוע נוכחי %',
    'סה"כ לתשלום',
  ]
  const headerRow = sheet.getRow(headerRowIndex)
  headerRow.height = HEADER_HEIGHT
  headers.forEach((label, idx) => {
    const cell = headerRow.getCell(idx + 1)
    cell.value = label
    cell.font = { name: "Arial", size: 11, bold: true, color: { argb: PALETTE.headerText } }
    cell.alignment = { horizontal: "right", vertical: "middle", readingOrder: "rtl" }
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: PALETTE.headerFill },
    }
    applyThinBorder(cell, PALETTE.headerFill)
  })

  // --- Line rows ----------------------------------------------------------
  let lineIndex = headerRowIndex + 1
  let subtotal = 0
  for (const line of input.lines) {
    const row = sheet.getRow(lineIndex)
    row.height = DENSE_HEIGHT
    const total = deriveTotal(line)
    subtotal += total
    const tint = chooseRowTint(line)

    row.values = [
      line.itemId,
      line.description,
      round2(line.contractQuantity),
      round2(line.unitPrice),
      clampPct(line.previousProgressPct) / 100,
      clampPct(line.currentProgressPct) / 100,
      total,
    ]

    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      cell.alignment = {
        horizontal: colNumber === 2 ? "right" : "center",
        vertical: "middle",
        readingOrder: "rtl",
        wrapText: colNumber === 2,
      }
      cell.font = {
        name: "Arial",
        size: 10,
        color: { argb: tint?.text ?? PALETTE.numberColor },
      }
      // Numeric formatting
      if (colNumber === 4 || colNumber === 7) {
        cell.numFmt = '#,##0.00" ₪"'
      } else if (colNumber === 3) {
        cell.numFmt = "#,##0.000"
      } else if (colNumber === 5 || colNumber === 6) {
        cell.numFmt = "0.00%"
      }

      // Zebra / Bento tint
      if (tint) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: tint.fill },
        }
      } else if ((lineIndex - headerRowIndex) % 2 === 0) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: PALETTE.stripeFill },
        }
      }

      applyThinBorder(cell)
    })

    lineIndex += 1
  }

  // --- Subtotal + footer --------------------------------------------------
  const blankRowIndex = lineIndex
  sheet.getRow(blankRowIndex).height = DENSE_HEIGHT / 2
  lineIndex += 1

  const indexation = round2(subtotal * (Number(input.footer.indexationPct) / 100))
  const retention = round2(
    (subtotal + indexation) * (Number(input.footer.retentionPct) / 100)
  )
  const advance = round2(input.footer.advanceRepaymentAmount || 0)
  const otherDeductions = round2(input.footer.otherDeductionsAmount || 0)
  const netPayable = round2(
    subtotal + indexation - retention - advance - otherDeductions
  )

  const footerRows: Array<{ label: string; value: number; emphasise?: boolean }> = [
    { label: 'סה"כ לפני התאמות', value: round2(subtotal) },
    { label: `הצמדה (${input.footer.indexationPct.toFixed(2)}%)`, value: indexation },
    { label: `ניכוי בטוחה (${input.footer.retentionPct.toFixed(2)}%)`, value: -retention },
    { label: "החזר מקדמה", value: -advance },
    ...(otherDeductions > 0
      ? [{ label: "ניכויים נוספים", value: -otherDeductions }]
      : []),
    { label: 'נטו לתשלום', value: netPayable, emphasise: true },
  ]

  for (const footerRow of footerRows) {
    const row = sheet.getRow(lineIndex)
    row.height = HEADER_HEIGHT
    sheet.mergeCells(lineIndex, 1, lineIndex, 6)
    const labelCell = row.getCell(1)
    labelCell.value = footerRow.label
    labelCell.alignment = {
      horizontal: "right",
      vertical: "middle",
      readingOrder: "rtl",
    }
    labelCell.font = {
      name: "Arial",
      size: 10,
      bold: footerRow.emphasise === true,
      color: { argb: footerRow.emphasise ? PALETTE.emeraldText : PALETTE.numberColor },
    }
    applyThinBorder(labelCell)
    if (footerRow.emphasise) {
      labelCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: PALETTE.emeraldFill },
      }
    }

    const valueCell = row.getCell(7)
    valueCell.value = footerRow.value
    valueCell.alignment = { horizontal: "center", vertical: "middle" }
    valueCell.numFmt = '#,##0.00" ₪"'
    valueCell.font = {
      name: "Arial",
      size: 10,
      bold: footerRow.emphasise === true,
      color: { argb: footerRow.emphasise ? PALETTE.emeraldText : PALETTE.numberColor },
    }
    applyThinBorder(valueCell)
    if (footerRow.emphasise) {
      valueCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: PALETTE.emeraldFill },
      }
    }

    lineIndex += 1
  }

  // Freeze the header strip so the bill stays readable when scrolling.
  sheet.views = [
    {
      rightToLeft: true,
      showGridLines: false,
      state: "frozen",
      ySplit: headerRowIndex,
    },
  ]

  const buffer = (await workbook.xlsx.writeBuffer()) as unknown
  // exceljs returns `ExcelJS.Buffer` (= Node `Buffer` in most runtimes).
  // Normalise to a plain ArrayBuffer so the caller is runtime-agnostic.
  if (buffer instanceof ArrayBuffer) return buffer
  if (ArrayBuffer.isView(buffer)) {
    const view = buffer as ArrayBufferView
    const copy = new ArrayBuffer(view.byteLength)
    const viewBytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
    new Uint8Array(copy).set(Array.from(viewBytes))
    return copy
  }
  return new ArrayBuffer(0)
}
