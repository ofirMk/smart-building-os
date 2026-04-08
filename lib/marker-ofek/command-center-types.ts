export type CommandCenterHealthLevel = "green" | "yellow" | "red"

export type CommandCenterTile = {
  title: string
  href: string
  summary: string
  highlights: string[]
  quickActionLabel: string
  quickActionHref: string
  level: CommandCenterHealthLevel
  summaryMono?: boolean
  articleClassName?: string
}

export type CommandCenterSnapshot = {
  tiles: CommandCenterTile[]
  poPendingApproval: number
  /** יומני שטח (project_daily_logs) מאתמול במצב טיוטה — אישור לחיוב */
  draftFieldLogsYesterday: number
  weeklyExecutionLogs: number
  openTendersCount: number
  scheduleExceptions: number
  staleDraftPartials: number
  ganttHref: string
}
