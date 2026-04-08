import Link from "next/link"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export default async function HoldenErpHubPage() {
  const supabase = await createSupabaseServerAuthClient()

  const [{ data: contracts }, { data: partials }] = await Promise.all([
    supabase
      .from("contracts")
      .select(
        "id, makat, status, entities ( name ), projects ( name )"
      )
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("partial_accounts")
      .select(
        "id, account_number, status, contracts ( id, entities ( name ) )"
      )
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(30),
  ])

  return (
    <div dir="rtl" lang="he" className="mx-auto max-w-4xl space-y-10 px-4 py-8 text-slate-100">
      <header className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-500">
          Holden Group ERP
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">מרכז מסמכים</h1>
        <p className="text-sm text-slate-400">
          חוזים וחשבונות חלקיים — ממשק Diamond (Omnibar: Ctrl+K).
        </p>
      </header>

      <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/80 p-5">
        <h2 className="text-sm font-medium text-slate-200">חוזים</h2>
        <ul className="space-y-2 text-sm">
          {(contracts ?? []).length === 0 ? (
            <li className="text-slate-500">אין חוזים להצגה</li>
          ) : (
            (contracts ?? []).map((c) => {
              const row = c as {
                id: string
                makat?: string | null
                status?: string
                entities?: { name?: string } | { name?: string }[] | null
                projects?: { name?: string } | { name?: string }[] | null
              }
              const ent = row.entities
              const entName = Array.isArray(ent) ? ent[0]?.name : ent?.name
              const proj = row.projects
              const projName = Array.isArray(proj) ? proj[0]?.name : proj?.name
              return (
                <li key={row.id}>
                  <Link
                    href={`/marker-ofek/holden-erp/contracts/${row.id}`}
                    className="text-emerald-400/90 underline-offset-4 hover:underline"
                  >
                    {projName ?? "פרויקט"} — {entName ?? "ישות"}
                    {row.makat ? ` · מק״ט ${row.makat}` : ""}
                  </Link>
                  <span className="me-2 text-slate-500">({row.status})</span>
                </li>
              )
            })
          )}
        </ul>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/80 p-5">
        <h2 className="text-sm font-medium text-slate-200">חשבונות חלקיים אחרונים</h2>
        <ul className="space-y-2 text-sm">
          {(partials ?? []).length === 0 ? (
            <li className="text-slate-500">אין חשבונות</li>
          ) : (
            (partials ?? []).map((p) => {
              const row = p as {
                id: string
                account_number: number
                status: string
                contracts?: {
                  id?: string
                  entities?: { name?: string } | { name?: string }[] | null
                } | null
              }
              const ent = row.contracts?.entities
              const entName = Array.isArray(ent) ? ent[0]?.name : ent?.name
              return (
                <li key={row.id}>
                  <Link
                    href={`/marker-ofek/holden-erp/partial-accounts/${row.id}`}
                    className="text-emerald-400/90 underline-offset-4 hover:underline"
                  >
                    חשבון מס׳ {row.account_number}
                    {entName ? ` · ${entName}` : ""}
                  </Link>
                  <span className="me-2 text-slate-500">({row.status})</span>
                </li>
              )
            })
          )}
        </ul>
      </section>
    </div>
  )
}
