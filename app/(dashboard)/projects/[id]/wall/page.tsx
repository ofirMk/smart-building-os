import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRight } from "lucide-react"

import { ProjectWallClient } from "@/components/marker-ofek/projects/project-wall-client"
import { getProjectWallBootstrap } from "@/lib/marker-ofek/project-wall-actions"

export default async function ProjectWallPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string }
}) {
  const resolved = await Promise.resolve(params)
  const id = typeof resolved.id === "string" ? resolved.id : ""
  if (!id) notFound()

  const data = await getProjectWallBootstrap(id)
  if (!data.ok) {
    if (data.error === "הפרויקט לא נמצא") notFound()
    return (
      <div
        dir="rtl"
        lang="he"
        className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-slate-600"
      >
        {data.error}
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 bg-background pb-8 pt-2 dark:bg-slate-950" dir="rtl" lang="he">
      <div className="mx-auto w-full max-w-2xl px-3 sm:px-4">
        <Link
          href={`/marker-ofek/projects/${id}`}
          className="mb-4 inline-flex w-fit items-center gap-2 text-sm text-slate-600 transition-colors hover:text-foreground dark:text-slate-400 dark:hover:text-slate-100"
        >
          <ArrowRight className="size-4 rotate-180" aria-hidden />
          חזרה למרכז הפרויקט
        </Link>
      </div>
      <ProjectWallClient
        projectId={id}
        projectName={data.projectName}
        initialPosts={data.posts}
        canPost={data.canPost}
      />
    </div>
  )
}
