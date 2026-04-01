import { BuildingsGrid } from "@/components/buildings/buildings-grid"
import { getBuildingsWithCounts } from "@/lib/buildings"

export async function BuildingsContent() {
  const { data, error } = await getBuildingsWithCounts()

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-4 text-start"
      >
        <p className="text-sm font-semibold text-destructive">
          לא ניתן לטעון את רשימת הבניינים
        </p>
        <p className="mt-1 text-xs text-destructive/90">{error}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          ודאו שמפתח ה־anon מוגדר, ושמדיניות ה־RLS מאפשרת קריאה לטבלאות{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem]">
            buildings
          </code>
          ,{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem]">
            apartments
          </code>{" "}
          ו־
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem]">
            parking_spots
          </code>{" "}
          (למניה מוטמעת).
        </p>
      </div>
    )
  }

  return <BuildingsGrid buildings={data ?? []} />
}
