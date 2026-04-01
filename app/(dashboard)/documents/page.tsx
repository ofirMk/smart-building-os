import { DocumentsClient } from "@/app/(dashboard)/documents/documents-client"
import { getDocuments } from "@/lib/documents"

export const dynamic = "force-dynamic"

export default async function DocumentsPage() {
  const { data, error } = await getDocuments()

  if (error) {
    return (
      <div
        className="mx-auto w-full max-w-6xl rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-6 text-start"
        dir="rtl"
        role="alert"
      >
        <p className="font-semibold text-destructive">לא ניתן לטעון מסמכים</p>
        <p className="mt-1 text-sm text-destructive/90">{error}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          ודאו שהמיגרציה הוחלה, שה-bucket documents קיים ושמדיניות ה-RLS מאפשרת
          גישה.
        </p>
      </div>
    )
  }

  return <DocumentsClient documents={data ?? []} />
}
