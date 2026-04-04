/** Defaults when row missing or columns not yet migrated. */
export type MarkerAccessFlags = {
  viewFinancials: boolean
  editAccess: boolean
}

export const DEFAULT_MARKER_ACCESS: MarkerAccessFlags = {
  viewFinancials: true,
  editAccess: true,
}

export function markerAccessFromConfigRow(
  row: {
    marker_ofek_view_financials?: boolean | null
    marker_ofek_edit_access?: boolean | null
  } | null
): MarkerAccessFlags {
  return {
    viewFinancials: row?.marker_ofek_view_financials !== false,
    editAccess: row?.marker_ofek_edit_access !== false,
  }
}
