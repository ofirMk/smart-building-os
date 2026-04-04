/** Default כספת פרויקט — נוצר אוטומטית לכל פרויקט (עצלן בטעינת כספת). */
export const VAULT_DEFAULT_FOLDERS = [
  { key: "plans", title: "תוכניות לביצוע" },
  { key: "supervision", title: "אישורי פיקוח" },
  { key: "testing", title: "תעודות בדיקה וכיול" },
  { key: "media", title: "תיעוד חזותי" },
] as const

export type VaultFolderKey = (typeof VAULT_DEFAULT_FOLDERS)[number]["key"]

export function vaultFolderKeyOrder(key: string | null | undefined): number {
  const k = String(key ?? "")
  const i = VAULT_DEFAULT_FOLDERS.findIndex((f) => f.key === k)
  return i < 0 ? 999 : i
}
