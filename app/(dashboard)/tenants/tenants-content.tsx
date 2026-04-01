import { TenantsDataTable } from "@/components/tenants/tenants-data-table"
import { getTenantsForCrm } from "@/lib/tenants-admin"

export async function TenantsContent() {
  const { data, error } = await getTenantsForCrm()

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-4 text-start"
      >
        <p className="text-sm font-semibold text-destructive">
          לא ניתן לטעון את רשימת הדיירים
        </p>
        <p className="mt-1 text-xs text-destructive/90">{error}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          ודאו שהמיגרציה האחרונה הוחלה (עמודות{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem]">
            email
          </code>
          ,{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem]">
            is_active
          </code>
          ) ומדיניות RLS על{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem]">
            profiles
          </code>
          .
        </p>
      </div>
    )
  }

  return <TenantsDataTable tenants={data ?? []} />
}
