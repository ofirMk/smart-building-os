"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { BarChart3, HardHat, LayoutDashboard, ShoppingCart } from "lucide-react"

import { Card } from "@/components/ui/card"

function Counter({ value }: { value: number }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (value === 0) {
      setCount(0)
      return
    }
    let start = 0
    const end = value
    const timer = window.setInterval(() => {
      start += 1
      setCount(start)
      if (start === end) window.clearInterval(timer)
    }, 50)
    return () => window.clearInterval(timer)
  }, [value])

  return <span>{count}</span>
}

const modules = [
  { title: "ביצוע וגאנט", icon: HardHat, val: 7 },
  { title: "רכש ספקים", icon: ShoppingCart, val: 12 },
  { title: "ניהול שותפים", icon: BarChart3, val: 3 },
  { title: "דשבורד פיקוד", icon: LayoutDashboard, val: 2 },
] as const

export default function DataSpacePortal() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-card p-8 md:p-12">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: "radial-gradient(#e2e8f0 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="z-10 grid w-full max-w-5xl grid-cols-1 gap-8 md:grid-cols-2 md:gap-10">
        {modules.map((mod, idx) => {
          const Icon = mod.icon
          return (
            <motion.div
              key={mod.title}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: idx * 0.1, duration: 0.5, ease: "easeOut" }}
              whileHover={{ scale: 1.03, translateY: -5 }}
            >
              <Card className="group relative overflow-hidden border-slate-100 bg-card p-8 shadow-sm transition-all duration-300 hover:border-slate-200">
                <div className="relative flex items-center justify-between">
                  <div>
                    <div className="mb-3 flex items-center gap-2 text-slate-400">
                      <Icon className="size-4 shrink-0 stroke-[1.25]" aria-hidden />
                      <span className="text-sm font-bold uppercase tracking-widest">{mod.title}</span>
                    </div>
                    <div className="font-currency-mono text-6xl font-black text-[#1e293b]">
                      <Counter value={mod.val} />
                    </div>
                  </div>

                  <div className="text-slate-200/80 transition-colors group-hover:text-slate-300">
                    <Icon className="size-[100px]" strokeWidth={1} aria-hidden />
                  </div>
                </div>
              </Card>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
