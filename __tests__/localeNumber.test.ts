import {
  DEFAULT_NUMBER_FORMATTING_INFO,
  formatNumberLocale,
  sumScaled,
  tokeniseNumbers
} from "../GroupedTotalsGrid/core/formatters/localeNumber";
import { NumberFormattingInfo } from "../GroupedTotalsGrid/core/types";

const enUS = DEFAULT_NUMBER_FORMATTING_INFO;

const deDE: NumberFormattingInfo = {
  ...DEFAULT_NUMBER_FORMATTING_INFO,
  numberDecimalSeparator: ",",
  numberGroupSeparator: ".",
  currencyDecimalSeparator: ",",
  currencyGroupSeparator: ".",
  currencySymbol: "€"
};

const frCH: NumberFormattingInfo = {
  ...DEFAULT_NUMBER_FORMATTING_INFO,
  numberDecimalSeparator: ",",
  numberGroupSeparator: "\u00a0", // non-breaking space
  currencyDecimalSeparator: ",",
  currencyGroupSeparator: "\u00a0",
  currencySymbol: "CHF"
};

describe("tokeniseNumbers", () => {
  it("reads a grouped decimal under en-US", () => {
    const t = tokeniseNumbers("1,234.50", enUS);
    expect(t.tokens).toEqual([1234.5]);
    expect(t.precisions).toEqual([2]);
  });

  it("reads a grouped decimal under de-DE without confusing separators", () => {
    const t = tokeniseNumbers("1.234,50 €", deDE);
    expect(t.tokens).toEqual([1234.5]);
    expect(t.precisions).toEqual([2]);
    expect(t.segments[1].trim()).toBe("€");
  });

  it("reads a non-breaking-space group separator", () => {
    const t = tokeniseNumbers("12\u00a0345,67", frCH);
    expect(t.tokens).toEqual([12345.67]);
  });

  it("reads multiple tokens and keeps the surrounding text", () => {
    const t = tokeniseNumbers("1 hour 30 minutes", enUS);
    expect(t.tokens).toEqual([1, 30]);
    expect(t.segments).toEqual(["", " hour ", " minutes"]);
  });

  it("handles negatives", () => {
    const t = tokeniseNumbers("-1,234.50", enUS);
    expect(t.tokens).toEqual([-1234.5]);
  });

  it("returns no tokens for text without numbers", () => {
    expect(tokeniseNumbers("(No value)", enUS).tokens).toEqual([]);
  });
});

describe("formatNumberLocale", () => {
  it("groups and fixes precision under en-US", () => {
    expect(formatNumberLocale(1234.5, 2, enUS)).toBe("1,234.50");
  });

  it("groups and fixes precision under de-DE", () => {
    expect(formatNumberLocale(1234.5, 2, deDE)).toBe("1.234,50");
  });

  it("handles millions", () => {
    expect(formatNumberLocale(1234567.891, 2, enUS)).toBe("1,234,567.89");
  });

  it("renders zero precision without a separator", () => {
    expect(formatNumberLocale(2265, 0, enUS)).toBe("2,265");
  });

  it("keeps the sign on negatives", () => {
    expect(formatNumberLocale(-42.5, 2, enUS)).toBe("-42.50");
  });

  it("round-trips through tokenise", () => {
    const rendered = formatNumberLocale(9876543.21, 2, deDE);
    expect(tokeniseNumbers(rendered, deDE).tokens).toEqual([9876543.21]);
  });
});

describe("sumScaled", () => {
  it("does not drift on the classic 0.1 + 0.2 case", () => {
    expect(sumScaled([0.1, 0.2], 2)).toBe(0.3);
  });

  it("stays exact across 10,000 two-decimal values", () => {
    const values = new Array(10000).fill(0.01);
    expect(sumScaled(values, 2)).toBe(100);
  });

  it("stays exact across a large mixed set", () => {
    const values: number[] = [];
    for (let i = 0; i < 10000; i++) values.push(i % 2 === 0 ? 1.15 : -0.15);
    // 5000 * 1.15 - 5000 * 0.15 = 5750 - 750
    expect(sumScaled(values, 2)).toBe(5000);
  });

  it("skips nulls and NaN rather than poisoning the sum", () => {
    const values = [1.5, NaN, 2.5, (null as unknown) as number, undefined as unknown as number];
    expect(sumScaled(values, 2)).toBe(4);
  });

  it("returns 0 for an empty set", () => {
    expect(sumScaled([], 2)).toBe(0);
  });
});
