import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { GroupHeaderRow, GroupHeaderRowProps } from "../../GroupedTotalsGrid/components/GroupHeaderRow";
import { TotalsFooter } from "../../GroupedTotalsGrid/components/TotalsFooter";
import { DataRow, DataRowProps } from "../../GroupedTotalsGrid/components/DataRow";
import { EmptyState, ErrorBar } from "../../GroupedTotalsGrid/components/States";
import { GridColumn, GroupAggregate } from "../../GroupedTotalsGrid/core/types";

const columns: GridColumn[] = [
  { name: "name", displayName: "Name", dataType: "SingleLine.Text", order: 0, visualSizeFactor: 100, isPrimary: true },
  { name: "amount", displayName: "Amount", dataType: "Currency", order: 1, visualSizeFactor: 100, isPrimary: false }
];
const factors = { name: 100, amount: 100 };

const group: GroupAggregate = {
  key: { key: "lookup:1", label: "Contoso", rawValue: "1", isEmpty: false },
  recordCount: 3,
  totals: { amount: { columnName: "amount", value: 30 } }
};

function renderHeader(overrides: Partial<GroupHeaderRowProps> = {}) {
  const onToggle = jest.fn();
  render(
    <GroupHeaderRow
      group={group}
      columns={columns}
      factors={factors}
      expanded={false}
      compact={false}
      showRecordCounts
      multiSelect
      formattedTotals={{ amount: "$30.00" }}
      baseCurrencyNotice="base currency"
      countLabel={(n) => `${n} records`}
      onToggle={onToggle}
      stickyTop={0}
      {...overrides}
    />
  );
  return { onToggle, row: screen.getByRole("row") };
}

describe("GroupHeaderRow", () => {
  it("shows label, count and total in the total's column", () => {
    const { row } = renderHeader();
    expect(row.textContent).toContain("Contoso");
    expect(row.textContent).toContain("3 records");
    const cells = screen.getAllByRole("gridcell");
    expect(cells[cells.length - 1].textContent).toContain("$30.00");
  });

  it("hides the count when showRecordCounts is off", () => {
    const { row } = renderHeader({ showRecordCounts: false });
    expect(row.textContent).not.toContain("3 records");
  });

  it("toggles on click, Enter and Space", () => {
    const { row, onToggle } = renderHeader();
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: "Enter" });
    fireEvent.keyDown(row, { key: " " });
    expect(onToggle).toHaveBeenCalledTimes(3);
    expect(onToggle).toHaveBeenCalledWith("lookup:1");
  });

  it("ArrowRight only expands and ArrowLeft only collapses", () => {
    const collapsed = renderHeader({ expanded: false });
    fireEvent.keyDown(collapsed.row, { key: "ArrowLeft" });
    expect(collapsed.onToggle).not.toHaveBeenCalled();
    fireEvent.keyDown(collapsed.row, { key: "ArrowRight" });
    expect(collapsed.onToggle).toHaveBeenCalledTimes(1);
  });

  it("does not expand again on ArrowRight when already expanded", () => {
    const { row, onToggle } = renderHeader({ expanded: true });
    expect(row.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(row, { key: "ArrowRight" });
    expect(onToggle).not.toHaveBeenCalled();
    fireEvent.keyDown(row, { key: "ArrowLeft" });
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe("TotalsFooter", () => {
  it("renders the label and labels each total cell for screen readers", () => {
    render(
      <TotalsFooter
        grandTotal={group}
        columns={columns}
        factors={factors}
        formattedTotals={{ amount: "$30.00" }}
        compact={false}
        multiSelect
        label="Total"
        baseCurrencyNotice="base currency"
      />
    );
    expect(screen.getByRole("row").textContent).toContain("Total");
    expect(screen.getByLabelText("Amount Total").textContent).toContain("$30.00");
  });
});

describe("DataRow", () => {
  function renderRow(overrides: Partial<DataRowProps> = {}) {
    const props: DataRowProps = {
      recordId: "r1",
      rowIndex: 1,
      columns,
      factors,
      getFormatted: (_id, col) => (col === "name" ? "Invoice 1" : "$10.00"),
      getRaw: (_id, col) => (col === "name" ? "Invoice 1" : 10),
      selected: false,
      compact: false,
      multiSelect: true,
      navigationTypesAllowed: "None" as DataRowProps["navigationTypesAllowed"],
      enableOptionSetColors: false,
      onToggleSelect: jest.fn(),
      onOpenRecord: jest.fn(),
      onOpenLookup: jest.fn(),
      ...overrides
    };
    render(<DataRow {...props} />);
    return { props, row: screen.getByRole("row") };
  }

  it("renders formatted cells", () => {
    const { row } = renderRow();
    expect(row.textContent).toContain("Invoice 1");
    expect(row.textContent).toContain("$10.00");
  });

  it("opens the record on click and Enter", () => {
    const { row, props } = renderRow();
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: "Enter" });
    expect(props.onOpenRecord).toHaveBeenCalledTimes(2);
    expect(props.onToggleSelect).not.toHaveBeenCalled();
  });

  it("selects instead of opening on modifier-click and Space", () => {
    const { row, props } = renderRow();
    fireEvent.click(row, { ctrlKey: true });
    fireEvent.keyDown(row, { key: " " });
    expect(props.onToggleSelect).toHaveBeenCalledTimes(2);
    expect(props.onOpenRecord).not.toHaveBeenCalled();
  });

  it("checkbox selects without opening the record", () => {
    const { props } = renderRow();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(props.onToggleSelect).toHaveBeenCalledWith("r1", true);
    expect(props.onOpenRecord).not.toHaveBeenCalled();
  });

  it("reflects selection in aria-selected", () => {
    const { row } = renderRow({ selected: true });
    expect(row.getAttribute("aria-selected")).toBe("true");
  });
});

describe("States", () => {
  it("EmptyState is a status message", () => {
    render(<EmptyState message="No data available" />);
    expect(screen.getByRole("status").textContent).toContain("No data available");
  });

  it("ErrorBar shows title and message", () => {
    render(<ErrorBar title="Totals unavailable" message="Too large" />);
    expect(screen.getByText("Totals unavailable")).toBeTruthy();
    expect(screen.getByText("Too large")).toBeTruthy();
  });
});
