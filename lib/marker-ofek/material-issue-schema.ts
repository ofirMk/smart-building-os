import { z } from "zod"

/** שורת ניפוק — פריט ממלאי / קטלוג דמה */
export const materialIssueLineSchema = z.object({
  sku: z.string().min(1, "נא למלא מק״ט"),
  itemName: z.string().min(1, "נא למלא תיאור פריט"),
  qtyIssued: z.coerce.number().positive("כמות חייבת להיות חיובית"),
  targetLocation: z
    .string()
    .min(1, "נא למלא מיקום יעד")
    .transform((s) => s.trim()),
})

export type MaterialIssueLine = z.infer<typeof materialIssueLineSchema>

export const materialIssueFormSchema = z.object({
  projectId: z.string().min(1, "נא לבחור פרויקט"),
  /** ‎yyyy-mm-dd — ‎`input[type=date]` */
  issueDate: z.string().min(1, "נא לבחור תאריך ניפוק"),
  /** מזהה מ־`MATERIAL_ISSUE_ISSUED_TO_OPTIONS` */
  issuedTo: z.string().min(1, "נא לבחור נמען ניפוק"),
  lines: z.array(materialIssueLineSchema).min(1, "נא להוסיף לפחות שורת ניפוק אחת"),
})

export type MaterialIssueFormInput = z.input<typeof materialIssueFormSchema>
export type MaterialIssueFormOutput = z.output<typeof materialIssueFormSchema>

export type MaterialIssueMockProject = { id: string; label: string }

export const MATERIAL_ISSUE_MOCK_PROJECTS: MaterialIssueMockProject[] = [
  { id: "prj-qa-tlv-01", label: "ת״א צפון — מתח גבוה · מגדל אנרגיה" },
  { id: "prj-qa-haifa-02", label: "נמל חיפה — תאורה ומיגון" },
  { id: "prj-qa-bs-03", label: "באר שבע — שדה סולארי 12MW" },
]

/**
 * נמען ניפוק — קבלני משנה (כמו Phase 3.2) או פורמן פנימי.
 */
export const MATERIAL_ISSUE_ISSUED_TO_OPTIONS: {
  id: string
  label: string
}[] = [
  { id: "sc-kohen-elec", label: "קבלן משנה — כהן חשמל" },
  { id: "sc-aa-gypsum", label: "קבלן משנה — א.א עבודות גבס" },
  { id: "sc-electra-infra", label: "קבלן משנה — אלקטרה תשתיות" },
  { id: "int-foreman-a", label: "פנימי — מנהל עבודה · אתר א׳" },
  { id: "int-foreman-elec", label: "פנימי — פורמן חשמל" },
]

/** דוגמאות פריטים מקטלוג (דמה) */
export const MATERIAL_ISSUE_MOCK_CATALOG_SNIPPETS: Omit<
  MaterialIssueLine,
  "targetLocation"
>[] = [
  {
    sku: "MO-CAB-NYY-3x2.5",
    itemName: "כבל NYY 3×2.5 מ״מ — סליל 100 מ׳",
    qtyIssued: 2,
  },
  {
    sku: "MO-PNL-24M",
    itemName: "לוח חשמל תלת-פאזי — 24 מודול",
    qtyIssued: 1,
  },
]

export function defaultMaterialIssueFormValues(): MaterialIssueFormInput {
  const today = new Date().toISOString().slice(0, 10)
  return {
    projectId: MATERIAL_ISSUE_MOCK_PROJECTS[0]?.id ?? "",
    issueDate: today,
    issuedTo: MATERIAL_ISSUE_ISSUED_TO_OPTIONS[0]?.id ?? "",
    lines: MATERIAL_ISSUE_MOCK_CATALOG_SNIPPETS.map((row) => ({
      ...row,
      targetLocation: "",
    })),
  }
}
