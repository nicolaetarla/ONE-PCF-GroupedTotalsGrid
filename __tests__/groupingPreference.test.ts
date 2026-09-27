import {
  groupingStorageKey,
  NO_GROUPING,
  readStoredGrouping,
  resolveGroupingColumn,
  writeStoredGrouping
} from "../GroupedTotalsGrid/core/groupingPreference";

const columns = [{ name: "new_category" }, { name: "msdyn_duration" }, { name: "createdon" }];

describe("groupingStorageKey", () => {
  it("scopes the preference to entity and view", () => {
    const a = groupingStorageKey("msdyn_timeentry", "view-1");
    const b = groupingStorageKey("msdyn_timeentry", "view-2");
    const c = groupingStorageKey("account", "view-1");
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it("degrades safely when either part is missing", () => {
    expect(groupingStorageKey("", "")).toBe("gtg.groupBy.unknown.default");
  });
});

describe("stored grouping round trip", () => {
  beforeEach(() => window.localStorage.clear());

  it("returns undefined when nothing is stored", () => {
    expect(readStoredGrouping("gtg.groupBy.x.y")).toBeUndefined();
  });

  it("stores and reads back a column name", () => {
    writeStoredGrouping("gtg.groupBy.x.y", "new_category");
    expect(readStoredGrouping("gtg.groupBy.x.y")).toBe("new_category");
  });

  it("clears the preference when given undefined", () => {
    writeStoredGrouping("gtg.groupBy.x.y", "new_category");
    writeStoredGrouping("gtg.groupBy.x.y", undefined);
    expect(readStoredGrouping("gtg.groupBy.x.y")).toBeUndefined();
  });

  it("treats an empty stored value as nothing stored", () => {
    window.localStorage.setItem("gtg.groupBy.x.y", "");
    expect(readStoredGrouping("gtg.groupBy.x.y")).toBeUndefined();
  });

  it("does not throw when storage is unavailable", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError: storage disabled");
      }
    });
    expect(() => writeStoredGrouping("k", "v")).not.toThrow();
    expect(readStoredGrouping("k")).toBeUndefined();
    if (original) Object.defineProperty(window, "localStorage", original);
  });
});

describe("resolveGroupingColumn", () => {
  it("prefers the user's stored choice over the maker's configuration", () => {
    expect(resolveGroupingColumn("new_category", "createdon", columns)).toBe("new_category");
  });

  it("falls back to the configured column when nothing is stored", () => {
    expect(resolveGroupingColumn(undefined, "createdon", columns)).toBe("createdon");
  });

  it("ignores a stored column that is no longer in the view", () => {
    expect(resolveGroupingColumn("gone_column", "createdon", columns)).toBe("createdon");
  });

  it("ignores a configured column that is not in the view", () => {
    expect(resolveGroupingColumn(undefined, "not_here", columns)).toBeUndefined();
  });

  it("returns undefined when neither is usable, leaving the grid ungrouped", () => {
    expect(resolveGroupingColumn(undefined, undefined, columns)).toBeUndefined();
  });

  it("returns undefined when the view has no columns yet", () => {
    expect(resolveGroupingColumn("new_category", "createdon", [])).toBeUndefined();
  });
});

describe("Remove grouping (NO_GROUPING sentinel)", () => {
  const columns = [{ name: "new_category" }, { name: "createdon" }];

  it("removing grouping wins over the maker's configured column", () => {
    // The bug: clearing the preference was indistinguishable from never having
    // chosen, so resolve fell back to `configured` and grouping reappeared.
    expect(resolveGroupingColumn(NO_GROUPING, "createdon", columns)).toBeUndefined();
  });

  it("removing grouping wins even when the stored column was valid", () => {
    expect(resolveGroupingColumn(NO_GROUPING, "new_category", columns)).toBeUndefined();
  });

  it("still falls back to the configured column when nothing is stored", () => {
    expect(resolveGroupingColumn(undefined, "createdon", columns)).toBe("createdon");
  });

  it("survives a round trip through storage", () => {
    window.localStorage.clear();
    const key = groupingStorageKey("devnt_timeentries", "view-1");
    writeStoredGrouping(key, NO_GROUPING);
    expect(readStoredGrouping(key)).toBe(NO_GROUPING);
    expect(resolveGroupingColumn(readStoredGrouping(key), "new_category", columns)).toBeUndefined();
  });

  it("re-grouping after removal works", () => {
    window.localStorage.clear();
    const key = groupingStorageKey("devnt_timeentries", "view-1");
    writeStoredGrouping(key, NO_GROUPING);
    writeStoredGrouping(key, "new_category");
    expect(resolveGroupingColumn(readStoredGrouping(key), undefined, columns)).toBe("new_category");
  });

  it("the sentinel is never mistaken for a real column name", () => {
    expect(resolveGroupingColumn(NO_GROUPING, undefined, [{ name: NO_GROUPING }])).toBeUndefined();
  });
});
