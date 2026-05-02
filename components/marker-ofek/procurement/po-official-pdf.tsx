"use client"

/**
 * Phase 8.1.3 — PO Official PDF Document (React-PDF)
 *
 * מסמך רשמי של הזמנת רכש (PO), RTL עברית, מיוצר client-side עם
 * `@react-pdf/renderer`. הדוגמה העיצובית נלקחה מ-`mo-tax-invoice-pdf.tsx`
 * כדי לשמור על עקביות ויזואלית בין המסמכים הרשמיים של מרקר אופק.
 *
 * מבנה:
 *   1. Header — לוגו חברה (placeholder אלגנטי) + כותרת + מספר PO רשמי.
 *   2. Parties block — פרטי הזמנה (מנפיק) + פרטי ספק.
 *   3. פרטי פרויקט + מטבע + תאריכים.
 *   4. טבלת שורות: #, מק"ט, תיאור, כמות, מחיר יח׳, סה"כ.
 *   5. סיכום פיננסי: נטו / מע"מ / ברוטו.
 *   6. אזורי חתימה (מנהל מאשר, ספק).
 *   7. Footer חוקי.
 */

import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer"

export type PoOfficialPdfLine = {
  index: number
  itemNumber: string | null
  description: string
  quantity: number
  unitLabel: string
  unitPrice: number
  totalPrice: number
}

export type PoOfficialPdfProps = {
  /** המספר הרשמי — PO-00001, או fallback ל-`poNumber` (draft) */
  officialPoNumber: string | null
  draftPoNumber: string
  title: string
  issueDate: string
  currency: string
  /** מרקר אופק / הולדן גרופ */
  companyNameHe: string
  companyNameEn: string
  /** ספק */
  supplierName: string
  supplierNumber: string | null
  supplierTaxVatId: string | null
  supplierAddress: string | null
  supplierPhone: string | null
  supplierEmail: string | null
  supplierPaymentTerms: string | null
  /** פרויקט (אופציונלי) */
  projectNumber: string | null
  projectName: string | null
  /** שורות */
  lines: PoOfficialPdfLine[]
  /** סיכומים */
  subtotal: number
  vatAmount: number
  grandTotal: number
  /** מאשר */
  approverName: string | null
  approvedAt: string | null
  notes: string | null
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

const formatCurrency = (n: number, currency: string) => {
  try {
    return new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(n)
  } catch {
    return `${n.toFixed(2)} ${currency}`
  }
}

const formatNumber = (n: number, fractionDigits = 2) =>
  new Intl.NumberFormat("he-IL", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(n)

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 9,
    fontFamily: "NotoSansHebrew",
    direction: "rtl",
  },
  headerRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
    gap: 16,
  },
  logoBox: {
    width: 110,
    minHeight: 56,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
  },
  logoTitle: { fontSize: 11, color: "#0f172a" },
  logoSub: { fontSize: 7, color: "#64748b", marginTop: 2 },
  headerMain: { flex: 1, maxWidth: "72%" },
  docTitle: { fontSize: 18, marginBottom: 4, color: "#0f172a" },
  docTitleEn: { fontSize: 10, color: "#475569", marginBottom: 8 },
  poNumberBox: {
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 2,
    borderColor: "#1e40af",
    backgroundColor: "#eff6ff",
  },
  poNumberLabel: { fontSize: 9, color: "#1e40af", marginBottom: 3 },
  poNumberValue: {
    fontSize: 18,
    color: "#1e3a8a",
    letterSpacing: 1,
  },
  poNumberDraft: {
    fontSize: 10,
    color: "#a16207",
    marginTop: 2,
  },
  partiesRow: {
    flexDirection: "row-reverse",
    gap: 10,
    marginBottom: 12,
  },
  partyBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    padding: 10,
    backgroundColor: "#fafafa",
  },
  partyTitle: {
    fontSize: 9,
    color: "#0f172a",
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#cbd5e1",
  },
  meta: { fontSize: 8, color: "#334155", marginBottom: 2, lineHeight: 1.4 },
  metaLabel: { fontSize: 7, color: "#64748b" },
  projectSection: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
    borderWidth: 0.5,
    borderColor: "#cbd5e1",
    backgroundColor: "#f1f5f9",
  },
  projectCell: { minWidth: 110 },
  sectionTitle: {
    fontSize: 9,
    color: "#0f172a",
    marginBottom: 4,
    marginTop: 10,
  },
  tableOuter: {
    borderWidth: 1,
    borderColor: "#0f172a",
    marginTop: 4,
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: "row-reverse",
    backgroundColor: "#0f172a",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  th: { fontSize: 8, color: "#fff" },
  row: {
    flexDirection: "row-reverse",
    borderBottomWidth: 0.5,
    borderBottomColor: "#cbd5e1",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  rowLast: { borderBottomWidth: 0 },
  td: { fontSize: 8, color: "#334155" },
  footerColumns: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: 6,
    gap: 12,
  },
  summaryBox: {
    width: "42%",
    borderWidth: 1,
    borderColor: "#0f172a",
    padding: 10,
    backgroundColor: "#fafafa",
  },
  summaryTitle: {
    fontSize: 9,
    color: "#0f172a",
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#cbd5e1",
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
    borderTopWidth: 1.5,
    borderTopColor: "#0f172a",
    flexDirection: "row-reverse",
    justifyContent: "space-between",
  },
  notesColumn: { flex: 1, minWidth: "48%" },
  notesBox: {
    borderWidth: 0.5,
    borderColor: "#94a3b8",
    padding: 8,
    marginBottom: 8,
    minHeight: 56,
  },
  notesHeading: { fontSize: 8, color: "#0f172a", marginBottom: 4 },
  notesBody: { fontSize: 8, color: "#475569", lineHeight: 1.35 },
  signaturesRow: {
    flexDirection: "row-reverse",
    gap: 20,
    marginTop: 24,
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: "#cbd5e1",
  },
  signatureBox: {
    flex: 1,
    minHeight: 64,
    borderTopWidth: 1,
    borderTopColor: "#0f172a",
    paddingTop: 6,
  },
  signatureTitle: { fontSize: 8, color: "#0f172a" },
  signatureMeta: { fontSize: 7, color: "#64748b", marginTop: 4 },
  legalFooter: {
    marginTop: 18,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: "#cbd5e1",
  },
  legalPrimary: {
    fontSize: 8,
    color: "#0f172a",
    textAlign: "center",
    marginBottom: 3,
  },
  legalSecondary: {
    fontSize: 7,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 1.4,
  },
})

const colIndex = { width: "5%", textAlign: "right" as const }
const colSku = { width: "14%" }
const colDesc = { width: "33%" }
const colQty = { width: "10%", textAlign: "right" as const }
const colUnit = { width: "10%", textAlign: "right" as const }
const colUnitPrice = { width: "14%", textAlign: "right" as const }
const colTotal = { width: "14%", textAlign: "right" as const }

export function PoOfficialPdfDocument(props: PoOfficialPdfProps) {
  ensureHebrewFont()

  const numberLabel = props.officialPoNumber ?? "—"
  const hasOfficial = Boolean(props.officialPoNumber)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ═════════ HEADER ═════════ */}
        <View style={styles.headerRow}>
          <View style={styles.logoBox}>
            <Text style={styles.logoTitle}>{props.companyNameHe}</Text>
            {props.companyNameEn ? (
              <Text style={styles.logoSub}>{props.companyNameEn}</Text>
            ) : null}
          </View>
          <View style={styles.headerMain}>
            <Text style={styles.docTitle}>הזמנת רכש</Text>
            <Text style={styles.docTitleEn}>Purchase Order</Text>
            <View style={styles.poNumberBox}>
              <Text style={styles.poNumberLabel}>מספר הזמנה רשמי:</Text>
              <Text style={styles.poNumberValue}>{numberLabel}</Text>
              {!hasOfficial ? (
                <Text style={styles.poNumberDraft}>
                  טיוטה — טרם הוקצה מספר רשמי (draft: {props.draftPoNumber})
                </Text>
              ) : null}
            </View>
            <Text style={[styles.meta, { marginTop: 6 }]}>
              נושא ההזמנה: {props.title}
            </Text>
            <Text style={styles.meta}>תאריך הפקה: {props.issueDate}</Text>
            <Text style={styles.meta}>
              מטבע:{" "}
              <Text style={{ fontSize: 9, color: "#0f172a" }}>
                {props.currency}
              </Text>
            </Text>
          </View>
        </View>

        {/* ═════════ PARTIES ═════════ */}
        <View style={styles.partiesRow}>
          <View style={styles.partyBox}>
            <Text style={styles.partyTitle}>מזמין ההזמנה (Buyer)</Text>
            <Text style={styles.meta}>{props.companyNameHe}</Text>
            {props.companyNameEn ? (
              <Text style={styles.meta}>{props.companyNameEn}</Text>
            ) : null}
          </View>
          <View style={styles.partyBox}>
            <Text style={styles.partyTitle}>ספק (Supplier)</Text>
            <Text style={styles.meta}>{props.supplierName}</Text>
            {props.supplierNumber ? (
              <Text style={styles.meta}>
                מספר ספק: {props.supplierNumber}
              </Text>
            ) : null}
            {props.supplierTaxVatId ? (
              <Text style={styles.meta}>
                ח.פ / ע.מ: {props.supplierTaxVatId}
              </Text>
            ) : null}
            {props.supplierAddress ? (
              <Text style={styles.meta}>{props.supplierAddress}</Text>
            ) : null}
            {props.supplierPhone ? (
              <Text style={styles.meta}>טל&#39;: {props.supplierPhone}</Text>
            ) : null}
            {props.supplierEmail ? (
              <Text style={styles.meta}>מייל: {props.supplierEmail}</Text>
            ) : null}
          </View>
        </View>

        {/* ═════════ PROJECT ROW ═════════ */}
        {props.projectName || props.projectNumber ? (
          <View style={styles.projectSection}>
            <View style={styles.projectCell}>
              <Text style={styles.metaLabel}>פרויקט</Text>
              <Text style={styles.meta}>{props.projectName ?? "—"}</Text>
            </View>
            {props.projectNumber ? (
              <View style={styles.projectCell}>
                <Text style={styles.metaLabel}>מספר פרויקט</Text>
                <Text style={styles.meta}>{props.projectNumber}</Text>
              </View>
            ) : null}
            {props.supplierPaymentTerms ? (
              <View style={styles.projectCell}>
                <Text style={styles.metaLabel}>תנאי תשלום</Text>
                <Text style={styles.meta}>{props.supplierPaymentTerms}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ═════════ LINES TABLE ═════════ */}
        <Text style={styles.sectionTitle}>פירוט ההזמנה</Text>
        <View style={styles.tableOuter}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, colIndex]}>#</Text>
            <Text style={[styles.th, colSku]}>מק״ט</Text>
            <Text style={[styles.th, colDesc]}>תיאור</Text>
            <Text style={[styles.th, colQty]}>כמות</Text>
            <Text style={[styles.th, colUnit]}>יח&#39;</Text>
            <Text style={[styles.th, colUnitPrice]}>מחיר יח׳</Text>
            <Text style={[styles.th, colTotal]}>סה&quot;כ</Text>
          </View>
          {props.lines.map((l, i) => {
            const isLast = i === props.lines.length - 1
            return (
              <View
                key={i}
                style={[styles.row, isLast ? styles.rowLast : {}]}
                wrap={false}
              >
                <Text style={[styles.td, colIndex]}>{l.index}</Text>
                <Text style={[styles.td, colSku]}>
                  {l.itemNumber ?? "—"}
                </Text>
                <Text style={[styles.td, colDesc]}>{l.description}</Text>
                <Text style={[styles.td, colQty]}>
                  {formatNumber(l.quantity, 2)}
                </Text>
                <Text style={[styles.td, colUnit]}>{l.unitLabel}</Text>
                <Text style={[styles.td, colUnitPrice]}>
                  {formatCurrency(l.unitPrice, props.currency)}
                </Text>
                <Text style={[styles.td, colTotal]}>
                  {formatCurrency(l.totalPrice, props.currency)}
                </Text>
              </View>
            )
          })}
        </View>

        {/* ═════════ SUMMARY + NOTES ═════════ */}
        <View style={styles.footerColumns}>
          <View style={styles.notesColumn}>
            <View style={styles.notesBox}>
              <Text style={styles.notesHeading}>הערות להזמנה</Text>
              <Text style={styles.notesBody}>
                {props.notes?.trim() || "—"}
              </Text>
            </View>
            <View style={styles.notesBox}>
              <Text style={styles.notesHeading}>הנחיות אספקה</Text>
              <Text style={styles.notesBody}>
                יש לצרף תעודת משלוח בעת האספקה. מסמך זה מהווה הזמנת רכש
                רשמית; חריגות ממחיר/כמות מחייבות אישור בכתב בטרם ביצוע.
              </Text>
            </View>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryTitle}>סיכום פיננסי</Text>
            <View style={styles.summaryLine}>
              <Text style={styles.summaryLabel}>סה&quot;כ לפני מע&quot;מ</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(props.subtotal, props.currency)}
              </Text>
            </View>
            <View style={styles.summaryLine}>
              <Text style={styles.summaryLabel}>מע&quot;מ 17%</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(props.vatAmount, props.currency)}
              </Text>
            </View>
            <View style={styles.grandLine}>
              <Text style={[styles.summaryLabel, { fontSize: 10 }]}>
                סה&quot;כ לתשלום
              </Text>
              <Text style={[styles.summaryValue, { fontSize: 11 }]}>
                {formatCurrency(props.grandTotal, props.currency)}
              </Text>
            </View>
          </View>
        </View>

        {/* ═════════ SIGNATURES ═════════ */}
        <View style={styles.signaturesRow}>
          <View style={styles.signatureBox}>
            <Text style={styles.signatureTitle}>מנהל מאשר</Text>
            {props.approverName ? (
              <Text style={styles.signatureMeta}>
                {props.approverName}
                {props.approvedAt ? ` · ${props.approvedAt}` : ""}
              </Text>
            ) : (
              <Text style={styles.signatureMeta}>
                חתימה בכתב יד / דיגיטלי
              </Text>
            )}
          </View>
          <View style={styles.signatureBox}>
            <Text style={styles.signatureTitle}>אישור הספק</Text>
            <Text style={styles.signatureMeta}>
              שם, חתימה ותאריך
            </Text>
          </View>
        </View>

        {/* ═════════ LEGAL FOOTER ═════════ */}
        <View style={styles.legalFooter}>
          <Text style={styles.legalPrimary}>
            מסמך זה הופק ממערכת {props.companyNameHe} והוא מהווה הזמנת רכש רשמית.
          </Text>
          <Text style={styles.legalSecondary}>
            לביטולים או שינויים יש לפנות למזמין בכתב בלבד. מסמך זה נחתם
            דיגיטלית לאחר אישור גורם הרכש המוסמך.
          </Text>
        </View>
      </Page>
    </Document>
  )
}
