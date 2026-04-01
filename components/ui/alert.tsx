import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative w-full rounded-xl border px-4 py-3 text-start text-sm [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:start-4 [&>svg]:top-4 [&>svg]:text-foreground [&>svg~*]:ps-8",
  {
    variants: {
      variant: {
        default:
          "border-border/80 bg-card text-foreground shadow-sm [&>svg]:text-foreground",
        destructive:
          "border-destructive/40 bg-destructive/10 text-destructive [&>svg]:text-destructive dark:bg-destructive/15",
        warning:
          "border-amber-500/45 bg-amber-500/10 text-amber-950 dark:border-amber-400/40 dark:bg-amber-500/12 dark:text-amber-50 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400",
        info: "border-sky-500/40 bg-sky-500/10 text-sky-950 dark:border-sky-400/35 dark:bg-sky-500/12 dark:text-sky-50 [&>svg]:text-sky-600 dark:[&>svg]:text-sky-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("mb-1 font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-sm leading-relaxed text-pretty [&_p]:leading-relaxed",
        className
      )}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, alertVariants }
