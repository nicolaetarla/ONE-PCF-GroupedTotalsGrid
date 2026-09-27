/**
 * The parity gate (build prompt SS6.7).
 *
 * The trick: a total over exactly ONE record is just that record's value. So if
 * our formatter and the platform's cell rendering agree, formatTotal(value)
 * must equal that record's getFormattedValue() character for character. Any
 * drift in precision, separators, symbol placement or duration shape shows up
 * here immediately.
 *
 * The "platform" below is a stand-in that renders the way the real platform
 * does for the locales under test. In CI against a real environment, replace it
 * with values captured from getFormattedValue() on a seeded record set - the
 * assertions do not change.
 */

import { buildColumnFormat } from "../GroupedTotalsGrid/core/formatters/formatInference";
import {
  DEFAULT_NUMBER_FORMATTING_INFO,
  formatNumberLocale
} from "../GroupedTotalsGrid/core/formatters/localeNumber";
import {
  formatTotal,
  PlatformFormatters
} from "../GroupedTotalsGrid/core/formatters/totalFormatter";
import { DurationWords } from "../GroupedTotalsGrid/core/formatters/durationFormatter";
import { GridColumn, NumberFormattingInfo } from "../GroupedTotalsGrid/core/types";

const enUS = DEFAULT_NUMBER_FORMATTING_INFO;
const deDE: NumberFormattingInfo = {
  ...DEFAULT_NUMBER_FORMATTING_INFO,
  numberDecimalSeparator: ",",
  numberGroupSeparator: ".",
  currencyDecimalSeparator: ",",
  currencyGroupSeparator: ".",
  currencySymbol: "€"
};

const words: DurationWords = {
  hourSingular: "hour",
  hourPlural: "hours",
  minuteSingular: "minute",
  minutePlural: "minutes",
  partSeparator: " "
};

/** Stands in for context.formatting. */
function platformFor(info: NumberFormattingInfo, symbolSuffix = false): PlatformFormatters {
  return {
    formatCurrency: (v, p, s) =>
      symbolSuffix
        ? `${formatNumberLocale(v, p, info, true)}\u00a0${s}`
        : `${s}${formatNumberLocale(v, p, info, true)}`,
    formatDecimal: (v, p) => formatNumberLocale(v, p, info),
    formatInteger: (v) => formatNumberLocale(v, 0, info)
  };
}

function column(name: string, dataType: string): GridColumn {
  return {
    name,
    displayName: name,
    dataType,
    order: 0,
    visualSizeFactor: 100,
    isPrimary: false
  };
}

describe("single-record parity: our total equals the platform's cell", () => {
  const cases: Array<{
    label: string;
    dataType: string;
    metadata?: { precision?: number; format?: string; precisionSource?: number };
    raw: number;
    info: NumberFormattingInfo;
    symbolSuffix?: boolean;
  }> = [
    { label: "decimal, 2dp, en-US", dataType: "Decimal", metadata: { precision: 2 }, raw: 1234.5, info: enUS },
    { label: "decimal, 2dp, de-DE", dataType: "Decimal", metadata: { precision: 2 }, raw: 1234.5, info: deDE },
    { label: "decimal, 4dp", dataType: "Decimal", metadata: { precision: 4 }, raw: 0.1234, info: enUS },
    { label: "decimal, 0dp", dataType: "Decimal", metadata: { precision: 0 }, raw: 42, info: enUS },
    { label: "float", dataType: "FP", metadata: { precision: 2 }, raw: 3.14, info: enUS },
    { label: "whole number", dataType: "Whole.None", metadata: { format: "None" }, raw: 1234, info: enUS },
    { label: "currency prefix symbol", dataType: "Currency", metadata: { precision: 2 }, raw: 1999.99, info: enUS },
    {
      label: "currency suffix symbol, de-DE",
      dataType: "Currency",
      metadata: { precision: 2 },
      raw: 1999.99,
      info: deDE,
      symbolSuffix: true
    },
    { label: "currency 0dp", dataType: "Currency", metadata: { precision: 0 }, raw: 250, info: enUS },
    { label: "negative decimal", dataType: "Decimal", metadata: { precision: 2 }, raw: -87.25, info: enUS }
  ];

  test.each(cases)("$label", ({ dataType, metadata, raw, info, symbolSuffix }) => {
    const platform = platformFor(info, symbolSuffix);

    // What the platform would render for this single cell.
    const isCurrency = dataType === "Currency";
    const precision = metadata?.precision ?? 0;
    const cellFormatted = isCurrency
      ? platform.formatCurrency(raw, precision, info.currencySymbol)
      : dataType === "Whole.None"
      ? platform.formatInteger(raw)
      : platform.formatDecimal(raw, precision);

    const format = buildColumnFormat({
      column: column("col", dataType),
      metadata: { logicalName: "col", ...metadata },
      samples: [{ raw, formatted: cellFormatted }],
      numberFormattingInfo: info,
      currencySymbol: isCurrency ? info.currencySymbol : undefined
    });

    const total = formatTotal(raw, { format, info, words, platform });
    expect(total).toBe(cellFormatted);
  });

  it("duration: a one-record total matches the cell exactly", () => {
    const cellFormatted = "1 hour 30 minutes";
    const format = buildColumnFormat({
      column: column("msdyn_duration", "Whole.Duration"),
      metadata: { logicalName: "msdyn_duration", format: "Duration" },
      samples: [
        { raw: 90, formatted: cellFormatted },
        { raw: 135, formatted: "2 hours 15 minutes" }
      ],
      numberFormattingInfo: enUS
    });
    expect(formatTotal(90, { format, info: enUS, words })).toBe(cellFormatted);
  });

  it("duration in colon shape: a one-record total matches the cell exactly", () => {
    const format = buildColumnFormat({
      column: column("msdyn_duration", "Whole.Duration"),
      metadata: { logicalName: "msdyn_duration", format: "Duration" },
      samples: [{ raw: 90, formatted: "1:30" }],
      numberFormattingInfo: enUS
    });
    expect(formatTotal(90, { format, info: enUS, words })).toBe("1:30");
  });
});

describe("format inference", () => {
  it("prefers the rendered precision over metadata when they disagree", () => {
    const format = buildColumnFormat({
      column: column("amount", "Decimal"),
      metadata: { logicalName: "amount", precision: 2 },
      samples: [{ raw: 1.5, formatted: "1.500" }],
      numberFormattingInfo: enUS
    });
    expect(format.precision).toBe(3);
    expect(format.inferred).toBe(true);
  });

  it("does not flag inference when metadata and rendering agree", () => {
    const format = buildColumnFormat({
      column: column("amount", "Decimal"),
      metadata: { logicalName: "amount", precision: 2 },
      samples: [{ raw: 1.5, formatted: "1.50" }],
      numberFormattingInfo: enUS
    });
    expect(format.inferred).toBe(false);
  });

  it("resolves money precision from the organisation pricing precision", () => {
    const format = buildColumnFormat({
      column: column("amount", "Currency"),
      metadata: { logicalName: "amount", precision: 2, precisionSource: 1 },
      samples: [],
      numberFormattingInfo: enUS,
      organizationPricingPrecision: 4
    });
    expect(format.precision).toBe(4);
  });

  it("resolves money precision from the transaction currency", () => {
    const format = buildColumnFormat({
      column: column("amount", "Currency"),
      metadata: { logicalName: "amount", precision: 2, precisionSource: 2 },
      samples: [],
      numberFormattingInfo: enUS,
      currencyPrecision: 0
    });
    expect(format.precision).toBe(0);
  });

  it("recovers a suffix currency symbol from rendered cells", () => {
    const format = buildColumnFormat({
      column: column("amount", "Currency"),
      metadata: { logicalName: "amount", precision: 2 },
      samples: [{ raw: 1234.5, formatted: "1.234,50 €" }],
      numberFormattingInfo: deDE
    });
    expect(format.currencySymbol).toBe("€");
  });

  it("recovers an ISO-code currency display", () => {
    const format = buildColumnFormat({
      column: column("amount", "Currency"),
      metadata: { logicalName: "amount", precision: 2 },
      samples: [{ raw: 1234.5, formatted: "1,234.50 USD" }],
      numberFormattingInfo: enUS
    });
    expect(format.currencySymbol).toBe("USD");
  });

  it("classifies a Whole.None column formatted as Duration as a duration", () => {
    const format = buildColumnFormat({
      column: column("legacy_duration", "Whole.None"),
      metadata: { logicalName: "legacy_duration", format: "Duration" },
      samples: [{ raw: 90, formatted: "1 hour 30 minutes" }],
      numberFormattingInfo: enUS
    });
    expect(format.kind).toBe("duration");
  });
});

describe("formatTotal edge cases", () => {
  const format = buildColumnFormat({
    column: column("amount", "Decimal"),
    metadata: { logicalName: "amount", precision: 2 },
    samples: [{ raw: 1, formatted: "1.00" }],
    numberFormattingInfo: enUS
  });

  it("renders null as blank, matching the modern grid's empty cell", () => {
    expect(formatTotal(null, { format, info: enUS, words })).toBe("");
  });

  it("renders zero as zero, not blank", () => {
    expect(formatTotal(0, { format, info: enUS, words })).toBe("0.00");
  });

  it("falls back to locale rendering when the platform formatter throws", () => {
    const throwing: PlatformFormatters = {
      formatCurrency: () => {
        throw new Error("boom");
      },
      formatDecimal: () => {
        throw new Error("boom");
      },
      formatInteger: () => {
        throw new Error("boom");
      }
    };
    expect(formatTotal(1234.5, { format, info: enUS, words, platform: throwing })).toBe("1,234.50");
  });
});
