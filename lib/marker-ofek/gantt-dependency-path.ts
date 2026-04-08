/**
 * Orthogonal FS-style polyline: leave predecessor finish horizontally, vertical to target row, to successor start.
 */
export function buildOrthogonalFsPath(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  rtl: boolean,
  indent = 16
): string {
  if (rtl) {
    const ox = fromX - indent
    return `M ${fromX} ${fromY} L ${ox} ${fromY} L ${ox} ${toY} L ${toX} ${toY}`
  }
  const ox = fromX + indent
  return `M ${fromX} ${fromY} L ${ox} ${fromY} L ${ox} ${toY} L ${toX} ${toY}`
}

/** Preview while dragging: same routing but last segment goes to cursor. */
export function buildOrthogonalFsPreviewPath(
  fromX: number,
  fromY: number,
  cursorX: number,
  cursorY: number,
  rtl: boolean,
  indent = 16
): string {
  if (rtl) {
    const ox = fromX - indent
    return `M ${fromX} ${fromY} L ${ox} ${fromY} L ${ox} ${cursorY} L ${cursorX} ${cursorY}`
  }
  const ox = fromX + indent
  return `M ${fromX} ${fromY} L ${ox} ${fromY} L ${ox} ${cursorY} L ${cursorX} ${cursorY}`
}
