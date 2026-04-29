"""
SupabaseGanttTool — CrewAI tool שקורא משימות גאנט לפי project_id.

משתמש ב-service-role key (מעקף RLS). מחזיר JSON-string לסוכן —
זה הפורמט שCrewAI Agents יכולים לקרוא ולנתח.
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime
from typing import Any

import httpx
from crewai.tools import BaseTool
from pydantic import BaseModel, Field

from config import settings

log = logging.getLogger("ai-worker.tools")


class _GanttQueryInput(BaseModel):
    """Schema של הinput שהAgent שולח לtool."""

    project_id: str = Field(..., description="UUID של הפרויקט שיש לשלוף את משימותיו")


class SupabaseGanttTool(BaseTool):
    """
    שולף את כל המשימות מ-public.gantt_tasks עבור project_id נתון,
    כולל dependencies (FS/SS/FF/SF + lag), milestones, hierarchy.
    """

    name: str = "fetch_gantt_tasks"
    description: str = (
        "Fetches all Gantt schedule tasks for a given construction project. "
        "Returns JSON array with: id, title, phase, start_date, end_date, "
        "progress (0-100), status, dependencies (FS/SS/FF/SF with lag days), "
        "parent_id (for hierarchy), is_milestone. "
        "Input: project_id (UUID string)."
    )
    args_schema: type[BaseModel] = _GanttQueryInput

    def _run(self, project_id: str) -> str:
        """מבוצע ע"י הAgent. מחזיר string ל-LLM."""
        if not settings.supabase_url or not settings.supabase_service_role_key:
            return json.dumps(
                {"error": "Supabase credentials not configured in worker .env"},
                ensure_ascii=False,
            )

        try:
            tasks = _fetch_gantt_tasks(project_id)
        except httpx.HTTPError as exc:
            log.error("Supabase request failed: %s", exc)
            return json.dumps(
                {"error": f"Supabase fetch failed: {exc}", "project_id": project_id},
                ensure_ascii=False,
            )

        return json.dumps(
            {
                "project_id": project_id,
                "fetched_at": datetime.utcnow().isoformat() + "Z",
                "today": date.today().isoformat(),
                "task_count": len(tasks),
                "tasks": tasks,
            },
            ensure_ascii=False,
            default=str,
        )


def _fetch_gantt_tasks(project_id: str) -> list[dict[str, Any]]:
    """REST API call ישיר ל-Supabase PostgREST (service-role)."""
    rest_url = f"{settings.supabase_url}/rest/v1/gantt_tasks"
    headers = {
        "apikey": settings.supabase_service_role_key or "",
        "Authorization": f"Bearer {settings.supabase_service_role_key or ''}",
        "Accept": "application/json",
    }
    params = {
        "project_id": f"eq.{project_id}",
        "select": (
            "id,title,phase,start_date,end_date,progress,status,"
            "dependencies,parent_id,is_milestone,schedule_mode"
        ),
        "order": "start_date.asc.nullslast,id.asc",
    }

    with httpx.Client(timeout=15.0) as client:
        resp = client.get(rest_url, headers=headers, params=params)
        resp.raise_for_status()
        data = resp.json()

    if not isinstance(data, list):
        return []
    return data
