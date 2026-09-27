import { CONDITION_OPERATORS, filterExpressionToFetchXml } from "../GroupedTotalsGrid/core/filterTranslator";

function one(conditionOperator: number, value?: unknown, extra: Record<string, unknown> = {}) {
  return filterExpressionToFetchXml({
    filterOperator: 0,
    conditions: [{ attributeName: "amount", conditionOperator, value, ...extra }]
  });
}

describe("filterExpressionToFetchXml", () => {
  // Codes from the ConditionOperator enum (PCF ConditionExpression reference and
  // Microsoft.Xrm.Sdk.Query.ConditionOperator). A wrong code here silently
  // changes what the totals include, so every documented code is pinned.
  test.each([
    [0, "eq"],
    [1, "ne"],
    [2, "gt"],
    [3, "lt"],
    [4, "ge"],
    [5, "le"],
    [6, "like"],
    [7, "not-like"],
    [25, "on"],
    [26, "on-or-before"],
    [27, "on-or-after"],
    [33, "last-x-days"],
    [54, "begins-with"]
  ])("code %i maps to %s", (code, fetch) => {
    expect(one(code, "5")).toBe(
      `<filter type="and"><condition attribute="amount" operator="${fetch}" value="5" /></filter>`
    );
  });

  test.each([
    [12, "null"],
    [13, "not-null"],
    [14, "yesterday"],
    [15, "today"],
    [16, "tomorrow"],
    [17, "last-seven-days"],
    [22, "last-month"],
    [23, "this-month"],
    [29, "this-year"]
  ])("valueless code %i maps to %s", (code, fetch) => {
    expect(one(code)).toBe(`<filter type="and"><condition attribute="amount" operator="${fetch}" /></filter>`);
  });

  it("emits <value> children for in / not-in", () => {
    expect(one(8, ["1", "2"])).toBe(
      '<filter type="and"><condition attribute="amount" operator="in"><value>1</value><value>2</value></condition></filter>'
    );
    expect(one(9, "3")).toContain('operator="not-in"><value>3</value>');
  });

  it("emits two values for between", () => {
    expect(one(10, ["1", "9"])).toContain('operator="between"><value>1</value><value>9</value>');
    expect(one(10, ["1"])).toBeUndefined();
  });

  it("falls back on unknown, unverified or ambiguous operators", () => {
    expect(one(49, "x")).toBeUndefined(); // Contains
    expect(one(75, "x")).toBeUndefined(); // hierarchy
    expect(one(999, "x")).toBeUndefined();
    expect(one(undefined as unknown as number, "x")).toBeUndefined();
  });

  it("falls back when a single-value operator has no value", () => {
    expect(one(0)).toBeUndefined();
    expect(one(8, [])).toBeUndefined();
  });

  it("falls back on linked-entity conditions", () => {
    expect(one(0, "1", { entityAliasName: "br" })).toBeUndefined();
  });

  it("escapes attribute names and values", () => {
    const xml = filterExpressionToFetchXml({
      conditions: [{ attributeName: 'a"b', conditionOperator: 0, value: '<x & "y">' }]
    });
    expect(xml).toContain('attribute="a&quot;b"');
    expect(xml).toContain('value="&lt;x &amp; &quot;y&quot;&gt;"');
  });

  it("nests filters and honours or", () => {
    expect(
      filterExpressionToFetchXml({
        filterOperator: 1,
        conditions: [{ attributeName: "a", conditionOperator: 12 }],
        filters: [{ conditions: [{ attributeName: "b", conditionOperator: 13 }] }]
      })
    ).toBe(
      '<filter type="or"><condition attribute="a" operator="null" /><filter type="and"><condition attribute="b" operator="not-null" /></filter></filter>'
    );
  });

  it("bails out if any nested filter is untranslatable", () => {
    expect(
      filterExpressionToFetchXml({
        conditions: [{ attributeName: "a", conditionOperator: 0, value: "1" }],
        filters: [{ conditions: [{ attributeName: "b", conditionOperator: 49, value: "x" }] }]
      })
    ).toBeUndefined();
  });

  it("returns empty for no conditions and undefined for non-objects", () => {
    expect(filterExpressionToFetchXml({})).toBe("");
    expect(filterExpressionToFetchXml(null)).toBeUndefined();
  });

  it("does not map the codes the old table got wrong to their old operators", () => {
    expect(CONDITION_OPERATORS[3].fetch).toBe("lt");
    expect(CONDITION_OPERATORS[4].fetch).toBe("ge");
    expect(CONDITION_OPERATORS[22].fetch).not.toBe("in");
    expect(CONDITION_OPERATORS[27].fetch).toBe("on-or-after");
  });
});
