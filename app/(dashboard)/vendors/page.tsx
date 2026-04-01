import { VendorsAdmin } from "@/app/(dashboard)/vendors/vendors-admin"
import { getVendorsForAdmin } from "@/lib/vendors"

export const dynamic = "force-dynamic"

export default async function VendorsPage() {
  const { data, error } = await getVendorsForAdmin()

  if (error) {
    return (
      <div
        className="mx-auto w-full max-w-6xl rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-6 text-start"
        dir="rtl"
        role="alert"
      >
        <p className="font-semibold text-destructive">לא ניתן לטעון קבלנים</p>
        <p className="mt-1 text-sm text-destructive/90">{error}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          ודאו שהמיגרציה הוחלה ב-Supabase ושמדיניות ה-RLS מאפשרת גישה לטבלת
          vendors.
        </p>
      </div>
    )
  }

  return <VendorsAdmin vendors={data ?? []} />
}
