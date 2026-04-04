import type { Metadata } from "next"

import { ModuleManagerClient } from "@/components/marker-ofek/module-manager-client"

export const metadata: Metadata = {
  title: "ניהול מודולים",
}

export default function MarkerOfekModuleManagerPage() {
  return (
    <div className="min-h-screen bg-[#fafafa] font-sans text-[#0f172a] rtl" dir="rtl">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-10">
        <ModuleManagerClient />
      </div>
    </div>
  )
}
