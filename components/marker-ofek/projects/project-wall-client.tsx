"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Building2, Camera, Loader2, MessageSquare, SendHorizonal } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { createProjectWallPost } from "@/lib/marker-ofek/project-wall-actions"
import {
  PROJECT_WALL_AI_LABELS,
  PROJECT_WALL_TAG_OPTIONS,
  type ProjectWallPostRow,
} from "@/lib/marker-ofek/project-wall-types"
import { cn } from "@/lib/utils"

function formatWallTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("he-IL", {
      dateStyle: "short",
      timeStyle: "short",
    })
  } catch {
    return iso
  }
}

function AiBadge({ category }: { category: ProjectWallPostRow["ai_category"] }) {
  const L = PROJECT_WALL_AI_LABELS[category]
  return (
    <Badge
      variant="outline"
      title={L.he}
      className={cn(
        "shrink-0 border font-mono text-[10px] font-semibold tracking-tight text-slate-900 sm:text-[11px]",
        category === "technical" &&
          "border-slate-400/80 bg-slate-100",
        category === "safety" &&
          "border-amber-400/90 bg-amber-50",
        category === "delay" &&
          "border-rose-400/90 bg-rose-50",
        category === "finance" &&
          "border-emerald-500/80 bg-emerald-50"
      )}
    >
      {L.bracket}
    </Badge>
  )
}

export function ProjectWallClient({
  projectId,
  projectName,
  initialPosts,
  canPost,
}: {
  projectId: string
  projectName: string
  initialPosts: ProjectWallPostRow[]
  canPost: boolean
}) {
  const router = useRouter()
  const [posts, setPosts] = React.useState(initialPosts)
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)
  const [tab, setTab] = React.useState<"text" | "photo">("text")

  React.useEffect(() => {
    setPosts(initialPosts)
  }, [initialPosts])

  async function onSubmit(formData: FormData) {
    setError(null)
    formData.set("project_id", projectId)
    formData.set("post_kind", tab)
    startTransition(async () => {
      const res = await createProjectWallPost(formData)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 pb-20 pt-2 sm:gap-6 sm:pb-16" dir="rtl" lang="he">
      <header className="space-y-3 rounded-2xl border border-slate-200 bg-gradient-to-bl from-slate-50 to-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-700 sm:text-xs sm:tracking-[0.22em]">
          <Building2 className="size-4 text-slate-800" aria-hidden />
          The Box Group
          <span className="text-slate-400">·</span>
          <span className="text-slate-600">Diamond Standard</span>
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            קיר הפרויקט
          </h1>
          <p className="text-sm text-slate-600">{projectName}</p>
          <p className="text-sm leading-relaxed text-slate-500">
            פיד עדכונים מהשטח — חלופה נקייה לווטסאפ. כל פרסום מקבל תגית AI:{" "}
            <span className="font-mono text-[11px] text-slate-700">
              [Technical] · [Safety] · [Delay] · [Back-charge]
            </span>
          </p>
        </div>
      </header>

      {canPost ? (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="text-lg text-slate-900">פרסום עדכון</CardTitle>
            <CardDescription>טקסט או תמונה (אחסון מאובטח) — סיווג AI אוטומטי.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={onSubmit} className="space-y-4">
              <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
                <TabsList className="grid w-full grid-cols-2 bg-slate-100">
                  <TabsTrigger
                    value="text"
                    className="gap-2 text-xs data-[state=active]:bg-slate-900 data-[state=active]:text-white sm:text-sm"
                  >
                    <MessageSquare className="size-4" aria-hidden />
                    טקסט
                  </TabsTrigger>
                  <TabsTrigger
                    value="photo"
                    className="gap-2 text-xs data-[state=active]:bg-slate-900 data-[state=active]:text-white sm:text-sm"
                  >
                    <Camera className="size-4" aria-hidden />
                    תמונה
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="text" className="mt-4 space-y-2">
                  <Label htmlFor="wall-body-text">טקסט חופשי</Label>
                  <Textarea
                    id="wall-body-text"
                    name="text_body"
                    placeholder="לדוגמה: אישור תקרה בקומה 4, ממתינים לבטון…"
                    rows={4}
                    className="resize-y text-start"
                  />
                </TabsContent>
                <TabsContent value="photo" className="mt-4 space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="wall-photo">תמונה</Label>
                    <input
                      id="wall-photo"
                      name="photo"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="block w-full min-h-[44px] text-sm text-slate-600 file:me-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2.5 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wall-photo-cap">כיתוב (מומלץ לסיווג AI)</Label>
                    <Textarea
                      id="wall-photo-cap"
                      name="photo_caption"
                      rows={2}
                      placeholder="תאר מה בתמונה — עוזר לסיווג…"
                      className="resize-y text-start"
                    />
                  </div>
                </TabsContent>
              </Tabs>

              {error ? (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              ) : null}

              <Button
                type="submit"
                disabled={pending}
                className="w-full min-h-[44px] gap-2 bg-slate-900 hover:bg-slate-800 sm:w-auto"
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <SendHorizonal className="size-4" aria-hidden />
                )}
                פרסום לקיר
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-3 text-center text-sm text-slate-600">
          צפייה בלבד — פרסום לקיר זמין למנהלי מערכת, מנהלי נכסים ושותפים מנהלי פרויקט.
        </p>
      )}

      <section aria-labelledby="wall-feed-heading" className="flex min-h-0 flex-1 flex-col gap-3">
        <h2 id="wall-feed-heading" className="text-lg font-semibold text-slate-900">
          ציר זמן
        </h2>
        <ScrollArea className="max-h-[min(85dvh,720px)] rounded-2xl border border-slate-200 bg-white pr-1 shadow-sm sm:rounded-2xl">
          <ul className="flex flex-col gap-3 p-3 sm:p-4">
            {posts.length === 0 ? (
              <li className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center text-sm text-slate-500">
                עדיין אין עדכונים בקיר.{" "}
                {canPost ? "פרסמו את העדכון הראשון — הוא יופיע כאן." : null}
              </li>
            ) : (
              posts.map((p) => (
                <li key={p.id} className="relative ps-3 before:absolute before:start-0 before:top-2 before:h-[calc(100%-0.5rem)] before:w-px before:bg-slate-200 before:content-[''] last:before:hidden">
                  <article className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 shadow-sm">
                    <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 text-start">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {p.author_full_name?.trim() || "משתמש"}
                        </p>
                        <p className="text-xs text-slate-500 tabular-nums">{formatWallTime(p.created_at)}</p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Badge
                          variant="secondary"
                          className="border-slate-200 bg-white text-[10px] font-normal text-slate-700"
                        >
                          {p.post_kind === "text"
                            ? "טקסט"
                            : p.post_kind === "photo"
                              ? "תמונה"
                              : "תגיות"}
                        </Badge>
                        <AiBadge category={p.ai_category} />
                      </div>
                    </div>
                    {p.post_kind === "photo" && p.image_signed_url ? (
                      <div className="mb-3 overflow-hidden rounded-lg border border-slate-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.image_signed_url}
                          alt=""
                          className="max-h-72 w-full object-cover sm:max-h-80"
                        />
                      </div>
                    ) : null}
                    {p.body?.trim() ? (
                      <p className="whitespace-pre-wrap text-start text-sm leading-relaxed text-slate-700">
                        {p.body}
                      </p>
                    ) : null}
                    {p.post_kind === "tags" && p.tag_slugs.length > 0 ? (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {p.tag_slugs.map((slug) => {
                          const opt = PROJECT_WALL_TAG_OPTIONS.find((o) => o.slug === slug)
                          return (
                            <Badge key={slug} variant="outline" className="text-xs font-normal">
                              #{opt?.labelHe ?? slug}
                            </Badge>
                          )
                        })}
                      </ul>
                    ) : null}
                    <p className="mt-2 text-[11px] text-slate-500">
                      סיווג AI · {PROJECT_WALL_AI_LABELS[p.ai_category].he}
                    </p>
                  </article>
                </li>
              ))
            )}
          </ul>
        </ScrollArea>
      </section>
    </div>
  )
}
