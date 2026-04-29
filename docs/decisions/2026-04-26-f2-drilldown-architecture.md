# החלטה: ארכיטקטורת F2 Drill-Down (Priority/Holden parity)

**תאריך**: 26.04.2026  
**סטטוס**: ❶ מומש (משפחת מוצר + יחידת מידה) · 27.04.2026  
**מקור הרעיון**: בקשת בעל המוצר 26.04.2026

## עדכון יישום (27.04.2026)

מומש בכרטיס פריט (`priority-item-form-client.tsx`) עבור 3 שדות:
- משפחת מוצר → POST `/api/master-data/product-families` → append+auto-select
- יח' קניה/מכירה → אופציה (ב) "רשימה רכה" + טקסט חופשי
- יח' מפעל → אותה תבנית

קבצים שנוצרו:
- `lib/marker-ofek/hooks/use-f2-listener.ts`
- `components/marker-ofek/forms/drilldown-sheet.tsx`
- `components/marker-ofek/forms/f2-lookup-field.tsx`
- `components/marker-ofek/master-data/quick-create-product-family-form.tsx`
- `components/marker-ofek/master-data/quick-create-uom-form.tsx`

לא מומש (Phase 2): ספק מועדף, פרק תקציבי, משאב, קטגוריה, localStorage snapshot, טבלת UOM master.

---

## עיקרון

בכל שדה Lookup (משפחת מוצר, יחידת מידה, ספק, פרק תקציבי…) — לחיצה על **F2** פותחת מסך drill-down של ניהול הישות, בלי לאבד את המצב של הטופס המקורי.

זוהי הקונבנציה הקלאסית של Priority/Holden ERP (וגם של תוכנות חשבונאות ישראליות כמו חשבשבת ושע"מ). משתמשים מנוסים בעולם הפרוקיורמנט מצפים לזה.

## דרישות פונקציונליות

1. **Keyboard listener** ב-Dropdown של שדה Lookup. F2 כשהפוקוס על השדה → drill-down.
2. **State preservation**: לפני המעבר, כל מה שהמשתמש הקליד עד כה נשמר בזיכרון (sessionStorage או context).
3. **Slide-over / Drawer / Modal**: מסך הניהול נפתח **מעל** הטופס הנוכחי, לא במעבר נפרד. סגירה → חזרה למיקום במדויק.
4. **רענון אוטומטי + בחירה אוטומטית**: אחרי שמירת ישות חדשה, ה-Dropdown של הטופס המקורי שולף שוב, והערך החדש נבחר אוטומטית.
5. **עקביות גלובלית**: F2 חייב להתנהג זהה בכל מקום. דרך אחת לעטוף שדות, דרך אחת לפתוח drill-down.

## ארכיטקטורה מוצעת

### 1. רכיב `<F2LookupField />` (wrapper)

```tsx
// components/marker-ofek/forms/f2-lookup-field.tsx
type F2LookupFieldProps<T> = {
  label: string
  value: string | null
  onChange: (newValue: string) => void
  options: T[]
  getOptionValue: (o: T) => string
  getOptionLabel: (o: T) => string
  /** מסך ה-drill-down שייפתח ב-F2 */
  drilldown: {
    title: string
    /** הקומפוננטה שתיפתח. מקבלת onCreated callback */
    Component: React.ComponentType<{ onCreated: (newId: string) => void }>
    /** פונקציה שטוענת מחדש את ה-options אחרי יצירה */
    refresh: () => Promise<T[]>
  }
}
```

מטפל ב:
- onKeyDown F2 → `setDrilldownOpen(true)`
- שמירת current state (אם הטופס משתמש ב-context — דרכו)
- פתיחת `<Drawer>` / `<Sheet>` עם `Component`
- ב-`onCreated`: קריאה ל-`refresh()` → עדכון options → `onChange(newId)` → סגירת drawer

### 2. Hook `useF2Drilldown`

```tsx
// lib/marker-ofek/hooks/use-f2-drilldown.ts
export function useF2Drilldown(opts: {
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    function handler(e: KeyboardEvent) {
      if (e.key === "F2" && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        e.stopPropagation()
        opts.onOpen()
      }
    }
    el.addEventListener("keydown", handler)
    return () => el.removeEventListener("keydown", handler)
  }, [opts.onOpen])
  return ref
}
```

### 3. State preservation דרך URL

חלופה ל-sessionStorage: לכלול state-snapshot ב-`?draft=...` (base64). פותח ב-Drawer רוטינה — אם הוא נסגר, הטופס נטען מחדש מה-URL. עמיד גם לרענון דף.

זה גם מאפשר Deep-Link: `?drilldown=family&draft=...&returnTo=/marker-ofek/items/new`.

### 4. Server actions לטעינה מחדש

כל drill-down חייב לחזור עם רשומה מלאה מהשרת (לא רק ID). זה מבטיח שהטופס יודע להציג label ולא רק ערך.

## רשימת שדות שיקבלו F2 (סדר עדיפות)

| שדה | מסך הניהול | טבלה |
|---|---|---|
| **משפחת מוצר** | `master-data/families` | `erp_md_product_families` |
| **יחידת מידה** | `master-data/units` | (כיום: free text — נדרש להפוך למאסטר) |
| **ספק מועדף** | `supply-chain/suppliers` | `erp_md_suppliers` |
| **פרק תקציבי** | `finance/budget-chapters` | `erp_md_budget_chapters` |
| **משאב** | `master-data/resources` | `erp_md_resources` |
| **קטגוריה** (קוד) | `master-data/categories` | `erp_md_categories` |

## מתי לבנות

**לא עכשיו.** הסדר שהוסכם:

1. **Stage 1** — הזנת מסה קריטית של נתוני אמת. אם הזרימה הבסיסית נשברת, F2 לא יתקן.
2. **בסוף Stage 1**: אם המשתמש הקליד 200 פריטים ידנית והרגיש שזה מהיר מספיק — F2 פחות דחוף.
3. **תחילת Stage 2** (BOQ Read-Only): F2 הופך לקריטי — מהנדס מתמחר ושם לב שחסר ספק. F2 אומר "אל תעצור את הזרימה".

**אומדן**: 3-5 ימי פיתוח לזרימה המלאה (wrapper + hook + 4-6 drill-down screens מותאמים + state preservation).

## מקבילות בעולם

- **Priority**: F2 פותח drill-down, F4 פותח lookup לקריאה.
- **Holden**: F2 = "פתיחת רשומה חדשה" באותו זרם.
- **חשבשבת**: F4 = lookup, Ins = "הוספה" שעוברת זמנית למסך מנהל.
- **SAP**: לא קיצור F2, אבל "/n + tcode" עושה דבר דומה.

## מה כן עכשיו (Pre-F2)

לפני ש-F2 קיים, המשתמשים זקוקים ל-2 דברים:

1. ✅ **Seed migration** של ערכי בסיס (משפחות, יחידות, ספקים) — נוצר ב-`20260429_seed_default_product_families.sql`.
2. ✅ **Seed Preflight Banner** בטופס שמתריע אם חסרים ערכי תשתית — קיים בטופס Priority.
3. ⏳ **Bulk Import** — קיים ב-`/marker-ofek/items/import` ל-Stage 1.

## מקבילה מינימלית כיום

עד שנבנה F2, המשתמש יכול:
1. לפתוח tab חדש למסך master-data → ליצור משפחה → לחזור לטופס → לרענן.
2. השלמת אוטו-מילוי: הטופס שלנו טוען families ב-`useEffect` במאונט — אפשר להוסיף "רענן" button מפורש.

זו לא חוויה מצוינת אבל היא מספקת ל-Stage 1 (שבו המסה הקריטית נכנסת דרך CSV import, לא ידנית).
