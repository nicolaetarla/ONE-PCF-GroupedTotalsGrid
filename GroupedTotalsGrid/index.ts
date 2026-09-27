/**
 * PCF lifecycle. Deliberately thin: read properties, resolve a couple of pieces
 * of metadata the dataset does not expose, hand everything to React.
 */

import * as React from "react";
import { IInputs, IOutputs } from "./generated/ManifestTypes";
// Aliased: the exported control class below must be named GroupedTotalsGrid to
// match the manifest's constructor attribute, so the React component takes a
// different local name.
import { GroupedTotalsGrid as GroupedTotalsGridView, GridStrings } from "./components/GroupedTotalsGrid";
import { DurationShape } from "./core/types";

type Ctx = ComponentFramework.Context<IInputs>;

const yes = (v: string | undefined, fallback = false): boolean =>
  v === undefined || v === null || v === "" ? fallback : v === "yes";

export class GroupedTotalsGrid implements ComponentFramework.ReactControl<IInputs, IOutputs> {
  private notifyOutputChanged!: () => void;
  private entityName = "";
  private primaryIdAttribute = "";
  private width = 0;

  public init(
    context: Ctx,
    notifyOutputChanged: () => void,
    _state: ComponentFramework.Dictionary
  ): void {
    this.notifyOutputChanged = notifyOutputChanged;
    // Container resize drives column widths; without this the grid only
    // recalculates on data change and columns drift out of alignment.
    context.mode.trackContainerResize(true);
  }

  public updateView(context: Ctx): React.ReactElement {
    this.width = context.mode.allocatedWidth > 0 ? context.mode.allocatedWidth : this.width;

    const dataset = context.parameters.records;
    this.entityName = dataset.getTargetEntityType?.() ?? this.entityName;
    this.primaryIdAttribute = this.primaryIdAttribute || `${this.entityName}id`;

    const p = context.parameters;
    const durationDisplay = p.durationDisplay?.raw;

    return React.createElement(GroupedTotalsGridView, {
      context: context as unknown as ComponentFramework.Context<unknown>,
      dataset,
      entityName: this.entityName,
      primaryIdAttribute: this.primaryIdAttribute,
      theme: (context as unknown as { fluentDesignLanguage?: { tokenTheme?: never } })
        .fluentDesignLanguage?.tokenTheme,
      strings: this.buildStrings(context),

      groupByColumn: p.groupByColumn?.raw || undefined,
      allowRuntimeGroupChange: yes(p.allowRuntimeGroupChange?.raw ?? undefined, true),
      aggregateColumns: String(p.aggregateColumns?.raw ?? "")
        .split(",")
        .map((name: string) => name.trim())
        .filter((name: string) => name.length > 0),
      showGrandTotal: yes(p.showGrandTotal?.raw ?? undefined, true),
      groupsInitiallyCollapsed: yes(p.groupsInitiallyCollapsed?.raw ?? undefined, true),
      showRecordCounts: yes(p.showRecordCounts?.raw ?? undefined, true),
      durationDisplay:
        durationDisplay && durationDisplay !== "Auto" ? (durationDisplay as DurationShape) : undefined,
      totalsMode: (p.totalsMode?.raw as "Auto" | "ServerAggregate" | "ClientOnly") ?? "Auto",
      maxClientRows: p.maxClientRows?.raw ?? 5000,
      navigationTypesAllowed: (p.navigationTypesAllowed?.raw as "All" | "PrimaryOnly" | "None") ?? "All",
      enableOptionSetColors: yes(p.enableOptionSetColors?.raw ?? undefined, false),
      rowDensity: (p.rowDensity?.raw as "Platform" | "Comfortable" | "Compact") ?? "Platform",
      debug: yes(p.enableDebugLogging?.raw ?? undefined, false),
      width: this.width,

      onOpenRecord: (recordId: string) => {
        const record = dataset.records[recordId];
        const reference = record?.getNamedReference();
        if (!reference) return;
        void context.navigation.openForm({
          entityName: this.entityName,
          entityId: String(reference.id?.guid ?? reference.id)
        });
      },
      onOpenLookup: (entityName: string, id: string) => {
        void context.navigation.openForm({ entityName, entityId: id });
      },
      onSelectionChange: (recordIds: string[]) => {
        // Drives the standard command bar. Without this the ribbon stays
        // disabled and the grid feels broken even though it looks right.
        dataset.setSelectedRecordIds(recordIds);
        this.notifyOutputChanged();
      },
      onSort: (columnName: string, descending: boolean) => {
        dataset.sorting = [{ name: columnName, sortDirection: descending ? 1 : 0 }];
        dataset.refresh();
      }
    });
  }

  private buildStrings(context: Ctx): GridStrings {
    const s = (key: string, fallback: string): string => {
      const value = context.resources.getString(key);
      return value && value !== key ? value : fallback;
    };

    return {
      sortAsc: s("Menu_SortAsc", "Sort A to Z"),
      sortDesc: s("Menu_SortDesc", "Sort Z to A"),
      groupBy: s("Menu_GroupBy", "Group by this column"),
      ungroup: s("Menu_Ungroup", "Remove grouping"),
      showTotal: s("Menu_ShowTotal", "Show total"),
      hideTotal: s("Menu_HideTotal", "Hide total"),

      emptyGroupLabel: context.parameters.emptyGroupLabel?.raw || s("Group_Empty", "(No value)"),
      noRecords: s("State_NoRecords", "No data available"),
      grandTotal: s("Totals_Grand", "Total"),
      recordCount: (n: number) =>
        n === 1 ? s("Count_One", "1 record") : s("Count_Many", "{0} records").replace("{0}", String(n)),
      baseCurrencyNotice: s(
        "Notice_BaseCurrency",
        "This group contains more than one currency, so the total is shown in the base currency."
      ),
      partialTotalsNotice: s(
        "Notice_PartialTotals",
        "Totals cover the records loaded so far, not the full result set."
      ),
      copyTotals: s("Action_CopyTotals", "Copy totals"),
      totalsCopied: s("Notice_TotalsCopied", "Totals copied to the clipboard."),
      copyFailed: s("Notice_CopyFailed", "Could not copy to the clipboard."),
      recordsColumn: s("Tsv_Records", "Records"),
      aggregateLimitTitle: s("Error_AggregateLimitTitle", "Totals unavailable"),
      aggregateLimitMessage: s(
        "Error_AggregateLimitMessage",
        "This result set is too large for the platform to total in one query. Narrow the filter, or switch the control to Auto so it can fall back to loaded rows."
      ),

      duration: {
        hourSingular: s("Duration_HourOne", "hour"),
        hourPlural: s("Duration_HourMany", "hours"),
        minuteSingular: s("Duration_MinuteOne", "minute"),
        minutePlural: s("Duration_MinuteMany", "minutes"),
        partSeparator: s("Duration_PartSeparator", " ")
      }
    };
  }

  public getOutputs(): IOutputs {
    return {};
  }

  public destroy(): void {
    // React unmounting is handled by the platform for virtual controls.
  }
}
