import React from "react"
import {
  BookOpen,
  CheckCircle2,
  CircleDashed,
  Clock,
  CreditCard,
  Landmark,
  PieChart,
  Receipt,
  UsersRound,
} from "lucide-react"

interface RoadmapItem {
  id: string
  title: string
  description: string
  status: "completed" | "in-progress" | "planned"
  icon: React.ElementType
}

const roadmapItems: RoadmapItem[] = [
  {
    id: "core-finance",
    title: "ליבת הנהלת חשבונות",
    description:
      "מנוע רישום כפול, פקודות יומן, קליטת דפי בנק ומשטח התאמות מפוצל מבוסס AI.",
    status: "completed",
    icon: BookOpen,
  },
  {
    id: "billing",
    title: "מסמכים קמעונאיים (Billing)",
    description:
      "הפקת חשבוניות מס, קבלות וזיכויים. יצירת פקודות יומן אוטומטיות ברקע.",
    status: "planned",
    icon: Receipt,
  },
  {
    id: "payments",
    title: "מודול תשלומים",
    description:
      "הכנת קובצי מס\"ב לקבלנים/ספקים, סליקת אשראי והדפסת צ'קים.",
    status: "planned",
    icon: CreditCard,
  },
  {
    id: "reporting",
    title: "דוחות פיננסיים (Reporting)",
    description:
      "מאזן, מאזן בוחן, דוח רווח והפסד (P&L), תזרים מזומנים ודוחות גיול חובות.",
    status: "planned",
    icon: PieChart,
  },
  {
    id: "tax",
    title: "דיווח לרשויות",
    description:
      "הפקת קבצים למס הכנסה ומע\"מ (דוח PCN874, ניכוי במקור ומקדמות).",
    status: "planned",
    icon: Landmark,
  },
  {
    id: "card-recon",
    title: "התאמות כרטיסים",
    description:
      "משטח התאמות ספקים ולקוחות – קישור בין חשבוניות קבלן לתשלומים בפועל.",
    status: "planned",
    icon: UsersRound,
  },
]

export default function RoadmapPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-10 p-6 md:p-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          מפת דרכים - Holden ERP
        </h1>
        <p className="text-lg text-slate-500 dark:text-slate-400">
          מעקב אחר פיתוח המודולים הפיננסיים והתפעוליים במערכת
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {roadmapItems.map((item) => {
          const Icon = item.icon
          const isCompleted = item.status === "completed"
          const isInProgress = item.status === "in-progress"

          const cardClass = isCompleted
            ? "border-emerald-100 bg-emerald-50/50 shadow-sm dark:border-emerald-900/40 dark:bg-emerald-950/30"
            : isInProgress
              ? "border-amber-100 bg-amber-50/40 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20"
              : "border-slate-200 bg-white shadow-sm hover:shadow-md dark:border-slate-700 dark:bg-slate-950"

          const iconWrapClass = isCompleted
            ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400"
            : isInProgress
              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400"
              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"

          const titleClass = isCompleted
            ? "text-emerald-900 dark:text-emerald-100"
            : isInProgress
              ? "text-amber-900 dark:text-amber-100"
              : "text-slate-800 dark:text-slate-100"

          const descClass = isCompleted
            ? "text-emerald-700/80 dark:text-emerald-300/90"
            : isInProgress
              ? "text-amber-800/80 dark:text-amber-200/90"
              : "text-slate-500 dark:text-slate-400"

          return (
            <div
              key={item.id}
              className={`relative overflow-hidden rounded-2xl border p-6 transition-all ${cardClass}`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`shrink-0 rounded-xl p-3 ${iconWrapClass}`}
                >
                  <Icon className="h-6 w-6" />
                </div>

                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className={`text-lg font-semibold ${titleClass}`}>
                      {item.title}
                    </h3>
                    {isCompleted ? (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:bg-emerald-900/60 dark:text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        הושלם
                      </span>
                    ) : isInProgress ? (
                      <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
                        <Clock className="h-3.5 w-3.5" />
                        בפיתוח
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        <CircleDashed className="h-3.5 w-3.5" />
                        בתכנון
                      </span>
                    )}
                  </div>
                  <p className={`text-sm leading-relaxed ${descClass}`}>
                    {item.description}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
