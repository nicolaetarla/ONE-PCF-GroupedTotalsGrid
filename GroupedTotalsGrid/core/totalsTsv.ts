/**
 * Group totals as tab-separated text, for the "Copy totals" action.
 *
 * Export to Excel is a platform command that sees only the flat view, so this
 * is how grouped totals leave the control. Values are the same formatted
 * strings the grid shows - the point is that the pasted table matches the
 * screen, including a partial-totals marker when the numbers are partial.
 */

export interface TsvColumn {
  name: string;
  displayName: string;
}

export interface TsvGroup {
  label: string;
  recordCount: number;
  formattedTotals: Record<string, string>;
}

export interface TotalsTsvInput {
  groupColumnLabel: string;
  countLabel: string;
  columns: readonly TsvColumn[];
  groups: readonly TsvGroup[];
  /** Omitted when the grand total row is not shown. */
  grandTotal?: TsvGroup;
  /** Appended as a final line when the totals are partial. */
  partialNotice?: string;
}

/** Tabs and line breaks inside a value would shift every following cell. */
function cell(value: string): string {
  return value.replace(/[\t\r\n]+/g, " ").trim();
}

function row(values: readonly string[]): string {
  return values.map(cell).join("\t");
}

function groupRow(group: TsvGroup, columns: readonly TsvColumn[]): string {
  return row([group.label, String(group.recordCount), ...columns.map((c) => group.formattedTotals[c.name] ?? "")]);
}

export function buildTotalsTsv(input: TotalsTsvInput): string {
  const lines = [
    row([input.groupColumnLabel, input.countLabel, ...input.columns.map((c) => c.displayName)]),
    ...input.groups.map((g) => groupRow(g, input.columns))
  ];
  if (input.grandTotal) lines.push(groupRow(input.grandTotal, input.columns));
  if (input.partialNotice) lines.push(cell(input.partialNotice));
  return lines.join("\r\n");
}
