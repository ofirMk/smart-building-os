import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: [
      "components/amenities/amenity-bookings-data-table.tsx",
      "components/ev-management/ev-bills-data-table.tsx",
      "components/ev-management/ev-sessions-data-table.tsx",
    ],
    rules: {
      // TanStack Table — מודל ממויזציה לא תואם React Compiler; מותר לדכא ברקומפוננטות הטבלה.
      "react-hooks/incompatible-library": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Python virtualenvs (contain bundled vendor JS like litellm/pyright/pyvis):
    "**/.venv/**",
    "**/venv/**",
    "**/__pycache__/**",
    // Standalone Node sub-projects with their own tooling:
    "ai-worker/**",
    "my-ai-gateway/**",
    // Generated / vendored:
    "**/node_modules/**",
    "**/dist/**",
    "**/coverage/**",
  ]),
]);

export default eslintConfig;
