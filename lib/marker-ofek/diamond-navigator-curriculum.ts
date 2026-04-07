/** תכנית סיור 360 — מסלולים לא לינאריים + טקסטי Deep Dive */

export type DiamondTrackId =
  | "finance"
  | "operations"
  | "procurement"
  | "tenders"
  | "security"

export type NavigatorStep = {
  id: string
  title: string
  /** טיפ ראשי — איך עובדים */
  tip: string
  /** לוגיקה עסקית — אופציונלי */
  deepDive?: string
  /** מפתח ל־data-diamond-spotlight בדף (אופציונלי) */
  spotlightAnchor?: string
  ctaHref?: string
  ctaLabel?: string
}

export const DIAMOND_TRACK_MENU: {
  id: DiamondTrackId
  label: string
  subtitle: string
}[] = [
  {
    id: "finance",
    label: "כספים",
    subtitle: "P&L ב־3 רמות · מע״מ · רווח טעון",
  },
  {
    id: "operations",
    label: "שטח",
    subtitle: "דיווח יומי · גאנט · סנכרון לחשבונות חלקיים",
  },
  {
    id: "procurement",
    label: "רכש",
    subtitle: "שער מנכ״ל · קטלוג מול גיליון פרויקט",
  },
  {
    id: "tenders",
    label: "מכרזים",
    subtitle: "BoQ → חוזה מנצח",
  },
  {
    id: "security",
    label: "אבטחה ותאימות",
    subtitle: "הרשאות · עקביות נתונים",
  },
]

export const DIAMOND_NAVIGATOR_STEPS: Record<DiamondTrackId, NavigatorStep[]> = {
  procurement: [
    {
      id: "p1",
      title: "קטלוג מול גיליון פרויקט",
      tip: "הקטלוג הוא מקור האמת לפריט ומחיר בסיס. בגיליון הפרויקט בוחרים פריטים וכמויות — כך נשמרת עקביות בין הזמנות לתקציב.",
      deepDive:
        "PO נספר בעלות פרויקט רק כשהוא עובר את שער האישורים (כולל מנכ״ל כשנדרש). טיוטה ו־«ממתין» לא נכנסים לעלות מחויבת — כדי להגן על התקציב.",
      spotlightAnchor: "cc-modules",
      ctaHref: "/marker-ofek/procurement/catalog",
      ctaLabel: "לקטלוג",
    },
    {
      id: "p2",
      title: "שער מנכ״ל (CEO Gatekeeper)",
      tip: "הזמנות מעל סף או ללא חתימה נשארות בתור — עד לאישור. זה מונע הפתעות תזרימיות.",
      deepDive:
        "המערכת מבדילה בין הזמנה בטיוטה, ממתינה לאישור, ומאושרת. רק המסלול המאושר נספר בדוחות עלות הפרויקט.",
      spotlightAnchor: "cc-alerts",
      ctaHref: "/marker-ofek/procurement/orders",
      ctaLabel: "לתור הזמנות",
    },
  ],
  tenders: [
    {
      id: "t1",
      title: "מכרז → BoQ סופי",
      tip: "בשלב המכרז בונים כתב כמויות; הגרסה הסופית (final) היא הבסיס להצעת מחיר ולהמרה לחוזה.",
      deepDive:
        "קישור לפרויקט ולישות חובה לפני ניצחון — אחרת אין המשך תקין לביצוע ולחיוב.",
      spotlightAnchor: "cc-modules",
      ctaHref: "/marker-ofek/tenders/boq",
      ctaLabel: "לכתבי כמויות",
    },
    {
      id: "t2",
      title: "ניצחון → חוזה",
      tip: "אחרי ניצחון נוצר רשומת חוזה ושורות BOQ — הכנסות וחשבונות חלקיים יושבים על אותן שורות.",
      deepDive:
        "סטטוס מכרז עובר draft → submitted → won/lost. won יוצר `contracts` וקושר ל־tender.",
      ctaHref: "/marker-ofek/tenders",
      ctaLabel: "מרכז מכרזים",
    },
  ],
  operations: [
    {
      id: "o1",
      title: "דיווח ביצוע יומי",
      tip: "יומן השטח מתעד מה בוצע היום — בסיס לשקיפות מול הלקוח ולמעקב אחרי פערים.",
      deepDive:
        "שדות משימה וכוח אדם ביומן מקשרים לפעילות בגאנט ולשורות חוזה — כך אפשר להסביר פערים בין שטח לחיוב.",
      spotlightAnchor: "cc-quick",
      ctaHref: "/marker-ofek/execution/daily-logs",
      ctaLabel: "ליומני עבודה",
    },
    {
      id: "o2",
      title: "גאנט · WBS · סנכרון",
      tip: "אחוזי התקדמות במשימות נכנסים להצעות חיוב ולחשבונות חלקיים כשהתהליך מאושר.",
      deepDive:
        "משימות נגזרות (ספקי ביצוע) נבדקות מול לוח הזמנים של המאסטר — חריגות מודגשות במרכז הפיקוד.",
      spotlightAnchor: "cc-modules",
      ctaHref: "/marker-ofek/execution/gantt",
      ctaLabel: "לגאנט",
    },
  ],
  finance: [
    {
      id: "f1",
      title: "חשבונות חלקיים ועכבון",
      tip: "חשבון חלקי מחשב תקופה לפי שינוי באחוזים וב־BOQ; ניכויים (עכבון, ביטוח, מעבדה) מפחיתים את הסכום לתשלום.",
      deepDive:
        "המנוע שומר קודם % / נוכחי % / מצטבר ומיישם כללי ניכוי מהחוזה. התוצאה היא `payment_due` מבוקרת.",
      spotlightAnchor: "cc-pulse",
      ctaHref: "/marker-ofek/finance/partials",
      ctaLabel: "לחשבונות חלקיים",
    },
    {
      id: "f2",
      title: "P&L ב־3 רמות · רווח טעון",
      tip: "רמה 1: רווח גולמי (הכנסה מוכרת פחות עלות ישירה). רמה 2: תפעולי. רמה 3: אחרי הקצאת עקיפות חברה — הרווח ה«טעון».",
      deepDive:
        "מע״מ פלט נגזר מחשבוניות מאושרות/שולם. דשבורד ההנהלה מרכז את התמונה לפני החלטות תזרים.",
      spotlightAnchor: "cc-modules",
      ctaHref: "/management",
      ctaLabel: "דשבורד הנהלה",
    },
  ],
  security: [
    {
      id: "s1",
      title: "הרשאות ותצוגת כספים",
      tip: "צפייה בכספים להנהלה בכירה מופעלת לפי משתמש — לא כל תפקיד רואה פורטפוליו.",
      deepDive:
        "מנהל־על יכול לכוון מודולים וגישה לפי פרויקטים. שינויים נשמרים ב־`user_dashboard_configs`.",
      ctaHref: "/marker-ofek/settings/user-permissions",
      ctaLabel: "הרשאות",
    },
    {
      id: "s2",
      title: "עקביות ומסמכים",
      tip: "כספת חוזה וקישור חשבונית–חשבון חלקי מפחיתים כפל הכרה בהכנסות.",
      deepDive:
        "מסלולי הקליטה (רכש, חלקיים, חשבוניות) בודקים בעלות על שורות ופרויקט לפני שמירה.",
      ctaHref: "/marker-ofek/finance/contract-vault",
      ctaLabel: "כספת חוזה",
    },
  ],
}

/** סיור מהיר — כל התחנות ברצף קצר (ללא מסלול עמוק) */
export const QUICK_TOUR_STEPS: NavigatorStep[] = [
  {
    id: "q1",
    title: "רכש — שער תקציב",
    tip: "אישור הנהלה על PO לפני שעלות נכנסת לפרויקט.",
    spotlightAnchor: "cc-alerts",
    ctaHref: "/marker-ofek/procurement/orders",
    ctaLabel: "הזמנות",
  },
  {
    id: "q2",
    title: "מכרזים → חוזה",
    tip: "BoQ סופי הופך לחוזה מנצח.",
    ctaHref: "/marker-ofek/tenders/boq",
    ctaLabel: "BoQ",
  },
  {
    id: "q3",
    title: "שטח — דיווח וגאנט",
    tip: "דיווח יומי ו־WBS מזינים את מעקב החיוב.",
    spotlightAnchor: "cc-quick",
    ctaHref: "/marker-ofek/execution/daily-logs",
    ctaLabel: "יומנים",
  },
  {
    id: "q4",
    title: "חיוב — חלקיים ועכבון",
    tip: "ניכויים ואחוזים קובעים מה משולם בפועל.",
    ctaHref: "/marker-ofek/finance/partials",
    ctaLabel: "חלקיים",
  },
  {
    id: "q5",
    title: "כספים — רווח טעון",
    tip: "שלוש רמות P&L ומע״מ מוכן לדיווח.",
    deepDive:
      "הרווח הטעון משקף עקיפות חברה מוקצות לפרויקט — לא רק שטח.",
    spotlightAnchor: "cc-modules",
    ctaHref: "/marker-ofek/finance/billing",
    ctaLabel: "חיוב ותזרים",
  },
]

/** מטען HR לסיור ראשון בעוזר AI */
export type HrWelcomePayload = {
  projectName: string | null
  persona: string
  rulesBrief: string
  grantSystemAdmin?: boolean
  completedAt: string | null
}

export type DiamondNavigatorPreferences = {
  suppressIntroTips?: boolean
  masteredTracks?: string[]
  hrWelcome?: HrWelcomePayload | null
}

function parseHrWelcome(raw: unknown): HrWelcomePayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const h = raw as Record<string, unknown>
  const rulesBrief = typeof h.rulesBrief === "string" ? h.rulesBrief : ""
  if (!rulesBrief.trim()) return null
  return {
    projectName: typeof h.projectName === "string" ? h.projectName : null,
    persona: typeof h.persona === "string" ? h.persona : "field",
    rulesBrief: rulesBrief.trim(),
    grantSystemAdmin: h.grantSystemAdmin === true,
    completedAt: typeof h.completedAt === "string" ? h.completedAt : null,
  }
}

export function parseNavigatorPrefs(raw: unknown): DiamondNavigatorPreferences {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const o = raw as Record<string, unknown>
  const mastered = o.masteredTracks
  return {
    suppressIntroTips: Boolean(o.suppressIntroTips),
    masteredTracks: Array.isArray(mastered)
      ? mastered.filter((x): x is string => typeof x === "string")
      : [],
    hrWelcome: parseHrWelcome(o.hrWelcome),
  }
}

/** שמירה ל־JSONB — שומר מפתחות קיימים (כולל hrWelcome) */
export function mergeNavigatorPreferencesRaw(
  existingRaw: unknown,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const base =
    existingRaw && typeof existingRaw === "object" && !Array.isArray(existingRaw)
      ? { ...(existingRaw as Record<string, unknown>) }
      : {}
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) base[k] = v
  }
  return base
}
