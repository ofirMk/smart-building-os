"use client"

import { EvBillsDataTable } from "@/components/ev-management/ev-bills-data-table"
import { EvSessionsDataTable } from "@/components/ev-management/ev-sessions-data-table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { EvMonthlyBillWithSpot, EvSessionWithSpot } from "@/lib/ev-management"

type EvManagementTabsProps = {
  sessions: EvSessionWithSpot[]
  bills: EvMonthlyBillWithSpot[]
  sessionsError: string | null
  billsError: string | null
}

export function EvManagementTabs({
  sessions,
  bills,
  sessionsError,
  billsError,
}: EvManagementTabsProps) {
  return (
    <Tabs defaultValue="sessions" className="w-full gap-4">
      <TabsList className="w-full max-w-md">
        <TabsTrigger value="sessions" className="flex-1">
          סשנים אחרונים
        </TabsTrigger>
        <TabsTrigger value="bills" className="flex-1">
          חיובים חודשיים
        </TabsTrigger>
      </TabsList>

      <TabsContent value="sessions" className="mt-0 flex flex-col gap-3">
        {sessionsError ? (
          <div
            role="alert"
            className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-start"
          >
            <p className="text-sm font-semibold text-destructive">
              לא ניתן לטעון את סשני הטעינה
            </p>
            <p className="mt-1 text-xs text-destructive/90">{sessionsError}</p>
          </div>
        ) : null}
        <EvSessionsDataTable data={sessions} />
      </TabsContent>

      <TabsContent value="bills" className="mt-0 flex flex-col gap-3">
        {billsError ? (
          <div
            role="alert"
            className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-start"
          >
            <p className="text-sm font-semibold text-destructive">
              לא ניתן לטעון את החיובים החודשיים
            </p>
            <p className="mt-1 text-xs text-destructive/90">{billsError}</p>
          </div>
        ) : null}
        <EvBillsDataTable data={bills} />
      </TabsContent>
    </Tabs>
  )
}
