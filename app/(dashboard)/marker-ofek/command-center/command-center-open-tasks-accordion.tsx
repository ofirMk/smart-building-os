"use client"

import Link from "next/link"
import { ChevronDown } from "lucide-react"

import { Accordion } from "@base-ui/react/accordion"

import { cn } from "@/lib/utils"

export type OpenTaskRow = {
  label: string
  count: number
  href: string
  hot: boolean
}

export function CommandCenterOpenTasksAccordion({
  actions,
  totalCount,
}: {
  actions: OpenTaskRow[]
  totalCount: number
}) {
  return (
    <section
      data-diamond-spotlight="cc-alerts"
      className="rounded-xl border border-slate-200/80 bg-white shadow-sm"
      aria-label="משימות פתוחות"
    >
      <Accordion.Root
        className="w-full"
        defaultValue={[]}
        multiple={false}
      >
        <Accordion.Item
          value="open-tasks"
          className="overflow-hidden rounded-xl"
        >
          <Accordion.Header className="m-0">
            <Accordion.Trigger
              className={cn(
                "group flex w-full items-center justify-between gap-3 border-0 bg-transparent px-4 py-3.5 text-start",
                "text-sm font-semibold text-indigo-950 transition-colors",
                "hover:bg-slate-50/80",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/25 focus-visible:ring-offset-2"
              )}
            >
              <span>
                משימות פתוחות ({totalCount})
              </span>
              <ChevronDown
                className="size-4 shrink-0 text-slate-400 transition-transform duration-200 group-data-[panel-open]:rotate-180"
                aria-hidden
              />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel className="border-t border-slate-100 px-2 pb-2 pt-1">
            <ul className="space-y-0.5 py-2">
              {actions.map((a) => (
                <li key={a.label}>
                  <Link
                    href={a.href}
                    className="flex items-center justify-between gap-3 rounded-lg border border-transparent px-2 py-2.5 text-xs text-slate-700 hover:border-slate-100 hover:bg-slate-50"
                  >
                    <span className="flex min-w-0 items-center gap-2 font-sans">
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          a.hot ? "bg-red-500" : "bg-slate-200"
                        )}
                        aria-hidden
                      />
                      {a.label}
                    </span>
                    <span className="font-currency-mono tabular-nums text-indigo-950">
                      {a.count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion.Root>
    </section>
  )
}
