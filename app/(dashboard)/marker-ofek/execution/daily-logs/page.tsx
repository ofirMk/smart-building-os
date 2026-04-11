"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { ClipboardList, Save } from "lucide-react"

import {
  DenseMasterDetailTemplate,
  DenseDetailPanel,
  DenseMasterPanel,
  ERP_DENSE_INPUT_CLASS,
  ERP_DENSE_LABEL_CLASS,
} from "@/components/layout/DenseMasterDetailTemplate"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const PROJECTS = [
  { id: "ramat", name: "רמת עיר היין" },
  { id: "gindi", name: "גינדי סביון" },
  { id: "rainbow", name: "ריינבו שדה דב" },
] as const

const WEATHER = ["בהיר", "מעונן חלקית", "גשום קל", "רוח חזקה", "ערפל"] as const

export default function DailyLogsPage() {
  const [projectId, setProjectId] = React.useState<string>(PROJECTS[0].id)
  const [logDate, setLogDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [weather, setWeather] = React.useState<string>(WEATHER[0])
  const [workforce, setWorkforce] = React.useState("42")
  const [completed, setCompleted] = React.useState(
    "השלמת כבלי ראשיים בקומות 3–5; בדיקות אטימה בחדר טרנספורמטורים."
  )
  const [issues, setIssues] = React.useState(
    "עיכוב אספקה למחברים — צפי ספק ליום רביעי. תיאום עם מנהל אתר נשמר."
  )

  return (
    <DenseMasterDetailTemplate
      dir="rtl"
      className="bg-white text-slate-900"
      eyebrow="Lightman · ביצוע"
      title="יומן עבודה יומי — אתר"
      description="דיווח מנהל אתר: מזג אוויר, כוח אדם, ביצועים וחריגים. נתוני דמו בלבד."
      leading={<ClipboardList className="size-5 text-slate-700" aria-hidden />}
      backLink={{ href: "/marker-ofek/command-center", label: "מרכז הפיקוד" }}
      headerActions={
        <Button
          type="button"
          size="sm"
          className="h-8 gap-1.5 px-3 text-xs"
          onClick={() => {
            /* דמו */
          }}
        >
          <Save className="size-3.5" aria-hidden />
          שמור טיוטה
        </Button>
      }
      master={
        <motion.div
          initial={{ opacity: 0.9, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div className="grid gap-1 sm:col-span-2">
            <Label className={ERP_DENSE_LABEL_CLASS}>פרויקט</Label>
            <Select
              value={projectId}
              onValueChange={(v) => {
                if (v) setProjectId(v)
              }}
            >
              <SelectTrigger className={cn(ERP_DENSE_INPUT_CLASS, "bg-white")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECTS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className={ERP_DENSE_LABEL_CLASS}>תאריך</Label>
            <Input
              type="date"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              className={cn(ERP_DENSE_INPUT_CLASS, "bg-white")}
              dir="ltr"
            />
          </div>
          <div className="grid gap-1">
            <Label className={ERP_DENSE_LABEL_CLASS}>מזג אוויר</Label>
            <Select
              value={weather}
              onValueChange={(v) => {
                if (v) setWeather(v)
              }}
            >
              <SelectTrigger className={cn(ERP_DENSE_INPUT_CLASS, "bg-white")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEATHER.map((w) => (
                  <SelectItem key={w} value={w}>
                    {w}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className={ERP_DENSE_LABEL_CLASS}>כוח אדם (ספירה יומית)</Label>
            <Input
              inputMode="numeric"
              value={workforce}
              onChange={(e) => setWorkforce(e.target.value)}
              className={cn(ERP_DENSE_INPUT_CLASS, "tabular-nums bg-white")}
              dir="ltr"
            />
          </div>
        </motion.div>
      }
      detail={
        <DenseDetailPanel className="border-slate-200 bg-white p-3 shadow-sm">
          <div className="grid gap-4">
            <div className="grid gap-1">
              <Label className={ERP_DENSE_LABEL_CLASS}>
                משימות שהושלמו היום
              </Label>
              <Textarea
                value={completed}
                onChange={(e) => setCompleted(e.target.value)}
                rows={5}
                className={cn(
                  "min-h-[7rem] resize-y border-slate-200 bg-white px-2 py-1.5 text-sm leading-relaxed",
                  "transition-shadow duration-200 focus-visible:shadow-sm"
                )}
                placeholder="פירוט ביצועים, יחידות, אזורים באתר…"
              />
            </div>
            <div className="grid gap-1">
              <Label className={ERP_DENSE_LABEL_CLASS}>
                חריגים / עיכובים / סיכונים
              </Label>
              <Textarea
                value={issues}
                onChange={(e) => setIssues(e.target.value)}
                rows={4}
                className={cn(
                  "min-h-[5.5rem] resize-y border-slate-200 bg-white px-2 py-1.5 text-sm leading-relaxed",
                  "transition-shadow duration-200 focus-visible:shadow-sm"
                )}
                placeholder="עיכובי אספקה, רישוי, תיאום קבלנים…"
              />
            </div>
            <p className="text-[11px] text-slate-500">
              שמירה למסד תתווסף בשלב הבא; כרגע הטופס לבדיקות UI בלבד.
            </p>
          </div>
        </DenseDetailPanel>
      }
    />
  )
}
