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
    marginBottom: 16,
  },
  logoBox: {
    width: 88,
    height: 44,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
  },
  logoText: { fontSize: 7, color: "#64748b" },
  title: { fontSize: 16, marginBottom: 4 },
  meta: { fontSize: 8, color: "#475569", marginBottom: 2 },
  copyBadge: {
    alignSelf: "flex-end",
    borderWidth: 1,
    borderColor: "#0f172a",
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginBottom: 12,
    fontSize: 9,
  },
  section: { marginBottom: 10 },
  sectionTitle: {
    fontSize: 9,
    marginBottom: 4,
    color: "#0f172a",
  },
  tableHeader: {
    flexDirection: "row-reverse",
    borderBottomWidth: 1,
    borderBottomColor: "#0f172a",
    paddingBottom: 4,
    marginTop: 8,
  },
  th: { fontSize: 8, color: "#0f172a" },
  row: {
    flexDirection: "row-reverse",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
    paddingVertical: 5,
  },
  td: { fontSize: 8, color: "#334155" },
  totals: { marginTop: 12, alignItems: "flex-end" },
  totalLine: { flexDirection: "row-reverse", marginBottom: 3 },
  footer: {
    marginTop: 20,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: "#cbd5e1",
    fontSize: 7,
    color: "#64748b",
  },
})

const colDesc = { width: "42%" }
const colQty = { width: "12%", textAlign: "right" as const }
const colUnit = { width: "20%", textAlign: "right" as const }
const colTot = { width: "20%", textAlign: "right" as const }

export function MoTaxInvoicePdfDocument(props: MoTaxInvoicePdfProps) {
  ensureHebrewFont()
  const numLabel =
    props.previewInvoiceNumber != null
      ? String(props.previewInvoiceNumber)
      : "—"

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>חשבונית מס</Text>
            <Text style={styles.meta}>
              לפי נוהלי ניהול ספרים ודיווח מע״מ בישראל
            </Text>
            <Text style={styles.meta}>מסמך ממוחשב — שמירת קובץ מהווה עותק</Text>
          </View>
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>לוגו הולדן גרופ</Text>
          </View>
        </View>

        <Text style={styles.copyBadge}>{props.copyLabel}</Text>

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
          <Text style={styles.meta}>סוג הכנסה: {props.incomeKindLabel}</Text>
          {props.projectLabel ? (
            <Text style={styles.meta}>פרויקט: {props.projectLabel}</Text>
          ) : null}
          {props.contractLabel ? (
            <Text style={styles.meta}>חוזה: {props.contractLabel}</Text>
          ) : null}
        </View>

        <View style={styles.tableHeader}>
          <Text style={[styles.th, colDesc]}>תיאור</Text>
          <Text style={[styles.th, colQty]}>כמות</Text>
          <Text style={[styles.th, colUnit]}>מחיר יחידה</Text>
          <Text style={[styles.th, colTot]}>סה״כ שורה</Text>
        </View>
        {props.lines.map((l, i) => (
          <View key={i} style={styles.row} wrap={false}>
            <Text style={[styles.td, colDesc]}>{l.description}</Text>
            <Text style={[styles.td, colQty]}>
              {new Intl.NumberFormat("he-IL", { maximumFractionDigits: 4 }).format(
                l.quantity
              )}
            </Text>
            <Text style={[styles.td, colUnit]}>{currency(l.unitPrice)}</Text>
            <Text style={[styles.td, colTot]}>{currency(l.lineTotal)}</Text>
          </View>
        ))}

        <View style={styles.totals}>
          <View style={styles.totalLine}>
            <Text style={{ width: 120, fontSize: 9 }}>סכום לפני מע״מ:</Text>
            <Text style={{ width: 100, fontSize: 9, textAlign: "left" }}>
              {currency(props.subtotal)}
            </Text>
          </View>
          <View style={styles.totalLine}>
            <Text style={{ width: 120, fontSize: 9 }}>
              מע״מ ({props.vatRatePercent}%):
            </Text>
            <Text style={{ width: 100, fontSize: 9, textAlign: "left" }}>
              {currency(props.vatAmount)}
            </Text>
          </View>
          <View style={styles.totalLine}>
            <Text style={{ width: 120, fontSize: 10 }}>
              לתשלום כולל מע״מ:
            </Text>
            <Text
              style={{
                width: 100,
                fontSize: 10,
                textAlign: "left",
              }}
            >
              {currency(props.grandTotal)}
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text>
            חתימה אלקטרונית (גיבוב SHA-256 של מטען החשבונית):{" "}
            {props.digitalSignatureSha256
              ? `${props.digitalSignatureSha256.slice(0, 24)}…`
              : "יוקצה בהפקה"}
          </Text>
          <Text style={{ marginTop: 4 }}>
            מסמך זה הופק במערכת מרקר אופק. לתיקונים יש להפיק חשבונית זיכוי
            לפי הוראות רשות המסים.
          </Text>
        </View>
      </Page>
    </Document>
  )
}
