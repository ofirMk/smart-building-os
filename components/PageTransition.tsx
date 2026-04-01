"use client"

import { AnimatePresence, motion } from "framer-motion"
import { usePathname } from "next/navigation"
import { memo } from "react"

/** CSS ease-out (Material / standard “power” ease-out). */
const easeOutPower: [number, number, number, number] = [0, 0, 0.2, 1]

function PageTransitionInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        className="min-w-0 flex-1"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 12 }}
        transition={{
          duration: 0.3,
          ease: easeOutPower,
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

export const PageTransition = memo(PageTransitionInner)
