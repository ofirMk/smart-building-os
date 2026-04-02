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
  },
  {
    title: "מרקר אופק - ביצוע מערכות",
    href: "/marker-ofek",
    icon: HardHat,
  },
  {
    title: "ח.ח לוחות חשמל",
    href: "/hh-panels",
    icon: Zap,
  },
  {
    title: "קבוצת הולדן - הנהלה ראשית",
    href: "/hq",
    icon: Briefcase,
  },
] as const

export default function HoldenPortalPage() {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#050508] text-zinc-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_55%_at_50%_-25%,rgba(34,211,238,0.14),transparent)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_45%_at_100%_40%,rgba(99,102,241,0.1),transparent)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(0,0,0,0.45))]" />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-5xl flex-col px-4 pb-20 pt-14 md:px-10 md:pt-20">
        <motion.header
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.5,
            ease: [0.22, 1, 0.36, 1] as const,
          }}
          className="mb-12 text-center md:mb-16"
        >
          <h1 className="bg-gradient-to-l from-zinc-100 via-white to-zinc-300 bg-clip-text text-3xl font-bold tracking-tight text-transparent md:text-4xl">
            קבוצת הולדן
          </h1>
          <p className="mt-3 text-lg text-zinc-400 md:text-xl">בחר סביבת עבודה</p>
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
                  y: -6,
                  scale: 1.02,
                  transition: { type: "spring", stiffness: 420, damping: 28 },
                }}
                whileTap={{ scale: 0.985 }}
              >
                <a
                  href={card.href}
                  className="group flex h-full min-h-[168px] flex-col justify-between rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-7 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-md transition-[border-color,box-shadow] duration-300 hover:border-cyan-400/40 hover:shadow-[0_0_52px_-14px_rgba(34,211,238,0.4)]"
                >
                  <card.icon
                    className="size-12 text-cyan-400/95 transition-transform duration-300 group-hover:scale-110 group-hover:text-cyan-300"
                    strokeWidth={1.35}
                    aria-hidden
                  />
                  <span className="text-start text-lg font-semibold leading-snug tracking-tight text-zinc-50 md:text-xl">
                    {card.title}
                  </span>
                </a>
              </motion.div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  )
}
