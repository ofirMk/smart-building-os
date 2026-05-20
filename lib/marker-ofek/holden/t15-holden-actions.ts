"use server"

/**
 * Sprint T15 — Holden AI Copilot (server action).
 *
 * The strategic intent is to ship a "feels-like-AI" copilot that can answer
 * five flagship questions about live system state with high-quality, deeply
 * contextual responses — without taking a hard runtime dependency on an
 * external LLM API key during demos.
 *
 * Implementation: a small **smart router** based on Hebrew + English keyword
 * scoring. Each intent (`tender`, `budget`, `portfolio`, `vendor`,
 * `cost-control`) carries a curated response that links straight back into
 * the relevant module. When no intent matches we fall through to an
 * intentionally-honest "demo mode" reply.
 *
 * When the production OpenAI integration lands, this file's signature stays
 * stable — only the body of `askHoldenAction` swaps to a real chat
 * completion call. The UI never has to change.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HoldenIntent =
  | "tender"
  | "budget"
  | "portfolio"
  | "vendor"
  | "cost-control"
  | "greeting"
  | "fallback"

export interface HoldenActionLink {
  label: string
  href: string
}

export interface HoldenInsightChip {
  label: string
  tone: "indigo" | "emerald" | "amber" | "rose" | "violet"
}

export interface HoldenResponse {
  text: string
  intent: HoldenIntent
  /** Optional CTA button rendered under the bubble. */
  actionLink?: HoldenActionLink
  /** Optional secondary follow-up bubbles surfaced as tappable chips. */
  followUps?: string[]
  /** Optional KPI-style chips embedded inside the assistant bubble. */
  insightChips?: HoldenInsightChip[]
}

export type AskHoldenResult =
  | { ok: true; response: HoldenResponse }
  | { ok: false; error: string }

// ---------------------------------------------------------------------------
// Keyword sets (Hebrew + English) — order doesn't matter.
// ---------------------------------------------------------------------------

const HE_TENDER = ["מכרז", "מכרזים", "אלומיניום", "קבלן", "קבלנים", "הצעת", "הצעות", "זול", "זוכה"]
const EN_TENDER = ["tender", "rfq", "bid", "vendor", "contractor", "aluminum"]

const HE_BUDGET = ["תקציב", "חריגה", "חריגות", "מצב", "פער", "מתוקצב", "בוצע", "ניצול"]
const EN_BUDGET = ["budget", "variance", "overrun", "actual", "utilization"]

const HE_PORTFOLIO = ["פורטפוליו", "מנכל", 'מנכ"ל', "סקירה", "כללי", "פרויקטים", "ארגון"]
const EN_PORTFOLIO = ["portfolio", "ceo", "overview", "company", "projects"]

const HE_VENDOR_PORTAL = ["ספק", "ספקים", "פורטל", "מובייל", "לינק", "magic"]
const EN_VENDOR_PORTAL = ["vendor portal", "magic link", "subcontractor portal", "supplier portal"]

const HE_COST_CONTROL = ["wbs", "פרק", "סעיף", "עלות", "שלד", "גמרים"]
const EN_COST_CONTROL = ["wbs", "section", "chapter", "cost control"]

const HE_GREETING = ["שלום", "היי", "בוקר", "ערב", "מי אתה", "מה אתה"]
const EN_GREETING = ["hello", "hi ", "hey", "who are you", "what are you"]

// Demo project UUID: matches the canonical investor-walkthrough id used by
// the Cost Control tripwire and the seed in `top-navigation.tsx`.
const DEMO_PROJECT_ID = "123e4567-e89b-12d3-a456-426614174000"
const DEMO_VENDOR_TOKEN = "123e4567-e89b-12d3-a456-426614174000"

// ---------------------------------------------------------------------------
// Scoring helper
// ---------------------------------------------------------------------------

function scoreKeywords(haystack: string, keywords: readonly string[]): number {
  const lc = haystack.toLowerCase()
  let score = 0
  for (const kw of keywords) {
    if (lc.includes(kw.toLowerCase())) score += 1
  }
  return score
}

interface IntentScore {
  intent: HoldenIntent
  score: number
}

function classifyIntent(query: string): HoldenIntent {
  const candidates: IntentScore[] = [
    {
      intent: "tender",
      score:
        scoreKeywords(query, HE_TENDER) +
        scoreKeywords(query, EN_TENDER),
    },
    {
      intent: "budget",
      score:
        scoreKeywords(query, HE_BUDGET) +
        scoreKeywords(query, EN_BUDGET),
    },
    {
      intent: "portfolio",
      score:
        scoreKeywords(query, HE_PORTFOLIO) +
        scoreKeywords(query, EN_PORTFOLIO),
    },
    {
      intent: "vendor",
      score:
        scoreKeywords(query, HE_VENDOR_PORTAL) +
        scoreKeywords(query, EN_VENDOR_PORTAL),
    },
    {
      intent: "cost-control",
      score:
        scoreKeywords(query, HE_COST_CONTROL) +
        scoreKeywords(query, EN_COST_CONTROL),
    },
    {
      intent: "greeting",
      score:
        scoreKeywords(query, HE_GREETING) +
        scoreKeywords(query, EN_GREETING),
    },
  ]
  candidates.sort((a, b) => b.score - a.score)
  const top = candidates[0]
  if (!top || top.score === 0) return "fallback"
  return top.intent
}

// ---------------------------------------------------------------------------
// Response factory per intent
// ---------------------------------------------------------------------------

function responseFor(intent: HoldenIntent): HoldenResponse {
  switch (intent) {
    case "tender":
      return {
        intent,
        text:
          "במכרז עבודות האלומיניום הפתוח כרגע (RFQ-2026-ALU-014, פרויקט מגדלי הים), " +
          "ההצעה של חברת אקסטל היא הזולה ביותר מבין שלושת הקבלנים שהגישו — " +
          "כ-5% מתחת להצעת אלוויט וכ-3% מתחת להצעת קליל בכל סעיפי ה-BOQ המרכזיים. " +
          "האם תרצה שאעביר אותך למסך השוואת ההצעות להמשך טיפול וזכייה?",
        actionLink: {
          label: "פתח מטריצת השוואת הצעות (T12)",
          href: "/marker-ofek/procurement/tenders/compare",
        },
        followUps: [
          "מי הקבלן הזול במכרז?",
          "כמה הצעות פעילות יש כעת?",
          "הצג את המכרז הכי גדול",
        ],
        insightChips: [
          { label: "3 קבלנים", tone: "indigo" },
          { label: "אקסטל מוביל", tone: "emerald" },
          { label: "RFQ פתוח", tone: "violet" },
        ],
      }

    case "budget":
    case "cost-control":
      return {
        intent,
        text:
          "זיהיתי חריגות תקציב משמעותיות בפרויקט מגדלי הים: " +
          "פרק 02 (מעטפת ואיטום) חוצה את ה-90% (אזור הזהב הצהוב), " +
          "ופרק 03 (גמרים) — סעיף הריצוף וסעיף המטבחים — חורגים מעל 100% (חריגה אדומה). " +
          "פרק השלד עדיין במגרש הירוק. לחץ למעבר למטריצת מתוקצב-מול-בוצע לבחינת הסעיפים.",
        actionLink: {
          label: "פתח מטריצת בקרת תקציב (T13)",
          href: `/marker-ofek/projects/${DEMO_PROJECT_ID}/cost-control`,
        },
        followUps: [
          "הצג חריגות מעל 100%",
          "מה מצב השלד?",
          "סכם לי את כל הפרקים",
        ],
        insightChips: [
          { label: "פרק 02 ב-97%", tone: "amber" },
          { label: "פרק 03 חריגה", tone: "rose" },
          { label: "פרק 01 תקין", tone: "emerald" },
        ],
      }

    case "portfolio":
      return {
        intent,
        text:
          "סקירת המנכ״ל מראה תמונה כוללת חיובית: 4 פרויקטים פעילים, סך עלויות חוזיות " +
          "מצטברות מעל 180 מיליון ₪, ושיעור התקדמות ממוצע של 62%. שני פרויקטים " +
          "במצב חירום פיננסי קל (מגדלי הים, מרכז מסחרי דרום) ויתר הפרויקטים בקצב " +
          "תכנון. מומלץ לפתוח את לוח הבקרה הניהולי לעומק.",
        actionLink: {
          label: "פתח את מסך המנכ״ל (T10)",
          href: "/marker-ofek/portfolio",
        },
        followUps: [
          "מי הפרויקט הכי גדול?",
          "סטטוס מזומנים כללי",
          "הצג חריגות פעילות",
        ],
        insightChips: [
          { label: "4 פרויקטים", tone: "indigo" },
          { label: "62% התקדמות", tone: "violet" },
          { label: "180M ₪", tone: "emerald" },
        ],
      }

    case "vendor":
      return {
        intent,
        text:
          "פורטל קבלני המשנה (Magic Link) פעיל. כל קבלן מקבל קישור ייחודי " +
          "במובייל וממלא את הצעת המחיר ישירות מהשטח. הצעות שמוגשות זורמות " +
          "אוטומטית למסך השוואת ההצעות (T12) — אפקט רשת B2B. רוצה לראות " +
          "איך הקבלן רואה את זה?",
        actionLink: {
          label: "פתח דמו פורטל ספק במובייל (T14)",
          href: `/vendor/rfq/${DEMO_VENDOR_TOKEN}`,
        },
        followUps: [
          "מי הקבלן הזול במכרז?",
          "כמה קבלנים פעילים?",
        ],
        insightChips: [
          { label: "Magic Link", tone: "violet" },
          { label: "Mobile-first", tone: "indigo" },
        ],
      }

    case "greeting":
      return {
        intent,
        text:
          "שלום, אני הולדן — מנוע ה-AI Copilot של מרקר אופק. " +
          "אני יודע לקרוא את הנתונים הפעילים של המערכת — מכרזים, תקציב, " +
          "חריגות, סטטוס פורטפוליו — ולתת לך תובנות מהירות עם קישור " +
          "ישיר למסך הרלוונטי. תוכל לשאול אותי בעברית או באנגלית.",
        followUps: [
          "מי הקבלן הזול במכרז?",
          "הצג לי חריגות תקציב",
          "סקירת מנכ״ל כללית",
        ],
        insightChips: [
          { label: "Holden v0.1", tone: "violet" },
          { label: "Demo Mode", tone: "amber" },
        ],
      }

    case "fallback":
    default:
      return {
        intent: "fallback",
        text:
          "אני מנתח את בקשתך מול מסד הנתונים…\n\n" +
          "(הערת מערכת: זהו מצב הדגמה — ולכן רק שאלות-ליבה נבחרות נתמכות " +
          "כרגע. נסה לשאול על מכרזים, תקציב, חריגות, פורטפוליו, או פורטל " +
          "ספקים — או לחץ על אחת מההמלצות למטה.)",
        followUps: [
          "מי הקבלן הזול במכרז?",
          "הצג לי חריגות תקציב",
          "סקירת מנכ״ל כללית",
          "הראה לי את פורטל הספקים",
        ],
        insightChips: [
          { label: "Demo Mode", tone: "amber" },
        ],
      }
  }
}

// ---------------------------------------------------------------------------
// Public action
// ---------------------------------------------------------------------------

export async function askHoldenAction(
  query: string,
): Promise<AskHoldenResult> {
  try {
    const cleaned = (query ?? "").trim()
    if (cleaned.length === 0) {
      return {
        ok: false,
        error: "נא להקליד שאלה לפני השליחה.",
      }
    }
    if (cleaned.length > 1500) {
      return {
        ok: false,
        error: "השאלה ארוכה מדי — אנא קצר ל-1500 תווים.",
      }
    }
    const intent = classifyIntent(cleaned)
    const response = responseFor(intent)
    return { ok: true, response }
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "אירעה שגיאה בלתי צפויה במנוע הולדן.",
    }
  }
}
