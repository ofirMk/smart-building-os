"""
Pydantic models — חוזה הנתונים בין Supabase, Worker ו-ERP.
מודלי ה-Result משקפים 1:1 את ה-Zod schemas ב-lib/ai/jobs/schemas.ts.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, UUID4


# ── בקשה נכנסת מ-Supabase (pg_net trigger) ──────────────────

class DispatchJobRequest(BaseModel):
    """מבנה הbody שה-pg_net trigger שולח ל-Worker."""

    job_id: UUID4 = Field(..., description="מזהה ייחודי של ה-Job ב-ai_jobs")
    type: str = Field(..., description="סוג ה-Job: gantt_risk_analysis / contractor_evaluation")
    payload: dict[str, Any] = Field(default_factory=dict, description="תוכן המשימה")
    company_id: str = Field(..., description="מזהה החברה הפעילה")


# ── תוצאה יוצאת חזרה ל-ERP (/api/erp/ai/jobs/{id}/result) ──

class JobResultDone(BaseModel):
    status: str = "done"
    result: dict[str, Any]
    error_message: str | None = None


class JobResultFailed(BaseModel):
    status: str = "failed"
    result: dict[str, Any] | None = None
    error_message: str


# ── Schemas ל-gantt_risk_analysis (תואמים ל-Zod) ────────

RiskSeverity = Literal["low", "medium", "high", "critical"]


class GanttTaskAtRisk(BaseModel):
    task_id: UUID4
    task_name: str
    projected_delay_days: int = Field(ge=0)
    root_cause: str
    is_on_critical_path: bool
    severity: RiskSeverity
    mitigation_actions: list[str] = Field(default_factory=list)


class GanttRiskAnalysisResult(BaseModel):
    """תוצאת ה-Crew ל-gantt_risk_analysis. תואמת ל-GanttRiskAnalysisResultSchema ב-Zod."""

    project_id: UUID4
    analyzed_at: datetime
    total_tasks_analyzed: int = Field(ge=0)
    tasks_at_risk: list[GanttTaskAtRisk]
    project_health_score: float = Field(ge=0, le=100)
    executive_summary_he: str
    top_recommendation: str | None = None
