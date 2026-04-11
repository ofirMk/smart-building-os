/**
 * Deep mock data for Project Master Hub (360) — Marker Ofek electrical / infrastructure demos.
 * Merged with live project row (name, code, status) when available.
 */

export type ProjectMasterActivityItem =
  | {
      kind: "daily_log"
      at: string
      title: string
      detail: string
      tags: string[]
    }
  | {
      kind: "sub_bill"
      at: string
      title: string
      detail: string
      amountNis: number
      supplier: string
    }

export type ProjectMasterHubMock = {
  siteManager: string
  weather: {
    tempC: number
    condition: string
    wind: string
    humidityPct: number
  }
  /** IANA — for display; client shows Asia/Jerusalem local time */
  timeZone: string
  financial: {
    budgetExhaustedPct: number
    workCompletedPct: number
    committedNis: number
    earnedValueNis: number
  }
  procurement: {
    openPOs: number
    pendingDeliveries: { label: string; detail: string }[]
    recentSuppliers: string[]
  }
  milestones: {
    id: string
    title: string
    /** ISO */
    targetAt: string
  }[]
  activity: ProjectMasterActivityItem[]
}

const BASE_MOCK: ProjectMasterHubMock = {
  siteManager: "אייל ברק — מנהל אתר בכיר",
  weather: {
    tempC: 23,
    condition: "מעונן חלקית",
    wind: "רוח צפון-מערבית קלה (18 קמ״ש)",
    humidityPct: 62,
  },
  timeZone: "Asia/Jerusalem",
  financial: {
    budgetExhaustedPct: 67,
    workCompletedPct: 54,
    committedNis: 18_420_000,
    earnedValueNis: 14_880_000,
  },
  procurement: {
    openPOs: 14,
    pendingDeliveries: [
      {
        label: "כבלי XLPE 3×240 מ״מ²",
        detail: "משלוח צפוי · מחסן אלקטרה כבלים · אספקה חלקית",
      },
      {
        label: "לוחות משנה יבשים 2500A",
        detail: "2 יח׳ · המתנה לאישור CEO",
      },
      {
        label: "אביזרי הדקה לפסי איסוף",
        detail: "ספק: גולן חשמל · בדרך לאתר",
      },
    ],
    recentSuppliers: [
      "אלקטרה כבלים",
      "גולן חשמל תעשיות",
      "פזגלס אינפרה",
      "שלגון טרנספורמטורים",
    ],
  },
  milestones: [
    {
      id: "m1",
      title: "השלמת משיכת כבלי נוחות בין כניסות A–C",
      targetAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "m2",
      title: "התקנת שנאי יבש 2500kVA + בדיקות התעלה",
      targetAt: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "m3",
      title: "ניסויי אינסולציה ולחץ · אישור מהנדס מערכת",
      targetAt: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ],
  activity: [
    {
      kind: "daily_log",
      at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      title: "משיכת כבלים בקומת מרתף M1",
      detail:
        "הושלמו 180 מ׳ מקטע XLPE; בוצעה בדיקת רציפות. צוות משנה: 4 אנשים.",
      tags: ["כבלים", "תשתית"],
    },
    {
      kind: "sub_bill",
      at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      title: "חשבון קבלן משנה מאושר — חודש 3",
      detail: "עבודות התקנת פסי איסוף + גישור פאזות",
      amountNis: 428_500,
      supplier: "מ.י. חשמול בע״מ",
    },
    {
      kind: "daily_log",
      at: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
      title: "התקנת שנאי + ניסויי ריק",
      detail:
        "הורדה לתעלה T2; בדיקות מתח ריק תקינות. ממתינים לחיבור צד משנה.",
      tags: ["שנאי", "בטיחות"],
    },
    {
      kind: "sub_bill",
      at: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
      title: "חשבון קבלן משנה — אישור מהיר",
      detail: "תשתיות גשרים בין לוחות משנה",
      amountNis: 192_000,
      supplier: "א.ד. תשתיות חשמל",
    },
    {
      kind: "daily_log",
      at: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
      title: "סיור בקרת איכות — מגדלי כניסה",
      detail: "תיעוד פערי תיוג כבלים; נפתחו 2 משימות במערכת.",
      tags: ["בקרה", "תיוג"],
    },
  ],
}

/** URL slug → optional override of display name (when DB missing) */
export const PROJECT_HUB_SLUG_ALIASES: Record<
  string,
  { internalProjectCode: string; fallbackName: string; fallbackAddress: string }
> = {
  "ramat-ir-hayayin": {
    internalProjectCode: "MOF-DEMO-RAMAT-WINE",
    fallbackName: "רמת עיר היין — אשקלון",
    fallbackAddress: "אזור תעשייה דרומי, אשקלון",
  },
}

export function getProjectMasterHubMock(_projectId: string): ProjectMasterHubMock {
  return structuredClone(BASE_MOCK)
}
