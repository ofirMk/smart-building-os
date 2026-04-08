"use server"

import { randomUUID } from "node:crypto"

import { buildLayoutJsonFromSnapshot } from "@/lib/marker-ofek/workspace-layout-snapshot"
import {
  getWorkspaceSettingsBootstrap,
  saveMyWorkspaceSettings,
} from "@/lib/marker-ofek/user-workspace-actions"
import type { WorkspaceScenario } from "@/lib/marker-ofek/workspace-types"
import { formatError } from "@/lib/utils"

export async function saveCurrentViewAsScenario(input: {
  name: string
  icon?: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const name = input.name.trim()
    if (!name) return { ok: false, error: "נדרש שם לתרחיש" }
    const current = await getWorkspaceSettingsBootstrap()
    const layout_json = buildLayoutJsonFromSnapshot(current)
    const scenario: WorkspaceScenario = {
      id: randomUUID(),
      name,
      layout_json,
      icon: input.icon?.trim() || "layout-grid",
      is_ai_generated: false,
    }
    return saveMyWorkspaceSettings({
      workspaceScenarios: [...current.workspaceScenarios, scenario],
    })
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function applyWorkspaceScenario(
  scenarioId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const current = await getWorkspaceSettingsBootstrap()
    const scenario = current.workspaceScenarios.find((s) => s.id === scenarioId)
    if (!scenario) return { ok: false, error: "התרחיש לא נמצא" }
    const lj = scenario.layout_json
    return saveMyWorkspaceSettings({
      commandCenterLayout: lj.commandCenterLayout,
      diamondWorkspaceLayout: lj.diamondWorkspaceLayout,
      pinnedWidgets: lj.pinnedWidgets,
      workspacePersona: lj.workspacePersona,
      activeScenarioId: scenarioId,
    })
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function updateWorkspaceScenarios(
  scenarios: WorkspaceScenario[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    return saveMyWorkspaceSettings({
      workspaceScenarios: scenarios.slice(0, 50),
    })
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function deleteWorkspaceScenario(
  scenarioId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const current = await getWorkspaceSettingsBootstrap()
    const next = current.workspaceScenarios.filter((s) => s.id !== scenarioId)
    const activeScenarioId =
      current.activeScenarioId === scenarioId ? null : current.activeScenarioId
    return saveMyWorkspaceSettings({
      workspaceScenarios: next,
      activeScenarioId,
    })
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
