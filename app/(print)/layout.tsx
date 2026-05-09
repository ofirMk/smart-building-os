/**
 * (print) — Print-only canvas layout.
 *
 * זהו route group ייעודי לעמודי הדפסה מבוססי `window.print()`.
 * הכלל: **אסור** להציג כאן Sidebar, Header, או כל chrome של ה-App —
 * הקנבס נקי לחלוטין (לבן) כדי שתצוגת הדפדפן והפלט המודפס יהיו זהים
 * לקובץ ה-A4 שהלקוח מצפה לקבל.
 *
 * הערות מרכזיות:
 *   1. Root layout (`app/layout.tsx`) קובע `<html lang="he" dir="rtl">`,
 *      וגם `overflow-hidden` על מיכלי ה-shell. כאן אנחנו **כותבים מעל**
 *      ה-overflow ע"י wrapper שמרשה לתוכן הא4 לזרום מטה.
 *   2. רקע לבן + טקסט שחור קשיחים (לא מושפעים מ-Dark Mode).
 *   3. CSS גלובלי של `@page { size: A4; margin: 10mm }` נטען פעם אחת.
 */

import "./print.css";

export default function PrintLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      dir="rtl"
      lang="he"
      data-print-canvas="root"
      className="print-canvas h-full w-full flex-1 overflow-y-auto bg-white text-black"
    >
      {children}
    </div>
  );
}
