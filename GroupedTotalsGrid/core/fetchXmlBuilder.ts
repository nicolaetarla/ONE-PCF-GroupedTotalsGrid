/**
 * Turning the current view into an aggregate query.
 *
 * The rows on screen come from the dataset API. The totals come from here: a
 * second, parallel query that asks the server to do the maths, so the numbers
 * are right regardless of how many pages the user has scrolled.
 *
 * Fidelity is the whole game. If this query does not carry every filter the
 * user can see, the totals silently disagree with the rows - which is worse
 * than showing no totals at all. So we start from the view's own FetchXML
 * rather than reconstructing one, and layer the runtime state on top.
 *
 * Aggregate FetchXML rules we have to respect:
 *   - every attribute must carry either groupby="true" or an aggregate;
 *   - link-entities used only for filtering must not carry attributes;
 *   - <order> is only valid on an alias, so view sort orders are dropped;
 *   - paging attributes are meaningless and are stripped.
 */

export interface AggregateColumnSpec {
  logicalName: string;
  alias: string;
  /** Money columns also request the _base column for mixed-currency groups. */
  isMoney?: boolean;
}

export interface GroupBySpec {
  logicalName: string;
  dataType: string;
  /** For lookups: the target table, so we can join for a display name. */
  lookupTargetEntity?: string;
  /** For lookups: the target's primary name attribute, e.g. "name". */
  lookupTargetNameAttribute?: string;
  /** Optional date bucketing: groups by calendar unit rather than instant. */
  dateGrouping?: "day" | "week" | "month" | "quarter" | "year";
}

export interface BuildAggregateOptions {
  entityName: string;
  /** FetchXML from the savedquery / userquery record. */
  viewFetchXml: string;
  groupBy: GroupBySpec;
  aggregates: readonly AggregateColumnSpec[];
  /**
   * Runtime filter serialised as a FetchXML <filter> element, derived from
   * dataset.filtering.getFilter(). Ignored when empty.
   */
  runtimeFilterXml?: string;
  /** Extra <link-entity> XML for subgrid relationship filtering. */
  extraLinkEntitiesXml?: readonly string[];
  /** Include a per-group record count. Defaults to true. */
  includeCount?: boolean;
  /** Also aggregate the transaction currency, to detect mixed-currency groups. */
  detectMixedCurrency?: boolean;
  /** Primary id attribute of the entity, used for the count aggregate. */
  primaryIdAttribute: string;
}

const GROUP_ALIAS = "gtg_group";
const GROUP_NAME_ALIAS = "gtg_group_name";
const COUNT_ALIAS = "gtg_count";
const CURRENCY_ALIAS = "gtg_currency";

export const ALIASES = {
  group: GROUP_ALIAS,
  groupName: GROUP_NAME_ALIAS,
  count: COUNT_ALIAS,
  currency: CURRENCY_ALIAS,
  base: (alias: string): string => `${alias}_base`
};

function parse(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const err = doc.getElementsByTagName("parsererror")[0];
  if (err) throw new Error(`Invalid FetchXML: ${err.textContent ?? "parse error"}`);
  return doc;
}

function serialize(doc: Document): string {
  return new XMLSerializer().serializeToString(doc.documentElement);
}

function removeAll(parent: Element, tagName: string): void {
  const nodes = Array.from(parent.getElementsByTagName(tagName));
  for (const n of nodes) n.parentNode?.removeChild(n);
}

function appendXml(doc: Document, parent: Element, xml: string): void {
  const fragment = parse(`<wrapper>${xml}</wrapper>`);
  const imported = Array.from(fragment.documentElement.childNodes).map((n) => doc.importNode(n, true));
  for (const node of imported) parent.appendChild(node);
}

/**
 * Build the aggregate query.
 *
 * Throws if the view FetchXML cannot be parsed, so the caller can fall back to
 * client-side totals rather than showing nothing.
 */
export function buildAggregateFetchXml(options: BuildAggregateOptions): string {
  const doc = parse(options.viewFetchXml);
  const fetch = doc.documentElement;
  if (fetch.tagName !== "fetch") throw new Error("View FetchXML has no <fetch> root");

  const entity = fetch.getElementsByTagName("entity")[0];
  if (!entity) throw new Error("View FetchXML has no <entity>");

  // ---- fetch-level attributes -------------------------------------------
  fetch.setAttribute("aggregate", "true");
  for (const attr of ["count", "page", "paging-cookie", "returntotalrecordcount", "top", "distinct"]) {
    fetch.removeAttribute(attr);
  }

  // ---- strip anything illegal in an aggregate query ----------------------
  removeAll(entity, "attribute");
  removeAll(entity, "all-attributes");
  removeAll(entity, "order");

  // ---- group by ----------------------------------------------------------
  const groupAttr = doc.createElement("attribute");
  groupAttr.setAttribute("name", options.groupBy.logicalName);
  groupAttr.setAttribute("alias", GROUP_ALIAS);
  groupAttr.setAttribute("groupby", "true");
  if (options.groupBy.dateGrouping) {
    // dategrouping is only valid on date attributes; the caller guarantees that.
    groupAttr.setAttribute("dategrouping", options.groupBy.dateGrouping);
  }
  entity.appendChild(groupAttr);

  // ---- aggregates --------------------------------------------------------
  for (const agg of options.aggregates) {
    const el = doc.createElement("attribute");
    el.setAttribute("name", agg.logicalName);
    el.setAttribute("alias", agg.alias);
    el.setAttribute("aggregate", "sum");
    entity.appendChild(el);

    if (agg.isMoney) {
      const baseEl = doc.createElement("attribute");
      baseEl.setAttribute("name", `${agg.logicalName}_base`);
      baseEl.setAttribute("alias", ALIASES.base(agg.alias));
      baseEl.setAttribute("aggregate", "sum");
      entity.appendChild(baseEl);
    }
  }

  if (options.includeCount !== false) {
    const countEl = doc.createElement("attribute");
    countEl.setAttribute("name", options.primaryIdAttribute);
    countEl.setAttribute("alias", COUNT_ALIAS);
    countEl.setAttribute("aggregate", "countcolumn");
    entity.appendChild(countEl);
  }

  if (options.detectMixedCurrency) {
    // Grouping by currency as well splits each group per currency. The client
    // recombines them and marks the group mixed when more than one row comes
    // back for the same group key.
    const cur = doc.createElement("attribute");
    cur.setAttribute("name", "transactioncurrencyid");
    cur.setAttribute("alias", CURRENCY_ALIAS);
    cur.setAttribute("groupby", "true");
    entity.appendChild(cur);
  }

  // ---- lookup grouping: join for the display name ------------------------
  if (options.groupBy.lookupTargetEntity && options.groupBy.lookupTargetNameAttribute) {
    const link = doc.createElement("link-entity");
    link.setAttribute("name", options.groupBy.lookupTargetEntity);
    link.setAttribute("from", `${options.groupBy.lookupTargetEntity}id`);
    link.setAttribute("to", options.groupBy.logicalName);
    // Outer join so records whose lookup is set but whose target the user
    // cannot read still contribute to a group rather than vanishing from the
    // totals while remaining visible in the rows.
    link.setAttribute("link-type", "outer");
    link.setAttribute("alias", "gtg_target");

    const nameAttr = doc.createElement("attribute");
    nameAttr.setAttribute("name", options.groupBy.lookupTargetNameAttribute);
    nameAttr.setAttribute("alias", GROUP_NAME_ALIAS);
    nameAttr.setAttribute("groupby", "true");
    link.appendChild(nameAttr);

    entity.appendChild(link);
  }

  // ---- existing link-entities must not carry attributes ------------------
  for (const link of Array.from(entity.getElementsByTagName("link-entity"))) {
    if (link.getAttribute("alias") === "gtg_target") continue;
    removeAll(link, "attribute");
    removeAll(link, "all-attributes");
    removeAll(link, "order");
  }

  // ---- runtime state -----------------------------------------------------
  if (options.runtimeFilterXml && options.runtimeFilterXml.trim()) {
    appendXml(doc, entity, options.runtimeFilterXml);
  }
  for (const linkXml of options.extraLinkEntitiesXml ?? []) {
    if (linkXml && linkXml.trim()) appendXml(doc, entity, linkXml);
  }

  return serialize(doc);
}

/**
 * Wrap the aggregate query for a single group, used when a group is expanded
 * and its rows were never loaded client-side.
 */
export function buildScopedRowFetchXml(
  viewFetchXml: string,
  groupBy: GroupBySpec,
  rawValue: string | number | boolean | null,
  runtimeFilterXml?: string
): string {
  const doc = parse(viewFetchXml);
  const entity = doc.documentElement.getElementsByTagName("entity")[0];
  if (!entity) throw new Error("View FetchXML has no <entity>");

  const filter = doc.createElement("filter");
  filter.setAttribute("type", "and");

  const condition = doc.createElement("condition");
  condition.setAttribute("attribute", groupBy.logicalName);
  if (rawValue === null) {
    condition.setAttribute("operator", "null");
  } else {
    condition.setAttribute("operator", "eq");
    condition.setAttribute("value", String(rawValue));
  }
  filter.appendChild(condition);
  entity.appendChild(filter);

  if (runtimeFilterXml && runtimeFilterXml.trim()) appendXml(doc, entity, runtimeFilterXml);

  return serialize(doc);
}
