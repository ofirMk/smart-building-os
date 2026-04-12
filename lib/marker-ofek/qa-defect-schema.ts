import { z } from "zod"

export const QA_DEFECT_TYPE_VALUES = ["חשמל", "תקשורת", "בינוי", "בטיחות"] as const
export type QaDefectType = (typeof QA_DEFECT_TYPE_VALUES)[number]

export const QA_DEFECT_SEVERITY_VALUES = [
  "קל",
  "בינוני",
  "קריטי",
  "עוצר עבודה",
] as const
export type QaDefectSeverity = (typeof QA_DEFECT_SEVERITY_VALUES)[number]

export const QA_DEFECT_STATUS_VALUES = [
  "פתוח",
  "בטיפול",
  "הושלם",
  "נדחה",
] as const
export type QaDefectStatus = (typeof QA_DEFECT_STATUS_VALUES)[number]

export const qaDefectFormSchema = z.object({
  projectId: z.string().min(1, "נא לבחור פרויקט"),
  defectType: z.enum(QA_DEFECT_TYPE_VALUES),
  severity: z.enum(QA_DEFECT_SEVERITY_VALUES),
  /** מזהה קבלן משנה מתוך `QA_DEFECT_MOCK_SUBCONTRACTORS` */
  assignedSubcontractor: z.string().min(1, "נא לבחור קבלן משנה"),
  location: z
    .string()
    .min(1, "נא למלא מיקום באתר")
    .transform((s) => s.trim()),
  description: z
    .string()
    .min(1, "נא למלא תיאור הליקוי")
    .transform((s) => s.trim()),
  status: z.enum(QA_DEFECT_STATUS_VALUES).default("פתוח"),
})

export type QaDefectFormInput = z.input<typeof qaDefectFormSchema>
export type QaDefectFormOutput = z.output<typeof qaDefectFormSchema>

export type QaDefectMockProject = {
  id: string
  label: string
}

export type QaDefectMockSubcontractor = {
  id: string
  name: string
}

/**
 * Phase 3.2 — פרויקטים לדמה.
 */
export const QA_DEFECT_MOCK_PROJECTS: QaDefectMockProject[] = [
  { id: "prj-qa-tlv-01", label: "ת״א צפון — מתח גבוה · מגדל אנרגיה" },
  { id: "prj-qa-haifa-02", label: "נמל חיפה — תאורה ומיגון" },
  { id: "prj-qa-bs-03", label: "באר שבע — שדה סולארי 12MW" },
  { id: "prj-qa-jlm-04", label: "ירושלים — הרחבת רשת תאורה" },
]

/**
 * Phase 3.2 — קבלני משנה לדמה (הקצאת ליקוי).
 */
export const QA_DEFECT_MOCK_SUBCONTRACTORS: QaDefectMockSubcontractor[] = [
  { id: "sc-kohen-elec", name: "כהן חשמל" },
  { id: "sc-aa-gypsum", name: "א.א עבודות גבס" },
  { id: "sc-electra-infra", name: "אלקטרה תשתיות" },
]

export function defaultQaDefectFormValues(): QaDefectFormInput {
  return {
    projectId: QA_DEFECT_MOCK_PROJECTS[0]?.id ?? "",
    defectType: "חשמל",
    severity: "בינוני",
    assignedSubcontractor: QA_DEFECT_MOCK_SUBCONTRACTORS[0]?.id ?? "",
    location: "",
    description: "",
    status: "פתוח",
  }
}

export function isQaSeverityCritical(severity: QaDefectSeverity): boolean {
  return severity === "קריטי" || severity === "עוצר עבודה"
}
