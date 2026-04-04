"use server"

import { addDays, format, startOfDay } from "date-fns"

import {
  recalculateWbsSchedule,
  syncWbsLevelsFromTree,
} from "@/lib/marker-ofek/gantt-actions"
import { computeWbsCodeMapForTree } from "@/lib/marker-ofek/wbs-code-numbering"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { revalidatePath } from "next/cache"

export type WbsStructureRow = {
  id: string
  name: string
  is_template: boolean
  project_id: string | null
  created_at: string
}

export type WbsNodeRow = {
  id: string
  structure_id: string
  parent_node_id: string | null
  label: string
  sort_order: number
  wbs_code: string | null
  metadata: Record<string, unknown>
}

export async function listProjectsForWbsSelector(): Promise<
  { id: string; name: string; internal_project_code: string }[]
> {
  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase
    .schema("public")
    .from("projects")
    .select("id, name, internal_project_code")
    .eq("is_deleted", false)
    .order("name", { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as { id: string; name: string; internal_project_code: string }[]
}

export async function listWbsStructures(): Promise<WbsStructureRow[]> {
  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase
    .schema("public")
    .from("wbs_structures")
    .select("id, name, is_template, project_id, created_at")
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as WbsStructureRow[]
}

export async function getWbsNodes(structureId: string): Promise<WbsNodeRow[]> {
  const sid = String(structureId ?? "").trim()
  if (!sid) return []
  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase
    .schema("public")
    .from("wbs_nodes")
    .select("id, structure_id, parent_node_id, label, sort_order, wbs_code, metadata")
    .eq("structure_id", sid)
    .order("sort_order", { ascending: true })
  if (error) throw new Error(error.message)
  return ((data ?? []) as WbsNodeRow[]).map((r) => ({
    ...r,
    wbs_code:
      r.wbs_code == null || String(r.wbs_code).trim() === ""
        ? null
        : String(r.wbs_code).trim(),
    metadata: (r.metadata && typeof r.metadata === "object" ? r.metadata : {}) as Record<
      string,
      unknown
    >,
  }))
}

export type WbsEditorTreeNode = {
  id: string
  label: string
  sort_order: number
  /** Optional; UI may show computed codes from tree shape instead. */
  wbs_code?: string | null
  children: WbsEditorTreeNode[]
}

type UiTreeNode = WbsEditorTreeNode

function rowsToTree(rows: WbsNodeRow[]): UiTreeNode[] {
  const byParent = new Map<string | null, WbsNodeRow[]>()
  for (const r of rows) {
    const k = r.parent_node_id
    const list = byParent.get(k) ?? []
    list.push(r)
    byParent.set(k, list)
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order)
  }
  function build(parentId: string | null): UiTreeNode[] {
    const list = byParent.get(parentId) ?? []
    return list.map((r) => ({
      id: r.id,
      label: r.label,
      sort_order: r.sort_order,
      wbs_code: r.wbs_code,
      children: build(r.id),
    }))
  }
  return build(null)
}

/** Flatten tree with stable parent references using temporary keys before insert. */
function flattenTreeForSave(
  nodes: UiTreeNode[],
  parentTempId: string | null
): {
  tempId: string
  parentTempId: string | null
  label: string
  sort_order: number
}[] {
  const out: {
    tempId: string
    parentTempId: string | null
    label: string
    sort_order: number
  }[] = []
  let order = 0
  function walk(list: UiTreeNode[], parentTemp: string | null) {
    for (const n of list) {
      const tempId = n.id
      out.push({
        tempId,
        parentTempId: parentTemp,
        label: n.label.trim() || "ללא שם",
        sort_order: order++,
      })
      if (n.children.length) walk(n.children, tempId)
    }
  }
  walk(nodes, parentTempId)
  return out
}

export async function saveWbsStructure(input: {
  structureId?: string | null
  name: string
  isTemplate: boolean
  projectId?: string | null
  tree: WbsEditorTreeNode[]
}) {
  const name = String(input.name ?? "").trim()
  if (!name) throw new Error("שם מבנה נדרש")
  const supabase = await createSupabaseServerAuthClient()
  const isTemplate = Boolean(input.isTemplate)
  const projectId = input.projectId?.trim() || null
  if (!isTemplate && !projectId) throw new Error("למבנה שאינו תבנית יש לשייך פרויקט")

  const flat = flattenTreeForSave(input.tree, null)
  if (flat.length === 0) throw new Error("הוסיפו לפחות צומת אחד")

  let structureId = String(input.structureId ?? "").trim() || null

  if (structureId) {
    const { error: uErr } = await supabase
      .schema("public")
      .from("wbs_structures")
      .update({
        name,
        is_template: isTemplate,
        project_id: isTemplate ? null : projectId,
      })
      .eq("id", structureId)
    if (uErr) throw new Error(uErr.message)
  } else {
    const { data: ins, error: cErr } = await supabase
      .schema("public")
      .from("wbs_structures")
      .insert({
        name,
        is_template: isTemplate,
        project_id: isTemplate ? null : projectId,
      })
      .select("id")
      .single()
    if (cErr || !ins?.id) throw new Error(cErr?.message ?? "שמירת מבנה נכשלה")
    structureId = String(ins.id)
  }

  const { data: existingNodes, error: exErr } = await supabase
    .schema("public")
    .from("wbs_nodes")
    .select("id")
    .eq("structure_id", structureId!)
  if (exErr) throw new Error(exErr.message)
  const existingIds = new Set(
    (existingNodes ?? []).map((r: { id: string }) => String(r.id))
  )

  /** Client-generated ids (`n-…`) are always new rows; DB UUIDs that still exist are preserved for plan links. */
  function isEphemeralEditorNodeId(id: string): boolean {
    return id.startsWith("n-")
  }

  const tempToUuid = new Map<string, string>()
  for (const row of flat) {
    const tid = row.tempId
    if (!isEphemeralEditorNodeId(tid) && existingIds.has(tid)) {
      tempToUuid.set(tid, tid)
    } else {
      tempToUuid.set(tid, crypto.randomUUID())
    }
  }

  const desiredIds = new Set<string>()
  for (const row of flat) {
    desiredIds.add(tempToUuid.get(row.tempId)!)
  }
  const toDelete = [...existingIds].filter((id) => !desiredIds.has(id))
  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .schema("public")
      .from("wbs_nodes")
      .delete()
      .in("id", toDelete)
    if (delErr) throw new Error(delErr.message)
  }

  const codeMap = computeWbsCodeMapForTree(input.tree)
  const pending = new Set(flat.map((r) => r.tempId))
  let guard = 0
  while (pending.size > 0) {
    if (++guard > flat.length + 5) {
      throw new Error("מבנה WBS לא תקין — בדקו את ההיררכיה")
    }
    let progressed = false
    for (const r of flat) {
      if (!pending.has(r.tempId)) continue
      const p = r.parentTempId
      if (p != null && pending.has(p)) continue
      const id = tempToUuid.get(r.tempId)!
      const parentId = p != null ? tempToUuid.get(p)! : null
      const { error: upErr } = await supabase
        .schema("public")
        .from("wbs_nodes")
        .upsert(
          {
            id,
            structure_id: structureId!,
            parent_node_id: parentId,
            label: r.label,
            sort_order: r.sort_order,
            wbs_code: codeMap.get(r.tempId) ?? null,
            metadata: {} as Record<string, unknown>,
          },
          { onConflict: "id" }
        )
      if (upErr) throw new Error(upErr.message)
      pending.delete(r.tempId)
      progressed = true
    }
    if (!progressed) {
      throw new Error("מבנה WBS לא תקין — הורה חסר או מעגל")
    }
  }

  revalidatePath("/marker-ofek/tenders/wbs")
  revalidatePath("/marker-ofek/execution/gantt")
  const refreshed = await getWbsStructureForEditor(structureId!)
  return {
    ok: true as const,
    structureId: structureId!,
    tree: refreshed?.tree?.length ? refreshed.tree : input.tree,
  }
}

export async function getWbsStructureForEditor(structureId: string) {
  const sid = String(structureId ?? "").trim()
  if (!sid) return null
  const supabase = await createSupabaseServerAuthClient()
  const { data: st, error } = await supabase
    .schema("public")
    .from("wbs_structures")
    .select("id, name, is_template, project_id, created_at")
    .eq("id", sid)
    .maybeSingle()
  if (error || !st) return null
  const nodes = await getWbsNodes(sid)
  return {
    structure: st as WbsStructureRow,
    tree: rowsToTree(nodes),
  }
}

export async function saveWbsAsTemplate(structureId: string, templateName: string) {
  const sid = String(structureId ?? "").trim()
  const name = String(templateName ?? "").trim()
  if (!sid) throw new Error("מבנה לא נבחר")
  if (!name) throw new Error("שם תבנית נדרש")
  const nodes = await getWbsNodes(sid)
  const tree = rowsToTree(nodes)
  return saveWbsStructure({
    structureId: null,
    name,
    isTemplate: true,
    projectId: null,
    tree,
  })
}

/** New structure + nodes copied from an existing template (or any structure). */
export async function cloneWbsStructureFromTemplate(input: {
  sourceStructureId: string
  name: string
  asTemplate: boolean
  projectId?: string | null
}) {
  const sid = String(input.sourceStructureId ?? "").trim()
  const name = String(input.name ?? "").trim()
  if (!sid) throw new Error("מבנה מקור לא נבחר")
  if (!name) throw new Error("שם מבנה נדרש")
  const asTemplate = Boolean(input.asTemplate)
  const projectId = input.projectId?.trim() || null
  if (!asTemplate && !projectId) throw new Error("למבנה שאינו תבנית יש לשייך פרויקט")

  const nodes = await getWbsNodes(sid)
  if (nodes.length === 0) throw new Error("למבנה המקור אין צמתים")
  const tree = rowsToTree(nodes)
  return saveWbsStructure({
    structureId: null,
    name,
    isTemplate: asTemplate,
    projectId: asTemplate ? null : projectId,
    tree,
  })
}

async function clearProjectScheduleTasks(projectId: string) {
  const supabase = await createSupabaseServerAuthClient()
  const { error: d1 } = await supabase
    .schema("public")
    .from("tasks")
    .delete()
    .eq("project_id", projectId)
    .eq("is_derivative", true)
  if (d1) throw new Error(d1.message)

  const { error: u } = await supabase
    .schema("public")
    .from("tasks")
    .update({ parent_id: null, predecessor_task_id: null, parent_task_id: null })
    .eq("project_id", projectId)
  if (u) throw new Error(u.message)

  const { error: d2 } = await supabase
    .schema("public")
    .from("tasks")
    .delete()
    .eq("project_id", projectId)
  if (d2) throw new Error(d2.message)
}

function defaultDates() {
  const s = startOfDay(new Date())
  const start = format(s, "yyyy-MM-dd")
  const end = format(addDays(s, 14), "yyyy-MM-dd")
  return { start, end }
}

/**
 * Insert WBS nodes as Gantt tasks (tree). Optionally clears existing schedule tasks first.
 */
export async function applyWbsStructureToProject(input: {
  structureId: string
  projectId: string
  replaceExisting: boolean
}) {
  const structureId = String(input.structureId ?? "").trim()
  const projectId = String(input.projectId ?? "").trim()
  if (!structureId) throw new Error("מבנה לא נבחר")
  if (!projectId) throw new Error("פרויקט לא נבחר")

  const rows = await getWbsNodes(structureId)
  if (rows.length === 0) throw new Error("למבנה אין צמתים")
  const treeForCodes = rowsToTree(rows)
  const taskWbsCodeByNodeId = computeWbsCodeMapForTree(treeForCodes)

  const supabase = await createSupabaseServerAuthClient()
  if (input.replaceExisting) {
    await clearProjectScheduleTasks(projectId)
  }

  const { start, end } = defaultDates()
  const byParent = new Map<string | null, WbsNodeRow[]>()
  for (const r of rows) {
    const k = r.parent_node_id
    const list = byParent.get(k) ?? []
    list.push(r)
    byParent.set(k, list)
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order)
  }

  let rootOrderBase = 0
  if (!input.replaceExisting) {
    const { data: mx } = await supabase
      .schema("public")
      .from("tasks")
      .select("wbs_order")
      .eq("project_id", projectId)
      .is("parent_id", null)
      .order("wbs_order", { ascending: false })
      .limit(1)
      .maybeSingle()
    rootOrderBase = Number((mx as { wbs_order?: number } | null)?.wbs_order ?? 0)
  }

  async function insertNode(
    node: WbsNodeRow,
    parentTaskId: string | null,
    level: number,
    siblingIndex: number
  ) {
    const wbsCode =
      (node.wbs_code && String(node.wbs_code).trim()) ||
      taskWbsCodeByNodeId.get(node.id) ||
      null
    const { data, error } = await supabase
      .schema("public")
      .from("tasks")
      .insert({
        project_id: projectId,
        parent_id: parentTaskId,
        parent_task_id: null,
        subcontractor_id: null,
        contract_id: null,
        is_derivative: false,
        name: node.label,
        description: null,
        start_date: start,
        end_date: end,
        progress: 0,
        estimated_cost: 0,
        actual_cost: 0,
        wbs_order: siblingIndex,
        level,
        wbs_code: wbsCode,
        source_wbs_node_id: node.id,
        dependency_ids: [],
      })
      .select("id")
      .single()
    if (error || !data?.id) throw new Error(error?.message ?? "הוספת משימה נכשלה")
    const children = byParent.get(node.id) ?? []
    let i = 0
    for (const ch of children) {
      await insertNode(ch, data.id, level + 1, i++)
    }
  }

  const roots = byParent.get(null) ?? []
  if (roots.length === 0) throw new Error("מבנה ללא שורש")

  for (let r = 0; r < roots.length; r++) {
    const order = input.replaceExisting ? r : rootOrderBase + r + 1
    await insertNode(roots[r], null, 0, order)
  }

  await syncWbsLevelsFromTree(projectId)
  await recalculateWbsSchedule(projectId)

  revalidatePath(`/marker-ofek/execution/gantt/${projectId}`)
  revalidatePath("/marker-ofek/execution/gantt")
  revalidatePath("/marker-ofek/tenders/wbs")
  return { ok: true as const, inserted: rows.length }
}

/**
 * Copy non-derivative task tree from one project into another (same shape / names).
 */
export async function copyScheduleBetweenProjects(input: {
  sourceProjectId: string
  targetProjectId: string
  replaceExisting: boolean
}) {
  const src = String(input.sourceProjectId ?? "").trim()
  const tgt = String(input.targetProjectId ?? "").trim()
  if (!src || !tgt) throw new Error("פרויקט מקור או יעד חסר")
  if (src === tgt) throw new Error("אותו פרויקט")

  const supabase = await createSupabaseServerAuthClient()
  const { data: srcTasks, error } = await supabase
    .schema("public")
    .from("tasks")
    .select("id, parent_id, name, wbs_order, level, wbs_code")
    .eq("project_id", src)
    .eq("is_derivative", false)
    .order("wbs_order", { ascending: true })
  if (error) throw new Error(error.message)
  const tasks = (srcTasks ?? []) as {
    id: string
    parent_id: string | null
    name: string
    wbs_order: number
    level: number
    wbs_code: string | null
  }[]
  if (tasks.length === 0) throw new Error("אין משימות מקור לייבוא")

  if (input.replaceExisting) {
    await clearProjectScheduleTasks(tgt)
  }

  let rootBase = 0
  if (!input.replaceExisting) {
    const { data: mx } = await supabase
      .schema("public")
      .from("tasks")
      .select("wbs_order")
      .eq("project_id", tgt)
      .is("parent_id", null)
      .order("wbs_order", { ascending: false })
      .limit(1)
      .maybeSingle()
    rootBase = Number((mx as { wbs_order?: number } | null)?.wbs_order ?? 0)
  }

  const { start, end } = defaultDates()
  const byParent = new Map<string | null, typeof tasks>()
  for (const t of tasks) {
    const k = t.parent_id
    const list = byParent.get(k) ?? []
    list.push(t)
    byParent.set(k, list)
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.wbs_order - b.wbs_order)
  }

  async function cloneTask(
    row: {
      id: string
      parent_id: string | null
      name: string
      wbs_order: number
      wbs_code: string | null
    },
    parentNew: string | null,
    level: number,
    siblingIndex: number
  ) {
    const wc =
      row.wbs_code == null || String(row.wbs_code).trim() === ""
        ? null
        : String(row.wbs_code).trim()
    const { data, error: insErr } = await supabase
      .schema("public")
      .from("tasks")
      .insert({
        project_id: tgt,
        parent_id: parentNew,
        parent_task_id: null,
        subcontractor_id: null,
        contract_id: null,
        is_derivative: false,
        name: row.name,
        description: null,
        start_date: start,
        end_date: end,
        progress: 0,
        estimated_cost: 0,
        actual_cost: 0,
        wbs_order: siblingIndex,
        level,
        wbs_code: wc,
        dependency_ids: [],
      })
      .select("id")
      .single()
    if (insErr || !data?.id) throw new Error(insErr?.message ?? "שכפול משימה נכשל")
    const children = byParent.get(row.id) ?? []
    let i = 0
    for (const ch of children) {
      await cloneTask(ch, data.id, level + 1, i++)
    }
  }

  const roots = byParent.get(null) ?? []
  for (let r = 0; r < roots.length; r++) {
    const ord = input.replaceExisting ? r : rootBase + r + 1
    await cloneTask(roots[r], null, 0, ord)
  }

  await syncWbsLevelsFromTree(tgt)
  await recalculateWbsSchedule(tgt)

  revalidatePath(`/marker-ofek/execution/gantt/${tgt}`)
  revalidatePath("/marker-ofek/execution/gantt")
  return { ok: true as const, inserted: tasks.length }
}

export async function snapshotProjectToWbsStructure(projectId: string, structureName: string) {
  const pid = String(projectId ?? "").trim()
  const name = String(structureName ?? "").trim()
  if (!pid) throw new Error("פרויקט לא נבחר")
  if (!name) throw new Error("שם מבנה נדרש")

  const supabase = await createSupabaseServerAuthClient()
  const { data: srcTasks, error } = await supabase
    .schema("public")
    .from("tasks")
    .select("id, parent_id, name, wbs_order, wbs_code")
    .eq("project_id", pid)
    .eq("is_derivative", false)
    .order("wbs_order", { ascending: true })
  if (error) throw new Error(error.message)
  const tasks = (srcTasks ?? []) as {
    id: string
    parent_id: string | null
    name: string
    wbs_order: number
    wbs_code: string | null
  }[]
  if (tasks.length === 0) throw new Error("אין משימות לצילום")

  const { data: st, error: cErr } = await supabase
    .schema("public")
    .from("wbs_structures")
    .insert({
      name,
      is_template: false,
      project_id: pid,
    })
    .select("id")
    .single()
  if (cErr || !st?.id) throw new Error(cErr?.message ?? "יצירת מבנה נכשלה")
  const structureId = String(st.id)

  const byParent = new Map<string | null, typeof tasks>()
  for (const t of tasks) {
    const k = t.parent_id
    const list = byParent.get(k) ?? []
    list.push(t)
    byParent.set(k, list)
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.wbs_order - b.wbs_order)
  }

  const flatIns: {
    id: string
    structure_id: string
    parent_node_id: string | null
    label: string
    sort_order: number
    wbs_code: string | null
    metadata: Record<string, unknown>
  }[] = []

  function walk(parentOld: string | null, parentNew: string | null) {
    const children = byParent.get(parentOld) ?? []
    let o = 0
    for (const ch of children) {
      const nid = crypto.randomUUID()
      const wc =
        ch.wbs_code == null || String(ch.wbs_code).trim() === ""
          ? null
          : String(ch.wbs_code).trim()
      flatIns.push({
        id: nid,
        structure_id: structureId,
        parent_node_id: parentNew,
        label: ch.name,
        sort_order: o++,
        wbs_code: wc,
        metadata: {},
      })
      walk(ch.id, nid)
    }
  }
  walk(null, null)

  const { error: nErr } = await supabase.schema("public").from("wbs_nodes").insert(flatIns)
  if (nErr) throw new Error(nErr.message)

  revalidatePath("/marker-ofek/tenders/wbs")
  return { ok: true as const, structureId }
}
