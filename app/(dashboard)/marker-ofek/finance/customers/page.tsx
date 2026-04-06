import type { Metadata } from "next"

import { fetchFinanceCustomers } from "@/lib/marker-ofek/finance-customers-actions"

import { CustomersListClient } from "./customers-list-client"

export const metadata: Metadata = {
  title: "לקוחות — CRM כספי",
}

export default async function FinanceCustomersPage() {
  const rows = await fetchFinanceCustomers()
  return <CustomersListClient initialRows={rows} />
}
