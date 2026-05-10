import Link from "next/link"
import { ArrowLeft, FileText, Users } from "lucide-react"

export const dynamic = "force-dynamic"

const TILES = [
  {
    href: "/admin/users",
    title: "ניהול משתמשים",
    description:
      "הזמנת משתמשים, שינוי הרשאות, השבתה והסרה מהחברה הפעילה.",
    icon: Users,
    iconBg: "bg-indigo-100 text-indigo-700",
  },
  {
    href: "/admin/import",
    title: "ייבוא נתונים",
    description:
      "CSV/XLSX → ספקים, פריטים, פרויקטים, חוזים, הזמנות, חשבונות, יתרות ושורות.",
    icon: FileText,
    iconBg: "bg-emerald-100 text-emerald-700",
  },
] as const

export default function AdminIndexPage() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        ברוכים הבאים למרכז הניהול. בחרו אזור לפעולה:
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {TILES.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="group flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
          >
            <div className={`rounded-lg p-2.5 ${t.iconBg}`}>
              <t.icon className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-900 group-hover:text-indigo-700">
                {t.title}
              </h3>
              <p className="mt-1 text-sm text-slate-600">{t.description}</p>
            </div>
            <ArrowLeft className="h-4 w-4 flex-shrink-0 text-slate-400 transition group-hover:-translate-x-1 group-hover:text-indigo-600" />
          </Link>
        ))}
      </div>
    </div>
  )
}
