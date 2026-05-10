/**
 * File parsers — unify CSV (papaparse) and XLSX (exceljs) into a common
 * `ParsedFile` shape consumed by the engine.
 *
 * Both deliverables share:
 *   - BOM-stripped, whitespace-normalized headers.
 *   - Row dictionaries keyed by raw header text.
 *   - `headerList` preserving column order for diagnostic messages.
 */
import Papa from "papaparse"
import ExcelJS from "exceljs"

export type ParsedFile = {
  headerList: string[]
  rows: Record<string, string>[]
  /** Filled if the parser had non-fatal warnings (truncations, etc.). */
  warnings: string[]
}

export type ParseError = {
  message: string
}

function stripBom(text: string): string {
  if (text.length === 0) return text
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

export function normalizeHeader(raw: string): string {
  return stripBom(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
}

/** Parse CSV text. Throws-friendly: returns Result-like shape. */
export function parseCsv(content: string): ParsedFile | ParseError {
  const text = stripBom(content ?? "")
  if (!text.trim()) return { message: "קובץ ריק" }

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => normalizeHeader(h),
  })

  const fatal = parsed.errors?.find(
    (e) => e.type === "Quotes" || e.type === "FieldMismatch",
  )
  if (fatal) {
    return { message: `שגיאת CSV: ${fatal.message}` }
  }

  const headerList = (parsed.meta.fields ?? []).map((h) => normalizeHeader(h))
  if (headerList.length === 0) {
    return { message: "לא נמצאו כותרות בקובץ" }
  }

  const rows =
    parsed.data?.filter((r) =>
      Object.values(r).some((v) => String(v ?? "").trim() !== ""),
    ) ?? []

  return {
    headerList,
    rows,
    warnings: parsed.errors
      ?.filter((e) => e.type !== "Quotes" && e.type !== "FieldMismatch")
      .map((e) => e.message ?? "אזהרה ב-CSV") ?? [],
  }
}

/** Parse XLSX from a Buffer (server-side). */
export async function parseXlsx(
  buffer: ArrayBuffer | Buffer,
): Promise<ParsedFile | ParseError> {
  try {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as ArrayBuffer)
    const sheet = workbook.worksheets[0]
    if (!sheet) return { message: "לא נמצא גליון בקובץ" }

    const headerRow = sheet.getRow(1)
    const headerList: string[] = []
    headerRow.eachCell({ includeEmpty: false }, (cell) => {
      const text = String(cell.value ?? "").trim()
      if (text) headerList.push(normalizeHeader(text))
    })
    if (headerList.length === 0) {
      return { message: "השורה הראשונה של הגליון ריקה — חסרות כותרות" }
    }

    const rows: Record<string, string>[] = []
    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r)
      const obj: Record<string, string> = {}
      let hasContent = false
      for (let c = 1; c <= headerList.length; c++) {
        const header = headerList[c - 1]
        const cellRaw = row.getCell(c).value
        let v = ""
        if (cellRaw instanceof Date) {
          v = cellRaw.toISOString().slice(0, 10)
        } else if (cellRaw !== null && cellRaw !== undefined) {
          if (
            typeof cellRaw === "object" &&
            "text" in cellRaw &&
            typeof (cellRaw as { text?: unknown }).text === "string"
          ) {
            v = (cellRaw as { text: string }).text
          } else if (
            typeof cellRaw === "object" &&
            "result" in cellRaw &&
            (cellRaw as { result?: unknown }).result !== undefined
          ) {
            v = String((cellRaw as { result: unknown }).result)
          } else {
            v = String(cellRaw)
          }
        }
        v = v.trim()
        if (v !== "") hasContent = true
        obj[header] = v
      }
      if (hasContent) rows.push(obj)
    }

    return { headerList, rows, warnings: [] }
  } catch (err) {
    return {
      message: `שגיאת XLSX: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/** Auto-detect by file extension. Both `.csv` and `.xlsx` are supported. */
export async function parseFile(
  fileName: string,
  content: string | ArrayBuffer | Buffer,
): Promise<ParsedFile | ParseError> {
  const lower = fileName.toLowerCase()
  if (lower.endsWith(".csv") || lower.endsWith(".tsv") || lower.endsWith(".txt")) {
    const text =
      typeof content === "string"
        ? content
        : Buffer.from(content as ArrayBuffer).toString("utf-8")
    return parseCsv(text)
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) {
    if (typeof content === "string") {
      return { message: "קובץ XLSX חייב להישלח כ-binary, לא text" }
    }
    return parseXlsx(content as ArrayBuffer | Buffer)
  }
  return {
    message: `סיומת לא נתמכת: ${fileName}. השתמשו ב-CSV או XLSX.`,
  }
}

export function isParseError(x: ParsedFile | ParseError): x is ParseError {
  return (x as ParseError).message !== undefined
}
