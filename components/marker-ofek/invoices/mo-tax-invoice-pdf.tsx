"use client"

import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer"

export type MoTaxInvoicePdfLine = {
  description: string
  quantity: number
  unitPrice: number
  lineTotal: number
  /** אחוז מע״מ לשורה — ברירת מחדל: שיעור המסמך */
  vatRatePercent?: number
}

export type MoTaxInvoicePdfProps = {
  copyLabel: "מקור" | "העתק"
  previewInvoiceNumber: number | null
  issueDate: string
  companyName: string
  companyLegalId: string | null
  companyVatNumber: string | null
  companyAddress: string | null
  customerName: string
  customerLegalId: string | null
  customerAddress: string | null
  projectLabel: string | null
  contractLabel: string | null
  incomeKindLabel: string
  lines: MoTaxInvoicePdfLine[]
  subtotal: number
  vatRatePercent: number
  vatAmount: number
  grandTotal: number
  digitalSignatureSha256: string | null
  /** מספר הקצאה — רשות המסים */
  allocationNumber?: string | null
  allocation_number?: string | null
  /** מזהה מבצק / מערכת פנימית */
  taxAuthorityRef?: string | null
  tax_authority_ref?: string | null
  dueDate?: string | null
  due_date?: string | null
  /** הערות להצגה בתחתית */
  notes?: string | null
  /** פרטי בנק להעברה */
  bankDetails?: string | null
}

let fontRegistered = false
function ensureHebrewFont() {
  if (fontRegistered) return
  try {
    Font.register({
      family: "NotoSansHebrew",
      src: "https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSansHebrew/NotoSansHebrew-Regular.ttf",
    })
  } catch {
    /* רשת חסומה — ייתכן גיבוב תווים חלקי */
  }
  fontRegistered = true
}

const currency = (n: number) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 2,
  }).format(n)

const pctFmt = (n: number) =>
  new Intl.NumberFormat("he-IL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n)

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 9,
    fontFamily: "NotoSansHebrew",
    direction: "rtl",
  },
  /** לוגו בצד ימין — row-reverse: הילד הראשון מיושר ימין */
  headerRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
    gap: 16,
  },
  logoBox: {
    width: 100,
    minHeight: 48,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
  },
  logoTitle: {
    fontSize: 11,
    color: "#0f172a",
  },
  logoSub: { fontSize: 7, color: "#64748b", marginTop: 2 },
  headerMain: { flex: 1, maxWidth: "72%" },
  docTitle: { fontSize: 16, marginBottom: 6, color: "#0f172a" },
  allocationBlock: {
    marginTop: 4,
    marginBottom: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1.5,
    borderColor: "#0f172a",
    backgroundColor: "#f1f5f9",
  },
  allocationLabel: {
    fontSize: 10,
    color: "#0f172a",
    marginBottom: 2,
  },
  allocationValue: {
    fontSize: 14,
    color: "#0f172a",
    letterSpacing: 0.5,
  },
  meta: { fontSize: 8, color: "#475569", marginBottom: 2 },
  stampWrap: {
    alignItems: "flex-end",
    marginBottom: 12,
  },
  copyBadge: {
    borderWidth: 2,
    borderColor: "#0f172a",
    backgroundColor: "#fff",
    paddingVertical: 6,
    paddingHorizontal: 18,
    fontSize: 11,
    color: "#0f172a",
  },
  section: { marginBottom: 10 },
  sectionTitle: {
    fontSize: 9,
    marginBottom: 4,
    color: "#0f172a",
  },
  tableOuter: {
    borderWidth: 1,
    borderColor: "#0f172a",
    marginTop: 8,
  },
  tableHeader: {
    flexDirection: "row-reverse",
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 1,
    borderBottomColor: "#0f172a",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  th: { fontSize: 8, color: "#0f172a" },
  row: {
    flexDirection: "row-reverse",
    borderBottomWidth: 0.5,
    borderBottomColor: "#cbd5e1",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  td: { fontSize: 8, color: "#334155" },
  footerColumns: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: 16,
    gap: 12,
  },
  /** סיכום — צד שמאל (פריט שני ב-row-reverse) */
  summaryBox: {
    width: "42%",
    borderWidth: 1,
    borderColor: "#0f172a",
    padding: 10,
    backgroundColor: "#fafafa",
  },
  summaryTitle: {
    fontSize: 8,
    color: "#0f172a",
    marginBottom: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "#cbd5e1",
    paddingBottom: 4,
  },
  summaryLine: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  summaryLabel: { fontSize: 9, color: "#334155" },
  summaryValue: { fontSize: 9, color: "#0f172a" },
  grandLine: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#0f172a",
    flexDirection: "row-reverse",
    justifyContent: "space-between",
  },
  notesColumn: {
    flex: 1,
    minWidth: "48%",
  },
  notesBox: {
    borderWidth: 1,
    borderColor: "#94a3b8",
    padding: 8,
    marginBottom: 8,
    minHeight: 56,
  },
  notesHeading: {
    fontSize: 8,
    color: "#0f172a",
    marginBottom: 4,
  },
  notesBody: { fontSize: 8, color: "#475569", lineHeight: 1.35 },
  legalFooter: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: "#cbd5e1",
  },
  legalPrimary: {
    fontSize: 8,
    color: "#0f172a",
    marginBottom: 4,
    textAlign: "center",
  },
  legalSecondary: {
    fontSize: 7,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 1.4,
  },
})

const colDesc = { width: "32%" }
const colQty = { width: "10%", textAlign: "right" as const }
const colUnit = { width: "18%", textAlign: "right" as const }
const colVat = { width: "12%", textAlign: "right" as const }
const colTot = { width: "20%", textAlign: "right" as const }

function resolveProps(p: MoTaxInvoicePdfProps) {
  const allocation =
    p.allocationNumber ?? p.allocation_number ?? null
  const taxRef = p.taxAuthorityRef ?? p.tax_authority_ref ?? null
  const due = p.dueDate ?? p.due_date ?? null
  return { allocation, taxRef, due }
}

export function MoTaxInvoicePdfDocument(props: MoTaxInvoicePdfProps) {
  ensureHebrewFont()
  const { allocation, taxRef, due } = resolveProps(props)
  const numLabel =
    props.previewInvoiceNumber != null
      ? String(props.previewInvoiceNumber)
      : "—"

  const notesText = (props.notes ?? "").trim() || "—"
  const bankText = (props.bankDetails ?? "").trim() || "יש למלא פרטי בנק בהתאם להסכם."

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.logoBox}>
            <Text style={styles.logoTitle}>Holden Group</Text>
            <Text style={styles.logoSub}>הולדן גרופ</Text>
          </View>
          <View style={styles.headerMain}>
            <Text style={styles.docTitle}>חשבונית מס</Text>
            <View style={styles.allocationBlock}>
              <Text style={styles.allocationLabel}>מספר הקצאה:</Text>
              <Text style={styles.allocationValue}>
                {allocation && String(allocation).trim() !== ""
                  ? String(allocation).trim()
                  : "—"}
              </Text>
            </View>
            <Text style={styles.meta}>
              לפי נוהלי ניהול ספרים ודיווח מע״מ בישראל (תקנות 2026)
            </Text>
          </View>
        </View>

        <View style={styles.stampWrap}>
          <Text style={styles.copyBadge}>{props.copyLabel}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>פרטי מנפיק</Text>
          <Text style={styles.meta}>{props.companyName}</Text>
          {props.companyLegalId ? (
            <Text style={styles.meta}>ח.פ / ע.מ: {props.companyLegalId}</Text>
          ) : null}
          {props.companyVatNumber ? (
            <Text style={styles.meta}>עוסק מורשה: {props.companyVatNumber}</Text>
          ) : null}
          {props.companyAddress ? (
            <Text style={styles.meta}>{props.companyAddress}</Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>פרטי לקוח</Text>
          <Text style={styles.meta}>{props.customerName}</Text>
          {props.customerLegalId ? (
            <Text style={styles.meta}>ח.פ / ע.מ: {props.customerLegalId}</Text>
          ) : null}
          {props.customerAddress ? (
            <Text style={styles.meta}>{props.customerAddress}</Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>פרטי מסמך</Text>
          <Text style={styles.meta}>מספר סידורי: {numLabel}</Text>
          <Text style={styles.meta}>תאריך הנפקה: {props.issueDate}</Text>
          {due ? (
            <Text style={styles.meta}>תאריך לתשלום: {due}</Text>
          ) : null}
          <Text style={styles.meta}>סוג הכנסה: {props.incomeKindLabel}</Text>
          {props.projectLabel ? (
            <Text style={styles.meta}>פרויקט: {props.projectLabel}</Text>
          ) : null}
          {props.contractLabel ? (
            <Text style={styles.meta}>חוזה: {props.contractLabel}</Text>
          ) : null}
          {taxRef ? (
            <Text style={styles.meta}>
              אסמכתא רשות המסים / מבצק: {taxRef}
            </Text>
          ) : null}
        </View>

        <View style={styles.tableOuter}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, colDesc]}>תיאור</Text>
            <Text style={[styles.th, colQty]}>כמות</Text>
            <Text style={[styles.th, colUnit]}>מחיר יח׳</Text>
            <Text style={[styles.th, colVat]}>מע״מ %</Text>
            <Text style={[styles.th, colTot]}>סה״כ</Text>
          </View>
          {props.lines.map((l, i) => {
            const lineVat =
              l.vatRatePercent != null && !Number.isNaN(l.vatRatePercent)
                ? l.vatRatePercent
                : props.vatRatePercent
            const isLast = i === props.lines.length - 1
            return (
              <View
                key={i}
                style={[styles.row, isLast ? styles.rowLast : {}]}
                wrap={false}
              >
                <Text style={[styles.td, colDesc]}>{l.description}</Text>
                <Text style={[styles.td, colQty]}>
                  {new Intl.NumberFormat("he-IL", { maximumFractionDigits: 4 }).format(
                    l.quantity
                  )}
                </Text>
                <Text style={[styles.td, colUnit]}>{currency(l.unitPrice)}</Text>
                <Text style={[styles.td, colVat]}>{pctFmt(lineVat)}%</Text>
                <Text style={[styles.td, colTot]}>{currency(l.lineTotal)}</Text>
              </View>
            )
          })}
        </View>

        <View style={styles.footerColumns}>
          <View style={styles.notesColumn}>
            <View style={styles.notesBox}>
              <Text style={styles.notesHeading}>הערות</Text>
              <Text style={styles.notesBody}>{notesText}</Text>
            </View>
            <View style={styles.notesBox}>
              <Text style={styles.notesHeading}>פרטי בנק</Text>
              <Text style={styles.notesBody}>{bankText}</Text>
            </View>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryTitle}>סיכום</Text>
            <View style={styles.summaryLine}>
              <Text style={styles.summaryLabel}>סה״כ לפני מע״מ</Text>
              <Text style={styles.summaryValue}>{currency(props.subtotal)}</Text>
            </View>
            <View style={styles.summaryLine}>
              <Text style={styles.summaryLabel}>
                מע״מ ({pctFmt(props.vatRatePercent)}%)
              </Text>
              <Text style={styles.summaryValue}>{currency(props.vatAmount)}</Text>
            </View>
            <View style={styles.grandLine}>
              <Text style={[styles.summaryLabel, { fontSize: 10 }]}>
                סה״כ לתשלום
              </Text>
              <Text style={[styles.summaryValue, { fontSize: 11 }]}>
                {currency(props.grandTotal)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.legalFooter}>
          <Text style={styles.legalPrimary}>
            מסמך זה הופק ממוחשב וחתום דיגיטלית לפי חוק.
          </Text>
          <Text style={styles.legalSecondary}>
            גיבוב SHA-256 של מטען החשבונית:{" "}
            {props.digitalSignatureSha256
              ? `${props.digitalSignatureSha256.slice(0, 32)}…`
              : "יוקצה בהפקה סופית"}
            {"\n"}
            מסמך זה הופק במערכת מרקר אופק. לתיקונים יש להפיק חשבונית זיכוי לפי הוראות רשות המסים.
          </Text>
        </View>
      </Page>
    </Document>
  )
}
