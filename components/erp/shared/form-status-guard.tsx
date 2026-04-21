"use client"

import * as React from "react"
import { AlertTriangle } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

type UseFormStatusGuardInput = {
  isStale: boolean
  hasHighVariance: boolean
  staleMessage?: string
  highVarianceMessage?: string
}

export function useFormStatusGuard(input: UseFormStatusGuardInput) {
  const blocked = input.isStale || input.hasHighVariance
  const staleMessage =
    input.staleMessage ?? "הנתונים עודכנו או עדיין נטענים. רעננו לפני שמירה."
  const highVarianceMessage =
    input.highVarianceMessage ?? "זוהתה חריגת מחיר גבוהה. נדרש טיפול לפני המשך."

  const assertReady = React.useCallback(() => {
    if (!blocked) return true
    if (input.hasHighVariance) {
      toast.error(highVarianceMessage)
      return false
    }
    toast.error(staleMessage)
    return false
  }, [blocked, input.hasHighVariance, highVarianceMessage, staleMessage])

  return { blocked, staleMessage, highVarianceMessage, assertReady }
}

export function FormStatusGuard(props: {
  isStale: boolean
  hasHighVariance: boolean
  staleMessage?: string
  highVarianceMessage?: string
}) {
  if (!props.isStale && !props.hasHighVariance) return null
  const message = props.hasHighVariance
    ? props.highVarianceMessage ?? "זוהתה חריגת מחיר גבוהה. יש לאשר חריגה לפני המשך."
    : props.staleMessage ?? "המידע בטופס לא עדכני או עדיין נטען. רעננו לפני הגשה."

  return (
    <Alert variant="warning" className="border-amber-200 bg-amber-50 text-amber-900">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Form Status Guard</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}
