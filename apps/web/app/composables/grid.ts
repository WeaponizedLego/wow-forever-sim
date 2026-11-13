/**
 * Inline style for a cell of UiPanelGrid. Desktop uses `span`; below 1100px narrow cells (≤ 4 of 12)
 * pair up at half width and wide ones go full width; below 640px everything stacks.
 * The matching CSS lives in each cell component (UiPanel, UiKpiTile, UiPanelStack).
 */
export function gridCellStyle(span: number, rowSpan = 1): Record<string, string | number> {
  const s = Math.min(12, Math.max(1, Math.round(span)));
  return { '--span': s, '--span-md': s <= 4 ? 6 : 12, '--row-span': rowSpan };
}
