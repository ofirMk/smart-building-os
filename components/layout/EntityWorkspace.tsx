"use client"

import * as React from "react"

import { EntityWorkspaceLayout } from "@/components/layout/EntityWorkspaceLayout"
import { ACTIVE_PROJECT_CHANGED_EVENT } from "@/lib/project-context"

type EntityWorkspaceProps = {
  title: string
  description?: string
  headerActions?: React.ReactNode
  sidebar: React.ReactNode
  main: React.ReactNode
  footerActions?: React.ReactNode
  className?: string
}

export function EntityWorkspace(props: EntityWorkspaceProps) {
  const [projectRevision, setProjectRevision] = React.useState(0)

  React.useEffect(() => {
    const onProjectChanged = () => {
      setProjectRevision((prev) => prev + 1)
    }
    window.addEventListener(ACTIVE_PROJECT_CHANGED_EVENT, onProjectChanged)
    return () => {
      window.removeEventListener(ACTIVE_PROJECT_CHANGED_EVENT, onProjectChanged)
    }
  }, [])

  return (
    <EntityWorkspaceLayout
      key={projectRevision}
      title={props.title}
      description={props.description}
      headerActions={props.headerActions}
      sidebar={props.sidebar}
      main={props.main}
      footerActions={props.footerActions}
      className={props.className}
    />
  )
}
