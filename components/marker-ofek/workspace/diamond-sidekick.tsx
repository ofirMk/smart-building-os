"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { ExternalLink, Globe, Mail, MessageCircle, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { titleForPath } from "@/lib/marker-ofek/route-page-title"
import { cn } from "@/lib/utils"

import { useSmartWorkspace } from "./smart-workspace-context"

function contextualMailto(pathname: string): { subject: string; body: string } {
  const page = titleForPath(pathname)
  if (pathname.includes("/procurement/") && pathname.includes("suppliers")) {
    return {
      subject: "עדכון תאימות מס — ספק",
      body: "שלום,\n\nמצורף עדכון לגבי תאימות המס והתאמות רכש במערכת Marker Ofek.\n\nבברכה,",
    }
  }
  if (pathname.includes("/procurement/orders")) {
    return {
      subject: "הזמנת רכש לאישור",
      body: "שלום,\n\nמבקשים לאשר הזמנת רכש הקשורה למסך הנוכחי במערכת.\n\nבברכה,",
    }
  }
  return {
    subject: `עדכון — ${page}`,
    body: `שלום,\n\nקשור למסך: ${page}.\n\nבברכה,`,
  }
}

export function DiamondSidekick() {
  const pathname = usePathname() ?? ""
  const ws = useSmartWorkspace()
  const [browserUrl, setBrowserUrl] = React.useState("")
  const [iframeKey, setIframeKey] = React.useState(0)

  const open = Boolean(ws?.sidePanelOpen)
  const homepage = ws?.defaultBrowserHomepage ?? "https://www.gov.il/he/service/companies-registry"
  const browserEnabled = ws?.browserPanelEnabled !== false
  const bridgeEmail = ws?.emailBridgeSso?.trim() ?? ""
  const bookmarks = ws?.browserBookmarks ?? []

  React.useEffect(() => {
    if (open) setBrowserUrl((u) => u || homepage)
  }, [open, homepage])

  const iframeSrc = React.useMemo(() => {
    if (typeof window === "undefined") return ""
    const target = browserUrl.trim() || homepage
    if (!target) return ""
    if (target.startsWith("http://") || target.startsWith("https://")) return target
    return `https://${target}`
  }, [browserUrl, homepage])

  if (!pathname.startsWith("/marker-ofek") || !ws) return null

  const { setSidePanelOpen, setDefaultBrowserHomepage } = ws
  const draft = contextualMailto(pathname)
  const mailHref = bridgeEmail
    ? `mailto:${bridgeEmail}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`
    : `mailto:?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`

  function resolveBookmarkHref(href: string): string {
    const t = href.trim()
    if (t.startsWith("http://") || t.startsWith("https://")) return t
    if (typeof window !== "undefined") {
      const path = t.startsWith("/") ? t : `/${t}`
      return `${window.location.origin}${path}`
    }
    return t
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.aside
          key="sidekick"
          dir="rtl"
          initial={{ x: "100%", opacity: 0.85 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 34 }}
          className={cn(
            "fixed inset-y-0 start-0 z-[60] flex w-[min(100vw,420px)] flex-col border-e border-slate-200 bg-card shadow-xl print:hidden"
          )}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <p className="text-[13px] font-semibold text-foreground">Diamond Sidekick</p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="סגור פאנל"
              onClick={() => setSidePanelOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
            <section className="rounded-xl border border-slate-100 bg-background/80 p-3">
              <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-slate-800">
                <MessageCircle className="size-4 text-emerald-600" />
                WhatsApp
              </div>
              <p className="mb-2 text-[11px] leading-relaxed text-slate-600">
                WhatsApp Web אינו נטען בתוך מסגרת מאובטחת (חסימת X-Frame). פתיחה בחלון
                נפרד — ללא יציאה מהמערכת לצורך העתקת הודעות.
              </p>
              <Link
                href="https://web.whatsapp.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-card px-3 text-[12px] font-medium text-slate-800 shadow-sm hover:bg-background"
              >
                <ExternalLink className="size-3.5" />
                פתיחת WhatsApp Web
              </Link>
            </section>

            <section className="rounded-xl border border-slate-100 bg-card p-3">
              <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-slate-800">
                <Mail className="size-4 text-indigo-700" />
                EmailBridge (SSO)
              </div>
              {bridgeEmail ? (
                <p className="mb-2 font-mono text-[10px] text-slate-500" dir="ltr">
                  מקושר ל־{bridgeEmail}
                </p>
              ) : null}
              <p className="mb-2 text-[11px] text-slate-600">
                טיוטה לפי המסך הפעיל. OAuth ל-Gmail/Outlook יתווסף בשלב הבא.
              </p>
              <a
                href={mailHref}
                className="inline-flex h-9 w-full items-center justify-center rounded-md bg-indigo-950 px-3 text-[12px] font-medium text-white hover:bg-indigo-900"
              >
                פתיחה בלקוח דוא״ל
              </a>
            </section>

            {browserEnabled ? (
              <section className="flex min-h-[240px] flex-1 flex-col rounded-xl border border-slate-100 bg-card p-3">
                <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-slate-800">
                  <Globe className="size-4 text-sky-600" />
                  דפדפן פנימי
                </div>
                {bookmarks.length > 0 ? (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {bookmarks.map((b) => (
                      <Button
                        key={`${b.label}-${b.href}`}
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 border-slate-200 px-2 text-[10px] font-medium text-slate-700"
                        onClick={() => {
                          const url = resolveBookmarkHref(b.href)
                          setBrowserUrl(url)
                          setIframeKey((k) => k + 1)
                        }}
                      >
                        {b.label}
                      </Button>
                    ))}
                  </div>
                ) : null}
                <div className="mb-2 flex gap-1">
                  <Input
                    dir="ltr"
                    className="h-8 font-mono text-[11px]"
                    placeholder="https://..."
                    value={browserUrl}
                    onChange={(e) => setBrowserUrl(e.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-8 shrink-0"
                    onClick={() => {
                      setIframeKey((k) => k + 1)
                      if (browserUrl.trim()) setDefaultBrowserHomepage(browserUrl.trim())
                    }}
                  >
                    טען
                  </Button>
                </div>
                <div className="relative min-h-[200px] flex-1 overflow-hidden rounded-lg border border-slate-200 bg-background">
                  {iframeSrc ? (
                    <iframe
                      key={iframeKey}
                      title="דפדפן פנימי"
                      src={iframeSrc}
                      className="size-full min-h-[200px] bg-card"
                      sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin"
                      referrerPolicy="no-referrer"
                    />
                  ) : null}
                </div>
                <p className="mt-1 text-[10px] text-slate-500">
                  חלק מהאתרים חוסמים iframe; במקרה כזה השתמשו בקישור חיצוני.
                </p>
              </section>
            ) : (
              <p className="text-[11px] text-slate-500">דפדפן פנימי מושבת למשתמש זה.</p>
            )}
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  )
}

export function DiamondSidekickToggle() {
  const pathname = usePathname() ?? ""
  const ws = useSmartWorkspace()
  if (!pathname.startsWith("/marker-ofek") || !ws) return null
  const { sidePanelOpen, setSidePanelOpen } = ws
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        "hidden h-9 border-slate-200 text-[11px] sm:inline-flex",
        sidePanelOpen && "border-indigo-300 bg-indigo-50 text-indigo-950"
      )}
      onClick={() => setSidePanelOpen(!sidePanelOpen)}
    >
      Sidekick
    </Button>
  )
}
