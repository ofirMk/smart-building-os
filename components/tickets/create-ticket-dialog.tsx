"use client"

import * as React from "react"
import { useTransition } from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { createTicket } from "@/app/(dashboard)/tickets/actions"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { BuildingOption } from "@/lib/buildings"
import { cn } from "@/lib/utils"

const PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: "P1", label: "P1 (קריטי)" },
  { value: "P2", label: "P2 (גבוה)" },
  { value: "P3", label: "P3 (רגיל)" },
  { value: "P4", label: "P4 (תכנון)" },
]

type CreateTicketDialogProps = {
  buildings: BuildingOption[]
  buildingsError: string | null
  /** טקסט כפתור הפתיחה */
  triggerLabel?: string
  /** מחלקות נוספות לכפתור הפתיחה (למשל גרדיאנט) */
  triggerClassName?: string
  /** גודל כפתור */
  triggerSize?: "default" | "sm" | "lg"
}

export function CreateTicketDialog({
  buildings,
  buildingsError,
  triggerLabel = "קריאה חדשה",
  triggerClassName,
  triggerSize = "default",
}: CreateTicketDialogProps) {
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = useTransition()
  const [buildingId, setBuildingId] = React.useState(
    () => buildings[0]?.id ?? ""
  )
  const [priority, setPriority] = React.useState("P3")

  React.useEffect(() => {
    if (open) {
      setBuildingId(buildings[0]?.id ?? "")
      setPriority("P3")
    }
  }, [open, buildings])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    fd.set("building_id", buildingId)
    fd.set("priority", priority)

    startTransition(async () => {
      const result = await createTicket(fd)
      if (result.ok) {
        toast.success("הקריאה נפתחה בהצלחה")
        setOpen(false)
        form.reset()
        setPriority("P3")
        setBuildingId(buildings[0]?.id ?? "")
      } else {
        toast.error(result.error)
      }
    })
  }

  const canSubmit = buildings.length > 0 && Boolean(buildingId) && !pending

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={cn(
          buttonVariants({ variant: "default", size: triggerSize }),
          "gap-2",
          triggerClassName
        )}
      >
        <Plus className="size-4" aria-hidden />
        {triggerLabel}
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-lg"
        showCloseButton
        dir="rtl"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>פתיחת קריאה חדשה</DialogTitle>
            <DialogDescription>
              מלאו את פרטי הקריאה. לאחר השמירה היא תופיע ברשימה עם סטטוס פתוח.
            </DialogDescription>
          </DialogHeader>

          {buildingsError ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-start text-xs text-destructive"
            >
              לא ניתן לטעון רשימת בניינים: {buildingsError}
            </div>
          ) : null}

          <FieldGroup className="gap-8">
            <Field>
              <FieldLabel htmlFor="ticket-title">נושא</FieldLabel>
              <FieldContent>
                <Input
                  id="ticket-title"
                  name="title"
                  required
                  maxLength={500}
                  placeholder="תיאור קצר של הבעיה או הבקשה"
                  autoComplete="off"
                  disabled={pending}
                />
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel htmlFor="ticket-description">תיאור</FieldLabel>
              <FieldContent>
                <Textarea
                  id="ticket-description"
                  name="description"
                  rows={4}
                  placeholder="פירוט, מיקום בבניין, הערות נוספות…"
                  disabled={pending}
                />
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel htmlFor="ticket-priority">עדיפות</FieldLabel>
              <FieldContent>
                <Select
                  value={priority}
                  onValueChange={(v) => setPriority(v ?? "P3")}
                  disabled={pending}
                >
                  <SelectTrigger
                    id="ticket-priority"
                    className="w-full min-w-0"
                    size="default"
                  >
                    <SelectValue placeholder="בחרו עדיפות" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel htmlFor="ticket-building">בניין</FieldLabel>
              <FieldContent>
                <Select
                  value={buildingId}
                  onValueChange={(v) => setBuildingId(v ?? "")}
                  disabled={pending || buildings.length === 0}
                >
                  <SelectTrigger
                    id="ticket-building"
                    className="w-full min-w-0"
                    size="default"
                  >
                    <SelectValue placeholder="בחרו בניין" />
                  </SelectTrigger>
                  <SelectContent diamondHref="/buildings">
                    {buildings.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
          </FieldGroup>

          <div className="flex flex-row flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-4">
            <DialogClose
              render={
                <Button variant="outline" type="button" disabled={pending} />
              }
            >
              ביטול
            </DialogClose>
            <Button type="submit" disabled={!canSubmit}>
              {pending ? "שולחים…" : "פתיחת קריאה"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
