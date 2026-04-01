/**
 * מפת ארכיטקטורה חיה — היררכיית ERP מרקר אופק (WBS 0–7).
 * סטטוסים: active / in-progress / planned — לתצוגה במסך system-map.
 */

export type SystemMapStatus = "active" | "in-progress" | "planned"

export type SystemMapNode = {
  id: string
  title: string
  description?: string
  status: SystemMapStatus
  children: SystemMapNode[]
}

const P: SystemMapStatus = "planned"
const A: SystemMapStatus = "active"

/** שורש העץ — רמות 0 עד 7 */
export const MARKER_OFEK_SYSTEM_MAP_ROOT: SystemMapNode[] = [
  {
    id: "0",
    title: "שכבה 0 — תשתית דיגיטלית ו-AI",
    description:
      "בסיס לקטלוג מאסטר, חוויית ERP, והפרדת הרשאות סביב קליטה חכמה",
    status: P,
    children: [
      {
        id: "0.1",
        title: "Shadow Catalog",
        description:
          "קטלוג מאסטר, קטגוריות עם קידומת SKU, מיפוי מק״ט ספק — mo_master_catalog / mo_supplier_catalog",
        status: A,
        children: [],
      },
      {
        id: "0.2",
        title: "Quick Drill-Down (F2)",
        description:
          "פתיחת מסכי הקמת מאסטר בלשונית חדשה מבלי לאבד טיוטת טופס",
        status: A,
        children: [],
      },
      {
        id: "0.3",
        title: "AI Copilot & RBAC",
        description:
          "מודאל Copilot לסיווג קטגוריה/מאסטר; הפרדת admin מול property_manager",
        status: A,
        children: [],
      },
      {
        id: "0.4",
        title: "אירועים, Webhooks ואורקסטרציה",
        description: "הפצת שינויים לשכבות היקף לאחר קליטה ואישור",
        status: P,
        children: [],
      },
      {
        id: "0.5",
        title: "לוגים, ניטור ושגיאות סבלניות",
        description: "עמידות כשה-AI מחובר לליבה — לא לעצור את העסק על ניסוח לא מדויק",
        status: P,
        children: [],
      },
    ],
  },
  {
    id: "1",
    title: "שכבה 1 — ליבה עסקית וקליטת מסמכים",
    description: "חוזים, ישויות, וזרימות מסמכים מסחריים",
    status: P,
    children: [
      {
        id: "1.1",
        title: "ישויות, פרויקטים וחוזים",
        description: "מודול חוזים, שורות חוזה, קישור לפרויקט",
        status: P,
        children: [],
      },
      {
        id: "1.2",
        title: "הצעות מחיר והזמנות",
        status: P,
        children: [
          {
            id: "1.2.1",
            title: "AI OCR Quote Import",
            description:
              "קליטת PDF/תמונה, חילוץ שורות ומטא-דאטה — /marker-ofek/procurement/ai-import",
            status: A,
            children: [],
          },
          {
            id: "1.2.2",
            title: "הזמנת רכש ידנית מתוך הצעה",
            status: P,
            children: [],
          },
        ],
      },
      {
        id: "1.3",
        title: "תעודות משלוח ואסמכתאות",
        status: P,
        children: [],
      },
    ],
  },
  {
    id: "2",
    title: "שכבה 2 — ניהול פרויקטים (PPM)",
    description: "WBS, משימות ותכנון",
    status: P,
    children: [
      {
        id: "2.1",
        title: "מאסטר פרויקטים",
        status: P,
        children: [
          {
            id: "2.1.1",
            title: "F2 Project Creation",
            description:
              "מסך עזר /marker-ofek/projects/setup — הרחבה לטופס הקמה מלא",
            status: A,
            children: [],
          },
        ],
      },
      {
        id: "2.2",
        title: "WBS וחבילות עבודה",
        status: P,
        children: [],
      },
      {
        id: "2.3",
        title: "גנט, לוחות זמנים ומשאבים",
        description: "לוח זמנים וגנט — /marker-ofek/schedule",
        status: P,
        children: [],
      },
    ],
  },
  {
    id: "3",
    title: "שכבה 3 — רכש ושרשרת אספקה",
    description: "PO, קבלות, ומודיעין רכש",
    status: P,
    children: [
      {
        id: "3.1",
        title: "הזמנות רכש ומעקב אספקה",
        status: P,
        children: [],
      },
      {
        id: "3.2",
        title: "שכבת מסמכי רכש",
        status: P,
        children: [
          {
            id: "3.2.1",
            title: "AI Document Metadata",
            description:
              "סוג מסמך, תאריך, שם ספק — שמירה בכותרת קליטה ותצוגה מקדימה",
            status: A,
            children: [],
          },
        ],
      },
      {
        id: "3.3",
        title: "AI Procurement Intelligence",
        description: "חילוץ מובנה לשורות, קטגוריות ומאפיינים",
        status: P,
        children: [
          {
            id: "3.3.1",
            title: "חילוץ שורות, מק״ט ספק ויחידות מידה",
            description: "שדות procurement_intel בשורות קליטה + API OCR",
            status: A,
            children: [],
          },
          {
            id: "3.3.2",
            title: "נירמול שמות וקטגוריות (טקסונומיה)",
            description: "התאמה ל-mo_categories וקטגוריית שונות",
            status: A,
            children: [],
          },
          {
            id: "3.3.3",
            title: "מטא-דאטה מורחבת ותכונות נוספות",
            description: "additional_attributes / brand, voltage וכו׳",
            status: A,
            children: [],
          },
        ],
      },
      {
        id: "3.4",
        title: "גילון ספקים וזמני אספקה",
        description: "/marker-ofek/procurement/aging",
        status: P,
        children: [],
      },
    ],
  },
  {
    id: "4",
    title: "שכבה 4 — מלאי ולוגיסטיקה",
    description: "מחסנים, תנועות מלאי, קיטור",
    status: P,
    children: [
      {
        id: "4.1",
        title: "מאסטר מחסנים ומיקומים",
        status: P,
        children: [],
      },
      {
        id: "4.2",
        title: "תנועות מלאי וקליטה למחסן",
        status: P,
        children: [],
      },
      {
        id: "4.3",
        title: "תעודות משלוח מול מלאי",
        status: P,
        children: [],
      },
    ],
  },
  {
    id: "5",
    title: "שכבה 5 — פיננסים וחשבונאות",
    description: "חשבוניות, תשלומים, מע״מ",
    status: P,
    children: [
      {
        id: "5.1",
        title: "חשבוניות מס ורישום הכנסות",
        status: P,
        children: [],
      },
      {
        id: "5.2",
        title: "חשבונית מרכזת וחשבונות חלקיים",
        description: "/marker-ofek/finance/centralized",
        status: P,
        children: [],
      },
      {
        id: "5.3",
        title: "התאמות בנק וסגירת תקופה",
        status: P,
        children: [],
      },
    ],
  },
  {
    id: "6",
    title: "שכבה 6 — BI, דוחות ואנליטיקה",
    description: "דשבורדים, נתוני הנהלה, חיזוי",
    status: P,
    children: [
      {
        id: "6.1",
        title: "דוחות מובנים וייצוא",
        status: P,
        children: [],
      },
      {
        id: "6.2",
        title: "שאילתות בשפה טבעית (NLQ)",
        status: P,
        children: [],
      },
      {
        id: "6.3",
        title: "ניבוי ביקוש וחריגים",
        status: P,
        children: [],
      },
    ],
  },
  {
    id: "7",
    title: "שכבה 7 — אינטגרציות ו-API חיצוני",
    description: "Priority, OData, סוכני היקף",
    status: P,
    children: [
      {
        id: "7.1",
        title: "API ראשון (REST / OData)",
        status: P,
        children: [],
      },
      {
        id: "7.2",
        title: "סנכרון דו-כיווני ל-ERP חיצוני",
        status: P,
        children: [],
      },
      {
        id: "7.3",
        title: "סוכני AI חיצוניים (MCP / iPaaS)",
        status: P,
        children: [],
      },
    ],
  },
]

export type SystemMapStats = {
  total: number
  active: number
  inProgress: number
  planned: number
  /** אחוז צמתים במצב פעיל מתוך כלל הצמתים */
  percentActive: number
}

/** ספירה רקורסיבית של כל הצמתים בעץ */
export function getSystemMapStats(nodes: SystemMapNode[]): SystemMapStats {
  let total = 0
  let active = 0
  let inProgress = 0
  let planned = 0

  function walk(list: SystemMapNode[]) {
    for (const n of list) {
      total += 1
      if (n.status === "active") active += 1
      else if (n.status === "in-progress") inProgress += 1
      else planned += 1
      if (n.children.length) walk(n.children)
    }
  }

  walk(nodes)
  const percentActive =
    total === 0 ? 0 : Math.round((active / total) * 1000) / 10

  return { total, active, inProgress, planned, percentActive }
}
