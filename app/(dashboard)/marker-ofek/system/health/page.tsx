import { SystemHealthClient } from "@/components/marker-ofek/system/system-health-client"
import { fetchSystemHealthAction } from "@/lib/holden-erp/finance-actions"

export default async function SystemHealthPage() {
  const res = await fetchSystemHealthAction()

  const initial =
    res.ok
      ? {
          pending: res.pending,
          failed: res.failed,
          synced: res.synced,
          recent: res.recent,
        }
      : null

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#070b12] text-slate-100">
      <SystemHealthClient
        initial={initial}
        loadError={res.ok ? null : res.error}
      />
    </div>
  )
}
