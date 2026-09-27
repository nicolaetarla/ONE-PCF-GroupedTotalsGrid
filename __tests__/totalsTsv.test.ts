import { buildTotalsTsv } from "../GroupedTotalsGrid/core/totalsTsv";

const columns = [
  { name: "msdyn_duration", displayName: "Duration" },
  { name: "msdyn_amount", displayName: "Amount" }
];

describe("buildTotalsTsv", () => {
  it("writes a header, one row per group and the grand total", () => {
    const tsv = buildTotalsTsv({
      groupColumnLabel: "Bookable Resource",
      countLabel: "Records",
      columns,
      groups: [
        { label: "Alex", recordCount: 3, formattedTotals: { msdyn_duration: "5 hours", msdyn_amount: "$1,200.00" } },
        { label: "(No value)", recordCount: 1, formattedTotals: { msdyn_duration: "30 minutes" } }
      ],
      grandTotal: {
        label: "Total",
        recordCount: 4,
        formattedTotals: { msdyn_duration: "5 hours 30 minutes", msdyn_amount: "$1,200.00" }
      }
    });

    expect(tsv.split("\r\n")).toEqual([
      "Bookable Resource\tRecords\tDuration\tAmount",
      "Alex\t3\t5 hours\t$1,200.00",
      "(No value)\t1\t30 minutes\t",
      "Total\t4\t5 hours 30 minutes\t$1,200.00"
    ]);
  });

  it("omits the grand total when not given and appends the partial notice", () => {
    const tsv = buildTotalsTsv({
      groupColumnLabel: "Owner",
      countLabel: "Records",
      columns: [],
      groups: [{ label: "Sam", recordCount: 2, formattedTotals: {} }],
      partialNotice: "Totals cover the records loaded so far."
    });
    expect(tsv.split("\r\n")).toEqual(["Owner\tRecords", "Sam\t2", "Totals cover the records loaded so far."]);
  });

  it("strips tabs and line breaks that would shift cells", () => {
    const tsv = buildTotalsTsv({
      groupColumnLabel: "Account",
      countLabel: "Records",
      columns: [],
      groups: [{ label: "Contoso\tLtd\r\nEurope", recordCount: 1, formattedTotals: {} }]
    });
    expect(tsv.split("\r\n")[1]).toBe("Contoso Ltd Europe\t1");
  });
});
