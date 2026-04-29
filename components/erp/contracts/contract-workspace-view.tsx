"use client"

import * as React from "react"
import { FileText } from "lucide-react"

import { DenseMasterDetailTemplate } from "@/components/layout/DenseMasterDetailTemplate"

type ContractWorkspaceViewProps = {
  title: string
  description: string
  headerActions?: React.ReactNode
  master: React.ReactNode
  detail: React.ReactNode
}

export function ContractWorkspaceView({
  title,
  description,
  headerActions,
  master,
  detail,
}: ContractWorkspaceViewProps) {
  return (
    <div dir="rtl" className="flex-1 min-h-0 overflow-y-auto bg-[#F8FAFC]">
      <DenseMasterDetailTemplate
        title={title}
        description={description}
        leading={<FileText />}
        className="bg-[#F8FAFC]"
        backLink={{ href: "/contracts", label: "חזרה לרשימת חוזים" }}
        headerActions={headerActions}
        master={master}
        detail={detail}
      />
    </div>
  )
}
