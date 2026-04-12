import { z } from "zod"

/** מזג אוויר — ערכים בעברית לתאימות תצוגה ושמירה */
export const DAILY_LOG_WEATHER_VALUES = ["בהיר", "מעונן", "גשום", "שרב"] as const

export type DailyLogWeather = (typeof DAILY_LOG_WEATHER_VALUES)[number]

export const dailyLogWeatherSchema = z.enum(DAILY_LOG_WEATHER_VALUES)

export const DAILY_LOG_TASK_STATUS_VALUES = ["בוצע", "עוכב", "בתהליך"] as const

export type DailyLogTaskStatus = (typeof DAILY_LOG_TASK_STATUS_VALUES)[number]

export const dailyLogManpowerRowSchema = z.object({
  role: z.string().min(1, "נא למלא תפקיד"),
  headCount: z.coerce.number().int().min(0, "כמות לא תקינה"),
})

export type DailyLogManpowerRow = z.infer<typeof dailyLogManpowerRowSchema>

export const dailyLogTaskRowSchema = z.object({
  description: z.string().min(1, "נא למלא תיאור משימה"),
  status: z.enum(DAILY_LOG_TASK_STATUS_VALUES),
})

export type DailyLogTaskRow = z.infer<typeof dailyLogTaskRowSchema>

export const dailyLogFormSchema = z.object({
  projectId: z.string().min(1, "נא לבחור פרויקט"),
  /** ערך `input[type=date]` — ‎yyyy-mm-dd */
  logDate: z.string().min(1, "נא לבחור תאריך"),
  weather: dailyLogWeatherSchema,
  generalNotes: z.string().optional().default(""),
  manpower: z
    .array(dailyLogManpowerRowSchema)
    .min(1, "נא להוסיף לפחות שורת כוח אדם אחת"),
  tasks: z.array(dailyLogTaskRowSchema).min(1, "נא להוסיף לפחות משימה אחת"),
})

export type DailyLogFormInput = z.input<typeof dailyLogFormSchema>
export type DailyLogFormOutput = z.output<typeof dailyLogFormSchema>

export type DailyLogMockProject = {
  id: string
  label: string
}

/**
 * Phase 3.1 — פרויקטים לדמה (בחירה בטופס; בעתיד: Supabase / ERP).
 */
export const DAILY_LOG_MOCK_PROJECTS: DailyLogMockProject[] = [
  {
    id: "prj-tlv-north-01",
    label: "ת״א צפון — מתח גבוה · מגדל אנרגיה",
  },
  {
    id: "prj-haifa-port-02",
    label: "נמל חיפה — תאורת רציפים ומיגון",
  },
  {
    id: "prj-beer-sheva-solar-03",
    label: "באר שבע — שדה סולארי 12MW",
  },
  {
    id: "prj-jerusalem-light-04",
    label: "ירושלים — הרחבת רשת תאורה עירונית",
  },
]

export function defaultDailyLogFormValues(): DailyLogFormInput {
  const today = new Date().toISOString().slice(0, 10)
  const firstId = DAILY_LOG_MOCK_PROJECTS[0]?.id ?? ""
  return {
    projectId: firstId,
    logDate: today,
    weather: "בהיר",
    generalNotes: "",
    manpower: [{ role: "", headCount: 0 }],
    tasks: [{ description: "", status: "בוצע" }],
  }
}
