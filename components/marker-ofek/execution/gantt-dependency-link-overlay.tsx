"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import type { Task } from "gantt-task-react"

import { getVisibleGanttTasksForChart } from "@/lib/marker-ofek/gantt-visible-tasks"
import { buildOrthogonalFsPreviewPath } from "@/lib/marker-ofek/gantt-dependency-path"

function findMoGanttRoot(host: Element | null): Element | null {
  return host?.querySelector(".mo-gantt-root") ?? null
}

function findMainBarSvg(host: Element | null): SVGSVGElement | null {
  const root = findMoGanttRoot(host)
  if (!root) return null
  const col = root.querySelector(".mo-gantt-timeline-col")
  if (!col) return null
  for (const svg of col.querySelectorAll("svg")) {
    if (svg.querySelector("g.bar")) return svg as SVGSVGElement
  }
  return null
}

function findTimelineScrollElements(host: Element | null): HTMLElement[] {
  const root = findMoGanttRoot(host)
  const col = root?.querySelector(".mo-gantt-timeline-col")
  if (!col) return []
  const out: HTMLElement[] = []
  if (col instanceof HTMLElement) out.push(col)
  for (let i = 0; i < col.children.length; i++) {
    const el = col.children[i]
    if (el instanceof HTMLElement) out.push(el)
  }
  return out
}

function getBarRowGroups(svg: SVGSVGElement): SVGGElement[] {
  const bar = svg.querySelector("g.bar")
  if (!bar) return []
  return Array.from(bar.children).filter((n): n is SVGGElement => n instanceof SVGGElement)
}

function getBarBackgroundBBox(rowG: SVGGElement): { x: number; y: number; width: number; height: number } | null {
  const wrapper = rowG.querySelector("g.barWrapper")
  const rect = wrapper?.querySelector("rect")
  if (!(rect instanceof SVGRectElement)) return null
  return rect.getBBox()
}

function svgPointFromClient(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: clientX, y: clientY }
  const p = pt.matrixTransform(ctm.inverse())
  return { x: p.x, y: p.y }
}

function readBarGeoms(
  host: HTMLElement | null,
  visibleTasks: Task[],
  rtl: boolean
): Array<{
  id: string
  finishX: number
  startX: number
  cy: number
  rowTop: number
  rowBottom: number
}> {
  const svg = findMainBarSvg(host)
  if (!svg) return []
  const groups = getBarRowGroups(svg)
  const result: Array<{
    id: string
    finishX: number
    startX: number
    cy: number
    rowTop: number
    rowBottom: number
  }> = []
  const n = Math.min(groups.length, visibleTasks.length)
  for (let i = 0; i < n; i++) {
    const task = visibleTasks[i]!
    const bbox = getBarBackgroundBBox(groups[i]!)
    if (!bbox || bbox.width <= 0) continue
    const finishX = rtl ? bbox.x : bbox.x + bbox.width
    const startX = rtl ? bbox.x + bbox.width : bbox.x
    const cy = bbox.y + bbox.height / 2
    result.push({
      id: task.id,
      finishX,
      startX,
      cy,
      rowTop: bbox.y,
      rowBottom: bbox.y + bbox.height,
    })
  }
  return result
}

const LAYER_CLASS = "mo-gantt-dep-link-layer"
const HANDLE_R = 5

type Props = {
  ganttHostRef: React.RefObject<HTMLElement | null>
  tasks: Task[]
  rtl: boolean
  disabled?: boolean
  onLinkFs: (predecessorId: string, successorId: string) => void | Promise<void>
}

export function GanttDependencyLinkOverlay({ ganttHostRef, tasks, rtl, disabled, onLinkFs }: Props) {
  const markerUid = React.useId().replace(/:/g, "")
  const markerId = `mo-gantt-fs-arrowhead-${markerUid}`
  const [portalTarget, setPortalTarget] = React.useState<SVGGElement | null>(null)
  const [layoutVersion, setLayoutVersion] = React.useState(0)
  const bumpLayout = React.useCallback(() => setLayoutVersion((n) => n + 1), [])

  const visibleTasks = React.useMemo(
    () => getVisibleGanttTasksForChart(tasks, true),
    [tasks]
  )

  const geoms = React.useMemo(
    () => readBarGeoms(ganttHostRef.current, visibleTasks, rtl),
    [ganttHostRef, visibleTasks, rtl, portalTarget, layoutVersion, tasks]
  )

  React.useLayoutEffect(() => {
    const host = ganttHostRef.current
    const svg = findMainBarSvg(host)
    if (!svg || disabled) {
      setPortalTarget(null)
      return
    }
    let layer = svg.querySelector(`g.${LAYER_CLASS}`) as SVGGElement | null
    if (!layer) {
      layer = document.createElementNS("http://www.w3.org/2000/svg", "g")
      layer.setAttribute("class", LAYER_CLASS)
      svg.appendChild(layer)
    }
    setPortalTarget(layer)
  }, [ganttHostRef, disabled, visibleTasks.length, tasks])

  React.useEffect(() => {
    const host = ganttHostRef.current
    if (!host) return
    const els = findTimelineScrollElements(host)
    const onScroll = () => bumpLayout()
    els.forEach((el) => el.addEventListener("scroll", onScroll, { passive: true }))
    const ro = new ResizeObserver(() => bumpLayout())
    ro.observe(host)
    return () => {
      els.forEach((el) => el.removeEventListener("scroll", onScroll))
      ro.disconnect()
    }
  }, [ganttHostRef, bumpLayout, visibleTasks.length])

  const [drag, setDrag] = React.useState<null | { sourceId: string; fx: number; fy: number }>(null)
  const [cursorSvg, setCursorSvg] = React.useState<{ x: number; y: number } | null>(null)

  const endDrag = React.useCallback(() => {
    setDrag(null)
    setCursorSvg(null)
  }, [])

  React.useEffect(() => {
    if (!drag) return
    const host = ganttHostRef.current
    const svg = findMainBarSvg(host)
    if (!svg) return

    const onMove = (e: MouseEvent) => {
      setCursorSvg(svgPointFromClient(svg, e.clientX, e.clientY))
    }

    const onUp = (e: MouseEvent) => {
      const p = svgPointFromClient(svg, e.clientX, e.clientY)
      const predId = drag.sourceId
      const fresh = readBarGeoms(host, getVisibleGanttTasksForChart(tasks, true), rtl)

      let succId: string | null = null
      const hitPadX = 20
      const hitPadY = 12

      for (const g of fresh) {
        if (g.id === predId) continue
        const nearX = Math.abs(p.x - g.startX) <= hitPadX
        const nearY = p.y >= g.rowTop - hitPadY && p.y <= g.rowBottom + hitPadY
        if (nearX && nearY) {
          succId = g.id
          break
        }
      }

      endDrag()
      if (succId && predId !== succId) {
        void Promise.resolve(onLinkFs(predId, succId))
      }
    }

    window.addEventListener("mousemove", onMove, true)
    window.addEventListener("mouseup", onUp, true)
    return () => {
      window.removeEventListener("mousemove", onMove, true)
      window.removeEventListener("mouseup", onUp, true)
    }
  }, [drag, ganttHostRef, onLinkFs, endDrag, tasks, rtl])

  const previewD = React.useMemo(() => {
    if (!drag || !cursorSvg) return ""
    return buildOrthogonalFsPreviewPath(drag.fx, drag.fy, cursorSvg.x, cursorSvg.y, rtl)
  }, [drag, cursorSvg, rtl])

  if (!portalTarget || disabled) return null

  const content = (
    <>
      <defs>
        <marker
          id={markerId}
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="4"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M 0 0 L 8 4 L 0 8 z" fill="#6366f1" />
        </marker>
      </defs>

      {geoms.map((g) => {
        const task = visibleTasks.find((t) => t.id === g.id)
        const isProject = task?.type === "project"
        if (isProject) return null

        return (
          <g key={`h-${g.id}`} style={{ pointerEvents: "auto" }}>
            <title>גרור קשר Finish-to-Start מסיום המשימה</title>
            <circle
              cx={g.finishX}
              cy={g.cy}
              r={HANDLE_R}
              fill="#6366f1"
              stroke="#312e81"
              strokeWidth={1}
              style={{ cursor: "crosshair", pointerEvents: "all" }}
              onMouseDown={(e) => {
                e.stopPropagation()
                e.preventDefault()
                setDrag({ sourceId: g.id, fx: g.finishX, fy: g.cy })
                const s = findMainBarSvg(ganttHostRef.current)
                if (s) setCursorSvg(svgPointFromClient(s, e.clientX, e.clientY))
              }}
            />
          </g>
        )
      })}

      {drag && cursorSvg ? (
        <path
          d={previewD}
          fill="none"
          stroke="#6366f1"
          strokeWidth={1.5}
          strokeDasharray="5 4"
          pointerEvents="none"
          markerEnd={`url(#${markerId})`}
        />
      ) : null}
    </>
  )

  return createPortal(content, portalTarget)
}
