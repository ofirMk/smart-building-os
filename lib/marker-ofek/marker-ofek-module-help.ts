export type ModuleHelpBlock = {
  title: string
  paragraphs: string[]
}

const PREFIX_HELP: { prefix: string; block: ModuleHelpBlock }[] = [
  {
    prefix: "/marker-ofek/procurement/catalog",
    block: {
      title: "קטלוג פריטים",
      paragraphs: [
        "זהו קטלוג ארגוני גלובלי: מק״ט מאסטר, תיאור, יחידה ומחירי בסיס — משותף לכל הפרויקטים.",
        "מחירי ספק ספציפיים מופיעים בגיליון הפריטים ובמסכי רכש; כאן מתמקדים בהגדרת הפריט המאוחד.",
      ],
    },
  },
  {
    prefix: "/marker-ofek/items",
    block: {
      title: "גיליון פריטים",
      paragraphs: [
        "תצוגת קטלוג עם היסטוריית מחירים לפי ספק — מקושרת ל־entities דרך supplier_items.",
        "לעריכת הגדרות מאסטר של פריט השתמשו בקטלוג או בטופס הוספה.",
      ],
    },
  },
  {
    prefix: "/marker-ofek/tenders/boq",
    block: {
      title: "כתב כמויות (גיליון מכרז)",
      paragraphs: [
        "זהו גיליון BoQ לפי מכרז נבחר: כמויות, מחירים והשוואות לתמחור — לא הקטלוג הגלובלי.",
        "לאחר זכייה, השורות יכולות להזין חוזה ותכנון ביצוע; הקטלוג נשאר מקור האמת לפריטים.",
      ],
    },
  },
  {
    prefix: "/marker-ofek/tenders/wbs",
    block: {
      title: "מבנה WBS",
      paragraphs: [
        "כאן משייכים שורות BoQ סופיות לקודי WBS לצורך גאנט ותכנון.",
        "במצב עורך Master בונים את עץ העבודה; במצב קידוד BoQ מקשרים שורות כמויות.",
      ],
    },
  },
  {
    prefix: "/marker-ofek/procurement",
    block: {
      title: "מרכז רכש",
      paragraphs: [
        "ניהול הזמנות, ספקים, קליטות וקטלוג — עם מעקב אחר סטטוס ותקציב פרויקט.",
        "קיצורי מקלדת: Ctrl/Cmd+K חיפוש פרויקטים, Enter בוחר תוצאה ראשונה, Ctrl/Cmd+S אירוע שמירה גלובלית (מחוץ לטפסים), Esc סגירת תפריטים.",
      ],
    },
  },
  {
    prefix: "/marker-ofek/tenders",
    block: {
      title: "מכרזים",
      paragraphs: [
        "תמחור, כתבי כמויות והשוואת הצעות לפני חוזה.",
        "בחרו מכרז פעיל מהמרכז כדי לטעון שורות BoQ וקישורים לפרויקט.",
      ],
    },
  },
  {
    prefix: "/marker-ofek/execution/gantt",
    block: {
      title: "גאנט ביצוע",
      paragraphs: [
        "לוח זמנים לפי פרויקט — תאריכים, תלות ושורות נגזרות לחברות ביצוע.",
        "גררו פסים לעדכון; שינויים במשימת מאסטר מזיזים שורות נגזרות לפי כללי המערכת.",
      ],
    },
  },
  {
    prefix: "/marker-ofek/finance",
    block: {
      title: "כספים וחיוב",
      paragraphs: [
        "חשבוניות, חשבונות חלקיים, חוזים והצמדות — לפי מודול המשנה שבחרתם.",
        "במרכז חוזה וחיוב: לחיצה ימנית על שורת BOQ פותחת תפריט (שכפול, AI, קיצור לגאנט).",
      ],
    },
  },
  {
    prefix: "/marker-ofek/partner-finance",
    block: {
      title: "שותפי ניהול",
      paragraphs: [
        "תמצית הכנסות מוכרות מול עלויות ישירות ועקיפות — לפי הרשאות צפייה.",
      ],
    },
  },
  {
    prefix: "/marker-ofek/executive",
    block: {
      title: "דשבורד הנהלה",
      paragraphs: [
        "מדדי תיק פרויקטים, תזרים וסיכונים — לצוות הנהלה.",
      ],
    },
  },
  {
    prefix: "/marker-ofek",
    block: {
      title: "מערכת הביצוע והרכש",
      paragraphs: [
        "מערכת ERP הנדסית: מכרזים, פרויקטים, ביצוע, רכש וכספים במסלול אחד.",
        "סיור 360° (Diamond Navigator) במרכז הפיקוד — מסלולים לפי נושא (רכש, מכרזים, תפעול, כספים) ועומק עסקי אופציונלי.",
        "חיפוש פרויקטים: Ctrl/Cmd+K, Enter לבחירה ראשונה, Esc לסגירת שכבות.",
      ],
    },
  },
  {
    prefix: "/partner-finance",
    block: {
      title: "מרכז שותפי ניהול",
      paragraphs: [
        "תצוגת שותף — מסוננת לפי הרשאות והיקף ניהול.",
      ],
    },
  },
  {
    prefix: "/partner-metrics",
    block: {
      title: "מדדי הנהלה בכירה",
      paragraphs: [
        "סיכומי ביצועים ומדדים לפי פרויקטים משויכים.",
      ],
    },
  },
]

const DEFAULT_HELP: ModuleHelpBlock = {
  title: "עזרה",
  paragraphs: [
    "מודול זה הוא חלק מלוח הבקרה. לניהול מודולים והגדרות כלליות פתחו את מרכז ההגדרות.",
  ],
}

export function resolveModuleHelp(pathname: string): ModuleHelpBlock {
  const path = pathname.split("?")[0] ?? pathname
  for (const { prefix, block } of PREFIX_HELP) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return block
    }
  }
  return DEFAULT_HELP
}

export function showMarkerOfekModuleChrome(pathname: string | null): boolean {
  if (pathname == null || pathname === "") return false
  return (
    pathname.startsWith("/marker-ofek") ||
    pathname.startsWith("/partner-finance") ||
    pathname === "/partner-metrics"
  )
}
