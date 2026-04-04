"use client"

import * as React from "react"

import {
  type OrganizationBrandingSnapshot,
  DEFAULT_SAAS_SLOGAN,
  DEFAULT_ORGANIZATION_DISPLAY_NAME,
  ERP_EXECUTION_SUBTITLE,
} from "@/lib/marker-ofek/organization-branding-public"

const DEFAULT_CTX: OrganizationBrandingSnapshot = {
  organizationName: DEFAULT_ORGANIZATION_DISPLAY_NAME,
  brandLogoUrl: null,
  slogan: DEFAULT_SAAS_SLOGAN,
}

const Ctx = React.createContext<OrganizationBrandingSnapshot>(DEFAULT_CTX)

export function OrganizationBrandingProvider({
  value,
  children,
}: {
  value: OrganizationBrandingSnapshot
  children: React.ReactNode
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useOrganizationBranding(): OrganizationBrandingSnapshot {
  return React.useContext(Ctx)
}

export {
  DEFAULT_ORGANIZATION_DISPLAY_NAME,
  DEFAULT_SAAS_SLOGAN,
  ERP_EXECUTION_SUBTITLE,
} from "@/lib/marker-ofek/organization-branding-public"
