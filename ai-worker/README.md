# AI Worker — Smart Building OS

Python FastAPI microservice שמקבל AI Jobs מ-Supabase ומחזיר תוצאות ל-ERP.

## ארכיטקטורה

```
Supabase ai_jobs INSERT
    ↓  pg_net trigger (Authorization: Bearer AI_WORKER_BEARER)
FastAPI /jobs/dispatch
    ↓  BackgroundTask
run_job() → [stub | CrewAI Crew]
    ↓  httpx POST + HMAC signature (x-ai-signature)
ERP /api/erp/ai/jobs/{id}/result
    ↓
ai_jobs.status = done | failed
```

---

## הרצה מקומית

### דרישות מוקדמות
- Python 3.12+
- pip

### התקנה

```bash
cd ai-worker
cp env.example .env
# ערוך .env עם הסודות האמיתיים

python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt

uvicorn main:app --reload --port 8001
```

### בדיקת handshake מקומי

```bash
# 1. ודא שה-ERP רץ על localhost:3000

# 2. שלח job stub
curl -X POST http://localhost:8001/jobs/dispatch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(grep AI_WORKER_BEARER .env | cut -d= -f2)" \
  -d '{
    "job_id": "00000000-0000-0000-0000-000000000001",
    "type": "gantt_risk_analysis",
    "payload": {"project_id": "test"},
    "company_id": "holden"
  }'

# 3. ציפייה: ai_jobs.status = 'done' ב-Supabase תוך ~5 שניות
```

---

## Docker (Cloud Run)

```bash
# Build
docker build -t ai-worker .

# הרצה מקומית עם Docker
docker run -p 8080:8080 --env-file .env ai-worker

# Deploy ל-Cloud Run
gcloud run deploy ai-worker \
  --image gcr.io/YOUR_PROJECT/ai-worker \
  --platform managed \
  --region europe-west1 \
  --timeout 3600 \
  --memory 2Gi \
  --cpu 2 \
  --max-instances 5 \
  --min-instances 0 \
  --concurrency 1 \
  --set-env-vars AI_WORKER_BEARER=...,AI_WORKER_SECRET=...,ERP_BASE_URL=...
```

---

## הוספת CrewAI (Phase 4b)

1. בטל הערה לcrewai ב-`requirements.txt`
2. צור `crews/gantt_risk_crew.py` עם הסוכנים
3. ב-`main.py`, החלף בfunc `run_job()`:

```python
if job.type == "gantt_risk_analysis":
    await run_gantt_risk_crew(job)
elif job.type == "contractor_evaluation":
    await run_contractor_eval_crew(job)
```

---

## משתני סביבה

| משתנה | תיאור | נדרש |
|---|---|---|
| `AI_WORKER_BEARER` | Bearer token לאימות בקשות מ-Supabase | ✅ |
| `AI_WORKER_SECRET` | HMAC secret לחתימת callback ל-ERP | ✅ |
| `ERP_BASE_URL` | כתובת בסיס של ה-ERP Next.js | ✅ |
| `LOG_LEVEL` | DEBUG / INFO / WARNING | ❌ (ברירת מחדל: INFO) |
