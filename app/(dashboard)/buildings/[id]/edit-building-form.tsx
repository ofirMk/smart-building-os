"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Building2, Layers, MapPin, Save } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { updateBuilding } from "./actions"
import type { UpdateBuildingInput } from "./actions"
import type { BuildingDetail } from "@/lib/buildings"

const REGIONS = ["מרכז", "ירושלים", "דרום", "צפון", "חיפה", "שפלה", "שרון", "אחר"]

function Field({ label, required, children, hint }: {
  label: string; required?: boolean; children: React.ReactNode; hint?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="mr-1 text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function SectionTitle({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-border/50 pb-4">
      <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-4" aria-hidden />
      </div>
      <h2 className="text-base font-bold tracking-tight">{title}</h2>
    </div>
  )
}

export function EditBuildingForm({ building }: { building: BuildingDetail }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [name, setName]               = useState(building.name)
  const [address1, setAddress1]       = useState(building.address_line1 ?? "")
  const [address2, setAddress2]       = useState(building.address_line2 ?? "")
  const [city, setCity]               = useState(building.city ?? "")
  const [region, setRegion]           = useState(building.region ?? "")
  const [postalCode, setPostalCode]   = useState(building.postal_code ?? "")
  const [totalFloors, setTotalFloors] = useState(building.total_floors?.toString() ?? "")
  const [plannedUnits, setPlannedUnits] = useState(building.planned_units?.toString() ?? "")
  const [yearBuilt, setYearBuilt]     = useState(building.year_built?.toString() ?? "")

  function handleSubmit() {
    const input: UpdateBuildingInput = {
      name, address_line1: address1, address_line2: address2,
      city, region, postal_code: postalCode,
      total_floors:  totalFloors  ? Number(totalFloors)  : null,
      planned_units: plannedUnits ? Number(plannedUnits) : null,
      year_built:    yearBuilt    ? Number(yearBuilt)    : null,
    }
    startTransition(async () => {
      const result = await updateBuilding(building.id, input)
      if (result.ok) {
        toast.success("הבניין עודכן בהצלחה!")
        router.push(`/buildings/${building.id}`)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6" dir="rtl">
      {/* Header */}
      <div>
        <nav className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/buildings" className="hover:text-foreground transition-colors">בניינים</Link>
          <ArrowRight className="size-3.5 rotate-180" aria-hidden />
          <Link href={`/buildings/${building.id}`} className="hover:text-foreground transition-colors">
            {building.name}
          </Link>
          <ArrowRight className="size-3.5 rotate-180" aria-hidden />
          <span className="text-foreground">עריכה</span>
        </nav>
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Building2 className="size-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">עריכת בניין</h1>
            <p className="text-xs text-muted-foreground">{building.name}</p>
          </div>
        </div>
      </div>

      {/* Location section */}
      <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm flex flex-col gap-5">
        <SectionTitle icon={MapPin} title="פרטי הנכס" />
        <Field label="שם הבניין" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="רחוב + מספר">
            <Input placeholder="רחוב הרב קוק 12"
              value={address1} onChange={(e) => setAddress1(e.target.value)} />
          </Field>
          <Field label="כניסה / בניין">
            <Input placeholder="כניסה א"
              value={address2} onChange={(e) => setAddress2(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="עיר" required>
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label="אזור">
            <Select value={region} onValueChange={(v) => { if (v != null) setRegion(v) }}>
              <SelectTrigger><SelectValue placeholder="בחר אזור" /></SelectTrigger>
              <SelectContent>
                {REGIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="מיקוד">
            <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
          </Field>
        </div>
      </div>

      {/* Properties section */}
      <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm flex flex-col gap-5">
        <SectionTitle icon={Layers} title="מאפייני הבניין" />
        <div className="grid grid-cols-3 gap-4">
          <Field label="מספר קומות" hint="כולל קומת קרקע">
            <Input type="number" min="1" max="120" placeholder="14"
              value={totalFloors} onChange={(e) => setTotalFloors(e.target.value)} />
          </Field>
          <Field label="יחידות מתוכנן" hint="סה&quot;כ דירות">
            <Input type="number" min="1" placeholder="84"
              value={plannedUnits} onChange={(e) => setPlannedUnits(e.target.value)} />
          </Field>
          <Field label="שנת בניה" hint="טופס 4">
            <Input type="number" min="1900" max="2030" placeholder="2022"
              value={yearBuilt} onChange={(e) => setYearBuilt(e.target.value)} />
          </Field>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          size="lg"
          render={<Link href={`/buildings/${building.id}`} />}
          disabled={isPending}
        >
          ביטול
        </Button>
        <Button
          size="lg"
          onClick={handleSubmit}
          disabled={isPending || !name.trim() || !city.trim()}
          className={cn("gap-2", isPending && "opacity-70")}
        >
          <Save className="size-4" aria-hidden />
          {isPending ? "שומר..." : "שמור שינויים"}
        </Button>
      </div>
    </div>
  )
}
