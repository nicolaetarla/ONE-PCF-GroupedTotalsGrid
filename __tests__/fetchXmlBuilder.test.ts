import {
  ALIASES,
  buildAggregateFetchXml,
  buildScopedRowFetchXml
} from "../GroupedTotalsGrid/core/fetchXmlBuilder";

const VIEW_FETCH = `
<fetch version="1.0" count="50" page="1" returntotalrecordcount="true" distinct="false">
  <entity name="msdyn_timeentry">
    <attribute name="msdyn_timeentryid" />
    <attribute name="msdyn_duration" />
    <attribute name="msdyn_start" />
    <order attribute="msdyn_start" descending="true" />
    <filter type="and">
      <condition attribute="msdyn_entrystatus" operator="eq" value="192350001" />
      <condition attribute="msdyn_start" operator="on-or-after" value="2026-01-01" />
    </filter>
    <link-entity name="bookableresource" from="bookableresourceid" to="msdyn_bookableresource" link-type="inner" alias="br">
      <attribute name="name" />
      <filter type="and">
        <condition attribute="statecode" operator="eq" value="0" />
      </filter>
    </link-entity>
  </entity>
</fetch>`;

function build(overrides: Partial<Parameters<typeof buildAggregateFetchXml>[0]> = {}): string {
  return buildAggregateFetchXml({
    entityName: "msdyn_timeentry",
    viewFetchXml: VIEW_FETCH,
    primaryIdAttribute: "msdyn_timeentryid",
    groupBy: {
      logicalName: "msdyn_bookableresource",
      dataType: "Lookup.Simple",
      lookupTargetEntity: "bookableresource",
      lookupTargetNameAttribute: "name"
    },
    aggregates: [{ logicalName: "msdyn_duration", alias: "agg_duration" }],
    ...overrides
  });
}

describe("buildAggregateFetchXml", () => {
  it("marks the fetch as an aggregate query", () => {
    expect(build()).toContain('aggregate="true"');
  });

  it("strips paging attributes that are meaningless for aggregates", () => {
    const xml = build();
    expect(xml).not.toContain('count="50"');
    expect(xml).not.toContain('page="1"');
    expect(xml).not.toContain("returntotalrecordcount");
  });

  it("drops the view's sort order, which aggregate queries reject", () => {
    expect(build()).not.toContain("<order");
  });

  it("removes the view's plain attributes", () => {
    const xml = build();
    expect(xml).not.toContain('<attribute name="msdyn_start"/>');
    expect(xml).not.toContain('<attribute name="msdyn_start" />');
  });

  it("preserves the view's filters exactly", () => {
    const xml = build();
    expect(xml).toContain('attribute="msdyn_entrystatus"');
    expect(xml).toContain('value="192350001"');
    expect(xml).toContain('operator="on-or-after"');
  });

  it("preserves filtering link-entities but strips their attributes", () => {
    const xml = build();
    expect(xml).toContain('name="bookableresource"');
    expect(xml).toContain('attribute="statecode"');
    // the link's <attribute name="name" /> must not survive on the filter link
    const start = xml.indexOf('alias="br"');
    const filterLink = xml.slice(start, xml.indexOf("</link-entity>", start));
    expect(filterLink).not.toContain("<attribute");
  });

  it("groups by the requested column", () => {
    const xml = build();
    expect(xml).toContain('name="msdyn_bookableresource"');
    expect(xml).toContain(`alias="${ALIASES.group}"`);
    expect(xml).toContain('groupby="true"');
  });

  it("joins the lookup target to get a display name", () => {
    const xml = build();
    expect(xml).toContain('alias="gtg_target"');
    expect(xml).toContain(`alias="${ALIASES.groupName}"`);
    expect(xml).toContain('link-type="outer"');
  });

  it("sums each requested aggregate column", () => {
    const xml = build({
      aggregates: [
        { logicalName: "msdyn_duration", alias: "agg_duration" },
        { logicalName: "amount", alias: "agg_amount" }
      ]
    });
    expect(xml).toContain('alias="agg_duration"');
    expect(xml).toContain('alias="agg_amount"');
    expect((xml.match(/aggregate="sum"/g) ?? []).length).toBe(2);
  });

  it("also sums the base column for money aggregates", () => {
    const xml = build({
      aggregates: [{ logicalName: "amount", alias: "agg_amount", isMoney: true }]
    });
    expect(xml).toContain('name="amount_base"');
    expect(xml).toContain(`alias="${ALIASES.base("agg_amount")}"`);
  });

  it("includes a per-group record count", () => {
    expect(build()).toContain(`alias="${ALIASES.count}"`);
    expect(build()).toContain('aggregate="countcolumn"');
  });

  it("omits the count when asked to", () => {
    expect(build({ includeCount: false })).not.toContain(`alias="${ALIASES.count}"`);
  });

  it("adds currency grouping when mixed-currency detection is on", () => {
    const xml = build({ detectMixedCurrency: true });
    expect(xml).toContain('name="transactioncurrencyid"');
    expect(xml).toContain(`alias="${ALIASES.currency}"`);
  });

  it("merges the runtime filter on top of the view filter", () => {
    const xml = build({
      runtimeFilterXml:
        '<filter type="and"><condition attribute="msdyn_start" operator="on-or-before" value="2026-03-31" /></filter>'
    });
    expect(xml).toContain('value="192350001"'); // view filter survives
    expect(xml).toContain('value="2026-03-31"'); // runtime filter added
  });

  it("merges subgrid relationship link-entities", () => {
    const xml = build({
      extraLinkEntitiesXml: [
        '<link-entity name="msdyn_workorder" from="msdyn_workorderid" to="msdyn_workorder" link-type="inner"><filter><condition attribute="msdyn_workorderid" operator="eq" value="abc" /></filter></link-entity>'
      ]
    });
    expect(xml).toContain('name="msdyn_workorder"');
    expect(xml).toContain('value="abc"');
  });

  it("applies date grouping when requested", () => {
    const xml = build({
      groupBy: { logicalName: "msdyn_start", dataType: "DateAndTime.DateAndTime", dateGrouping: "month" }
    });
    expect(xml).toContain('dategrouping="month"');
  });

  it("throws on unparseable FetchXML so the caller can fall back", () => {
    expect(() => build({ viewFetchXml: "<fetch><entity" })).toThrow();
  });

  it("throws when there is no entity element", () => {
    expect(() => build({ viewFetchXml: "<fetch></fetch>" })).toThrow();
  });
});

describe("buildScopedRowFetchXml", () => {
  it("restricts rows to a single group", () => {
    const xml = buildScopedRowFetchXml(
      VIEW_FETCH,
      { logicalName: "msdyn_bookableresource", dataType: "Lookup.Simple" },
      "11111111-1111-1111-1111-111111111111"
    );
    expect(xml).toContain('attribute="msdyn_bookableresource"');
    expect(xml).toContain('operator="eq"');
    expect(xml).toContain("11111111-1111-1111-1111-111111111111");
    // the view's own attributes and sort must survive here - these are real rows
    expect(xml).toContain('<attribute name="msdyn_duration"');
    expect(xml).toContain("<order");
  });

  it("uses a null condition for the empty group", () => {
    const xml = buildScopedRowFetchXml(
      VIEW_FETCH,
      { logicalName: "msdyn_bookableresource", dataType: "Lookup.Simple" },
      null
    );
    expect(xml).toContain('operator="null"');
  });
});
