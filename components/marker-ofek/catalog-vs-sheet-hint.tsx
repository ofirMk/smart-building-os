"use client"

import { HelpCircle } from "lucide-react"

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type Variant = "catalog" | "tenderBoqSheet" | "wbsCoding"

const COPY: Record<
  Variant,
  { label: string; body: string }
> = {
  catalog: {
    label: "קטלוג מול גיליון",
    body:
      "קטלוג = מבט גלובלי על כל פריטי הארגון (מק״ט מאסטר). גיליון BoQ במכרז = כמויות ומחירים לפרויקט/מכרז ספציפי בלבד, כולל השוואות תמחור.",
  },
  tenderBoqSheet: {
    label: "גיליון מכרז מול קטלוג",
    body:
      "כאן גיליון הכמויות של המכרז הנבחר — לא הקטלוג הגלובלי. הקטלוג נמצא תחת רכש › קטלוג פריטים; משם מגדירים פריטים שאז מקשרים לשורות ולרכש.",
  },
  wbsCoding: {
    label: "מבנה WBS מול גיליון",
    body:
      "במצב קידוד אתם משייכים שורות מכתב כמויות סופי (לא הקטלוג) לקודי שלב. הקטלוג הגלובלי נשאר תחת רכש.",
  },
}

export function CatalogVsSheetHint({ variant }: { variant: Variant }) {
  const c = COPY[variant]
  return (
    <TooltipProvider delay={0}>
      <Tooltip>
        <TooltipTrigger
          type="button"
          aria-label={c.label}
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 outline-none transition-colors",
            "hover:bg-background hover:text-indigo-600 focus-visible:ring-2 focus-visible:ring-indigo-300/40"
          )}
        >
          <HelpCircle className="size-4" aria-hidden />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs border border-slate-100 bg-card text-slate-700 shadow-md">
          <p className="text-xs font-semibold text-[#1e293b]">{c.label}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">{c.body}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
