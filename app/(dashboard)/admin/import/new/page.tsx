import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { getRegisteredEntities } from "@/lib/admin/import/registry"

import { ImportWizardClient } from "./import-wizard-client"

export const dynamic = "force-dynamic"

export default function NewImportPage() {
  const entities = getRegisteredEntities()

  return (
    <div className="space-y-5">
      <nav className="flex items-center gap-1 text-sm text-slate-500">
        <Link href="/admin/import" className="hover:text-slate-900">
          ייבוא נתונים
        </Link>
        <ChevronRight className="size-3.5 rotate-180" aria-hidden />
        <span className="font-medium text-slate-900">ייבוא חדש</span>
      </nav>
      <ImportWizardClient entities={entities} />
    </div>
  )
}
