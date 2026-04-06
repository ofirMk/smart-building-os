import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { fetchCustomer360 } from "@/lib/marker-ofek/finance-customers-actions"

import { Customer360Client } from "./customer-360-client"

type PageProps = {
  params: Promise<{ id: string }> | { id: string }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolved = await Promise.resolve(params)
  const id = String(resolved.id ?? "").trim()
  const data = id ? await fetchCustomer360(id) : null
  const name = data?.customer?.name ?? "לקוח"
  return { title: `${name} — CRM` }
}

export default async function FinanceCustomerDetailPage({ params }: PageProps) {
  const resolved = await Promise.resolve(params)
  const id = String(resolved.id ?? "").trim()
  if (!id) notFound()

  const data = await fetchCustomer360(id)
  const customer = data?.customer
  if (!data || !customer) notFound()

  return (
    <Customer360Client
      initial={{
        customer,
        invoices: data.invoices,
        receipts: data.receipts,
        openBalance: data.openBalance,
      }}
    />
  )
}
