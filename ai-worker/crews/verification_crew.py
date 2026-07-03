"""
VerificationCrew — Autonomous AI Photo Verification for Field Work Orders.

Architecture
------------
  1. FetchWorkOrderContextTool  → pulls WO + asset + checklist from Supabase
  2. _AnalyzeInstallationPhotoTool (internal) → calls Gemini Vision directly
     via google.generativeai to inspect the after-photo
  3. ResolveWorkOrderTool       → writes the decision back to Supabase

Agent: "Low Voltage Quality Assurance Inspector"
  - Uses Gemini 2.x Flash as the reasoning LLM (text mode)
  - Delegates actual vision analysis to the photo tool
  - Makes the final APPROVED / REJECTED decision and calls ResolveWorkOrderTool

Entry point:  run_verification(wo_id: str) -> None
  Called as a FastAPI BackgroundTask — does not return a value to the caller.
  All outcomes (approval, rejection, errors) are written directly to the DB.
"""

from __future__ import annotations

import asyncio
import json
import logging

import httpx
import google.generativeai as genai
from crewai import Agent, Crew, Process, Task
from crewai.llm import LLM
from crewai.tools import BaseTool
from pydantic import BaseModel, Field

from config import settings
from crews.tools.erp_api import FetchWorkOrderContextTool, ResolveWorkOrderTool

log = logging.getLogger("ai-worker.crew.verification")

# ─────────────────────────────────────────────────────────────────────────────
# Internal vision tool (not exported — used only by this crew)
# ─────────────────────────────────────────────────────────────────────────────

class _AnalyzePhotoInput(BaseModel):
    photo_url: str = Field(..., description="HTTPS URL of the after-installation photo")
    asset_description: str = Field(
        ...,
        description=(
            "Short description of the asset being inspected: asset type, model, "
            "manufacturer, and the relevant checklist items to verify."
        ),
    )


class _AnalyzeInstallationPhotoTool(BaseTool):
    """
    Calls Gemini Vision directly via google.generativeai to analyse an
    installation photo. Returns a structured analysis string the agent
    uses to decide approved/rejected.

    Robustness: if the photo cannot be fetched or the API call fails,
    returns a descriptive error message rather than raising so the agent
    can still decide to reject rather than crash.
    """

    name: str = "analyze_installation_photo"
    description: str = (
        "Download the installation photo from the given URL and use Gemini Vision "
        "to visually inspect it against the asset description and checklist. "
        "Returns a detailed analysis: what is visible, what looks correct, "
        "and what (if anything) is wrong or missing. "
        "Input: photo_url (HTTPS URL), asset_description (what to verify)."
    )
    args_schema: type[BaseModel] = _AnalyzePhotoInput

    def _run(self, photo_url: str, asset_description: str) -> str:
        if not settings.gemini_api_key:
            return "ERROR: GEMINI_API_KEY not configured — cannot run vision analysis."

        # ── Download photo ─────────────────────────────────────────────────
        try:
            resp = httpx.get(photo_url, timeout=15.0, follow_redirects=True)
            resp.raise_for_status()
            image_bytes = resp.content
            content_type = resp.headers.get("content-type", "image/jpeg").split(";")[0].strip()
        except httpx.HTTPError as exc:
            log.error("[AnalyzePhotoTool] Failed to download photo: %s", exc)
            return f"ERROR: Could not download photo from {photo_url!r}: {exc}"

        # ── Call Gemini Vision ─────────────────────────────────────────────
        try:
            genai.configure(api_key=settings.gemini_api_key)
            model = genai.GenerativeModel("gemini-1.5-flash")

            prompt = (
                "You are a certified low-voltage electrical and smart-building "
                "installation quality inspector. You are reviewing a field technician's "
                "after-installation photo.\n\n"
                f"ASSET CONTEXT:\n{asset_description}\n\n"
                "INSPECTION TASK:\n"
                "1. Describe what you can clearly see in the photo.\n"
                "2. Check each checklist item and state whether it is VERIFIED or NOT VISIBLE.\n"
                "3. Identify any visible installation defects, safety hazards, or incomplete work.\n"
                "4. Give an overall verdict: PASS or FAIL with a 1-2 sentence justification.\n\n"
                "Be specific and cite visible evidence. Do not guess at things you cannot see."
            )

            image_part = {"mime_type": content_type, "data": image_bytes}
            response = model.generate_content([image_part, prompt])
            analysis = response.text.strip()

            log.info("[AnalyzePhotoTool] Vision analysis complete (%d chars)", len(analysis))
            return analysis

        except Exception as exc:  # noqa: BLE001
            log.exception("[AnalyzePhotoTool] Gemini Vision call failed")
            return f"ERROR: Gemini Vision API call failed: {exc}"


# ─────────────────────────────────────────────────────────────────────────────
# LLM builder
# ─────────────────────────────────────────────────────────────────────────────

def _build_llm() -> LLM:
    if not settings.gemini_api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not configured in ai-worker/.env — "
            "cannot run VerificationCrew."
        )
    return LLM(
        model=f"gemini/{settings.gemini_model}",
        api_key=settings.gemini_api_key,
        temperature=0.1,  # Low temperature: this is a pass/fail QA decision
    )


# ─────────────────────────────────────────────────────────────────────────────
# Crew builder
# ─────────────────────────────────────────────────────────────────────────────

def _build_verification_crew(wo_id: str) -> Crew:
    llm = _build_llm()
    tools = [
        FetchWorkOrderContextTool(),
        _AnalyzeInstallationPhotoTool(),
        ResolveWorkOrderTool(),
    ]

    inspector = Agent(
        role="Low Voltage Quality Assurance Inspector",
        goal=(
            "Visually verify that a field technician's installation photo meets "
            "the required standards for the asset type, then approve or reject the "
            "work order in the system."
        ),
        backstory=(
            "You are a senior certified QA inspector with 15+ years specialising in "
            "smart-building low-voltage systems: access control, CCTV, BMS sensors, "
            "and intercom panels. You have zero tolerance for sloppy cable management, "
            "missing enclosure covers, or unverified device configurations. "
            "Your decisions are final and written directly to the work-order system."
        ),
        tools=tools,
        llm=llm,
        verbose=False,
        allow_delegation=False,
        max_iter=6,
    )

    task = Task(
        description=(
            f"You must inspect and resolve Work Order ID: {wo_id!r}\n\n"
            "Follow these steps in order:\n"
            f"1. Call fetch_work_order_context with wo_id='{wo_id}' to get the full "
            "WO details, asset hardware_meta, and installation checklist.\n"
            "2. Extract the after_photo_url from the work_order data. "
            "If after_photo_url is None or empty, immediately reject with "
            "reason: 'No after-installation photo provided.'\n"
            "3. Build an asset_description string combining: asset name, type, "
            "manufacturer, model, and the checklist items from the onboarding template "
            "(if present) or the WO category and description (if no template).\n"
            "4. Call analyze_installation_photo with the photo_url and asset_description.\n"
            "5. Based on the vision analysis, decide: 'approved' or 'rejected'.\n"
            "   Approve if: installation is clearly complete, all visible checklist "
            "items are satisfied, no safety defects are visible.\n"
            "   Reject if: photo is too blurry/dark to assess, required components "
            "are missing or incorrectly installed, or safety hazards are visible.\n"
            "6. Call resolve_work_order with wo_id, your decision, and a concise "
            "comment (≤500 chars) citing the specific evidence from the photo."
        ),
        expected_output=(
            "A confirmation that resolve_work_order was called successfully, "
            "showing the decision (approved/rejected) and the work order's new status."
        ),
        agent=inspector,
    )

    return Crew(
        agents=[inspector],
        tasks=[task],
        process=Process.sequential,
        verbose=False,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Public entry point (called by FastAPI BackgroundTasks)
# ─────────────────────────────────────────────────────────────────────────────

async def run_verification(wo_id: str) -> None:
    """
    Asynchronous entry point for the verification pipeline.
    All outcomes are written directly to Supabase via ResolveWorkOrderTool.
    Errors are logged — never raised (this runs in a background task).
    """
    log.info("[VerificationCrew] Starting for wo_id=%s", wo_id)

    try:
        crew = _build_verification_crew(wo_id)

        # CrewAI 0.80+ supports kickoff_async; fall back to sync in a thread
        try:
            await crew.kickoff_async(inputs={"wo_id": wo_id})
        except AttributeError:
            await asyncio.to_thread(crew.kickoff, inputs={"wo_id": wo_id})

        log.info("[VerificationCrew] Completed for wo_id=%s", wo_id)

    except RuntimeError as exc:
        # Configuration error (missing API key etc.) — log and bail
        log.error("[VerificationCrew] Config error for wo_id=%s: %s", wo_id, exc)
    except Exception as exc:  # noqa: BLE001
        # Unexpected crew failure — attempt to mark WO as disputed so it doesn't
        # silently remain in pending_verification forever.
        log.exception("[VerificationCrew] Unexpected failure for wo_id=%s", wo_id)
        _emergency_reject(wo_id, f"AI verification service error: {exc!s}")


def _emergency_reject(wo_id: str, reason: str) -> None:
    """
    Last-resort synchronous fallback: marks the WO as disputed so property
    managers know manual review is required. Called only when the crew crashes.
    """
    try:
        tool = ResolveWorkOrderTool()
        tool._run(
            wo_id=wo_id,
            decision="rejected",
            comments=f"[AUTO-REJECT — crew failure] {reason[:400]}",
        )
    except Exception as exc:  # noqa: BLE001
        log.error("[VerificationCrew] Emergency reject also failed: %s", exc)
