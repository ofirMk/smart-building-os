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
    /**
     * Tree-shake imports of heavy multi-export packages that are NOT in Next 16's
     * default optimized list. The default list (lucide-react, date-fns, recharts,
     * @radix-ui split per-package, etc.) is already handled — see
     * node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/optimizePackageImports.md.
     *
     * Packages chosen here have many sub-exports and are imported across the app:
     *   - framer-motion: dozens of sub-modules, often pulls full lib if barrel-imported
     *   - @dnd-kit/*: modular but wide barrel surface
     *   - @base-ui/react: same pattern
     *   - @tanstack/react-table: large surface, mostly uses just a few hooks
     *
     * Safe: this only changes how imports are resolved at build time; runtime is
     * identical. Worst case = no measurable improvement; never breaks code.
     */
    optimizePackageImports: [
      "framer-motion",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
      "@base-ui/react",
      "@tanstack/react-table",
    ],
  },
};

export default nextConfig;
