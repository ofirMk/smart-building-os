"""
End-to-End Handshake Test — מדמה את המעגל המלא בלי תלות בUI.

זרימה:
  1. קורא את SUPABASE_URL ו-SERVICE_ROLE_KEY מה-.env.local של ה-Next.js
  2. מוצא project_id שיש לו gantt_tasks
  3. INSERT ל-ai_jobs עם status='accepted'
  4. POST ל-/jobs/dispatch של ה-AI Worker (מדמה את pg_net trigger)
  5. מחכה עד 120 שניות (Crew אמיתי לוקח זמן)
  6. SELECT מ-ai_jobs כדי להראות status='done' + result

הרצה:
  .\.venv\Scripts\python.exe test_handshake.py
"""

from __future__ import annotations

import json
import sys
import time
import uuid
from pathlib import Path

import httpx


# ── טעינת .env.local של ה-ERP ─────────────────────────────

def load_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        print(f"[!] env file not found: {path}", file=sys.stderr)
        sys.exit(1)
    out: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        out[key.strip()] = value.strip().strip('"').strip("'")
    return out


def main() -> int:
    workspace = Path(__file__).parent.parent
    erp_env = load_env_file(workspace / ".env.local")
    worker_env = load_env_file(Path(__file__).parent / ".env")

    supabase_url = erp_env.get("NEXT_PUBLIC_SUPABASE_URL")
    service_key = erp_env.get("SUPABASE_SERVICE_ROLE_KEY")
    worker_bearer = worker_env.get("AI_WORKER_BEARER")
    worker_url = "http://localhost:8002"

    if not supabase_url or not service_key:
        print("[!] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
        return 1
    if not worker_bearer:
        print("[!] Missing AI_WORKER_BEARER in ai-worker/.env")
        return 1

    rest_url = f"{supabase_url}/rest/v1"
    sb_headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    print("\n[1/6] Looking up a project_id with existing gantt_tasks…")
    with httpx.Client(timeout=15.0) as client:
        # שולפים project שיש לו gantt_tasks (DISTINCT project_id)
        resp = client.get(
            f"{rest_url}/gantt_tasks?select=project_id&limit=50",
            headers=sb_headers,
        )
        resp.raise_for_status()
        rows = resp.json()
        if not rows:
            print("[!] No gantt_tasks found in any project. Create tasks via the ERP first.")
            return 1

        # מוצאים את ה-project עם הכי הרבה משימות (כדי שה-Crew יקבל דבר עםו לעבוד)
        from collections import Counter
        project_counts = Counter(r["project_id"] for r in rows)
        project_id_demo, task_count = project_counts.most_common(1)[0]
        print(f"    project_id      = {project_id_demo}")
        print(f"    gantt_tasks     = {task_count}")

        # מציאים company_id — public.projects אין לו company_id, לכן לוקחים מ-erp_companies
        resp = client.get(
            f"{rest_url}/erp_companies?select=id&limit=1",
            headers=sb_headers,
        )
        resp.raise_for_status()
        company_rows = resp.json()
        if not company_rows:
            print("[!] No erp_companies found")
            return 1
        company_id = company_rows[0]["id"]
        print(f"    company_id      = {company_id}")

        # מציאים user_id — מה-ai_jobs הקיים או מ-profiles
        resp = client.get(
            f"{rest_url}/ai_jobs?select=created_by&limit=1",
            headers=sb_headers,
        )
        if resp.status_code == 200 and resp.json():
            user_id = resp.json()[0]["created_by"]
        else:
            resp = client.get(
                f"{rest_url}/profiles?select=id&limit=1",
                headers=sb_headers,
            )
            resp.raise_for_status()
            rows = resp.json()
            if not rows:
                print("[!] No profiles found")
                return 1
            user_id = rows[0]["id"]
        print(f"    user_id         = {user_id}")

        print("\n[2/6] Inserting test job into ai_jobs (status='accepted')…")
        job_payload = {
            "company_id": company_id,
            "created_by": user_id,
            "type": "gantt_risk_analysis",
            "payload": {
                "project_id": project_id_demo,
                "min_severity": "low",
                "include_non_critical": True,
            },
            "status": "accepted",
        }
        resp = client.post(f"{rest_url}/ai_jobs", headers=sb_headers, json=job_payload)
        if resp.status_code not in (200, 201):
            print(f"[!] Insert failed: {resp.status_code} {resp.text}")
            return 1
        inserted = resp.json()[0] if isinstance(resp.json(), list) else resp.json()
        job_id = inserted["id"]
        print(f"    job_id     = {job_id}")

        print("\n[3/6] Dispatching to AI Worker /jobs/dispatch…")
        dispatch_resp = client.post(
            f"{worker_url}/jobs/dispatch",
            headers={
                "Authorization": f"Bearer {worker_bearer}",
                "Content-Type": "application/json",
            },
            json={
                "job_id": job_id,
                "type": "gantt_risk_analysis",
                "payload": job_payload["payload"],
                "company_id": company_id,
            },
        )
        print(f"    Worker response: {dispatch_resp.status_code} {dispatch_resp.json()}")

        print("\n[4/6] Waiting up to 120 seconds for Crew to complete…")
        print("    (GanttRiskCrew uses Gemini — can take 30-90s for real analysis)")
        max_wait = 120
        start_wait = time.time()
        final = None
        while time.time() - start_wait < max_wait:
            resp = client.get(
                f"{rest_url}/ai_jobs?id=eq.{job_id}&select=id,status,result,error_message,finished_at",
                headers=sb_headers,
            )
            resp.raise_for_status()
            rows = resp.json()
            if rows and rows[0]["status"] in ("done", "failed"):
                final = rows[0]
                break
            elapsed = int(time.time() - start_wait)
            print(f"      [{elapsed:3d}s] status = {rows[0]['status'] if rows else 'pending'}")
            time.sleep(5)

        print("\n[5/6] Polling complete.")
        if final is None:
            print("[!] Timed out waiting for crew to complete")
            # קורא מצב נוכחית אחרונה
            resp = client.get(
                f"{rest_url}/ai_jobs?id=eq.{job_id}&select=id,status,result,error_message,finished_at",
                headers=sb_headers,
            )
            if resp.status_code == 200 and resp.json():
                final = resp.json()[0]
            else:
                return 1

        print("\n[6/6] === FINAL STATE ===")
        print(json.dumps(final, indent=2, ensure_ascii=False))
        print()

        if final["status"] == "done":
            print("✅ HANDSHAKE COMPLETE — full E2E loop working!")
            return 0
        else:
            print(f"⚠️  Job ended in status='{final['status']}' — check Worker logs")
            return 2


if __name__ == "__main__":
    sys.exit(main())
