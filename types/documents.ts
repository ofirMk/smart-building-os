export type DocumentType = "lease" | "warranty" | "building_plans" | "general"

export type DocumentRelatedTo = "tenant" | "vendor" | "building" | "general"

export type DocumentRow = {
  id: string
  title: string
  document_type: DocumentType
  related_to: DocumentRelatedTo
  file_url: string
  storage_path: string
  file_name: string | null
  content_type: string | null
  created_at: string
  updated_at: string
}
