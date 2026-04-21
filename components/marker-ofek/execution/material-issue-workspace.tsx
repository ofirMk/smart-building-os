"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Plus, Trash2, Truck } from "lucide-react"
import {
  Controller,
  useFieldArray,
  useForm,
  type SubmitHandler,
} from "react-hook-form"

import { DenseMasterDetailTemplate } from "@/components/layout/DenseMasterDetailTemplate"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  MATERIAL_ISSUE_ISSUED_TO_OPTIONS,
  MATERIAL_ISSUE_MOCK_PROJECTS,
  defaultMaterialIssueFormValues,
  materialIssueFormSchema,
  type MaterialIssueFormInput,
  type MaterialIssueFormOutput,
} from "@/lib/marker-ofek/material-issue-schema"
import { cn } from "@/lib/utils"

const fieldClass =
  "h-8 border-slate-200 bg-card text-sm text-foreground shadow-sm placeholder:text-slate-400 focus-visible:border-emerald-500/40 focus-visible:ring-emerald-500/15"
const labelClass = "text-xs font-semibold text-slate-600"

export function MaterialIssueWorkspace() {
  const defaults = React.useMemo(() => defaultMaterialIssueFormValues(), [])

  const form = useForm<
    MaterialIssueFormInput,
    unknown,
    MaterialIssueFormOutput
  >({
    resolver: zodResolver(materialIssueFormSchema),
    defaultValues: defaults,
    mode: "onChange",
  })

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = form

  const { fields, append, remove } = useFieldArray({ control, name: "lines" })

  const onConfirm: SubmitHandler<MaterialIssueFormOutput> = (data) => {
    console.log("[Material Issue] אשר ניפוק — payload:", data)
  }

  return (
    <form
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      onSubmit={handleSubmit(onConfirm)}
    >
      <DenseMasterDetailTemplate
        dir="rtl"
        className="min-h-0 flex-1 bg-card text-foreground [color-scheme:light]"
        eyebrow="Marker Ofek · ביצוע"
        title="ניפוק ציוד לשטח"
        description="אישור ניפוק חומרים לפרויקט לפי שורות (דמה)."
        leading={<Truck className="size-5 text-slate-700" aria-hidden />}
        backLink={{
          href: "/marker-ofek/dashboard",
          label: "חזרה ללוח בקרה",
        }}
        headerActions={
          <Button
            type="submit"
            size="sm"
            className="h-8 bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            אשר ניפוק
          </Button>
        }
        master={
          <div className="rounded-lg border border-slate-200 bg-card p-3 shadow-sm">
          <div className="flex flex-wrap gap-4">
            <div className="flex min-w-[200px] flex-1 flex-col gap-1">
              <span className={labelClass}>פרויקט</span>
              <Controller
                control={control}
                name="projectId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      className={cn(
                        fieldClass,
                        "w-full",
                        errors.projectId && "border-red-300 ring-1 ring-red-200"
                      )}
                    >
                      <SelectValue placeholder="בחרו פרויקט" />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      {MATERIAL_ISSUE_MOCK_PROJECTS.map((p) => (
                        <SelectItem
                          key={p.id}
                          value={p.id}
                          className="text-start"
                        >
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.projectId ? (
                <p className="text-[11px] text-red-600">
                  {errors.projectId.message}
                </p>
              ) : null}
            </div>

            <div className="flex min-w-[150px] flex-col gap-1">
              <Label htmlFor="mi-issue-date" className={labelClass}>
                תאריך ניפוק
              </Label>
              <Input
                id="mi-issue-date"
                type="date"
                className={cn(
                  fieldClass,
                  errors.issueDate && "border-red-300 ring-1 ring-red-200"
                )}
                {...register("issueDate")}
              />
              {errors.issueDate ? (
                <p className="text-[11px] text-red-600">
                  {errors.issueDate.message}
                </p>
              ) : null}
            </div>

            <div className="flex min-w-[220px] flex-1 flex-col gap-1">
              <span className={labelClass}>נמען ניפוק</span>
              <Controller
                control={control}
                name="issuedTo"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      className={cn(
                        fieldClass,
                        "w-full",
                        errors.issuedTo && "border-red-300 ring-1 ring-red-200"
                      )}
                    >
                      <SelectValue placeholder="בחרו נמען" />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      {MATERIAL_ISSUE_ISSUED_TO_OPTIONS.map((o) => (
                        <SelectItem
                          key={o.id}
                          value={o.id}
                          className="text-start"
                        >
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.issuedTo ? (
                <p className="text-[11px] text-red-600">
                  {errors.issuedTo.message}
                </p>
              ) : null}
            </div>
          </div>
        </div>
        }
        detail={
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto pb-2">
          <div className="rounded-md border border-slate-200 bg-card md:rounded-lg">
          <Table dir="rtl">
            <TableHeader>
              <TableRow className="border-slate-200 hover:bg-transparent">
                <TableHead className="w-[14%] py-2 text-start text-xs font-semibold text-slate-700">
                  מק״ט
                </TableHead>
                <TableHead className="w-[30%] py-2 text-start text-xs font-semibold text-slate-700">
                  תיאור פריט
                </TableHead>
                <TableHead className="w-[16%] py-2 text-start text-xs font-semibold text-slate-700">
                  כמות לניפוק
                </TableHead>
                <TableHead className="w-[32%] py-2 text-start text-xs font-semibold text-slate-700">
                  מיקום יעד
                </TableHead>
                <TableHead className="w-[8%] py-2 text-center text-xs font-semibold text-slate-700">
                  {""}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field, index) => (
                <TableRow
                  key={field.id}
                  className="border-slate-100 hover:bg-background/80"
                >
                  <TableCell className="px-2 py-1.5 align-middle">
                    <Input
                      className={cn(
                        fieldClass,
                        "w-full font-currency-mono text-xs",
                        errors.lines?.[index]?.sku &&
                          "border-red-300 ring-1 ring-red-200"
                      )}
                      {...register(`lines.${index}.sku`)}
                    />
                  </TableCell>
                  <TableCell className="px-2 py-1.5 align-middle">
                    <Input
                      className={cn(
                        fieldClass,
                        "w-full",
                        errors.lines?.[index]?.itemName &&
                          "border-red-300 ring-1 ring-red-200"
                      )}
                      {...register(`lines.${index}.itemName`)}
                    />
                  </TableCell>
                  <TableCell className="px-2 py-1.5 align-middle">
                    <Input
                      inputMode="decimal"
                      className={cn(
                        fieldClass,
                        "h-8 w-24 font-currency-mono tabular-nums",
                        errors.lines?.[index]?.qtyIssued &&
                          "border-red-300 ring-1 ring-red-200"
                      )}
                      {...register(`lines.${index}.qtyIssued`, {
                        setValueAs: (v) => {
                          if (v === "" || v == null) return 0
                          const n =
                            typeof v === "number"
                              ? v
                              : Number(String(v).replace(",", ".").trim())
                          return Number.isFinite(n) ? n : 0
                        },
                      })}
                    />
                  </TableCell>
                  <TableCell className="px-2 py-1.5 align-middle">
                    <Input
                      className={cn(
                        fieldClass,
                        "w-full",
                        errors.lines?.[index]?.targetLocation &&
                          "border-red-300 ring-1 ring-red-200"
                      )}
                      placeholder="למשל: בניין 2, קומה 4"
                      {...register(`lines.${index}.targetLocation`)}
                    />
                  </TableCell>
                  <TableCell className="px-1 py-1.5 align-middle">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 border-slate-200 bg-card"
                      disabled={fields.length <= 1}
                      onClick={() => remove(index)}
                      aria-label="מחק שורה"
                    >
                      <Trash2 className="size-4 opacity-80" aria-hidden />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>

        <div className="flex justify-start">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 border-slate-200 bg-card text-sm"
            onClick={() =>
              append({
                sku: "",
                itemName: "",
                qtyIssued: 1,
                targetLocation: "",
              })
            }
          >
            <Plus className="size-4" aria-hidden />
            הוסף שורה
          </Button>
        </div>

        {errors.lines && typeof errors.lines.message === "string" ? (
          <p className="mt-2 text-[11px] text-red-600">{errors.lines.message}</p>
        ) : null}
          </div>
        }
      />
    </form>
  )
}
