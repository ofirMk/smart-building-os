"""
HMAC utilities — חתימה ואימות של בקשות בין Worker ל-ERP.

פורמט חתימה: `sha256=<hex_digest>`
זהה לפורמט של GitHub Webhooks — מחושב על raw body (לפני JSON parsing).
"""

import hashlib
import hmac


def sign_payload(raw_body: str, secret: str) -> str:
    """
    יוצר חתימת HMAC-SHA256 לbody נתון.

    Args:
        raw_body: ה-body כמחרוזת UTF-8 (לפני JSON encoding)
        secret:   ה-shared secret (AI_WORKER_SECRET)

    Returns:
        מחרוזת בפורמט `sha256=<hex_digest>`
    """
    digest = hmac.new(
        key=secret.encode("utf-8"),
        msg=raw_body.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()
    return f"sha256={digest}"


def verify_bearer(received: str, expected: str) -> bool:
    """
    אימות Bearer token בזמן קבוע (מניעת Timing Attacks).

    Args:
        received: הtoken שהתקבל ב-Authorization header
        expected: הtoken המצופה מה-config

    Returns:
        True אם שווים, False אחרת
    """
    return hmac.compare_digest(
        received.encode("utf-8"),
        expected.encode("utf-8"),
    )
