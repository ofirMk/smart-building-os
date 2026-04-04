"use server"

/**
 * מכרזים — AI Takeoff (תוכניות / BoQ) — שלד לעתיד.
 * יישום: Gemini Vision על PDF תכנון + התאמה ל־tender_boq_items / WBS.
 */

export async function tendersTakeoffPlaceholder(): Promise<{
  ok: true
  message: string
}> {
  return {
    ok: true,
    message: "AI Takeoff — יושק בשלב הבא (ראו AI_FEATURE_ENTRY_BY_MODULE.tenders).",
  }
}
