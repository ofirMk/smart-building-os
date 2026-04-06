import type { Metadata } from "next"

import { fetchFinanceCustomers } from "@/lib/marker-ofek/finance-customers-actions"

import { ReceiptNewClient } from "./receipt-new-client"

export const metadata: Metadata = {
  title: "קבלה חדשה",
}

export default async function NewReceiptPage() {
  const customers = await fetchFinanceCustomers()
  return <ReceiptNewClient customers={customers} />
}
