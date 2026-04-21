export const ACTIVE_PROJECT_COOKIE_KEY = "active_project_id"
export const ACTIVE_PROJECT_CHANGED_EVENT = "sbo:active-project-changed"

export function writeActiveProjectCookie(projectId: string | null): void {
  if (typeof document === "undefined") return
  if (!projectId) {
    document.cookie = `${ACTIVE_PROJECT_COOKIE_KEY}=; Path=/; Max-Age=0; SameSite=Lax`
    return
  }
  document.cookie = `${ACTIVE_PROJECT_COOKIE_KEY}=${encodeURIComponent(projectId)}; Path=/; Max-Age=31536000; SameSite=Lax`
}

export function readActiveProjectIdFromCookie(): string | null {
  if (typeof document === "undefined") return null
  const pattern = new RegExp(
    `(?:^|;\\s*)${ACTIVE_PROJECT_COOKIE_KEY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`
  )
  const value = document.cookie.match(pattern)?.[1]
  if (!value) return null
  const decoded = decodeURIComponent(value)
  return decoded.trim().length > 0 ? decoded : null
}
