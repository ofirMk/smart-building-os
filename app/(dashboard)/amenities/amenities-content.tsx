import { AmenitiesGrid } from "@/components/amenities/amenities-grid"
import { AmenityBookingsDataTable } from "@/components/amenities/amenity-bookings-data-table"
import {
  getAmenities,
  getAmenityBookingsWithAmenities,
} from "@/lib/amenities-management"

export async function AmenitiesContent() {
  const [amenitiesRes, bookingsRes] = await Promise.all([
    getAmenities(),
    getAmenityBookingsWithAmenities(),
  ])

  return (
    <div className="flex flex-col gap-10">
      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          מתקנים זמינים
        </h2>
        {amenitiesRes.error ? (
          <div
            role="alert"
            className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-start"
          >
            <p className="text-sm font-semibold text-destructive">
              לא ניתן לטעון את רשימת המתקנים
            </p>
            <p className="mt-1 text-xs text-destructive/90">
              {amenitiesRes.error}
            </p>
          </div>
        ) : null}
        <AmenitiesGrid amenities={amenitiesRes.data} />
      </section>

      <section className="space-y-4 border-t border-border/60 pt-10">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          הזמנות אחרונות ועתידיות
        </h2>
        {bookingsRes.error ? (
          <div
            role="alert"
            className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-start"
          >
            <p className="text-sm font-semibold text-destructive">
              לא ניתן לטעון את הזמנות המתקנים
            </p>
            <p className="mt-1 text-xs text-destructive/90">
              {bookingsRes.error}
            </p>
          </div>
        ) : null}
        <AmenityBookingsDataTable data={bookingsRes.data} />
      </section>
    </div>
  )
}
