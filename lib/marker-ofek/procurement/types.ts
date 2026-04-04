export type AssetCategory =
  | "vehicle"
  | "heavy_machinery"
  | "power_tools"
  | "it_equipment"

export interface CompanyAsset {
  id: string
  assetName: string
  serialNumber: string
  category: AssetCategory
  lastServiceDate?: string
  nextServiceDate?: string
  status: "active" | "maintenance" | "retired"
}

export interface PurchaseOrder {
  id: string
  orderNumber: number
  supplierId: string
  status: "draft" | "sent" | "received"
  items: Array<{
    catalogId: string
    quantity: number
    pricePerUnit: number
  }>
}
