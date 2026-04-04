import { format } from "date-fns"
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"

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

export type PartialAccountPdfLine = {
  section: string
  description: string
  unit: string
  contractQty: number
  unitPrice: number
  qtyPrevious: number
  qtyCurrent: number
  cumulativeAmount: number
  periodAmount: number
}

export type PartialAccountPdfIndexationBlock = {
  seriesLabel: string
  baseDateLabel: string
  baseValue: number
  currentDateLabel: string
  currentValue: number
  ratio: number
  adjustmentAmount: number
}

export type PartialAccountPdfInput = {
  projectName: string
  internalCode: string
  contractLabel: string
  accountNumber: number
  statusLabel: string
  issuedAt: Date
  lines: PartialAccountPdfLine[]
  periodWorkGross: number
  periodWorkIndexed: number
  retention: number
  insurance: number
  labFees: number
  paymentDue: number
  totalCumulative: number
  /** טבלת הצמדה (מדד תשומות בנייה וכו׳) — עמוד ייעודי */
  indexationBlock?: PartialAccountPdfIndexationBlock | null
  /** סיכום עכבון לתקופה */
  retainageBlock?: { amountThisPeriod: number } | null
}

function money(n: number): string {
  return `${new Intl.NumberFormat("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.round(n * 100) / 100)} ₪`
}

function qty(n: number): string {
  return new Intl.NumberFormat("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.round(n * 100) / 100)
}

function ratioFmt(n: number): string {
  return new Intl.NumberFormat("he-IL", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(n)
}

/** חשבון חלקי — עטיפה, סיכום עבודות, טבלת מדד, סיכום עכבון וניכויים. */
export async function downloadPartialAccountPdf(
  input: PartialAccountPdfInput
): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const { hebrewFont, monoFont } = await ensurePdfFonts(doc)
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 14

  doc.setR2L?.(true)

  // --- Cover ---
  doc.setFillColor(49, 46, 129)
  doc.rect(0, 0, pageW, 52, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFont(hebrewFont, "normal")
  doc.setFontSize(20)
  doc.text("חשבון חלקי", pageW - margin, 24, { align: "right" })
  doc.setFontSize(11)
  doc.text("הצעת חיוב — מרקר אופק", pageW - margin, 34, { align: "right" })
  doc.setFont(monoFont, "normal")
  doc.setFontSize(10)
  doc.text(
    `מס׳ ${input.accountNumber} · ${format(input.issuedAt, "dd/MM/yyyy")}`,
    pageW - margin,
    44,
    { align: "right" }
  )

  doc.setTextColor(30, 27, 75)
  doc.setFont(hebrewFont, "normal")
  doc.setFontSize(11)
  let cy = 62
  const coverMeta: [string, string][] = [
    ["פרויקט", input.projectName],
    ["קוד פנימי", input.internalCode],
    ["סוג חוזה", input.contractLabel],
    ["סטטוס", input.statusLabel],
  ]
  for (const [k, v] of coverMeta) {
    doc.text(`${k}:`, pageW - margin, cy, { align: "right" })
    doc.setFont(monoFont, "normal")
    doc.text(v, margin + 4, cy, { align: "left", maxWidth: pageW - margin * 2 - 40 })
    doc.setFont(hebrewFont, "normal")
    cy += 7
  }

  doc.setFontSize(8)
  doc.setTextColor(100, 100, 100)
  doc.text(
    "מסמך מקצועי לניהול פנימי — אין תוקף חשבונית מס ללא אישור לקוח ורישום במערכת.",
    pageW - margin,
    pageH - 18,
    { align: "right", maxWidth: pageW - margin * 2 }
  )

  // --- Body: summary of works ---
  doc.addPage()
  doc.setTextColor(30, 27, 75)
  doc.setFont(hebrewFont, "normal")
  doc.setFontSize(14)
  doc.text("סיכום עבודות (כתב כמויות / אבני דרך)", pageW - margin, 18, {
    align: "right",
  })

  doc.setFontSize(9)
  doc.setTextColor(60, 60, 60)
  let y = 26
  const meta = [
    `פרויקט: ${input.projectName}`,
    `קוד: ${input.internalCode}`,
    `חוזה: ${input.contractLabel}`,
    `מס׳ חשבון: ${input.accountNumber}`,
  ]
  for (const line of meta) {
    doc.text(line, pageW - margin, y, { align: "right" })
    y += 5
  }

  doc.setTextColor(0, 0, 0)
  const tableBody = input.lines.map((li) => [
    li.section,
    li.description,
    li.unit,
    { content: qty(li.contractQty), styles: { font: monoFont } },
    { content: money(li.unitPrice), styles: { font: monoFont } },
    { content: `${qty(li.qtyPrevious)}%`, styles: { font: monoFont } },
    { content: `${qty(li.qtyCurrent)}%`, styles: { font: monoFont } },
    { content: money(li.cumulativeAmount), styles: { font: monoFont } },
    { content: money(li.periodAmount), styles: { font: monoFont } },
  ])

  autoTable(doc, {
    startY: y + 4,
    styles: {
      font: hebrewFont,
      fontSize: 7,
      cellPadding: 1.5,
      halign: "right",
    },
    headStyles: { fillColor: [49, 46, 129], textColor: 255, font: hebrewFont },
    columnStyles: {
      0: { cellWidth: 16 },
      1: { cellWidth: 42 },
      2: { cellWidth: 12 },
      3: { cellWidth: 18, halign: "center" },
      4: { cellWidth: 22, halign: "center" },
      5: { cellWidth: 18, halign: "center" },
      6: { cellWidth: 18, halign: "center" },
      7: { cellWidth: 22, halign: "center" },
      8: { cellWidth: 22, halign: "center" },
    },
    head: [
      [
        "סעיף",
        "תיאור",
        "יח׳",
        "כמות חוזה",
        "מחיר יח׳",
        "מצטבר קודם %",
        "ביצוע נוכחי %",
        "סכום מצטבר",
        "סה״כ תקופה",
      ],
    ],
    body: tableBody,
    theme: "grid",
  })

  const dLines = doc as JsPdfWithTable
  let sumY = (dLines.lastAutoTable?.finalY ?? y + 40) + 8

  // --- Indexation page ---
  if (input.indexationBlock) {
    const ib = input.indexationBlock
    doc.addPage()
    doc.setTextColor(30, 27, 75)
    doc.setFont(hebrewFont, "normal")
    doc.setFontSize(14)
    doc.text("טבלת הצמדה (מדד)", pageW - margin, 18, { align: "right" })
    doc.setFontSize(9)
    doc.setTextColor(70, 70, 70)
    doc.text(
      `סדרת מדד: ${ib.seriesLabel}`,
      pageW - margin,
      26,
      { align: "right" }
    )

    autoTable(doc, {
      startY: 32,
      styles: { font: hebrewFont, fontSize: 9, halign: "right" },
      headStyles: { fillColor: [49, 46, 129], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 45 },
        1: { font: monoFont, halign: "center" },
      },
      head: [["פריט", "ערך"]],
      body: [
        ["תאריך מדד בסיס", { content: ib.baseDateLabel, styles: { font: monoFont } }],
        [
          "ערך מדד בסיס",
          { content: ratioFmt(ib.baseValue), styles: { font: monoFont } },
        ],
        [
          "תאריך מדד נוכחי",
          { content: ib.currentDateLabel, styles: { font: monoFont } },
        ],
        [
          "ערך מדד נוכחי",
          { content: ratioFmt(ib.currentValue), styles: { font: monoFont } },
        ],
        [
          "יחס (נוכחי ÷ בסיס)",
          { content: ratioFmt(ib.ratio), styles: { font: monoFont } },
        ],
        [
          "עבודת תקופה לפני מדד",
          { content: money(input.periodWorkGross), styles: { font: monoFont } },
        ],
        [
          "עבודת תקופה אחרי מדד",
          { content: money(input.periodWorkIndexed), styles: { font: monoFont } },
        ],
        [
          "הפרש הצמדה בתקופה",
          { content: money(ib.adjustmentAmount), styles: { font: monoFont } },
        ],
      ],
      theme: "grid",
    })
    const dIdx = doc as JsPdfWithTable
    sumY = (dIdx.lastAutoTable?.finalY ?? 80) + 10
  }

  if (sumY > pageH - 52) {
    doc.addPage()
    sumY = 22
  }

  doc.setFont(hebrewFont, "normal")
  doc.setFontSize(13)
  doc.setTextColor(30, 27, 75)
  doc.text("סיכום כספי ועכבון", pageW - margin, sumY, { align: "right" })
  sumY += 10

  if (input.retainageBlock && input.retainageBlock.amountThisPeriod > 0) {
    doc.setFontSize(10)
    doc.setTextColor(49, 46, 129)
    doc.text("עכבון (ניכוי מהתקופה)", pageW - margin, sumY, { align: "right" })
    sumY += 6
    doc.setFont(monoFont, "normal")
    doc.setTextColor(30, 27, 75)
    doc.text(money(input.retainageBlock.amountThisPeriod), margin + 4, sumY, {
      align: "left",
    })
    sumY += 10
  }

  doc.setFont(hebrewFont, "normal")
  doc.setFontSize(9)
  doc.setTextColor(0, 0, 0)
  const sums: [string, string][] = [
    ["עבודת תקופה (ברוטו)", money(input.periodWorkGross)],
    ["אחרי צמידה", money(input.periodWorkIndexed)],
    ["ניכוי עכבון (שורה)", money(input.retention)],
    ["ניכוי ביטוח", money(input.insurance)],
    ["אגרות מעבדה", money(input.labFees)],
    ["סה״כ לתשלום בתקופה", money(input.paymentDue)],
    ["מצטבר מוצהר (אחרי חשבון)", money(input.totalCumulative)],
  ]

  for (const [label, val] of sums) {
    doc.text(`${label}: `, pageW - margin, sumY, { align: "right" })
    doc.setFont(monoFont, "normal")
    doc.text(val, margin + 50, sumY, { align: "left" })
    doc.setFont(hebrewFont, "normal")
    sumY += 5.5
  }

  doc.setFontSize(7)
  doc.setTextColor(100, 100, 100)
  doc.text(
    "מסמך זה הופק מהמערכת לצורכי ניהול פנימי; אין בו תוקף חשבונית מס אלא אם צורף אישור לקוח.",
    pageW - margin,
    pageH - 14,
    { align: "right", maxWidth: pageW - margin * 2 }
  )

  doc.save(
    `heshbon-helki-${input.internalCode}-${input.accountNumber}.pdf`
  )
}
