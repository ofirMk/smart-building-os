/** תדירות טיפול לתצוגה */
export type MaintenanceFrequencyUi = "monthly" | "bi_annual" | "annual"

/** סטטוס שורה בלוח זמנים */
export type MaintenanceScheduleStatusUi =
  | "scheduled"
  | "overdue"
  | "completed"

export type PreventiveMaintenanceSummaryMock = {
  maintenancesThisMonth: number
  expiringContractsSoon: number
  activeVendors: number
}

export type PreventiveMaintenanceRow = {
  id: string
  /** מערכת / ציוד */
  systemEquipment: string
  /** ספק שירות */
  vendorName: string
  /** תאריך טיפול קרוב (ISO date yyyy-mm-dd) */
  nextServiceDate: string
  frequency: MaintenanceFrequencyUi
  status: MaintenanceScheduleStatusUi
}

export const PREVENTIVE_MAINTENANCE_SUMMARY_MOCK: PreventiveMaintenanceSummaryMock =
  {
    maintenancesThisMonth: 8,
    expiringContractsSoon: 2,
    activeVendors: 14,
  }

/** בניין 16 קומות — אשקלון / מרקר אופק (דמו) */
export const PREVENTIVE_MAINTENANCE_ROWS_MOCK: PreventiveMaintenanceRow[] = [
  {
    id: "pm-1",
    systemEquipment: "מעליות שקופות בניין A (16 קומות)",
    vendorName: "אלקטרה מעליות",
    nextServiceDate: "2025-04-02",
    frequency: "monthly",
    status: "scheduled",
  },
  {
    id: "pm-2",
    systemEquipment: "משאבות מים — מאגר עליון ותחתון",
    vendorName: "מקורות משאבות בע״מ",
    nextServiceDate: "2025-03-18",
    frequency: "bi_annual",
    status: "overdue",
  },
  {
    id: "pm-3",
    systemEquipment: "מערכת ספרינקלרים ומשאבות כיבוי אש",
    vendorName: "מגן אש ישראל",
    nextServiceDate: "2025-05-10",
    frequency: "annual",
    status: "scheduled",
  },
  {
    id: "pm-4",
    systemEquipment: "גנרטור חירום — בניין מגורים",
    vendorName: "תדיראן גנרטורים",
    nextServiceDate: "2025-02-28",
    frequency: "bi_annual",
    status: "completed",
  },
  {
    id: "pm-5",
    systemEquipment: "מערכת VRF ומיזוג לובי + גג",
    vendorName: "קריאת קור",
    nextServiceDate: "2025-04-15",
    frequency: "bi_annual",
    status: "scheduled",
  },
  {
    id: "pm-6",
    systemEquipment: "חדרי משאבות — לחץ מים קבוע",
    vendorName: "מקורות משאבות בע״מ",
    nextServiceDate: "2025-03-25",
    frequency: "monthly",
    status: "scheduled",
  },
  {
    id: "pm-7",
    systemEquipment: "דלתות כבאות ומערכת פריקה הידראולית",
    vendorName: "דלתות בטיחות א.ש.",
    nextServiceDate: "2025-03-10",
    frequency: "annual",
    status: "overdue",
  },
  {
    id: "pm-8",
    systemEquipment: "מעלית שירות בניין B (גלישה 16 קומות)",
    vendorName: "אלקטרה מעליות",
    nextServiceDate: "2025-04-01",
    frequency: "monthly",
    status: "scheduled",
  },
]
