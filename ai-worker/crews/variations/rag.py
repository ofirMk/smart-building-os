"""
T12 — RAG layer.

מבצע חיפוש דמיון קוסינוס מול pgvector של ה-vault הקיים
(mo_contract_vault_documents) דרך ה-RPC הקנוני
match_contract_vault_documents(project_id, query_embedding, match_count).

R1 (Tenant isolation): סינון לפי project_id בתוך ה-RPC. ה-RPC עצמו
מסתמך על mo_contract_vault_row_readable + project membership,
ולכן ההגנה הרב-שכבתית נשמרת גם כשאנחנו רצים עם service_role.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from config import settings

log = logging.getLogger("ai-worker.t12.rag")

GEMINI_EMBED_MODEL = "models/text-embedding-004"  # מחזיר וקטור בגודל 768 — תואם ל-vault
EMBED_OUTPUT_DIMS = 768


class RagError(RuntimeError):
    """כשל בשכבת ה-RAG (embedding או similarity search)."""


async def embed_query(text: str) -> list[float]:
    """
    מייצר embedding ל-query באמצעות Gemini text-embedding-004.
    מחזיר רשימת floats בגודל 768.
    """
    if not settings.gemini_api_key:
        raise RagError("GEMINI_API_KEY missing — cannot embed RAG query.")

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/"
        f"{GEMINI_EMBED_MODEL}:embedContent?key={settings.gemini_api_key}"
    )
    body = {
        "model": GEMINI_EMBED_MODEL,
        "content": {"parts": [{"text": text[:8000]}]},  # cap input size
        "taskType": "RETRIEVAL_QUERY",
        "outputDimensionality": EMBED_OUTPUT_DIMS,
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(url, json=body)
        if resp.status_code != 200:
            raise RagError(
                f"Gemini embedContent failed (status={resp.status_code}): "
                f"{resp.text[:300]}"
            )
        data = resp.json()

    values = (data.get("embedding") or {}).get("values")
    if not isinstance(values, list) or len(values) != EMBED_OUTPUT_DIMS:
        raise RagError(
            f"Unexpected embedding shape: got len="
            f"{len(values) if isinstance(values, list) else 'n/a'}"
        )
    return [float(v) for v in values]


async def similarity_search(
    *,
    project_id: str,
    company_id: str,
    query_text: str,
    match_count: int = 6,
) -> list[dict[str, Any]]:
    """
    מבצע similarity search מול ה-vault. מסנן double-defense ב-company_id
    דרך JOIN logical (ה-RPC עצמו project-scoped).

    Returns: רשימה של {id, file_name, ocr_excerpt, similarity}.
    """
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RagError("Supabase service-role credentials missing in worker .env.")

    query_embedding = await embed_query(query_text)

    rpc_url = (
        f"{settings.supabase_url}/rest/v1/rpc/match_contract_vault_documents"
    )
    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    body = {
        "p_project_id": project_id,
        "query_embedding": query_embedding,
        "match_count": int(match_count),
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(rpc_url, json=body, headers=headers)
        if resp.status_code not in (200, 201):
            raise RagError(
                f"match_contract_vault_documents RPC failed "
                f"(status={resp.status_code}): {resp.text[:300]}"
            )
        rows = resp.json()

    if not isinstance(rows, list):
        rows = []

    log.info(
        "[t12.rag] project=%s company=%s matches=%d (top similarity=%.3f)",
        project_id,
        company_id,
        len(rows),
        (rows[0].get("similarity") if rows else 0.0),
    )
    return rows
