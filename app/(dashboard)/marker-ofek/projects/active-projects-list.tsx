"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { Loader2, Receipt, Trash2, LogIn } from "lucide-react"
import { toast } from "sonner"

import { deleteProject } from "./actions/project-actions"
import { Button } from "@/components/ui/button"
import { buttonVariants } from "@/components/ui/button-variants"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { MarkerOfekProjectRow } from "@/types/marker-ofek"
import { cn, formatError } from "@/lib/utils"

export type ActiveProjectRow = Pick<
  MarkerOfekProjectRow,
  "id" | "internal_project_code" | "name" | "client_name" | "status" | "created_at"
>

export function ActiveProjectsList({ projects }: { projects: ActiveProjectRow[] }) {
  const router = useRouter()
  const [deleteOpenId, setDeleteOpenId] = React.useState<string | null>(null)
  const [isDeletePending, startDeleteTransition] = React.useTransition()

  function confirmDelete(projectId: string) {
    startDeleteTransition(async () => {
      try {
        const res = await deleteProject(projectId)
        if (!res.ok) {
          toast.error(res.error)
          return
        }
        toast.success("הפרויקט נמחק מהרשימה")
        setDeleteOpenId(null)
        router.refresh()
      } catch (e) {
        toast.error(formatError(e))
      }
    })
  }

  return (
    <ul className="divide-y divide-border/60 rounded-lg border border-border/50">
      {projects.map((p) => (
        <li key={p.id}>
          <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1 text-start">
              <p className="font-medium text-foreground">{p.name}</p>
              <p className="text-xs text-muted-foreground">
                {p.internal_project_code}
                {p.client_name?.trim()
                  ? ` · לקוח: ${p.client_name.trim()}`
                  : ""}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <span className="rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-xs capitalize text-muted-foreground">
                {p.status}
              </span>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 border-t border-border/40 pt-3 sm:border-t-0 sm:pt-0">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs"
                render={<Link href={`/marker-ofek/projects/${p.id}`} />}
              >
                <LogIn className="size-3.5" aria-hidden />
                כניסה לפרויקט
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 gap-1.5 text-xs"
                render={
                  <Link
                    href={`/marker-ofek/execution/progress-reports/new?projectId=${encodeURIComponent(p.id)}`}
                  />
                }
              >
                <Receipt className="size-3.5" aria-hidden />
                הפק חשבון
              </Button>

              <Dialog
                open={deleteOpenId === p.id}
                onOpenChange={(open) => setDeleteOpenId(open ? p.id : null)}
              >
                <DialogTrigger
                  type="button"
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "icon-sm" }),
                    "size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  )}
                  aria-label="מחיקת פרויקט"
                >
                  <Trash2 className="size-4" aria-hidden />
                </DialogTrigger>
                <DialogContent
                  className="sm:max-w-md"
                  dir="rtl"
                  showCloseButton={!isDeletePending}
                >
                  <DialogHeader>
                    <DialogTitle>מחיקת פרויקט</DialogTitle>
                    <DialogDescription className="text-start leading-relaxed">
                      האם אתה בטוח שברצונך למחוק פרויקט זה? כל הנתונים המקושרים
                      יימחקו.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter className="gap-2 sm:justify-start">
                    <DialogClose
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isDeletePending}
                        />
                      }
                    >
                      ביטול
                    </DialogClose>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={isDeletePending}
                      className="gap-2"
                      onClick={() => confirmDelete(p.id)}
                    >
                      {isDeletePending ? (
                        <>
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                          מוחק…
                        </>
                      ) : (
                        "מחק"
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
