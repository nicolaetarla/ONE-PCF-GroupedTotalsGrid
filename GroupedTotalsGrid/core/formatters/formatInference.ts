/**
 * Building a ColumnFormat: how a total in this column must be rendered.
 *
 * Three sources, in priority order:
 *   1. Attribute metadata  - authoritative for precision.
 *   2. User locale settings - separators, symbol, default digits.
 *   3. Sampled getFormattedValue() output - cross-check, and the only source
 *      for duration shape and for a currency symbol that differs per record.
 *
 * Where metadata and samples disagree, the samples win and we mark the format
 * `inferred`, because the cells are what the user is looking at and the total
 * has to match the cells, not the schema.
 */

import { ColumnFormat, DurationShape, GridColumn, NumberFormattingInfo, NumericKind } from "../types";
import { DurationSample, inferDurationFormat, DurationFormat } from "./durationFormatter";
import { tokeniseNumbers } from "./localeNumber";

/** Subset of attribute metadata we consume. */
export interface AttributeFormatMetadata {
  logicalName: string;
  /** Money / Decimal precision. */
  precision?: number;
  /**
   * Money only. 0 = use `precision`, 1 = organisation pricing precision,
   * 2 = the precision of the record's transaction currency.
   */
  precisionSource?: number;
  /** Integer attributes: "None" | "Duration" | "TimeZone" | "Language". */
  format?: string;
}

export interface InferenceInputs {
  column: GridColumn;
  metadata?: AttributeFormatMetadata;
  samples: readonly DurationSample[];
  numberFormattingInfo: NumberFormattingInfo;
  /** Organisation pricing decimal precision, for PrecisionSource === 1. */
  organizationPricingPrecision?: number;
  /** Transaction currency precision, for PrecisionSource === 2. */
  currencyPrecision?: number;
  /** ISO code / symbol of the record currency when uniform across the set. */
  currencySymbol?: string;
  currencyIsoCode?: string;
  /** Explicit override from the durationDisplay property, if not "Auto". */
  explicitDurationShape?: DurationShape;
}

export function kindForDataType(dataType: string, metadataFormat?: string): NumericKind {
  if (dataType === "Currency") return "currency";
  if (dataType === "Decimal" || dataType === "FP") return "decimal";
  if (dataType === "Whole.Duration") return "duration";
  if (dataType === "Whole.None") return metadataFormat === "Duration" ? "duration" : "integer";
  return "decimal";
}

/**
 * Count decimal places the platform actually rendered, across samples.
 *
 * Takes the maximum rather than the first, because a column with precision 2
 * can render a whole value as "1,234.00" but a badly configured one may render
 * "1,234" - and under-rendering the total is the more visible error.
 */
function inferPrecisionFromSamples(
  samples: readonly DurationSample[],
  info: NumberFormattingInfo,
  useCurrencySeparators: boolean
): number | undefined {
  let best: number | undefined;
  for (const s of samples) {
    if (!s?.formatted) continue;
    const t = tokeniseNumbers(s.formatted, info, useCurrencySeparators);
    if (t.precisions.length === 0) continue;
    const p = t.precisions[0];
    if (best === undefined || p > best) best = p;
  }
  return best;
}

/**
 * Everything that is not a digit, separator, sign or bracket in a formatted
 * money value is the currency symbol. Works for prefix and suffix locales, and
 * for ISO-code display ("1,234.50 USD").
 */
export function inferCurrencySymbol(
  samples: readonly DurationSample[],
  info: NumberFormattingInfo
): string | undefined {
  for (const s of samples) {
    if (!s?.formatted) continue;
    const t = tokeniseNumbers(s.formatted, info, true);
    if (t.tokens.length === 0) continue;
    const symbol = t.segments
      .join(" ")
      .replace(/[()\-\u2212+\s]/g, " ")
      .trim();
    if (symbol) return symbol;
  }
  return undefined;
}

function resolveMoneyPrecision(inputs: InferenceInputs): number | undefined {
  const md = inputs.metadata;
  if (!md) return undefined;
  switch (md.precisionSource) {
    case 1:
      return inputs.organizationPricingPrecision ?? md.precision;
    case 2:
      return inputs.currencyPrecision ?? md.precision;
    case 0:
    default:
      return md.precision;
  }
}

export interface ResolvedColumnFormat extends ColumnFormat {
  /** Present only for kind === "duration". */
  duration?: DurationFormat;
}

export function buildColumnFormat(inputs: InferenceInputs): ResolvedColumnFormat {
  const { column, metadata, samples, numberFormattingInfo: info } = inputs;
  const kind = kindForDataType(column.dataType, metadata?.format);

  if (kind === "duration") {
    const duration = inferDurationFormat(samples, info, inputs.explicitDurationShape);
    return {
      columnName: column.name,
      kind,
      precision: 0,
      durationShape: duration.shape,
      duration,
      inferred: duration.inferred
    };
  }

  if (kind === "integer") {
    return { columnName: column.name, kind, precision: 0, inferred: false };
  }

  const isCurrency = kind === "currency";
  const metadataPrecision = isCurrency ? resolveMoneyPrecision(inputs) : metadata?.precision;
  const sampledPrecision = inferPrecisionFromSamples(samples, info, isCurrency);

  // Samples win on disagreement: the total sits directly beneath these cells.
  const precision =
    sampledPrecision ??
    metadataPrecision ??
    (isCurrency ? info.currencyDecimalDigits : info.numberDecimalDigits);

  const inferred =
    sampledPrecision !== undefined &&
    metadataPrecision !== undefined &&
    sampledPrecision !== metadataPrecision;

  return {
    columnName: column.name,
    kind,
    precision,
    currencySymbol: isCurrency
      ? inputs.currencySymbol ?? inferCurrencySymbol(samples, info) ?? info.currencySymbol
      : undefined,
    currencyIsoCode: isCurrency ? inputs.currencyIsoCode : undefined,
    inferred
  };
}
