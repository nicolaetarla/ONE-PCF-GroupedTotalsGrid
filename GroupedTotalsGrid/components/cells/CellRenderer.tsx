/**
 * Cell rendering parity.
 *
 * The native grid does not render plain strings - primary and lookup columns
 * are hyperlinks, email/phone/URL columns are actionable, choices can carry
 * their configured colours. A grid of inert text reads as a foreign component
 * even when the row metrics are perfect, so this mirrors that behaviour.
 *
 * Everything that is not a link goes through getFormattedValue(), so the
 * platform's own formatting is used verbatim rather than reimplemented.
 */

import * as React from "react";
import { Tooltip } from "@fluentui/react-components";
import { useGridStyles } from "../../styles/useGridStyles";
import { isTotalableType } from "../../core/types";

export type NavigationTypes = "All" | "PrimaryOnly" | "None";

export interface CellRendererProps {
  columnName: string;
  dataType: string;
  isPrimary: boolean;
  formatted: string;
  raw: unknown;
  navigationTypesAllowed: NavigationTypes;
  enableOptionSetColors: boolean;
  optionColor?: string;
  onOpenRecord?: () => void;
  onOpenLookup?: (entityName: string, id: string) => void;
}

const isLookup = (t: string): boolean => t.startsWith("Lookup.");

function shouldLink(props: CellRendererProps): boolean {
  if (props.navigationTypesAllowed === "None") return false;
  if (props.isPrimary) return true;
  if (props.navigationTypesAllowed === "PrimaryOnly") return false;
  return isLookup(props.dataType);
}

export const CellRenderer: React.FC<CellRendererProps> = (props) => {
  const styles = useGridStyles();
  const { formatted, dataType } = props;

  // Empty cells render blank, matching the modern grid. The classic grid's
  // "---" placeholder is deliberately not reproduced.
  if (!formatted) return null;

  if (shouldLink(props)) {
    const onClick = (e: React.MouseEvent | React.KeyboardEvent): void => {
      e.stopPropagation();
      if (props.isPrimary) {
        props.onOpenRecord?.();
        return;
      }
      const ref = Array.isArray(props.raw) ? props.raw[0] : props.raw;
      const r = ref as { id?: { guid?: string } | string; etn?: string } | undefined;
      const id = typeof r?.id === "string" ? r.id : r?.id?.guid;
      if (r?.etn && id) props.onOpenLookup?.(r.etn, id);
    };

    return (
      <span
        role="link"
        tabIndex={0}
        className={styles.link}
        title={formatted}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onClick(e);
        }}
      >
        {formatted}
      </span>
    );
  }

  if (dataType === "SingleLine.Email" || dataType === "SingleLine.Phone" || dataType === "SingleLine.URL") {
    const href =
      dataType === "SingleLine.Email"
        ? `mailto:${formatted}`
        : dataType === "SingleLine.Phone"
        ? `tel:${formatted}`
        : formatted;
    return (
      <a className={styles.link} href={href} title={formatted} onClick={(e) => e.stopPropagation()}>
        {formatted}
      </a>
    );
  }

  if (props.enableOptionSetColors && props.optionColor && dataType === "OptionSet") {
    // The colour comes from attribute metadata configured by the maker, not
    // from a literal in this codebase - which is why the lint rule allows it.
    return (
      <span style={{ backgroundColor: props.optionColor, borderRadius: "4px", padding: "2px 8px" }}>
        {formatted}
      </span>
    );
  }

  // Long values truncate with a tooltip, as native.
  const content = <span>{formatted}</span>;
  return isTotalableType(dataType) ? content : <Tooltip content={formatted} relationship="label">{content}</Tooltip>;
};
