"""
AI Worker — FastAPI Skeleton
Phase 4a: Handshake מוכח מול ה-ERP (stub ללא CrewAI)
Phase 4b: החלפת run_job_stub ב-CrewAI Crew אמיתי
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from contextlib import asynccontextmanager
from typing import Any

import httpx
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse

from config import settings
from hmac_utils import sign_payload, verify_bearer
from pydantic import BaseModel
from models import (
    DispatchJobRequest,
    JobResultDone,
    JobResultFailed,
    VariationBookletRequest,
    VariationBookletResponse,
)

# ── Logging ──────────────────────────────────────────────────

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("ai-worker")


# ── App Lifecycle ─────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("AI Worker starting — ERP base URL: %s", settings.erp_base_url)
    yield
    log.info("AI Worker shutting down")


app = FastAPI(
    title="Smart Building OS — AI Worker",
    description="Python microservice שמקבל AI Jobs מ-Supabase ומחזיר תוצאות ל-ERP",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url=None,
)


# ── Auth Dependency ───────────────────────────────────────────

def require_bearer(authorization: str = Header(...)) -> None:
    """
    מאמת Bearer token שנשלח מהטריגר של pg_net.
    פורמט: `Authorization: Bearer <AI_WORKER_BEARER>`
    """
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header",
        )
    if not verify_bearer(token, settings.ai_worker_bearer):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Bearer token",
        )


# ── ERP Callback ──────────────────────────────────────────────

async def post_result_to_erp(
    job_id: str,
    result_payload: dict[str, Any],
) -> None:
    """
    שולח תוצאת Job חזרה ל-ERP עם חתימת HMAC.
    POST /api/erp/ai/jobs/{id}/result
    """
    url = f"{settings.erp_base_url}/api/erp/ai/jobs/{job_id}/result"
    body_str = json.dumps(result_payload, ensure_ascii=False)
    signature = sign_payload(body_str, settings.ai_worker_secret)

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.post(
                url,
                content=body_str.encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "x-ai-signature": signature,
                },
            )
            log.info(
                "[%s] ERP callback → %s | status=%d",
                job_id,
                url,
                resp.status_code,
            )
            if resp.status_code not in (200, 201):
                log.warning("[%s] ERP callback returned non-2xx: %s", job_id, resp.text)
        except httpx.RequestError as exc:
            log.error("[%s] ERP callback network error: %s", job_id, exc)


# ── Stub Worker (Phase 4a) ────────────────────────────────────
# החלף את הפונקציה הזו ב-CrewAI Crew בPhase 4b

async def run_job_stub(job: DispatchJobRequest) -> None:
    """
    Stub: מדמה עיבוד של 3 שניות ומחזיר תוצאה מוצלחת.
    מטרה: הוכחת end-to-end handshake לפני כתיבת CrewAI.

    להחליף ב:
        from crews.gantt_risk_crew import GanttRiskCrew
        result = await GanttRiskCrew(job.payload).kickoff()
    """
    job_id = str(job.job_id)
    log.info("[%s] Starting stub job (type=%s)", job_id, job.type)
    start = time.monotonic()

    await asyncio.sleep(3)  # ← מחק שורה זו והכנס CrewAI כאן

    elapsed = round(time.monotonic() - start, 2)
    log.info("[%s] Stub complete in %ss", job_id, elapsed)

    result_payload = JobResultDone(
        result={
            "stub": True,
            "job_type": job.type,
            "company_id": job.company_id,
            "elapsed_seconds": elapsed,
            "message": "Handshake successful — ready for CrewAI integration",
        }
    ).model_dump(exclude_none=True)

    await post_result_to_erp(job_id, result_payload)


async def run_job(job: DispatchJobRequest) -> None:
    """
    Router: מנתב לפונקציית עיבוד לפי job.type.
    אם אין מימוש ל-type — נופל חזרה ל-stub (הוכחת handshake).
    """
    job_id = str(job.job_id)
    try:
        if job.type == "gantt_risk_analysis":
            await _run_gantt_risk(job)
        else:
            log.warning(
                "[%s] No crew implemented for type='%s' — falling back to stub",
                job_id,
                job.type,
            )
            await run_job_stub(job)

    except Exception as exc:  # noqa: BLE001
        log.exception("[%s] Job failed: %s", job_id, exc)
        failure_payload = JobResultFailed(
            error_message=f"Worker error: {exc!s}"
        ).model_dump(exclude_none=True)
        await post_result_to_erp(job_id, failure_payload)


async def _run_gantt_risk(job: DispatchJobRequest) -> None:
    """מריץ את ה-GanttRiskCrew ושולח את התוצאה המאומתת חזרה ל-ERP."""
    job_id = str(job.job_id)
    project_id = job.payload.get("project_id") if isinstance(job.payload, dict) else None
    if not project_id:
        raise ValueError("payload.project_id is required for gantt_risk_analysis")

    # import דינמי — מאפשר ל-handshake stub לרוץ גם בלי crewai
    try:
        from crews.gantt_risk_crew import run_gantt_risk_analysis
    except ImportError as exc:
        raise RuntimeError(
            "CrewAI dependencies not installed. Run: "
            "pip install -r requirements.txt (uncomment crewai lines)."
        ) from exc

    log.info("[%s] Running GanttRiskCrew for project_id=%s", job_id, project_id)
    result = await run_gantt_risk_analysis(project_id=str(project_id), payload=dict(job.payload))

    # JobResultDone → ERP, עם ה-result המאומת
    # exclude_none=True כי ב-Zod, .optional() מקבל undefined אבל לא null
    result_payload = JobResultDone(
        result=result.model_dump(mode="json", exclude_none=True),
    ).model_dump(exclude_none=True)

    await post_result_to_erp(job_id, result_payload)


# ── Routes ────────────────────────────────────────────────────

@app.get("/health", tags=["infra"])
async def health_check() -> dict[str, str]:
    """Cloud Run health check — חייב להחזיר 200 תוך 5 שניות."""
    return {"status": "ok", "service": "ai-worker"}


@app.post(
    "/ai/variations/generate-booklet",
    response_model=VariationBookletResponse,
    tags=["variations"],
    dependencies=[Depends(require_bearer)],
)
async def generate_variation_booklet_route(
    payload: VariationBookletRequest,
) -> VariationBookletResponse:
    """
    T12 — מחולל חוברת חריג: RAG (pgvector) → LLM (Gemini) → PyMuPDF merge
    → Storage upload → UPDATE contract_variation_orders → audit log (R6).

    סינכרוני (לא BackgroundTask) — הצרכן (Next.js) מצפה לקבל את ה-pdf_url
    בתשובה כדי להציג למשתמש מיד. עיבוד טיפוסי: 8-25 שניות.
    """
    # import דחוי — מאפשר להריץ את ה-worker (handshake/gantt) גם בלי
    # PyMuPDF מותקן, ולגלות חוסר אך ורק בעת הפעלת ה-endpoint.
    try:
        from crews.variations import generate_variation_booklet
    except ImportError as exc:
        log.exception("T12 booklet deps missing: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "T12 booklet generator unavailable — "
                "ensure PyMuPDF is installed (pip install -r requirements.txt)."
            ),
        ) from exc

    log.info(
        "[t12] dispatch variation=%s company=%s project=%s",
        payload.variation_id,
        payload.company_id,
        payload.project_id,
    )
    try:
        return await generate_variation_booklet(payload)
    except Exception as exc:  # noqa: BLE001 — לוכדים הכול כדי למנוע התרסקות ה-worker
        log.exception("[t12] booklet generation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Variation booklet generation failed: {exc!s}",
        ) from exc


@app.post(
    "/jobs/dispatch",
    status_code=status.HTTP_202_ACCEPTED,
    tags=["jobs"],
    dependencies=[Depends(require_bearer)],
)
async def dispatch_job(
    job: DispatchJobRequest,
    background_tasks: BackgroundTasks,
) -> dict[str, str]:
    """
    מקבל Job מהטריגר של Supabase pg_net ומתחיל עיבוד ב-background.
    מחזיר 202 מיידית — לא מחכה לסיום ה-Job.
    """
    job_id = str(job.job_id)
    log.info(
        "[%s] Received job dispatch (type=%s company=%s)",
        job_id,
        job.type,
        job.company_id,
    )
    background_tasks.add_task(run_job, job)
    return {"status": "accepted", "job_id": job_id}


# ── Photo Verification Endpoint ───────────────────────────────

class VerifyRequest(BaseModel):
    wo_id: str


@app.post(
    "/api/verify",
    status_code=status.HTTP_202_ACCEPTED,
    tags=["verification"],
    dependencies=[Depends(require_bearer)],
)
async def trigger_verification(
    payload: VerifyRequest,
    background_tasks: BackgroundTasks,
) -> dict[str, str]:
    """
    Triggers autonomous AI photo verification for a Work Order.
    Returns 202 immediately — the Gemini Vision crew runs in the background
    and writes the decision (approved/rejected) directly to Supabase.
    """
    log.info("[verify] Received verification request for wo_id=%s", payload.wo_id)
    try:
        from crews.verification_crew import run_verification
    except ImportError as exc:
        log.exception("VerificationCrew deps missing: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Verification crew unavailable — ensure dependencies are installed.",
        ) from exc

    background_tasks.add_task(run_verification, payload.wo_id)
    return {"status": "accepted", "wo_id": payload.wo_id}




@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    log.exception("Unhandled exception on %s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"ok": False, "error": "Internal server error"},
    )
