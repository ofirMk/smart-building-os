/** סטטוס עמדת טעינה / מונה חכם — לתצוגה בלבד (דמו) */
export type EvMeterStatusUi = "online" | "charging" | "offline"

export type EvSmartMeterRow = {
  id: string
  meterId: string
  /** כש־false — העמודה ״שיוך״ מציגה מצב ללא דייר */
  isAssigned: boolean
  tenantLabel: string
  buildingLabel: string
  status: EvMeterStatusUi
  accumulatedKwh: number
  currentChargeNis: number
}

/** מונה זמין לשיוך (לא משויך לדייר) */
export type EvUnassignedMeterOption = {
  id: string
  meterId: string
}

/** דייר לבחירה במסך שיוך */
export type EvTenantAssignOption = {
  id: string
  /** תצוגה בדרופדאון */
  displayLabel: string
  tenantLabel: string
  buildingLabel: string
}

export type EvEnergySummaryMock = {
  totalConsumptionMonthKwh: number
  estimatedRevenueNis: number
  activeChargers: number
  totalChargerSlots: number
}

export const EV_ENERGY_SUMMARY_MOCK: EvEnergySummaryMock = {
  totalConsumptionMonthKwh: 1450,
  estimatedRevenueNis: 1230,
  activeChargers: 24,
  totalChargerSlots: 30,
}

/** מונים ללא שיוך — לדמו בחירה ב״שיוך עמדה לדייר״ */
export const EV_UNASSIGNED_POOL_MOCK: EvUnassignedMeterOption[] = [
  { id: "um-b42", meterId: "EV-B-42" },
  { id: "um-c22", meterId: "EV-C-22" },
  { id: "um-d08", meterId: "EV-D-08" },
]

export const EV_TENANT_ASSIGN_OPTIONS: EvTenantAssignOption[] = [
  {
    id: "ta1",
    displayLabel: "משפחת כהן, בניין B דירה 12",
    tenantLabel: "משפחת כהן",
    buildingLabel: "בניין B דירה 12",
  },
  {
    id: "ta2",
    displayLabel: "משפחת לוי, בניין A דירה 5",
    tenantLabel: "משפחת לוי",
    buildingLabel: "בניין A דירה 5",
  },
  {
    id: "ta3",
    displayLabel: "ד״ר רוזן, בניין C דירה 8",
    tenantLabel: "ד״ר רוזן",
    buildingLabel: "בניין C דירה 8",
  },
  {
    id: "ta4",
    displayLabel: "משפחת אברהם, בניין D דירה 3",
    tenantLabel: "משפחת אברהם",
    buildingLabel: "בניין D דירה 3",
  },
]

export const EV_SMART_METERS_MOCK: EvSmartMeterRow[] = [
  {
    id: "m1",
    meterId: "EV-A-12",
    isAssigned: true,
    tenantLabel: "משפחת כהן",
    buildingLabel: "בניין A",
    status: "charging",
    accumulatedKwh: 842.4,
    currentChargeNis: 487.6,
  },
  {
    id: "m2",
    meterId: "EV-A-03",
    isAssigned: true,
    tenantLabel: "משפחת לוי",
    buildingLabel: "בניין A",
    status: "online",
    accumulatedKwh: 312.0,
    currentChargeNis: 180.5,
  },
  {
    id: "m3",
    meterId: "EV-B-07",
    isAssigned: true,
    tenantLabel: "ד״ר רוזן",
    buildingLabel: "בניין B",
    status: "online",
    accumulatedKwh: 1205.8,
    currentChargeNis: 698.2,
  },
  {
    id: "m4",
    meterId: "EV-B-21",
    isAssigned: true,
    tenantLabel: "משפחת אברהם",
    buildingLabel: "בניין B",
    status: "offline",
    accumulatedKwh: 96.2,
    currentChargeNis: 55.8,
  },
  {
    id: "m5",
    meterId: "EV-C-01",
    isAssigned: true,
    tenantLabel: "משפחת מזרחי",
    buildingLabel: "בניין C",
    status: "charging",
    accumulatedKwh: 2104.7,
    currentChargeNis: 1218.5,
  },
  {
    id: "m6",
    meterId: "EV-C-14",
    isAssigned: true,
    tenantLabel: "גב׳ שטרן",
    buildingLabel: "בניין C",
    status: "online",
    accumulatedKwh: 445.3,
    currentChargeNis: 257.9,
  },
  {
    id: "m7",
    meterId: "EV-D-05",
    isAssigned: false,
    tenantLabel: "",
    buildingLabel: "",
    status: "offline",
    accumulatedKwh: 0,
    currentChargeNis: 0,
  },
  {
    id: "m8",
    meterId: "EV-D-18",
    isAssigned: true,
    tenantLabel: "משפחת פרץ",
    buildingLabel: "בניין D",
    status: "online",
    accumulatedKwh: 678.1,
    currentChargeNis: 392.7,
  },
  {
    id: "m9",
    meterId: "EV-A-09",
    isAssigned: true,
    tenantLabel: "משפחת ביטון",
    buildingLabel: "בניין A",
    status: "charging",
    accumulatedKwh: 1523.0,
    currentChargeNis: 881.6,
  },
  {
    id: "m10",
    meterId: "EV-B-11",
    isAssigned: true,
    tenantLabel: "עו״ד קלדרון",
    buildingLabel: "בניין B",
    status: "online",
    accumulatedKwh: 289.4,
    currentChargeNis: 167.5,
  },
]
