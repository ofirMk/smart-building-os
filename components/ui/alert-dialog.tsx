"use client"

/**
 * alert-dialog.tsx — thin wrapper over the base Dialog component.
 * Provides the standard shadcn/ui AlertDialog API (AlertDialog, AlertDialogTrigger,
 * AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle,
 * AlertDialogDescription, AlertDialogAction, AlertDialogCancel) so that existing
 * code that imports from "@/components/ui/alert-dialog" compiles without changes.
 *
 * Implemented using the project's existing base-ui Dialog primitives.
 */

import * as React from "react"

import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

const AlertDialog = Dialog
const AlertDialogTrigger = DialogTrigger

function AlertDialogContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogContent>) {
  return (
    <DialogContent
      showCloseButton={false}
      className={cn("max-w-md", className)}
      {...props}
    />
  )
}

const AlertDialogHeader = DialogHeader
const AlertDialogTitle = DialogTitle
const AlertDialogDescription = DialogDescription

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <DialogFooter
      className={cn("sm:flex-row-reverse gap-2", className)}
      {...props}
    />
  )
}

function AlertDialogAction({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Button>) {
  return <Button className={cn(className)} {...props} />
}

function AlertDialogCancel({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Button>) {
  return (
    <DialogClose
      render={
        <Button variant="outline" className={cn("mt-2 sm:mt-0", className)} {...props} />
      }
    />
  )
}

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
}
