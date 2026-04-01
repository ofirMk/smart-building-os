"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, Send } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { createTenantTicket } from "@/app/tenant/tickets/actions"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

const formSchema = z.object({
  title: z.string().min(1, "נא למלא נושא").max(500),
  description: z.string().max(8000).optional(),
  urgency: z.enum(["normal", "urgent", "critical"]),
})

type FormValues = z.infer<typeof formSchema>

const URGENCY_OPTIONS: { value: FormValues["urgency"]; label: string }[] = [
  { value: "normal", label: "רגיל" },
  { value: "urgent", label: "דחוף" },
  { value: "critical", label: "קריטי" },
]

export function TenantNewTicketForm() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      urgency: "normal",
    },
  })

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await createTenantTicket(values)
      if (result.ok) {
        toast.success("הקריאה נפתחה בהצלחה")
        router.push("/tenant/tickets")
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-6"
        noValidate
      >
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>נושא</FormLabel>
              <FormControl>
                <Input
                  placeholder="תיאור קצר של הבעיה או הבקשה"
                  autoComplete="off"
                  disabled={pending}
                  maxLength={500}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>תיאור</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="פירוט, מיקום בדירה, הערות נוספות…"
                  rows={5}
                  disabled={pending}
                  className="min-h-[120px] resize-y"
                  {...field}
                />
              </FormControl>
              <FormDescription className="text-xs">
                שדה אופציונלי — ככל שתפרטו יותר, קל יותר לטפל בקריאה.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="urgency"
          render={({ field }) => (
            <FormItem>
              <FormLabel>עדיפות</FormLabel>
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={pending}
              >
                <FormControl>
                  <SelectTrigger className="w-full min-w-0" size="default">
                    <SelectValue placeholder="בחרו עדיפות" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {URGENCY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          className="h-11 w-full gap-2 text-base"
          disabled={pending}
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              שולחים…
            </>
          ) : (
            <>
              <Send className="size-4" aria-hidden />
              שליחת קריאה
            </>
          )}
        </Button>
      </form>
    </Form>
  )
}
