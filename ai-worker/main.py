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
from models import DispatchJobRequest, JobResultDone, JobResultFailed

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


# ── Global Exception Handler ──────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    log.exception("Unhandled exception on %s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"ok": False, "error": "Internal server error"},
    )
