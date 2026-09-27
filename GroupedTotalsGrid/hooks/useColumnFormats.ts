/**
 * Builds one ColumnFormat per totalled column.
 *
 * Metadata is fetched once per entity and cached; samples are re-read whenever
 * the loaded rows change, because a filter change can swap the set of
 * currencies or duration magnitudes in view.
 */

import * as React from "react";
import { buildColumnFormat, AttributeFormatMetadata, ResolvedColumnFormat } from "../core/formatters/formatInference";
import { DurationSample } from "../core/formatters/durationFormatter";
import { DEFAULT_NUMBER_FORMATTING_INFO } from "../core/formatters/localeNumber";
import { DurationShape, GridColumn, NumberFormattingInfo } from "../core/types";
import { toNumber } from "../core/aggregation";

type DataSet = ComponentFramework.PropertyTypes.DataSet;
type Context = ComponentFramework.Context<unknown>;

const SAMPLE_LIMIT = 50;

/** Read the user's locale number settings, tolerating hosts that omit them. */
export function readNumberFormattingInfo(context: Context): NumberFormattingInfo {
  const info = (context.userSettings as unknown as { numberFormattingInfo?: Partial<NumberFormattingInfo> })
    .numberFormattingInfo;
  if (!info) return DEFAULT_NUMBER_FORMATTING_INFO;
  return { ...DEFAULT_NUMBER_FORMATTING_INFO, ...info };
}

async function fetchAttributeMetadata(
  context: Context,
  entityName: string,
  logicalNames: string[]
): Promise<Record<string, AttributeFormatMetadata>> {
  const out: Record<string, AttributeFormatMetadata> = {};
  try {
    const metadata = await context.utils.getEntityMetadata(entityName, logicalNames);
    const attributes = (metadata as unknown as {
      Attributes?: { getAll?: () => unknown[] };
    }).Attributes;
    const all = attributes?.getAll?.() ?? [];
    for (const item of all) {
      const a = item as {
        LogicalName?: string;
        Precision?: number;
        PrecisionSource?: number;
        Format?: string;
      };
      if (!a.LogicalName) continue;
      out[a.LogicalName] = {
        logicalName: a.LogicalName,
        precision: a.Precision,
        precisionSource: a.PrecisionSource,
        format: a.Format
      };
    }
  } catch {
    // Metadata is an optimisation, not a dependency: without it we infer
    // precision from the rendered cells instead.
  }
  return out;
}

export function useColumnFormats(
  context: Context,
  dataset: DataSet,
  entityName: string,
  columns: readonly GridColumn[],
  recordIds: readonly string[],
  explicitDurationShape?: DurationShape
): Record<string, ResolvedColumnFormat> {
  const [metadata, setMetadata] = React.useState<Record<string, AttributeFormatMetadata>>({});
  const info = React.useMemo(() => readNumberFormattingInfo(context), [context]);
  const names = React.useMemo(() => columns.map((c) => c.name).sort().join(","), [columns]);

  React.useEffect(() => {
    let live = true;
    if (!entityName || columns.length === 0) return;
    void fetchAttributeMetadata(context, entityName, names.split(",")).then((m) => {
      if (live) setMetadata(m);
    });
    return () => {
      live = false;
    };
  }, [context, entityName, names, columns.length]);

  return React.useMemo(() => {
    const formats: Record<string, ResolvedColumnFormat> = {};
    const sampleIds = recordIds.slice(0, SAMPLE_LIMIT);

    for (const column of columns) {
      const samples: DurationSample[] = [];
      for (const id of sampleIds) {
        const record = dataset.records[id];
        if (!record) continue;
        const raw = toNumber(record.getValue(column.name));
        const formatted = record.getFormattedValue(column.name);
        if (raw !== null && formatted) samples.push({ raw, formatted });
        if (samples.length >= SAMPLE_LIMIT) break;
      }

      formats[column.name] = buildColumnFormat({
        column,
        metadata: metadata[column.name],
        samples,
        numberFormattingInfo: info,
        explicitDurationShape
      });
    }
    return formats;
  }, [columns, dataset, metadata, info, recordIds, explicitDurationShape]);
}
