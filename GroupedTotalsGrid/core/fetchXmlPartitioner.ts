/**
 * Working around the aggregate record limit.
 *
 * Dataverse refuses an aggregate query that would scan beyond a fixed ceiling
 * (historically 50,000 rows) and returns error 0x8004E023. Since sum and count
 * compose across disjoint partitions, we can split the query, run the parts,
 * and add the results back together.
 *
 * We detect the failure by error code, never by message text - messages are
 * localised, so string matching breaks the moment someone runs the app in
 * French.
 */

export const AGGREGATE_LIMIT_ERROR_CODES: ReadonlySet<string> = new Set([
  "0x8004e023", // AggregateQueryRecordLimitExceeded
  "-2147164125"
]);

/** Best-effort extraction of a Dataverse error code from a thrown value. */
export function extractErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as { errorCode?: number | string; code?: number | string; raw?: string };
  const candidate = e.errorCode ?? e.code;
  if (candidate === undefined || candidate === null) return undefined;
  if (typeof candidate === "number") {
    // Normalise to lower-case hex, which is how the platform documents it.
    const hex = candidate < 0 ? (candidate >>> 0).toString(16) : candidate.toString(16);
    return `0x${hex}`;
  }
  return String(candidate).toLowerCase();
}

export function isAggregateLimitError(error: unknown): boolean {
  const code = extractErrorCode(error);
  if (!code) return false;
  return AGGREGATE_LIMIT_ERROR_CODES.has(code) || AGGREGATE_LIMIT_ERROR_CODES.has(code.toLowerCase());
}

export interface DateRange {
  from: Date;
  to: Date;
}

export interface PartitionSpec {
  /** Attribute the partition condition applies to. */
  attribute: string;
  from: Date;
  to: Date;
}

/**
 * Split a date range into N partitions.
 *
 * A date column is the natural partition key because these views are almost
 * always time-bounded already, and dates distribute reasonably evenly. The
 * caller picks the column - usually whichever date attribute already appears
 * in the view's filter.
 */
export function partitionByDate(attribute: string, range: DateRange, parts: number): PartitionSpec[] {
  const count = Math.max(1, Math.floor(parts));
  const start = range.from.getTime();
  const end = range.to.getTime();
  if (!(end > start)) return [{ attribute, from: range.from, to: range.to }];

  const step = (end - start) / count;
  const specs: PartitionSpec[] = [];
  for (let i = 0; i < count; i++) {
    specs.push({
      attribute,
      from: new Date(start + step * i),
      to: new Date(i === count - 1 ? end : start + step * (i + 1))
    });
  }
  return specs;
}

/** FetchXML <filter> restricting a query to one partition. */
export function partitionFilterXml(spec: PartitionSpec): string {
  const iso = (d: Date): string => d.toISOString();
  return (
    `<filter type="and">` +
    `<condition attribute="${spec.attribute}" operator="on-or-after" value="${iso(spec.from)}" />` +
    `<condition attribute="${spec.attribute}" operator="on-or-before" value="${iso(spec.to)}" />` +
    `</filter>`
  );
}

/**
 * Run partitions with bounded concurrency.
 *
 * Unbounded parallelism here is a good way to get throttled by the platform,
 * which turns a slow grid into a broken one.
 */
export async function runWithConcurrency<TIn, TOut>(
  items: readonly TIn[],
  limit: number,
  worker: (item: TIn, index: number) => Promise<TOut>
): Promise<TOut[]> {
  const results: TOut[] = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

/**
 * Escalating retry: 2 partitions, then 4, then 8, up to maxSplits.
 *
 * Doubling rather than jumping straight to a large split keeps the common case
 * (just over the limit) cheap.
 */
export async function withPartitionRetry<T>(
  attempt: (partitions: number) => Promise<T>,
  maxSplits = 16
): Promise<T> {
  let partitions = 1;
  for (;;) {
    try {
      return await attempt(partitions);
    } catch (error) {
      if (!isAggregateLimitError(error) || partitions >= maxSplits) throw error;
      partitions = partitions === 1 ? 2 : partitions * 2;
    }
  }
}
