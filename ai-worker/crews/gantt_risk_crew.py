"""
GanttRiskCrew — Crew של 2 סוכנים שמנתחים סיכוני עיכוב בלוח זמנים.

Agent 1: Schedule Data Specialist (DataFetcher)
  - שולף משימות גאנט מהמסד
  - מסכם בקצרה מה יש בפרויקט (כמות, פאזות, תאריכי קצוות)

Agent 2: Construction Risk Analyst (RiskAnalyzer)
  - מקבל את הנתונים מ-Agent 1
  - מזהה משימות בסיכון (איחורים, נתיב קריטי, dependencies)
  - מחזיר GanttRiskAnalysisResult תואם לסכמת Zod
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from crewai import Agent, Crew, Process, Task
from crewai.llm import LLM

from config import settings
from crews.tools.supabase_gantt_tool import SupabaseGanttTool
from models import GanttRiskAnalysisResult

log = logging.getLogger("ai-worker.crew.gantt_risk")


def _build_llm() -> LLM:
    """LLM משותף לכל הסוכנים — Gemini 1.5 Pro."""
    if not settings.gemini_api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not configured in ai-worker/.env — "
            "cannot run CrewAI gantt_risk_analysis."
        )
    return LLM(
        model=f"gemini/{settings.gemini_model}",
        api_key=settings.gemini_api_key,
        temperature=0.2,  # ניתוח עסקי — נמוך יחסית למניעת hallucinations
    )


def _build_agents(llm: LLM) -> tuple[Agent, Agent]:
    data_fetcher = Agent(
        role="Construction Schedule Data Specialist",
        goal=(
            "Fetch the complete gantt task list for the requested project_id "
            "and produce a clean, structured summary that highlights date ranges, "
            "phase breakdown, dependency density, and current progress."
        ),
        backstory=(
            "You are a meticulous data analyst with 10+ years of experience in "
            "construction project controls. You always verify task counts, identify "
            "missing dates, and flag any data gaps before passing data to risk analysts."
        ),
        tools=[SupabaseGanttTool()],
        llm=llm,
        verbose=False,
        allow_delegation=False,
        max_iter=4,
    )

    risk_analyst = Agent(
        role="Senior Construction Risk Analyst",
        goal=(
            "Identify gantt tasks at risk of delay — especially tasks on the critical "
            "path. For each at-risk task, determine the projected delay in working days, "
            "the root cause, severity, and concrete mitigation actions. Calculate an "
            "overall project_health_score (0-100) and write an executive summary in Hebrew."
        ),
        backstory=(
            "You are a senior PMP-certified construction risk analyst with 20 years of "
            "experience in Israeli high-rise and infrastructure projects. You think in "
            "terms of finish-to-start dependencies, lag days, and cascading delays. "
            "Your reports are crisp, actionable, and written for site managers who need "
            "to act within hours."
        ),
        llm=llm,
        verbose=False,
        allow_delegation=False,
        max_iter=5,
    )

    return data_fetcher, risk_analyst


def _build_tasks(
    project_id: str,
    min_severity: str,
    include_non_critical: bool,
    data_fetcher: Agent,
    risk_analyst: Agent,
) -> tuple[Task, Task]:
    fetch_task = Task(
        description=(
            f"Fetch all gantt tasks for project_id='{project_id}' using the "
            "fetch_gantt_tasks tool. After receiving the data, output a structured "
            "summary with: total task count, list of phases, earliest start_date, "
            "latest end_date, count of milestones, average progress, and any data "
            "quality issues (e.g., tasks with missing dates)."
        ),
        expected_output=(
            "A markdown summary describing the project schedule scope, plus the raw "
            "JSON list of all tasks for the next agent to analyze."
        ),
        agent=data_fetcher,
    )

    analyze_task = Task(
        description=(
            "Analyze the gantt task data from the previous step and identify tasks at "
            f"risk of delay. Today's date is the reference date. min_severity threshold "
            f"is '{min_severity}' — only include tasks at this severity or higher. "
            f"include_non_critical={include_non_critical}.\n\n"
            "Risk identification rules:\n"
            "1. Task is at risk if today > end_date AND progress < 100 (overdue).\n"
            "2. Task is at risk if (today - start_date) / (end_date - start_date) > "
            "progress/100 + 0.15 (significantly behind expected pace).\n"
            "3. A task is on the critical path if ANY of its successors depend on its "
            "completion AND its delay would push the overall project end_date.\n"
            "4. Compute projected_delay_days as max(0, today - expected_progress_date).\n"
            "5. severity: 'critical' if on critical path AND projected_delay_days >= 7, "
            "'high' if on critical path OR projected_delay_days >= 14, "
            "'medium' if projected_delay_days >= 5, else 'low'.\n\n"
            "For each at-risk task, write 1-3 concrete mitigation_actions in English. "
            "The executive_summary_he MUST be in Hebrew, 2-3 sentences, written for a "
            "site manager. project_health_score: 100 = no risk, 0 = total disaster.\n\n"
            f"Return a valid JSON object that matches the GanttRiskAnalysisResult schema. "
            f"project_id MUST be '{project_id}'. analyzed_at MUST be the current ISO 8601 "
            "datetime with offset."
        ),
        expected_output=(
            "A single valid JSON object matching the GanttRiskAnalysisResult Pydantic "
            "schema with all required fields populated. NO markdown wrapping, NO ```json "
            "fences — JUST the raw JSON object."
        ),
        agent=risk_analyst,
        context=[fetch_task],
        output_pydantic=GanttRiskAnalysisResult,
    )

    return fetch_task, analyze_task


def build_gantt_risk_crew(
    project_id: str,
    min_severity: str = "medium",
    include_non_critical: bool = False,
) -> Crew:
    llm = _build_llm()
    data_fetcher, risk_analyst = _build_agents(llm)
    fetch_task, analyze_task = _build_tasks(
        project_id, min_severity, include_non_critical, data_fetcher, risk_analyst
    )

    return Crew(
        agents=[data_fetcher, risk_analyst],
        tasks=[fetch_task, analyze_task],
        process=Process.sequential,
        verbose=False,
    )


async def run_gantt_risk_analysis(
    project_id: str,
    payload: dict,
) -> GanttRiskAnalysisResult:
    """
    נקודת הכניסה הציבורית מ-main.py.
    מחזיר תוצאה מאומתת או זורק שגיאה (שתיתפס ב-run_job).
    """
    min_severity = str(payload.get("min_severity", "medium"))
    include_non_critical = bool(payload.get("include_non_critical", False))

    log.info(
        "[gantt_risk] starting crew project=%s min_severity=%s",
        project_id,
        min_severity,
    )

    crew = build_gantt_risk_crew(
        project_id=project_id,
        min_severity=min_severity,
        include_non_critical=include_non_critical,
    )

    # CrewAI 0.80+ — kickoff_async זמין; אם לא — fallback לthread
    try:
        crew_output = await crew.kickoff_async(
            inputs={"project_id": project_id, "today": datetime.now(timezone.utc).isoformat()}
        )
    except AttributeError:
        # ישן יותר — מריץ ב-blocking
        crew_output = crew.kickoff(
            inputs={"project_id": project_id, "today": datetime.now(timezone.utc).isoformat()}
        )

    # output_pydantic ב-Task האחרון — ה-result מאומת אוטומטית
    if hasattr(crew_output, "pydantic") and crew_output.pydantic is not None:
        return crew_output.pydantic  # type: ignore[no-any-return]

    # fallback אם הCrewAI לא החזיר Pydantic — מנתחים ידנית
    raw_str = (
        crew_output.raw if hasattr(crew_output, "raw") else str(crew_output)
    )
    return GanttRiskAnalysisResult.model_validate_json(raw_str)
