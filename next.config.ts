import type { NextConfig } from "next";

/**
 * רשימת origins מותרים ל-Server Actions (CSRF guardrail).
 *
 * Next.js משווה את `Origin` header מול `Host`/`X-Forwarded-Host`. כש-browser
 * ניגש דרך proxy (למשל Cascade Browser Preview של Windsurf), ה-origin הוא
 * `127.0.0.1:<random-port>` אבל ה-forwarded-host הוא `localhost:3000` —
 * כברירת מחדל זה נכשל עם "Invalid Server Actions request".
 *
 * האלגוריתם של Next מפצל את ה-host על `.` ולא תומך ב-wildcard על port.
 * לכן הפתרון הנקי: לאפשר למפתח להזין ב-.env.local פורטים ספציפיים:
 *
 *   DEV_SERVER_ACTIONS_EXTRA_ORIGINS=127.0.0.1:54560,127.0.0.1:55123
 *
 * ב-production הרשימה תמיד ריקה (רק אותו origin).
 */
const devExtraOrigins =
  process.env.NODE_ENV === "development" && process.env.DEV_SERVER_ACTIONS_EXTRA_ORIGINS
    ? process.env.DEV_SERVER_ACTIONS_EXTRA_ORIGINS.split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

const nextConfig: NextConfig = {
  /** גישה ל-dev מרשת מקומית (HMR / webpack-hmr) — רשימת host מותרים */
  allowedDevOrigins: ["10.0.0.26", "localhost", "127.0.0.1"],
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
      allowedOrigins:
        process.env.NODE_ENV === "development"
          ? [
              "localhost:3000",
              "127.0.0.1:3000",
              "10.0.0.26:3000",
              ...devExtraOrigins,
            ]
          : undefined,
    },
  },
};

export default nextConfig;
