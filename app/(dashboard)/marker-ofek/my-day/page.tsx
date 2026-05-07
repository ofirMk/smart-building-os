/**
 * Phase 9 Step 1 — "My Day" Daily Operating System dashboard.
 *
 * המסך שמסביב לו תוכננה Phase 9: ברגע שה-CEO פותח בוקר את המערכת — לא הוא
 * צריך "לחפש" את הפרויקטים, אלא ה-ERP מציג לו את היום שלו (פגישות + מיילים)
 * ומקשר כל פריט לישות עסקית רלוונטית. ה-Step הזה הוא mock-only —
 * 1. ה-DB schema (`erp_user_integrations` + `erp_communications_cache`) קיים.
 * 2. ה-OAuth flow + Graph delta-sync יחוברו ב-Step 2/3.
 *
 * המסך עצמו הוא Client Component (mock state בלבד) כדי לאפשר ל-`Connect`
 * להפעיל toast מיידי, ולסמן בעתיד "loading" ב-skeleton state.
 */

"use client"

import { useMemo, useState } from "react"
import {
  CalendarClock,
  CheckCircle2,
  Inbox,
  Mail,
  MapPin,
  Paperclip,
  Plug,
  Sparkles,
  Sun,
  Users as UsersIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Mock data — מדמה תוצר של ה-Graph delta-sync worker (Step 3).
// כל הפריטים מתויגים ב-AI tag כשה-context-linker מצמיד אותם לישות עסקית.
// ---------------------------------------------------------------------------

type AgendaItem = {
  id: string
  startsAt: string // ISO
  endsAt: string
  title: string
  location: string
  attendees: string[]
  linkedProject: string | null
  aiBrief: string | null
}

type InboxItem = {
  id: string
  receivedAt: string
  senderName: string
  senderEmail: string
  subject: string
  preview: string
  isUnread: boolean
  hasAttachments: boolean
  /** Step 3: ה-AI יסמן רק כש-link_confidence ≥ 0.6. */
  aiLink: { entityType: "PROJECT" | "PURCHASE_ORDER" | "SUPPLIER"; label: string } | null
}

const TODAY = new Date()

function todayAt(hour: number, minute = 0): string {
  const d = new Date(TODAY)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

const MOCK_AGENDA: AgendaItem[] = [
  {
    id: "evt-1",
    startsAt: todayAt(9, 30),
    endsAt: todayAt(10, 15),
    title: "סטטוס שבועי — מגדל רמת גן צפון",
    location: "Microsoft Teams",
    attendees: ["דני אופק", "רונית לוי", 'קב"מ ביצוע'],
    linkedProject: "פרויקט: מגדל רמת גן צפון",
    aiBrief:
      "3 הזמנות רכש פתוחות, 2 חשבוניות ממתינות לאישור 3-Way Match. שאל את רונית על איחור באספקת ברזל.",
  },
  {
    id: "evt-2",
    startsAt: todayAt(13, 0),
    endsAt: todayAt(13, 45),
    title: "הצגת תקציב Q3 — דירקטוריון",
    location: "חדר ישיבות גדול, קומה 4",
    attendees: ['יו"ר', 'מנכ"לית', 'סמנכ"ל כספים'],
    linkedProject: null,
    aiBrief: null,
  },
]

const MOCK_INBOX: InboxItem[] = [
  {
    id: "mail-1",
    receivedAt: todayAt(7, 12),
    senderName: "אבי שטרן",
    senderEmail: "avi@steel-works.co.il",
    subject: "עדכון לוז אספקת ברזל — מגדל רמת גן",
    preview:
      "שלום, בעקבות העיכוב בנמל אנו צופים דחייה של 3 ימי עסקים באספקת ברזל הזיון לקומה 7...",
    isUnread: true,
    hasAttachments: true,
    aiLink: { entityType: "PROJECT", label: "מגדל רמת גן צפון" },
  },
  {
    id: "mail-2",
    receivedAt: todayAt(8, 4),
    senderName: "מערכת מרקר אופק",
    senderEmail: "no-reply@marker-ofek.system",
    subject: 'הזמנת רכש PO-2026-0184 ממתינה לאישור מנכ"ל',
    preview:
      "סכום הזמנה: 187,400 ₪. חריגה של 14% ממחיר ייחוס. דרושה התערבותך.",
    isUnread: true,
    hasAttachments: false,
    aiLink: { entityType: "PURCHASE_ORDER", label: "PO-2026-0184" },
  },
  {
    id: "mail-3",
    receivedAt: todayAt(8, 47),
    senderName: "שרון כהן",
    senderEmail: "sharon@cohen-electric.com",
    subject: "הצעת מחיר — לוחות חשמל ראשיים",
    preview:
      "מצורפת הצעת המחיר המעודכנת בעקבות שיחתנו. תוקף 14 יום, תשלום שוטף+45.",
    isUnread: false,
    hasAttachments: true,
    aiLink: { entityType: "SUPPLIER", label: "כהן חשמל בע״מ" },
  },
  {
    id: "mail-4",
    receivedAt: todayAt(9, 5),
    senderName: "Microsoft 365",
    senderEmail: "calendar-notifications@microsoft.com",
    subject: "תזכורת: סטטוס שבועי — מגדל רמת גן צפון בעוד 25 דק׳",
    preview: "Microsoft Teams Meeting · ההצטרפות תהיה אפשרית 5 דק׳ לפני",
    isUnread: false,
    hasAttachments: false,
    aiLink: null,
  },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MyDayPage() {
  const [isConnecting, setIsConnecting] = useState(false)

  const greeting = useMemo(() => {
    const h = new Date().getHours()
    if (h < 12) return "בוקר טוב"
    if (h < 17) return "אחר צהריים טובים"
    return "ערב טוב"
  }, [])

  const dateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("he-IL", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(TODAY),
    []
  )

  function handleConnectOutlook() {
    // Step 2 — יוחלף בקריאה ל-/api/integrations/microsoft/connect שמתחיל
    // OAuth flow מול Entra ID. כרגע רק UX preview ל-CEO בדמו המשקיעים.
    setIsConnecting(true)
    toast.info("חיבור Microsoft 365 — בקרוב", {
      description:
        "נתיב ה-OAuth מול Entra ID יופעל ב-Step 2. הסכמה: Mail.Read, Calendars.Read, offline_access.",
      duration: 5000,
    })
    setTimeout(() => setIsConnecting(false), 1200)
  }

  return (
    <div dir="rtl" className="space-y-6 p-6">
      {/* Header */}
      <header className="flex flex-col gap-2 border-b pb-4">
        <div className="flex items-center gap-2 text-amber-600">
          <Sun className="h-6 w-6" aria-hidden />
          <span className="text-sm font-medium uppercase tracking-wider">
            My Day
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          {greeting}, אופק
        </h1>
        <p className="text-sm text-muted-foreground">{dateLabel}</p>
      </header>

      {/* 3-column grid (RTL):
          col-1 (rightmost): Agenda
          col-2 (middle):    Smart Inbox
          col-3 (leftmost):  AI Assistant + Connect CTA */}
      <div className="grid gap-6 lg:grid-cols-3">
        <AgendaColumn items={MOCK_AGENDA} />
        <InboxColumn items={MOCK_INBOX} />
        <AssistantColumn
          isConnecting={isConnecting}
          onConnect={handleConnectOutlook}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Column 1 — Agenda
// ---------------------------------------------------------------------------

function AgendaColumn({ items }: { items: AgendaItem[] }) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-emerald-600" aria-hidden />
            לוח זמנים — היום
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {items.length} פגישות
          </Badge>
        </div>
        <CardDescription>
          סנכרון מ-Outlook Calendar (mock — Phase 9 Step 3)
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        {items.map((evt) => (
          <AgendaCard key={evt.id} event={evt} />
        ))}
      </CardContent>
    </Card>
  )
}

function AgendaCard({ event }: { event: AgendaItem }) {
  const start = new Date(event.startsAt)
  const end = new Date(event.endsAt)
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("he-IL", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(d)

  return (
    <div className="rounded-lg border border-border bg-card p-3 transition-colors hover:border-emerald-300">
      <div className="mb-1 flex items-center gap-2 text-xs font-medium text-emerald-700">
        <span>{fmt(start)}</span>
        <span aria-hidden>→</span>
        <span>{fmt(end)}</span>
      </div>
      <h3 className="mb-2 text-sm font-semibold leading-snug">{event.title}</h3>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3 w-3" aria-hidden />
          {event.location}
        </span>
        <span className="inline-flex items-center gap-1">
          <UsersIcon className="h-3 w-3" aria-hidden />
          {event.attendees.length} משתתפים
        </span>
      </div>
      {event.linkedProject ? (
        <div className="mt-2">
          <Badge
            variant="outline"
            className="border-emerald-200 bg-emerald-50 text-[11px] text-emerald-800"
          >
            <Sparkles className="me-1 h-3 w-3" aria-hidden />
            {event.linkedProject}
          </Badge>
        </div>
      ) : null}
      {event.aiBrief ? (
        <div className="mt-2 rounded-md border border-emerald-100 bg-emerald-50/50 p-2 text-[11px] leading-relaxed text-emerald-900">
          <span className="me-1 font-semibold">תקציר AI:</span>
          {event.aiBrief}
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Column 2 — Smart Inbox
// ---------------------------------------------------------------------------

function InboxColumn({ items }: { items: InboxItem[] }) {
  const unreadCount = items.filter((it) => it.isUnread).length
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Inbox className="h-4 w-4 text-sky-600" aria-hidden />
            תיבה חכמה
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {unreadCount} חדשות
          </Badge>
        </div>
        <CardDescription>
          סנכרון מ-Outlook + הצמדה ע״י סוכן ההקשר
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-2">
        {items.map((mail) => (
          <InboxCard key={mail.id} mail={mail} />
        ))}
      </CardContent>
    </Card>
  )
}

function InboxCard({ mail }: { mail: InboxItem }) {
  const time = new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(mail.receivedAt))

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors hover:border-sky-300",
        mail.isUnread
          ? "border-sky-200 bg-sky-50/50"
          : "border-border bg-card"
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span
          className={cn(
            "truncate text-xs",
            mail.isUnread ? "font-semibold text-foreground" : "text-muted-foreground"
          )}
        >
          {mail.senderName}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{time}</span>
      </div>
      <h3
        className={cn(
          "mb-1 line-clamp-1 text-sm leading-snug",
          mail.isUnread ? "font-semibold" : "font-normal"
        )}
      >
        {mail.subject}
      </h3>
      <p className="line-clamp-2 text-xs text-muted-foreground">{mail.preview}</p>
      <div className="mt-2 flex items-center gap-2">
        {mail.aiLink ? (
          <Badge
            variant="outline"
            className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-800"
          >
            <Sparkles className="me-1 h-3 w-3" aria-hidden />
            {linkLabel(mail.aiLink.entityType)}: {mail.aiLink.label}
          </Badge>
        ) : null}
        {mail.hasAttachments ? (
          <Paperclip
            className="h-3 w-3 text-muted-foreground"
            aria-label="קובץ מצורף"
          />
        ) : null}
      </div>
    </div>
  )
}

type AiLinkEntityType = NonNullable<InboxItem["aiLink"]>["entityType"]

function linkLabel(t: AiLinkEntityType): string {
  switch (t) {
    case "PROJECT":
      return "פרויקט"
    case "PURCHASE_ORDER":
      return "הזמנת רכש"
    case "SUPPLIER":
      return "ספק"
    default:
      return ""
  }
}

// ---------------------------------------------------------------------------
// Column 3 — AI Assistant + Connect CTA
// ---------------------------------------------------------------------------

function AssistantColumn({
  isConnecting,
  onConnect,
}: {
  isConnecting: boolean
  onConnect: () => void
}) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-violet-600" aria-hidden />
          עוזר ההקשר
        </CardTitle>
        <CardDescription>
          הפעל את החיבור ל-Microsoft 365 כדי שהעוזר יבנה לך תקציר יומי אישי
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-4">
        <div className="space-y-3">
          <div className="rounded-lg border border-violet-100 bg-violet-50/40 p-3">
            <p className="text-xs leading-relaxed text-violet-900">
              <span className="font-semibold">מה אקבל אחרי החיבור?</span>
              <br />
              סנכרון אוטומטי של מיילים ופגישות, הצמדה לישויות עסקיות
              (פרויקטים, הזמנות רכש, ספקים), והתראה חכמה כשמשהו דורש את
              תשומת לבך.
            </p>
          </div>

          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li className="flex items-start gap-2">
              <CheckCircle2
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600"
                aria-hidden
              />
              קריאה בלבד (Read-only) — אנחנו לא שולחים מיילים בשמך
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600"
                aria-hidden
              />
              הנתונים שלך מבודדים ב-RLS — רק אתה רואה את התיבה שלך
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600"
                aria-hidden
              />
              ניתן לנתק בלחיצה אחת בכל רגע
            </li>
          </ul>
        </div>

        <Button
          size="lg"
          className="w-full gap-2"
          onClick={onConnect}
          disabled={isConnecting}
        >
          {isConnecting ? (
            <>
              <Plug className="h-4 w-4 animate-pulse" aria-hidden />
              מחבר...
            </>
          ) : (
            <>
              <Mail className="h-4 w-4" aria-hidden />
              חבר את Microsoft 365 Outlook
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
