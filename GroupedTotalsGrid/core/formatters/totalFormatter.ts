/**
 * The single entry point for turning a summed number into display text.
 *
 * Rule: the platform formatter renders it wherever one exists, so the output is
 * byte-identical to the cells above. We only render it ourselves for duration,
 * which has no platform formatter.
 */

import { NumberFormattingInfo } from "../types";
import { DurationWords, formatDurationTotal } from "./durationFormatter";
import { formatNumberLocale } from "./localeNumber";
import { ResolvedColumnFormat } from "./formatInference";

/**
 * The slice of context.formatting we depend on. Injected rather than imported
 * so core/ stays testable without a ComponentFramework context.
 *
 * Signatures per the PCF Formatting API reference:
 *   formatCurrency(value, precision, symbol)
 *   formatDecimal(value, precision)
 *   formatInteger(value)
 */
export interface PlatformFormatters {
  formatCurrency(value: number, precision: number, symbol: string): string;
  formatDecimal(value: number, precision: number): string;
  formatInteger(value: number): string;
}

export interface FormatTotalOptions {
  format: ResolvedColumnFormat;
  info: NumberFormattingInfo;
  words: DurationWords;
  /** Omit to force the locale fallback path (unit tests, harness). */
  platform?: PlatformFormatters;
}

/**
 * Format a total. `null` means the column had no numeric values to sum, which
 * is rendered as blank - matching the modern grid, which leaves empty cells
 * blank rather than showing "---".
 */
export function formatTotal(value: number | null, options: FormatTotalOptions): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";

  const { format, info, words, platform } = options;

  switch (format.kind) {
    case "duration": {
      if (!format.duration) return formatNumberLocale(value, 0, info);
      return formatDurationTotal(value, format.duration, words, info);
    }

    case "currency": {
      const symbol = format.currencySymbol ?? info.currencySymbol;
      if (platform) {
        try {
          return platform.formatCurrency(value, format.precision, symbol);
        } catch {
          /* fall through to locale rendering */
        }
      }
      return formatNumberLocale(value, format.precision, info, true) + "\u00a0" + symbol;
    }

    case "integer": {
      if (platform) {
        try {
          return platform.formatInteger(value);
        } catch {
          /* fall through */
        }
      }
      return formatNumberLocale(value, 0, info);
    }

    case "decimal":
    default: {
      if (platform) {
        try {
          return platform.formatDecimal(value, format.precision);
        } catch {
          /* fall through */
        }
      }
      return formatNumberLocale(value, format.precision, info);
    }
  }
}
