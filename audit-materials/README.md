# Audit Materials — Priority-like ERP Comparison

תיקייה זו מכילה את **חומרי ההשוואה** שמשמשים לאיפיון הפער בין המערכת
הקיימת (Smart Building OS — Marker-Ofek) לבין מערכת-היעד (ככל הנראה
Priority ERP, בהתבסס על הפיצ'רים שכבר מומשו).

## מבנה

```
audit-materials/
├── README.md               ← זה
├── screenshots/            ← צילומי מסך של מערכת-היעד (ממוספרים 01, 02, …)
│   ├── 01-<שם-מסך>.png
│   ├── 02-<שם-מסך>.png
│   └── …
├── references/             ← מסמכים, קישורים, תמלולי וידאו
│   ├── youtube-<slug>.md   ← תמלול/תקציר של סרטוני YouTube רלוונטיים
│   └── notes-<topic>.md    ← הערות/מפרטים שהמשתמש שיתף
└── audit-report.md         ← יוצר ע"י Cascade בסיום הסריקה
```

## קונבנצית שמות

- **screenshots/** — כל צילום מסך ימוספר ויתואר בשם הקובץ.
  לדוגמה: `01-purchase-order-header.png`, `02-po-line-detail.png`.
  מומלץ לצרף גם `<name>.notes.md` עם תיאור מילולי של מה שבמסך
  (אילו שדות, לוגיקה, פעולות) אם זה לא ברור מהצילום.

- **references/** — חומר ויזואלי/מלל חיצוני.
  לוידאו: `youtube-<video-id>.md` עם `url:`, `title:`, ותמלול או תקציר.

## תהליך ה-audit

1. המשתמש מעלה חומר לתיקיות הללו.
2. Cascade סורק כל קובץ ו-cross-reference מול רכיבי המערכת הקיימים:
   - `docs/modules/procurement/po-module-spec.md`
   - `docs/SYSTEM_INDEX.md`
   - `supabase/migrations/*.sql`
   - `app/api/procurement/**`, `components/marker-ofek/**`
3. Cascade כותב `audit-report.md` עם: מה קיים, מה חסר, מה פער בעיצוב,
   והמלצות לשלבים הבאים (עדיפויות High/Medium/Low).

## כללי זהב

- **אין** ל-Cascade להתחיל שינויי קוד על בסיס ה-audit בלי אישור
  מפורש. ה-report הוא תוצר ראשוני בלבד.
- כל המלצה מוצמדת לרכיב קיים (file path / migration / API route)
  כדי לוודא תאימות לאחור.
