# ── Build stage ───────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app

# מתקין dependencies בלבד (caching layer)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

# ── Runtime stage ─────────────────────────────────────────────
FROM python:3.12-slim AS runtime

# משתמש non-root לאבטחה
RUN useradd --create-home --shell /bin/bash worker
USER worker
WORKDIR /home/worker/app

# מעתיק packages מה-builder
COPY --from=builder /usr/local/lib/python3.12 /usr/local/lib/python3.12
COPY --from=builder /usr/local/bin/uvicorn   /usr/local/bin/uvicorn

# מעתיק קוד האפליקציה
COPY --chown=worker:worker . .

# Cloud Run מאזין על 8080
EXPOSE 8080

# Health check — Cloud Run בודק /health לפני ניתוב traffic
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/health')"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
