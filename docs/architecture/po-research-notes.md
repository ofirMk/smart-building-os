# PO Research — WIP Notes

> **Working draft** — נכתב תוך כדי סקירה של תמונות רפרנס של Priority.
> ייערך ויופצל ל-`docs/ingested-specs/priority-purchase-order-sop.md` +
> `docs/architecture/po-card-spec.md` בסיום הסקירה. **ימחק** אחרי איחוד.

## מקור הראיות

- 34 תמונות (batches של 5) + PDF מ-Priority
- סטטוס batches: 1/7 ✅ · 2/7 ✅ · 3/7 ✅ · 4/7 ✅ · 5/7 ✅ · 6/7 ✅ · 7/7 ✅ · PDF ✅

> **הערה**: ה-batch האחרון כלל 4 תמונות בלבד (31–34). תמונה 34 היא
> **חוב מפעילות קודמת** (מסך הספקים שלנו עם הערה אדומה של המשתמש) —
> ראה סעיף נפרד למטה.

---

## Batch #1 (תמונות 1–5)

### מפת ניווט (Image 5)
מודול "רכש" מכיל: ספקים · **הזמנות רכש** · מחירון ספק · RFQ · הצעות מחיר
· תיעודים/מלאי נדרש · MRP · תכנון רכש · דרישות רכש · תחזיות רכש.

תת-תפריט של "הזמנות רכש": מסך בודד · רשימת פתוחות · שאילתה · **לוג
שינויים** · **אישורים** · הזמנות מספקות לרישה · **סגירת הזמנה** ·
שחרור · **הדפסה** (עברית + Print Purchase Order באנגלית + Blanket) ·
דו"חות · ניתוח · פתיחה עוד לה. · אסטי הזמנות · עדכון שורת פיוטיו דגמים.

### מסך הזמנת רכש — Header (Images 1–4)
שדות חובה/מרכזיים תמיד גלויים:
- `מס' ספק *` · `שם ספק` · `איש קשר` · `תפקיד`
- `תאריך *` · `הזמנה *` (auto-number `PO########`)

### 6 לשוניות ראשיות

| # | לשונית | שדות מזוהים |
|---|---|---|
| 1 | **מחירים** | מחיר כולל, הנחה כללית (%), מחיר אחרי הנחה, מע"מ, מחיר כולל מע"מ, `מטבע *` |
| 2 | **אסמכתאות** | דרישה מרוצה · הזמנת מסגרת (Blanket) · הזמנת לקוח · הזמנת ספק · יבוא/יצוא · **מחזור מקובל** · אופן משלוח · סוג הזמנה · קראיות שהתה · סבור · עבור משתמש/משמרת · כמות פריטים |
| 3 | **פרויקט** | *(טרם הוצג — batch מאוחר)* |
| 4 | **אישורים ומעקב ביצוע** | `סטטוס *` · לטיפול · דרישת מאשים · תאור רשימה · החתום הבא · מאושרת? · מהדורה נוכחית · הדפסה · ניתנת לטיפולי? · סתרות? · **סגורה חלוקת** · משאייים על תמהנון · דרגת הרשאה לספק · לקוח בלבד? · הודית (נ' דרגה) |
| 5 | **תנאים כספיים** | `קוד מע"מ` · מטבע הצמדה · שער בסיס · שער מקורה · % ניכוי מקור · ביצוע מקוטע · `תנאי תשלום` (קודים 01–07 = שוטף/15/30/45/60/90/120) · לא נכללות בתחריב? · תנאי תשלום להוצמה? |
| 6 | **שונות** | *(טרם הוצג)* |

### Lines grid — 13 תת-לשוניות של השורה
פירוטי הזמנת רכש · פירוט דגמים · כמות לוח להזמנה · כתובת למשלוח ·
**אישור הזמנת הרכש (line-level)** · **מהדורות הזמנת רכש (revisions)** ·
פירוט הצעה · קישור לפרויקט/חשבון · הזמנות רכש – טקסט · פירוט הספק ·
הערות פנימיות · שונות.

### עמודות שורה
`מק"ט *` · תאור מוצר · כמות · יחידה · ת. אספקה · מחיר ליחידה · % הנחה ·
`*סה"כ שורה` · מחיר כולל מע"מ.

### 12 Bottom sub-screens
סה"כ ההזמנה · קישור לפרויקט/חשבון · מאפיינים לקוד סל · פירוטי הזמנת
רכש – טקסט חופשי · **זמינות מוצר מרכזי** · **זמינות פריט מרכז** ·
**מלאי למוצר** · **מעקב תנועות** · **הצעות מחיר למוצר** · **חשבוניות**
· **קישור תקלה** · הזמנות לקוח לדרישיות/הזמנות רכש.

### "הפעלות ישירות" (left sidebar actions)
- הדפסת הזמנת רכש · Print Purchase Order (EN)
- **קבלות סחורה מהספק** (GR drill)
- תיקו ביצוע
- **שמירת מהדורות** (revision snapshot)
- העתקת מהדרת חוזה
- הקמת מחיר מוסכם
- יצירת הזמנת רכש לפי שוטר (recurring)
- בדיקת מערכת לאישור

### Footer תמיד
סכום לפני הנחה · הנחה כללית (%) · סטטוס · פרטים.

**Status התחלתי**: `טיוטא` (Draft).

---

## Batch #2 (תמונות 6–10)

### חדש: Sales Order (SO) — מסך אחות
מסך **הזמנות לקוח** (Image 1) הוצג כ-reference. לשוניות:
`מחירים · אסמכתאות · פרויקט · מעקב ביצוע · תנאים כספיים · שיבוץ ·
פרטי משלוח · שונות`.

**הבדלי SO ↔ PO** (מכוונים את ה-gap analysis):
| אזור | PO | SO |
|---|---|---|
| לשוניות נוספות | — | **שיבוץ**, **פרטי משלוח** |
| מחירים | מחיר / הנחה / מע"מ / מטבע | + **עלות קניה**, **רווח ברוטו**, **אחוז רווח**, **סל מוצרים**, **כמות** |
| שורה — approval flow | *(ברמת הזמנה)* | **ת. אישור לאספקה**, **יתרת אישור**, **כ.אישר**, **מאושר?** |
| Line sub-tabs ייחודיים | — | סלי מוצרים · הרכבות להזמנה · תשלומים להזמנה · מצב כספי ההזמנה · חשבוניות ותעלות להזמנה |
| אישורים ומעקב ביצוע | לשונית אחת (image 3 b1) | שתי שכבות: **מעקב ביצוע** +  השפעת מחירים |

### חדש: מסך "סוגי הזמנת רכש" (PO Types) — Image 4
מסך קונפיגורציה נפרד, breadcrumb: `הזמנת רכש › סוגי הזמנת רכש ›
שורה 1`. טבלה master עם 4 רשומות seed:

| קוד | תאור עברית | תאור אנגלית |
|---|---|---|
| A | ציוד משרדי | *(empty)* |
| B | חומרי ניקוי | *(empty)* |
| C | מחשבים וחומרה | *(empty)* |
| D | מזון ושתיה | *(empty)* |

**שתי תת-לשוניות לכל סוג**:
- `טקסט קובץ להזמנת רכש` (עברית)
- `טקסט קובץ להזמנת רכש - אנגלית`

דוגמת טקסט מוצג: *"במשלוח הסחורה, נא לרשום על גבי האריזה את הכליות."*

**תפקיד**: הטקסט מודפס אוטומטית בכל PO מהסוג הזה (Hebrew + English).
זה מפצה את הצורך בטקסט-חופשי ברמת ההזמנה — תבנית לפי קטגוריית הרכש.
מקביל ל-"תבניות הדפסה" ב-Priority אך ברמת נתון-טבלה ולא מסמך.

**השלכה**: נדרשת טבלה `erp_po_types (code, name_he, name_en,
footer_text_he, footer_text_en)` + FK מ-`erp_purchase_orders.po_type_code`.

### אישור: תנאי תשלום codes — Image 5
Image 5 מדגיש את ה-dropdown של "תנאי תשלום" בלשונית תנאים כספיים.
מאשר 7 קודים: `01=שוטף` · `02=90ש'` · `03=15ש'` · `04=45ש'` (נבחר) ·
`05=30ש'` · `06=60ש'` · `07=120ש'`.

זה מבנה seed שעלינו לזרוע גם אצלנו (השווה ל-enum `payment_terms`
החופשי שיש כרגע).

---

## Batch #3 (תמונות 11–15)

### Rich-text body (Image 1)
Bottom sub-tab `הזמנות רכש - טקסט` = HTML editor מלא. מאשר
`erp_purchase_orders.body_html` הקיים.

### Line-level actions (Image 2)
ב-"הפעלות ישירות" על שורה:
- `חישב רכש למוצר` — אצלנו: **חלקית** (AI pricing suggestions).
- `ערכי מחיר אחרון` — אצלנו: ✅ "last price" lookup קיים.
- **`פיצול שורת הזמנת רכש`** — אצלנו: ❌ **חסר** (Split to multiple
  delivery dates/qty).
- `סגירה — דו"ח שגיאות`.

### PO Attachments columns (Image 3)
`שם קובץ* · מספר מאפיין · נתיב קובץ* · תאריך יצירה · **גודל (בתים)** ·
סיומת · **משלח** · **שורק ע"י** · ת. עדכון אחרון`. פעולה `הפעל`
לפתיחה. → לבדוק כיסוי ב-`erp_purchase_order_attachments`.

### Supplier "מוצרים לספק" master (Image 4)
טבלת הקטלוג של הספק — אצלנו `erp_md_supplier_items`. עמודות ב-Priority:
`מק"ט* · תאור · יח' · הצעת מחיר · **מק"ט ספק/יצרן** · **תאור מק"ט ס.ספק**
· **שם יצרן** · **שם מלא יצרן**`.

**פער**: אצלנו יש `supplier_sku` אך חסרים: `manufacturer_name_short`,
`manufacturer_name_full`, `supplier_sku_description`.

### Side-by-side workflow (Image 5)
Priority תומך בעגינה דו-מסכית של PO + "מוצרים לספק".
→ **אצלנו**: בחירה בין (a) side panel קבוע ב-PO Form, (b) Dialog picker,
(c) autocomplete inline. המלצה: **(c) + drawer לצפייה מלאה בקטלוג**.

### Supplier drill-screens רלוונטיים ל-PO
- `שורות הזמנות רכש לספק` — כל שורות ה-PO של הספק (drill view).
- `הזמנות רכש פתוחות לספק` — רק פתוחות.
→ אצלנו: `/api/master-data/suppliers/[id]/purchase-orders` ו-tab
`SupplierPurchaseOrdersTab` — ✅.

---

## PDF — LB120173 v04 "תסריט רישום הזמנת רכש"

3 עמודים, script של סרטון 10:16 דק'. מחולק ל-5 פרקים.

### פרק 1 — פתיחת הזמנת רכש (00:00-03:03)

**Header auto-fill on supplier select**:
- בחירת ספק → `תאריך`, `מס' הזמנה`, `שם ספק` מתמלאים אוטומטית.
- `איש קשר` מתמלא מאיש הקשר שהוגדר **לטיפול בהזמנות** אצל הספק
  (דגל `is_order_contact` ברמת contact) — overridable.

**לשונית מחירים**:
- `מטבע` — ברירת מחדל של הספק (overridable).
- `הנחה כללית (%)` — per-order override.

**לשונית תנאים כספיים**:
- `קוד מע"מ` + `תנאי תשלום` — auto-fill מהגדרות הספק.

**לשונית אסמכתאות**:
- `מחסן מקבל` → **auto-populates shipping address** במסך-בן
  `כתובת למשלוח`. הכתובת הזו **מודפסת על ה-PO**.
- `סוג הזמנה` → sub-table `סוגי הזמנת רכש`. **F6 פעמיים** = הוספת
  סוגים חדשים + טקסט קבוע דו-לשוני (מה-Batch #2 Image 4 🔗).
- `הצעת מחיר` + F6 → **רשימת הצעות מאושרות ובתוקף של הספק** (Blanket).
- `הזמנת לקוח` + F6 → מסך `הזמנות לקוח` → F8 = חזרה עם שמירת ה-link.
  אפשר גם ריבוי קישורים ב-sub-screen `הזמנות לקוח להזמנה`.
- **`הזמנות רכש - טקסט`** sub-screen: טקסט חופשי שיודפס לספק. אם
  הוגדר טקסט קבוע לסוג ההזמנה או לספק — prefill.
- **`נספחים`** sub-screen: מפרט / חוזה / כל מסמך אחר.

### פרק 2 — פירוט ההזמנה (03:04-05:03)

**Item picker — shortcut hierarchy**:
- F6 ב-מק"ט → רשימת **מוצרים של הספק** בלבד (`מוצרים לספק`).
- **`Ctrl+F6`** → **רשימה מלאה** (כל הפריטים).
- אפשר גם להזין ע"י `מק"ט ספק/יצרן`.

**שדות חובה לשורה**: `מק"ט` · `כמות` · `ת.אספקה` · `מחיר ליחידה`.

**Price waterfall (F1 על `מחיר ליחידה`)** — משלב התמונות ב-Batch #3 וה-PDF:
1. מחירון / הצעת מחיר של הספק (agreed price for item).
2. מחירון הספק (general).
3. מחיר הרשום בכרטיס הפריט.
4. ה-PO האחרון של אותו הספק, **תוך תקופה של `PPriceDays` ימים**
   (פרמטר מערכתי, ברירת מחדל לא מצוינת).
- Manual override אפשרי תמיד.
- **`מקור מחיר`** column מציג מהיכן נלקח.

**Decision support sub-screens**:
- `זמינות מוצר` — projected inventory:
  `מלאי זמין + על PO − על SO = מלאי צפוי` (דוגמה: 0+100−35=**65**).
- Recent purchases — מחירים + כמויות היסטוריים של הפריט מהספק.

**Line extras (תחת `מהדורת מוצר` sub-tab)**:
- **`סעיף תקציבי`** — קוד תקציב ל-line. תעודות תלויות (GR, SI) יורשות.
- `תאריך ניצול תקציב` · `סג עלות יבוא (L/S/A)` · `מספר דרישון` ·
  `הזמנת לקוח + שורת הזמנת לקוח` · `סטטוס שורת הזמנת רכש`.

### פרק 3 — אישור (05:05-08:10)

**Approvers list workflow**:
- `רשימת מאשרים` — מוגדרת מראש (ID=00 ברירת מחדל).
- F6 → מסך `רשימת מאשרי הזמנות רכש` — sub-screen מפרט את שרשרת האישור.
- **דוגמה מוצגת**:
  | סף סכום | מאשר | תפקיד |
  |---|---|---|
  | ≤ 10,000₪ | יואב | מנהל אזור |
  | > 10,000₪ | סיגל | מנהלת תפעול |
- **`מאשר חלופי`** — ניתן להגדיר לכל שלב.

**Status transitions**:
- `טיוטא` → `מחכה לאישור` → (approvals) → `אושרה`.
- הוצאה מהרשומה לאחר שינוי סטטוס = trigger email למאשר ראשון.
- המאשר מסמן `אשר` ב-`אישור הזמנת רכש` sub-screen.
- **Shortcut חשוב**: *"אם המאשר האחרון מאשר — המערכת מדלגת על
  הקודמים"* (value-based skip).

**Status properties** (via `ניהול תהליך מספק להזמנת רכש`):
- Right-click on status → properties:
  - `לאחר אישור` (post-approval flag)
  - `מאפשר קבלה למלאי` (enables GR creation on this PO)

**BPM alternative**:
- Rule example: *"only Yoav can move to `אושרה` if total < 10,000"*
- Notification rules (e.g., notify Yoav when PO is in `מחכה לאישור`).

**Bypass**: אם לא מוגדרת רשימת מאשרים — המערכת מתעלמת ומתחשבת רק בסטטוס.

**Print** → `הדפסת הזמנת רכש` direct action.

### פרק 4 — תיקונים בהזמנת רכש מאושרת (08:10-08:30)

- מסך נפרד: **`שינויים בהזמנות רכש מאושרות`**.
- שולפים PO → עורכים (תאריך אספקה / כמויות וכו').
- **חשוב**: מסך זה **נפרד** מהמסך הראשי — כנראה כי לאחר אישור חלים
  chk-constraints שונים (audit trail?). נבדוק ב-spec.

### פרק 5 — המשך טיפול (08:31-10:16)

**Auto-close conditions**:
- PO נסגר אוטומטית כאשר סחורה נקלטת דרך:
  - **`תעודת קבלת סחורה מספק`** (GR), OR
  - **`חשבונית ספק`** (SI).
- Linking — ידני או אוטומטי.

**Line-level updates**:
- `יתרה לאספקה` מתעדכן (= ordered_qty − received_qty).
- דגל `סגורה` על שורות שסופקו במלואן.
- דגל `סגורה` בכותרת = כל השורות סגורות.

**`מעקב תנועות`** sub-screen — רואים GR + SI movements per line.

**דו"חות** (תפריט `דו"חות הזמנות רכש`):
- **`הזמנות פתוחות – ספקים`** — open POs grouped by supplier.
- **`פיגורים באספקות`** — lines past delivery date + delay days.

**BI** (תפריט `ניתוח הזמנות רכש`):
- **`מחולל דו"חות הזמנות רכש`** — custom report generator.
- **`ניתוח הזמנות רכש (BI)`** — BI cube (by qty/value/supplier/date).

---

## Batch #4 (תמונות 16–20) — validation של PDF

**Image 16** — line actions confirmed (`פיצול שורה` in sidebar, line
being edited).

**Image 17** — **F6 item picker** בפעולה: חיפוש "עפרון עם לוגו" מסנן
ל-3 פריטים של הספק. ✅ מאמת PDF פרק 2.

**Image 18** — שורה מלאה: `1919 / עפרון-לוג / 100 × 15.00₪ = 1,500₪ /
מע"מ 17% = 1,755₪`, `מקור מחיר = מחירון ספק`. Bottom tab `זמינות
מוצר`: projected stock = **65**. ✅ מאמת PDF פרק 2 waterfall +
projected stock.

**Image 19** — F1 Help popup על `מחיר ליחידה` מציג את ה-waterfall
מילולית. **`PPriceDays`** מוזכר כשם פרמטר. המלצה: "לעיין במחירים
האפשריים במסך `מחירים אפשריים למוצר`".

**Image 20** — לשונית `אישורים ומעקב ביצוע` עם דוגמת PDF פרק 3:
`החתום הבא: 00 → יואב`. Sub-tab `מהדורת מוצר` פעיל עם
**`סעיף תקציבי`** במסגרת אדומה (מאמת סוף פרק 2).

---

## Completion-back — מילוי פערים בתמונות קודמות על בסיס PDF

### Batch #1 gaps closed
- לשונית `אסמכתאות` שדות: **`מחסן מקבל`** (PDF פרק 1) → auto-populates
  shipping address → מודפס. **`סוג הזמנה`** → FK ל-`סוגי הזמנת רכש`.
- לשונית `אישורים ומעקב ביצוע` — **`דרישת מאשים`** = אחד מהמאשרים
  ברשימה; **`החתום הבא`** = הבא בתור; **`רשימת מאשרים`** = FK ל-list.

### Batch #2 gaps closed
- דו-לשוניות `טקסט קובץ להזמנת רכש` בסוגי הזמנה — prefill לטקסט של
  ה-PO. ✅ (קישור גם ל-body_html).

### Batch #3 gaps closed
- `Ctrl+F6` ב-מק"ט = בייפס של רשימת הספק (fallback לכל המוצרים).
- דוגמה למחיר: *"למק"ט ____ נקבע במחירון הספק מחיר של 3000₪"* — מאמת
  את הפער של `erp_md_supplier_items.base_price` (קיים אצלנו ✅).

---

## Batch #5 (תמונות 21–25) — BPM + Approvers matrix ⭐️ core

### Status Properties dialog (Image 21)
כל סטטוס מכיל 15+ דגלים — יוצרים אופי חוזי-דטה (data-driven) של
ה-workflow, לא hard-coded:

| Flag | טיפוס | תפקיד |
|---|---|---|
| `allow_changes` | bool | האם PO editable בסטטוס זה |
| `allows_gr` | bool | האם אפשר לפתוח GR על PO זה |
| `is_approved` | bool | מסמן את ה-PO כ-approved (לחשבון/חוזים) |
| `is_closed` | bool | מסמן את ה-PO כסגור |
| `is_status_on_close` | bool | האם זה סטטוס היעד בפעולת סגירה |
| `is_status_on_reopen` | bool | האם זה סטטוס היעד בפעולת פתיחה חוזרת |
| `sends_email` | bool | שולח מייל בהגעה לסטטוס |
| `is_post_approval` | bool | מסמן כסטטוס לאחר אישור |
| `is_status_on_approval_cancel` | bool | סטטוס בביטול אישור |
| `is_cancelled` | bool | מסמן כבוטל |
| `exclude_from_reports` | bool | מסתיר מדו"חות |
| `duplicate_attachments_to_final` | bool | מעתיק נספחים לתעודה סופית |
| `matrix_skip` | bool | דילוג על מטריצה |
| `external_update` | bool | מעדכן חיצוני |
| `included_in_tasks` | bool | נכלל בלוח משימות |
| `name_en` | text | שם באנגלית (e.g. `Authorized`) |
| `color` | text | צבע ב-state-machine editor |
| `note` | text | הערת admin |

### Approvers Matrix ברמת PO (Image 22)
Sub-screen `אישור הזמנת הרכש` במסך PO:

| מטבע | *החל מסכום | *שם מאשר | מאשר חלופי | אושר | אישר ע"י | תאריך אישור |
|---|---|---|---|---|---|---|
| ש"ח | 0 | יואב | — | ☐ | NULL | NULL |
| ש"ח | 10,000 | סיגל כהן | — | ☐ | NULL | NULL |

→ נוצר דינמית מהתבנית (`רשימת מאשרים`), ומוצמד ל-PO ברגע שהוגדר.
`אישר ע"י` עוזר לאבחן אם הסכים אחראי או backup.

### Master: רשימות מאשרי הזמנות רכש (Image 23)
טבלה Header→Detail:

**Header `erp_po_approver_lists`**:
- `code` (PK, e.g. `00`)
- `description` (e.g. `מאשרי הזמנות רכש - כללי`)
- `is_inactive` boolean

**Detail `erp_po_approver_list_lines`** (FK ל-Header):
- `threshold_amount` numeric — החל מהסכום הזה
- `currency` text
- `approver_user_id` uuid — חובה
- `backup_approver_user_id` uuid — אופציונלי
- `sequence` int — לסדר תצוגה

Default code = `00`. ספק יכול להיות משויך ל-list אחר.

### BPM State-Machine Graph Editor (Image 24)
Priority מספק **עורך graph ויזואלי** לסטטוסים של PO. בכל node:
right-click menu → `חוקים` · `מאפיינים` · `קבע צבע` · `שנה שם` ·
`עדכן הערה` · `מחק` · `סטטוס התחלתי` · `ברירת מחדל לסטטוס התחלתי`.

**חוקים ברמת טרנזישן** (BPM) — חצים אדומים = טרנזישנים מוגבלים. חוק
דוגמה מה-PDF פרק 3: *"רק יואב יכול להעביר ל-'אושרה' אם הסכום < 10,000"*.

### Status inventory — map ברור (Image 25 + Image 24)
Dropdown של PO מציג רשימה מלאה:

| Status HE | Status EN (מוערך) | Canonical flag |
|---|---|---|
| טיוטא | Draft | initial |
| פרופרמה | Proforma | — |
| מחכה לאישור | PendingApproval | triggers email |
| אושרה | Authorized | post_approval, allows_gr |
| נשלחה | Sent | — |
| באוניה | OnShip | for imports |
| אישור משלוח | ShipmentConfirmed | — |
| הגעה חלקית | PartialArrival | allows_gr |
| סגורה | Closed | final, is_closed |
| מבוטלת | Cancelled | is_cancelled |

**Flow diagram (ממופה)**:

```text
         טיוטא ──┬─→ פרופרמה
                 │
                 ├─→ מחכה לאישור ──BPM──→ אושרה
                 │                         │
                 │                         ├─→ נשלחה ──→ באוניה ──→ אישור משלוח
                 │                         │                              │
                 │                         └─→ הגעה חלקית ←───────────────┘
                 │                                      │
                 │                                      ↓
                 └─→ מבוטלת                          סגורה
```

### Implication ל-gap analysis
אצלנו הכל hard-coded ב-RPCs + enum:
- `erp_submit_po_for_approval`
- `erp_decide_approval`
- סטטוסים: DRAFT · PENDING · PENDING_APPROVAL · PENDING_PRICE_APPROVAL
  · PENDING_CEO_APPROVAL · APPROVED · ISSUED · SENT_TO_SUPPLIER
  · PARTIALLY_RECEIVED

**פער ארכיטקטוני**:
| Priority | אצלנו |
|---|---|
| data-driven BPM engine | hard-coded RPCs |
| ויזואלי state-machine editor | — |
| 15+ flags per status | אין טבלת status metadata |
| amount-threshold approver matrix | דיסקרטי (3 סטטוסי approval) |
| backup approver | חסר |
| visual transition rules (BPM) | — |

**לא חייב לבנות הכל ב-Phase A**. המלצה:
- Phase-A-of-PO: להוסיף טבלת `erp_po_status_types` עם הדגלים הקריטיים
  (`allows_gr`, `is_closed`, `is_approved`) ולגבות את ה-enum הקיים.
- Phase-B-of-PO: approver-list matrix (master + line).
- Phase-late (rebuild): BPM engine מלא. לא חייב עכשיו.

---

## Batch #6 (תמונות 26–30) — graph refinement + print + post-approval

### State machine — clean view (Image 27)
**10 states + 1 action-state `פתיחה חוזרת`**. `פתיחה חוזרת` לא מופיע
ב-status dropdown כי הוא state טרנזיטורי שמופעל דרך action, לא בחירה.

**Full transition matrix**:
| From | To | Type |
|---|---|---|
| טיוטא | פרפורמה | direct |
| טיוטא | מחכה לאישור | direct |
| טיוטא | מבוטלת | direct |
| מחכה לאישור | אושרה | **BPM rule** (red marker) |
| מחכה לאישור | מבוטלת | direct |
| אושרה | מבוטלת | direct |
| אושרה | נשלחה | direct |
| אושרה | מחכה לאישור | re-submit (backwards) |
| נשלחה | אישור משלוח | direct |
| אישור משלוח | באוניה | direct |
| באוניה | סגורה | direct |
| סגורה | פתיחה חוזרת | action |
| פתיחה חוזרת | מחכה לאישור | flows back |
| פתיחה חוזרת | סגורה | bypass |

### Print template (Image 28)
Required sections (top-to-bottom):
1. Company header (from `erp_companies`): name, city/postcode, phone,
   fax, VAT registration.
2. Addressee block: supplier name + contact + phone.
3. Shipping address (from PO's `כתובת למשלוח` sub-screen).
4. Dates: `תאריך הזמנה` (PO.date) + `תאריך הדפסה` (now()).
5. Title: `הזמנת רכש מספר <PO#>`.
6. Lines table: `שורה · מק"ט · מק"ט ספק · תאור · כמות · ת.אספקה ·
   מחיר ליחידה · סה"כ`.
7. Totals block (5 rows):
   - מחיר כולל (gross) = SUM(line_total)
   - הנחה כללית = header.discount_pct × gross
   - מחיר אחרי הנחה = gross − discount
   - מע"מ = net × vat_rate
   - סה"כ = net + vat
8. Summary left: מס' פריטים · סה"כ כמות.
9. Footer left-bottom: תנאי תשלום · מס' ספק · מהדורה נוכחית.
10. Footer right: free-text מ-`הזמנות רכש-טקסט` (HTML).
11. Signature block: user full name + company name.

**אצלנו**: יש `print-purchase-order.tsx` — לבדוק כיסוי סעיפים.

### `שינויים בהזמנות רכש מאושרות` (Image 29)
מסך **נפרד** — module/route שונה מ-PO הראשי. הכרחי ל:
- עריכה controlled של PO שכבר אושר.
- שמירת audit trail לכל שינוי (legacy `לוג שינויים לשורת הזמנת רכש - ישן`
  + חדיש `לוג סטטוסים לשורת הזמנת רכש`).
- הבחנה: המסך הראשי + column `ניתנת לשינוי?` ב-lashonית אישורים שולטים
  מי יכול לפתוח את ה-editable form.

**Schema implication**:
- טבלת audit: `erp_po_line_change_log (line_id, changed_by, changed_at,
  field, old_value, new_value)`.
- טבלת status log: `erp_po_status_log (po_id/line_id, from_status,
  to_status, changed_by, changed_at, reason)`.
- אצלנו: `erp_change_orders` קיים — חלקית חופפת.

### Full actions list (Image 30)
**13 פעולות** ב-`הפעלות ישירות` של מסך PO (תיקון/הרחבה):

| # | Action | Status אצלנו |
|---|---|---|
| 1 | הדפסת הזמנת רכש (HE) | ✅ קיים |
| 2 | Print Purchase Order (EN) | ⚠️ חלקי (HE only?) |
| 3 | קבלות סחורה מספק | ✅ GR module קיים |
| 4 | תיקו ביצוע (execution balance drill) | ⚠️ חסר — לבדוק |
| 5 | שמירת מהדורות (revision snapshot) | ⚠️ revisions קיימות |
| 6 | העתקת מהדורות (copy revisions) | ❌ חסר |
| 7 | הקמת מחיר מוסכם | ❌ חסר |
| 8 | יצירת הזמנת רכש חוזרת | ❌ חסר |
| 9 | בניית מטריצה לפי שורה | ❌ חסר |
| 10 | מעצב - דו"ח שגיאות | N/A (developer tool) |
| 11 | דרישת תחליך להדזמה | ❌ חסר |
| 12 | איפוס כולל לעלכות החדמה | ⚠️ חשוב — revert to draft |
| 13 | אשף הזמנות רכש | ⚠️ קיים? |

---

## Batch #7 (תמונות 31–33) — Reports & BI layer

### Image 31 — Report invocation dialog pattern
כל דו"ח ב-Priority נפתח דרך modal עם radio-selection:
- שמור vs חדש (reuse parameters vs fresh)
- output: דו"ח / הדפסה / Excel / גיוון / טעינה
- Saved queries = שורה אחת עם ה-criterion המאוחסן

**Implication**: אצלנו — Report dialog + saved-queries mechanism. לא
קיים בצורה מובנית. Phase-future.

### Image 32 — Full reports & BI tree
`ניתוח הזמנות רכש` sub-menu (8 פריטים, מעבר ל-2 שמוזכרים ב-PDF):

| Priority item | תפקיד | גאפ אצלנו |
|---|---|---|
| הכנת סיכום הזמנות רכש | חישוב aggregates | ❌ |
| הוצאת עוד לה. רכש | export | ❌ |
| טיפוס הזמנות רכש | report type config | ❌ |
| **מחולל דו"חות** | user-custom report builder | ❌ |
| הכנת מלונית BI | BI cube prep | ❌ |
| **ניתוח BI** | BI cube | ❌ |
| אשף מחולל דו"חות | report wizard | ❌ |
| אשף דו"חות מנהלים | manager reports wizard | ❌ |

**אצלנו**: reports module כמעט לא קיים. Phase-late (זה scope של AI-BI).

### Image 33 — `פיגורים באספקות` output
Grouped report (by supplier), 10 columns:
- `הזמנה · שורה · מק"ט · תאור · הוזמן · התקבל · חסר · יח' · ת.מבוקש · ימי פיגור`
- Filter implicit: `ordered > received` AND `requested_date < today`
- Metric: `days_late = today - requested_date`
- Report header: company name + user name + datestamp

**Easy win**: Phase-A של reports — המימוש הכי פשוט, SQL view על
`erp_purchase_order_lines`. נוסיף ב-spec.

---

## Final cross-reference — חיבור תמליל ↔ תמונות

| PDF chapter | PDF timestamp | קטעים מרכזיים | תמונות תואמות |
|---|---|---|---|
| **1. פתיחת PO** | 00:00–03:03 | supplier auto-fill · מטבע ברירת מחדל · מחסן מקבל → כתובת · סוג הזמנה | 1 (header), 2 (אסמכתאות), 6 (תנאי תשלום), 7 (PO Types master) |
| **2. פירוט** | 03:04–05:03 | F6 picker (supplier items only) · Ctrl+F6 (all items) · price waterfall · מקור מחיר · זמינות מוצר · סעיף תקציבי | 11 (text editor), 12 (line actions), 17 (picker), 18 (full line), 19 (help F1), 20 (budget) |
| **3. אישור** | 05:05–08:10 | approver list · thresholds · backup approver · BPM rules · status metadata · email triggers · last-approver skip | 3 (approvals tab), 20 (approvals values), 21 (status properties dialog), 22 (approvers matrix), 23 (approver list master), 24 (state graph), 26 (status props clean), 27 (graph clean) |
| **4. תיקון PO מאושר** | 08:10–08:30 | מסך נפרד · audit log לשורה · status log | 29 (changes screen) |
| **5. המשך טיפול** | 08:31–10:16 | auto-close GR/SI · יתרה לאספקה · סגורה flag · reports (open, delays) · BI · wizards | 13 (attachments), 25 (status dropdown full), 28 (print), 30 (actions list expanded), 31 (report dialog), 32 (BI tree), 33 (delays report output) |

**Orphan findings** (not in PDF):
- Image 8–10 (batch 2): Sales Order mirror — reference לא-PO.
- Image 14: "מוצרים לספק" master (Supplier Items) — foundation ל-PDF פרק 2.
- Image 15: Split-screen PO+Items — UX pattern, לא בתמליל.

---

## Image 34 — חוב מפעילות קודמת (לא חלק ממחקר PO)

צילום של **המסך שלנו** `/marker-ofek/procurement/suppliers` עם:
- טבלה מציגה 3 ספקים: `CHUL`/חולית · `GANI`/גני דוד · `PLAS`/פלסטי גן
- KPI strip: סה"כ פעילים 3 · ערך נמוך מהסף — · חוב פעיל — · ספקים בסיכון 0
- כל עמודות המטריקה (`PO פתוח`, `חוב פתוח`, `תעלות ארוזות`) = dashes
- הערה אדומה כתובה ביד של המשתמש

**שורש הבעיה המשתקפת** (פרשנות העלת הסמך):
- ה-detail drawer של הספק הנבחר **ריק** (אזור תחתון ריק עם placeholder).
- Navigation לכרטיס ספק/חזרה מ-drawer לא ברור.
- AI suggestions לא מופיעות כצפוי.

→ נטפל בזה **בנפרד** אחרי שנסיים את ה-PO spec (או לפני, לפי העדפת
המשתמש). נדרש screenshot נוסף בגודל מלא + זום על ההערה כדי לפענח
בדיוק.

---

## ✅ מחקר PO הושלם — מוכן ל-synthesis

כל 33 התמונות הרלוונטיות + ה-PDF נותחו ומוצלבות. הצעד הבא: איחוד
הערות ל-**2 מסמכים רשמיים**:

1. **`docs/ingested-specs/priority-purchase-order-sop.md`** —
   read-only mirror של ה-PDF (transcript ב-Hebrew, structured).
2. **`docs/architecture/po-card-spec.md`** — gap analysis + תכנית
   פאזות (A–F כמו ב-supplier).

לאחר מכן: מחיקת קובץ זה (`po-research-notes.md`).
