"use client"

import { motion } from "framer-motion"
import { Briefcase, Building, HardHat, Zap } from "lucide-react"

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.09, delayChildren: 0.05 },
  },
}

const item = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.45,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
}

const cards = [
  {
    title: "הולדן ניהול מבנים",
    href: "/dashboard/holden",
    icon: Building,
    status: "פעיל",
    level: "green",
    summary: "12 התראות פתוחות לבקרה",
  },
  {
    title: "מרקר אופק - ביצוע מערכות",
    href: "/marker-ofek",
    icon: HardHat,
    status: "פעיל",
    level: "green",
    summary: "7 פרויקטים במעקב בזמן אמת",
  },
  {
    title: "ח.ח לוחות חשמל",
    href: "/hh-panels",
    icon: Zap,
    status: "12 Alerts",
    level: "yellow",
    summary: "שתי חריגות לוח זמנים דורשות טיפול",
  },
  {
    title: "קבוצת הולדן - הנהלה ראשית",
    href: "/hq",
    icon: Briefcase,
    status: "קריטי",
    level: "red",
    summary: "3 חריגות תקציב ממתינות לאישור",
  },
] as const

function statusMeta(level: (typeof cards)[number]["level"]) {
  if (level === "green") {
    return {
      dot: "bg-emerald-500",
      badge: "bg-emerald-500/15 text-emerald-300",
    }
  }
  if (level === "yellow") {
    return {
      dot: "bg-amber-400",
      badge: "bg-amber-400/15 text-amber-300",
    }
  }
  return {
    dot: "bg-red-500",
    badge: "bg-red-500/15 text-red-300",
  }
}

export default function HoldenPortalPage() {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-slate-950 text-zinc-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_55%_at_50%_-25%,rgba(139,92,246,0.24),transparent)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_45%_at_100%_40%,rgba(99,102,241,0.14),transparent)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(2,6,23,0.7))]" />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-5xl flex-col px-4 pb-20 pt-14 md:px-10 md:pt-20">
        <motion.header
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.5,
            ease: [0.22, 1, 0.36, 1] as const,
          }}
          className="mb-12 space-y-2 text-center md:mb-16"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
            מרקר אופק
          </p>
          <h1 className="bg-gradient-to-l from-zinc-100 via-white to-zinc-300 bg-clip-text text-3xl font-bold tracking-tight text-transparent md:text-4xl">
            פורטל שליטה ארגוני - קבוצת הולדן
          </h1>
          <p className="mt-2 text-sm text-zinc-400 md:text-base">
            כניסה מאובטחת למודולי הליבה: בקרה, ביצוע, לוגיסטיקה והנהלה
          </p>
        </motion.header>

        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid flex-1 grid-cols-1 gap-5 sm:grid-cols-2"
        >
          {cards.map((card) => (
            <motion.div key={card.href} variants={item} className="min-h-0">
              <motion.div
                className="h-full"
                whileHover={{
                  y: -4,
                  transition: { type: "spring", stiffness: 420, damping: 28 },
                }}
                whileTap={{ scale: 0.985 }}
              >
                <a
                  href={card.href}
                  className="group flex h-full min-h-[188px] flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-violet-400/60 hover:bg-accent/40 hover:shadow-lg"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="inline-flex rounded-xl bg-violet-500/20 p-2.5 text-violet-300 shadow-[0_0_20px_-10px_rgba(139,92,246,0.9)] transition-transform duration-300 group-hover:scale-105">
                      <card.icon
                        className="size-6"
                        strokeWidth={1.5}
                        aria-hidden
                      />
                    </div>
                    {(() => {
                      const meta = statusMeta(card.level)
                      return (
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${meta.badge}`}
                        >
                          <span
                            className={`inline-block size-2 rounded-full ${meta.dot}`}
                          />
                          {card.status}
                        </span>
                      )
                    })()}
                  </div>
                  <div className="space-y-2 text-start">
                    <h2 className="text-lg font-semibold leading-snug tracking-tight text-card-foreground md:text-xl">
                      {card.title}
                    </h2>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {card.summary}
                    </p>
                  </div>
                </a>
              </motion.div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  )
}
