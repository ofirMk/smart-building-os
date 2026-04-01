"use client"

import type { ReactNode } from "react"

import { TenantBottomNav } from "@/components/tenant/tenant-bottom-nav"

/**
 * מעטפת פורטל דיירים — ללא סרגל הדשבורד האדמיני; מסגרת מובייל פרימיום.
 */
export function TenantShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#0a0a0a]">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col border-x border-gray-800 bg-[#0a0a0a] shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_25px_50px_-12px_rgba(0,0,0,0.45)]">
        <div className="flex min-h-dvh flex-1 flex-col">
          <div className="flex-1 overflow-y-auto overscroll-y-contain px-4 pb-28 pt-6 text-gray-100">
            {children}
          </div>
        </div>
        <TenantBottomNav />
      </div>
    </div>
  )
}
