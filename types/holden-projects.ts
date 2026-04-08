/**
 * Holden ERP — תכנון פרויקט (WBS, BoQ) — מיפוי ל־public.erp_project_*
 */

/** אבן דרך / שלב ביצוע (Priority / גאנט) */
export type ProjectWbsNode = {
  id: string
  project_id: string
  milestone_name: string
  planned_amount: number
  progress_pct: number
  target_date: string | null
  status: string
  manager_name: string
  created_at: string
  updated_at: string
}

/** שורת BoQ תכנונית — כמות ועלות יחידה מול מק״ט קטלוג */
export type ProjectBoqLine = {
  id: string
  project_id: string
  item_sku: string
  planned_quantity: number
  uom: string
  estimated_unit_cost: number
  created_at: string
  updated_at: string
}
