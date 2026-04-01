"use client";

import React, { useEffect, useState } from "react";

export default function RootPage() {
  const [mounted, setMounted] = useState(false);

  // מונע שגיאות שרת - הקוד ירוץ רק כשהדף נחת בדפדפן
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSelection = (company: "marker-ofek" | "holden") => {
    if (typeof window !== "undefined") {
      // שמירה מקומית כדי שהמערכת תזכור את הבחירה
      localStorage.setItem("selected_company", company);
      
      // ניתוב נקי - במקרה של מרקר אופק הולכים למרכז הפיקוד
      // במקרה של הולדן הולכים לנתיב הייעודי
      const targetPath = company === "marker-ofek" ? "/marker-ofek" : "/dashboard/holden";
      window.location.assign(targetPath);
    }
  };

  // בזמן שהשרת טוען, נציג מסך שחור נקי כדי למנוע קפיצות (Flickering)
  if (!mounted) return <div className="min-h-svh bg-[#0a0a0a]" />;

  return (
    <div dir="rtl" className="flex min-h-svh flex-col items-center justify-center bg-[#0a0a0a] p-6 text-white font-sans">
      <div className="mb-12 text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-100">ברוך הבא, אופיר</h1>
        <p className="text-zinc-500">בחר חברה כדי להיכנס למרכז הפיקוד</p>
      </div>

      <div className="grid w-full max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
        {/* כרטיס מרקר אופק */}
        <button
          onClick={() => handleSelection("marker-ofek")}
          className="flex flex-col items-center gap-4 rounded-3xl border border-zinc-800 bg-zinc-900/50 p-12 transition-all hover:border-violet-500/50 hover:bg-violet-500/10 active:scale-[0.98]"
        >
          <div className="flex size-16 items-center justify-center rounded-2xl bg-violet-600 shadow-[0_0_20px_rgba(124,58,237,0.3)]">
            <span className="text-2xl font-bold">M</span>
          </div>
          <div className="text-2xl font-bold text-zinc-100">מרקר אופק</div>
          <p className="text-center text-sm text-zinc-500">ניהול פרויקטים, רכש וביצוע תשתיות חשמל</p>
        </button>

        {/* כרטיס הולדן גרופ */}
        <button
          onClick={() => handleSelection("holden")}
          className="flex flex-col items-center gap-4 rounded-3xl border border-zinc-800 bg-zinc-900/50 p-12 transition-all hover:border-blue-500/50 hover:bg-blue-500/10 active:scale-[0.98]"
        >
          <div className="flex size-16 items-center justify-center rounded-2xl bg-blue-600 shadow-[0_0_20px_rgba(37,99,235,0.3)]">
            <span className="text-2xl font-bold">H</span>
          </div>
          <div className="text-2xl font-bold text-zinc-100">הולדן גרופ</div>
          <p className="text-center text-sm text-zinc-500">ניהול מבנים, אחזקה ושירות דיירים</p>
        </button>
      </div>
    </div>
  );
}