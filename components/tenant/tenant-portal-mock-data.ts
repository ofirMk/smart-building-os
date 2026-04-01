export type TenantPortalMockTicket = {
  id: string
  title: string
  statusLabel: string
}

export type TenantPortalMockAnnouncement = {
  id: string
  title: string
  dateLabel: string
}

/** שורה בהיסטוריית תשלומים — מסמכים מממשק חשבוניות חיצוני (מאושר) */
export type TenantPortalMockReceipt = {
  id: string
  dateLabel: string
  /** לדוגמה: קבלה #10045 */
  documentNumber: string
  description: string
  amountNis: number
}

export type TenantPortalMock = {
  welcomeTitle: string
  unitSubtitle: string
  openBalanceNis: number
  /** מספר קריאות פתוחות / בטיפול */
  activeTicketsCount: number
  activeTicketsSummary: string
  paymentHistory: TenantPortalMockReceipt[]
  recentTickets: TenantPortalMockTicket[]
  recentAnnouncements: TenantPortalMockAnnouncement[]
}

export const TENANT_PORTAL_MOCK: TenantPortalMock = {
  welcomeTitle: "אזור אישי - משפחת כהן",
  unitSubtitle: "בניין A, דירה 12",
  openBalanceNis: 450,
  activeTicketsCount: 1,
  activeTicketsSummary: "קריאה אחת בטיפול",
  paymentHistory: [
    {
      id: "pay-1",
      dateLabel: "5.3.2026",
      documentNumber: "קבלה #10045",
      description: "דמי ניהול מרץ 2026",
      amountNis: 1850,
    },
    {
      id: "pay-2",
      dateLabel: "28.2.2026",
      documentNumber: "קבלה #10012",
      description: "טעינת רכב חשמלי — פברואר 2026",
      amountNis: 287.4,
    },
    {
      id: "pay-3",
      dateLabel: "5.2.2026",
      documentNumber: "חשבונית #INV-2026-0084",
      description: "דמי ניהול פברואר 2026",
      amountNis: 1850,
    },
    {
      id: "pay-4",
      dateLabel: "12.1.2026",
      documentNumber: "קבלה #09901",
      description: "חניה — רבעון ראשון 2026",
      amountNis: 1350,
    },
    {
      id: "pay-5",
      dateLabel: "5.1.2026",
      documentNumber: "קבלה #09876",
      description: "דמי ניהול ינואר 2026",
      amountNis: 1850,
    },
  ],
  recentTickets: [
    {
      id: "t1",
      title: "תקלה במזגן",
      statusLabel: "בטיפול",
    },
    {
      id: "t2",
      title: "נזילה קלה במקלחת",
      statusLabel: "טופל",
    },
  ],
  recentAnnouncements: [
    {
      id: "a1",
      title: "הודעת ועד: ניקיון חניון",
      dateLabel: "20.3.2025",
    },
    {
      id: "a2",
      title: "עדכון שעות פעילות חדר הכושר",
      dateLabel: "15.3.2025",
    },
  ],
}
