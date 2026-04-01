"use client"

import { toast as sonnerToast } from "sonner"

/** עטיפה ל־Sonner לפי המוסכמה של shadcn (הודעות בעברית) */
export function useToast() {
  return {
    success: (message: string) => sonnerToast.success(message),
    error: (message: string) => sonnerToast.error(message),
  }
}
