/** ערכי DB: mo_tender_document_status */
export type MoTenderDocumentStatus =
  | "to_execution"
  | "for_review"
  | "for_tender"
  | "ai_failed"

/** ערכי DB: mo_tender_document_type */
export type MoTenderDocumentType =
  | "boq"
  | "tech_spec"
  | "sale_spec"
  | "drawing_electrical"
  | "drawing_general"

export type TenderDocumentFloorsData = {
  labels: string[]
  vertical_hints?: string[]
  /** שמירת שם יועץ מהניתוח (אין עמודה ייעודית ב-DB) */
  ai_consultant?: string
}

/** מודל אנכי לוויזואליזציה — גג למעלה, מרתף למטה */
export type BuildingStructureSegment = {
  id: string
  /** תווית קצרה בעברית */
  label_he: string
  /** סוג: roof | parking | ground | residential | commercial | basement | mechanical | other */
  segment_type: string
  /** 0 = גג, ערכים גבוהים יותר = למטה */
  order_from_top: number
  /** טווח קומות אופציונלי */
  floor_range?: string
  notes?: string
}

export type BuildingStructureRawData = {
  summary_he?: string
  segments: BuildingStructureSegment[]
}

export type SingleDocumentAiExtraction = {
  project_name: string
  document_date: string
  consultant_or_engineer: string
  status: MoTenderDocumentStatus | "unknown"
  status_evidence: string
  document_type: MoTenderDocumentType | "unknown"
  floors_mentioned: string[]
  tags: string[]
  vertical_hints: string[]
}
