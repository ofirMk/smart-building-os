"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Switch({
  className,
  checked,
  onCheckedChange,
  disabled,
  id,
  ...props
}: Omit<React.ComponentProps<"button">, "onClick" | "type"> & {
  checked: boolean
  onCheckedChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      data-state={checked ? "checked" : "unchecked"}
      aria-checked={checked}
      disabled={disabled}
      dir="ltr"
      onClick={() => {
        if (!disabled) onCheckedChange(!checked)
      }}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-slate-200",
        className
      )}
      {...props}
    >
      <span
        className={cn(
          "pointer-events-none absolute top-0.5 size-6 rounded-full bg-card shadow-sm transition-transform duration-200 ease-out",
          checked ? "translate-x-[1.375rem]" : "translate-x-0.5"
        )}
      />
    </button>
  )
}

export { Switch }
