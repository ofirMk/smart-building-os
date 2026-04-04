/**
 * רישום יחיד (Single source) ל־Pro-UX במרקר אופק.
 * פירוט מלא ומפת קבצים: `docs/SYSTEM_INDEX.md`.
 */
export const MARKER_OFEK_UX_REGISTRY = {
  globalShortcuts: {
    file: "components/marker-ofek/marker-ofek-global-shortcuts.tsx",
    providerMount: "components/dashboard-providers.tsx",
    behavior: [
      "Ctrl/Cmd+K — מיקוד #global-project-search-input",
      "Ctrl/Cmd+S — window event marker-ofek-global-save (לא בטפסים בפוקוס)",
      "Enter — בחירת תוצאה ראשונה בחיפוש הגלובלי (כשהשדה בפוקוס)",
      "Escape — marker-ofek-global-escape (תפריטים ושכבות)",
    ] as const,
  },
  globalProjectSearch: {
    file: "components/marker-ofek/global-project-search.tsx",
    inputId: "global-project-search-input",
    shellVisibility: "components/dashboard-shell.tsx (isMarkerOfekExecutiveContext)",
    enterKey: "בוחר את התוצאה הראשונה ברשימה",
  },
  contextMenu: {
    primitive: "components/marker-ofek/smart-table-context-menu.tsx",
    /** מסכים עם תפריט לחיצה ימנית על שורת טבלה */
    tableSurfaces: [
      "components/marker-ofek/tenders/tenders-boq-client.tsx",
      "components/marker-ofek/tenders/tenders-wbs-client.tsx",
      "app/(dashboard)/marker-ofek/procurement/catalog/page.tsx",
      "components/marker-ofek/procurement/orders-dashboard.tsx",
      "app/(dashboard)/marker-ofek/finance/contracts/[id]/contract-billing-center-client.tsx",
      "app/(dashboard)/marker-ofek/finance/contracts/billing/[partialId]/partial-account-detail-client.tsx",
      "app/(dashboard)/marker-ofek/finance/contract-vault/contract-vault-client.tsx",
    ] as const,
  },
  shellHelpSettings: {
    file: "components/marker-ofek/marker-ofek-module-header-actions.tsx",
    helpCopy: "lib/marker-ofek/marker-ofek-module-help.ts",
    mount: "components/dashboard-shell.tsx",
  },
  catalogVsSheetHint: {
    file: "components/marker-ofek/catalog-vs-sheet-hint.tsx",
  },
} as const
