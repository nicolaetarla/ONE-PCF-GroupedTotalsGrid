import {
  aggregateRows,
  AggregationRow,
  AggregationSpec,
  mergePartitions,
  toNumber
} from "../GroupedTotalsGrid/core/aggregation";
import {
  resolveGroupKey,
  sortGroups,
  normaliseGuid,
  isRowInGroup,
  serverGroupKey
} from "../GroupedTotalsGrid/core/groupKey";
import {
  extractErrorCode,
  isAggregateLimitError,
  partitionByDate,
  runWithConcurrency,
  withPartitionRetry
} from "../GroupedTotalsGrid/core/fetchXmlPartitioner";
import { queryHash, hashString } from "../GroupedTotalsGrid/core/queryHash";
import { AggregateResult, QueryIdentity, selectTotalColumns } from "../GroupedTotalsGrid/core/types";

const RES_A = "11111111-1111-1111-1111-111111111111";
const RES_B = "22222222-2222-2222-2222-222222222222";

const spec: AggregationSpec = {
  columns: ["msdyn_duration", "amount"],
  precisionByColumn: { msdyn_duration: 0, amount: 2 },
  currencyColumns: new Set(["amount"]),
  emptyGroupLabel: "(No value)"
};

function row(
  id: string,
  resourceId: string | null,
  resourceName: string | null,
  duration: number | null,
  amount: number | null,
  currencyId?: string,
  amountBase?: number
): AggregationRow {
  return {
    recordId: id,
    group: {
      raw: resourceId ? { id: { guid: resourceId }, name: resourceName } : null,
      formatted: resourceName ?? undefined,
      dataType: "Lookup.Simple"
    },
    values: { msdyn_duration: duration, amount },
    baseValues: { amount: amountBase },
    currencyId
  };
}

describe("resolveGroupKey", () => {
  it("groups by lookup id and labels with the target's name", () => {
    const key = resolveGroupKey(
      { raw: { id: { guid: RES_A }, name: "Dana Whitfield" }, formatted: "Dana Whitfield", dataType: "Lookup.Simple" },
      "(No value)"
    );
    expect(key.key).toBe(`lookup:${RES_A}`);
    expect(key.label).toBe("Dana Whitfield");
    expect(key.isEmpty).toBe(false);
  });

  it("treats braced and unbraced GUIDs as the same group", () => {
    expect(normaliseGuid(`{${RES_A.toUpperCase()}}`)).toBe(RES_A);
  });

  it("accepts a lookup delivered as a single-element array", () => {
    const key = resolveGroupKey(
      { raw: [{ id: RES_B, name: "Marcus Bell" }], formatted: "Marcus Bell", dataType: "Lookup.Simple" },
      "(No value)"
    );
    expect(key.key).toBe(`lookup:${RES_B}`);
  });

  it("buckets nulls into the empty group", () => {
    const key = resolveGroupKey({ raw: null, formatted: undefined, dataType: "Lookup.Simple" }, "(No value)");
    expect(key.isEmpty).toBe(true);
    expect(key.label).toBe("(No value)");
  });

  it("buckets dates on the local calendar day, not the UTC instant", () => {
    const nearMidnightLocal = new Date(2026, 0, 15, 23, 45, 0);
    const key = resolveGroupKey(
      { raw: nearMidnightLocal, formatted: "1/15/2026", dataType: "DateAndTime.DateAndTime" },
      "(No value)"
    );
    expect(key.key).toBe("date:2026-01-15");
  });

  it("uses the platform's label for choice columns", () => {
    const key = resolveGroupKey({ raw: 100000001, formatted: "Submitted", dataType: "OptionSet" }, "(No value)");
    expect(key.label).toBe("Submitted");
    expect(key.key).toBe("opt:100000001");
  });

  it("uses the platform's label for booleans", () => {
    const key = resolveGroupKey({ raw: true, formatted: "Yes", dataType: "TwoOptions" }, "(No value)");
    expect(key.label).toBe("Yes");
  });
});

describe("sortGroups", () => {
  const mk = (label: string, isEmpty = false, count = 1) => ({
    key: { key: label, label, rawValue: label, isEmpty },
    recordCount: count
  });

  it("sorts by label and always pushes the empty group last", () => {
    const sorted = sortGroups([mk("(No value)", true), mk("Zoe"), mk("Adam")], "label-asc");
    expect(sorted.map((g) => g.key.label)).toEqual(["Adam", "Zoe", "(No value)"]);
  });

  it("keeps the empty group last even when sorting descending", () => {
    const sorted = sortGroups([mk("(No value)", true), mk("Zoe"), mk("Adam")], "label-desc");
    expect(sorted[sorted.length - 1].key.isEmpty).toBe(true);
  });

  it("sorts by count descending", () => {
    const sorted = sortGroups([mk("A", false, 2), mk("B", false, 9)], "count-desc");
    expect(sorted[0].key.label).toBe("B");
  });
});

describe("aggregateRows", () => {
  it("totals per group and produces a grand total", () => {
    const rows = [
      row("1", RES_A, "Dana", 90, 100.5, "usd", 100.5),
      row("2", RES_A, "Dana", 135, 200.25, "usd", 200.25),
      row("3", RES_B, "Marcus", 480, 50, "usd", 50)
    ];
    const result = aggregateRows(rows, spec);

    const dana = result.groups.find((g) => g.key.label === "Dana");
    expect(dana?.recordCount).toBe(2);
    expect(dana?.totals["msdyn_duration"].value).toBe(225);
    expect(dana?.totals["amount"].value).toBe(300.75);

    expect(result.grandTotal.recordCount).toBe(3);
    expect(result.grandTotal.totals["msdyn_duration"].value).toBe(705);
    expect(result.grandTotal.totals["amount"].value).toBe(350.75);
    expect(result.source).toBe("client");
  });

  it("returns null, not zero, when a column contributed no values", () => {
    const result = aggregateRows([row("1", RES_A, "Dana", null, null, "usd")], spec);
    expect(result.groups[0].totals["msdyn_duration"].value).toBeNull();
  });

  it("distinguishes a real zero from no data", () => {
    const result = aggregateRows([row("1", RES_A, "Dana", 0, 0, "usd", 0)], spec);
    expect(result.groups[0].totals["msdyn_duration"].value).toBe(0);
  });

  it("switches money to base currency when a group spans currencies", () => {
    const rows = [
      row("1", RES_A, "Dana", 60, 100, "usd", 100),
      row("2", RES_A, "Dana", 60, 90, "eur", 99)
    ];
    const result = aggregateRows(rows, spec);
    const dana = result.groups[0];
    expect(dana.totals["amount"].usedBaseCurrency).toBe(true);
    expect(dana.totals["amount"].value).toBe(199);
    // duration is unaffected by currency
    expect(dana.totals["msdyn_duration"].value).toBe(120);
  });

  it("leaves money in transaction currency when the group is single-currency", () => {
    const rows = [row("1", RES_A, "Dana", 60, 100, "usd", 100)];
    const result = aggregateRows(rows, spec);
    expect(result.groups[0].totals["amount"].usedBaseCurrency).toBeUndefined();
  });

  it("propagates the partial flag when the caller hit the row cap", () => {
    expect(aggregateRows([row("1", RES_A, "Dana", 60, 1, "usd", 1)], spec, true).partial).toBe(true);
  });

  it("handles an empty result set without throwing", () => {
    const result = aggregateRows([], spec);
    expect(result.groups).toHaveLength(0);
    expect(result.grandTotal.recordCount).toBe(0);
    expect(result.grandTotal.totals["amount"].value).toBeNull();
  });
});

describe("mergePartitions", () => {
  const part = (label: string, duration: number, amount: number, count: number): AggregateResult => ({
    groups: [
      {
        key: { key: `lookup:${label}`, label, rawValue: label, isEmpty: false },
        recordCount: count,
        totals: {
          msdyn_duration: { columnName: "msdyn_duration", value: duration },
          amount: { columnName: "amount", value: amount }
        }
      }
    ],
    grandTotal: {
      key: { key: "grand", label: "", rawValue: null, isEmpty: true },
      recordCount: count,
      totals: {
        msdyn_duration: { columnName: "msdyn_duration", value: duration },
        amount: { columnName: "amount", value: amount }
      }
    },
    source: "server",
    partial: false
  });

  it("adds the same group across partitions", () => {
    const merged = mergePartitions([part("Dana", 100, 10.5, 2), part("Dana", 50, 5.25, 1)], spec);
    expect(merged.groups).toHaveLength(1);
    expect(merged.groups[0].recordCount).toBe(3);
    expect(merged.groups[0].totals["msdyn_duration"].value).toBe(150);
    expect(merged.groups[0].totals["amount"].value).toBe(15.75);
    expect(merged.partitions).toBe(2);
  });

  it("keeps distinct groups distinct", () => {
    const merged = mergePartitions([part("Dana", 100, 10, 1), part("Marcus", 50, 5, 1)], spec);
    expect(merged.groups).toHaveLength(2);
  });
});

describe("aggregate limit handling", () => {
  it("recognises the limit error by numeric code", () => {
    expect(isAggregateLimitError({ errorCode: -2147164125 })).toBe(true);
  });

  it("recognises the limit error by hex string", () => {
    expect(isAggregateLimitError({ code: "0x8004E023" })).toBe(true);
  });

  it("does not treat unrelated errors as the limit error", () => {
    expect(isAggregateLimitError({ errorCode: 404 })).toBe(false);
    expect(isAggregateLimitError(new Error("aggregate limit exceeded"))).toBe(false);
  });

  it("normalises a negative error code to hex", () => {
    expect(extractErrorCode({ errorCode: -2147164125 })).toBe("0x8004e023");
  });

  it("escalates the split until the query succeeds", async () => {
    const attempts: number[] = [];
    const result = await withPartitionRetry(async (partitions) => {
      attempts.push(partitions);
      if (partitions < 4) throw { errorCode: -2147164125 };
      return "ok";
    });
    expect(result).toBe("ok");
    expect(attempts).toEqual([1, 2, 4]);
  });

  it("gives up rather than splitting forever", async () => {
    await expect(
      withPartitionRetry(async () => {
        throw { errorCode: -2147164125 };
      }, 4)
    ).rejects.toBeDefined();
  });

  it("rethrows non-limit errors immediately", async () => {
    const attempts: number[] = [];
    await expect(
      withPartitionRetry(async (p) => {
        attempts.push(p);
        throw { errorCode: 500 };
      })
    ).rejects.toBeDefined();
    expect(attempts).toEqual([1]);
  });
});

describe("partitionByDate", () => {
  it("splits a range into contiguous, non-overlapping parts", () => {
    const parts = partitionByDate("msdyn_start", {
      from: new Date("2026-01-01T00:00:00Z"),
      to: new Date("2026-01-05T00:00:00Z")
    }, 4);
    expect(parts).toHaveLength(4);
    expect(parts[0].from.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(parts[3].to.toISOString()).toBe("2026-01-05T00:00:00.000Z");
    for (let i = 1; i < parts.length; i++) {
      expect(parts[i].from.getTime()).toBe(parts[i - 1].to.getTime());
    }
  });

  it("degrades to a single partition for a zero-length range", () => {
    const d = new Date("2026-01-01T00:00:00Z");
    expect(partitionByDate("msdyn_start", { from: d, to: d }, 4)).toHaveLength(1);
  });
});

describe("runWithConcurrency", () => {
  it("preserves ordering and respects the limit", async () => {
    let active = 0;
    let peak = 0;
    const out = await runWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 1));
      active--;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50, 60]);
    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe("queryHash", () => {
  const base: QueryIdentity = {
    viewId: "view-1",
    entityName: "msdyn_timeentry",
    filterJson: '{"conditions":[]}',
    searchTerm: "",
    linkedEntitiesJson: "[]",
    groupByColumn: "msdyn_bookableresource",
    aggregateColumns: ["msdyn_duration", "amount"]
  };

  it("is stable for identical input", () => {
    expect(queryHash(base)).toBe(queryHash({ ...base }));
  });

  it("ignores aggregate column ordering", () => {
    expect(queryHash(base)).toBe(queryHash({ ...base, aggregateColumns: ["amount", "msdyn_duration"] }));
  });

  it("changes when the filter changes", () => {
    expect(queryHash(base)).not.toBe(queryHash({ ...base, filterJson: '{"conditions":[1]}' }));
  });

  it("changes when the view changes", () => {
    expect(queryHash(base)).not.toBe(queryHash({ ...base, viewId: "view-2" }));
  });

  it("changes when the search term changes", () => {
    expect(queryHash(base)).not.toBe(queryHash({ ...base, searchTerm: "dana" }));
  });

  it("does not collide across a wide range of inputs", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(hashString(`query-${i}`));
    expect(seen.size).toBe(5000);
  });
});

/* ------------------------------------------------------------------ *
 * Regressions from the first live run (v1.0.12)
 * ------------------------------------------------------------------ */

describe("row-to-group matching across data types", () => {
  const empty = "(No value)";

  it("matches choice rows to their group — the bug that showed groups with no rows", () => {
    const source = { raw: 100000001, formatted: "Category 2", dataType: "OptionSet" };
    const key = resolveGroupKey(source, empty);
    expect(isRowInGroup(source, key, empty)).toBe(true);
  });

  it("does not match a choice row to a different choice group", () => {
    const a = { raw: 100000001, formatted: "Category 2", dataType: "OptionSet" };
    const b = { raw: 100000002, formatted: "Category 3", dataType: "OptionSet" };
    expect(isRowInGroup(a, resolveGroupKey(b, empty), empty)).toBe(false);
  });

  it("matches lookup, boolean, text and numeric rows to their groups", () => {
    const cases = [
      { raw: { id: { guid: RES_A }, name: "Dana" }, formatted: "Dana", dataType: "Lookup.Simple" },
      { raw: true, formatted: "Yes", dataType: "TwoOptions" },
      { raw: "Consulting", formatted: "Consulting", dataType: "SingleLine.Text" },
      { raw: 42, formatted: "42", dataType: "Whole.None" }
    ];
    for (const source of cases) {
      expect(isRowInGroup(source, resolveGroupKey(source, empty), empty)).toBe(true);
    }
  });

  it("matches null rows to the empty group", () => {
    const source = { raw: null, formatted: undefined, dataType: "OptionSet" };
    expect(isRowInGroup(source, resolveGroupKey(source, empty), empty)).toBe(true);
  });

  it("never renders a blank group label", () => {
    const source = { raw: 100000001, formatted: "   ", dataType: "OptionSet" };
    expect(resolveGroupKey(source, empty).label.trim()).not.toBe("");
  });
});

describe("serverGroupKey matches client keys", () => {
  const empty = "(No value)";

  it("agrees with the client for a choice column", () => {
    const client = resolveGroupKey({ raw: 100000001, formatted: "Category 2", dataType: "OptionSet" }, empty);
    const server = serverGroupKey("OptionSet", 100000001, "Category 2", empty);
    expect(server.key).toBe(client.key);
    expect(server.label).toBe("Category 2");
  });

  it("agrees with the client for a lookup, including GUID casing and braces", () => {
    const client = resolveGroupKey(
      { raw: { id: { guid: RES_A }, name: "Dana" }, formatted: "Dana", dataType: "Lookup.Simple" },
      empty
    );
    const server = serverGroupKey("Lookup.Simple", `{${RES_A.toUpperCase()}}`, "Dana", empty);
    expect(server.key).toBe(client.key);
  });

  it("agrees with the client for booleans", () => {
    const client = resolveGroupKey({ raw: true, formatted: "Yes", dataType: "TwoOptions" }, empty);
    expect(serverGroupKey("TwoOptions", true, "Yes", empty).key).toBe(client.key);
    expect(serverGroupKey("TwoOptions", "1", "Yes", empty).key).toBe(client.key);
  });

  it("buckets a null server value into the empty group", () => {
    expect(serverGroupKey("OptionSet", null, undefined, empty).isEmpty).toBe(true);
  });

  it("falls back to the raw value rather than rendering a blank label", () => {
    expect(serverGroupKey("OptionSet", 100000001, undefined, empty).label).toBe("100000001");
  });
});

describe("toNumber", () => {
  it("passes through real numbers", () => {
    expect(toNumber(42.5)).toBe(42.5);
    expect(toNumber(0)).toBe(0);
  });

  it("accepts numeric strings — the reason totals came back blank", () => {
    expect(toNumber("90")).toBe(90);
    expect(toNumber(" 1234.56 ")).toBe(1234.56);
    expect(toNumber("-7")).toBe(-7);
  });

  it("rejects values that are not numbers", () => {
    expect(toNumber("")).toBeNull();
    expect(toNumber("   ")).toBeNull();
    expect(toNumber("abc")).toBeNull();
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
    expect(toNumber({})).toBeNull();
    expect(toNumber(NaN)).toBeNull();
    expect(toNumber(Infinity)).toBeNull();
  });
});

describe("selectTotalColumns — the bug that made every total blank", () => {
  const cols = [
    { name: "devnt_newcolumn", displayName: "Entry Name", dataType: "SingleLine.Text", order: 0, visualSizeFactor: 100, isPrimary: true },
    { name: "devnt_category", displayName: "Category", dataType: "OptionSet", order: 1, visualSizeFactor: 100, isPrimary: false },
    { name: "devnt_resource", displayName: "Resource", dataType: "Lookup.Simple", order: 2, visualSizeFactor: 100, isPrimary: false },
    { name: "devnt_time", displayName: "Time", dataType: "Whole.None", order: 3, visualSizeFactor: 100, isPrimary: false },
    { name: "devnt_amount", displayName: "Amount", dataType: "Currency", order: 4, visualSizeFactor: 100, isPrimary: false }
  ];

  it("auto-detects when the explicit list is an EMPTY ARRAY", () => {
    // The regression: [] is truthy, so the explicit branch ran and matched
    // nothing. Every deployed view showed group headers with no totals.
    const selected = selectTotalColumns(cols, []).map((c) => c.name);
    expect(selected).toEqual(["devnt_time", "devnt_amount"]);
  });

  it("auto-detects when the explicit list is undefined", () => {
    expect(selectTotalColumns(cols, undefined).map((c) => c.name)).toEqual([
      "devnt_time",
      "devnt_amount"
    ]);
  });

  it("auto-detects when the explicit list is whitespace or empty strings", () => {
    expect(selectTotalColumns(cols, ["", "   ", ""]).map((c) => c.name)).toEqual([
      "devnt_time",
      "devnt_amount"
    ]);
  });

  it("honours a real explicit list", () => {
    expect(selectTotalColumns(cols, ["devnt_amount"]).map((c) => c.name)).toEqual(["devnt_amount"]);
  });

  it("trims whitespace around explicit names", () => {
    expect(selectTotalColumns(cols, [" devnt_amount "]).map((c) => c.name)).toEqual(["devnt_amount"]);
  });

  it("ignores explicit names that are not totalable", () => {
    expect(selectTotalColumns(cols, ["devnt_category"]).map((c) => c.name)).toEqual([]);
  });

  it("ignores explicit names that are not in the view", () => {
    expect(selectTotalColumns(cols, ["not_in_view"]).map((c) => c.name)).toEqual([]);
  });

  it("excludes columns the user hid from totals", () => {
    const selected = selectTotalColumns(cols, [], new Set(["devnt_time"])).map((c) => c.name);
    expect(selected).toEqual(["devnt_amount"]);
  });

  it("never totals text, choice or lookup columns", () => {
    const selected = selectTotalColumns(cols, []).map((c) => c.name);
    expect(selected).not.toContain("devnt_newcolumn");
    expect(selected).not.toContain("devnt_category");
    expect(selected).not.toContain("devnt_resource");
  });
});
