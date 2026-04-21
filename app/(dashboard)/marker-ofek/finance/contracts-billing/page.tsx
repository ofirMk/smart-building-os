import Link from "next/link"
import {
  Archive,
  FileSignature,
  GitBranch,
  Landmark,
  Percent,
  ScrollText,
  Shield,
} from "lucide-react"

import { getOrganizationBranding } from "@/lib/marker-ofek/organization-branding"

/** סדר זהב: יצירת חוזה → כספת → תנאים כספיים → חשבונות חלקיים (אחרונים לפני כספים גלובליים). */
const TILES = [
  {
    title: "חוזי מזמין וספקי ביצוע",
    href: "/marker-ofek/contracts",
    desc: "חוזים ראשיים ומשנה, ישויות וכרטיסי פרויקט.",
    icon: FileSignature,
  },
  {
    title: "כספת מסמכי חוזה",
    href: "/marker-ofek/finance/contract-vault",
    desc: "העלאה מאובטחת, הרשאות צפייה וניתוח AI.",
    icon: Archive,
  },
  {
    title: "הצמדות ומדדים",
    href: "/marker-ofek/finance/indexation",
    desc: "מקדמי הצמדה, תאריכי בסיס וחישובי תקופה.",
    icon: Percent,
  },
  {
    title: "עכבון וערבויות",
    href: "/marker-ofek/finance/retention",
    desc: "ניכויים, ערבויות ביצוע וביטוחים.",
    icon: Shield,
  },
  {
    title: "חריגים ותוספות",
    href: "/marker-ofek/finance/variations",
    desc: "שינויי דיירים, הוראות שינוי ותוספות מוסכמות.",
    icon: GitBranch,
  },
  {
    title: "חשבונות חלקיים",
    href: "/marker-ofek/finance/partials",
    desc: "התקדמות ביצוע, שורות BOQ ואישורים.",
    icon: ScrollText,
  },
] as const

const SECONDARY = [
  { title: "מרכז חיוב ותזרים", href: "/marker-ofek/finance/billing" },
  { title: "חשבוניות מס וקבלות", href: "/marker-ofek/finance" },
  { title: "חשבונית מרכזת", href: "/marker-ofek/finance/centralized" },
] as const

export default async function ContractsBillingHubPage() {
  const branding = await getOrganizationBranding()
  return (
    <div
      dir="rtl"
      lang="he"
      className="mx-auto w-full max-w-6xl space-y-10 pb-16"
    >
      <Link
        href="/marker-ofek/command-center"
        className="inline-flex w-fit items-center gap-2 text-sm text-slate-500 transition-colors hover:text-indigo-950"
      >
        חזרה למרכז הפיקוד
      </Link>

      <header className="rounded-xl border border-slate-100 bg-card p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-background text-indigo-950">
            <Landmark className="size-6" strokeWidth={1.5} aria-hidden />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {branding.organizationName}
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-indigo-950 sm:text-3xl">
              חוזה וחשבונות
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              סדר זהב: חוזים וכספת לפני חשבונות חלקיים. חשבוניות מס, חיוב ותזרים — תחת מודול{" "}
              <span className="font-currency-mono text-[13px] text-indigo-950">כספים</span>{" "}
              בסרגל הצד.
            </p>
          </div>
        </div>
      </header>

      <nav
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        aria-label="תתי מודולי חוזה וחשבונות"
      >
        {TILES.map((t) => {
          const Icon = t.icon
          return (
            <Link
              key={t.href}
              href={t.href}
              className="group flex flex-col rounded-xl border border-slate-100 bg-card p-5 shadow-sm transition-colors hover:border-slate-200 hover:shadow-md"
            >
              <span className="mb-3 flex size-10 items-center justify-center rounded-lg border border-slate-100 bg-background text-indigo-950 transition-colors group-hover:bg-indigo-950/5">
                <Icon className="size-5" strokeWidth={1.5} aria-hidden />
              </span>
              <h2 className="text-base font-semibold text-indigo-950">
                {t.title}
              </h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">
                {t.desc}
              </p>
            </Link>
          )
        })}
      </nav>

      <section className="rounded-xl border border-slate-100 bg-card p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-indigo-950">
          מודול כספים (מס׳ 5 בסדר הזהב)
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          קיצור דרך; הרשימה המלאה תחת «כספים» בתפריט.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {SECONDARY.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="font-currency-mono inline-flex rounded-lg border border-slate-100 bg-background/80 px-3 py-2 text-[13px] font-medium text-indigo-950 transition-colors hover:bg-slate-100"
              >
                {s.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
