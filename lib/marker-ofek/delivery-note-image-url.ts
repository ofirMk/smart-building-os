/**
 * Supabase Storage image transformation for display (requires project with Image Transformations).
 * Rewrites `.../storage/v1/object/public/...` → `.../storage/v1/render/image/public/...?width=…`
 */
export function deliveryNoteImageSrcForDisplay(
  publicUrl: string | null | undefined,
  opts?: { maxWidth?: number; quality?: number }
): string | null {
  if (!publicUrl?.trim()) return null
  const maxWidth = opts?.maxWidth ?? 960
  const quality = opts?.quality ?? 78
  const u = publicUrl.trim()

  if (u.includes("/storage/v1/object/public/")) {
    const withRender = u.replace(
      "/storage/v1/object/public/",
      "/storage/v1/render/image/public/"
    )
    const join = withRender.includes("?") ? "&" : "?"
    return `${withRender}${join}width=${maxWidth}&resize=contain&quality=${quality}`
  }

  return u
}
