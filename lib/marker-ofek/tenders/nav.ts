export const TENDERS_BASE = "/marker-ofek/tenders" as const

export const TENDERS_ROUTES = {
  hub: TENDERS_BASE,
  pricing: `${TENDERS_BASE}/pricing`,
  boq: `${TENDERS_BASE}/boq`,
  comparison: `${TENDERS_BASE}/comparison`,
  wbs: `${TENDERS_BASE}/wbs`,
} as const

export type TendersPillar = keyof typeof TENDERS_ROUTES
