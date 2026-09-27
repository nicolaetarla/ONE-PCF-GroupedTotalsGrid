/**
 * Dataset paging.
 *
 * The dataset arrives one page at a time. For display we pull pages until we
 * have everything or we hit maxClientRows, whichever comes first - and we
 * report which happened, because a capped set means client-computed totals are
 * partial and the UI has to say so.
 */

import * as React from "react";

type DataSet = ComponentFramework.PropertyTypes.DataSet;

export interface DatasetRowsState {
  recordIds: string[];
  loading: boolean;
  /** True when paging stopped at the cap rather than at the end of the data. */
  capped: boolean;
  totalResultCount: number;
}

const PAGE_SIZE = 500;

export function useDatasetRows(dataset: DataSet, maxClientRows: number): DatasetRowsState {
  const [state, setState] = React.useState<DatasetRowsState>({
    recordIds: [],
    loading: true,
    capped: false,
    totalResultCount: 0
  });

  const cancelled = React.useRef(false);

  React.useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  React.useEffect(() => {
    if (dataset.loading) {
      setState((s) => ({ ...s, loading: true }));
      return;
    }

    const ids = dataset.sortedRecordIds ?? [];
    const total = dataset.paging.totalResultCount ?? ids.length;

    // hasNextPage is the only reliable signal that more data exists;
    // totalResultCount is capped by the platform on large sets.
    const wantMore = dataset.paging.hasNextPage && ids.length < maxClientRows;

    if (wantMore) {
      try {
        if (dataset.paging.pageSize < PAGE_SIZE) dataset.paging.setPageSize(PAGE_SIZE);
        dataset.paging.loadNextPage();
      } catch {
        // A paging failure is not fatal - fall through and render what we have,
        // letting the server aggregate path supply correct totals.
      }
      setState({ recordIds: ids, loading: true, capped: false, totalResultCount: total });
      return;
    }

    setState({
      recordIds: ids.slice(0, maxClientRows),
      loading: false,
      capped: dataset.paging.hasNextPage || ids.length > maxClientRows,
      totalResultCount: total
    });
    // dataset identity changes on every updateView, so we key on the things
    // that actually indicate new data.
  }, [dataset, dataset.loading, dataset.sortedRecordIds, maxClientRows]);

  return state;
}
