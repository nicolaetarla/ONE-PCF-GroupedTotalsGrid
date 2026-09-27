/**
 * Duration totals.
 *
 * Dataverse stores Whole.Duration attributes as a whole number of MINUTES, and
 * PCF exposes no duration formatter, so this is the one numeric type we render
 * ourselves. That makes it the highest-risk part of the parity requirement.
 *
 * Strategy: never guess at unit words. Instead, look at how the platform
 * actually rendered the cells in this column (getFormattedValue), work out
 * structurally which shape it used by testing candidate shapes against the raw
 * minute values we already have, and then reuse the platform's own surrounding
 * text when rendering the total. That is locale-agnostic - it works for
 * "1 hour 30 minutes", "1 Stunde 30 Minuten" and "1:30" without knowing a word
 * of the language.
 *
 * The resx words are only a last-resort fallback, and we flag it in debug logs
 * when we fall back, because that is the case most likely to look wrong.
 */

import { DurationShape, NumberFormattingInfo } from "../types";
import { formatNumberLocale, tokeniseNumbers } from "./localeNumber";

/** A sampled cell: the raw stored value and how the platform rendered it. */
export interface DurationSample {
  /** Stored value, in minutes. */
  raw: number;
  formatted: string;
}

/**
 * Reusable text captured from real platform output.
 *
 * A template is literally "the bits that were not numbers", so rendering is
 * segments[0] + n0 + segments[1] + n1 + segments[2].
 */
export interface DurationTemplate {
  segments: string[];
  /** Decimal places the platform used on the numeric token(s). */
  precisions: number[];
}

export interface DurationLexicon {
  /** Keyed by "<hoursPlural>|<minutesPlural>" e.g. "true|false". */
  hourMinute: Record<string, DurationTemplate>;
  /** Hours with zero minutes, e.g. "2 hours". Keyed by plural flag. */
  hoursOnly: Record<string, DurationTemplate>;
  /** Minutes with zero hours, e.g. "45 minutes". Keyed by plural flag. */
  minutesOnly: Record<string, DurationTemplate>;
  /** Decimal-hours template, e.g. "1.5 hours". Keyed by plural flag. */
  decimalHours: Record<string, DurationTemplate>;
}

export interface DurationFormat {
  shape: DurationShape;
  lexicon: DurationLexicon;
  /** Decimal places to use for the DecimalHours shape. */
  decimalHoursPrecision: number;
  /** True when the shape came from inference rather than explicit config. */
  inferred: boolean;
  /** True when no usable sample was found and resx words will be used. */
  usingFallbackWords: boolean;
}

/** Unit words from resx, used only when sampling produced nothing usable. */
export interface DurationWords {
  hourSingular: string;
  hourPlural: string;
  minuteSingular: string;
  minutePlural: string;
  /** Text between the hours part and the minutes part. */
  partSeparator: string;
}

export const EMPTY_LEXICON = (): DurationLexicon => ({
  hourMinute: {},
  hoursOnly: {},
  minutesOnly: {},
  decimalHours: {}
});

const pluralKey = (n: number): string => (Math.abs(n) === 1 ? "one" : "other");

/* ------------------------------------------------------------------ *
 * Inference
 * ------------------------------------------------------------------ */

const COLON_SHAPE = /-?\d+:\d{2}/;

/**
 * Work out which shape the platform used, structurally.
 *
 * For each sample we know `raw` in minutes, so we can test each candidate:
 *   HoursAndMinutes  -> tokens are [floor(raw/60), raw%60]
 *   HoursOnly        -> single token == raw/60 exactly, raw%60 === 0
 *   DecimalHours     -> single token == raw/60 with fractional part
 *   Minutes          -> single token == raw
 * Whichever candidate is consistent with the most samples wins. Ambiguous
 * samples (e.g. raw=60 rendered "1") vote for several candidates and are
 * broken by the preference order below.
 */
export function inferDurationFormat(
  samples: readonly DurationSample[],
  info: NumberFormattingInfo,
  explicit?: DurationShape
): DurationFormat {
  const lexicon = EMPTY_LEXICON();
  const votes: Record<DurationShape, number> = {
    HoursAndMinutes: 0,
    HoursColonMinutes: 0,
    DecimalHours: 0,
    Minutes: 0
  };
  let decimalHoursPrecision = 2;
  let sawUsableSample = false;

  for (const sample of samples) {
    if (!sample || typeof sample.raw !== "number" || !sample.formatted) continue;
    const raw = Math.round(sample.raw);
    const text = sample.formatted;

    if (COLON_SHAPE.test(text)) {
      votes.HoursColonMinutes += 2;
      sawUsableSample = true;
      continue;
    }

    const t = tokeniseNumbers(text, info);
    if (t.tokens.length === 0) continue;

    const hours = Math.trunc(raw / 60);
    const minutes = Math.abs(raw % 60);

    if (t.tokens.length >= 2) {
      if (t.tokens[0] === hours && t.tokens[1] === minutes) {
        votes.HoursAndMinutes += 2;
        sawUsableSample = true;
        lexicon.hourMinute[`${pluralKey(hours)}|${pluralKey(minutes)}`] = {
          segments: t.segments,
          precisions: t.precisions
        };
      }
      continue;
    }

    // Single token - could be hours-only, decimal hours, or minutes.
    const only = t.tokens[0];
    const template: DurationTemplate = { segments: t.segments, precisions: t.precisions };

    if (minutes === 0 && only === hours && raw !== 0) {
      votes.HoursAndMinutes += 1;
      sawUsableSample = true;
      lexicon.hoursOnly[pluralKey(hours)] = template;
    }
    if (hours === 0 && only === raw && raw !== 0) {
      votes.Minutes += 1;
      // A "45 minutes" sample is equally consistent with HoursAndMinutes
      // collapsing the zero hours part, so it votes for both.
      votes.HoursAndMinutes += 1;
      sawUsableSample = true;
      lexicon.minutesOnly[pluralKey(raw)] = template;
    }
    if (t.precisions[0] > 0 && Math.abs(only - raw / 60) < 1e-9) {
      votes.DecimalHours += 2;
      decimalHoursPrecision = t.precisions[0];
      sawUsableSample = true;
      lexicon.decimalHours[pluralKey(only)] = template;
    }
  }

  // Preference order breaks ties: the richest shape wins, because a format that
  // can express "1 hour 30 minutes" degrading to "90 minutes" is a visible
  // regression, whereas the reverse is not possible.
  const order: DurationShape[] = ["HoursColonMinutes", "HoursAndMinutes", "DecimalHours", "Minutes"];
  let best: DurationShape = "HoursAndMinutes";
  let bestScore = -1;
  for (const shape of order) {
    if (votes[shape] > bestScore) {
      bestScore = votes[shape];
      best = shape;
    }
  }

  const shape = explicit ?? (bestScore > 0 ? best : "HoursAndMinutes");

  return {
    shape,
    lexicon,
    decimalHoursPrecision,
    inferred: !explicit,
    usingFallbackWords: !sawUsableSample && shape !== "HoursColonMinutes"
  };
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

function renderTemplate(template: DurationTemplate, values: number[], info: NumberFormattingInfo): string {
  let out = template.segments[0] ?? "";
  for (let i = 0; i < values.length; i++) {
    const precision = template.precisions[i] ?? 0;
    out += formatNumberLocale(values[i], precision, info);
    out += template.segments[i + 1] ?? "";
  }
  return out;
}

/** Pick the closest available template, preferring an exact plural match. */
function pickTemplate(
  bucket: Record<string, DurationTemplate>,
  key: string
): DurationTemplate | undefined {
  return bucket[key] ?? bucket["other"] ?? bucket["one"] ?? Object.values(bucket)[0];
}

/**
 * Render a total, in minutes, in the resolved shape.
 *
 * Hours deliberately do not roll over into days: a 200 hour total renders as
 * 200 hours, because the platform's own cell rendering does not roll over
 * either and the totals must match the column above them.
 */
export function formatDurationTotal(
  totalMinutes: number,
  format: DurationFormat,
  words: DurationWords,
  info: NumberFormattingInfo
): string {
  const negative = totalMinutes < 0;
  const abs = Math.abs(Math.round(totalMinutes));
  const hours = Math.trunc(abs / 60);
  const minutes = abs % 60;
  const sign = negative ? "-" : "";

  switch (format.shape) {
    case "HoursColonMinutes":
      return `${sign}${hours}:${String(minutes).padStart(2, "0")}`;

    case "Minutes": {
      const t = pickTemplate(format.lexicon.minutesOnly, pluralKey(abs));
      if (t) return sign + renderTemplate(t, [abs], info);
      const word = Math.abs(abs) === 1 ? words.minuteSingular : words.minutePlural;
      return `${sign}${formatNumberLocale(abs, 0, info)} ${word}`;
    }

    case "DecimalHours": {
      const decimal = abs / 60;
      const t = pickTemplate(format.lexicon.decimalHours, pluralKey(decimal));
      if (t) return sign + renderTemplate(t, [decimal], info);
      const word = Math.abs(decimal) === 1 ? words.hourSingular : words.hourPlural;
      return `${sign}${formatNumberLocale(decimal, format.decimalHoursPrecision, info)} ${word}`;
    }

    case "HoursAndMinutes":
    default: {
      // Match the platform's collapsing behaviour: a whole number of hours
      // renders without a minutes part, and under an hour renders without an
      // hours part - but only if we have a sampled template proving the
      // platform does that. Otherwise render both parts.
      if (minutes === 0 && hours !== 0) {
        const t = pickTemplate(format.lexicon.hoursOnly, pluralKey(hours));
        if (t) return sign + renderTemplate(t, [hours], info);
      }
      if (hours === 0) {
        const t = pickTemplate(format.lexicon.minutesOnly, pluralKey(minutes));
        if (t) return sign + renderTemplate(t, [minutes], info);
      }
      const both = pickTemplate(format.lexicon.hourMinute, `${pluralKey(hours)}|${pluralKey(minutes)}`);
      if (both) return sign + renderTemplate(both, [hours, minutes], info);

      const hWord = hours === 1 ? words.hourSingular : words.hourPlural;
      const mWord = minutes === 1 ? words.minuteSingular : words.minutePlural;
      if (minutes === 0 && hours !== 0) {
        return `${sign}${formatNumberLocale(hours, 0, info)} ${hWord}`;
      }
      if (hours === 0) {
        return `${sign}${formatNumberLocale(minutes, 0, info)} ${mWord}`;
      }
      return (
        `${sign}${formatNumberLocale(hours, 0, info)} ${hWord}` +
        `${words.partSeparator}${formatNumberLocale(minutes, 0, info)} ${mWord}`
      );
    }
  }
}
