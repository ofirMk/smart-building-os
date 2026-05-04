"use client"

/**
 * PoSubmitButton — Phase C (Status transitions in PageHeader)
 * -----------------------------------------------------------
 * כפתור "שלח לאישור" ב-PageHeader של מסך פרט ההזמנה. עד עכשיו הכפתור
 * חי רק בתוך ה-po-approvals-tab — מה שאילץ את המשתמש לעבור טאב כדי
 * להגיש PO. עכשיו הוא זמין מכל טאב.
 *
 * ה-UX:
 *   - מוצג רק כאשר status === "DRAFT" (ה-RPC אוכף את זה; אנחנו מסתירים
 *     ברמת ה-UI כדי לא לבלבל).
 *   - לחיצה פותחת Dialog לאישור כדי למנוע submit מיקרי (הפעולה עלולה
 *     לקפוץ ישר ל-APPROVED אם אין שרשרת אישור לסוג ה-PO).
 *   - הצגת תוצאה מדויקת ב-toast (approvalsCreated או auto-approved).
 *   - ב-loading: disable הכפתור ו-dialog (למנוע double-submit).
 *
 * חוזה ה-endpoint מגיע מ-app/api/procurement/orders/[id]/approvals/submit.
 */

import * as React from "react"
import { Send } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
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
import { masterDataFetch } from "@/lib/erp/master-data-browser"

type SubmitResult = {
  approvalsCreated: number
  newStatus: string | null
}

export function PoSubmitButton({
  poId,
  status,
  onChanged,
}: {
  poId: string
  status: string
  /** מופעל אחרי submit מוצלח — ה-caller צריך לבצע refetch של ה-DTO. */
  onChanged: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)

  // Gate: רק DRAFT רלוונטי. אם השתנה (למשל אחרי refetch) — סגור את ה-dialog.
  React.useEffect(() => {
    if (status !== "DRAFT" && open) setOpen(false)
  }, [status, open])

  if (status !== "DRAFT") return null

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const res = await masterDataFetch<SubmitResult>(
        `/api/procurement/orders/${encodeURIComponent(poId)}/approvals/submit`,
        { method: "POST" }
      )
      if (res.newStatus === "APPROVED") {
        toast.success("ההזמנה אושרה אוטומטית (לא הוגדרה שרשרת אישור)")
      } else {
        toast.success(`הוגשה לאישור — נוצרו ${res.approvalsCreated} רמות`)
      }
      setOpen(false)
      onChanged()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "ההגשה לאישור נכשלה"
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    // span wrapper שעוצר click/dblclick propagation — מונע מה-BentoSmartList
    // להקפיץ onRowClick/onRowDoubleClick כשלוחצים על הכפתור בתוך row action.
    <span
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={(props) => (
            <Button type="button" size="sm" className="gap-2" {...props}>
              <Send className="size-4" aria-hidden />
              שלח לאישור
            </Button>
          )}
        />
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>שליחת ההזמנה לאישור</DialogTitle>
          <DialogDescription>
            פעולה זו תעביר את ההזמנה ממצב טיוטה למסלול אישור פנימי.
            לאחר ההגשה — עריכת ההזמנה תידרש לחזור לטיוטה.
            <br />
            אם לא הוגדרה שרשרת אישור לסוג ההזמנה, היא תאושר אוטומטית.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <DialogClose
            render={(props) => (
              <Button type="button" variant="ghost" disabled={submitting} {...props}>
                ביטול
              </Button>
            )}
          />
          <Button
            type="button"
            disabled={submitting}
            onClick={() => void handleSubmit()}
            className="gap-2"
          >
            <Send className="size-4" aria-hidden />
            {submitting ? "שולח…" : "אישור ושליחה"}
          </Button>
        </DialogFooter>
      </DialogContent>
      </Dialog>
    </span>
  )
}
