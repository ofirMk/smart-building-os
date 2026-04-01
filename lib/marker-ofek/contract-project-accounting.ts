/**
 * מחירון ייחוס "דקל" — פריטים לדוגמה (אינטגרציות עתידיות).
 */

export type DekelReferenceItem = {
  code: string
  description: string
  unit: string
  unit_price: number
}

export const DEKEL_REFERENCE_PRICE_LIST: DekelReferenceItem[] = [
  {
    code: "DK-ELEC-01",
    description: "הזזת נקודת חשמל",
    unit: "יח׳",
    unit_price: 450,
  },
  {
    code: "DK-PLB-01",
    description: "הזזת נקודת מים / ניקוז",
    unit: "יח׳",
    unit_price: 620,
  },
  {
    code: "DK-AC-01",
    description: "הוספת נקודת מזגן (כולל חציבה בסיסית)",
    unit: "יח׳",
    unit_price: 1850,
  },
  {
    code: "DK-TILE-01",
    description: "החלפת ריצוף חדר רחצה — עבודה + חומר סטנדרטי",
    unit: "מ״ר",
    unit_price: 280,
  },
  {
    code: "DK-DOOR-01",
    description: "שדרוג דלת פנים + משקוף",
    unit: "יח׳",
    unit_price: 2200,
  },
  {
    code: "DK-KITCHEN-01",
    description: "הרחבת מטבח — עבודת נגרות בסיסית",
    unit: "רץ מ״",
    unit_price: 950,
  },
]
