# Sample Imports — Lihtman Onboarding

קבצי CSV לדוגמה לכל אחד מ-10 ה-importers הרשומים. הם משמשים שתי מטרות:

1. **Templates ללייטמן** — מבנה השדות המדויק שאנחנו מצפים להם בייצוא Priority. ה-Hebrew headers הם ה-aliases הראשיים, אז ייצוא ישיר מ-Tabula → Excel → CSV אמור לעבוד "as-is".
2. **Test fixtures** — סקריפט `npm run dry-run:imports` מריץ את כל הקבצים דרך ה-engine (פרסור + validation + transforms, ללא DB) ומדווח על כל בעיה. CI-friendly (exit code != 0 על failure).

## הקבצים

| Importer | קובץ | שורות | תלות בייבוא קודם |
|---|---|---|---|
| `suppliers` | `suppliers.csv` | 5 | — |
| `product_families` | `product-families.csv` | 4 | — |
| `projects` | `projects.csv` | 3 | — |
| `accounts` | `accounts.csv` | 9 | — |
| `items` | `items.csv` | 6 | `product_families` |
| `subcontractor_contracts` | `subcontractor-contracts.csv` | 3 | `projects` + `suppliers` |
| `purchase_orders` | `purchase-orders.csv` | 4 | `projects` + `suppliers` |
| `opening_balances` | `opening-balances.csv` | 4 | `accounts` |
| `contract_boq_lines` | `contract-boq-lines.csv` | 9 | `subcontractor_contracts` |
| `purchase_order_lines` | `purchase-order-lines.csv` | 8 | `purchase_orders` |

## נתוני הדוגמה — קונסיסטנטיים

הקבצים תוכננו כך שאם תייבא אותם בסדר הזה ל-DB ריק (טבלת `marker_ofek`), כל ה-cross-references ייפתרו:

- **3 פרויקטים**: `P-2401` מגדל לייטמן, `P-2402` גיאה גן יבנה, `P-2403` קניון אשדוד.
- **5 ספקים**: `S-1001`...`S-1005` (כולל 2 קבלני משנה).
- **3 חוזי קבלן משנה** עם שורות BOQ ריאליות.
- **4 PO פתוחים** עם שורות מקושרות.
- **יתרות פתיחה מאוזנות** ל-01/01/2026: סך חיובים ₪4,250,000 = סך זיכויים ₪4,250,000.

## הרצת dry-run

```bash
npm run dry-run:imports
```

פלט מצופה:

```
DRY-RUN REPORT — sample-imports/
================================================================================
  PASS  accounts.csv                  kind=accounts                  9/9 valid
  PASS  contract-boq-lines.csv        kind=contract_boq_lines        9/9 valid
  PASS  items.csv                     kind=items                     6/6 valid
  PASS  opening-balances.csv          kind=opening_balances          4/4 valid
  PASS  product-families.csv          kind=product_families          4/4 valid
  PASS  projects.csv                  kind=projects                  3/3 valid
  PASS  purchase-order-lines.csv      kind=purchase_order_lines      8/8 valid
  PASS  purchase-orders.csv           kind=purchase_orders           4/4 valid
  PASS  subcontractor-contracts.csv   kind=subcontractor_contracts   3/3 valid
  PASS  suppliers.csv                 kind=suppliers                 5/5 valid
================================================================================

All 10 sample CSVs passed dry-run validation.
```

## ⚠ baselines שנתפסו ב-Step 7

| תאריך | באג | פתרון |
|---|---|---|
| 10/05/2026 | `FIXED_PRICE` לא חוקי כ-`contract_type`. הערכים החוקיים הם `PAUSHALI / MEASURED / TARGET / COST_PLUS`. | תיקון `subcontractor-contracts.csv` ל-`PAUSHALI`/`MEASURED`. נדרש להוסיף ל-Lihtman data-mapping. |

## איך להוסיף קובץ דוגמה חדש

1. שמור CSV בתיקייה הזו (UTF-8, headers בעברית כפי שמוכרים מ-Priority).
2. הוסף mapping ל-`scripts/dry-run-imports.ts` ב-`FILE_TO_KIND`.
3. הרץ `npm run dry-run:imports` — הוא צריך לעלות PASS לפני commit.
