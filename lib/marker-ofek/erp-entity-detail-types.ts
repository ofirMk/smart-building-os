import type { QuickEntityInput } from "@/lib/marker-ofek/erp-validation-schemas"
import type { Database } from "@/types/supabase"

/** שורת חוזה לרשימה בתצוגת ישות (שדות צרים מ־`contracts`). */
export type EntityContractListRow = Pick<
  Database["public"]["Tables"]["contracts"]["Row"],
  | "id"
  | "contract_type"
  | "pricing_model"
  | "contract_number"
  | "name"
  | "start_date"
  | "total_amount"
>

/** ישות מלאה מה־DB לתצוגת Master–Detail (מעבר לשדות ה־Zod של טופס יצירה מהירה). */
export type ErpEntityData = QuickEntityInput & {
  id: string
  created_at?: string
  status?: string
  mo_entity_code?: string | null
}
