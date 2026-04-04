/** Canonical base path for the Marker Ofek procurement module. */
export const PROCUREMENT_BASE = "/marker-ofek/procurement" as const

/** The five pharmacy-standard pillars — single source for subnav and docs. */
export const PROCUREMENT_ROUTES = {
  orders: `${PROCUREMENT_BASE}/orders`,
  suppliers: `${PROCUREMENT_BASE}/suppliers`,
  inventory: `${PROCUREMENT_BASE}/inventory`,
  catalog: `${PROCUREMENT_BASE}/catalog`,
  assets: `${PROCUREMENT_BASE}/assets`,
} as const

export type ProcurementPillarId = keyof typeof PROCUREMENT_ROUTES
