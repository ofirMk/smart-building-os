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

import { MasterDetailWorkspace } from "@/components/layout/MasterDetailWorkspace"
import { SettingsMasterNav } from "@/components/marker-ofek/settings/settings-master-nav"
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
    <MasterDetailWorkspace
      title="מרכז הגדרות חכם"
      description={`${branding.organizationName} · נקודת כניסה למדיניות ורגולציה`}
      master={<SettingsMasterNav />}
      detail={
        <div className="space-y-4">
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
      }
    />
  )
}
