import {
  DurationSample,
  DurationWords,
  formatDurationTotal,
  inferDurationFormat
} from "../GroupedTotalsGrid/core/formatters/durationFormatter";
import { DEFAULT_NUMBER_FORMATTING_INFO } from "../GroupedTotalsGrid/core/formatters/localeNumber";
import { NumberFormattingInfo } from "../GroupedTotalsGrid/core/types";

const info = DEFAULT_NUMBER_FORMATTING_INFO;

const words: DurationWords = {
  hourSingular: "hour",
  hourPlural: "hours",
  minuteSingular: "minute",
  minutePlural: "minutes",
  partSeparator: " "
};

const deInfo: NumberFormattingInfo = {
  ...DEFAULT_NUMBER_FORMATTING_INFO,
  numberDecimalSeparator: ",",
  numberGroupSeparator: "."
};

describe("inferDurationFormat", () => {
  it("detects hours-and-minutes from real platform output", () => {
    const samples: DurationSample[] = [
      { raw: 90, formatted: "1 hour 30 minutes" },
      { raw: 135, formatted: "2 hours 15 minutes" }
    ];
    expect(inferDurationFormat(samples, info).shape).toBe("HoursAndMinutes");
  });

  it("detects the colon shape", () => {
    const samples: DurationSample[] = [
      { raw: 90, formatted: "1:30" },
      { raw: 480, formatted: "8:00" }
    ];
    expect(inferDurationFormat(samples, info).shape).toBe("HoursColonMinutes");
  });

  it("detects decimal hours and captures the precision used", () => {
    const samples: DurationSample[] = [
      { raw: 90, formatted: "1.50 hours" },
      { raw: 135, formatted: "2.25 hours" }
    ];
    const f = inferDurationFormat(samples, info);
    expect(f.shape).toBe("DecimalHours");
    expect(f.decimalHoursPrecision).toBe(2);
  });

  it("detects a minutes-only column", () => {
    const samples: DurationSample[] = [
      { raw: 15, formatted: "15 minutes" },
      { raw: 45, formatted: "45 minutes" }
    ];
    // Sub-hour samples are ambiguous by construction, so this asserts we at
    // least never pick a shape that would render them wrongly.
    expect(["Minutes", "HoursAndMinutes"]).toContain(inferDurationFormat(samples, info).shape);
  });

  it("works in a language it has never seen, because it matches structure not words", () => {
    const samples: DurationSample[] = [
      { raw: 90, formatted: "1 Stunde 30 Minuten" },
      { raw: 135, formatted: "2 Stunden 15 Minuten" }
    ];
    const f = inferDurationFormat(samples, deInfo);
    expect(f.shape).toBe("HoursAndMinutes");
    // and it reuses the platform's own words when rendering the total
    expect(formatDurationTotal(225, f, words, deInfo)).toBe("3 Stunden 45 Minuten");
  });

  it("flags fallback when there is nothing usable to sample", () => {
    expect(inferDurationFormat([], info).usingFallbackWords).toBe(true);
  });

  it("honours an explicit override over inference", () => {
    const samples: DurationSample[] = [{ raw: 90, formatted: "1 hour 30 minutes" }];
    expect(inferDurationFormat(samples, info, "Minutes").shape).toBe("Minutes");
    expect(inferDurationFormat(samples, info, "Minutes").inferred).toBe(false);
  });
});

describe("formatDurationTotal", () => {
  const hm = inferDurationFormat(
    [
      { raw: 90, formatted: "1 hour 30 minutes" },
      { raw: 135, formatted: "2 hours 15 minutes" }
    ],
    info
  );

  it("totals hours and minutes in the platform's own wording", () => {
    // 2265 minutes = 37h45
    expect(formatDurationTotal(2265, hm, words, info)).toBe("37 hours 45 minutes");
  });

  it("uses the singular template when the platform showed one", () => {
    const f = inferDurationFormat(
      [
        { raw: 90, formatted: "1 hour 30 minutes" },
        { raw: 61, formatted: "1 hour 1 minute" }
      ],
      info
    );
    expect(formatDurationTotal(61, f, words, info)).toBe("1 hour 1 minute");
  });

  it("does not roll hours over into days", () => {
    // 12000 minutes = 200h exactly
    const out = formatDurationTotal(12000, hm, words, info);
    expect(out).toContain("200");
    expect(out).not.toMatch(/day/i);
  });

  it("renders the colon shape zero-padded", () => {
    const f = inferDurationFormat([{ raw: 90, formatted: "1:30" }], info);
    expect(formatDurationTotal(2265, f, words, info)).toBe("37:45");
    expect(formatDurationTotal(485, f, words, info)).toBe("8:05");
  });

  it("renders decimal hours at the sampled precision", () => {
    const f = inferDurationFormat(
      [
        { raw: 90, formatted: "1.50 hours" },
        { raw: 135, formatted: "2.25 hours" }
      ],
      info
    );
    expect(formatDurationTotal(2265, f, words, info)).toBe("37.75 hours");
  });

  it("falls back to resx words when nothing was sampled", () => {
    const f = inferDurationFormat([], info);
    expect(formatDurationTotal(2265, f, words, info)).toBe("37 hours 45 minutes");
  });

  it("handles zero", () => {
    const f = inferDurationFormat([], info);
    expect(formatDurationTotal(0, f, words, info)).toBe("0 minutes");
  });

  it("handles negatives", () => {
    const f = inferDurationFormat([{ raw: 90, formatted: "1:30" }], info);
    expect(formatDurationTotal(-90, f, words, info)).toBe("-1:30");
  });
});
