"use client"

import * as React from "react"
import { Loader2, Play } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { ErpDirectActivation } from "@/types/erp"

type DirectActivationsMenuProps<TEntity> = {
  title?: string
  entityName: string
  entity: TEntity | null
  activations: ErpDirectActivation<TEntity>[]
}

export function DirectActivationsMenu<TEntity>({
  title = "הפעלות ישירות",
  entityName,
  entity,
  activations,
}: DirectActivationsMenuProps<TEntity>) {
  const [runningId, setRunningId] = React.useState<string | null>(null)

  const handleActivation = React.useCallback(
    async (activation: ErpDirectActivation<TEntity>) => {
      setRunningId(activation.id)
      try {
        await activation.onActivate({ entityName, entity })
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "הפעלה נכשלה")
      } finally {
        setRunningId(null)
      }
    },
    [entity, entityName]
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button size="sm" variant="outline" className="bg-card">
            <Play className="ms-1 size-3.5" />
            הפעלות
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-56 rounded-xl border border-slate-200 bg-card shadow-sm">
        <DropdownMenuLabel className="text-xs text-slate-500">{title}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {activations.map((activation) => {
          const isRunning = runningId === activation.id
          return (
            <DropdownMenuItem
              key={activation.id}
              disabled={activation.disabled || isRunning}
              onClick={() => void handleActivation(activation)}
              className="flex items-center justify-between gap-2 text-right"
            >
              <span className="flex flex-col items-start text-right">
                <span className="text-sm">{activation.label}</span>
                {activation.hint ? <span className="text-[11px] text-slate-500">{activation.hint}</span> : null}
              </span>
              {isRunning ? <Loader2 className="size-3.5 animate-spin text-slate-500" /> : null}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
