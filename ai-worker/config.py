"""
Settings — נטענות מ-.env (מקומית) או מ-Cloud Run Environment Variables (production).
כל שדה חסר ב-env יגרום ל-ValidationError בהפעלה — fail-fast.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── אבטחת קשר Supabase → Worker ─────────────────────────
    # הטריגר של pg_net שולח Bearer token זה בכל בקשה
    ai_worker_bearer: str

    # ── אבטחת קשר Worker → ERP ──────────────────────────────
    # ה-Worker חותם בו את ה-callback חזרה ל-/api/erp/ai/jobs/{id}/result
    # חייב להיות זהה ל-AI_WORKER_SECRET ב-.env.local של ה-Next.js
    ai_worker_secret: str

    # ── כתובת בסיס של ה-ERP ──────────────────────────────────
    # דוגמה: https://your-app.vercel.app  (ללא trailing slash)
    erp_base_url: str

    # ── Supabase (קריאה ישירה לגמקט מה-CrewAI) ──────────────
    # משתמשים בservice-role key — מעקף RLS, גישה מלאה לטבלאות
    # ה-Worker רצי בסביבה מבודדת לכן זה מקובל.
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None

    # ── Gemini LLM (ל-CrewAI) ─────────────────────────────────
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"

    # ── לוגים ───────────────────────────────────────
    log_level: str = "INFO"


settings = Settings()
