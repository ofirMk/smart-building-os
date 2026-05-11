"use server"

/**
 * Server actions surface for system parameters — re-exports the write side
 * of `lib/erp/system-parameters.ts` so that client components can invoke
 * them through the Server Actions boundary.
 *
 * The "server-only" module guard on `system-parameters.ts` prevents accidental
 * client imports. This thin wrapper keeps a single source of truth for the
 * implementation while exposing a client-callable API surface here.
 */

import {
  setSystemParameter as _setSystemParameter,
  setSystemParametersBulk as _setSystemParametersBulk,
  type SystemParameterUpdate,
} from "./system-parameters"

export async function setSystemParameter(input: {
  companyId: string
  paramKey: string
  paramValue: string | null
}) {
  return _setSystemParameter(input)
}

export async function setSystemParametersBulk(input: {
  companyId: string
  updates: SystemParameterUpdate[]
}) {
  return _setSystemParametersBulk(input)
}
