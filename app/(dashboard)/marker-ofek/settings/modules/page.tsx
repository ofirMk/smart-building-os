import type { Metadata } from "next"

import { MasterDetailWorkspace } from "@/components/layout/MasterDetailWorkspace"
import { SettingsMasterNav } from "@/components/marker-ofek/settings/settings-master-nav"
import { ModuleManagerClient } from "@/components/marker-ofek/module-manager-client"

export const metadata: Metadata = {
  title: "ניהול מודולים",
}

export default function MarkerOfekModuleManagerPage() {
  return (
    <MasterDetailWorkspace
      title="ניהול מודולים"
      description="ניהול הפעלה/כיבוי של מודולים ברמת משתמש"
      master={<SettingsMasterNav />}
      detail={
        <div className="flex-1 min-h-0 overflow-y-auto bg-[#fafafa] font-sans text-[#0f172a] rtl" dir="rtl">
          <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-6 px-2 py-2">
            <ModuleManagerClient />
          </div>
        </div>
      }
    />
  )
}
