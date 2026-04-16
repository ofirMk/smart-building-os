import Link from "next/link"

export default function FinanceLandingPage() {
  return (
    <main className="flex min-h-0 flex-1 flex-col bg-white p-6" dir="rtl">
      <div className="mx-auto w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">ניהול כספים</h1>
        <p className="mt-2 text-sm text-slate-600">
          זהו דף placeholder ראשי למודול הפיננסי עם ניתוב תקין מה־Header.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/marker-ofek/finance"
            className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-100"
          >
            מעבר למודול כספים מתקדם
          </Link>
        </div>
      </div>
    </main>
  )
}
