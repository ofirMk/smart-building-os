import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getBuildingDetail } from "@/lib/buildings"

import { EditBuildingForm } from "../edit-building-form"

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const { data } = await getBuildingDetail(id)
  return { title: data ? `עריכה: ${data.name}` : "עריכת בניין" }
}

export default async function EditBuildingPage({ params }: Props) {
  const { id } = await params
  const { data, error } = await getBuildingDetail(id)

  if (error || !data) {
    notFound()
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <EditBuildingForm building={data} />
    </div>
  )
}
