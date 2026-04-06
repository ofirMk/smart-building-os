"use client"

/** סטנדרט יהלום — עברית בלבד; מוצג מתחת לרשימת בחירה */
export function DiamondSelectDrillFooter() {
  return (
    <div className="mt-2 flex items-center justify-between rounded-lg border-t border-slate-100 bg-slate-50 p-2">
      <span className="text-[10px] font-medium text-slate-400 italic">
        חסר נתון ברשימה?
      </span>
      <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-bold text-slate-500 shadow-sm">
        F2 להקמה
      </kbd>
    </div>
  )
}
