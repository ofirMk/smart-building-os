"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Award, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"

const STORAGE_KEY = "diamond-qualification-cert-dismissed"

type Props = {
  show: boolean
  onClose: () => void
}

/** אנימציית סיום — אחרי שמירת ניכוי בפרויקט הדמו (ההסמכה נרשמת בשרת) */
export function DiamondQualificationCertificate({ show, onClose }: Props) {
  const router = useRouter()

  function goToWork() {
    try {
      sessionStorage.setItem(STORAGE_KEY, "1")
    } catch {
      /* ignore */
    }
    onClose()
    router.push("/marker-ofek/command-center")
    router.refresh()
  }

  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-white/90 p-4 backdrop-blur-sm"
          dir="rtl"
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 280, damping: 22 }}
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-100 bg-[#FFFFFF] p-8 shadow-xl ring-1 ring-slate-100"
          >
            <motion.div
              className="pointer-events-none absolute -top-8 end-0 size-32 rounded-full bg-indigo-500/10 blur-2xl"
              aria-hidden
            />
            <div className="relative flex flex-col items-center text-center">
              <motion.div
                initial={{ rotate: -8, scale: 0.8 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ delay: 0.15, type: "spring", stiffness: 260 }}
                className="mb-4 flex size-16 items-center justify-center rounded-2xl border border-indigo-100 bg-indigo-50 text-indigo-700"
              >
                <Award className="size-9" aria-hidden />
              </motion.div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600">
                Diamond Qualification
              </p>
              <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">
                הסמכת משתמש מקצועי
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                שמרתם ניכוי מס במקור תקין על הזמנת רכש בפרויקט האימון — אושרתם לעבודה מלאה במרקר אופק.
              </p>
              <div className="mt-6 flex w-full flex-col gap-2">
                <Button
                  type="button"
                  className="h-11 w-full gap-2 bg-indigo-600 text-white hover:bg-indigo-700"
                  onClick={goToWork}
                >
                  <Sparkles className="size-4" aria-hidden />
                  המשך לעבודה
                </Button>
                <Button type="button" variant="ghost" size="sm" className="text-slate-500" onClick={onClose}>
                  סגירה
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export function readDiamondCertDismissed(): boolean {
  if (typeof window === "undefined") return true
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return true
  }
}
