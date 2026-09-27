/**
 * Runtime filter -> FetchXML.
 *
 * The platform exposes the dataset filter as an object graph, not as XML, so
 * this is a translation rather than a pass-through - and it is the single most
 * likely place for the totals to drift from the rows. Every operator or shape
 * we do not recognise returns undefined, which the caller treats as a
 * deliberate fall back to client-side totals rather than a silently wrong
 * number.
 *
 * Operator codes are the ConditionOperator enum as documented for PCF
 * (ConditionExpression reference) and the Dataverse SDK
 * (Microsoft.Xrm.Sdk.Query.ConditionOperator). Do not add a code without
 * checking it against both.
 */

type Arity = "none" | "single" | "multi" | "pair";

interface OperatorDef {
  fetch: string;
  arity: Arity;
}

export const CONDITION_OPERATORS: Readonly<Record<number, OperatorDef>> = {
  0: { fetch: "eq", arity: "single" },
  1: { fetch: "ne", arity: "single" },
  2: { fetch: "gt", arity: "single" },
  3: { fetch: "lt", arity: "single" },
  4: { fetch: "ge", arity: "single" },
  5: { fetch: "le", arity: "single" },
  6: { fetch: "like", arity: "single" },
  7: { fetch: "not-like", arity: "single" },
  8: { fetch: "in", arity: "multi" },
  9: { fetch: "not-in", arity: "multi" },
  10: { fetch: "between", arity: "pair" },
  11: { fetch: "not-between", arity: "pair" },
  12: { fetch: "null", arity: "none" },
  13: { fetch: "not-null", arity: "none" },
  14: { fetch: "yesterday", arity: "none" },
  15: { fetch: "today", arity: "none" },
  16: { fetch: "tomorrow", arity: "none" },
  17: { fetch: "last-seven-days", arity: "none" },
  18: { fetch: "next-seven-days", arity: "none" },
  19: { fetch: "last-week", arity: "none" },
  20: { fetch: "this-week", arity: "none" },
  21: { fetch: "next-week", arity: "none" },
  22: { fetch: "last-month", arity: "none" },
  23: { fetch: "this-month", arity: "none" },
  24: { fetch: "next-month", arity: "none" },
  25: { fetch: "on", arity: "single" },
  26: { fetch: "on-or-before", arity: "single" },
  27: { fetch: "on-or-after", arity: "single" },
  28: { fetch: "last-year", arity: "none" },
  29: { fetch: "this-year", arity: "none" },
  30: { fetch: "next-year", arity: "none" },
  31: { fetch: "last-x-hours", arity: "single" },
  32: { fetch: "next-x-hours", arity: "single" },
  33: { fetch: "last-x-days", arity: "single" },
  34: { fetch: "next-x-days", arity: "single" },
  35: { fetch: "last-x-weeks", arity: "single" },
  36: { fetch: "next-x-weeks", arity: "single" },
  37: { fetch: "last-x-months", arity: "single" },
  38: { fetch: "next-x-months", arity: "single" },
  39: { fetch: "last-x-years", arity: "single" },
  40: { fetch: "next-x-years", arity: "single" },
  41: { fetch: "eq-userid", arity: "none" },
  42: { fetch: "ne-userid", arity: "none" },
  54: { fetch: "begins-with", arity: "single" },
  55: { fetch: "not-begin-with", arity: "single" },
  56: { fetch: "ends-with", arity: "single" },
  57: { fetch: "not-end-with", arity: "single" },
  87: { fetch: "contain-values", arity: "multi" },
  88: { fetch: "not-contain-values", arity: "multi" }
  // Deliberately absent, so they fall back:
  // 49 Contains - full-text only in Dataverse; its runtime semantics from the
  //    grid are not verified.
  // 75-79 hierarchy operators - the PCF and SDK references disagree on which
  //    code is Above vs Under.
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toValues(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value]).map((v) => String(v));
}

interface Condition {
  attributeName?: string;
  conditionOperator?: number;
  value?: unknown;
  entityAliasName?: string;
}

function conditionToXml(condition: Condition): string | undefined {
  const def = CONDITION_OPERATORS[condition.conditionOperator ?? -1];
  if (!def) return undefined;

  // A condition on a linked table references an alias the aggregate query may
  // not carry. Applying it to the root entity would be wrong, so fall back.
  if (condition.entityAliasName) return undefined;

  const attr = `attribute="${escapeXml(condition.attributeName ?? "")}" operator="${def.fetch}"`;
  const values = toValues(condition.value);

  switch (def.arity) {
    case "none":
      return `<condition ${attr} />`;
    case "single":
      if (values.length !== 1) return undefined;
      return `<condition ${attr} value="${escapeXml(values[0])}" />`;
    case "pair":
      if (values.length !== 2) return undefined;
      return `<condition ${attr}>${values.map((v) => `<value>${escapeXml(v)}</value>`).join("")}</condition>`;
    case "multi":
      if (values.length === 0) return undefined;
      return `<condition ${attr}>${values.map((v) => `<value>${escapeXml(v)}</value>`).join("")}</condition>`;
  }
}

/**
 * Returns the FetchXML filter, "" for no filter, or undefined when the filter
 * contains anything that cannot be translated faithfully.
 */
export function filterExpressionToFetchXml(filter: unknown): string | undefined {
  if (!filter || typeof filter !== "object") return undefined;
  const f = filter as {
    filterOperator?: number;
    conditions?: Condition[];
    filters?: unknown[];
  };

  const parts: string[] = [];
  for (const condition of f.conditions ?? []) {
    if (!condition.attributeName) continue;
    const xml = conditionToXml(condition);
    if (xml === undefined) return undefined; // untranslatable: bail out honestly
    parts.push(xml);
  }

  for (const nested of f.filters ?? []) {
    const inner = filterExpressionToFetchXml(nested);
    if (inner === undefined) return undefined;
    if (inner) parts.push(inner);
  }

  if (parts.length === 0) return "";
  const type = f.filterOperator === 1 ? "or" : "and";
  return `<filter type="${type}">${parts.join("")}</filter>`;
}
