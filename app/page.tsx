"use client";

import React from "react";

type CompanyCookie = "marker_ofek" | "holden_group" | "none";

function setSelectedCompanyCookie(company: CompanyCookie) {
  if (typeof document === "undefined") return;
  const maxAge = company === "none" ? 0 : 60 * 60 * 24 * 180;
  document.cookie = `selected_company=${company}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export default function RootPage() {
  return (
    <div
      dir="rtl"
      className="min-h-svh bg-[#09090b] px-6 py-10 text-white font-sans md:px-10"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
        <header className="space-y-3 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-100 md:text-6xl">
            קבוצת הולדן
          </h1>
          <p className="text-base text-zinc-400 md:text-lg">פורטל כניסה למערכות הקבוצה</p>
        </header>

        <section className="grid w-full grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          <a
            href="/marker-ofek/command-center"
            onClick={() => setSelectedCompanyCookie("marker_ofek")}
            className="group flex min-h-64 flex-col items-center justify-center rounded-3xl border-2 border-zinc-700 bg-zinc-900/60 px-6 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-400 hover:bg-violet-500/10 hover:shadow-xl hover:shadow-violet-500/10"
          >
            <div className="text-3xl font-bold text-zinc-100 md:text-4xl">
              ביצוע ורכש
            </div>
            <p className="mt-3 max-w-xs text-sm text-zinc-400">
              ERP הנדסה, חוזים ופרויקטים
            </p>
          </a>

          <a
            href="/holden"
            onClick={() => setSelectedCompanyCookie("holden_group")}
            className="group flex min-h-64 flex-col items-center justify-center rounded-3xl border-2 border-zinc-700 bg-zinc-900/60 px-6 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-400 hover:bg-cyan-500/10 hover:shadow-xl hover:shadow-cyan-500/10"
          >
            <div className="text-3xl font-bold text-zinc-100 md:text-4xl">הולדן ניהול מבנים</div>
          </a>

          <a
            href="/hh-panels"
            onClick={() => setSelectedCompanyCookie("none")}
            className="group flex min-h-64 flex-col items-center justify-center rounded-3xl border-2 border-zinc-700 bg-zinc-900/60 px-6 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-500/10 hover:shadow-xl hover:shadow-blue-500/10"
          >
            <div className="text-3xl font-bold text-zinc-100 md:text-4xl">ח.ח. לוחות חשמל</div>
          </a>

          <a
            href="/hq"
            onClick={() => setSelectedCompanyCookie("none")}
            className="group flex min-h-64 flex-col items-center justify-center rounded-3xl border-2 border-zinc-700 bg-zinc-900/60 px-6 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-400 hover:bg-amber-500/10 hover:shadow-xl hover:shadow-amber-500/10"
          >
            <div className="text-3xl font-bold text-zinc-100 md:text-4xl">הנהלת הקבוצה</div>
          </a>
        </section>
      </div>
    </div>
  );
}