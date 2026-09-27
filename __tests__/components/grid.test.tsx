import * as React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  GridStrings,
  GroupedTotalsGrid,
  GroupedTotalsGridProps
} from "../../GroupedTotalsGrid/components/GroupedTotalsGrid";

/* ---- a minimal PCF dataset / context ---------------------------------- */

interface Row {
  id: string;
  name: string;
  owner: { id: string; name: string } | null;
  amount: number;
}

const ROWS: Row[] = [
  { id: "r1", name: "Entry 1", owner: { id: "00000000-0000-0000-0000-00000000000a", name: "Alex" }, amount: 10 },
  { id: "r2", name: "Entry 2", owner: { id: "00000000-0000-0000-0000-00000000000a", name: "Alex" }, amount: 5 },
  { id: "r3", name: "Entry 3", owner: { id: "00000000-0000-0000-0000-00000000000b", name: "Sam" }, amount: 7 }
];

function makeDataset(rows: Row[]) {
  const records: Record<string, unknown> = {};
  for (const r of rows) {
    records[r.id] = {
      getRecordId: () => r.id,
      getValue: (col: string) =>
        col === "name" ? r.name : col === "owner" ? (r.owner ? { id: { guid: r.owner.id }, name: r.owner.name } : null) : col === "amount" ? r.amount : null,
      getFormattedValue: (col: string) =>
        col === "name" ? r.name : col === "owner" ? r.owner?.name ?? "" : col === "amount" ? r.amount.toFixed(2) : ""
    };
  }
  return {
    loading: false,
    columns: [
      { name: "name", displayName: "Name", dataType: "SingleLine.Text", order: 0, visualSizeFactor: 100, isPrimary: true },
      { name: "owner", displayName: "Owner", dataType: "Lookup.Simple", order: 1, visualSizeFactor: 100 },
      { name: "amount", displayName: "Amount", dataType: "Decimal", order: 2, visualSizeFactor: 100 }
    ],
    records,
    sortedRecordIds: rows.map((r) => r.id),
    paging: { hasNextPage: false, totalResultCount: rows.length, pageSize: 50, setPageSize: jest.fn(), loadNextPage: jest.fn() },
    filtering: { getFilter: () => ({}) },
    getViewId: () => "view-1"
  } as unknown as ComponentFramework.PropertyTypes.DataSet;
}

const context = {
  userSettings: {},
  utils: { getEntityMetadata: () => Promise.reject(new Error("no metadata in tests")) },
  webAPI: {},
  formatting: {}
} as unknown as ComponentFramework.Context<unknown>;

const strings: GridStrings = {
  sortAsc: "Sort A to Z",
  sortDesc: "Sort Z to A",
  groupBy: "Group by this column",
  ungroup: "Remove grouping",
  showTotal: "Show total",
  hideTotal: "Hide total",
  emptyGroupLabel: "(No value)",
  noRecords: "No data available",
  grandTotal: "Total",
  recordCount: (n) => `${n} records`,
  baseCurrencyNotice: "base",
  partialTotalsNotice: "partial",
  aggregateLimitTitle: "Totals unavailable",
  aggregateLimitMessage: "Too large",
  copyTotals: "Copy totals",
  totalsCopied: "Totals copied",
  copyFailed: "Copy failed",
  recordsColumn: "Records",
  duration: { hourSingular: "hour", hourPlural: "hours", minuteSingular: "minute", minutePlural: "minutes", partSeparator: " " }
};

function renderGrid(overrides: Partial<GroupedTotalsGridProps> = {}, rows = ROWS) {
  const props: GroupedTotalsGridProps = {
    context,
    dataset: makeDataset(rows),
    entityName: "msdyn_timeentry",
    primaryIdAttribute: "msdyn_timeentryid",
    strings,
    groupByColumn: "owner",
    allowRuntimeGroupChange: true,
    showGrandTotal: true,
    groupsInitiallyCollapsed: true,
    showRecordCounts: true,
    totalsMode: "ClientOnly",
    maxClientRows: 5000,
    navigationTypesAllowed: "None" as GroupedTotalsGridProps["navigationTypesAllowed"],
    enableOptionSetColors: false,
    rowDensity: "Comfortable",
    debug: false,
    onOpenRecord: jest.fn(),
    onOpenLookup: jest.fn(),
    onSelectionChange: jest.fn(),
    onSort: jest.fn(),
    width: 1000,
    ...overrides
  };
  render(<GroupedTotalsGrid {...props} />);
  return props;
}

const groupRow = (label: string) =>
  screen.getAllByRole("row").find((r) => r.getAttribute("aria-expanded") !== null && r.textContent?.includes(label))!;

beforeEach(() => window.localStorage.clear());

describe("GroupedTotalsGrid", () => {
  it("renders one header per lookup value with group totals and a grand total", async () => {
    renderGrid();
    await waitFor(() => expect(groupRow("Alex")).toBeTruthy());
    expect(groupRow("Alex").textContent).toContain("2 records");
    expect(groupRow("Alex").textContent).toContain("15");
    expect(groupRow("Sam").textContent).toContain("7");
    expect(screen.getByLabelText("Amount Total").textContent).toContain("22");
  });

  it("starts collapsed and shows a group's rows on expand, hides them on collapse", async () => {
    renderGrid();
    await waitFor(() => expect(groupRow("Alex")).toBeTruthy());
    expect(screen.queryByText("Entry 1")).toBeNull();

    fireEvent.click(groupRow("Alex"));
    expect(screen.getByText("Entry 1")).toBeTruthy();
    expect(screen.getByText("Entry 2")).toBeTruthy();
    expect(screen.queryByText("Entry 3")).toBeNull(); // Sam's row stays hidden

    fireEvent.click(groupRow("Alex"));
    expect(screen.queryByText("Entry 1")).toBeNull();
  });

  it("starts expanded when groupsInitiallyCollapsed is off", async () => {
    renderGrid({ groupsInitiallyCollapsed: false });
    await waitFor(() => expect(screen.getByText("Entry 3")).toBeTruthy());
  });

  it("selection from the checkbox reports selected ids", async () => {
    const props = renderGrid({ groupsInitiallyCollapsed: false });
    await waitFor(() => expect(screen.getByText("Entry 1")).toBeTruthy());
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(props.onSelectionChange).toHaveBeenLastCalledWith([expect.any(String)]);
  });

  it("shows the empty state with no records and no copy button", async () => {
    renderGrid({}, []);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("No data available"));
    expect(screen.queryByText("Copy totals")).toBeNull();
  });

  it("renders a flat list when ungrouped", async () => {
    renderGrid({ groupByColumn: undefined });
    await waitFor(() => expect(screen.getByText("Entry 3")).toBeTruthy());
    expect(screen.getAllByRole("row").some((r) => r.getAttribute("aria-expanded") !== null)).toBe(false);
    expect(screen.queryByText("Copy totals")).toBeNull();
  });

  describe("Copy totals", () => {
    const writeText = jest.fn();
    beforeEach(() => {
      writeText.mockReset();
      Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    });

    it("copies the grouped table as TSV and announces success", async () => {
      writeText.mockResolvedValue(undefined);
      renderGrid();
      await waitFor(() => expect(screen.getByText("Copy totals")).toBeTruthy());

      await act(async () => {
        fireEvent.click(screen.getByText("Copy totals"));
      });

      const lines = (writeText.mock.calls[0][0] as string).split("\r\n");
      expect(lines[0]).toBe("Owner\tRecords\tAmount");
      expect(lines).toContain("Total\t3\t22.00");
      expect(lines.some((l) => l.startsWith("Alex\t2\t15"))).toBe(true);
      expect(screen.getByText("Totals copied")).toBeTruthy();
    });

    it("announces failure when the clipboard is blocked", async () => {
      writeText.mockRejectedValue(new Error("denied"));
      renderGrid();
      await waitFor(() => expect(screen.getByText("Copy totals")).toBeTruthy());
      await act(async () => {
        fireEvent.click(screen.getByText("Copy totals"));
      });
      expect(screen.getByText("Copy failed")).toBeTruthy();
    });
  });
});
