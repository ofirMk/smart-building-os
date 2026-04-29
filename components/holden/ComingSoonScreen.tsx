import Link from "next/link"

type ComingSoonScreenProps = {
  title: string
}

export function ComingSoonScreen({ title }: ComingSoonScreenProps) {
  return (
    <div className="relative flex flex-1 min-h-0 flex-col items-center justify-center overflow-y-auto bg-[#050508] px-4 text-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_55%_at_50%_-25%,rgba(34,211,238,0.12),transparent)]" />
      <div className="relative z-10 max-w-md">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-50 md:text-3xl">
          {title}
        </h1>
        <p className="mt-4 text-lg text-zinc-400">בקרוב</p>
        <Link
          href="/portal"
          className="mt-10 inline-flex rounded-xl border border-white/10 bg-card/[0.04] px-5 py-2.5 text-sm font-medium text-cyan-300/95 transition-colors hover:bg-card/[0.08]"
        >
          חזרה לפורטל
        </Link>
      </div>
    </div>
  )
}
