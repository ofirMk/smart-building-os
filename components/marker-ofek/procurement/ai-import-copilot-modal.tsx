"use client"

import * as React from "react"
import { Loader2, Sparkles } from "lucide-react"

import { DrillDownSetupBadge } from "@/components/marker-ofek/drill-down-setup-badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  handleDrillDownQuickSetupKeyDown,
  PROCUREMENT_DRILLDOWN_URLS,
} from "@/lib/marker-ofek/drill-down-f2"
import type { SaveRequiresHumanResolution } from "@/app/(dashboard)/marker-ofek/procurement/ai-import/actions"

type AiCopilotModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  payload: SaveRequiresHumanResolution | null
  onUseGeneralCategory: () => void | Promise<void>
  onConfirmCreateMaster: () => void | Promise<void>
  /** פריט מאסטר חדש תחת קטגוריית «שונות» */
  onAssignToGeneral: () => void | Promise<void>
  onCreateCategory: (name: string, prefix: string) => void | Promise<void>
  isBusy: boolean
}

function productLabel(item: SaveRequiresHumanResolution["item"]): string {
  const n =
    item.normalized_name?.trim() ||
    item.original_name?.trim() ||
    item.makat ||
    "פריט זה"
  return n
}

function copilotConversationalBody(
  payload: SaveRequiresHumanResolution
): React.ReactNode {
  if (payload.issueType === "missing_category") {
    return (
      <>
        <p>
          לא מצאתי התאמה מדויקת בקטלוג לקטגוריה שהוצעה עבור{" "}
          <span className="font-medium text-foreground">
            {productLabel(payload.item)}
          </span>
          {payload.item.category_name_suggested ? (
            <>
              {" "}
              (
              <span className="font-mono text-xs">
                {payload.item.category_name_suggested}
              </span>
              )
            </>
          ) : null}
          .
        </p>
        <p className="text-muted-foreground">
          האם לסווג תחת &quot;שונות&quot;, או ליצור קטגוריה חדשה במסד?
        </p>
      </>
    )
  }
  if (payload.issueType === "new_master_item") {
    return (
      <>
        <p>
          הפריט{" "}
          <span className="font-medium text-foreground">
            {productLabel(payload.item)}
          </span>{" "}
          עדיין לא קיים בקטלוג המאסטרי. נדרשת החלטה לפני יצירת מק״ט פנימי חדש.
        </p>
        <p className="text-muted-foreground">
          לאשר יצירת רשומת מאסטר (עם הקטגוריה המאושרת) ולהמשיך בשמירה?
        </p>
      </>
    )
  }
  return (
    <>
      <p>לא ניתן לטעון את טבלת הקטגוריות מהמסד.</p>
      <p className="text-muted-foreground">{payload.suggestedFix}</p>
    </>
  )
}

export function AiCopilotModal({
  open,
  onOpenChange,
  payload,
  onUseGeneralCategory,
  onConfirmCreateMaster,
  onAssignToGeneral,
  onCreateCategory,
  isBusy,
}: AiCopilotModalProps) {
  const [showNewCategoryForm, setShowNewCategoryForm] = React.useState(false)
  const [newCatName, setNewCatName] = React.useState("")
  const [newCatPrefix, setNewCatPrefix] = React.useState("GEN")

  React.useEffect(() => {
    if (!open) {
      setShowNewCategoryForm(false)
      setNewCatName("")
      setNewCatPrefix("GEN")
    }
  }, [open, payload?.lineIndex, payload?.issueType])

  if (!payload) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md sm:max-w-lg"
        showCloseButton={!isBusy}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-violet-500" aria-hidden />
            עוזר קליטת רכש (מנהל)
          </DialogTitle>
          <p className="text-start text-sm font-medium text-violet-950">
            אופיר, נתקלתי בפריט לא מוכר:{" "}
            <span className="text-foreground">{productLabel(payload.item)}</span>
            . האם ליצור קטגוריה/מק״ט מאסטר חדש או לשייך לקיים?
          </p>
          <div className="space-y-3 pt-1 text-start text-sm text-foreground">
            {copilotConversationalBody(payload)}
          </div>
        </DialogHeader>

        {payload.issueType === "missing_category" &&
        payload.knownCategoryNames &&
        payload.knownCategoryNames.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            קטגוריות במערכת: {payload.knownCategoryNames.join(" · ")}
          </p>
        ) : null}

        {payload.issueType === "missing_category" && showNewCategoryForm ? (
          <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-3">
            <div className="space-y-1.5">
              <Label
                htmlFor="copilot-new-cat-name"
                className="inline-flex flex-wrap items-center gap-2"
              >
                <span>שם קטגוריה</span>
                <DrillDownSetupBadge />
              </Label>
              <Input
                id="copilot-new-cat-name"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="למשל: ציוד בטיחות"
                disabled={isBusy}
                onKeyDown={(e) =>
                  handleDrillDownQuickSetupKeyDown(
                    e,
                    PROCUREMENT_DRILLDOWN_URLS.categorySetup
                  )
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="copilot-new-cat-prefix"
                className="inline-flex flex-wrap items-center gap-2"
              >
                <span>קידומת SKU (אנגלית)</span>
                <DrillDownSetupBadge />
              </Label>
              <Input
                id="copilot-new-cat-prefix"
                value={newCatPrefix}
                onChange={(e) =>
                  setNewCatPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
                }
                placeholder="GEN"
                maxLength={8}
                className="font-mono"
                disabled={isBusy}
                onKeyDown={(e) =>
                  handleDrillDownQuickSetupKeyDown(
                    e,
                    PROCUREMENT_DRILLDOWN_URLS.categorySetup
                  )
                }
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={
                  isBusy ||
                  newCatName.trim().length < 2 ||
                  newCatPrefix.length < 2
                }
                onClick={() =>
                  void onCreateCategory(newCatName.trim(), newCatPrefix.trim())
                }
              >
                {isBusy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null}
                צור והמשך
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isBusy}
                onClick={() => setShowNewCategoryForm(false)}
              >
                ביטול
              </Button>
            </div>
          </div>
        ) : null}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {payload.issueType === "missing_category" && !showNewCategoryForm ? (
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                disabled={isBusy}
                className="w-full sm:w-auto"
                onClick={() => void onUseGeneralCategory()}
              >
                שייך לכללי (&quot;שונות&quot;)
              </Button>
              <Button
                type="button"
                disabled={isBusy}
                className="w-full sm:w-auto"
                onClick={() => setShowNewCategoryForm(true)}
              >
                צור קטגוריה חדשה
              </Button>
            </div>
          ) : null}

          {payload.issueType === "new_master_item" ? (
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={isBusy}
                className="w-full sm:w-auto"
                onClick={() => onOpenChange(false)}
              >
                ביטול
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={isBusy}
                className="w-full sm:w-auto"
                onClick={() => void onAssignToGeneral()}
              >
                שייך לכללי (&quot;שונות&quot;)
              </Button>
              <Button
                type="button"
                disabled={isBusy}
                className="w-full sm:w-auto"
                onClick={() => void onConfirmCreateMaster()}
              >
                {isBusy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null}
                צור פריט מאסטר חדש
              </Button>
            </div>
          ) : null}

          {payload.issueType === "categories_unavailable" ? (
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              הבנתי
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
