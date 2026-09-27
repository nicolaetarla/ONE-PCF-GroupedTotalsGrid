/**
 * Locale primitives.
 *
 * The platform formatters (context.formatting.*) are the source of truth for
 * rendering. This module exists for the two things they cannot do:
 *
 *   1. Parse a platform-formatted string back into its numeric tokens, which is
 *      how format inference works (formatInference.ts, durationFormatter.ts).
 *   2. Render a number when no platform context is available - unit tests, and
 *      the decimal-hours duration shape, which has no platform formatter.
 *
 * All of it is driven by context.userSettings.numberFormattingInfo, so it
 * behaves correctly under locales that use "." as a group separator and ","
 * as the decimal separator.
 */

import { NumberFormattingInfo } from "../types";

/** Sensible en-US defaults, used only when the host supplies nothing. */
export const DEFAULT_NUMBER_FORMATTING_INFO: NumberFormattingInfo = {
  numberDecimalSeparator: ".",
  numberGroupSeparator: ",",
  numberGroupSizes: [3],
  currencyDecimalSeparator: ".",
  currencyGroupSeparator: ",",
  currencyGroupSizes: [3],
  currencySymbol: "$",
  currencyDecimalDigits: 2,
  numberDecimalDigits: 2,
  currencyNegativePattern: 0,
  currencyPositivePattern: 0,
  numberNegativePattern: 1
};

/**
 * Numeric tokens found in a formatted string, in order, with the literal text
 * that surrounds them. `segments` always has exactly tokens.length + 1 entries,
 * so the original string is segments[0] + tokens[0] + segments[1] + ...
 *
 * This is what lets us reconstruct a total using the platform's own unit words
 * instead of guessing at them.
 */
export interface TokenisedNumber {
  tokens: number[];
  /** Raw text of each token exactly as it appeared, e.g. "1,234.50". */
  rawTokens: string[];
  segments: string[];
  /** Decimal places seen on each token. */
  precisions: number[];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Pull the numbers out of a formatted value, honouring the user's separators.
 *
 * "1.234,50 EUR" under de-DE yields tokens [1234.5], precisions [2],
 * segments ["", " EUR"].
 */
export function tokeniseNumbers(
  formatted: string,
  info: NumberFormattingInfo,
  useCurrencySeparators = false
): TokenisedNumber {
  const dec = useCurrencySeparators ? info.currencyDecimalSeparator : info.numberDecimalSeparator;
  const grp = useCurrencySeparators ? info.currencyGroupSeparator : info.numberGroupSeparator;

  const d = escapeRegExp(dec);
  const g = escapeRegExp(grp);
  // A number is digits, optionally interrupted by group separators, optionally
  // followed by a decimal separator and more digits. Leading sign is captured
  // so negatives round-trip.
  const re = new RegExp(`-?\\d+(?:${g}\\d{2,4})*(?:${d}\\d+)?`, "g");

  const tokens: number[] = [];
  const rawTokens: string[] = [];
  const precisions: number[] = [];
  const segments: string[] = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(formatted)) !== null) {
    segments.push(formatted.slice(lastIndex, match.index));
    const raw = match[0];
    rawTokens.push(raw);

    const normalised = raw.split(grp).join("").split(dec).join(".");
    tokens.push(Number(normalised));

    const decIdx = raw.lastIndexOf(dec);
    precisions.push(decIdx >= 0 ? raw.length - decIdx - dec.length : 0);

    lastIndex = match.index + raw.length;
  }
  segments.push(formatted.slice(lastIndex));

  return { tokens, rawTokens, segments, precisions };
}

/** Apply the locale's digit grouping to an already-stringified integer part. */
function applyGrouping(digits: string, sizes: number[], separator: string): string {
  if (!separator || sizes.length === 0 || sizes[0] === 0) return digits;

  const out: string[] = [];
  let index = digits.length;
  let sizeIdx = 0;

  while (index > 0) {
    const size = sizes[Math.min(sizeIdx, sizes.length - 1)];
    if (size <= 0) break;
    const start = Math.max(0, index - size);
    out.unshift(digits.slice(start, index));
    index = start;
    sizeIdx++;
  }
  return out.join(separator);
}

/**
 * Locale-correct fixed-precision rendering. Used as the fallback path and by
 * the decimal-hours duration shape.
 */
export function formatNumberLocale(
  value: number,
  precision: number,
  info: NumberFormattingInfo,
  useCurrencySeparators = false
): string {
  const dec = useCurrencySeparators ? info.currencyDecimalSeparator : info.numberDecimalSeparator;
  const grp = useCurrencySeparators ? info.currencyGroupSeparator : info.numberGroupSeparator;
  const sizes = useCurrencySeparators ? info.currencyGroupSizes : info.numberGroupSizes;

  const negative = value < 0 || Object.is(value, -0);
  const fixed = Math.abs(value).toFixed(precision);
  const [intPart, fracPart] = fixed.split(".");

  let out = applyGrouping(intPart, sizes, grp);
  if (precision > 0 && fracPart !== undefined) out += dec + fracPart;

  return negative ? "-" + out : out;
}

/**
 * Sum an array of values without floating point drift, by working in scaled
 * integer minor units.
 *
 * Summing 0.1 + 0.2 + ... naively across thousands of rows visibly diverges at
 * two decimal places; this keeps it exact up to Number.MAX_SAFE_INTEGER minor
 * units, which is far beyond any realistic Dataverse result set.
 */
export function sumScaled(values: readonly number[], precision: number): number {
  const scale = Math.pow(10, precision);
  let acc = 0;
  for (const v of values) {
    if (v === null || v === undefined || Number.isNaN(v)) continue;
    // Math.round on the scaled value collapses representation error introduced
    // when the platform handed us e.g. 0.1 as 0.1000000000000000055.
    acc += Math.round(v * scale);
  }
  return acc / scale;
}
