/** קבועים וטיפוסים ל־contract vault — מיובאים מקומפוננטות לקוח ללא `"use server"` */

export const CONTRACT_VAULT_BUCKET = "mo-contract-vault"

export type VaultSensitiveLevel = "standard" | "confidential" | "restricted"

export type VaultDocumentRow = {
  id: string
  project_id: string
  storage_path: string
  file_name: string
  mime_type: string
  file_size_bytes: number
  sensitive_level: VaultSensitiveLevel
  viewer_admin: boolean
  viewer_manager: boolean
  viewer_partner: boolean
  ingest_status: string
  ocr_text: string | null
  ingest_error: string | null
  created_at: string
}
