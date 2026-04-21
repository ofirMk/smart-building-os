import type { Metadata } from "next"
import Link from "next/link"
import {
  Building2,
  Landmark,
  Percent,
  Shield,
  SlidersHorizontal,
  TrendingUp,
  Users,
} from "lucide-react"

import { buttonVariants } from "@/components/ui/button-variants"
import { getOrganizationBranding } from "@/lib/marker-ofek/organization-branding"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "הגדרות חכמות — מרכז",
}

const cards: {
  title: string
  body: string
  href: string
  icon: typeof Building2
}[] = [
  {
    title: "פרטי חברה ומס",
    body: "שם מנפיק, ח.פ, כתובת, תיק ניכויים — מופיעים במסמכי חשבון חלקי.",
    href: "/marker-ofek/settings",
    icon: Building2,
  },
  {
    title: "מע״מ, עכבון ומקור מדד",
    body: "ברירות מחדל גלובליות בפרופיל החברה (מסך הגדרות).",
    href: "/marker-ofek/settings",
    icon: Percent,
  },
  {
    title: "הצמדות ומדדים (חוזים)",
    body: "מקדמים ותאריכי בסיס לפי חוזה — ליד מנוע החשבונות החלקיים.",
    href: "/marker-ofek/finance/indexation",
    icon: TrendingUp,
  },
  {
    title: "עכבון ומדיניות ניכויים",
    body: "אחוזי עכבון, ביטוחים ודמי מעבדה לפי חוזה וכללי ניכוי.",
    href: "/marker-ofek/finance/retention",
    icon: Shield,
  },
  {
    title: "ניהול מודולים",
    body: "הפעלה/כיבוי גאנט, חיוב, Gap Hunter, נכסים, דשבורד הנהלה.",
    href: "/marker-ofek/settings/modules",
    icon: SlidersHorizontal,
  },
  {
    title: "הרשאות משתמשים (אופיר)",
    body: "נראות מודולים, צפייה בכספים — הנהלה בכירה, הרשאת עריכה (לשימוש עתידי).",
    href: "/marker-ofek/settings/user-permissions",
    icon: Users,
  },
  {
    title: "מרכז חוזה וחשבונות",
    body: "חיבור בין חוזה, חשבונות חלקיים וחיוב — נקודת כניסה כספית.",
    href: "/marker-ofek/finance/contracts-billing",
    icon: Landmark,
  },
]

export default async function MarkerOfekSmartSettingsHubPage() {
  const branding = await getOrganizationBranding()
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-8 pb-12">
      <header className="pharmacy-hero-card p-6 md:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600">
          {branding.organizationName}
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#1e293b] md:text-3xl">
          מרכז הגדרות חכם
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
          נקודת כניסה אחת למדיניות מס, הצמדות, עכבון, מודולים והרשאות — לפני
          שינוי נתונים בפרויקט.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => {
          const Icon = c.icon
          return (
            <Link
              key={c.title}
              href={c.href}
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-auto min-h-[7rem] flex-col items-stretch justify-between gap-3 rounded-xl border-slate-100 bg-card p-5 text-start font-normal shadow-sm hover:bg-background/80"
              )}
            >
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-indigo-100 bg-indigo-50 text-indigo-700">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-[#0f172a]">{c.title}</p>
                  <p className="text-xs leading-relaxed text-slate-500">{c.body}</p>
                </div>
              </div>
              <span className="text-xs font-medium text-indigo-600">פתיחה ←</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
