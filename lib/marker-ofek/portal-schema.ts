import { z } from "zod"

import type { QaDefectSeverity, QaDefectType } from "@/lib/marker-ofek/qa-defect-schema"

/**
 * Phase 7.1 — פורטל קבלנים חיצוני (דמה).
 * מזהה קבלן תואם ל־Phase 3.2 (`QA_DEFECT_MOCK_SUBCONTRACTORS`) ו־Phase 4.1 (`SUBCONTRACTOR_BILLING_*`).
 */
export const PORTAL_MOCK_SUBCONTRACTOR_ID = "sc-kohen-elec" as const
export const PORTAL_MOCK_SUBCONTRACTOR_NAME = "כהן חשמל" as const

/** סטטוס ליקוי שניתן לטיפול בפורטל (לא הושלם/נדחה). */
export type PortalDefectActionStatus = "פתוח" | "בטיפול"

export type PortalOpenDefect = {
  id: string
  /** תואם `QA_DEFECT_MOCK_PROJECTS` */
  projectId: string
  projectLabel: string
  defectType: QaDefectType
  severity: QaDefectSeverity
  status: PortalDefectActionStatus
  location: string
  description: string
  /** ‎yyyy-mm-dd‎ */
  openedAt: string
}

/**
 * חשבונות אחרונים — תואם לוגיקת Phase 4.1 (סכומים claimed/approved, חודש חיוב).
 */
export type PortalInvoiceApprovalStatus = "ממתין לאישור" | "אושר לתשלום" | "נדחה"

export type PortalRecentInvoice = {
  id: string
  invoiceNumber: string
  /** ‎yyyy-mm‎ — כמו ‎`billingMonth`‎ ב־subcontractor billing */
  billingMonth: string
  claimedAmount: number
  approvedAmount: number | null
  portalStatus: PortalInvoiceApprovalStatus
}

/** ליקויים פתוחים/בטיפול המשויכים ל־כהן חשמל (Phase 3.2). */
export const PORTAL_OPEN_DEFECTS: PortalOpenDefect[] = [
  {
    id: "qa-def-portal-001",
    projectId: "prj-qa-tlv-01",
    projectLabel: "ת״א צפון — מתח גבוה · מגדל אנרגיה",
    defectType: "חשמל",
    severity: "קריטי",
    status: "פתוח",
    location: "קומה 12 — לוח ראשי צפוני",
    description: "חיווט זמני חשוף ליד פתח תקשורת; נדרש סידור לפי תקן.",
    openedAt: "2026-04-02",
  },
  {
    id: "qa-def-portal-002",
    projectId: "prj-qa-haifa-02",
    projectLabel: "נמל חיפה — תאורה ומיגון",
    defectType: "חשמל",
    severity: "בינוני",
    status: "בטיפול",
    location: "רציף B — ארונות תאורה חיצונית",
    description: "אטימת כניסות כבלים — הושלם חלקית; נדרשת בדיקת אטימה.",
    openedAt: "2026-04-08",
  },
  {
    id: "qa-def-portal-003",
    projectId: "prj-qa-tlv-01",
    projectLabel: "ת״א צפון — מתח גבוה · מגדל אנרגיה",
    defectType: "חשמל",
    severity: "קל",
    status: "פתוח",
    location: "חניון P1 — תאורת חירום",
    description: "תווית זיהוי לא חוקית על מעגל יציאה — להחליף.",
    openedAt: "2026-04-10",
  },
]

/** חשבונות אחרונים בפורטל (דמה) — קשור ל־Phase 4.1. */
export const PORTAL_RECENT_INVOICES: PortalRecentInvoice[] = [
  {
    id: "inv-portal-2026-03",
    invoiceNumber: "CHB-2026-041",
    billingMonth: "2026-03",
    claimedAmount: 73000,
    approvedAmount: null,
    portalStatus: "ממתין לאישור",
  },
  {
    id: "inv-portal-2026-02",
    invoiceNumber: "CHB-2026-028",
    billingMonth: "2026-02",
    claimedAmount: 61200,
    approvedAmount: 60000,
    portalStatus: "אושר לתשלום",
  },
  {
    id: "inv-portal-2026-01",
    invoiceNumber: "CHB-2026-011",
    billingMonth: "2026-01",
    claimedAmount: 48500,
    approvedAmount: 48500,
    portalStatus: "אושר לתשלום",
  },
]

/** שמות נוחים — תואם מפרט Phase 7.1 (`openDefects` / `recentInvoices`). */
export const openDefects = PORTAL_OPEN_DEFECTS
export const recentInvoices = PORTAL_RECENT_INVOICES

export function portalOpenDefectCount(): number {
  return PORTAL_OPEN_DEFECTS.length
}

export function portalPendingApprovalInvoiceCount(): number {
  return PORTAL_RECENT_INVOICES.filter((r) => r.portalStatus === "ממתין לאישור")
    .length
}

/**
 * טופס הגשת חשבון מהיר בפורטל (חודש נוכחי + סכום נדרש).
 *
 * **אבטחה:** ולידציית Zod בצד לקוח אינה גבול אמון — כל Server Action / Route Handler
 * חייב לפרסר מחדש עם אותה סכימה (או `safeParse`) עם משתמש מאומת בצד השרת.
 * לעולם אל תסמוך על נתוני טופס לקוח לקבלת החלטות RBAC או גישה לנתוני ERP.
 */
export const portalPaymentRequestSchema = z.object({
  billingMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "נא לבחור חודש"),
  claimedAmount: z.coerce.number().positive("נא להזין סכום חיובי"),
  notes: z.string().optional().default(""),
})

export type PortalPaymentRequestInput = z.input<typeof portalPaymentRequestSchema>
export type PortalPaymentRequestOutput = z.output<typeof portalPaymentRequestSchema>

export function defaultPortalPaymentRequestValues(): PortalPaymentRequestInput {
  const month = new Date().toISOString().slice(0, 7)
  return {
    billingMonth: month,
    claimedAmount: 0,
    notes: "",
  }
}
