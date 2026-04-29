# Layout Invariants — אין גלילה גלובלית

**סטטוס**: חובה · אכיפה דרך code-review · עודכן 27.04.2026

---

## העיקרון

> ה-Viewport של המשתמש (`100dvh`) הוא גבול קשיח. אסור שתופיע גלילת חלון
> ראשית. כל המסך נכנס. רק רכיבי תוכן פנימיים (טבלאות/לוחות) יכולים לקבל
> גלילה משלהם.

זה מבטיח:

1. **התאמה לטלוויזיה / מסכים גדולים** — כל הסרגלים גלויים תמיד.
2. **התאמה לזום** — Ctrl+Plus / Ctrl+Minus משנים rem ולא שוברים את ה-shell.
3. **חוויית "Desktop App"** — כמו Priority/Excel — לא כמו אתר תוכן.
4. **Focus & UX קבועים** — ה-Header, ה-WorkspaceTabBar, וה-Footer לעולם
   לא נדחפים מחוץ למסך.

---

## השרשרת הקנונית (Top-down)

```
<html h-[100dvh]>                               ← root, עם dvh (אדפטיבי)
  <body h-[100dvh] overflow-hidden>             ← אסור לגלול את ה-body
    <root-shell flex flex-col h-[100dvh] overflow-hidden>
      <root-content flex-1 min-h-0 overflow-hidden flex>
        <DashboardShell>
          <shell-root flex flex-col h-full min-h-0 overflow-hidden>
            <TopNavBar flex-none min-h-[3.25rem]>           ← ❶ סרגל קבוע
            <below-header flex-1 min-h-0 overflow-hidden flex>
              <vertical-stack flex-1 min-h-0 flex flex-col overflow-hidden>
                <WorkspaceTabBar shrink-0>                  ← ❷ סרגל קבוע
                <SmartWorkspaceChrome>...
                  <main flex-1 min-h-0 overflow-y-auto>     ← ❸ אזור הגלילה היחיד
                    {page content}                          ← ❹ תוכן הדף
                  </main>
                </...>
              </vertical-stack>
            </below-header>
            <footer flex-none>                              ← ❺ סרגל קבוע (תנאי)
          </shell-root>
        </DashboardShell>
      </root-content>
    </root-shell>
  </body>
</html>
```

---

## חוקי ה-Flexbox הסטריליים

### חוק 1 — `min-h-0` בכל רמת flex-column עם flex-1

```tsx
// ❌ שגוי — child יכול לגדול מעבר לאב
<div className="flex flex-1 flex-col">
  <main className="flex-1 overflow-y-auto">…</main>
</div>

// ✅ נכון — min-h-0 שובר את ברירת המחדל min-height: auto
<div className="flex flex-1 min-h-0 flex-col">
  <main className="flex-1 min-h-0 overflow-y-auto">…</main>
</div>
```

**למה**: ב-flex children, `min-height: auto` מתחיל מהתוכן ולא מ-0. זה
גורם לילד להתעקש על הגובה הטבעי שלו ו"לפרוץ" את האב. `min-h-0` (=
`min-height: 0px`) מנטרל את ההתנהגות הזו.

### חוק 2 — סרגלים קבועים = `flex-none` או `shrink-0`

```tsx
// ❌ שגוי — header יכול להתכווץ אם אין מקום
<header className="bg-card">…</header>

// ✅ נכון — header שומר על גובהו הטבעי
<header className="flex-none bg-card">…</header>
// או:
<header className="shrink-0 bg-card">…</header>
```

`flex-none` = `flex: none` = `flex-grow:0 flex-shrink:0 flex-basis:auto`.
`shrink-0` רק שומר מפני התכווצות, מאפשר גדילה.

### חוק 3 — אזור הגלילה היחיד = `<main>` או scroll container פנימי

יש שני דפוסים תקינים — **לא לערבב ביניהם**:

#### דפוס א' — דף בלוק רגיל (Default, פשוט)

```tsx
// app/(dashboard)/marker-ofek/items/[id]/page.tsx
export default function ItemDetailPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-12">
      {/* תוכן רגיל. main של ה-shell יגלול אם יותר מדי. */}
    </div>
  )
}
```

**מתי**: 95% מהדפים. תוכן ארוך → main גוללת.

#### דפוס ב' — דף Master-Detail עם sub-scrollers

```tsx
// components/marker-ofek/items/heavy-item-master-screen.tsx
return (
  <div className="flex flex-1 min-h-0 overflow-hidden">
    <aside className="flex w-80 min-h-0 flex-col overflow-hidden">
      <div className="flex-none">…header…</div>
      <div className="flex-1 min-h-0 overflow-y-auto">…sidebar scroll…</div>
    </aside>
    <section className="flex flex-1 min-h-0 flex-col overflow-hidden">
      <div className="flex-none">…toolbar…</div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <Tabs className="flex flex-1 min-h-0 flex-col overflow-hidden">
          <TabsList className="flex-none">…</TabsList>
          <TabsContent className="flex-1 min-h-0 overflow-y-auto">…</TabsContent>
        </Tabs>
      </div>
    </section>
  </div>
)
```

**מתי**: דפי משימה מרובי-לוחות (Priority-style). ה-main של ה-shell
**לא תגלול** — כל סקרולר פנימי דואג לעצמו. הדף עצמו `flex-1 min-h-0
overflow-hidden`.

### חוק 4 — אסור `min-h-screen` / `h-screen` / `100vh` בדפים

```tsx
// ❌ שגוי — שובר את ה-shell
<div className="min-h-screen">…</div>

// ❌ שגוי — אותו דבר
<div style={{ minHeight: '100vh' }}>…</div>

// ✅ נכון — flex-1 בתוך main
<div className="flex flex-1 flex-col">…</div>
```

**למה**: ה-`<main>` כבר מקבלת את כל הגובה. `min-h-screen` מאלצת את
התוכן להיות לפחות בגובה ה-viewport ויוצרת overflow לא רצוי.

### חוק 5 — מידות בסרגלי כלים = `rem`, לא `px`

```tsx
// ❌ פגיע לזום
<header className="min-h-[52px]">…</header>

// ✅ סקיילבל לזום
<header className="min-h-[3.25rem]">…</header>
```

**למה**: זום בדפדפן (Ctrl+Plus) משנה את `font-size` הבסיס. רכיבים
ב-rem גדלים פרופורציונלית. רכיבים ב-px לא.

---

## בדיקת ה-Chain ב-DevTools

הוספנו `data-layout-region` בכל רמה. כדי לוודא ש-Layout שלם:

```js
// פתח DevTools → Console:
[...document.querySelectorAll('[data-layout-region]')]
  .map(el => ({
    region: el.dataset.layoutRegion,
    height: el.getBoundingClientRect().height,
    overflow: getComputedStyle(el).overflowY
  }))
```

תוצאה תקינה:
- `root-shell` height = 100dvh בדיוק
- כל הילדים מסתכמים בדיוק לאותה תוצאה
- רק `main-scroll` יש לו `overflow-y: auto` עם תוכן שגדול ממנו

---

## Checklist בדפים חדשים

לפני PR של דף חדש:

- [ ] אין `min-h-screen` / `h-screen` / `100vh` בקוד הדף.
- [ ] אם הדף משתמש ב-Tabs/Resizable Panels — שרשרת ה-`min-h-0` שלמה
      מ-page root עד ל-leaf scroller.
- [ ] סרגלי toolbar/header פנימיים = `flex-none` או `shrink-0`.
- [ ] בדיקה ידנית: גלל את ה-`<main>` עד הסוף — האם הסרגלים העליונים
      והתחתונים נשארים גלויים? ✓
- [ ] בדיקה ב-Zoom 110% / 125% / 150% — האם עדיין נכנס בלי scroll גלובלי?

---

## רכיבים שכבר עוברים את הבדיקה

✅ `app/(dashboard)/marker-ofek/items/[id]/page.tsx` — דפוס א' (block flow)
✅ `app/(dashboard)/marker-ofek/items/new/priority-item-form-client.tsx` — דפוס א'
✅ `app/(dashboard)/marker-ofek/items/import/csv-import-client.tsx` — דפוס א'
✅ `components/marker-ofek/items/heavy-item-master-screen.tsx` — דפוס ב'

---

## קבצי מקור עיקריים

| מיקום | תפקיד |
|---|---|
| `app/layout.tsx` | html + body + root shell wrappers |
| `components/dashboard-shell.tsx` | Top nav + below-header + main + footer |
| `components/layout/TopNavBar.tsx` | TopNavBar עצמו (`flex-none min-h-[3.25rem]`) |
| `components/marker-ofek/workspace/workspace-tab-bar.tsx` | WorkspaceTabBar (`shrink-0`) |
| `components/marker-ofek/workspace/smart-workspace-chrome.tsx` | Chrome wrapper סביב main |

