"""
T12 — Variations AI Booklet orchestrator.

זרימה מלאה:
  1. RAG similarity search על description (pgvector, project-scoped).
  2. LLM (Gemini) מנסח ai_justification_text.
  3. PyMuPDF בונה דף שער + מוריד תוכניות + ממזג + מעלה ל-Storage.
  4. UPDATE על contract_variation_orders (status='submitted', pdf_url, justification).
  5. Audit log דרך RPC log_variation_booklet_event (R6).
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from config import settings
from models import VariationBookletRequest, VariationBookletResponse

from .llm import LlmError, generate_justification
from .pdf_merger import PdfMergeError, build_and_upload_booklet
from .rag import RagError, similarity_search

log = logging.getLogger("ai-worker.t12.service")


class BookletServiceError(RuntimeError):
    """כשל מסכם בזרימת ה-booklet — תיתפס ב-FastAPI handler ותוחזר כ-HTTP 500."""


# ── DB writes (service-role) ─────────────────────────────────

def _supabase_rest_headers() -> dict[str, str]:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise BookletServiceError("Supabase service-role creds missing in worker .env.")
    return {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Prefer": "return=representation",
    }


async def _update_variation_row(
    *,
    variation_id: str,
    company_id: str,
    pdf_url: str,
    ai_justification_text: str,
) -> dict[str, Any]:
    """
    PATCH על contract_variation_orders.
    R1: כולל סינון נוסף ב-company_id כדי לא לעקוף tenant isolation
    גם כשרצים תחת service-role.

    הערה לגבי status: ה-check-constraint של T11 מקבל lowercase 'submitted'.
    אנחנו כותבים 'submitted' (case sensitive) — Frontend יכול להציג 'Submitted'.
    """
    url = (
        f"{settings.supabase_url}/rest/v1/contract_variation_orders"
        f"?id=eq.{variation_id}&company_id=eq.{company_id}"
    )
    body = {
        "status": "submitted",
        "pdf_url": pdf_url,
        "ai_justification_text": ai_justification_text,
        "booklet_generated_at": "now()",
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.patch(url, json=body, headers=_supabase_rest_headers())
        if resp.status_code not in (200, 204):
            raise BookletServiceError(
                f"Variation row update failed (status={resp.status_code}): "
                f"{resp.text[:300]}"
            )
        rows = resp.json() if resp.content else []

    if not rows:
        raise BookletServiceError(
            f"No variation row matched id={variation_id} + company_id={company_id} "
            "— either it does not exist or the tenant filter blocked the update."
        )
    return rows[0]


async def _write_audit_log(
    *,
    variation_id: str,
    project_id: str,
    old_row: dict[str, Any] | None,
    new_row: dict[str, Any],
) -> None:
    """R6 — קריאת RPC log_variation_booklet_event."""
    url = f"{settings.supabase_url}/rest/v1/rpc/log_variation_booklet_event"
    body = {
        "p_variation_id": variation_id,
        "p_project_id": project_id,
        "p_action": "UPDATE",
        "p_old": old_row,
        "p_new": new_row,
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, json=body, headers=_supabase_rest_headers())
        if resp.status_code not in (200, 204):
            # לוג בלבד — אסור להפיל את כל הזרימה רק בגלל audit.
            log.warning(
                "[t12.service] audit log write returned %d: %s",
                resp.status_code,
                resp.text[:200],
            )
            return
    log.info("[t12.service] audit log written for variation=%s", variation_id)


async def _fetch_old_row(variation_id: str, company_id: str) -> dict[str, Any] | None:
    """לוקח snapshot של old_row לפני העדכון — לצורך diff מלא ב-audit."""
    url = (
        f"{settings.supabase_url}/rest/v1/contract_variation_orders"
        f"?id=eq.{variation_id}&company_id=eq.{company_id}&select=*"
    )
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, headers=_supabase_rest_headers())
        if resp.status_code != 200:
            return None
        rows = resp.json()
    return rows[0] if isinstance(rows, list) and rows else None


# ── Public entrypoint ────────────────────────────────────────

async def generate_variation_booklet(
    payload: VariationBookletRequest,
) -> VariationBookletResponse:
    """
    Orchestrator T12. נקרא מ-FastAPI route. כל שגיאה מתבטאת
    כ-BookletServiceError ומתורגמת ל-HTTP 500 בראוטר.
    """
    started = time.monotonic()
    variation_id = str(payload.variation_id)
    project_id = str(payload.project_id)
    company_id = payload.company_id

    log.info(
        "[t12] start variation=%s project=%s company=%s attachments=%d",
        variation_id,
        project_id,
        company_id,
        len(payload.attached_pdf_urls),
    )

    # 1) RAG
    try:
        rag_matches = await similarity_search(
            project_id=project_id,
            company_id=company_id,
            query_text=payload.description,
            match_count=6,
        )
    except RagError as exc:
        # RAG חלקית — נמשיך בלי context, אבל נלוגג בקול רם.
        log.warning("[t12] RAG failed, continuing without context: %s", exc)
        rag_matches = []

    # 2) LLM
    try:
        justification = await generate_justification(
            description=payload.description,
            rag_matches=rag_matches,
        )
    except LlmError as exc:
        raise BookletServiceError(f"LLM justification failed: {exc}") from exc

    # 3) PDF (cover + merge + upload)
    try:
        pdf_result = await build_and_upload_booklet(
            variation_id=variation_id,
            project_id=project_id,
            company_id=company_id,
            description=payload.description,
            justification=justification,
            attached_pdf_urls=payload.attached_pdf_urls,
            rag_matches_count=len(rag_matches),
        )
    except PdfMergeError as exc:
        raise BookletServiceError(f"PDF merge/upload failed: {exc}") from exc

    pdf_url: str = pdf_result["pdf_url"]
    pages_merged: int = int(pdf_result["pages_merged"])

    # 4) DB update + 5) Audit
    old_row = await _fetch_old_row(variation_id, company_id)
    new_row = await _update_variation_row(
        variation_id=variation_id,
        company_id=company_id,
        pdf_url=pdf_url,
        ai_justification_text=justification,
    )
    await _write_audit_log(
        variation_id=variation_id,
        project_id=project_id,
        old_row=old_row,
        new_row=new_row,
    )

    elapsed = round(time.monotonic() - started, 2)
    log.info(
        "[t12] done variation=%s pages=%d elapsed=%ss",
        variation_id,
        pages_merged,
        elapsed,
    )

    return VariationBookletResponse(
        variation_id=payload.variation_id,
        pdf_url=pdf_url,
        ai_justification_text=justification,
        rag_matches_count=len(rag_matches),
        pages_merged=pages_merged,
        elapsed_seconds=elapsed,
    )
