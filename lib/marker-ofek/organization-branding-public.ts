/** מותג ארגון — משותף לשרת וללקוח (ללא server-only). */

export const DEFAULT_ORGANIZATION_DISPLAY_NAME = "שם הארגון"

export const DEFAULT_SAAS_SLOGAN =
  "מבט הנדסי. שליטה פיננסית. ניהול בסטנדרט היהלום."

export const ERP_EXECUTION_SUBTITLE = "ביצוע ורכש"

export type OrganizationBrandingSnapshot = {
  organizationName: string
  brandLogoUrl: string | null
  slogan: string
}

export const FALLBACK_ORGANIZATION_BRANDING: OrganizationBrandingSnapshot = {
  organizationName: DEFAULT_ORGANIZATION_DISPLAY_NAME,
  brandLogoUrl: null,
  slogan: DEFAULT_SAAS_SLOGAN,
}
