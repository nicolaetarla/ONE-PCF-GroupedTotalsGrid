/**
 * Loading / empty / error states.
 *
 * Loading uses skeleton rows at the real row height rather than a spinner, so
 * the grid does not visibly jump when data lands - which is what the native
 * grid does. Errors are inline and non-blocking: any rows that did load stay
 * on screen.
 */

import * as React from "react";
import { MessageBar, MessageBarBody, MessageBarTitle, Skeleton, SkeletonItem } from "@fluentui/react-components";
import { useGridStyles } from "../styles/useGridStyles";
import { ROW_HEIGHTS } from "../core/nativeGridMetrics";

export const LoadingRows: React.FC<{ rows?: number; compact?: boolean }> = ({ rows = 8, compact }) => {
  const height = compact ? ROW_HEIGHTS.Compact : ROW_HEIGHTS.Comfortable;
  return (
    <div aria-busy="true" aria-live="polite">
      <Skeleton>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} style={{ height, display: "flex", alignItems: "center", padding: "0 8px" }}>
            <SkeletonItem />
          </div>
        ))}
      </Skeleton>
    </div>
  );
};

export const EmptyState: React.FC<{ message: string }> = ({ message }) => {
  const styles = useGridStyles();
  return (
    <div className={styles.stateContainer} role="status">
      {message}
    </div>
  );
};

export const ErrorBar: React.FC<{ title: string; message: string }> = ({ title, message }) => (
  <MessageBar intent="warning" politeness="polite">
    <MessageBarBody>
      <MessageBarTitle>{title}</MessageBarTitle>
      {message}
    </MessageBarBody>
  </MessageBar>
);
