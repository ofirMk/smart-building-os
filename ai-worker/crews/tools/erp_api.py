"""
ERP API Tools for the Verification Crew.

Tool 1: FetchWorkOrderContextTool
  - Fetches the Work Order row, linked physical asset (hardware_meta),
    and the associated onboarding template checklist from Supabase REST API.
  - Returns a JSON string the LLM can reason over.

Tool 2: ResolveWorkOrderTool
  - Updates the Work Order status in Supabase based on the AI's decision:
      'approved' → status='closed', verification_status='verified'
      'rejected' → status='in_progress', verification_status='disputed'
  - Appends the AI's reasoning to the WO description for the audit trail.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx
from crewai.tools import BaseTool
from pydantic import BaseModel, Field

from config import settings

log = logging.getLogger("ai-worker.tools.erp_api")

# ─────────────────────────────────────────────────────────────────────────────
# Shared Supabase REST helper
# ─────────────────────────────────────────────────────────────────────────────

def _supabase_headers() -> dict[str, str]:
    key = settings.supabase_service_role_key or ""
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }

def _rest(path: str) -> str:
    """Builds a PostgREST URL for the given table/path."""
    base = (settings.supabase_url or "").rstrip("/")
    return f"{base}/rest/v1/{path}"

# ─────────────────────────────────────────────────────────────────────────────
# Tool 1 — FetchWorkOrderContextTool
# ─────────────────────────────────────────────────────────────────────────────

class _FetchWoInput(BaseModel):
    wo_id: str = Field(..., description="UUID of the Work Order to fetch")


class FetchWorkOrderContextTool(BaseTool):
    """
    Fetches full Work Order context from Supabase:
      - WO metadata (title, category, description, after_photo_url)
      - Linked physical asset name, type, and hardware_meta JSON
      - Checklist items from the linked onboarding template (if present)

    Returns: JSON string with all the above for the agent to analyse.
    """

    name: str = "fetch_work_order_context"
    description: str = (
        "Fetch all context required to verify a field work order: "
        "the WO itself, the physical asset it targets (including hardware_meta "
        "with manufacturer specs), and the checklist of required installation steps. "
        "Input: wo_id (UUID string)."
    )
    args_schema: type[BaseModel] = _FetchWoInput

    def _run(self, wo_id: str) -> str:  # noqa: PLR0911
        if not settings.supabase_url or not settings.supabase_service_role_key:
            return json.dumps({"error": "Supabase credentials not configured"})

        headers = _supabase_headers()

        try:
            # ── 1. Fetch work order ────────────────────────────────────────
            wo_resp = httpx.get(
                _rest("erp_work_orders"),
                headers=headers,
                params={
                    "id": f"eq.{wo_id}",
                    "select": (
                        "id,wo_number,title,description,category,priority,status,"
                        "verification_method,after_photo_url,before_photo_url,"
                        "erp_physical_assets(id,name,asset_type,manufacturer,model,"
                        "serial_number,hardware_meta)"
                    ),
                    "limit": "1",
                },
                timeout=10.0,
            )
            wo_resp.raise_for_status()
            rows: list[dict[str, Any]] = wo_resp.json()

            if not rows:
                return json.dumps({"error": f"Work order {wo_id} not found"})

            wo = rows[0]

            # ── 2. Fetch onboarding task + template if linked ──────────────
            task_resp = httpx.get(
                _rest("erp_onboarding_task_instances"),
                headers=headers,
                params={
                    "work_order_id": f"eq.{wo_id}",
                    "select": (
                        "id,status,"
                        "erp_onboarding_templates(task_name,task_description,"
                        "checklist_items,phase)"
                    ),
                    "limit": "1",
                },
                timeout=10.0,
            )
            task_resp.raise_for_status()
            task_rows: list[dict[str, Any]] = task_resp.json()
            onboarding_task: dict[str, Any] | None = task_rows[0] if task_rows else None

            return json.dumps(
                {
                    "work_order": wo,
                    "onboarding_task": onboarding_task,
                },
                ensure_ascii=False,
                default=str,
            )

        except httpx.HTTPError as exc:
            log.error("[FetchWorkOrderContextTool] HTTP error: %s", exc)
            return json.dumps({"error": f"Supabase request failed: {exc}"})
        except Exception as exc:  # noqa: BLE001
            log.exception("[FetchWorkOrderContextTool] Unexpected error")
            return json.dumps({"error": str(exc)})


# ─────────────────────────────────────────────────────────────────────────────
# Tool 2 — ResolveWorkOrderTool
# ─────────────────────────────────────────────────────────────────────────────

class _ResolveWoInput(BaseModel):
    wo_id: str = Field(..., description="UUID of the Work Order to resolve")
    decision: str = Field(
        ...,
        description=(
            "AI verdict. Must be exactly 'approved' or 'rejected'. "
            "'approved' closes the WO; 'rejected' sends it back to 'in_progress' "
            "so the technician can redo the work."
        ),
    )
    comments: str = Field(
        ...,
        description=(
            "AI reasoning — max 500 chars. Will be appended to the WO description "
            "as an audit record. Be specific: cite what was correct or what was wrong."
        ),
        max_length=500,
    )


class ResolveWorkOrderTool(BaseTool):
    """
    Updates the Work Order status in Supabase based on the AI's visual inspection:
      - 'approved': status → 'closed', verification_status → 'verified'
      - 'rejected':  status → 'in_progress', verification_status → 'disputed'
    Appends the AI's reasoning to the WO description for the full audit trail.
    """

    name: str = "resolve_work_order"
    description: str = (
        "Update the Work Order status based on your visual inspection verdict. "
        "Call this ONCE after you have fully analysed the photo and the WO context. "
        "decision must be 'approved' or 'rejected'. "
        "comments must explain your reasoning clearly (cited evidence from the photo)."
    )
    args_schema: type[BaseModel] = _ResolveWoInput

    def _run(self, wo_id: str, decision: str, comments: str) -> str:
        if not settings.supabase_url or not settings.supabase_service_role_key:
            return json.dumps({"error": "Supabase credentials not configured"})

        decision = decision.strip().lower()
        if decision not in ("approved", "rejected"):
            return json.dumps(
                {"error": f"Invalid decision '{decision}'. Must be 'approved' or 'rejected'."}
            )

        if decision == "approved":
            patch = {
                "status": "closed",
                "verification_status": "verified",
            }
        else:
            patch = {
                "status": "in_progress",
                "verification_status": "disputed",
            }

        # Append AI review to description as an immutable audit note
        ai_note = f"\n\n[AI Review — {decision.upper()}]\n{comments.strip()}"
        headers = _supabase_headers()

        try:
            # Fetch current description first (to append, not overwrite)
            wo_resp = httpx.get(
                _rest("erp_work_orders"),
                headers=headers,
                params={"id": f"eq.{wo_id}", "select": "description", "limit": "1"},
                timeout=10.0,
            )
            wo_resp.raise_for_status()
            rows: list[dict[str, Any]] = wo_resp.json()
            current_desc = (rows[0].get("description") or "") if rows else ""

            patch["description"] = current_desc + ai_note

            # Apply PATCH
            patch_resp = httpx.patch(
                _rest("erp_work_orders"),
                headers={**headers, "Prefer": "return=minimal"},
                params={"id": f"eq.{wo_id}"},
                json=patch,
                timeout=10.0,
            )
            patch_resp.raise_for_status()

            log.info(
                "[ResolveWorkOrderTool] WO %s → %s (%s)",
                wo_id, patch["status"], decision,
            )
            return json.dumps(
                {"ok": True, "wo_id": wo_id, "decision": decision, "new_status": patch["status"]}
            )

        except httpx.HTTPError as exc:
            log.error("[ResolveWorkOrderTool] HTTP error: %s", exc)
            return json.dumps({"error": f"Supabase PATCH failed: {exc}"})
        except Exception as exc:  # noqa: BLE001
            log.exception("[ResolveWorkOrderTool] Unexpected error")
            return json.dumps({"error": str(exc)})
