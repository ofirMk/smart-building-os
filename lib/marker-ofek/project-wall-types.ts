import type { ProjectWallAiCategory } from "@/lib/ai/agent-logic"
import type { Tables } from "@/types/supabase"

export type { ProjectWallAiCategory }

export type ProjectWallPostKind = Tables<"project_wall_posts">["post_kind"]

export type ProjectWallPostRow = Tables<"project_wall_posts"> & {
  author_full_name: string | null
  image_signed_url: string | null
}

export const PROJECT_WALL_AI_LABELS: Record<
  ProjectWallAiCategory,
  { bracket: string; he: string }
> = {
  technical: { bracket: "[Technical]", he: "טכני" },
  safety: { bracket: "[Safety]", he: "בטיחות" },
  delay: { bracket: "[Delay]", he: "עיכוב" },
  finance: { bracket: "[Back-charge]", he: "חיוב חוזר / כספים" },
}

export const PROJECT_WALL_TAG_OPTIONS: { slug: string; labelHe: string }[] = [
  { slug: "milestone", labelHe: "אבן דרך" },
  { slug: "safety", labelHe: "בטיחות" },
  { slug: "quality", labelHe: "איכות" },
  { slug: "client", labelHe: "לקוח" },
  { slug: "subcontractor", labelHe: "קבלן משנה" },
  { slug: "materials", labelHe: "חומרים" },
]
