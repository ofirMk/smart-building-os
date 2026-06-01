"""
T12 — LLM justification generator.

מקבל תיאור-שטח + מקטעי-סעיפים מ-RAG, ומחזיר טקסט-הצדקה
מנוסח בעברית משפטית-קבלנית, שמתאים להכנסה לדף שער של חוברת חריג.

LLM: Gemini (text generation). API key נצרך מ-settings.gemini_api_key.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from config import settings

log = logging.getLogger("ai-worker.t12.llm")


class LlmError(RuntimeError):
    """כשל ביצירת ההצדקה — שגיאת LLM / רשת / תוכן ריק."""


_SYSTEM_PROMPT = """אתה עורך-דין קבלן בכיר המתמחה בחוזי בנייה בישראל,
עם 20 שנות נסיון בניסוח דרישות חריגים (Variation Orders) מול מזמיני עבודה.

המשימה: לנסח הצדקה משפטית-קבלנית מקצועית, בעברית גבוהה,
המסבירה מדוע החריג שבוצע בשטח מצדיק תוספת תמורה מעבר לחוזה הבסיס.

כללי-ניסוח חובה:
1. אורך: 180-280 מילים. פסקה אחת או שתיים.
2. תמיד הפנה לפחות לסעיף-חוזה אחד מתוך הציטוטים שסופקו — בציון שם המסמך.
3. שפה משפטית-עניינית. אסור פאתוס, אסור התנצלויות, אסור מילות-מילוי.
4. אסור להמציא ציטוטים. אם הסעיפים לא מכסים — כתוב במפורש "בהיעדר סעיף ספציפי...".
5. סיים במשפט-מסקנה חד-משמעי הקובע את עילת התוספת.
6. אל תכלול מספרים כספיים — רק את העילה המשפטית והעובדתית.
"""


def _build_user_prompt(description: str, rag_matches: list[dict[str, Any]]) -> str:
    if rag_matches:
        clauses_block = "\n\n".join(
            f"מקור #{i + 1} — {m.get('file_name', 'מסמך')}:\n"
            f"\"{(m.get('ocr_excerpt') or '').strip()}\""
            for i, m in enumerate(rag_matches[:6])
        )
    else:
        clauses_block = "(לא נמצאו סעיפי חוזה רלוונטיים ב-vault — נסח על-בסיס סטנדרט קבלני כללי בלבד.)"

    return (
        f"### תיאור החריג מהשטח:\n{description.strip()}\n\n"
        f"### ציטוטים מסעיפי החוזה (RAG):\n{clauses_block}\n\n"
        f"### המשימה:\nנסח את ההצדקה הקבלנית עבור החריג."
    )


async def generate_justification(
    *,
    description: str,
    rag_matches: list[dict[str, Any]],
) -> str:
    """
    קורא ל-Gemini ומחזיר את ה-ai_justification_text.
    זורק LlmError אם התוכן ריק או הקריאה נכשלה.
    """
    if not settings.gemini_api_key:
        raise LlmError("GEMINI_API_KEY missing — cannot generate justification.")

    model = settings.gemini_model or "gemini-2.5-flash"
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/"
        f"models/{model}:generateContent?key={settings.gemini_api_key}"
    )
    body = {
        "systemInstruction": {"parts": [{"text": _SYSTEM_PROMPT}]},
        "contents": [
            {
                "role": "user",
                "parts": [{"text": _build_user_prompt(description, rag_matches)}],
            }
        ],
        "generationConfig": {
            "temperature": 0.3,
            "topP": 0.9,
            "maxOutputTokens": 1024,
        },
    }

    async with httpx.AsyncClient(timeout=45.0) as client:
        resp = await client.post(url, json=body)
        if resp.status_code != 200:
            raise LlmError(
                f"Gemini generateContent failed (status={resp.status_code}): "
                f"{resp.text[:400]}"
            )
        data = resp.json()

    try:
        candidates = data.get("candidates") or []
        if not candidates:
            raise LlmError(f"Empty candidates from Gemini: {data!r}")
        parts = (candidates[0].get("content") or {}).get("parts") or []
        text = "".join(p.get("text", "") for p in parts).strip()
    except (KeyError, IndexError, AttributeError) as exc:
        raise LlmError(f"Failed parsing Gemini response: {exc}") from exc

    if not text:
        raise LlmError("Gemini returned empty justification text.")

    log.info("[t12.llm] generated justification (chars=%d)", len(text))
    return text
