"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Loader2, MessageCircle } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { createSupabaseBrowserClient as getSupabaseBrowser } from "@/lib/supabase/browser"
import { cn } from "@/lib/utils"
import type { MoCommentContext } from "@/types/marker-ofek"

type ProfileEmbed = { full_name: string | null; email: string | null }

type CommentRow = {
  id: string
  message: string
  created_at: string
  user_id: string
  profiles: ProfileEmbed | ProfileEmbed[] | null
}

function embedProfile(p: ProfileEmbed | ProfileEmbed[] | null): ProfileEmbed | null {
  if (p == null) return null
  return Array.isArray(p) ? (p[0] ?? null) : p
}

function authorLabel(p: ProfileEmbed | null): string {
  if (!p) return "משתמש"
  const n = p.full_name?.trim()
  if (n) return n
  const e = p.email?.trim()
  if (e) return e.split("@")[0] ?? e
  return "משתמש"
}

const timeFmt = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "short",
  timeStyle: "short",
})

export function useMoCommentPresence(
  projectId: string | null | undefined,
  contextType: MoCommentContext,
  contextIds: string[]
) {
  const [idsWithComments, setIdsWithComments] = React.useState<Set<string>>(
    () => new Set()
  )
  const mountedRef = React.useRef(true)

  React.useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refresh = React.useCallback(async () => {
    if (!projectId || contextIds.length === 0) {
      if (mountedRef.current) setIdsWithComments(new Set())
      return
    }
    const supabase = getSupabaseBrowser()
    const { data, error } = await supabase
      .from("project_comments")
      .select("context_id")
      .eq("project_id", projectId)
      .eq("context_type", contextType)
      .in("context_id", contextIds)

    if (!mountedRef.current) return

    if (error) {
      console.warn("[project_comments] presence", error.message)
      return
    }
    const next = new Set<string>()
    for (const row of data ?? []) {
      const id = (row as { context_id: string | null }).context_id
      if (id) next.add(id)
    }
    setIdsWithComments(next)
  }, [projectId, contextType, contextIds])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  React.useEffect(() => {
    function onGlobal() {
      void refresh()
    }
    window.addEventListener("mo-project-comments-changed", onGlobal)
    return () =>
      window.removeEventListener("mo-project-comments-changed", onGlobal)
  }, [refresh])

  const hasComment = React.useCallback(
    (contextId: string) => idsWithComments.has(contextId),
    [idsWithComments]
  )

  return { hasComment, refresh }
}

export type MoContextCommentButtonProps = {
  projectId: string
  projectName: string
  contextType: MoCommentContext
  contextId: string | null
  contextLabel: string
  hasComment: boolean
  disabled?: boolean
}

export function MoContextCommentButton({
  projectId,
  projectName,
  contextType,
  contextId,
  contextLabel,
  hasComment,
  disabled,
}: MoContextCommentButtonProps) {
  const [open, setOpen] = React.useState(false)
  const [rows, setRows] = React.useState<CommentRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [draft, setDraft] = React.useState("")
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null)
  const mountedRef = React.useRef(true)

  React.useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    const run = async () => {
      const { data } = await getSupabaseBrowser().auth.getUser()
      if (!cancelled) setCurrentUserId(data.user?.id ?? null)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  const loadThread = React.useCallback(async () => {
    if (!contextId || contextType === "general") return
    setLoading(true)
    try {
      const supabase = getSupabaseBrowser()
      const { data, error } = await supabase
        .from("project_comments")
        .select("id, message, created_at, user_id, profiles ( full_name, email )")
        .eq("project_id", projectId)
        .eq("context_type", contextType)
        .eq("context_id", contextId)
        .order("created_at", { ascending: true })
      if (!mountedRef.current) return
      if (error) throw error
      setRows((data as CommentRow[]) ?? [])
    } catch (e) {
      console.error(e)
      if (mountedRef.current) setRows([])
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [projectId, contextType, contextId])

  React.useEffect(() => {
    if (open && contextId) void loadThread()
  }, [open, contextId, loadThread])

  async function send() {
    const text = draft.trim()
    if (!text || !contextId || !currentUserId) return
    setSending(true)
    try {
      const supabase = getSupabaseBrowser()
      const { error } = await supabase.from("project_comments").insert({
        project_id: projectId,
        user_id: currentUserId,
        context_type: contextType,
        context_id: contextId,
        context_label: contextLabel.slice(0, 500),
        message: text,
      })
      if (error) throw error
      setDraft("")
      await loadThread()
      window.dispatchEvent(new Event("mo-project-comments-changed"))
    } catch (e) {
      console.error(e)
    } finally {
      setSending(false)
    }
  }

  if (!contextId || disabled) {
    return (
      <span className="inline-flex size-8 items-center justify-center text-muted-foreground/30">
        <MessageCircle className="size-4" aria-hidden />
      </span>
    )
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={cn(
          "size-8 shrink-0 rounded-full",
          hasComment
            ? "text-sky-600 hover:bg-sky-500/15 hover:text-sky-700"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
        aria-label={`הערות לסעיף ${contextLabel}`}
        onClick={() => setOpen(true)}
      >
        <MessageCircle
          className={cn("size-4", hasComment && "fill-sky-500/25")}
          aria-hidden
        />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 border-border/70 p-0 sm:max-w-md"
          dir="rtl"
        >
          <SheetHeader className="border-b border-border/60 px-4 py-4 text-start">
            <SheetTitle className="text-base">הערות סעיף</SheetTitle>
            <SheetDescription className="text-start">
              {projectName} · {contextLabel}
            </SheetDescription>
          </SheetHeader>

          <AnimatePresence mode="wait">
            <motion.div
              key={loading ? "l" : "c"}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {loading ? (
                  <div className="flex justify-center py-12 text-muted-foreground">
                    <Loader2 className="size-6 animate-spin" aria-hidden />
                  </div>
                ) : rows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    אין הערות עדיין. הוסיפו הערה לצוות (פיקוח, ביצוע, וכו׳).
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {rows.map((r) => {
                      const prof = embedProfile(r.profiles)
                      return (
                        <li
                          key={r.id}
                          className="rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5 text-sm shadow-xs"
                        >
                          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">
                              {authorLabel(prof)}
                            </span>
                            <time dateTime={r.created_at}>
                              {timeFmt.format(new Date(r.created_at))}
                            </time>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap leading-relaxed">
                            {r.message}
                          </p>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              <div className="border-t border-border/60 bg-muted/20 p-3">
                <div className="flex gap-2">
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="כתבו הערה…"
                    className="border-border/70"
                    dir="rtl"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault()
                        void send()
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="shrink-0"
                    disabled={sending || !draft.trim()}
                    onClick={() => void send()}
                  >
                    {sending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      "שליחה"
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </SheetContent>
      </Sheet>
    </>
  )
}
