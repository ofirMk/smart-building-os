/** Row from `buildings` */
export type BuildingRow = {
  id: string
  name: string
  address_line1: string
  address_line2: string | null
  city: string
  region: string | null
  postal_code: string | null
  country: string
  created_at: string
  updated_at: string
}

/**
 * After fetch: raw embeds are normalized to numeric counts for safe UI use.
 */
export type BuildingListItem = BuildingRow & {
  apartmentCount: number
  parkingSpotCount: number
}
