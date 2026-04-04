import { format } from "date-fns"
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import type { RowInput } from "jspdf-autotable"

import type { GanttTaskSyncLite } from "@/lib/marker-ofek/gantt-billing-sync"
import {
  getLineDualGapInfo,
  summarizeDualGapRibbon,
  type LineDualGapKind,
  type RevenueGapLineInput,
} from "@/lib/marker-ofek/revenue-gap"

type JsPdfWithTable = jsPDF & {
  lastAutoTable?: { finalY: number }
}

const NOTO_TTF_URL =
  "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosanshebrew/static/NotoSansHebrew-Regular.ttf"

const JETBRAINS_MONO_TTF_URL =
  "https://cdn.jsdelivr.net/gh/JetBrains/JetBrainsMono@v2.304/fonts/ttf/JetBrainsMono-Regular.ttf"

let cachedNotoBase64: string | null = null
let cachedJetBrainsBase64: string | null = null

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = ""
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

async function loadNotoIntoDoc(doc: jsPDF): Promise<boolean> {
  try {
    if (!cachedNotoBase64) {
      const res = await fetch(NOTO_TTF_URL)
      if (!res.ok) return false
      cachedNotoBase64 = arrayBufferToBase64(await res.arrayBuffer())
    }
    doc.addFileToVFS("NotoSansHebrew-Regular.ttf", cachedNotoBase64)
    doc.addFont("NotoSansHebrew-Regular.ttf", "NotoSansHebrew", "normal")
    return true
  } catch {
    return false
  }
}

async function loadJetBrainsIntoDoc(doc: jsPDF): Promise<boolean> {
  try {
    if (!cachedJetBrainsBase64) {
      const res = await fetch(JETBRAINS_MONO_TTF_URL)
      if (!res.ok) return false
      cachedJetBrainsBase64 = arrayBufferToBase64(await res.arrayBuffer())
    }
    doc.addFileToVFS("JetBrainsMono-Regular.ttf", cachedJetBrainsBase64)
    doc.addFont("JetBrainsMono-Regular.ttf", "JetBrainsMono", "normal")
    return true
  } catch {
    return false
  }
}

/** Loads fonts in parallel; falls back to built-in Courier for mono if needed. */
async function ensurePdfFonts(doc: jsPDF): Promise<{
  hebrewFont: "NotoSansHebrew" | "helvetica"
  monoFont: "JetBrainsMono" | "courier"
}> {
  const [notoOk, jbOk] = await Promise.all([
    loadNotoIntoDoc(doc),
    loadJetBrainsIntoDoc(doc),
  ])
  return {
    hebrewFont: notoOk ? "NotoSansHebrew" : "helvetica",
    monoFont: jbOk ? "JetBrainsMono" : "courier",
  }
}

export type GapHunterPdfLine = {
  id: string
  label: string
  quantity_previous: number
  quantity_current: number
  line_base_amount: number
  gantt_suggested_percent: number | null
}

function toGapInput(
  li: GapHunterPdfLine,
  lineEdits: Record<
    string,
    { quantity_previous: number; quantity_current: number }
  >
): RevenueGapLineInput {
  const edit = lineEdits[li.id] ?? {
    quantity_previous: li.quantity_previous,
    quantity_current: li.quantity_current,
  }
  const qCur = Math.min(100, Math.max(0, Number(edit.quantity_current) || 0))
  return {
    id: li.id,
    label: li.label,
    quantity_current: qCur,
    gantt_suggested_percent: li.gantt_suggested_percent,
    line_base_amount: li.line_base_amount,
  }
}

const GUIDANCE_REVENUE =
  "Action: Verify completion & expedite billing."
const GUIDANCE_RISK =
  "Action: Urgent - check field progress or adjust billing to avoid rejection."

type ExceptionRow = {
  kind: LineDualGapKind
  label: string
  fieldPct: number
  billedPct: number
  variancePct: number
  financialNis: number
  statusLabel: string
  guidance: string
}

function buildExceptionRows(
  lines: GapHunterPdfLine[],
  lineEdits: Record<
    string,
    { quantity_previous: number; quantity_current: number }
  >,
  ganttTasksForSync: GanttTaskSyncLite[]
): ExceptionRow[] {
  const out: ExceptionRow[] = []
  for (const li of lines) {
    const dual = getLineDualGapInfo(
      toGapInput(li, lineEdits),
      ganttTasksForSync
    )
    if (!dual.isException || dual.fieldPercent == null || dual.kind === "none") {
      continue
    }
    const field = dual.fieldPercent
    const billed = dual.billedPercent
    const variancePct = Math.round((field - billed) * 100) / 100
    const financialNis =
      dual.kind === "revenue"
        ? dual.unbilledRevenueIls
        : dual.billingExposureIls
    const guidance =
      dual.kind === "revenue" ? GUIDANCE_REVENUE : GUIDANCE_RISK
    const statusLabel =
      dual.kind === "revenue" ? "REVENUE GAP" : "RISK GAP"
    out.push({
      kind: dual.kind,
      label: li.label,
      fieldPct: field,
      billedPct: billed,
      variancePct,
      financialNis,
      statusLabel,
      guidance,
    })
  }
  return out
}

function slugFileSegment(name: string): string {
  return (
    String(name)
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "project"
  )
}

function safeMoney(n: number): number {
  const x = Number(n)
  if (!Number.isFinite(x)) return 0
  return x
}

/** Monospaced amounts — JetBrains Mono or Courier fallback */
function formatImpactShekel(n: number): string {
  return `${new Intl.NumberFormat("en-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeMoney(n))} ₪`
}

function tintForKind(kind: LineDualGapKind): [number, number, number] {
  if (kind === "revenue") return [255, 251, 235]
  if (kind === "risk") return [255, 241, 242]
  return [252, 252, 253]
}

function drawPieSlice(
  doc: jsPDF,
  cx: number,
  cy: number,
  r: number,
  startRad: number,
  endRad: number,
  fillRgb: [number, number, number]
) {
  if (endRad <= startRad + 1e-8) return
  const n = Math.max(16, Math.ceil((endRad - startRad) / 0.12))
  const deltas: [number, number][] = []
  deltas.push([r * Math.cos(startRad), r * Math.sin(startRad)])
  for (let i = 1; i <= n; i++) {
    const t = i / n
    const a = startRad + (endRad - startRad) * t
    const ap = startRad + (endRad - startRad) * ((i - 1) / n)
    deltas.push([
      r * Math.cos(a) - r * Math.cos(ap),
      r * Math.sin(a) - r * Math.sin(ap),
    ])
  }
  deltas.push([-r * Math.cos(endRad), -r * Math.sin(endRad)])
  doc.setFillColor(fillRgb[0], fillRgb[1], fillRgb[2])
  doc.lines(deltas, cx, cy, [1, 1], "F", true)
}

const COLOR_BILLED_INDIGO: [number, number, number] = [79, 70, 229]
const COLOR_GAP_AMBER: [number, number, number] = [245, 158, 11]
const COLOR_REMAIN_SLATE: [number, number, number] = [148, 163, 184]

type PieParts = {
  billed: number
  revenueGap: number
  remaining: number
  total: number
}

function computeContractPieParts(
  contractTotal: number | null | undefined,
  totalRecognized: number,
  revenueGapNis: number
): PieParts | null {
  const T =
    contractTotal != null && Number.isFinite(contractTotal) && contractTotal > 0
      ? contractTotal
      : null
  if (T == null) return null
  const billed = Math.max(0, Math.min(T, Math.max(0, safeMoney(totalRecognized))))
  let gap = Math.max(0, safeMoney(revenueGapNis))
  if (billed + gap > T) {
    gap = Math.max(0, T - billed)
  }
  const remaining = Math.max(0, T - billed - gap)
  const total = billed + gap + remaining
  if (total <= 0) return null
  return { billed, revenueGap: gap, remaining, total }
}

function drawPieChart(
  doc: jsPDF,
  cx: number,
  cy: number,
  radiusMm: number,
  parts: PieParts
) {
  const { billed, revenueGap, remaining, total } = parts
  const slices: Array<{
    amount: number
    color: [number, number, number]
  }> = [
    { amount: billed, color: COLOR_BILLED_INDIGO },
    { amount: revenueGap, color: COLOR_GAP_AMBER },
    { amount: remaining, color: COLOR_REMAIN_SLATE },
  ]
  let cursor = -Math.PI / 2
  for (const s of slices) {
    if (s.amount <= 0) continue
    const sweep = (s.amount / total) * 2 * Math.PI
    const end = cursor + sweep
    drawPieSlice(doc, cx, cy, radiusMm, cursor, end, s.color)
    cursor = end
  }
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.35)
  doc.circle(cx, cy, radiusMm, "S")
}

const EMPTY_VARIANCES_MSG =
  "No significant variances found. · לא נמצאו חריגים מהותיים (פער הכנסה >10% או חשיפת חיוב >5%) בטיוטה זו."

export async function downloadGapHunterPdfReport(options: {
  projectName: string
  internalCode?: string | null
  partialAccountNumber: number
  totalContract?: number | null
  totalRecognized?: number
  lines: GapHunterPdfLine[]
  lineEdits: Record<
    string,
    { quantity_previous: number; quantity_current: number }
  >
  ganttTasksForSync: GanttTaskSyncLite[]
  reportDate?: Date
}): Promise<void> {
  const reportDate = options.reportDate ?? new Date()
  const gapInputs = options.lines.map((li) => toGapInput(li, options.lineEdits))
  const ribbon = summarizeDualGapRibbon(
    gapInputs,
    options.ganttTasksForSync
  )

  const exceptions = buildExceptionRows(
    options.lines,
    options.lineEdits,
    options.ganttTasksForSync
  )

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  })

  const fonts = await ensurePdfFonts(doc)
  const hf = fonts.hebrewFont
  const mf = fonts.monoFont

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 14
  const indigo: [number, number, number] = [79, 70, 229]
  const slate700: [number, number, number] = [51, 65, 85]
  const slate500: [number, number, number] = [100, 116, 139]

  doc.setFillColor(248, 250, 252)
  doc.rect(0, 0, pageW, 26, "F")
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.35)
  doc.line(0, 26, pageW, 26)

  doc.setFont("helvetica", "bold")
  doc.setFontSize(10.5)
  doc.setTextColor(indigo[0], indigo[1], indigo[2])
  doc.text("Marker Ofek · Smart Building OS", margin, 11)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(slate700[0], slate700[1], slate700[2])
  const headline = [
    `Project: ${options.projectName}`,
    "Report: Billing Variance Analysis",
    `Date: ${format(reportDate, "yyyy-MM-dd")}`,
  ].join("   |   ")
  doc.text(headline, margin, 18, { maxWidth: pageW - margin * 2 })

  doc.setFontSize(8)
  doc.setTextColor(slate500[0], slate500[1], slate500[2])
  const sub = [
    `Partial account: #${options.partialAccountNumber}`,
    options.internalCode ? `Code: ${options.internalCode}` : null,
  ]
    .filter(Boolean)
    .join("  ·  ")
  doc.text(sub, margin, 23)

  const totalRecognized = safeMoney(options.totalRecognized ?? 0)
  const pieParts = computeContractPieParts(
    options.totalContract,
    totalRecognized,
    ribbon.totalUnbilledRevenueIls
  )
  const netCash = safeMoney(
    ribbon.totalUnbilledRevenueIls - ribbon.totalBillingExposureIls
  )

  const analyticsTop = 27
  const pieCx = margin + 23
  const pieCy = 46
  const pieR = 18
  const execTextLeft = margin + 49
  const execTextW = pageW - execTextLeft - margin

  const introLineH = 3.45
  const insightLineH = 3.15

  const hebrewIntroLines = doc.splitTextToSize(
    "סטטוס פרויקט: ניתוח ביצוע מול חיוב — דוח מנהלים המשווה התקדמות שטח (גאנט) מול אחוזי חיוב בטיוטת החשבון החלקי, לזיהוי פערי הכנסה וחשיפות חיוב.",
    execTextW
  )
  const hebrewInsightLines = doc.splitTextToSize(
    "תובנה מרכזית — הזדמנות מזומנים נטו (סכום פערי הכנסה פחות חשיפת חיוב):",
    execTextW
  )

  const textColumnBottom =
    35 +
    hebrewIntroLines.length * introLineH +
    2 +
    hebrewInsightLines.length * insightLineH +
    1.5 +
    4 +
    5 +
    3.5 +
    3.5 +
    2

  const legendBottom = pieParts ? pieCy + pieR + 5 + 9 : pieCy + 8
  const analyticsBottom = Math.max(textColumnBottom, legendBottom) + 3
  const tableStartY = analyticsBottom + 5

  doc.setFillColor(252, 252, 253)
  doc.setDrawColor(226, 232, 240)
  doc.roundedRect(
    margin,
    analyticsTop,
    pageW - 2 * margin,
    analyticsBottom - analyticsTop,
    1.5,
    1.5,
    "FD"
  )

  if (pieParts) {
    drawPieChart(doc, pieCx, pieCy, pieR, pieParts)
    const pct = (n: number) =>
      pieParts.total > 0 ? ((n / pieParts.total) * 100).toFixed(1) : "0.0"
    let legY = pieCy + pieR + 5
    doc.setFont(mf, "normal")
    doc.setFontSize(6.2)
    doc.setTextColor(COLOR_BILLED_INDIGO[0], COLOR_BILLED_INDIGO[1], COLOR_BILLED_INDIGO[2])
    doc.text(
      `Billed ${pct(pieParts.billed)}%  ${formatImpactShekel(pieParts.billed)}`,
      margin + 2,
      legY,
      { maxWidth: 44 }
    )
    legY += 3
    doc.setTextColor(COLOR_GAP_AMBER[0], COLOR_GAP_AMBER[1], COLOR_GAP_AMBER[2])
    doc.text(
      `Revenue gap ${pct(pieParts.revenueGap)}%  ${formatImpactShekel(pieParts.revenueGap)}`,
      margin + 2,
      legY,
      { maxWidth: 44 }
    )
    legY += 3
    doc.setTextColor(COLOR_REMAIN_SLATE[0], COLOR_REMAIN_SLATE[1], COLOR_REMAIN_SLATE[2])
    doc.text(
      `Remaining ${pct(pieParts.remaining)}%  ${formatImpactShekel(pieParts.remaining)}`,
      margin + 2,
      legY,
      { maxWidth: 44 }
    )
  } else {
    doc.setFont("helvetica", "italic")
    doc.setFontSize(7)
    doc.setTextColor(slate500[0], slate500[1], slate500[2])
    doc.text(
      "Contract total unavailable — vector chart omitted.",
      margin + 2,
      pieCy,
      { maxWidth: 44 }
    )
  }

  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(indigo[0], indigo[1], indigo[2])
  doc.text(
    "Project Status: Execution vs. Billing Analysis",
    execTextLeft + execTextW,
    31,
    { align: "right" }
  )

  doc.setTextColor(slate700[0], slate700[1], slate700[2])
  doc.setFont(hf, "normal")
  doc.setFontSize(8)
  let execY = 35
  doc.text(hebrewIntroLines, execTextLeft + execTextW, execY, {
    align: "right",
    maxWidth: execTextW,
    lineHeightFactor: 1.32,
    isInputRtl: true,
  })
  execY += hebrewIntroLines.length * introLineH + 2

  doc.setFont(hf, "normal")
  doc.setFontSize(8)
  doc.text(hebrewInsightLines, execTextLeft + execTextW, execY, {
    align: "right",
    maxWidth: execTextW,
    lineHeightFactor: 1.25,
    isInputRtl: true,
  })
  execY += hebrewInsightLines.length * insightLineH + 1.5

  doc.setFont(mf, "normal")
  doc.setFontSize(9)
  doc.setTextColor(indigo[0], indigo[1], indigo[2])
  doc.text(formatImpactShekel(netCash), execTextLeft + execTextW, execY, {
    align: "right",
  })
  execY += 5

  doc.setFontSize(7.5)
  doc.setTextColor(51, 65, 85)
  doc.text(
    `Unbilled revenue (est.): ${formatImpactShekel(ribbon.totalUnbilledRevenueIls)}`,
    execTextLeft + execTextW,
    execY,
    { align: "right" }
  )
  execY += 3.5
  doc.text(
    `Billing exposure (est.): ${formatImpactShekel(ribbon.totalBillingExposureIls)}`,
    execTextLeft + execTextW,
    execY,
    { align: "right" }
  )

  const tableHead = [
    [
      "Item description",
      "Field %",
      "Billed %",
      "Variance %",
      "Financial impact (₪)",
    ],
  ]

  const tableBody: RowInput[] = []
  if (exceptions.length > 0) {
    for (const r of exceptions) {
      const tint = tintForKind(r.kind)
      tableBody.push([
        `${r.statusLabel} — ${r.label}`,
        r.fieldPct.toFixed(2),
        r.billedPct.toFixed(2),
        (r.variancePct >= 0 ? "+" : "") + r.variancePct.toFixed(2),
        formatImpactShekel(safeMoney(r.financialNis)),
      ])
      tableBody.push([
        {
          content: r.guidance,
          colSpan: 5,
          styles: {
            fillColor: tint,
            font: "helvetica",
            fontSize: 7,
            fontStyle: "italic",
            textColor: [71, 85, 105],
            cellPadding: { top: 1.5, bottom: 2.5, left: 3, right: 3 },
          },
        },
      ])
    }
  } else {
    tableBody.push([
      {
        content: EMPTY_VARIANCES_MSG,
        colSpan: 5,
        styles: {
          font: "helvetica",
          fillColor: [248, 250, 252],
          textColor: [100, 116, 139],
          halign: "center",
          fontSize: 8.5,
          cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
        },
      },
    ])
  }

  const monoCol = mf

  autoTable(doc, {
    startY: tableStartY,
    theme: "plain",
    head: tableHead,
    body: tableBody,
    margin: { left: margin, right: margin },
    styles: {
      font: hf,
      fontSize: 8,
      cellPadding: 2.2,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [51, 65, 85],
      font: "helvetica",
      fontStyle: "bold",
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 72, font: hf, halign: "right" },
      1: { cellWidth: 26, font: monoCol, halign: "right" },
      2: { cellWidth: 26, font: monoCol, halign: "right" },
      3: { cellWidth: 26, font: monoCol, halign: "right" },
      4: { cellWidth: 42, font: monoCol, halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section === "head") {
        data.cell.styles.halign = "right"
        return
      }
      if (data.section !== "body" || exceptions.length === 0) return
      if (data.row.index % 2 === 1) return
      const ex = exceptions[Math.floor(data.row.index / 2)]
      if (!ex) return
      data.cell.styles.fillColor = tintForKind(ex.kind)
    },
  })

  const finalY = (doc as JsPdfWithTable).lastAutoTable?.finalY
  const footY = Math.min(
    (finalY ?? 180) + 10,
    pageH - 8
  )
  doc.setFontSize(7.5)
  doc.setTextColor(148, 163, 184)
  doc.setFont("helvetica", "normal")
  doc.text(
    "Confidential — Marker Ofek. Draft billing % vs. field (Gantt) progress at export. Exceptions: revenue gap >10% or risk gap >5%.",
    margin,
    footY
  )

  const fname = `Billing-Variance_${slugFileSegment(options.projectName)}_${format(reportDate, "yyyy-MM-dd")}.pdf`
  doc.save(fname)
}
